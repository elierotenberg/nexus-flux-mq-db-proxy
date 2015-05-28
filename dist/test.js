'use strict';

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

var _2 = require('../');

var _3 = _interopRequireDefault(_2);

var _redis = require('redis');

var _redis2 = _interopRequireDefault(_redis);

var _pg = require('pg');

var _pg2 = _interopRequireDefault(_pg);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _ = require('lodash');
var should = require('should');
var Promise = (global || window).Promise = require('bluebird');
var __DEV__ = process.env.NODE_ENV !== 'production';
var __PROD__ = !__DEV__;
var __BROWSER__ = typeof window === 'object';
var __NODE__ = !__BROWSER__;
if (__DEV__) {
  Promise.longStackTraces();
  Error.stackTraceLimit = Infinity;
}

Promise.promisifyAll(_pg2['default'].Client.prototype);

var pg = new _pg2['default'].Client('postgres://test:test@localhost/test');
var __VERSION__ = 'v0_0_1';
var redisSub = _redis2['default'].createClient(6379, 'localhost');
var redisPub = _redis2['default'].createClient(6379, 'localhost');
var urlCache = 'http://www.test.com';

var proxy = new _3['default']({ redisSub: redisSub, redisPub: redisPub, pg: pg, urlCache: urlCache }, {
  doFooBar: function doFooBar(_ref) {
    var foo = _ref.foo;
    var bar = _ref.bar;

    return Promise['try'](function () {
      // some preconditions which can be async
      foo.should.be.a.Number;
      bar.should.be.a.String;
      return ['doFooBar' + __VERSION__, [foo, bar]];
    });
  },

  doBarFoo: function doBarFoo(_ref2) {
    var bar = _ref2.bar;
    var foo = _ref2.foo;

    return Promise['try'](function () {
      foo.should.be.exactly(bar);
      return ['doBarFoo' + __VERSION__, [bar, foo]];
    });
  } });

var app = (0, _express2['default'])().purge('*', function (req) {
  console.log('purge store ' + req.url);
});
_http2['default'].createServer(app);

proxy.start().then(function () {
  console.log('MQDBProxy ready.');
  proxy.mockRedisMessage(JSON.stringify({
    action: 'doFooBar',
    query: {
      foo: 42,
      bar: 'fortytwo' } }));
  proxy.mockPgNotify({
    payload: '{"message": {"n": "/name/store","p": "patch: remutable"}}' });
});