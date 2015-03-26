"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _slicedToArray = function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { var _arr = []; for (var _iterator = arr[Symbol.iterator](), _step; !(_step = _iterator.next()).done;) { _arr.push(_step.value); if (i && _arr.length === i) break; } return _arr; } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

require("babel/polyfill");
var _ = require("lodash");
var should = require("should");
var Promise = (global || window).Promise = require("bluebird");
var __DEV__ = process.env.NODE_ENV !== "production";
var __PROD__ = !__DEV__;
var __BROWSER__ = typeof window === "object";
var __NODE__ = !__BROWSER__;
if (__DEV__) {
  Promise.longStackTraces();
  Error.stackTraceLimit = Infinity;
}

var pgFormat = _interopRequire(require("pg-format"));

var MQDBProxy = (function () {
  function MQDBProxy(_ref) {
    var redisSub = _ref.redisSub;
    var redisPub = _ref.redisPub;
    var pg = _ref.pg;
    var actions = arguments[1] === undefined ? {} : arguments[1];

    _classCallCheck(this, MQDBProxy);

    Object.assign(this, { redisSub: redisSub, redisPub: redisPub, pg: pg, actions: actions });
  }

  _createClass(MQDBProxy, {
    start: {
      value: function start() {
        var _this = this;

        return Promise["try"](function () {
          _this.redisSub.subscribe("action");
          _this.redisSub.on("message", function (channel, message) {
            return _this._handleRedisMessage(message);
          });
        }).then(function () {
          return _this.pg.connectAsync();
        }).then(function () {
          return _this.pg.on("notification", function (message) {
            return _this._handlePgNotify(message);
          });
        }).then(function () {
          return _this.pg.queryAsync("LISTEN watchers");
        });
      }
    },
    mockRedisMessage: {
      value: function mockRedisMessage(message) {
        return this._handleRedisMessage(message);
      }
    },
    mockPgNotify: {
      value: function mockPgNotify(message) {
        return this._handlePgNotify(message);
      }
    },
    _handleRedisMessage: {
      value: function _handleRedisMessage(message) {
        var _this = this;

        return Promise["try"](function () {
          var _JSON$parse = JSON.parse(message);

          var action = _JSON$parse.action;
          var query = _JSON$parse.query;

          if (_this.actions[action] === void 0) {
            throw new Error("Unknown action: " + action);
          }
          // validate the query and maybe get the procedure to invoke and its params
          // async by default
          return _this.actions[action].call(null, query);
        })
        // invoke the procedure
        .then(function (_ref) {
          var _ref2 = _slicedToArray(_ref, 2);

          var procedure = _ref2[0];
          var params = _ref2[1];

          var buildParams = [null];
          buildParams.push(procedure);
          var buildEntries = Object.keys(params).map(function (fieldName) {
            buildParams.push(params[fieldName]);
            return "%L";
          }).join(",");
          var queryFormat = pgFormat.withArray("SELECT actions_%s(" + buildEntries + ")", buildParams);
          _this.pg.queryAsync(queryFormat);
        })["catch"](function (err) {
          if (__DEV__) {
            throw err;
          } else {
            console.error(err);
          }
        });
      }
    },
    _handlePgNotify: {
      value: function _handlePgNotify(_ref) {
        var payload = _ref.payload;

        this.redisPub.publish("update", payload);
      }
    }
  });

  return MQDBProxy;
})();

Object.assign(MQDBProxy.prototype, {
  redisSub: null,
  redisPub: null,
  pg: null,
  actions: null });

module.exports = MQDBProxy;