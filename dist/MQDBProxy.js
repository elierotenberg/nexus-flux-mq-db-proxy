'use strict';

var _createClass = require('babel-runtime/helpers/create-class')['default'];

var _classCallCheck = require('babel-runtime/helpers/class-call-check')['default'];

var _slicedToArray = require('babel-runtime/helpers/sliced-to-array')['default'];

var _Object$defineProperty = require('babel-runtime/core-js/object/define-property')['default'];

var _Object$assign = require('babel-runtime/core-js/object/assign')['default'];

var _Object$keys = require('babel-runtime/core-js/object/keys')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

_Object$defineProperty(exports, '__esModule', {
  value: true
});

var _pgFormat = require('pg-format');

var _pgFormat2 = _interopRequireDefault(_pgFormat);

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

var TIMEOUT = 1000;
var REGEX = /^([0-9]*)#([0-9]*)\/([0-9]*)#(.*)/;

var MQDBProxy = (function () {
  function MQDBProxy(_ref) {
    var redisSub = _ref.redisSub;
    var redisPub = _ref.redisPub;
    var pg = _ref.pg;
    var channel = _ref.channel;
    var urlCache = _ref.urlCache;
    var actions = arguments[1] === undefined ? {} : arguments[1];

    _classCallCheck(this, MQDBProxy);

    _Object$assign(this, { redisSub: redisSub, redisPub: redisPub, pg: pg, channel: channel, urlCache: urlCache, actions: actions });
    this.multipartPayloads = {};
    this.actionChannel = 'action_' + channel;
    this.updateChannel = 'update_' + channel;
  }

  _createClass(MQDBProxy, [{
    key: 'start',
    value: function start() {
      var _this = this;

      return Promise['try'](function () {
        _this.redisSub.subscribe(_this.actionChannel);
        _this.redisSub.on('message', function (channel, message) {
          if (channel === _this.actionChannel) {
            _this._handleRedisMessage(message);
          }
        });
      }).then(function () {
        return _this.pg.connectAsync();
      }).then(function () {
        return _this.pg.on('notification', function (message) {
          return _this._handlePgNotify(message);
        });
      }).then(function () {
        return _this.pg.queryAsync('LISTEN watchers');
      });
    }
  }, {
    key: 'mockRedisMessage',
    value: function mockRedisMessage(message) {
      return this._handleRedisMessage(message);
    }
  }, {
    key: 'mockPgNotify',
    value: function mockPgNotify(message) {
      return this._handlePgNotify(message);
    }
  }, {
    key: '_handleRedisMessage',
    value: function _handleRedisMessage(message) {
      var _this2 = this;

      return Promise['try'](function () {
        var _JSON$parse = JSON.parse(message);

        var action = _JSON$parse.action;
        var query = _JSON$parse.query;

        if (_this2.actions[action] === void 0) {
          throw new Error('Unknown action: ' + action);
        }
        // validate the query and maybe get the procedure to invoke and its params
        // async by default
        return _this2.actions[action].call(null, query);
      })
      // invoke the procedure
      .then(function (_ref2) {
        var _ref22 = _slicedToArray(_ref2, 2);

        var procedure = _ref22[0];
        var params = _ref22[1];

        var buildParams = [null];
        buildParams.push(procedure);
        var buildEntries = _Object$keys(params).map(function (fieldName) {
          buildParams.push(params[fieldName]);
          return '%L';
        }).join(',');
        var queryFormat = _pgFormat2['default'].withArray('SELECT actions_%s(' + buildEntries + ')', buildParams);
        _this2.pg.queryAsync(queryFormat);
      })['catch'](function (err) {
        if (__DEV__) {
          throw err;
        }
      });
    }
  }, {
    key: '_handlePgNotify',
    value: function _handlePgNotify(_ref3) {
      var _this3 = this;

      var payload = _ref3.payload;

      var message = JSON.parse(payload);
      if (this.urlCache !== void 0 && this.urlCache !== null && message !== void 0 && message !== null) {
        var options = {
          hostname: this.urlCache,
          method: 'PURGE',
          path: message.n };
        var req = _http2['default'].request(options);
        req.end();
      }
      var result = REGEX.exec(payload);
      if (result) {
        (function () {
          var _result$slice = result.slice(1);

          var _result$slice2 = _slicedToArray(_result$slice, 4);

          var id = _result$slice2[0];
          var part = _result$slice2[1];
          var total = _result$slice2[2];
          var data = _result$slice2[3];

          if (_this3.multipartPayloads[id] === void 0) {
            _this3.multipartPayloads[id] = {
              total: +total,
              recieved: 0,
              parts: [],
              timeout: null };
          }
          var multipartPayload = _this3.multipartPayloads[id];
          clearTimeout(multipartPayload.timeout);
          multipartPayload.timeout = setTimeout(function () {
            return delete _this3.multipartPayloads[id];
          }, TIMEOUT);
          multipartPayload.recieved = multipartPayload.recieved + 1;
          multipartPayload.parts[part - 1] = data;
          if (multipartPayload.recieved === multipartPayload.total) {
            _this3.redisPub.publish(_this3.updateChannel, multipartPayload.parts.join(''));
            clearTimeout(multipartPayload.timeout);
            delete _this3.multipartPayloads[id];
          }
        })();
      } else {
        this.redisPub.publish(this.updateChannel, payload);
      }
    }
  }]);

  return MQDBProxy;
})();

_Object$assign(MQDBProxy.prototype, {
  redisSub: null,
  redisPub: null,
  pg: null,
  actions: null,
  channel: null,
  urlCache: null });

exports['default'] = MQDBProxy;
module.exports = exports['default'];