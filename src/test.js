import MQDBProxy from '../';
import Redis from 'redis';
import Pg from 'pg';
Promise.promisifyAll(Pg.Client.prototype);

const pg = new Pg.Client('postgres://test:test@localhost/test');
const __VERSION__ = 'v0_0_1';
const redisSub = Redis.createClient(6379, 'localhost');
const redisPub = Redis.createClient(6379, 'localhost');

const proxy = new MQDBProxy({ redisSub, redisPub, pg }, {
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

proxy.start().then(() => {
  console.log('MQDBProxy ready.');
  proxy.mockRedisMessage(JSON.stringify({
    action: 'doFooBar',
    query: {
      foo: 42,
      bar: 'fortytwo',
    },
  }));
  proxy.mockRedisMessage(JSON.stringify({
    action: 'doBarFoo',
    query: {
      foo: 1337,
      bar: 1337,
    },
  }));
});
