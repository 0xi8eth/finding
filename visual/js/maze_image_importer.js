(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MazeImageImporter = factory();
    }
}(this, function() {
    var DEFAULT_THRESHOLD = 150;
    var MIN_ALPHA = 16;

    function clampThreshold(value) {
        value = parseInt(value, 10);
        if (isNaN(value)) {
            return DEFAULT_THRESHOLD;
        }
        return Math.max(0, Math.min(255, value));
    }

    function getLuminance(r, g, b) {
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function getOptions(options) {
        options = options || {};
        return {
            threshold: clampThreshold(options.threshold),
            darkAsWall: options.darkAsWall !== false,
            thinWalls: options.thinWalls !== false
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

    function getHorizontalRun(matrix, x, y) {
        var start = x,
            end = x;

        while (isWall(matrix, start - 1, y)) {
            --start;
        }
        while (isWall(matrix, end + 1, y)) {
            ++end;
        }

        return {
            start: start,
            end: end,
            length: end - start + 1,
            center: Math.floor((start + end) / 2)
        };
    }

    function getVerticalRun(matrix, x, y) {
        var start = y,
            end = y;

        while (isWall(matrix, x, start - 1)) {
            --start;
        }
        while (isWall(matrix, x, end + 1)) {
            ++end;
        }

        return {
            start: start,
            end: end,
            length: end - start + 1,
            center: Math.floor((start + end) / 2)
        };
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

    function thinWalls(matrix) {
        var source = cloneWallMatrix(matrix),
            height = source.length,
            width = height ? source[0].length : 0,
            thinned = createEmptyMatrix(width, height),
            x, y, horizontal, vertical, keep;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (!source[y][x]) {
                    continue;
                }

                if (!hasSolidWallBlock(source, x, y)) {
                    thinned[y][x] = 1;
                    continue;
                }

                horizontal = getHorizontalRun(source, x, y);
                vertical = getVerticalRun(source, x, y);
                keep = false;

                if (vertical.length >= horizontal.length &&
                        x === horizontal.center) {
                    keep = true;
                }
                if (horizontal.length >= vertical.length &&
                        y === vertical.center) {
                    keep = true;
                }

                thinned[y][x] = keep ? 1 : 0;
            }
        }

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

    function imageDataToMatrix(imageData, options) {
        if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
            throw new Error('Invalid image data');
        }

        var opts = getOptions(options),
            width = imageData.width,
            height = imageData.height,
            data = imageData.data,
            matrix = new Array(height),
            x, y, offset, alpha, luminance, isWall;

        for (y = 0; y < height; ++y) {
            matrix[y] = new Array(width);
            for (x = 0; x < width; ++x) {
                offset = (y * width + x) * 4;
                alpha = data[offset + 3];

                if (alpha < MIN_ALPHA) {
                    matrix[y][x] = 0;
                    continue;
                }

                luminance = getLuminance(data[offset], data[offset + 1], data[offset + 2]);
                isWall = opts.darkAsWall ?
                    luminance <= opts.threshold :
                    luminance >= opts.threshold;

                matrix[y][x] = isWall ? 1 : 0;
            }
        }

        return opts.thinWalls ? thinWalls(matrix) : matrix;
    }

    return {
        imageDataToMatrix: imageDataToMatrix,
        clampThreshold: clampThreshold,
        getLuminance: getLuminance,
        thinWalls: thinWalls,
        findWalkableEndpoints: findWalkableEndpoints
    };
}));
