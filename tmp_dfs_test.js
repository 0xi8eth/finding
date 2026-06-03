const PF = require('./src/PathFinding');
require('./src/finders/DepthFirstFinder');

function hookPathFinding() {
    const originalProto = PF.Node.prototype;
    Object.defineProperties(PF.Node.prototype, {
        opened: {
            get: function() { return this._opened; },
            set: function(v) { this._opened = v; console.log('opened', this.x, this.y, v); }
        },
        closed: {
            get: function() { return this._closed; },
            set: function(v) { this._closed = v; console.log('closed', this.x, this.y, v); }
        },
        tested: {
            get: function() { return this._tested; },
            set: function(v) { this._tested = v; console.log('tested', this.x, this.y, v); }
        }
    });
}

hookPathFinding();

const Grid = PF.Grid;
const grid = new Grid(5, 5);
for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
        grid.setWalkableAt(x, y, true);
    }
}
const finder = new PF.DepthFirstFinder({ allowDiagonal: false, dontCrossCorners: false, trackRecursion: false });
const path = finder.findPath(0,0,4,4,grid);
console.log('path:', path);
