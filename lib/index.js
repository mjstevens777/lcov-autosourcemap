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

function getLcov(lcov, sourceDir, mapExtension, unmappedExtension) {
	return getTransformedFiles(lcov, sourceDir, mapExtension, unmappedExtension).then(function (files) {
		return getOutputLcov(files);
	});
}

function writeLcov(lcov, sourceDir, mapExtension, unmappedExtension, outputFile) {2
	return getLcov(lcov, sourceDir, mapExtension, unmappedExtension).then(function (lcov) {
		return fs.writeFileAsync(outputFile, lcov);
	});
}

function getOutputLcov(files) {
	var destDir = process.cwd();

	return Promise.all(_.map(files, function (file) {
		// Check if used package tool like webpack or otherwise
		if (file.path.match(/^\.\/[a-z]*:\/\/\//i)) {
			file.path = file.path.split(/^(\.\/[a-z]*:\/\/\/)(.*)/i)[2];
		}

		return new Promise(function (resolve) {
			fs.exists(path.resolve(destDir, file.path), function (exists) {
				if (!exists) {
					console.log('Warning: ' + file.path + ' not found');
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

function getTransformedFiles(lcov, sourceDir, mapExtension, unmappedExtension) {
	return getData(lcov, sourceDir, mapExtension).then(function (data) {
		return _.chain(data.lcov).map(function (lcov, key) {
			var sourcemap = data.sourcemap[key];
			if (!sourcemap) {
				return passthruLcovMap(lcov, sourceDir, unmappedExtension);
			}
			return transformLcovMap(lcov, sourcemap, sourceDir);
		}).map(function (group) {
			return _.values(group);
		}).flatten().value();
	});
}


function passthruLcovMap(lcov, sourceDir, unmappedExtension) {
	var files = {};

	var getFile;
	getFile = function (source) {
		var fn = path.normalize(lcov.file + unmappedExtension);
		return files[fn] = files[fn] || new File(fn);
	};

	_.each(lcov.functions.details, function (source) {
		getFile(source).addFunction(source);
	});

	_.each(lcov.lines.details, function (source) {
		getFile(source).addLine(source);
	});

	_.each(lcov.branches.details, function (source) {
		getFile(source).addBranch(source);
	});

	return files;
}

function transformLcovMap(lcov, sourcemap) {
	var consumer = sourcemap.consumer;

	var files = {};

	var getFile;
	getFile = function (source) {
		var fn = "." + path.sep + path.join(path.dirname(sourcemap.path), source.source);
		fn = path.normalize(fn);
		return files[fn] = files[fn] || new File(fn);
	};

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

function getData(lcov, sourceDir, mapExtension) {
	return getLcovData(lcov).then(function(lcovData) {
		return getSourcemapsData(lcovData, sourceDir, mapExtension).then(function(sourceMapData) {
			return {
				lcov: lcovData,
				sourcemap: sourceMapData
			}
		});
	});
}

function getSourcemapsData(lcovData, sourceDir, mapExtension) {
	return Promise.props(_.chain(lcovData).map(function(lcov, key) {
		var mapFile = path.join(sourceDir, key + mapExtension);
		if (! fs.existsSync(mapFile)) {
			return [key, null]; // Empty sourcemap
		}

		var promise = fs.readFileAsync(mapFile, "utf8").then(function (file) {
			return file.toString();
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
