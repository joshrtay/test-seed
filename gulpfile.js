var gulp = require('gulp')
  , tasks = require('gulp-load-tasks')()
  , autoprefixer = require('autoprefixer')
  , rework = tasks.rework;

gulp.task('browserify', function() {
  return gulp.src('./lib/boot/main.js', {read: false})
    .pipe(tasks.browserify({
      transform: [
        require('./grunt/browserify-transforms/dereqify.js'),
        require('./grunt/browserify-transforms/deerrorify.js').transform,
        require('./grunt/browserify-transforms/dehtmlify.js'),
        'decomponentify',
        'debowerify'
      ]}).on('postbundle', require('./grunt/browserify-transforms/deerrorify.js').postBundleCb)
    )
    .pipe(tasks.rename('build.js'))
    .pipe(gulp.dest('public'));
});

gulp.task('styl', function() {
  gulp.src('lib/**/*.styl')
    .pipe(rework(
      rework.mixin(require('rework-mixins')),
      rework.ease(),
      rework.colors(),
      rework.references(),
      rework.at2x(),
      rework.extend(), 
      {sourcemap: true}))
    .pipe(tasks.autoprefixer('last 2 versions'))
    .pipe(tasks.concat('build.css'))
    .pipe(gulp.dest('public'))
});

gulp.task('component', function() {
  return gulp.src('component.json')
    .pipe(tasks.component({name: 'index'}))
    .pipe(gulp.dest('public/components/'))
});

gulp.task('clean', function() {
  return gulp.src('public/*', {read: false})
    .pipe(tasks.clean());
});

gulp.task('link', function() {
  return gulp.src('lib')
    .pipe(tasks.symlink('node_modules/lib'));
});

gulp.task('jasmine', function() {

});

gulp.task('default', ['link', 'clean', //'genCssImports', 
  'component', 'styl', 'browserify']);

gulp.on('error', function() {
  console.log('error');
})