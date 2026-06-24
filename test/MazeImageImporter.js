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
});
