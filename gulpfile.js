var gulp = require('gulp'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename'),
    browserify = require('gulp-browserify'),
    concat = require('gulp-concat'),
    Mocha = require('mocha'),
    shell = require('shelljs'),
    del = require('del'),
    jshint = require('gulp-jshint'),
    stylish = require('jshint-stylish'),
    semver = require('semver'),
    jsonfile = require('jsonfile'),
    inquirer = require("inquirer"),
    fs = require('fs');

function clean(cb) {
    del('lib/**/*.*', cb);
}

function browserifyTask() {
    return gulp.src('./src/PathFinding.js')
    .pipe(browserify({ standalone: 'PF' }))
    .pipe(rename('pathfinding-browserified.js'))
    .pipe(gulp.dest('./lib/'));
}

function uglifyTask() {
    return gulp.src('./lib/pathfinding-browserified.js')
    .pipe(uglify())
    .pipe(rename('pathfinding-browser.min.js'))
    .pipe(gulp.dest('./lib/'));
}

function concatScripts() {
    return gulp.src(['./src/banner', './lib/pathfinding-browserified.js'])
    .pipe(concat('pathfinding-browser.js'))
    .pipe(gulp.dest('./lib/'));
}

function removeBrowserified(cb) {
    del('./lib/pathfinding-browserified.js', cb);
}

function collectTestFiles(dir, files) {
    files = files || [];
    fs.readdirSync(dir).forEach(function(name) {
        var file = dir + '/' + name,
            stat = fs.statSync(file);

        if (stat.isDirectory()) {
            collectTestFiles(file, files);
        } else if (/\.js$/.test(name)) {
            files.push(file);
        }
    });
    return files;
}

function test(cb) {
    var mocha = new Mocha({
        reporter: 'spec',
        bail: true
    });

    require('should');
    collectTestFiles('./test').forEach(function(file) {
        mocha.addFile(file);
    });
    mocha.run(function(failures) {
        cb(failures ? new Error(failures + ' tests failed') : null);
    });
}

function bench(cb) {
    shell.exec('node benchmark/benchmark.js');
    cb();
}

function lint() {
  return gulp.src('./src/**/*.js')
    .pipe(jshint())
    .pipe(jshint.reporter(stylish))
    .pipe(jshint.reporter('fail'));
}

function release(cb) {
  inquirer.prompt({
      type: 'list',
      name: 'bumpType',
      message: 'Which version do you want to bump?',
      choices: ['patch', 'minor', 'major'],
      //default is patch
      default: 0
    }, function (result) {
      var f = jsonfile.readFileSync('./package.json');
      f.version = semver.inc(f.version, result.bumpType);
      jsonfile.writeFileSync('./package.json', f);

      shell.exec('git add .');
      shell.exec('git commit -m "Bumping version to ' + f.version + '"');
      shell.exec('git push origin master');
      shell.exec('git tag -a ' + f.version + ' -m "Creating tag for version ' + f.version + '"');
      shell.exec('git push origin ' + f.version);
      shell.exec('npm publish');

      shell.exec('git clone https://github.com/imor/pathfinding-bower.git release');
      process.chdir('release');
      fs.writeFileSync('pathfinding-browser.js', fs.readFileSync('../lib/pathfinding-browser.js'));
      fs.writeFileSync('pathfinding-browser.min.js', fs.readFileSync('../lib/pathfinding-browser.min.js'));

      f = jsonfile.readFileSync('bower.json');
      f.version = semver.inc(f.version, result.bumpType);
      jsonfile.writeFileSync('bower.json', f);

      shell.exec('git add .');
      shell.exec('git commit -m "Bumping version to ' + f.version + '"');
      shell.exec('git push origin master');
      shell.exec('git tag -a ' + f.version + ' -m "Creating tag for version ' + f.version + '"');
      shell.exec('git push origin ' + f.version);

      process.chdir('../');
      del('release');
      del('lib/**/*.*', cb);
    });
}

gulp.task('clean', clean);
gulp.task('browserify', gulp.series(clean, browserifyTask));
gulp.task('uglify', gulp.series(clean, browserifyTask, uglifyTask));
gulp.task('scripts', gulp.series(clean, browserifyTask, uglifyTask, concatScripts));
gulp.task('compile', gulp.series('scripts', removeBrowserified));
gulp.task('test', test);
gulp.task('bench', bench);
gulp.task('lint', lint);
gulp.task('release', gulp.series('compile', release));
gulp.task('default', gulp.series('lint', 'test', 'compile'));
