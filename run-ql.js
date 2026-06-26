const PathFinding = require('./index');

const matrix = [
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0]
];

const grid = new PathFinding.Grid(matrix);
const finder = new PathFinding.QLearningFinder({
    learningRate: 0.1,
    discountFactor: 0.9,
    explorationRate: 0.3
});

const path = finder.findPath(0, 0, 4, 4, grid);

console.log('QLearningFinder path:');
console.log(path);
