var fs = require('fs');
var path = require('path');

describe('Visual Q-Learning panel', function() {
    it('renders one Q-Learning accordion entry', function() {
        var html = fs.readFileSync(path.join(__dirname, '../visual/index.html'), 'utf8');

        (html.match(/id="qlearning_header"/g) || []).length.should.equal(1);
        (html.match(/id="qlearning_section"/g) || []).length.should.equal(1);
    });

    it('renders one Deep Q Learning accordion entry', function() {
        var html = fs.readFileSync(path.join(__dirname, '../visual/index.html'), 'utf8');

        (html.match(/id="deep_qlearning_header"/g) || []).length.should.equal(1);
        (html.match(/id="deep_qlearning_section"/g) || []).length.should.equal(1);
        html.should.match(/deep_qlearning_model_path/);
        html.should.match(/deep_qlearning_file_input/);
        html.should.match(/deep_qlearning_status/);
        html.should.match(/deep_qlearning_track/);
        html.should.match(/Giới hạn node mở rộng/);
        html.should.match(/0 = tự động/);
        html.should.match(/\.\.\/dqn_model\.pt/);
    });
});
