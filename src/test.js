import MQDBProxy from '../';
import Redis from 'redis';
import Pg from 'pg';
import express from 'express';
import http from 'http';

Promise.promisifyAll(Pg.Client.prototype);

const pg = new Pg.Client('test:test@localhost/test');
const __VERSION__ = 'v0_0_1';
const redisSub = Redis.createClient(6379, 'localhost');
const redisPub = Redis.createClient(6379, 'localhost');
const uriCache = '127.0.0.1:1337';

const proxy = new MQDBProxy({ redisSub, redisPub, pg, uriCache }, {
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
  .purge('*', (req, res) => {
    console.log('purge store ' + req.url);
  });
http.createServer(app).listen(1337);

proxy.start().then(() => {
  console.log('MQDBProxy ready.');
  proxy.mockRedisMessage(JSON.stringify({
    action: 'doFooBar',
    query: {
      foo: 42,
      bar: 'fortytwo',
    },
  }));
  proxy.mockPgNotify({
    payload: {
      message: {
        n: '/name/store',
        p: 'patch remutable',
      },
    },
  });
});
