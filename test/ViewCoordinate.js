var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function loadView(offsets) {
    var canvas = { nodeName: 'svg' },
        context = {
            console: {
                error: function() {}
            },
            Raphael: function() {},
            $: function(selector) {
                return {
                    offset: function() {
                        if (selector === canvas) {
                            return offsets.canvas;
                        }
                        return offsets.drawArea;
                    }
                };
            }
        };

    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '../visual/js/view.js'), 'utf8'),
        context
    );

    context.View.paper = { canvas: canvas };
    return context.View;
}

describe('View grid coordinate conversion', function() {
    it('maps the visual center of a padded canvas cell to that cell', function() {
        var view = loadView({
            drawArea: { left: 40, top: 100 },
            canvas: { left: 40, top: 120 }
        });

        view.nodeSize = 30;
        view.zoomLevel = 1;

        assert.deepEqual(view.toGridCoordinate(55, 135), [0, 0]);
    });

    it('uses the Raphael canvas offset when the canvas is centered in the draw area', function() {
        var view = loadView({
            drawArea: { left: 20, top: 100 },
            canvas: { left: 110, top: 120 }
        });

        view.nodeSize = 30;
        view.zoomLevel = 1.5;

        assert.deepEqual(view.toGridCoordinate(222.5, 277.5), [2, 3]);
    });
});
