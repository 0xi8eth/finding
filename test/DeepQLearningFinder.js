var fs = require('fs');
var PF = require('..');

function directionalPolicy() {
    return {
        predictQValues: function(state, context) {
            if (context.x < context.endX) {
                return [-1, -1, -1, 10];
            }
            if (context.y < context.endY) {
                return [-1, 10, -1, -1];
            }
            return [0, 0, 0, 0];
        }
    };
}

describe('DeepQLearningFinder', function() {
    it('is exported on the public PF namespace', function() {
        PF.DeepQLearningFinder.should.be.Function();
    });

    it('uses model q-values to guide the path', function() {
        var finder = new PF.DeepQLearningFinder({
            model: directionalPolicy(),
            maxExpandedNodes: 20
        });

        var path = finder.findPath(0, 0, 2, 1, new PF.Grid(3, 2));

        path.should.eql([[0, 0], [1, 0], [2, 0], [2, 1]]);
        finder.getLastRun().modelPath.should.equal('C:\\code\\finding\\dqn_model.pt');
        finder.getLastRun().pathFound.should.equal(true);
    });

    it('tries the next model-ranked action when the highest action hits a wall', function() {
        var model = {
            predictQValues: function() {
                return [-1, 8, -1, 10];
            }
        };
        var grid = new PF.Grid([
            [0, 1, 0],
            [0, 0, 0]
        ]);
        var finder = new PF.DeepQLearningFinder({
            model: model,
            maxExpandedNodes: 20
        });

        finder.findPath(0, 0, 2, 0, grid).should.eql([
            [0, 0],
            [0, 1],
            [1, 1],
            [2, 1],
            [2, 0]
        ]);
    });

    it('marks tested, opened, and closed nodes for visual search progress', function() {
        var descriptors = {},
            operations = [],
            attrs = ['opened', 'closed', 'tested'],
            i;

        function hook(attr) {
            descriptors[attr] = Object.getOwnPropertyDescriptor(PF.Node.prototype, attr);
            Object.defineProperty(PF.Node.prototype, attr, {
                configurable: true,
                get: function() {
                    return this['_' + attr];
                },
                set: function(value) {
                    this['_' + attr] = value;
                    operations.push({
                        x: this.x,
                        y: this.y,
                        attr: attr,
                        value: value
                    });
                }
            });
        }

        for (i = 0; i < attrs.length; ++i) {
            hook(attrs[i]);
        }

        try {
            var finder = new PF.DeepQLearningFinder({
                model: {
                    predictQValues: function() {
                        return [-1, 8, -1, 10];
                    }
                },
                maxExpandedNodes: 20
            });

            finder.findPath(0, 0, 2, 0, new PF.Grid([
                [0, 1, 0],
                [0, 0, 0]
            ]));

            operations.some(function(op) {
                return op.attr === 'tested' && op.x === 1 && op.y === 0;
            }).should.equal(true);
            operations.some(function(op) {
                return op.attr === 'opened';
            }).should.equal(true);
            operations.some(function(op) {
                return op.attr === 'closed';
            }).should.equal(true);
        } finally {
            attrs.forEach(function(attr) {
                if (descriptors[attr]) {
                    Object.defineProperty(PF.Node.prototype, attr, descriptors[attr]);
                } else {
                    delete PF.Node.prototype[attr];
                }
            });
        }
    });

    it('loads the trained PyTorch checkpoint and returns four action scores', function() {
        var finder = new PF.DeepQLearningFinder({
            modelPath: 'dqn_model.pt'
        });
        var model = finder.loadModel();
        var qValues = model.predictQValues(null, {
            x: 0,
            y: 0,
            endX: 1,
            endY: 1,
            grid: new PF.Grid(2, 2)
        });

        qValues.length.should.equal(4);
        qValues.forEach(function(value) {
            Number.isFinite(value).should.equal(true);
        });
    });

    it('loads the trained PyTorch checkpoint from selected file bytes', function() {
        var finder = new PF.DeepQLearningFinder({
            modelPath: 'selected-dqn-model.pt',
            modelBytes: fs.readFileSync('dqn_model.pt')
        });

        return finder.loadModelAsync().then(function(model) {
            var qValues = model.predictQValues(null, {
                x: 0,
                y: 0,
                endX: 1,
                endY: 1,
                grid: new PF.Grid(2, 2)
            });

            qValues.length.should.equal(4);
        });
    });
});
