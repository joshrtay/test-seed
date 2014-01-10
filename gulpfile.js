var gulp = require('gulp')
  , tasks = require('gulp-load-tasks')()
  , autoprefixer = require('autoprefixer')
  , es = require('event-stream')
  , rework = require('rework')
  , server = require('tiny-lr')()
  , File = require('vinyl')
  , child_process = require('child_process')
  , watchify = require('watchify')
  , browserify = require('browserify')
  , fs = require('fs')
  , Q = require('q')
  , gaze = require('gaze')
  , path = require('path')
  , _ = require('underscore')
  , dev;


function maybeLivereload() {
  return tasks.if(dev, tasks.livereload(server));
}

function reload(file) {
    var stream = es.pause();
    stream.pipe(maybeLivereload());
    stream.write(new File({path: file || ''}));
}

function maybeWatch(pattern, fn) {
  dev && gulp.watch(pattern, function(ev) {
    if (ev.type !== 'deleted')
      fn(gulp.src(ev.path));
    else {
      var stream = es.pause();
      fn(stream);
      stream.write(new File({
        contents: new Buffer(''),
        path: ev.path
      }));
      stream.end();
    }
  });
  fn(gulp.src(pattern));
}

var browserResolve = require('browser-resolve')
  , moduleDeps = require('module-deps')
  , builtinLibs = require('repl')._builtinLibs;

gulp.task('browserify', ['clean', 'link', 'component'], function() {
  var deferred = Q.defer()
    , js = (dev ? watchify : browserify)()
    , b = js.transform(require('./grunt/browserify-transforms/dereqify.js'))
    .transform(require('./grunt/browserify-transforms/deerrorify.js').transform)
    .transform('dehtmlify')
    .transform('decomponentify')
    .transform('debowerify')
    .on('postbundle', require('./grunt/browserify-transforms/deerrorify.js').postBundleCb)
    .add('./lib/boot/main.js')
    .on('update', bundle);

  function bundle() {
    var wb = b.bundle();
    wb.pipe(fs.createWriteStream('public/.build.js'));
    wb.pipe(es.through(function() {}, function() {
      fs.renameSync('public/.build.js', 'public/build.js');
      deferred.resolve();
    }));
  }
  bundle();
  return deferred.promise;
});

gulp.task('watchDeps', function() {
  gaze([], function() {
    var self = this
      , boot = __dirname + '/app.js';
    
    function getDeps() {
      moduleDeps(boot, {
        resolve: function(id, parent, cb) {
          if (id[0] !== '.' && id[0] !== '/') {
            if(id.indexOf('bower') === -1) {
              var file = require.resolve(id);
              if((file.indexOf('node_modules/lib/') !== -1 
                  || file.indexOf(process.cwd() + '/lib') !== -1)
                && builtinLibs.indexOf(file) === -1
                && file.indexOf(process.cwd()) === 0) {
                browserResolve(id, parent, cb);
              }
              else
                cb(null, boot);
            } else
              cb(null, boot);
          } else {
            browserResolve(id, parent, cb);
          }
        },
        packageFilter: function(pkg) {
          delete pkg.browser;
          return pkg;
        }
      }).pipe(es.through(function(file) {
        self.add(file.id);
      }));
    }

    this.on('all', function() {
      getDeps();
      gulp.run('app');
    });
    getDeps();
  });
});

function urlRewriter(file) {
  return rework.url(function(url) {
    var abs = path.resolve(path.dirname(file.path), url);
    return abs.slice(process.cwd().length);
  });
}

gulp.task('styl', function() {
  return gulp.src('lib/**/*.styl')
    .pipe(es.mapSync(function(file) {
      var css = file.contents.toString('utf8');
      file.contents = new Buffer(rework(css)
        .use(rework.mixin(require('rework-mixins')))
        .use(rework.ease())
        .use(rework.colors())
        .use(rework.references())
        .use(rework.at2x())
        .use(rework.extend())
        .use(urlRewriter(file))
        .toString({sourcemap: true}));
      return file;
    }))
    .pipe(tasks.autoprefixer('last 2 versions'))
    .pipe(tasks.concat('build.css'))
    .pipe(gulp.dest('public'))
});

gulp.task('bower-styl', function() {
  var deferred = Q.defer();
  gulp.src('bower/**/bower.json')
    .pipe(es.through(pluckFilesFromJson('main')))
    .pipe(es.writeArray(function(err, arr) {
      if (arr.length = 0) return deferred.resolve();
      gulp.src(arr)
        .pipe(tasks['grep-stream']('/**/*.css'))
        .pipe(es.mapSync(function(file) {
          var css = file.contents.toString('utf8')
            , res = rework(css)
            .use(urlRewriter(file))
            .toString({sourcemap: true});
          
          file.contents = new Buffer(res);
          return file;
        }))
        .on('error', logError)
        .pipe(tasks.concat('bower.css'))
        .pipe(gulp.dest('public'))
        .on('end', deferred.resolve);
    }));
    return deferred.promise;
})

gulp.task('component', function() {
  return gulp.src('component.json')
    .pipe(tasks.component({name: 'index'}))
    .on('error', function(err) { console.log('error', err); })
    .pipe(gulp.dest('public/components/'))
});

gulp.task('clean', function() {
  return gulp.src('public/*', {read: false})
    .pipe(tasks.clean());
});

gulp.task('link', function() {
  gulp.src('lib')
    .pipe(tasks.symlink('node_modules'));
  gulp.src('bower')
    .pipe(tasks.symlink('public'));
  gulp.src('lib')
    .pipe(tasks.symlink('public'));
});


gulp.task('default', ['link', 'clean', 'component', 
  'styl',
  'bower-styl',
  'browserify']);

gulp.task('dev', function() {
  dev = true;
  server.listen(35729, function() {
    gulp.run('default', function() {
      gulp.run('app');
    });
  });

  gulp.watch(['components/**/*', 'components/*'], function() {
    gulp.run('component');
  });
  
  gulp.watch(['lib/**/package.json'],
    function() { gulp.run('app'); });
  
  gulp.run('watchDeps');
  
  gulp.watch([
    'lib/**/*.(gif|png|jpg|jpeg|tiff|bmp|ico)',
    'public/build.js',
    'public/build.css'], 
    function(ev) {
      reload(ev.path);
    });
});

var app;
gulp.task('app', function() {
  if(app) {
    app.kill();
    setTimeout(function() {
      reload('server');
    }, 500);
  }

  app = child_process.spawn('node', ['app.js'], {
    detached: false,
    stdio: 'inherit'
  });
});

function pluckFilesFromJson(prop) {
  return function(file) {
    var self = this
      , json = JSON.parse(file.contents.toString('utf8'));

    if(_.isArray(json[prop])) {
      json[prop].forEach(function(p) {
        self.emit('data', path.resolve(path.dirname(file.path), p));
      });
    }
  };
}

function getContents(file) {
  file.contents = fs.readFileSync(file.path);
  this.emit('data', file);
}

function logError(err) {
  console.log('error', err);
}