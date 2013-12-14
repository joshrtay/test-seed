var fs = require('fs')
  , path = require('path');

module.exports = function(grunt) {
  grunt.registerTask('node-assets', function(dest) {
    grunt.file.expand('**/node_modules/**/package.json').forEach(function(packageJson) {
      var pkg = grunt.file.readJSON(packageJson);
      if(pkg.assets) {
        var cwd = path.resolve(path.dirname(packageJson));
        grunt.file.expand({cwd: cwd}, pkg.assets).forEach(function(asset) {
          asset = path.resolve(cwd, asset);
          var module = cwd.split('/').pop()
            , target = path.join(dest, module, asset.slice(cwd.length));

          grunt.file.copy(asset, target);
        });
      }
    });
  });
};