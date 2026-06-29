var PF = require('..');

describe('QLearningFinder', function() {
    it('stores learning progress for each search run', function() {
        var finder = new PF.QLearningFinder({
            maxEpisodes: 3,
            trackLearning: true
        });

        finder.findPath(0, 0, 1, 1, new PF.Grid(2, 2));
        finder.findPath(0, 0, 1, 1, new PF.Grid(2, 2));

        var history = finder.getLearningHistory();

        history.length.should.equal(2);
        history[0].start.should.eql([0, 0]);
        history[0].end.should.eql([1, 1]);
        history[0].episodes.length.should.equal(3);
        history[0].episodes[0].episode.should.equal(1);
        history[0].qTableSize.should.be.above(0);
    });

    it('uses the best successful training path when greedy extraction fails', function() {
        var finder = new PF.QLearningFinder({
            maxEpisodes: 1,
            trackLearning: true
        });

        finder.train = function() {
            this.stats.pathFound = true;
            return {
                start: [0, 0],
                end: [1, 0],
                episodes: [],
                bestPath: [[0, 0], [1, 0]],
                pathFound: true,
                qTableSize: 1,
                successCount: 1,
                totalReward: 100
            };
        };
        finder.extractPath = function() {
            return [];
        };

        finder.findPath(0, 0, 1, 0, new PF.Grid(2, 1)).should.eql([[0, 0], [1, 0]]);
        finder.getLastLearningRun().path.should.eql([[0, 0], [1, 0]]);
    });
});
