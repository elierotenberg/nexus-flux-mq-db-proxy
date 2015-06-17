const { describe, it } = global;
import MQDBProxy from '../';
import Redis from 'redis';
import Pg from 'pg';
import express from 'express';
import http from 'http';
import Promise from 'bluebird';

Promise.promisifyAll(Pg.Client.prototype);

describe('NO TESTS IMPLEMENTED', () => process.exit(0));

const pg = new Pg.Client('postgres://test:test@localhost/test');
const __VERSION__ = 'v0_0_1';
const redisSub = Redis.createClient(6379, 'localhost');
const redisPub = Redis.createClient(6379, 'localhost');
const urlCache = 'http://www.test.com';
const channel = 'test';

const proxy = new MQDBProxy({ redisSub, redisPub, pg, channel, urlCache }, {
  doFooBar({ foo, bar }) {
    return Promise.try(() => {
      // some preconditions which can be async
      foo.should.be.a.Number;
      bar.should.be.a.String;
      return [`doFooBar${__VERSION__}`, [foo, bar]];
    });
  },

  doBarFoo({ bar, foo }) {
    return Promise.try(() => {
      foo.should.be.exactly(bar);
      return [`doBarFoo${__VERSION__}`, [bar, foo]];
    });
  },
});

const app = express()
  .purge('*', (req) => void 0)
http.createServer(app);

proxy.start().then(() => {
  proxy.mockRedisMessage(JSON.stringify({
    action: 'doFooBar',
    query: {
      foo: 42,
      bar: 'fortytwo',
    },
  }));
  proxy.mockPgNotify({
    payload: '{"message": {"n": "/name/store","p": "patch: remutable"}}',
  });
});
