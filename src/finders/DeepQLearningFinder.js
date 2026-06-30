var DEFAULT_MODEL_PATH = 'C:\\code\\finding\\dqn_model.pt';
var DEFAULT_STATE_GRID_SIZE = 7;
var DEFAULT_CONV_PADDING = 1;
var DEFAULT_POOL_SIZE = 4;
var DEFAULT_DISTANCE_WEIGHT = 0.05;
var DEFAULT_STEP_WEIGHT = 0.001;

var ACTIONS = [
    { name: 'up', dx: 0, dy: -1 },
    { name: 'down', dx: 0, dy: 1 },
    { name: 'left', dx: -1, dy: 0 },
    { name: 'right', dx: 1, dy: 0 }
];

var TENSOR_SPECS = {
    conv1Weight: { suffix: '/data/0', shape: [32, 3, 3, 3] },
    conv1Bias: { suffix: '/data/1', shape: [32] },
    conv2Weight: { suffix: '/data/2', shape: [64, 32, 3, 3] },
    conv2Bias: { suffix: '/data/3', shape: [64] },
    linear1Weight: { suffix: '/data/4', shape: [128, 1024] },
    linear1Bias: { suffix: '/data/5', shape: [128] },
    linear2Weight: { suffix: '/data/6', shape: [4, 128] },
    linear2Bias: { suffix: '/data/7', shape: [4] }
};

var MODEL_CACHE = {};

function isNodeRuntime() {
    return typeof process !== 'undefined' &&
        process.versions &&
        !!process.versions.node &&
        typeof require === 'function';
}

function clonePath(path) {
    return (path || []).map(function(coord) {
        return [coord[0], coord[1]];
    });
}

function cloneRun(run) {
    if (!run) {
        return null;
    }

    return {
        start: clonePath([run.start])[0],
        end: clonePath([run.end])[0],
        modelPath: run.modelPath,
        expandedNodes: run.expandedNodes,
        maxExpandedNodes: run.maxExpandedNodes,
        pathFound: !!run.pathFound,
        path: clonePath(run.path)
    };
}

function backtrace(node) {
    var path = [[node.x, node.y]];
    while (node.parent) {
        node = node.parent;
        path.push([node.x, node.y]);
    }
    return path.reverse();
}

function manhattan(x, y, endX, endY) {
    return Math.abs(x - endX) + Math.abs(y - endY);
}

function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
}

function product(values) {
    var total = 1;
    for (var i = 0; i < values.length; ++i) {
        total *= values[i];
    }
    return total;
}

function toUint8Array(input) {
    if (input instanceof Uint8Array) {
        return input;
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }
    return new Uint8Array(input);
}

function bytesToString(bytes) {
    var parts = [],
        chunkSize = 8192,
        i;

    for (i = 0; i < bytes.length; i += chunkSize) {
        parts.push(String.fromCharCode.apply(
            null,
            bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        ));
    }
    return parts.join('');
}

function findEndOfCentralDirectory(bytes) {
    var i;
    for (i = bytes.length - 22; i >= 0; --i) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b &&
                bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
            return i;
        }
    }
    throw new Error('Khong doc duoc checkpoint DQN: thieu zip central directory.');
}

function parseZip(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        eocdOffset = findEndOfCentralDirectory(bytes),
        entryCount = view.getUint16(eocdOffset + 10, true),
        centralOffset = view.getUint32(eocdOffset + 16, true),
        offset = centralOffset,
        entries = {},
        i, nameLength, extraLength, commentLength, nameBytes, name;

    for (i = 0; i < entryCount; ++i) {
        if (view.getUint32(offset, true) !== 0x02014b50) {
            throw new Error('Khong doc duoc checkpoint DQN: zip entry khong hop le.');
        }

        nameLength = view.getUint16(offset + 28, true);
        extraLength = view.getUint16(offset + 30, true);
        commentLength = view.getUint16(offset + 32, true);
        nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
        name = bytesToString(nameBytes);
        entries[name] = {
            name: name,
            method: view.getUint16(offset + 10, true),
            compressedSize: view.getUint32(offset + 20, true),
            uncompressedSize: view.getUint32(offset + 24, true),
            localHeaderOffset: view.getUint32(offset + 42, true)
        };

        offset += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}

function getEntryDataOffset(bytes, entry) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        offset = entry.localHeaderOffset,
        nameLength,
        extraLength;

    if (view.getUint32(offset, true) !== 0x04034b50) {
        throw new Error('Khong doc duoc checkpoint DQN: local zip header khong hop le.');
    }

    nameLength = view.getUint16(offset + 26, true);
    extraLength = view.getUint16(offset + 28, true);
    return offset + 30 + nameLength + extraLength;
}

function inflateRawSync(rawBytes) {
    var zlib;
    if (!isNodeRuntime()) {
        throw new Error('Trinh duyet can load DQN model bang loadModelAsync().');
    }

    zlib = require('zlib');
    return toUint8Array(zlib.inflateRawSync(Buffer.from(rawBytes)));
}

function extractEntrySync(bytes, entry) {
    var dataOffset = getEntryDataOffset(bytes, entry),
        rawBytes = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);

    if (entry.method === 0) {
        return rawBytes;
    }
    if (entry.method === 8) {
        return inflateRawSync(rawBytes);
    }

    throw new Error('Khong ho tro zip compression method ' + entry.method + '.');
}

function inflateRawAsync(rawBytes) {
    var stream;

    if (isNodeRuntime()) {
        return Promise.resolve(inflateRawSync(rawBytes));
    }
    if (typeof DecompressionStream === 'undefined' ||
            typeof Response === 'undefined' ||
            typeof Blob === 'undefined') {
        return Promise.reject(new Error(
            'Trinh duyet khong ho tro DecompressionStream de doc dqn_model.pt.'
        ));
    }

    stream = new Blob([rawBytes])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));

    return new Response(stream).arrayBuffer().then(toUint8Array);
}

function extractEntryAsync(bytes, entry) {
    var dataOffset = getEntryDataOffset(bytes, entry),
        rawBytes = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);

    if (entry.method === 0) {
        return Promise.resolve(rawBytes);
    }
    if (entry.method === 8) {
        return inflateRawAsync(rawBytes);
    }

    return Promise.reject(new Error('Khong ho tro zip compression method ' + entry.method + '.'));
}

function findEntryBySuffix(entries, suffix) {
    var name;
    for (name in entries) {
        if (entries.hasOwnProperty(name) &&
                name.slice(name.length - suffix.length) === suffix) {
            return entries[name];
        }
    }
    throw new Error('Checkpoint DQN thieu tensor ' + suffix + '.');
}

function readFloat32Tensor(bytes, shape) {
    var expected = product(shape),
        view,
        values,
        i;

    if (bytes.byteLength < expected * 4) {
        throw new Error('Tensor DQN co kich thuoc khong hop le.');
    }

    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    values = new Float32Array(expected);
    for (i = 0; i < expected; ++i) {
        values[i] = view.getFloat32(i * 4, true);
    }
    return values;
}

function tensorsFromZipSync(bytes) {
    var entries = parseZip(bytes),
        tensors = {},
        key,
        spec,
        entry;

    for (key in TENSOR_SPECS) {
        if (TENSOR_SPECS.hasOwnProperty(key)) {
            spec = TENSOR_SPECS[key];
            entry = findEntryBySuffix(entries, spec.suffix);
            tensors[key] = readFloat32Tensor(extractEntrySync(bytes, entry), spec.shape);
        }
    }

    return tensors;
}

function tensorsFromZipAsync(bytes) {
    var entries = parseZip(bytes),
        tensors = {},
        tasks = [],
        key;

    function pushTask(tensorKey) {
        var spec = TENSOR_SPECS[tensorKey],
            entry = findEntryBySuffix(entries, spec.suffix);

        tasks.push(extractEntryAsync(bytes, entry).then(function(data) {
            tensors[tensorKey] = readFloat32Tensor(data, spec.shape);
        }));
    }

    for (key in TENSOR_SPECS) {
        if (TENSOR_SPECS.hasOwnProperty(key)) {
            pushTask(key);
        }
    }

    return Promise.all(tasks).then(function() {
        return tensors;
    });
}

function loadBytesSync(modelPath) {
    var fs;
    if (!isNodeRuntime()) {
        throw new Error('Trinh duyet can load DQN model bang loadModelAsync().');
    }
    fs = require('fs');
    return toUint8Array(fs.readFileSync(modelPath));
}

function isWindowsAbsolutePath(modelPath) {
    return /^[a-zA-Z]:[\\/]/.test(modelPath || '');
}

function isFilePage() {
    return typeof window !== 'undefined' &&
        window.location &&
        window.location.protocol === 'file:';
}

function loadBytesFromSourceAsync(source) {
    return Promise.resolve(source).then(function(value) {
        if (value && typeof value.arrayBuffer === 'function') {
            return value.arrayBuffer();
        }
        return value;
    }).then(toUint8Array);
}

function loadBytesAsync(modelPath, modelBytes) {
    if (modelBytes) {
        return loadBytesFromSourceAsync(modelBytes);
    }
    if (isNodeRuntime()) {
        return Promise.resolve(loadBytesSync(modelPath));
    }
    if (isWindowsAbsolutePath(modelPath)) {
        return Promise.reject(new Error(
            'Browser khong doc truc tiep duoc path Windows. Hay chon file .pt hoac mo qua server HTTP va dung ../dqn_model.pt.'
        ));
    }
    if (isFilePage()) {
        return Promise.reject(new Error(
            'Ban dang mo bang file:// nen browser khong doc duoc dqn_model.pt. Hay chon file .pt hoac mo http://127.0.0.1:8080/visual/.'
        ));
    }
    if (typeof fetch !== 'function') {
        return Promise.reject(new Error('Trinh duyet khong ho tro fetch de doc dqn_model.pt.'));
    }

    return fetch(modelPath).then(function(response) {
        if (!response.ok) {
            throw new Error('Khong tai duoc DQN model tu ' + modelPath + '.');
        }
        return response.arrayBuffer();
    }).then(toUint8Array);
}

function reluInPlace(values) {
    var i;
    for (i = 0; i < values.length; ++i) {
        if (values[i] < 0) {
            values[i] = 0;
        }
    }
    return values;
}

function conv2d(input, inputChannels, inputHeight, inputWidth, weight, bias,
        outputChannels, kernelHeight, kernelWidth, padding) {
    var outputHeight = inputHeight + padding * 2 - kernelHeight + 1,
        outputWidth = inputWidth + padding * 2 - kernelWidth + 1,
        output = new Float32Array(outputChannels * outputHeight * outputWidth),
        oc, oy, ox, ic, ky, kx, iy, ix, sum, inputIndex, weightIndex,
        outputIndex;

    for (oc = 0; oc < outputChannels; ++oc) {
        for (oy = 0; oy < outputHeight; ++oy) {
            for (ox = 0; ox < outputWidth; ++ox) {
                sum = bias[oc];
                for (ic = 0; ic < inputChannels; ++ic) {
                    for (ky = 0; ky < kernelHeight; ++ky) {
                        iy = oy + ky - padding;
                        if (iy < 0 || iy >= inputHeight) {
                            continue;
                        }
                        for (kx = 0; kx < kernelWidth; ++kx) {
                            ix = ox + kx - padding;
                            if (ix < 0 || ix >= inputWidth) {
                                continue;
                            }
                            inputIndex = ic * inputHeight * inputWidth + iy * inputWidth + ix;
                            weightIndex = (((oc * inputChannels + ic) * kernelHeight + ky) *
                                kernelWidth) + kx;
                            sum += input[inputIndex] * weight[weightIndex];
                        }
                    }
                }
                outputIndex = oc * outputHeight * outputWidth + oy * outputWidth + ox;
                output[outputIndex] = sum;
            }
        }
    }

    return {
        data: output,
        channels: outputChannels,
        height: outputHeight,
        width: outputWidth
    };
}

function adaptiveAvgPool2d(input, channels, inputHeight, inputWidth, outputHeight, outputWidth) {
    var output = new Float32Array(channels * outputHeight * outputWidth),
        channel, oy, ox, yStart, yEnd, xStart, xEnd, y, x, sum, count,
        inputIndex, outputIndex;

    for (channel = 0; channel < channels; ++channel) {
        for (oy = 0; oy < outputHeight; ++oy) {
            yStart = Math.floor(oy * inputHeight / outputHeight);
            yEnd = Math.ceil((oy + 1) * inputHeight / outputHeight);
            for (ox = 0; ox < outputWidth; ++ox) {
                xStart = Math.floor(ox * inputWidth / outputWidth);
                xEnd = Math.ceil((ox + 1) * inputWidth / outputWidth);
                sum = 0;
                count = 0;
                for (y = yStart; y < yEnd; ++y) {
                    for (x = xStart; x < xEnd; ++x) {
                        inputIndex = channel * inputHeight * inputWidth + y * inputWidth + x;
                        sum += input[inputIndex];
                        count++;
                    }
                }
                outputIndex = channel * outputHeight * outputWidth + oy * outputWidth + ox;
                output[outputIndex] = count ? sum / count : 0;
            }
        }
    }

    return output;
}

function linear(input, weight, bias, outputSize, inputSize) {
    var output = new Float32Array(outputSize),
        o, i, sum;

    for (o = 0; o < outputSize; ++o) {
        sum = bias[o];
        for (i = 0; i < inputSize; ++i) {
            sum += input[i] * weight[o * inputSize + i];
        }
        output[o] = sum;
    }

    return output;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function buildStateTensor(x, y, endX, endY, grid, size) {
    var center = Math.floor(size / 2),
        useWholeGrid = grid.width <= size && grid.height <= size,
        offsetX = useWholeGrid ? Math.floor((size - grid.width) / 2) : center - x,
        offsetY = useWholeGrid ? Math.floor((size - grid.height) / 2) : center - y,
        values = new Float32Array(3 * size * size),
        goalVisible = false,
        sx, sy, gx, gy, index, markerX, markerY;

    for (sy = 0; sy < size; ++sy) {
        for (sx = 0; sx < size; ++sx) {
            gx = sx - offsetX;
            gy = sy - offsetY;
            index = sy * size + sx;
            if (!grid.isInside(gx, gy) || !grid.isWalkableAt(gx, gy)) {
                values[index] = 1;
            }
            if (gx === x && gy === y) {
                values[size * size + index] = 1;
            }
            if (gx === endX && gy === endY) {
                values[2 * size * size + index] = 1;
                goalVisible = true;
            }
        }
    }

    if (!goalVisible) {
        markerX = center + clamp(endX - x, -center, center);
        markerY = center + clamp(endY - y, -center, center);
        values[2 * size * size + markerY * size + markerX] = 1;
    }

    return values;
}

function DeepQModel(tensors, options) {
    options = options || {};
    this.tensors = tensors;
    this.stateGridSize = options.stateGridSize || DEFAULT_STATE_GRID_SIZE;
    this.convPadding = options.convPadding;
    if (this.convPadding === undefined) {
        this.convPadding = DEFAULT_CONV_PADDING;
    }
}

DeepQModel.prototype.predictQValues = function(state, context) {
    var size = this.stateGridSize,
        padding = this.convPadding,
        tensors = this.tensors,
        features,
        pooled,
        hidden,
        output;

    context = context || {};
    if (!state) {
        state = buildStateTensor(context.x, context.y, context.endX, context.endY,
            context.grid, size);
    }

    features = conv2d(state, 3, size, size, tensors.conv1Weight, tensors.conv1Bias,
        32, 3, 3, padding);
    reluInPlace(features.data);
    features = conv2d(features.data, 32, features.height, features.width,
        tensors.conv2Weight, tensors.conv2Bias, 64, 3, 3, padding);
    reluInPlace(features.data);
    pooled = adaptiveAvgPool2d(features.data, 64, features.height, features.width,
        DEFAULT_POOL_SIZE, DEFAULT_POOL_SIZE);
    hidden = linear(pooled, tensors.linear1Weight, tensors.linear1Bias, 128, 1024);
    reluInPlace(hidden);
    output = linear(hidden, tensors.linear2Weight, tensors.linear2Bias, 4, 128);

    return Array.prototype.slice.call(output);
};

DeepQModel.fromCheckpointBytesSync = function(bytes, options) {
    return new DeepQModel(tensorsFromZipSync(toUint8Array(bytes)), options);
};

DeepQModel.fromCheckpointBytesAsync = function(bytes, options) {
    return tensorsFromZipAsync(toUint8Array(bytes)).then(function(tensors) {
        return new DeepQModel(tensors, options);
    });
};

function DeepQLearningFinder(options) {
    options = options || {};
    this.modelPath = options.modelPath || DEFAULT_MODEL_PATH;
    this.model = options.model || null;
    this.modelBytes = options.modelBytes || null;
    this.maxExpandedNodes = options.maxExpandedNodes || 0;
    this.distanceWeight = options.distanceWeight;
    if (this.distanceWeight === undefined) {
        this.distanceWeight = DEFAULT_DISTANCE_WEIGHT;
    }
    this.stepWeight = options.stepWeight;
    if (this.stepWeight === undefined) {
        this.stepWeight = DEFAULT_STEP_WEIGHT;
    }
    this.trackDecisions = options.trackDecisions !== false;
    this.stateGridSize = options.stateGridSize || DEFAULT_STATE_GRID_SIZE;
    this.convPadding = options.convPadding;
    if (this.convPadding === undefined) {
        this.convPadding = DEFAULT_CONV_PADDING;
    }
    this.lastRun = null;
}

DeepQLearningFinder.prototype.loadModel = function() {
    var bytes;

    if (this.model) {
        return this.model;
    }
    if (this.modelBytes) {
        if (this.modelBytes && typeof this.modelBytes.then === 'function') {
            throw new Error('DQN modelBytes dang async, hay dung loadModelAsync().');
        }
        if (this.modelBytes && typeof this.modelBytes.arrayBuffer === 'function') {
            throw new Error('DQN model File can load bang loadModelAsync().');
        }
        bytes = toUint8Array(this.modelBytes);
        this.model = DeepQModel.fromCheckpointBytesSync(bytes, {
            stateGridSize: this.stateGridSize,
            convPadding: this.convPadding
        });
        return this.model;
    }
    if (MODEL_CACHE[this.modelPath]) {
        this.model = MODEL_CACHE[this.modelPath];
        return this.model;
    }

    bytes = loadBytesSync(this.modelPath);
    this.model = DeepQModel.fromCheckpointBytesSync(bytes, {
        stateGridSize: this.stateGridSize,
        convPadding: this.convPadding
    });
    MODEL_CACHE[this.modelPath] = this.model;

    return this.model;
};

DeepQLearningFinder.prototype.loadModelAsync = function() {
    var self = this;

    if (this.model) {
        return Promise.resolve(this.model);
    }
    if (this.modelBytes) {
        return loadBytesAsync(this.modelPath, this.modelBytes)
            .then(function(bytes) {
                return DeepQModel.fromCheckpointBytesAsync(bytes, {
                    stateGridSize: self.stateGridSize,
                    convPadding: self.convPadding
                });
            })
            .then(function(model) {
                self.model = model;
                return model;
            });
    }
    if (MODEL_CACHE[this.modelPath]) {
        this.model = MODEL_CACHE[this.modelPath];
        return Promise.resolve(this.model);
    }

    return loadBytesAsync(this.modelPath, this.modelBytes)
        .then(function(bytes) {
            return DeepQModel.fromCheckpointBytesAsync(bytes, {
                stateGridSize: self.stateGridSize,
                convPadding: self.convPadding
            });
        })
        .then(function(model) {
            self.model = model;
            if (!self.modelBytes) {
                MODEL_CACHE[self.modelPath] = model;
            }
            return model;
        });
};

DeepQLearningFinder.prototype.buildState = function(x, y, endX, endY, grid) {
    return buildStateTensor(x, y, endX, endY, grid, this.stateGridSize);
};

DeepQLearningFinder.prototype.getQValues = function(model, x, y, endX, endY, grid) {
    var state = this.buildState(x, y, endX, endY, grid),
        context = {
            x: x,
            y: y,
            endX: endX,
            endY: endY,
            grid: grid
        },
        qValues;

    if (typeof model === 'function') {
        qValues = model(state, context);
    } else if (model && typeof model.predictQValues === 'function') {
        qValues = model.predictQValues(state, context);
    } else if (model && typeof model.predict === 'function') {
        qValues = model.predict(state, context);
    } else {
        throw new Error('DQN model phai co predictQValues(state, context).');
    }

    qValues = Array.prototype.slice.call(qValues || []);
    if (qValues.length < ACTIONS.length) {
        throw new Error('DQN model phai tra ve 4 Q-values.');
    }

    return qValues.map(function(value) {
        return isFiniteNumber(value) ? value : -Infinity;
    });
};

DeepQLearningFinder.prototype.rankActions = function(qValues, x, y, endX, endY) {
    var ranked = ACTIONS.map(function(action, index) {
        return {
            index: index,
            action: action,
            qValue: qValues[index],
            distance: manhattan(x + action.dx, y + action.dy, endX, endY)
        };
    });

    ranked.sort(function(a, b) {
        if (b.qValue !== a.qValue) {
            return b.qValue - a.qValue;
        }
        return a.distance - b.distance;
    });

    return ranked;
};

DeepQLearningFinder.prototype.findPathWithModel = function(startX, startY, endX, endY, grid, model) {
    var maxExpandedNodes = this.maxExpandedNodes || grid.width * grid.height,
        startNode,
        endNode,
        openList,
        run,
        serial = 0,
        expandedNodes = 0,
        node,
        qValues,
        rankedActions,
        ranked,
        action,
        nextX,
        nextY,
        candidateNode,
        neighbor,
        newCost,
        priority,
        path,
        i;

    run = {
        start: [startX, startY],
        end: [endX, endY],
        modelPath: this.modelPath,
        expandedNodes: 0,
        maxExpandedNodes: maxExpandedNodes,
        pathFound: false,
        path: []
    };

    if (!grid.isWalkableAt(startX, startY) || !grid.isWalkableAt(endX, endY)) {
        this.lastRun = cloneRun(run);
        return [];
    }

    startNode = grid.getNodeAt(startX, startY);
    endNode = grid.getNodeAt(endX, endY);
    startNode.dqnCost = 0;
    startNode.opened = true;
    openList = [{
        node: startNode,
        priority: -manhattan(startX, startY, endX, endY),
        serial: serial++
    }];

    while (openList.length && expandedNodes < maxExpandedNodes) {
        openList.sort(function(a, b) {
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            return a.serial - b.serial;
        });

        node = openList.shift().node;
        if (node.closed) {
            continue;
        }

        node.closed = true;
        expandedNodes++;
        if (node === endNode) {
            path = backtrace(endNode);
            run.pathFound = true;
            run.path = clonePath(path);
            run.expandedNodes = expandedNodes;
            this.lastRun = cloneRun(run);
            return path;
        }

        qValues = this.getQValues(model, node.x, node.y, endX, endY, grid);
        rankedActions = this.rankActions(qValues, node.x, node.y, endX, endY);
        for (i = 0; i < rankedActions.length; ++i) {
            ranked = rankedActions[i];
            action = ranked.action;
            nextX = node.x + action.dx;
            nextY = node.y + action.dy;
            candidateNode = grid.isInside(nextX, nextY) ?
                grid.getNodeAt(nextX, nextY) : null;

            if (this.trackDecisions && candidateNode && !candidateNode.closed) {
                candidateNode.tested = true;
            }

            if (!grid.isWalkableAt(nextX, nextY)) {
                continue;
            }

            neighbor = candidateNode;
            if (neighbor.closed) {
                continue;
            }

            newCost = node.dqnCost + 1;
            if (neighbor.opened && newCost >= neighbor.dqnCost) {
                continue;
            }

            neighbor.dqnCost = newCost;
            neighbor.parent = node;
            neighbor.opened = true;
            priority = ranked.qValue -
                this.distanceWeight * ranked.distance -
                this.stepWeight * newCost;
            openList.push({
                node: neighbor,
                priority: priority,
                serial: serial++
            });
        }
    }

    run.expandedNodes = expandedNodes;
    this.lastRun = cloneRun(run);
    return [];
};

DeepQLearningFinder.prototype.findPath = function(startX, startY, endX, endY, grid) {
    var self = this;

    if (this.model || MODEL_CACHE[this.modelPath] || isNodeRuntime()) {
        return this.findPathWithModel(startX, startY, endX, endY, grid, this.loadModel());
    }

    return this.loadModelAsync().then(function(model) {
        return self.findPathWithModel(startX, startY, endX, endY, grid, model);
    });
};

DeepQLearningFinder.prototype.getLastRun = function() {
    return cloneRun(this.lastRun);
};

DeepQLearningFinder.prototype.getStats = function() {
    var run = this.lastRun || {};

    return {
        modelPath: this.modelPath,
        expandedNodes: run.expandedNodes || 0,
        maxExpandedNodes: run.maxExpandedNodes || this.maxExpandedNodes,
        pathFound: !!run.pathFound
    };
};

DeepQLearningFinder.DeepQModel = DeepQModel;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeepQLearningFinder;
}

if (typeof PF !== 'undefined') {
    PF.DeepQLearningFinder = DeepQLearningFinder;
}
if (typeof window !== 'undefined') {
    window.DeepQLearningFinder = DeepQLearningFinder;
}
