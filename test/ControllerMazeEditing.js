var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var SourceGrid = require('../src/core/Grid');
var BrowserPF = require('../visual/lib/pathfinding-browser.min');

function createJqueryStub() {
    var chain = {
        attr: function() { return this; },
        click: function() { return this; },
        eq: function() { return this; },
        removeAttr: function() { return this; },
        text: function() { return this; },
        toggleClass: function() { return this; },
        unbind: function() { return this; }
    };

    function jquery() {
        return chain;
    }

    jquery.each = function(items, callback) {
        var i;

        for (i = 0; i < items.length; ++i) {
            callback(i, items[i]);
        }
    };
    jquery.extend = function(target, source) {
        var key;

        for (key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }

        return target;
    };
    jquery.proxy = function(fn, context) {
        return function() {
            return fn.apply(context, arguments);
        };
    };

    return jquery;
}

function loadController(pf) {
    pf = pf || {
        Grid: SourceGrid,
        Node: function() {}
    };

    var context = {
        console: {
            error: function() {},
            log: function() {}
        },
        PF: pf,
        MazeImageImporter: require('../visual/js/maze_image_importer'),
        Panel: {},
        View: {
            clearBlockedNodes: function() {},
            clearFootprints: function() {},
            clearPath: function() {},
            setEndPos: function() {},
            setStartPos: function() {},
            setAttributeAt: function() {},
            setWalkableAt: function() {},
            nodeColorizeEffect: {
                duration: 0
            }
        },
        window: {}
    };

    context.$ = createJqueryStub();
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '../visual/lib/state-machine.min.js'), 'utf8'),
        context
    );
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '../visual/js/controller.js'), 'utf8'),
        context
    );

    context.Controller.setButtonStates = function() {};

    return context.Controller;
}

describe('Controller maze image editing state', function() {
    it('returns to ready after importing a maze from a transient edit state', function() {
        var transientStates = [
                'draggingStart',
                'draggingEnd',
                'drawingWall',
                'erasingWall'
            ],
            i,
            controller;

        for (i = 0; i < transientStates.length; ++i) {
            controller = loadController();
            controller.current = transientStates[i];

            controller.ensureReadyForMazeEditing();

            assert.equal(controller.current, 'ready');
            assert.equal(controller.can('drawWall'), true);
            assert.equal(controller.can('eraseWall'), true);
        }
    });

    it('applies scanned maze data as an editable ready grid', function() {
        var controller = loadController(),
            wallCount;

        controller.gridSize = [5, 3];
        controller.grid = new SourceGrid(5, 3);
        controller.current = 'finished';

        wallCount = controller.applyMazeMatrix([
            [0, 0, 0, 1, 0],
            [1, 1, 0, 1, 0],
            [0, 0, 0, 1, 0]
        ]);

        assert.equal(wallCount, 5);
        assert.equal(controller.current, 'ready');
        assert.equal(controller.can('drawWall'), true);
        assert.equal(controller.can('eraseWall'), true);
        assert.equal(controller.can('dragStart'), true);
        assert.equal(controller.can('dragEnd'), true);
        assert.deepEqual([controller.startX, controller.startY], [0, 0]);
        assert.deepEqual([controller.endX, controller.endY], [0, 2]);
        assert.equal(controller.grid.isWalkableAt(controller.startX, controller.startY), true);
        assert.equal(controller.grid.isWalkableAt(controller.endX, controller.endY), true);
    });

    it('builds an editable searchable grid with the browser PF bundle', function() {
        var controller = loadController(BrowserPF);

        controller.gridSize = [5, 3];
        controller.grid = new BrowserPF.Grid(5, 3);
        controller.current = 'ready';

        controller.applyMazeMatrix([
            [0, 0, 0, 1, 0],
            [1, 1, 0, 1, 0],
            [0, 0, 0, 1, 0]
        ]);

        assert.equal(controller.grid.width, 5);
        assert.equal(controller.grid.height, 3);
        assert.equal(controller.ensureSearchEndpoints(), true);
        assert.equal(controller.can('drawWall'), true);
        assert.equal(controller.can('eraseWall'), true);

        controller.setWalkableAt(1, 0, false);

        assert.equal(controller.grid.isWalkableAt(1, 0), false);
    });
});
