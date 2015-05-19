import pgFormat from 'pg-format';

const TIMEOUT = 1000;
const REGEX = /^([0-9]*)#([0-9]*)\/([0-9]*)#(.*)/;

class MQDBProxy {
  constructor({ redisSub, redisPub, pg }, actions = {}) {
    Object.assign(this, { redisSub, redisPub, pg, actions });
    this.multipartPayloads = {};
  }

  start() {
    return Promise.try(() => {
      this.redisSub.subscribe('action');
      this.redisSub.on('message', (channel, message) => this._handleRedisMessage(message));
    })
    .then(() => this.pg.connectAsync())
    .then(() => this.pg.on('notification', (message) => this._handlePgNotify(message)))
    .then(() => this.pg.queryAsync('LISTEN watchers'));
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
      this.pg.queryAsync(queryFormat);
    })
    .catch((err) => {
      if(__DEV__) {
        throw err;
      }
      else {
        console.error(err);
      }
    });
  }

  _handlePgNotify({ payload }) {
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
      clearTimeout(multipartPayload.timeout);
      const multipartPayload = this.multipartPayloads[id];
      multipartPayload.timeout = setTimeout(() => delete this.multipartPayloads[id], TIMEOUT);
      multipartPayload.recieved = multipartPayload.recieved + 1;
      multipartPayload.parts[part - 1] = data;
      if(multipartPayload.recieved === multipartPayload.total) {
        this.redisPub.publish('update', multipartPayload.parts.join(''));
        clearTimeout(multipartPayload.timeout);
        delete this.multipartPayloads[id];
      }
    } else {
      this.redisPub.publish('update', payload);
    }
  }
}

Object.assign(MQDBProxy.prototype, {
  redisSub: null,
  redisPub: null,
  pg: null,
  actions: null,
});

export default MQDBProxy;
