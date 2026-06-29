/**
 * Backtrace function to extract path from node chain
 */
function backtrace(node) {
    var path = [];
    while (node) {
        path.push([node.x, node.y]);
        node = node.parent;
    }
    return path.reverse();
}

function clonePath(path) {
    return (path || []).map(function(coord) {
        return [coord[0], coord[1]];
    });
}

function cloneQTable(qTable) {
    var copy = {};
    var state;

    for (state in qTable) {
        if (qTable.hasOwnProperty(state)) {
            copy[state] = qTable[state].slice();
        }
    }

    return copy;
}

function cloneOptions(options) {
    return {
        learningRate: options.learningRate,
        discountFactor: options.discountFactor,
        explorationRate: options.explorationRate,
        maxEpisodes: options.maxEpisodes,
        trackLearning: options.trackLearning
    };
}

function cloneEpisodes(episodes) {
    return (episodes || []).map(function(episode) {
        return {
            episode: episode.episode,
            totalReward: episode.totalReward,
            steps: episode.steps,
            reachedGoal: episode.reachedGoal
        };
    });
}

function cloneLearningRun(run) {
    if (!run) {
        return null;
    }

    return {
        start: clonePath([run.start])[0],
        end: clonePath([run.end])[0],
        options: cloneOptions(run.options || {}),
        episodes: cloneEpisodes(run.episodes),
        bestPath: clonePath(run.bestPath),
        path: clonePath(run.path),
        pathFound: !!run.pathFound,
        trainingPathFound: !!run.trainingPathFound,
        successCount: run.successCount || 0,
        totalReward: run.totalReward || 0,
        qTableSize: run.qTableSize || 0,
        qTable: cloneQTable(run.qTable || {})
    };
}

/**
 * Q-Learning Path Finder
 * Sử dụng Reinforcement Learning để tìm đường tối ưu
 */

function QLearningFinder(options) {
    options = options || {};
    
    // Tham số học máy
    this.learningRate = options.learningRate || 0.1;      // Alpha
    this.discountFactor = options.discountFactor || 0.9;  // Gamma
    this.explorationRate = options.explorationRate || 0.3; // Epsilon
    this.maxEpisodes = options.maxEpisodes || 1000;
    
    // Tracking
    this.qTable = {};                    // Bảng Q-values
    this.stats = {
        episode: 0,
        totalReward: 0,
        pathFound: false,
        iterations: 0
    };
    this.trackLearning = options.trackLearning !== false;
    this.learningHistory = [];
    this.lastLearningRun = null;
}

/**
 * Khởi tạo Q-values cho một state
 */
QLearningFinder.prototype.initQValues = function(state) {
    if (!this.qTable[state]) {
        // 4 hành động: Up, Right, Down, Left
        this.qTable[state] = [0, 0, 0, 0];
    }
};

/**
 * Chọn hành động dựa trên epsilon-greedy strategy
 */
QLearningFinder.prototype.selectAction = function(state) {
    this.initQValues(state);
    
    // Khám phá ngẫu nhiên
    if (Math.random() < this.explorationRate) {
        return Math.floor(Math.random() * 4);
    }
    
    // Khai thác - chọn hành động tốt nhất
    var qValues = this.qTable[state];
    var maxQ = Math.max.apply(null, qValues);
    var bestActions = [];
    
    for (var i = 0; i < qValues.length; i++) {
        if (qValues[i] === maxQ) {
            bestActions.push(i);
        }
    }
    
    return bestActions[Math.floor(Math.random() * bestActions.length)];
};

/**
 * Tính toán vị trí tiếp theo dựa trên hành động
 */
QLearningFinder.prototype.getNextPosition = function(x, y, action) {
    var moves = [
        { dx: 0, dy: -1 }, // Up
        { dx: 1, dy: 0 },  // Right
        { dx: 0, dy: 1 },  // Down
        { dx: -1, dy: 0 }  // Left
    ];
    
    var move = moves[action];
    return {
        x: x + move.dx,
        y: y + move.dy
    };
};

/**
 * Kiểm tra vị trí có hợp lệ không
 */
QLearningFinder.prototype.isValidPosition = function(x, y, grid) {
    return grid.isInside(x, y) && grid.isWalkableAt(x, y);
};

/**
 * Tính reward dựa trên vị trí
 */
QLearningFinder.prototype.calculateReward = function(x, y, endX, endY, grid, currentX, currentY) {
    // Không hợp lệ = phạt nặng
    if (!this.isValidPosition(x, y, grid)) {
        return -10;
    }
    
    // Đích = phần thưởng lớn
    if (x === endX && y === endY) {
        return 100;
    }
    
    // Gần đích hơn = phần thưởng nhỏ
    var distance = Math.abs(x - endX) + Math.abs(y - endY);
    var prevDistance = Math.abs(currentX - endX) + Math.abs(currentY - endY);
    
    if (distance < prevDistance) {
        return 1;  // Tiến lại gần
    }
    
    return -0.5; // Đi xa
};

/**
 * Training loop - huấn luyện Q-Learning
 */
QLearningFinder.prototype.train = function(startX, startY, endX, endY, grid) {
    var self = this;
    var successCount = 0;
    var run = {
        start: [startX, startY],
        end: [endX, endY],
        options: {
            learningRate: this.learningRate,
            discountFactor: this.discountFactor,
            explorationRate: this.explorationRate,
            maxEpisodes: this.maxEpisodes,
            trackLearning: this.trackLearning
        },
        episodes: [],
        bestPath: [],
        path: [],
        pathFound: false,
        trainingPathFound: false,
        successCount: 0,
        totalReward: 0,
        qTableSize: 0,
        qTable: {}
    };
    
    for (var episode = 0; episode < this.maxEpisodes; episode++) {
        var x = startX;
        var y = startY;
        var episodeReward = 0;
        var maxSteps = grid.width * grid.height * 2;
        var stepCount = 0;
        var reachedGoal = false;
        var episodePath = [[x, y]];
        
        while (stepCount < maxSteps) {
            var state = x + ',' + y;
            var node = grid.getNodeAt(x, y);
            self.initQValues(state);
            
            // Đánh dấu node đã được khám phá
            if (node) {
                node.opened = true;
            }
            
            // Chọn hành động
            var action = self.selectAction(state);
            var nextPos = self.getNextPosition(x, y, action);
            
            // Tính reward
            var reward = self.calculateReward(nextPos.x, nextPos.y, endX, endY, grid, x, y);
            episodeReward += reward;
            
            // Cập nhật Q-value
            var nextState = nextPos.x + ',' + nextPos.y;
            self.initQValues(nextState);
            var maxNextQ = Math.max.apply(null, self.qTable[nextState]);
            
            var currentQ = self.qTable[state][action];
            self.qTable[state][action] = currentQ + self.learningRate * (reward + self.discountFactor * maxNextQ - currentQ);
            
            // Di chuyển
            if (self.isValidPosition(nextPos.x, nextPos.y, grid)) {
                x = nextPos.x;
                y = nextPos.y;
                episodePath.push([x, y]);
            }
            
            // Kiểm tra đã đến đích
            if (x === endX && y === endY) {
                successCount++;
                reachedGoal = true;
                if (!run.bestPath.length || episodePath.length < run.bestPath.length) {
                    run.bestPath = clonePath(episodePath);
                }
                break;
            }
            
            stepCount++;
        }
        
        this.stats.episode = episode + 1;
        this.stats.totalReward = episodeReward;
        if (this.trackLearning) {
            run.episodes.push({
                episode: episode + 1,
                totalReward: episodeReward,
                steps: stepCount,
                reachedGoal: reachedGoal
            });
        }
    }
    
    this.stats.pathFound = successCount > 0;
    run.pathFound = this.stats.pathFound;
    run.trainingPathFound = this.stats.pathFound;
    run.successCount = successCount;
    run.totalReward = this.stats.totalReward;
    run.qTableSize = Object.keys(this.qTable).length;
    run.qTable = cloneQTable(this.qTable);

    return run;
};

/**
 * Trích xuất đường đi từ Q-Table
 */
QLearningFinder.prototype.extractPath = function(startX, startY, endX, endY, grid) {
    var x = startX;
    var y = startY;
    var maxSteps = grid.width * grid.height * 2;
    var stepCount = 0;
    var startNode = grid.getNodeAt(startX, startY);
    var endNode = grid.getNodeAt(endX, endY);
    var currentNode = startNode;
    
    while (stepCount < maxSteps) {
        if (x === endX && y === endY) {
            return backtrace(endNode);
        }
        
        var state = x + ',' + y;
        this.initQValues(state);
        
        // Chọn hành động tốt nhất (không khám phá)
        var oldExploration = this.explorationRate;
        this.explorationRate = 0;
        var action = this.selectAction(state);
        this.explorationRate = oldExploration;
        
        var nextPos = this.getNextPosition(x, y, action);
        
        if (!this.isValidPosition(nextPos.x, nextPos.y, grid)) {
            break;
        }
        
        var nextNode = grid.getNodeAt(nextPos.x, nextPos.y);
        if (nextNode) {
            nextNode.closed = true;
            nextNode.parent = currentNode;
        }
        
        x = nextPos.x;
        y = nextPos.y;
        currentNode = nextNode;
        stepCount++;
    }
    
    if (x !== endX || y !== endY) {
        return [];
    }
    
    return backtrace(endNode);
};

/**
 * Hàm chính - tìm đường
 */
QLearningFinder.prototype.findPath = function(startX, startY, endX, endY, grid) {
    var run;
    var path;

    // Reset stats
    this.stats = {
        episode: 0,
        totalReward: 0,
        pathFound: false,
        iterations: 0
    };
    
    // Reset Q-table cho lần tìm kiếm mới
    this.qTable = {};
    
    // Training
    run = this.train(startX, startY, endX, endY, grid) || {};
    
    // Extraction
    path = this.extractPath(startX, startY, endX, endY, grid);
    if (!path.length && run.bestPath && run.bestPath.length) {
        path = clonePath(run.bestPath);
    }

    this.stats.iterations = path.length;
    this.stats.pathFound = path.length > 0 &&
        path[path.length - 1][0] === endX &&
        path[path.length - 1][1] === endY;

    run.start = run.start || [startX, startY];
    run.end = run.end || [endX, endY];
    run.options = run.options || {
        learningRate: this.learningRate,
        discountFactor: this.discountFactor,
        explorationRate: this.explorationRate,
        maxEpisodes: this.maxEpisodes,
        trackLearning: this.trackLearning
    };
    run.episodes = run.episodes || [];
    run.bestPath = clonePath(run.bestPath);
    run.path = clonePath(path);
    run.trainingPathFound = !!run.pathFound;
    run.pathFound = this.stats.pathFound;
    run.successCount = run.successCount || 0;
    run.totalReward = this.stats.totalReward;
    run.qTableSize = Object.keys(this.qTable).length;
    run.qTable = cloneQTable(this.qTable);
    this.lastLearningRun = cloneLearningRun(run);
    this.learningHistory = this.learningHistory.concat([this.lastLearningRun]);
    
    return path;
};

/**
 * Lấy thống kê học máy
 */
QLearningFinder.prototype.getStats = function() {
    return {
        qTableSize: Object.keys(this.qTable).length,
        episode: this.stats.episode,
        totalReward: this.stats.totalReward,
        pathFound: this.stats.pathFound,
        iterations: this.stats.iterations,
        learningRate: this.learningRate,
        discountFactor: this.discountFactor,
        explorationRate: this.explorationRate
    };
};

QLearningFinder.prototype.getLearningHistory = function() {
    return this.learningHistory.map(function(run) {
        return cloneLearningRun(run);
    });
};

QLearningFinder.prototype.getLastLearningRun = function() {
    return cloneLearningRun(this.lastLearningRun);
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = QLearningFinder;
}

// Expose to browser/PF namespace
if (typeof PF !== 'undefined') {
    PF.QLearningFinder = QLearningFinder;
}
if (typeof window !== 'undefined') {
    window.QLearningFinder = QLearningFinder;
}
