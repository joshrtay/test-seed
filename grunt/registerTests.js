module.exports = function(grunt) {
  var fs = require('fs')
    , _ = require('underscore')
    , path = require('path');

  grunt.registerTask('registerTests', function(dir) {
    fs.readdirSync(dir).filter(function(file) {
      return fs.statSync(path.join(dir, file)).isDirectory();
    }).forEach(function(module) {
      var moduleDir = path.join(dir, module)
        , specDir = path.join(moduleDir, 'spec');

      grunt.config.set('jasmine.' + module, {
        configFile: './jasmine.js',
        src: path.join(specDir, 'build.js')
      });

      grunt.config.set('watchify.' + module + '-test', {
        src: path.join(specDir, 'spec.js'),
        dest: path.join(specDir, 'build.js')
      });

      grunt.config.set('watch.' + module + '-test', {
        files: [path.join(specDir, 'build.js')],
        tasks: ['genSpec:' + module, 'jasmine:' + module]
      });
    });
  });

  grunt.registerTask('genSpec', function(module) {
    var specDir = path.join('lib', module, 'spec');

    var requires = grunt.file.expand(path.join(specDir, '*Spec.js'))
    .map(function(spec) {
      return 'require(\"./' + path.basename(spec) + '\");';
    });

    requires.unshift('require("source-map-support").install();');
    fs.writeFileSync(path.join(specDir, 'spec.js'), requires.join('\r\n'));
  });

  grunt.registerTask('unit', function(module) {
    grunt.task.run(['genSpec:' + module, 'watchify:' + module + '-test',
      'jasmine:' + module, 'watch:' + module + '-test']);
  });
};