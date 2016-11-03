"use strict";

var path = require("path"),
	_ = require("lodash"),
	Promise = require("bluebird"),
	sourceMap = require("source-map"),
	convert = require("convert-source-map"),
	fs = Promise.promisifyAll(require("fs")),
	lcovParse = Promise.promisify(require("lcov-parse"));

var File = require("./File");

module.exports = module.exports.getLcov = getLcov;
module.exports.writeLcov = writeLcov;

function getLcov(lcov, sourcemaps, sourceDir) {
	return getTransformedFiles(lcov, sourcemaps, sourceDir).then(function (files) {
		return getOutputLcov(files, sourceDir);
	});
}

function writeLcov(lcov, sourcemaps, sourceDir, outputFile) {
	return getLcov(lcov, sourcemaps, sourceDir).then(function (lcov) {
		return fs.writeFileAsync(outputFile, lcov);
	});
}

function getOutputLcov(files, sourceDir) {
	sourceDir = sourceDir || process.cwd();

	return Promise.all(_.map(files, function (file) {
		// Check if used package tool like webpack or otherwise
		if (file.path.match(/^\.\/[a-z]*:\/\/\//i)) {
			file.path = file.path.split(/^(\.\/[a-z]*:\/\/\/)(.*)/i)[2];
		}

		return new Promise(function (resolve) {
			fs.exists(path.resolve(sourceDir, file.path), function (exists) {
				if (!exists) {
					resolve(null);
					return;
				}
				resolve(file);
			});
		});
	})).then(function (files) {
		return _.filter(files);
	}).then(function (files) {
		var output = [];

		_.each(files, function (file) {
			output.push(file.toString());
		});

		return output.join("\n");
	});
}

function getTransformedFiles(lcov, sourcemaps, sourceDir) {
	return getData(lcov, sourcemaps).then(function (data) {
		console.log(data.lcov['generated_js/app/initializers/misc-setup.js']);
		console.log(data.sourcemap['generated_js/app/initializers/misc-setup.js']);
		return _.chain(data.lcov).map(function (lcov, key) {
			var sourcemap = data.sourcemap[key];
			if (!sourcemap) {
				throw new Error("Missing sourcemap: " + key);
			}
			return transformLcovMap(lcov, sourcemap, sourceDir);
		}).map(function (group) {
			return _.values(group);
		}).flatten().value();
	});
}

function transformLcovMap(lcov, sourcemap, sourceDir) {
	var consumer = sourcemap.consumer;

	var files = {};

	var getFile;
	if (consumer.sourceRoot == null) {
		// sourcemaps without sourceRoot will be relative to dist
		getFile = function (source) {
			var fn = "." + path.sep + path.relative(sourceDir, path.join(path.dirname(sourcemap.path), source.source));
			return files[fn] = files[fn] || new File(fn);
		};
	} else {
		getFile = function (source) {
			var fn = source.source.replace(consumer.sourceRoot, "./");
			return files[fn] = files[fn] || new File(fn);
		};
	}

	_.each(lcov.functions.details, function (func) {
		var source = consumer.originalPositionFor({
			line: func.line,
			column: 0,
			bias: consumer.constructor.LEAST_UPPER_BOUND
		});

		// Can't find it in source map, fuhgeddaboudit
		if (!source || !source.source) {
			return;
		}

		getFile(source).addFunction({
			name: func.name,
			line: source.line,
			hit: func.hit
		});
	});

	_.each(lcov.lines.details, function (line) {
		var source = consumer.originalPositionFor({
			line: line.line,
			column: 0,
			bias: consumer.constructor.LEAST_UPPER_BOUND
		});

		// Can't find it in source map, fuhgeddaboudit
		if (!source || !source.source) {
			return;
		}

		getFile(source).addLine({
			line: source.line,
			hit: line.hit
		});
	});

	_.each(lcov.branches.details, function (branch) {
		var source = consumer.originalPositionFor({
			line: branch.line,
			column: 0,
			bias: consumer.constructor.LEAST_UPPER_BOUND
		});

		// Can't find it in source map, fuhgeddaboudit
		if (!source || !source.source) {
			return;
		}

		getFile(source).addBranch({
			block: branch.block,
			line: source.line,
			branch: branch.branch,
			taken: branch.taken
		});
	});

	return files;
}

function getData(lcov, sourcemaps) {
	return getLcovData(lcov).then(function(lcovData) {
		return getSourcemapsData(lcovData).then(function(sourceMapData) {
			return {
				lcov: lcovData,
				sourcemap: sourceMapData
			}
		});
	});
}

function getSourcemapsData(lcovData) {
	return Promise.props(_.chain(lcovData).map(function(lcov, key) {
		var mapFile = key + '.map';
		var promise = fs.readFileAsync(mapFile, "utf8").then(function (file) {
			if (path.extname(mapFile) === ".map") {
				return file.toString();
			} else {
				// Accept non .map files, include the ability to use commented out source
				return convert.fromSource(file, true).toObject();
			}
		}).then(function (content) {
			return {
				path: mapFile,
				consumer: new sourceMap.SourceMapConsumer(content)
			};
		});
		return [key, promise];
	}).zipObject().value());
}

function getLcovData(lcov) {
	return lcovParse(lcov).then(function (data) {
		return _.chain(data).map(function (item) {
			var name = item.file;
			return [
				name,
				item
			];
		}).zipObject().value();
	});
}
