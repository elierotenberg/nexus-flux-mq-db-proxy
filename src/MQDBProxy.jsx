import pgFormat from 'pg-format';
import Lifespan from 'lifespan';
import http from 'http';
import _ from 'lodash';
import Promise from 'bluebird';
const __DEV__ = process.env.NODE_ENV === 'development';

const TIMEOUT = 1000;
const REGEX = /^([0-9]*)#([0-9]*)\/([0-9]*)#(.*)/;

class MQDBProxy {

  redisSub = null;
  redisPub = null;
  pg = null;
  actions = null;
  actionChannel = null;
  updateChannel = null;
  urlCache = null;
  lifespan = null;

  constructor({ redisSub, redisPub, pg, channel, urlCache }, actions = {}) {
    Object.assign(this, { redisSub, redisPub, pg, urlCache, actions });
    this.multipartPayloads = {};
    this.actionChannel = `action_${channel}`;
    this.updateChannel = `update_${channel}`;
    this.lifespan = new Lifespan();

    this.lifespan.onRelease(() => {
      this.multipartPayloads = null;
      this.actions = null;
      this.redisSub.end();
      this.redisPub.end();
      this.pgNotifyClient.end();
      this.pg.destroyAllNow();
    });
  }

  start() {
    return Promise.try(() => {
      this.redisSub.subscribe(this.actionChannel);
      this.redisSub.on('message', (channel, message) => {
        if(channel === this.actionChannel) {
          this._handleRedisMessage(message);
        }
      });
    })
    .then(() => this._pgNotify());
  }

  mockRedisMessage(message) {
    return this._handleRedisMessage(message);
  }

  mockPgNotify(message) {
    return this._handlePgNotify(message);
  }

  _handleRedisMessage(message) {
    return Promise.try(() => {
      const { action, query } = JSON.parse(message);
      if(this.actions[action] === void 0) {
        throw new Error(`Unknown action: ${action}`);
      }
      // validate the query and maybe get the procedure to invoke and its params
      // async by default
      return this.actions[action].call(null, query);
    })
    // invoke the procedure
    .then(([procedure, params]) => {
      const buildParams = [null];
      buildParams.push(procedure);
      const buildEntries = Object.keys(params).map((fieldName) => {
        buildParams.push(params[fieldName]);
        return `%L`;
      }).join(',');
      const queryFormat = pgFormat.withArray(`SELECT actions_%s(${buildEntries})`, buildParams);
      return this._pgQuery(queryFormat);
    })
    .catch((err) => {
      if(__DEV__) {
        throw err;
      }
    });
  }

  _handlePgNotify({ payload }) {
    const message = JSON.parse(payload);
    if(this.urlCache !== void 0 && this.urlCache !== null && message !== void 0 && message !== null) {
      const options = {
        hostname: this.urlCache,
        method: 'PURGE',
        path: message.n,
      };
      const req = http.request(options);
      req.end();
    }
    const result = REGEX.exec(payload);
    if(result) {
      const [id, part, total, data] = result.slice(1);
      if(this.multipartPayloads[id] === void 0) {
        this.multipartPayloads[id] = {
          total: +total,
          recieved: 0,
          parts: [],
          timeout: null,
        };
      }
      const multipartPayload = this.multipartPayloads[id];
      clearTimeout(multipartPayload.timeout);
      multipartPayload.timeout = setTimeout(() => delete this.multipartPayloads[id], TIMEOUT);
      multipartPayload.recieved = multipartPayload.recieved + 1;
      multipartPayload.parts[part - 1] = data;
      if(multipartPayload.recieved === multipartPayload.total) {
        this.redisPub.publish(this.updateChannel, multipartPayload.parts.join(''));
        clearTimeout(multipartPayload.timeout);
        delete this.multipartPayloads[id];
      }
    }
    else {
      this.redisPub.publish(this.updateChannel, payload);
    }
  }

  _pgQuery(...args) {
    return new Promise((resolve, reject) =>
      this.pg.connect((err, client, done) =>
        err ? reject(err) : client.query(...args, (err, res) => {
          done();
          if(err) {
            return reject(err);
          }
          resolve(res);
        })
      )
    );
  }

  _pgNotify() {
    return new Promise((resolve, reject) =>
      this.pg.connect((err, client, done) => {
        if(err) {
          return reject(err);
        }
        this.pgNotifyClient = client;
        client.on('notification', (message) => {
          this._handlePgNotify(message)
        })
        client.query('LISTEN watchers');
        resolve();
      })
    );
  }
}

export default MQDBProxy;
