/**
 * The visualization controller will works as a state machine.
 * See files under the `doc` folder for transition descriptions.
 * See https://github.com/jakesgordon/javascript-state-machine
 * for the document of the StateMachine module.
 */
var Controller = StateMachine.create({
    initial: 'none',
    events: [
        {
            name: 'init',
            from: 'none',
            to:   'ready'
        },
        {
            name: 'search',
            from: 'starting',
            to:   'searching'
        },
        {
            name: 'pause',
            from: 'searching',
            to:   'paused'
        },
        {
            name: 'finish',
            from: 'searching',
            to:   'finished'
        },
        {
            name: 'resume',
            from: 'paused',
            to:   'searching'
        },
        {
            name: 'cancel',
            from: 'paused',
            to:   'ready'
        },
        {
            name: 'modify',
            from: 'finished',
            to:   'modified'
        },
        {
            name: 'reset',
            from: '*',
            to:   'ready'
        },
        {
            name: 'clear',
            from: ['finished', 'modified'],
            to:   'ready'
        },
        {
            name: 'start',
            from: ['ready', 'modified', 'restarting'],
            to:   'starting'
        },
        {
            name: 'restart',
            from: ['searching', 'finished'],
            to:   'restarting'
        },
        {
            name: 'dragStart',
            from: ['ready', 'finished', 'modified'],
            to:   'draggingStart'
        },
        {
            name: 'dragEnd',
            from: ['ready', 'finished', 'modified'],
            to:   'draggingEnd'
        },
        {
            name: 'drawWall',
            from: ['ready', 'finished', 'modified'],
            to:   'drawingWall'
        },
        {
            name: 'eraseWall',
            from: ['ready', 'finished', 'modified'],
            to:   'erasingWall'
        },
        {
            name: 'rest',
            from: ['draggingStart', 'draggingEnd', 'drawingWall', 'erasingWall'],
            to  : 'ready'
        },
    ],
});

$.extend(Controller, {
    gridSize: [64, 36], // number of nodes horizontally and vertically
    operationsPerSecond: 300,
    mazeImage: null,
    mazeImageUrl: null,
    mazeMaxFileSize: 5 * 1024 * 1024,
    mazeAllowedImageTypes: {
        'image/png': true,
        'image/jpeg': true,
        'image/webp': true,
        'image/gif': true,
        'image/bmp': true
    },
    mazeAllowedImageExtensions: {
        '.png': true,
        '.jpg': true,
        '.jpeg': true,
        '.webp': true,
        '.gif': true,
        '.bmp': true
    },

    /**
     * Asynchronous transition from `none` state to `ready` state.
     */
    onleavenone: function() {
        var numCols = this.gridSize[0],
            numRows = this.gridSize[1];

        this.grid = new PF.Grid(numCols, numRows);

        View.init({
            numCols: numCols,
            numRows: numRows
        });
        View.generateGrid(function() {
            Controller.setDefaultStartEndPos();
            Controller.bindEvents();
            Controller.bindMazeImageEvents();
            Controller.bindZoomEvents();
            Controller.transition(); // transit to the next state (ready)
        });

        this.$buttons = $('.control_button');

        this.hookPathFinding();

        return StateMachine.ASYNC;
        // => ready
    },
    ondrawWall: function(event, from, to, gridX, gridY) {
        this.setWalkableAt(gridX, gridY, false);
        // => drawingWall
    },
    oneraseWall: function(event, from, to, gridX, gridY) {
        this.setWalkableAt(gridX, gridY, true);
        // => erasingWall
    },
    onsearch: function(event, from, to) {
        var grid,
            timeStart, timeEnd,
            finder = Panel.getFinder();

        this.clearOperations();
        this.clearFootprints();
        if (!finder || !finder.findPath) {
            this.setMazeImageStatus('Chưa chọn thuật toán tìm đường hợp lệ.', true);
            this.path = [];
            this.operationCount = 0;
            this.timeSpent = '0.0000';
            this.loop();
            return;
        }
        if (!this.ensureSearchEndpoints()) {
            this.setMazeImageStatus('Không tìm được điểm bắt đầu/kết thúc hợp lệ.', true);
            this.path = [];
            this.operationCount = 0;
            this.timeSpent = '0.0000';
            this.loop();
            return;
        }
        timeStart = window.performance ? performance.now() : Date.now();
        grid = this.grid.clone();
        this.path = finder.findPath(
            this.startX, this.startY, this.endX, this.endY, grid
        );
        this.operationCount = this.operations.length;
        timeEnd = window.performance ? performance.now() : Date.now();
        this.timeSpent = (timeEnd - timeStart).toFixed(4);

        this.loop();
        // => searching
    },
    onrestart: function() {
        // When clearing the colorized nodes, there may be
        // nodes still animating, which is an asynchronous procedure.
        // Therefore, we have to defer the `abort` routine to make sure
        // that all the animations are done by the time we clear the colors.
        // The same reason applies for the `onreset` event handler.
        setTimeout(function() {
            Controller.clearOperations();
            Controller.clearFootprints();
            Controller.start();
        }, View.nodeColorizeEffect.duration * 1.2);
        // => restarting
    },
    onpause: function(event, from, to) {
        // => paused
    },
    onresume: function(event, from, to) {
        this.loop();
        // => searching
    },
    oncancel: function(event, from, to) {
        this.clearOperations();
        this.clearFootprints();
        // => ready
    },
    onfinish: function(event, from, to) {
        View.showStats({
            pathLength: PF.Util.pathLength(this.path),
            timeSpent:  this.timeSpent,
            operationCount: this.operationCount,
        });
        View.drawPath(this.path);
        // => finished
    },
    onclear: function(event, from, to) {
        this.clearOperations();
        this.clearFootprints();
        // => ready
    },
    onmodify: function(event, from, to) {
        // => modified
    },
    onreset: function(event, from, to) {
        setTimeout(function() {
            Controller.clearOperations();
            Controller.clearAll();
            Controller.buildNewGrid();
        }, View.nodeColorizeEffect.duration * 1.2);
        // => ready
    },

    /**
     * The following functions are called on entering states.
     */

    onready: function() {
        console.log('=> ready');
        this.setButtonStates({
            id: 1,
            text: 'Bắt đầu tìm kiếm',
            enabled: true,
            callback: $.proxy(this.start, this),
        }, {
            id: 2,
            text: 'Tạm dừng tìm kiếm',
            enabled: false,
        }, {
            id: 3,
            text: 'Xóa tường',
            enabled: true,
            callback: $.proxy(this.reset, this),
        });
        // => [starting, draggingStart, draggingEnd, drawingStart, drawingEnd]
    },
    onstarting: function(event, from, to) {
        console.log('=> starting');
        // Clears any existing search progress
        this.clearFootprints();
        this.setButtonStates({
            id: 2,
            enabled: true,
        });
        this.search();
        // => searching
    },
    onsearching: function() {
        console.log('=> searching');
        this.setButtonStates({
            id: 1,
            text: 'Tìm kiếm lại',
            enabled: true,
            callback: $.proxy(this.restart, this),
        }, {
            id: 2,
            text: 'Tạm dừng tìm kiếm',
            enabled: true,
            callback: $.proxy(this.pause, this),
        });
        // => [paused, finished]
    },
    onpaused: function() {
        console.log('=> paused');
        this.setButtonStates({
            id: 1,
            text: 'Tiếp tục tìm kiếm',
            enabled: true,
            callback: $.proxy(this.resume, this),
        }, {
            id: 2,
            text: 'Hủy tìm kiếm',
            enabled: true,
            callback: $.proxy(this.cancel, this),
        });
        // => [searching, ready]
    },
    onfinished: function() {
        console.log('=> finished');
        this.setButtonStates({
            id: 1,
            text: 'Tìm kiếm lại',
            enabled: true,
            callback: $.proxy(this.restart, this),
        }, {
            id: 2,
            text: 'Xóa đường đi',
            enabled: true,
            callback: $.proxy(this.clear, this),
        });
    },
    onmodified: function() {
        console.log('=> modified');
        this.setButtonStates({
            id: 1,
            text: 'Bắt đầu tìm kiếm',
            enabled: true,
            callback: $.proxy(this.start, this),
        }, {
            id: 2,
            text: 'Xóa đường đi',
            enabled: true,
            callback: $.proxy(this.clear, this),
        });
    },

    /**
     * Define setters and getters of PF.Node, then we can get the operations
     * of the pathfinding.
     */
    hookPathFinding: function() {

        PF.Node.prototype = {
            get opened() {
                return this._opened;
            },
            set opened(v) {
                this._opened = v;
                Controller.operations.push({
                    x: this.x,
                    y: this.y,
                    attr: 'opened',
                    value: v
                });
            },
            get closed() {
                return this._closed;
            },
            set closed(v) {
                this._closed = v;
                Controller.operations.push({
                    x: this.x,
                    y: this.y,
                    attr: 'closed',
                    value: v
                });
            },
            get tested() {
                return this._tested;
            },
            set tested(v) {
                this._tested = v;
                Controller.operations.push({
                    x: this.x,
                    y: this.y,
                    attr: 'tested',
                    value: v
                });
            },
        };

        this.operations = [];
    },
    bindMazeImageEvents: function() {
        var controller = this,
            $input = $('#maze_image_input'),
            $threshold = $('#maze_wall_threshold'),
            $thresholdValue = $('#maze_wall_threshold_value'),
            $darkWalls = $('#maze_dark_walls'),
            $thinWalls = $('#maze_thin_walls'),
            $applyButton = $('#maze_apply_button');

        $thresholdValue.text($threshold.val());
        this.setMazeApplyEnabled(false);

        $input.change(function() {
            controller.loadMazeImageFile(this.files && this.files[0]);
        });

        $threshold.on('input change', function() {
            $thresholdValue.text(this.value);
            if (controller.mazeImage) {
                controller.setMazeImageStatus('Điều chỉnh xong, nhấp Áp dụng ảnh.');
            }
        });

        $darkWalls.change(function() {
            if (controller.mazeImage) {
                controller.setMazeImageStatus('Đã đổi quy tắc nhận diện, nhấp Áp dụng ảnh.');
            }
        });

        $thinWalls.change(function() {
            if (controller.mazeImage) {
                controller.setMazeImageStatus('Đã đổi cách làm mảnh tường, nhấp Áp dụng ảnh.');
            }
        });

        $applyButton.click(function() {
            controller.applyMazeImage();
        });
    },
    setMazeApplyEnabled: function(enabled) {
        if (enabled) {
            $('#maze_apply_button').removeAttr('disabled');
        } else {
            $('#maze_apply_button').attr({ disabled: 'disabled' });
        }
    },
    validateMazeImageFile: function(file) {
        var extensionMatch, extension;

        if (!file) {
            return 'Chưa chọn ảnh.';
        }

        if (file.size > this.mazeMaxFileSize) {
            return 'Ảnh quá lớn. Vui lòng chọn ảnh tối đa 5MB.';
        }

        if (file.type && !this.mazeAllowedImageTypes[file.type]) {
            return 'Định dạng ảnh không được hỗ trợ.';
        }

        extensionMatch = file.name && file.name.toLowerCase().match(/\.[^.]+$/);
        extension = extensionMatch && extensionMatch[0];
        if (!extension || !this.mazeAllowedImageExtensions[extension]) {
            return 'Phần mở rộng ảnh không được hỗ trợ.';
        }

        return null;
    },
    loadMazeImageFile: function(file) {
        var error = this.validateMazeImageFile(file),
            controller = this,
            image,
            urlApi = window.URL || window.webkitURL;

        if (error) {
            this.mazeImage = null;
            this.setMazeApplyEnabled(false);
            this.setMazeImageStatus(error, true);
            return;
        }

        if (!urlApi || !urlApi.createObjectURL) {
            this.setMazeApplyEnabled(false);
            this.setMazeImageStatus('Trình duyệt không hỗ trợ đọc ảnh cục bộ.', true);
            return;
        }

        if (this.mazeImageUrl) {
            urlApi.revokeObjectURL(this.mazeImageUrl);
        }

        image = new Image();
        this.mazeImageUrl = urlApi.createObjectURL(file);
        this.setMazeApplyEnabled(false);
        this.setMazeImageStatus('Đang đọc ảnh...');

        image.onload = function() {
            controller.mazeImage = image;
            controller.setMazeApplyEnabled(true);
            controller.applyMazeImage();
        };

        image.onerror = function() {
            controller.mazeImage = null;
            controller.setMazeApplyEnabled(false);
            controller.setMazeImageStatus('Không đọc được ảnh này.', true);
        };

        image.src = this.mazeImageUrl;
    },
    applyMazeImage: function() {
        var canvas, context, imageData, matrix, wallCount;

        if (!this.mazeImage) {
            this.setMazeImageStatus('Chưa chọn ảnh.', true);
            return;
        }

        if (this.is('starting') || this.is('searching') ||
                this.is('paused') || this.is('restarting')) {
            this.setMazeImageStatus('Hãy dừng lượt tìm kiếm hiện tại trước khi áp dụng ảnh.', true);
            return;
        }

        if (this.can('clear')) {
            this.clear();
        }

        canvas = document.createElement('canvas');
        canvas.width = this.gridSize[0];
        canvas.height = this.gridSize[1];
        context = canvas.getContext('2d');

        if (!context) {
            this.setMazeImageStatus('Trình duyệt không hỗ trợ xử lý ảnh bằng canvas.', true);
            return;
        }

        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(this.mazeImage, 0, 0, canvas.width, canvas.height);

        try {
            imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        } catch (error) {
            this.setMazeImageStatus('Không thể đọc dữ liệu ảnh.', true);
            return;
        }

        matrix = MazeImageImporter.imageDataToMatrix(imageData, {
            threshold: $('#maze_wall_threshold').val(),
            darkAsWall: $('#maze_dark_walls').is(':checked'),
            thinWalls: $('#maze_thin_walls').is(':checked')
        });

        wallCount = this.applyMazeMatrix(matrix);
        this.setMazeImageStatus('Đã tạo mê cung từ ảnh: ' + wallCount + ' ô tường.');
    },
    applyMazeMatrix: function(matrix) {
        this.setStartEndFromMazeMatrix(matrix);
        matrix = this.keepStartEndWalkable(matrix);
        this.applyWalkabilityMatrix(matrix);
        this.redrawStartEndPos();
        this.ensureReadyForMazeEditing();

        return this.countWalls(matrix);
    },
    ensureReadyForMazeEditing: function() {
        if (this.can('rest')) {
            this.rest();
            return;
        }

        if (this.can('clear')) {
            this.clear();
            return;
        }

        if (this.is('ready')) {
            this.onready();
        }
    },
    setStartEndFromMazeMatrix: function(matrix) {
        var endpoints;

        if (!MazeImageImporter.findWalkableEndpoints) {
            return;
        }

        endpoints = MazeImageImporter.findWalkableEndpoints(matrix);
        if (!endpoints || !endpoints.start || !endpoints.end) {
            return;
        }

        this.setStartPos(endpoints.start[0], endpoints.start[1]);
        this.setEndPos(endpoints.end[0], endpoints.end[1]);
    },
    redrawStartEndPos: function() {
        this.setStartPos(this.startX, this.startY);
        this.setEndPos(this.endX, this.endY);
    },
    keepStartEndWalkable: function(matrix) {
        var controller = this;

        return matrix.map(function(row, y) {
            return row.map(function(value, x) {
                if (controller.isStartPos(x, y) || controller.isEndPos(x, y)) {
                    return 0;
                }
                return value ? 1 : 0;
            });
        });
    },
    applyWalkabilityMatrix: function(matrix) {
        var x, y, width = this.gridSize[0], height = this.gridSize[1];

        this.clearOperations();
        this.clearFootprints();
        View.clearPath();
        View.clearBlockedNodes();
        this.grid = new PF.Grid(width, height, matrix);

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (matrix[y][x]) {
                    View.setWalkableAt(x, y, false, { animate: false });
                }
            }
        }
    },
    countWalls: function(matrix) {
        var x, y, count = 0;

        for (y = 0; y < matrix.length; ++y) {
            for (x = 0; x < matrix[y].length; ++x) {
                if (matrix[y][x]) {
                    count++;
                }
            }
        }

        return count;
    },
    setMazeImageStatus: function(message, isError) {
        $('#maze_image_status')
            .text(message)
            .toggleClass('error', !!isError);
    },
    bindZoomEvents: function() {
        $('#zoom_in_button').click(function() {
            View.zoomIn();
        });
        $('#zoom_out_button').click(function() {
            View.zoomOut();
        });
        $('#zoom_reset_button').click(function() {
            View.resetZoom();
        });
    },
    bindEvents: function() {
        var controller = this,
            $target = View.paper && View.paper.canvas ? $(View.paper.canvas) : $('#draw_area');

        $target.off('mousedown.gridEdit').on('mousedown.gridEdit', function(event) {
            event.preventDefault();
            controller.mousedown(event);
        });

        $(window)
            .off('mousemove.gridEdit mouseup.gridEdit')
            .on('mousemove.gridEdit', $.proxy(this.mousemove, this))
            .on('mouseup.gridEdit', $.proxy(this.mouseup, this));
    },
    loop: function() {
        var interval = 1000 / this.operationsPerSecond;
        (function loop() {
            if (!Controller.is('searching')) {
                return;
            }
            Controller.step();
            setTimeout(loop, interval);
        })();
    },
    step: function() {
        var operations = this.operations,
            op, isSupported;

        do {
            if (!operations.length) {
                this.finish(); // transit to `finished` state
                return;
            }
            op = operations.shift();
            isSupported = View.supportedOperations.indexOf(op.attr) !== -1;
        } while (!isSupported || !this.grid.isInside(op.x, op.y));

        View.setAttributeAt(op.x, op.y, op.attr, op.value);
    },
    clearOperations: function() {
        this.operations = [];
    },
    clearFootprints: function() {
        View.clearFootprints();
        View.clearPath();
    },
    clearAll: function() {
        this.clearFootprints();
        View.clearBlockedNodes();
    },
    buildNewGrid: function() {
        this.grid = new PF.Grid(this.gridSize[0], this.gridSize[1]);
    },
    prepareForManualEdit: function() {
        if (this.is('finished') || this.is('modified')) {
            this.clearOperations();
            this.clearFootprints();
        }
    },
    mousedown: function (event) {
        var coord = View.toGridCoordinate(event.pageX, event.pageY),
            gridX = coord[0],
            gridY = coord[1],
            grid  = this.grid;

        if (!grid.isInside(gridX, gridY)) {
            return;
        }

        if (this.can('dragStart') && this.isStartPos(gridX, gridY)) {
            this.prepareForManualEdit();
            this.dragStart();
            return;
        }
        if (this.can('dragEnd') && this.isEndPos(gridX, gridY)) {
            this.prepareForManualEdit();
            this.dragEnd();
            return;
        }
        if (this.can('drawWall') && grid.isWalkableAt(gridX, gridY)) {
            this.prepareForManualEdit();
            this.drawWall(gridX, gridY);
            return;
        }
        if (this.can('eraseWall') && !grid.isWalkableAt(gridX, gridY)) {
            this.prepareForManualEdit();
            this.eraseWall(gridX, gridY);
        }
    },
    mousemove: function(event) {
        var coord = View.toGridCoordinate(event.pageX, event.pageY),
            grid = this.grid,
            gridX = coord[0],
            gridY = coord[1];

        if (!grid.isInside(gridX, gridY)) {
            return;
        }

        if (this.isStartOrEndPos(gridX, gridY)) {
            return;
        }

        switch (this.current) {
        case 'draggingStart':
            if (grid.isInside(gridX, gridY)) {
                if (!grid.isWalkableAt(gridX, gridY)) {
                    this.setWalkableAt(gridX, gridY, true);
                }
                this.setStartPos(gridX, gridY);
            }
            break;
        case 'draggingEnd':
            if (grid.isInside(gridX, gridY)) {
                if (!grid.isWalkableAt(gridX, gridY)) {
                    this.setWalkableAt(gridX, gridY, true);
                }
                this.setEndPos(gridX, gridY);
            }
            break;
        case 'drawingWall':
            this.setWalkableAt(gridX, gridY, false);
            break;
        case 'erasingWall':
            this.setWalkableAt(gridX, gridY, true);
            break;
        }
    },
    mouseup: function(event) {
        if (Controller.can('rest')) {
            Controller.rest();
        }
    },
    setButtonStates: function() {
        $.each(arguments, function(i, opt) {
            var $button = Controller.$buttons.eq(opt.id - 1);
            if (opt.text) {
                $button.text(opt.text);
            }
            if (opt.callback) {
                $button
                    .unbind('click')
                    .click(opt.callback);
            }
            if (opt.enabled === undefined) {
                return;
            } else if (opt.enabled) {
                $button.removeAttr('disabled');
            } else {
                $button.attr({ disabled: 'disabled' });
            }
        });
    },
    /**
     * When initializing, this method will be called to set the positions
     * of start node and end node.
     * It will detect user's display size, and compute the best positions.
     */
    setDefaultStartEndPos: function() {
        var width, height,
            marginRight, availWidth,
            centerX, centerY,
            endX, endY,
            nodeSize = View.nodeSize;

        width  = $(window).width();
        height = $(window).height();

        marginRight = $('#algorithm_panel').width();
        availWidth = width - marginRight;

        centerX = Math.ceil(availWidth / 2 / nodeSize);
        centerY = Math.floor(height / 2 / nodeSize);

        this.setStartPos(centerX - 5, centerY);
        this.setEndPos(centerX + 5, centerY);
    },
    clampGridX: function(gridX) {
        return Math.max(0, Math.min(this.gridSize[0] - 1, gridX));
    },
    clampGridY: function(gridY) {
        return Math.max(0, Math.min(this.gridSize[1] - 1, gridY));
    },
    findFirstWalkableCell: function() {
        var x, y;

        for (y = 0; y < this.grid.height; ++y) {
            for (x = 0; x < this.grid.width; ++x) {
                if (this.grid.isWalkableAt(x, y)) {
                    return [x, y];
                }
            }
        }

        return null;
    },
    ensureSearchEndpoints: function() {
        var fallback;

        if (this.grid.isInside(this.startX, this.startY) &&
                this.grid.isInside(this.endX, this.endY) &&
                this.grid.isWalkableAt(this.startX, this.startY) &&
                this.grid.isWalkableAt(this.endX, this.endY)) {
            return true;
        }

        fallback = this.findFirstWalkableCell();
        if (!fallback) {
            return false;
        }

        this.setStartPos(fallback[0], fallback[1]);
        this.setEndPos(fallback[0], fallback[1]);
        return true;
    },
    setStartPos: function(gridX, gridY) {
        gridX = this.clampGridX(gridX);
        gridY = this.clampGridY(gridY);
        this.startX = gridX;
        this.startY = gridY;
        View.setStartPos(gridX, gridY);
    },
    setEndPos: function(gridX, gridY) {
        gridX = this.clampGridX(gridX);
        gridY = this.clampGridY(gridY);
        this.endX = gridX;
        this.endY = gridY;
        View.setEndPos(gridX, gridY);
    },
    setWalkableAt: function(gridX, gridY, walkable) {
        this.grid.setWalkableAt(gridX, gridY, walkable);
        View.setAttributeAt(gridX, gridY, 'walkable', walkable);
    },
    isStartPos: function(gridX, gridY) {
        return gridX === this.startX && gridY === this.startY;
    },
    isEndPos: function(gridX, gridY) {
        return gridX === this.endX && gridY === this.endY;
    },
    isStartOrEndPos: function(gridX, gridY) {
        return this.isStartPos(gridX, gridY) || this.isEndPos(gridX, gridY);
    },
});
