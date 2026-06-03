function backtrace(node) {
    var path = [];
    while (node) {
        path.push([node.x, node.y]);
        node = node.parent;
    }
    return path.reverse();
}

function getDiagonalMovementDefault() {
    if (typeof PF !== 'undefined' && PF.DiagonalMovement) {
        return PF.DiagonalMovement.Never;
    }
    return 2;
}

function DepthFirstFinder(opt) {
    opt = opt || {};
    this.allowDiagonal = opt.allowDiagonal;
    this.dontCrossCorners = opt.dontCrossCorners;
    this.diagonalMovement = opt.diagonalMovement;

    if (!this.diagonalMovement) {
        if (!this.allowDiagonal) {
            this.diagonalMovement = DiagonalMovement.Never;
        } else {
            if (this.dontCrossCorners) {
                this.diagonalMovement = DiagonalMovement.OnlyWhenNoObstacles;
            } else {
                this.diagonalMovement = DiagonalMovement.IfAtMostOneObstacle;
            }
        }
    }
}

DepthFirstFinder.prototype._getNeighbors = function(grid, node) {
    if (grid.getNeighbors.length >= 3) {
        return grid.getNeighbors(node, this.allowDiagonal, this.dontCrossCorners);
    }
    return grid.getNeighbors(node, this.diagonalMovement);
};

DepthFirstFinder.prototype.findPath = function(startX, startY, endX, endY, grid) {
    var startNode = grid.getNodeAt(startX, startY);
    var endNode = grid.getNodeAt(endX, endY);
    var stack = [[startNode, null]];

    startNode.opened = true;
    startNode.parent = null;

    while (stack.length > 0) {
        var currentPair = stack.pop();
        var node = currentPair[0];

        node.closed = true;

        if (node === endNode) {
            return backtrace(endNode);
        }

        var neighbors = this._getNeighbors(grid, node);
        for (var i = 0; i < neighbors.length; ++i) {
            var neighbor = neighbors[i];
            if (neighbor.closed || neighbor.opened) {
                continue;
            }
            neighbor.parent = node;
            stack.push([neighbor, node]);
            neighbor.opened = true;
        }
    }
    return [];
};

if (typeof PF !== 'undefined') {
    PF.DepthFirstFinder = DepthFirstFinder;
    if (!PF.DiagonalMovement) {
        PF.DiagonalMovement = {
            Always: 1,
            Never: 2,
            IfAtMostOneObstacle: 3,
            OnlyWhenNoObstacles: 4
        };
    }
}
if (typeof window !== 'undefined' && !window.DiagonalMovement) {
    window.DiagonalMovement = (typeof PF !== 'undefined' && PF.DiagonalMovement) ?
        PF.DiagonalMovement : {
            Always: 1,
            Never: 2,
            IfAtMostOneObstacle: 3,
            OnlyWhenNoObstacles: 4
        };
}
window.DepthFirstFinder = DepthFirstFinder;

