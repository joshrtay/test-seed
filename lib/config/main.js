var _ = require('lodash')
  , config = require('./config.js')
  , modes = ['development', 'production'];

function getEnv() {
  if(typeof window === 'undefined')
    return process.env.NODE_ENV || 'development';
  return SETTINGS.env;
}

_.merge(config, config[getEnv()], function(a, b) {
  return _.isArray(a) ? a.concat(b) : undefined;
});
_.each(modes, function(mode) {
  delete config[mode];
});

module.exports = config;