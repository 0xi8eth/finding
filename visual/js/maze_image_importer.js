(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.MazeImageImporter = factory(root);
    }
}(this, function(root) {
    var DEFAULT_THRESHOLD = 150;
    var DEFAULT_COVERAGE_THRESHOLD = 0.5;
    var MIN_ALPHA = 16;
    var LINE_GROUP_TOLERANCE = 1;
    var OccupancyScanner = null;

    if (typeof require === 'function') {
        try {
            OccupancyScanner = require('./maze_occupancy_scanner');
        } catch (ignore) {}
    }
    if (!OccupancyScanner && root && root.MazeOccupancyScanner) {
        OccupancyScanner = root.MazeOccupancyScanner;
    }

    function clampThreshold(value) {
        value = parseInt(value, 10);
        if (isNaN(value)) {
            return DEFAULT_THRESHOLD;
        }
        return Math.max(0, Math.min(255, value));
    }

    function clampCoverageThreshold(value) {
        value = parseFloat(value);
        if (isNaN(value)) {
            return DEFAULT_COVERAGE_THRESHOLD;
        }
        return Math.max(0, Math.min(1, value));
    }

    function getPositiveInteger(value) {
        value = parseInt(value, 10);
        return isNaN(value) || value <= 0 ? null : value;
    }

    function getLuminance(r, g, b) {
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function getOptions(options) {
        options = options || {};
        return {
            threshold: clampThreshold(options.threshold),
            darkAsWall: options.darkAsWall !== false,
            thinWalls: options.thinWalls !== false,
            outputWidth: getPositiveInteger(options.outputWidth),
            outputHeight: getPositiveInteger(options.outputHeight),
            coverageThreshold: clampCoverageThreshold(options.coverageThreshold)
        };
    }

    function cloneWallMatrix(matrix) {
        var height = matrix.length,
            width = height ? matrix[0].length : 0,
            clone = new Array(height),
            x, y;

        for (y = 0; y < height; ++y) {
            if (!matrix[y] || matrix[y].length !== width) {
                throw new Error('Invalid matrix');
            }
            clone[y] = new Array(width);
            for (x = 0; x < width; ++x) {
                clone[y][x] = matrix[y][x] ? 1 : 0;
            }
        }

        return clone;
    }

    function createEmptyMatrix(width, height) {
        var matrix = new Array(height),
            x, y;

        for (y = 0; y < height; ++y) {
            matrix[y] = new Array(width);
            for (x = 0; x < width; ++x) {
                matrix[y][x] = 0;
            }
        }

        return matrix;
    }

    function isInside(matrix, x, y) {
        return y >= 0 && y < matrix.length &&
            x >= 0 && matrix.length > 0 && x < matrix[0].length;
    }

    function isWall(matrix, x, y) {
        return isInside(matrix, x, y) && !!matrix[y][x];
    }

    function hasSolidWallBlock(matrix, x, y) {
        var offsets = [
                [-1, -1], [0, -1],
                [-1, 0], [0, 0]
            ],
            i, startX, startY;

        for (i = 0; i < offsets.length; ++i) {
            startX = x + offsets[i][0];
            startY = y + offsets[i][1];
            if (isWall(matrix, startX, startY) &&
                    isWall(matrix, startX + 1, startY) &&
                    isWall(matrix, startX, startY + 1) &&
                    isWall(matrix, startX + 1, startY + 1)) {
                return true;
            }
        }

        return false;
    }

    function getHorizontalRuns(matrix, y) {
        var width = matrix.length ? matrix[0].length : 0,
            runs = [],
            x, start;

        for (x = 0; x < width; ++x) {
            if (!matrix[y][x]) {
                continue;
            }

            start = x;
            while (x + 1 < width && matrix[y][x + 1]) {
                ++x;
            }
            runs.push({
                line: y,
                start: start,
                end: x
            });
        }

        return runs;
    }

    function getVerticalRuns(matrix, x) {
        var height = matrix.length,
            runs = [],
            y, start;

        for (y = 0; y < height; ++y) {
            if (!matrix[y][x]) {
                continue;
            }

            start = y;
            while (y + 1 < height && matrix[y + 1][x]) {
                ++y;
            }
            runs.push({
                line: x,
                start: start,
                end: y
            });
        }

        return runs;
    }

    function createLineGroup(run) {
        return {
            firstLine: run.line,
            lastLine: run.line,
            lastStart: run.start,
            lastEnd: run.end,
            minStart: run.start,
            maxEnd: run.end
        };
    }

    function addRunToLineGroup(group, run) {
        group.lastLine = run.line;
        group.lastStart = run.start;
        group.lastEnd = run.end;
        group.minStart = Math.min(group.minStart, run.start);
        group.maxEnd = Math.max(group.maxEnd, run.end);
    }

    function findMatchingLineGroup(groups, run) {
        var i, group;

        for (i = groups.length - 1; i >= 0; --i) {
            group = groups[i];
            if (group.lastLine !== run.line - 1) {
                continue;
            }
            if (Math.abs(group.lastStart - run.start) <= LINE_GROUP_TOLERANCE &&
                    Math.abs(group.lastEnd - run.end) <= LINE_GROUP_TOLERANCE) {
                return group;
            }
        }

        return null;
    }

    function addHorizontalCenterLines(source, thinned) {
        var groups = [],
            height = source.length,
            y, runs, run, group, i,
            thickness, length, centerY, x;

        for (y = 0; y < height; ++y) {
            runs = getHorizontalRuns(source, y);
            for (i = 0; i < runs.length; ++i) {
                run = runs[i];
                group = findMatchingLineGroup(groups, run);
                if (group) {
                    addRunToLineGroup(group, run);
                } else {
                    groups.push(createLineGroup(run));
                }
            }
        }

        for (i = 0; i < groups.length; ++i) {
            group = groups[i];
            thickness = group.lastLine - group.firstLine + 1;
            length = group.maxEnd - group.minStart + 1;
            if (length <= thickness) {
                continue;
            }

            centerY = Math.floor((group.firstLine + group.lastLine) / 2);
            for (x = group.minStart; x <= group.maxEnd; ++x) {
                thinned[centerY][x] = 1;
            }
        }
    }

    function addVerticalCenterLines(source, thinned) {
        var groups = [],
            width = source.length ? source[0].length : 0,
            x, runs, run, group, i,
            thickness, length, centerX, y;

        for (x = 0; x < width; ++x) {
            runs = getVerticalRuns(source, x);
            for (i = 0; i < runs.length; ++i) {
                run = runs[i];
                group = findMatchingLineGroup(groups, run);
                if (group) {
                    addRunToLineGroup(group, run);
                } else {
                    groups.push(createLineGroup(run));
                }
            }
        }

        for (i = 0; i < groups.length; ++i) {
            group = groups[i];
            thickness = group.lastLine - group.firstLine + 1;
            length = group.maxEnd - group.minStart + 1;
            if (length <= thickness) {
                continue;
            }

            centerX = Math.floor((group.firstLine + group.lastLine) / 2);
            for (y = group.minStart; y <= group.maxEnd; ++y) {
                thinned[y][centerX] = 1;
            }
        }
    }

    function keepAlreadyThinWalls(source, thinned) {
        var height = source.length,
            width = height ? source[0].length : 0,
            x, y;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (source[y][x] && !hasSolidWallBlock(source, x, y)) {
                    thinned[y][x] = 1;
                }
            }
        }
    }

    function ensureWallComponentsRepresented(source, thinned) {
        var height = source.length,
            width = height ? source[0].length : 0,
            visited = createVisitedMatrix(width, height),
            directions = [[1, 0], [-1, 0], [0, 1], [0, -1]],
            x, y, queue, head, cell, nextX, nextY, i,
            minX, maxX, minY, maxY, hasThinnedCell;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (visited[y][x] || !source[y][x]) {
                    continue;
                }

                queue = [[x, y]];
                visited[y][x] = true;
                minX = maxX = x;
                minY = maxY = y;
                hasThinnedCell = !!thinned[y][x];

                for (head = 0; head < queue.length; ++head) {
                    cell = queue[head];
                    minX = Math.min(minX, cell[0]);
                    maxX = Math.max(maxX, cell[0]);
                    minY = Math.min(minY, cell[1]);
                    maxY = Math.max(maxY, cell[1]);
                    hasThinnedCell = hasThinnedCell || !!thinned[cell[1]][cell[0]];

                    for (i = 0; i < directions.length; ++i) {
                        nextX = cell[0] + directions[i][0];
                        nextY = cell[1] + directions[i][1];
                        if (isWall(source, nextX, nextY) &&
                                !visited[nextY][nextX]) {
                            visited[nextY][nextX] = true;
                            queue.push([nextX, nextY]);
                        }
                    }
                }

                if (!hasThinnedCell) {
                    thinned[Math.floor((minY + maxY) / 2)]
                        [Math.floor((minX + maxX) / 2)] = 1;
                }
            }
        }
    }

    function thinWalls(matrix) {
        var source = cloneWallMatrix(matrix),
            height = source.length,
            width = height ? source[0].length : 0,
            thinned = createEmptyMatrix(width, height);

        keepAlreadyThinWalls(source, thinned);
        addHorizontalCenterLines(source, thinned);
        addVerticalCenterLines(source, thinned);
        ensureWallComponentsRepresented(source, thinned);

        return thinned;
    }

    function createVisitedMatrix(width, height) {
        var visited = new Array(height),
            x, y;

        for (y = 0; y < height; ++y) {
            visited[y] = new Array(width);
            for (x = 0; x < width; ++x) {
                visited[y][x] = false;
            }
        }

        return visited;
    }

    function isWalkable(matrix, x, y) {
        return isInside(matrix, x, y) && !matrix[y][x];
    }

    function compareCells(a, b) {
        if (a[1] !== b[1]) {
            return a[1] - b[1];
        }
        return a[0] - b[0];
    }

    function buildCellMask(width, height, cells) {
        var mask = createVisitedMatrix(width, height),
            i, cell;

        for (i = 0; i < cells.length; ++i) {
            cell = cells[i];
            mask[cell[1]][cell[0]] = true;
        }

        return mask;
    }

    function findLargestWalkableComponent(matrix) {
        var height = matrix.length,
            width = height ? matrix[0].length : 0,
            visited = createVisitedMatrix(width, height),
            largest = [],
            directions = [[1, 0], [-1, 0], [0, 1], [0, -1]],
            x, y, queue, head, cell, nextX, nextY, i, component;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (visited[y][x] || !isWalkable(matrix, x, y)) {
                    continue;
                }

                component = [];
                queue = [[x, y]];
                visited[y][x] = true;

                for (head = 0; head < queue.length; ++head) {
                    cell = queue[head];
                    component.push(cell);

                    for (i = 0; i < directions.length; ++i) {
                        nextX = cell[0] + directions[i][0];
                        nextY = cell[1] + directions[i][1];
                        if (isWalkable(matrix, nextX, nextY) &&
                                !visited[nextY][nextX]) {
                            visited[nextY][nextX] = true;
                            queue.push([nextX, nextY]);
                        }
                    }
                }

                if (component.length > largest.length) {
                    largest = component;
                }
            }
        }

        return largest;
    }

    function findFarthestCell(matrix, mask, start) {
        var height = matrix.length,
            width = height ? matrix[0].length : 0,
            visited = createVisitedMatrix(width, height),
            directions = [[1, 0], [-1, 0], [0, 1], [0, -1]],
            queue = [[start[0], start[1], 0]],
            head, cell, nextX, nextY, i,
            farthest = start,
            farthestDistance = 0;

        visited[start[1]][start[0]] = true;

        for (head = 0; head < queue.length; ++head) {
            cell = queue[head];
            if (cell[2] > farthestDistance ||
                    (cell[2] === farthestDistance &&
                    compareCells([cell[0], cell[1]], farthest) > 0)) {
                farthest = [cell[0], cell[1]];
                farthestDistance = cell[2];
            }

            for (i = 0; i < directions.length; ++i) {
                nextX = cell[0] + directions[i][0];
                nextY = cell[1] + directions[i][1];
                if (isInside(matrix, nextX, nextY) &&
                        mask[nextY][nextX] &&
                        !visited[nextY][nextX]) {
                    visited[nextY][nextX] = true;
                    queue.push([nextX, nextY, cell[2] + 1]);
                }
            }
        }

        return farthest;
    }

    function findWalkableEndpoints(matrix) {
        var source = cloneWallMatrix(matrix),
            height = source.length,
            width = height ? source[0].length : 0,
            component = findLargestWalkableComponent(source),
            mask, start, end, temp;

        if (!component.length) {
            return null;
        }

        if (component.length === 1) {
            return {
                start: component[0],
                end: component[0]
            };
        }

        mask = buildCellMask(width, height, component);
        start = findFarthestCell(source, mask, component[0]);
        end = findFarthestCell(source, mask, start);

        if (compareCells(start, end) > 0) {
            temp = start;
            start = end;
            end = temp;
        }

        return {
            start: start,
            end: end
        };
    }

    function getSampleBounds(index, outputSize, sourceSize) {
        var start = Math.floor(index * sourceSize / outputSize),
            end = Math.floor((index + 1) * sourceSize / outputSize);

        if (index === outputSize - 1) {
            end = sourceSize;
        }
        if (end <= start) {
            end = Math.min(sourceSize, start + 1);
        }

        return {
            start: start,
            end: end
        };
    }

    function isWallPixel(data, offset, opts) {
        var luminance;

        if (data[offset + 3] < MIN_ALPHA) {
            return false;
        }

        luminance = getLuminance(data[offset], data[offset + 1], data[offset + 2]);
        return opts.darkAsWall ?
            luminance <= opts.threshold :
            luminance >= opts.threshold;
    }

    function getOccupancyScanner() {
        if (!OccupancyScanner) {
            throw new Error('Maze occupancy scanner is not available');
        }
        return OccupancyScanner;
    }

    function scanImageDataToOccupancyGrid(imageData, options) {
        return getOccupancyScanner().scanImageDataToOccupancyGrid(imageData, options);
    }

    function postProcessOccupancyGrid(matrix, options) {
        return getOccupancyScanner().postProcessOccupancyGrid(matrix, options);
    }

    function imageDataToMatrix(imageData, options) {
        if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
            throw new Error('Invalid image data');
        }

        var opts = getOptions(options),
            width = imageData.width,
            height = imageData.height,
            outputWidth = opts.outputWidth || width,
            outputHeight = opts.outputHeight || height,
            data = imageData.data,
            matrix = new Array(outputHeight),
            x, y, sourceX, sourceY, xBounds, yBounds,
            offset, sampleCount, wallCount, wallRatio;

        for (y = 0; y < outputHeight; ++y) {
            yBounds = getSampleBounds(y, outputHeight, height);
            matrix[y] = new Array(outputWidth);
            for (x = 0; x < outputWidth; ++x) {
                xBounds = getSampleBounds(x, outputWidth, width);
                sampleCount = 0;
                wallCount = 0;

                for (sourceY = yBounds.start; sourceY < yBounds.end; ++sourceY) {
                    for (sourceX = xBounds.start; sourceX < xBounds.end; ++sourceX) {
                        offset = (sourceY * width + sourceX) * 4;
                        if (data[offset + 3] < MIN_ALPHA) {
                            continue;
                        }

                        ++sampleCount;
                        if (isWallPixel(data, offset, opts)) {
                            ++wallCount;
                        }
                    }
                }

                wallRatio = sampleCount ? wallCount / sampleCount : 0;
                matrix[y][x] = wallCount > 0 &&
                    wallRatio >= opts.coverageThreshold ? 1 : 0;
            }
        }

        return opts.thinWalls ? thinWalls(matrix) : matrix;
    }

    return {
        imageDataToMatrix: imageDataToMatrix,
        scanImageDataToOccupancyGrid: scanImageDataToOccupancyGrid,
        postProcessOccupancyGrid: postProcessOccupancyGrid,
        clampThreshold: clampThreshold,
        getLuminance: getLuminance,
        thinWalls: thinWalls,
        findWalkableEndpoints: findWalkableEndpoints
    };
}));
