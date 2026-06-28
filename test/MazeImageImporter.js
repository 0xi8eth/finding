var assert = require('assert');
var MazeImageImporter = require('../visual/js/maze_image_importer');

function makeImageData(width, height, pixels) {
    var data = [];

    pixels.forEach(function(pixel) {
        data.push(pixel[0], pixel[1], pixel[2], pixel[3] === undefined ? 255 : pixel[3]);
    });

    return {
        width: width,
        height: height,
        data: data
    };
}

function makeImageDataFromRows(rows) {
    var pixels = [],
        y, x, value;

    for (y = 0; y < rows.length; ++y) {
        for (x = 0; x < rows[y].length; ++x) {
            value = rows[y].charAt(x) === '#' ? 0 : 255;
            pixels.push([value, value, value]);
        }
    }

    return makeImageData(rows[0].length, rows.length, pixels);
}

function makeOccupancyImageData(matrix, cellSize, margin, inset) {
    var height = matrix.length,
        width = height ? matrix[0].length : 0,
        imageWidth = width * cellSize + margin * 2,
        imageHeight = height * cellSize + margin * 2,
        pixels = [],
        x, y, cellX, cellY, localX, localY, isWall, isInsetWall, value;

    for (y = 0; y < imageHeight; ++y) {
        for (x = 0; x < imageWidth; ++x) {
            cellX = Math.floor((x - margin) / cellSize);
            cellY = Math.floor((y - margin) / cellSize);
            localX = (x - margin) - cellX * cellSize;
            localY = (y - margin) - cellY * cellSize;
            isWall = cellX >= 0 && cellX < width &&
                cellY >= 0 && cellY < height &&
                matrix[cellY][cellX];
            isInsetWall = isWall &&
                localX >= inset && localX < cellSize - inset &&
                localY >= inset && localY < cellSize - inset;
            value = isInsetWall ? 20 : 245;
            pixels.push([value, value, value]);
        }
    }

    return makeImageData(imageWidth, imageHeight, pixels);
}

function makeOccupancyImageDataWithBleed(matrix, cellSize, margin, bleedWidth) {
    var height = matrix.length,
        width = height ? matrix[0].length : 0,
        imageWidth = width * cellSize + margin * 2,
        imageHeight = height * cellSize + margin * 2,
        pixels = [],
        x, y, cellX, cellY, localX, isWall, isBleed, value;

    for (y = 0; y < imageHeight; ++y) {
        for (x = 0; x < imageWidth; ++x) {
            cellX = Math.floor((x - margin) / cellSize);
            cellY = Math.floor((y - margin) / cellSize);
            localX = (x - margin) - cellX * cellSize;
            isWall = cellX >= 0 && cellX < width &&
                cellY >= 0 && cellY < height &&
                matrix[cellY][cellX];
            isBleed = cellX >= 0 && cellX < width &&
                cellY >= 0 && cellY < height &&
                !isWall &&
                localX >= 0 && localX < bleedWidth;
            value = isWall || isBleed ? 20 : 245;
            pixels.push([value, value, value]);
        }
    }

    return makeImageData(imageWidth, imageHeight, pixels);
}

describe('MazeImageImporter', function() {
    it('marks dark pixels as walls by default', function() {
        var imageData = makeImageData(2, 2, [
            [0, 0, 0],
            [255, 255, 255],
            [120, 120, 120],
            [200, 200, 200]
        ]);

        var matrix = MazeImageImporter.imageDataToMatrix(imageData, {
            threshold: 150
        });

        assert.deepEqual(matrix, [
            [1, 0],
            [1, 0]
        ]);
    });

    it('can treat light pixels as walls', function() {
        var imageData = makeImageData(2, 1, [
            [30, 30, 30],
            [240, 240, 240]
        ]);

        var matrix = MazeImageImporter.imageDataToMatrix(imageData, {
            threshold: 150,
            darkAsWall: false
        });

        assert.deepEqual(matrix, [[0, 1]]);
    });

    it('keeps transparent pixels walkable', function() {
        var imageData = makeImageData(1, 1, [
            [0, 0, 0, 0]
        ]);

        var matrix = MazeImageImporter.imageDataToMatrix(imageData, {
            threshold: 150
        });

        assert.deepEqual(matrix, [[0]]);
    });

    it('thins thick orthogonal walls to one cell', function() {
        var matrix = MazeImageImporter.thinWalls([
            [0, 1, 1, 1, 0],
            [0, 1, 1, 1, 0],
            [0, 1, 1, 1, 0],
            [0, 1, 1, 1, 0],
            [0, 1, 1, 1, 0]
        ]);

        assert.deepEqual(matrix, [
            [0, 0, 1, 0, 0],
            [0, 0, 1, 0, 0],
            [0, 0, 1, 0, 0],
            [0, 0, 1, 0, 0],
            [0, 0, 1, 0, 0]
        ]);
    });

    it('can keep thick walls when thinning is disabled', function() {
        var imageData = makeImageData(3, 3, [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
            [255, 255, 255],
            [255, 255, 255],
            [255, 255, 255]
        ]);

        var matrix = MazeImageImporter.imageDataToMatrix(imageData, {
            threshold: 150,
            thinWalls: false
        });

        assert.deepEqual(matrix, [
            [1, 1, 1],
            [1, 1, 1],
            [0, 0, 0]
        ]);
    });

    it('aggregates high-resolution samples into requested output cells', function() {
        var imageData = makeImageDataFromRows([
                '...##...',
                '...##...',
                '........',
                '........'
            ]),
            matrix = MazeImageImporter.imageDataToMatrix(imageData, {
                threshold: 150,
                thinWalls: false,
                outputWidth: 4,
                outputHeight: 2,
                coverageThreshold: 0.2
            });

        assert.deepEqual(matrix, [
            [0, 1, 1, 0],
            [0, 0, 0, 0]
        ]);
    });

    it('keeps already thin wall corners connected', function() {
        var matrix = MazeImageImporter.thinWalls([
            [1, 1, 0],
            [0, 1, 0],
            [0, 1, 0]
        ]);

        assert.deepEqual(matrix, [
            [1, 1, 0],
            [0, 1, 0],
            [0, 1, 0]
        ]);
    });

    it('thins thick orthogonal elbows without drifting into diagonal gaps', function() {
        var matrix = MazeImageImporter.thinWalls([
            [0, 1, 1, 1, 0, 0, 0],
            [0, 1, 1, 1, 0, 0, 0],
            [0, 1, 1, 1, 0, 0, 0],
            [0, 1, 1, 1, 0, 0, 0],
            [0, 1, 1, 1, 1, 1, 1],
            [0, 1, 1, 1, 1, 1, 1],
            [0, 1, 1, 1, 1, 1, 1]
        ]);

        assert.deepEqual(matrix, [
            [0, 0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0],
            [0, 1, 1, 1, 1, 1, 1],
            [0, 0, 1, 0, 0, 0, 0]
        ]);
    });

    it('chooses endpoints from the largest walkable area', function() {
        var endpoints = MazeImageImporter.findWalkableEndpoints([
            [0, 0, 0, 1, 0],
            [1, 1, 0, 1, 0],
            [0, 0, 0, 1, 0]
        ]);

        assert.deepEqual(endpoints, {
            start: [0, 0],
            end: [0, 2]
        });
    });

    it('scans an occupancy grid from a cropped image with inset walls', function() {
        var sourceMatrix = [
                [1, 1, 1, 1, 1],
                [1, 0, 0, 0, 1],
                [1, 0, 1, 0, 1],
                [1, 0, 0, 0, 1],
                [1, 1, 1, 1, 1]
            ],
            imageData = makeOccupancyImageData(sourceMatrix, 8, 5, 2),
            result = MazeImageImporter.scanImageDataToOccupancyGrid(imageData, {
                minCellSize: 6,
                maxCellSize: 10,
                wallThreshold: 0.2,
                postProcess: false
            });

        assert.deepEqual(result.matrix, sourceMatrix);
        assert.equal(result.metadata.cellSize, 8);
        assert.equal(result.metadata.cols, 5);
        assert.equal(result.metadata.rows, 5);
        assert.deepEqual(result.metadata.cropBox, {
            x: 7,
            y: 7,
            width: 36,
            height: 36
        });
        assert.equal(result.metadata.offsetX >= 0, true);
        assert.equal(result.metadata.offsetX < result.metadata.cellSize, true);
        assert.equal(result.metadata.offsetY >= 0, true);
        assert.equal(result.metadata.offsetY < result.metadata.cellSize, true);
        assert.equal(result.debug.thresholdMask.width, 36);
        assert.equal(result.debug.crop.width, 36);
    });

    it('prefers grids whose walkable corridors stay one cell wide', function() {
        var sourceMatrix = [
                [1, 1, 1, 1, 1],
                [1, 0, 0, 0, 1],
                [1, 0, 1, 0, 1],
                [1, 0, 0, 0, 1],
                [1, 1, 1, 1, 1]
            ],
            imageData = makeOccupancyImageData(sourceMatrix, 8, 5, 2),
            result = MazeImageImporter.scanImageDataToOccupancyGrid(imageData, {
                minCellSize: 3,
                maxCellSize: 10,
                wallThreshold: 0.2,
                postProcess: false
            });

        assert.equal(result.metadata.cellSize, 8);
        assert.deepEqual(result.matrix, sourceMatrix);
    });

    it('keeps walkable cells when dark wall bleed is below wall coverage', function() {
        var sourceMatrix = [
                [1, 1, 1, 1, 1],
                [1, 0, 0, 0, 1],
                [1, 0, 1, 0, 1],
                [1, 0, 0, 0, 1],
                [1, 1, 1, 1, 1]
            ],
            imageData = makeOccupancyImageDataWithBleed(sourceMatrix, 8, 0, 3),
            result = MazeImageImporter.scanImageDataToOccupancyGrid(imageData, {
                minCellSize: 8,
                maxCellSize: 8,
                closeIterations: 0,
                openMinArea: 0,
                postProcess: false
            });

        assert.deepEqual(result.matrix, sourceMatrix);
    });

    it('post-processes one-cell wall gaps and isolated wall noise', function() {
        var matrix = MazeImageImporter.postProcessOccupancyGrid([
            [1, 1, 0, 1, 1],
            [0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0],
            [0, 0, 0, 0, 0]
        ]);

        assert.deepEqual(matrix, [
            [1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0]
        ]);
    });
});
