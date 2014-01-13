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
  , stylus = require('stylus');


var DEVELOPMENT = (process.env.NODE_ENV === "development" || 
                  _.isUndefined(process.env.NODE_ENV));

function maybeLivereload() {
  return tasks.if(dev, tasks.livereload(server));
}

function reload(file) {
    var stream = es.pause();
    stream.pipe(maybeLivereload());
    stream.write(new File({path: file || ''}));
}

function maybeWatch(pattern, fn) {
  if (DEVELOPMENT) {
    var deferred = Q.defer();
    gulp.watch(pattern, function(ev) {
      if (ev.type !== 'deleted') {
        var stream = fn(gulp.src(ev.path));
        stream.on('end', function() {
          deferred.resolve();
        })
      }
      else {
        var stream = es.pause();
        fn(stream);
        stream.write(new File({
          contents: new Buffer(''),
          path: ev.path
        }));
        stream.end();
        deferred.resolve();
      }
    });
    return deferred.promise;
  } else {
    return fn(gulp.src(pattern));
  }
}

function gulpStylus() {
  return es.map(function(file, cb) {
      var styl = file.contents.toString('utf8');
      stylus.render(styl, {filename: file.path}, function(err, css) {
        if (err) throw err;
        file.contents = new Buffer(css);
        cb(null, file)
      })
    });
}

var styles = {
  files: {},
  write: function() {
    var styleStream = fs.createWriteStream('lib/boot/views/styles.ejs')
    _.each(_.keys(files), function(file) {
      styleStream.write('<link href="'+file + '" rel="stylesheet"/>\n');
    });
    styleStream.end();
  },
  add: function(file) {
    this.files[file] = true;
  },
  remove: function(file) {
    delete this.files[file] = true;
  },
  gulp: function() {
    var self = this;
    return es.mapSync(function(file) {
      if (path.extname(file) !== '.css') return file;

      if (file.contents)
        styles.add(file.path);
      else
        styles.remove(file.path);
      self.write();
      return file;
    });
  }
};

/////////////////////////
// lib: local packages //
/////////////////////////

var browserResolve = require('browser-resolve')
  , moduleDeps = require('module-deps')
  , builtinLibs = require('repl')._builtinLibs;


/**
 * cleint side javascript
 * development: watches and builds
 * production: builds
 */
// TODO: move bower into it's own build
gulp.task('lib-js', ['lib-requires', 'component'], function() {
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

  // livereload
  if (DEVELOPMENT) {
    gulp.watch(['public/build.js'], 
      function(ev) {
        reload(ev.path);
      });
  }
  

  return deferred.promise;
});

/**
 * enable `lib/...` requires shortcut
 */
gulp.task('lib-requires', function() {
  gulp.src('lib')
    .pipe(tasks.symlink('node_modules'));
})

/**
 * lib: stylus
 * development: watches and builds stylus into css
 * production: n/a
 */
//TODO : implement cache
gulp.task('lib-styl', function() {
  return maybeWatch('lib/**/*.styl', function(stream) {
    stream = stream.pipe(gulpStylus());

    if (DEVELOPMENT) {
      stream = stream
        .pipe(tasks.rename(function(dir, base, ext) {
          return  base + '.css';
        }))
        .pipe(es.mapSync(function(file) {
          file.base = process.cwd();
          return file;
        }))
    } else {
      stream = stream.pipe(tasks.concat('build.css'));
    }

    return stream
      .pipe(styles.gulp()) // add to style list
      .pipe(gulp.dest('public'));
  });

  // livereload
  if (DEVELOPMENT) {
    gulp.watch(['public/lib/**/*.css'], 
      function(ev) {
        reload(ev.path);
      });
  }
  
  
});


/**
 * lib: assets
 */
gulp.task('lib-assets', function() {
  gulp.src('lib')
    .pipe(tasks.symlink('public'));

  // livereload
  if (DEVELOPMENT) {
    gulp.watch('lib/**/*.{gif,png,jpg,jpeg,tiff,bmp,ico,ejs}', function(ev) {
      reload(ev.path);
    });
  }
});

gulp.task('lib', function() {
  gulp.run('lib-js');
  gulp.run('lib-styl');
  gulp.run('lib-assets');
});



/**
 * server side javascript
 * development: watches and restarts server
 * production: n/a
 */
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



////////////////////
// bower packages //
////////////////////

/**
 * build bower js
 * development: watch and build
 * production: build and minify
 */
// performed by browserify

/**
 * build bower css
 * development: watch, build and concat css
 * production: build, concat and minify css
 */
// TODO: 
// watch in dev mode
// minifiy in production
gulp.task('bower-css', function() {
  var deferred = Q.defer();
  gulp.src('bower/**/bower.json')
    .pipe(es.through(pluckFilesFromJson('main')))
    .pipe(es.writeArray(function(err, arr) {
      if (arr.length === 0) return deferred.resolve();
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
        .pipe(style.gulp()) // add bower to styles list
        .pipe(gulp.dest('public'))
        .on('end', deferred.resolve);
    }));
    return deferred.promise;
});

/**
 * bower: assets
 */
gulp.task('bower-assets', function() {
  gulp.src('bower')
    .pipe(tasks.symlink('public'));
});

/**
 * bower: js, css and assets
 */
gulp.task('bower', function() {
  gulp.run('bower-css');
  gulp.run('bower-assets');
})


////////////////////////
// component packages //
////////////////////////

/**
 * build component js, css and assets
 * development: watch and build
 * production: build and minfiy
 */
// TODO:
// development: watch
// production: minify
gulp.task('component', function() {
  return maybeWatch('component.json', function(stream) {
    return stream.pipe(tasks.component({name: 'index'}))
    .on('error', function(err) { console.log('error', err); })
    .pipe(styles.gulp())
    .pipe(gulp.dest('public/components/'))
  })
});

///////////
// setup //
///////////

gulp.task('clean', function() {
  return gulp.src('public/*', {read: false})
    .pipe(tasks.clean());
});


gulp.task('default', ['clean'], function() {
  gulp.run('bower');
  gulp.run('lib'); // lib runs component
});

gulp.task('dev', function() {
  DEVELOPMENT = true;
  server.listen(35729, function() {
    gulp.run('default', function() {
      gulp.run('app');
    });
  });

  gulp.watch(['lib/**/package.json'],
    function() { gulp.run('app'); });
  
  gulp.run('watchDeps');
  
  
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