var through = require('through');

module.exports = function(opts) {
  var cache = {}
    , primed = false;

  return function() {
    return through(function(file) {
      delete cache[file.path];

      if(primed) {
        for(var k in cache)
          this.emit('data', cache[k]);
      }
      cache[file.path] = file;
      this.emit('data', file);
    }, function() {
      primed = true;
      this.emit('end');
    });
  };
};