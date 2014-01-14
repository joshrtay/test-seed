/**
 * Module dependencies.
 */

var express = require('express')
  , app = module.exports = express()
  , path = require('path')
  , fs = require('fs')
  , ejs = require('ejs');

app.configure(function() {
  app.set('view engine', 'ejs');
});

app.use(require('lib/error'));

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function() {
  app.use(express.errorHandler());
});

app.get('*', function(req, res) {
  res.render('index', {
    title: 'Mang app',
    config: require('lib/config')
  });
});

fs.readdirSync('lib').forEach(function(file) {
  var module = path.join('lib', file);
  if(module !== 'lib/boot' && fs.statSync(module).isDirectory()) {
    var json = require(path.join(module, 'package.json'))
    if(json.main) require(module);
  }
});
app.use(require('lib/main'));
