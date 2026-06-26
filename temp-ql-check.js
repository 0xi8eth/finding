const pf = require('./index');

function runCase(matrix, start, end, maxEpisodes) {
  const grid = new pf.Grid(matrix);
  const finder = new pf.QLearningFinder({ learningRate: 0.1, discountFactor: 0.9, explorationRate: 0.3, maxEpisodes: maxEpisodes });
  const path = finder.findPath(start[0], start[1], end[0], end[1], grid);
  const reached = path.length > 0 && path[path.length - 1][0] === end[0] && path[path.length - 1][1] === end[1];
  if (!reached) {
    console.log('FAIL', JSON.stringify(matrix), JSON.stringify(path), finder.getStats());
    process.exit(0);
  }
}

const cases = [
  [[0,0,0],[0,1,0],[0,0,0]],
  [[0,1,0],[0,1,0],[0,0,0]],
  [[0,0,0,0],[1,1,1,0],[0,0,0,0],[0,1,1,0]],
  [[0,0,0,0,0],[0,1,1,1,0],[0,0,0,1,0],[0,1,0,0,0],[0,0,0,0,0]],
  [[0,0,0,0,0],[0,1,0,1,0],[0,0,0,1,0],[0,1,1,1,0],[0,0,0,0,0]],
  [[0,0,0,0,0,0],[0,1,1,1,1,0],[0,0,0,0,1,0],[0,1,1,0,1,0],[0,1,0,0,1,0],[0,0,0,0,0,0]],
];

for (const matrix of cases) {
  runCase(matrix, [0,0], [matrix[0].length - 1, matrix.length - 1], 500);
}
console.log('all simple cases passed');
