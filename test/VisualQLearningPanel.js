var fs = require('fs');
var path = require('path');

describe('Visual Q-Learning panel', function() {
    it('renders one Q-Learning accordion entry', function() {
        var html = fs.readFileSync(path.join(__dirname, '../visual/index.html'), 'utf8');

        (html.match(/id="qlearning_header"/g) || []).length.should.equal(1);
        (html.match(/id="qlearning_section"/g) || []).length.should.equal(1);
    });
});
