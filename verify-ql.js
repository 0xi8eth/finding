<<<<<<< HEAD
const pf = require('./index');
const matrix = [[0,0,0,0,0],[0,1,1,1,0],[0,0,0,1,0],[0,1,0,0,0],[0,0,0,0,0]];
const grid = new pf.Grid(matrix);
const finder = new pf.QLearningFinder({ learningRate: 0.1, discountFactor: 0.9, explorationRate: 0.3, maxEpisodes: 1000 });
const path = finder.findPath(0, 0, 4, 4, grid);
console.log(JSON.stringify(path));
console.log(JSON.stringify(finder.getStats()));
=======
const pf = require('./index');
const matrix = [[0,0,0,0,0],[0,1,1,1,0],[0,0,0,1,0],[0,1,0,0,0],[0,0,0,0,0]];
const grid = new pf.Grid(matrix);
const finder = new pf.QLearningFinder({ learningRate: 0.1, discountFactor: 0.9, explorationRate: 0.3, maxEpisodes: 1000 });
const path = finder.findPath(0, 0, 4, 4, grid);
console.log(JSON.stringify(path));
console.log(JSON.stringify(finder.getStats()));
>>>>>>> 3173b01 (up code du an)
