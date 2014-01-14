module.exports = {
  shared: true,
  dev: false,
  prod: false,
  development: {
    dev: true,
    scripts: ['http://localhost:35729/livereload.js']
  },
  production: {
    prod: true
  },
  scripts: ['/build.js'],
  styles: []
};