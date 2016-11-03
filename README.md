# [lcov](http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php)-[sourcemap](https://github.com/mozilla/source-map/)

> Transform an LCOV file using sourcemaps.

This package will look for sourcemap files under the given source directory.
The lcov file lists files that are covered. This package will look for
sourcemaps with the name `<file>.map`.

---
## Wat?
* Run tests against transformed, concat'ed, etc. dist file
* Get code coverage per source file

---
## Install
Install with [npm](https://github.com/Tapad/lcov-sourcemap)

```
npm install --save-dev lcov-autosourcemap
```

---
## Usage
```
var lcovSourcemap = require("lcov-sourcemap");
lcovSourcemap("./coverage/lcov-raw.info", "./src").then(function (lcov) {
    // lcov string
});

lcovSourcemap.writeLcov("./coverage/lcov-raw.info", "./src", "./coverage/lcov.info").then(function () {
    // Done!
});
```
### lcovSourcemap(lcovFilePath, sourceDir)
* **lcovFilePath** (String): Lcov file.
* **sourceDir** (String): Source directory to look for files (checks for existence).
* _return_ (Promise): Promise containing Lcov string

### lcovSourcemap.writeLcov(lcovFilePath, sourcemaps, sourceDir, outputLcovFilePath)
* Arguments similar to `lcovSourceMap`
* **outputLcovFilePath** (String): Output lcov file path.
* _return_ (Promise): Resolves when write is complete
