(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MazeOccupancyScanner = factory();
    }
}(this, function() {
    var DEFAULT_THRESHOLD = 150;
    var DEFAULT_WALL_THRESHOLD = 0.45;
    var DEFAULT_MIN_GRID_CELLS = 5;
    var DEFAULT_MAX_GRID_CELLS = 96;
    var DEFAULT_MIN_CELL_SIZE = 3;
    var DEFAULT_CLOSE_ITERATIONS = 1;
    var DEFAULT_OPEN_MIN_AREA = 3;
    var MIN_ALPHA = 16;

    function getLuminance(r, g, b) {
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function clampThreshold(value) {
        value = parseInt(value, 10);
        if (isNaN(value)) {
            return DEFAULT_THRESHOLD;
        }
        return Math.max(0, Math.min(255, value));
    }

    function getPositiveInteger(value) {
        value = parseInt(value, 10);
        return isNaN(value) || value <= 0 ? null : value;
    }

    function getNonNegativeInteger(value, fallback) {
        value = parseInt(value, 10);
        if (isNaN(value) || value < 0) {
            return fallback;
        }
        return value;
    }

    function clampRatio(value, fallback, min, max) {
        value = parseFloat(value);
        if (isNaN(value)) {
            return fallback;
        }
        return Math.max(min, Math.min(max, value));
    }

    function getOptions(options) {
        options = options || {};
        return {
            darkAsWall: options.darkAsWall !== false,
            pixelThreshold: options.pixelThreshold === undefined ?
                null : clampThreshold(options.pixelThreshold),
            wallThreshold: clampRatio(
                options.wallThreshold,
                DEFAULT_WALL_THRESHOLD,
                0.05,
                0.95
            ),
            minCellSize: getPositiveInteger(options.minCellSize),
            maxCellSize: getPositiveInteger(options.maxCellSize),
            minGridCells: getPositiveInteger(options.minGridCells) ||
                DEFAULT_MIN_GRID_CELLS,
            maxGridCells: getPositiveInteger(options.maxGridCells) ||
                DEFAULT_MAX_GRID_CELLS,
            closeIterations: getNonNegativeInteger(
                options.closeIterations,
                DEFAULT_CLOSE_ITERATIONS
            ),
            openMinArea: getNonNegativeInteger(
                options.openMinArea,
                DEFAULT_OPEN_MIN_AREA
            ),
            postProcess: options.postProcess !== false
        };
    }

    function createNumberBuffer(length) {
        var buffer = new Array(length),
            i;

        for (i = 0; i < length; ++i) {
            buffer[i] = 0;
        }

        return buffer;
    }

    function createRgbaBuffer(length) {
        if (typeof Uint8ClampedArray !== 'undefined') {
            return new Uint8ClampedArray(length);
        }
        return createNumberBuffer(length);
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

    function cloneWallMatrix(matrix) {
        var height = matrix.length,
            width = height ? matrix[0].length : 0,
            clone = createEmptyMatrix(width, height),
            x, y;

        for (y = 0; y < height; ++y) {
            if (!matrix[y] || matrix[y].length !== width) {
                throw new Error('Invalid matrix');
            }
            for (x = 0; x < width; ++x) {
                clone[y][x] = matrix[y][x] ? 1 : 0;
            }
        }

        return clone;
    }

    function isInside(matrix, x, y) {
        return y >= 0 && y < matrix.length &&
            x >= 0 && matrix.length > 0 && x < matrix[0].length;
    }

    function isWall(matrix, x, y) {
        return isInside(matrix, x, y) && !!matrix[y][x];
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

    function imageDataToGrayscale(imageData) {
        var width = imageData.width,
            height = imageData.height,
            data = imageData.data,
            grayscale = createNumberBuffer(width * height),
            x, y, index, offset;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                index = y * width + x;
                offset = index * 4;
                grayscale[index] = data[offset + 3] < MIN_ALPHA ?
                    255 :
                    Math.round(getLuminance(
                        data[offset],
                        data[offset + 1],
                        data[offset + 2]
                    ));
            }
        }

        return grayscale;
    }

    function getOtsuThreshold(grayscale) {
        var histogram = createNumberBuffer(256),
            total = grayscale.length,
            sum = 0,
            sumBackground = 0,
            weightBackground = 0,
            maxVariance = -1,
            threshold = DEFAULT_THRESHOLD,
            i, value, weightForeground,
            meanBackground, meanForeground, variance;

        for (i = 0; i < total; ++i) {
            value = Math.max(0, Math.min(255, grayscale[i]));
            histogram[value] += 1;
            sum += value;
        }

        for (i = 0; i < 256; ++i) {
            weightBackground += histogram[i];
            if (!weightBackground) {
                continue;
            }

            weightForeground = total - weightBackground;
            if (!weightForeground) {
                break;
            }

            sumBackground += i * histogram[i];
            meanBackground = sumBackground / weightBackground;
            meanForeground = (sum - sumBackground) / weightForeground;
            variance = weightBackground * weightForeground *
                Math.pow(meanBackground - meanForeground, 2);

            if (variance > maxVariance) {
                maxVariance = variance;
                threshold = i;
            }
        }

        return threshold;
    }

    function thresholdGrayscale(grayscale, threshold, darkAsWall) {
        var mask = createNumberBuffer(grayscale.length),
            i;

        for (i = 0; i < grayscale.length; ++i) {
            mask[i] = darkAsWall ?
                (grayscale[i] <= threshold ? 1 : 0) :
                (grayscale[i] >= threshold ? 1 : 0);
        }

        return mask;
    }

    function getMaskValue(mask, width, height, x, y, outsideValue) {
        if (x < 0 || y < 0 || x >= width || y >= height) {
            return outsideValue ? 1 : 0;
        }
        return mask[y * width + x] ? 1 : 0;
    }

    function dilateMask(mask, width, height) {
        var output = createNumberBuffer(width * height),
            x, y, index;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                index = y * width + x;
                output[index] =
                    getMaskValue(mask, width, height, x, y, 0) ||
                    getMaskValue(mask, width, height, x - 1, y, 0) ||
                    getMaskValue(mask, width, height, x + 1, y, 0) ||
                    getMaskValue(mask, width, height, x, y - 1, 0) ||
                    getMaskValue(mask, width, height, x, y + 1, 0) ? 1 : 0;
            }
        }

        return output;
    }

    function erodeMask(mask, width, height) {
        var output = createNumberBuffer(width * height),
            x, y, index;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                index = y * width + x;
                output[index] =
                    getMaskValue(mask, width, height, x, y, 1) &&
                    getMaskValue(mask, width, height, x - 1, y, 1) &&
                    getMaskValue(mask, width, height, x + 1, y, 1) &&
                    getMaskValue(mask, width, height, x, y - 1, 1) &&
                    getMaskValue(mask, width, height, x, y + 1, 1) ? 1 : 0;
            }
        }

        return output;
    }

    function closeMask(mask, width, height, iterations) {
        var output = mask,
            i;

        for (i = 0; i < iterations; ++i) {
            output = erodeMask(dilateMask(output, width, height), width, height);
        }

        return output;
    }

    function removeSmallMaskComponents(mask, width, height, minArea) {
        var output = mask.slice(0),
            visited = createVisitedMatrix(width, height),
            directions = [[1, 0], [-1, 0], [0, 1], [0, -1]],
            x, y, queue, head, cell, nextX, nextY, i, component;

        if (!minArea) {
            return output;
        }

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (visited[y][x] || !output[y * width + x]) {
                    continue;
                }

                queue = [[x, y]];
                component = [];
                visited[y][x] = true;

                for (head = 0; head < queue.length; ++head) {
                    cell = queue[head];
                    component.push(cell);

                    for (i = 0; i < directions.length; ++i) {
                        nextX = cell[0] + directions[i][0];
                        nextY = cell[1] + directions[i][1];
                        if (nextX >= 0 && nextY >= 0 &&
                                nextX < width && nextY < height &&
                                !visited[nextY][nextX] &&
                                output[nextY * width + nextX]) {
                            visited[nextY][nextX] = true;
                            queue.push([nextX, nextY]);
                        }
                    }
                }

                if (component.length < minArea) {
                    for (i = 0; i < component.length; ++i) {
                        cell = component[i];
                        output[cell[1] * width + cell[0]] = 0;
                    }
                }
            }
        }

        return output;
    }

    function cleanWallMask(mask, width, height, opts) {
        var cleaned = closeMask(mask, width, height, opts.closeIterations);
        return removeSmallMaskComponents(cleaned, width, height, opts.openMinArea);
    }

    function findMaskBoundingBox(mask, width, height) {
        var minX = width,
            minY = height,
            maxX = -1,
            maxY = -1,
            x, y;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (!mask[y * width + x]) {
                    continue;
                }
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }

        if (maxX < minX || maxY < minY) {
            return null;
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
        };
    }

    function cropMask(mask, sourceWidth, bbox) {
        var cropped = createNumberBuffer(bbox.width * bbox.height),
            x, y;

        for (y = 0; y < bbox.height; ++y) {
            for (x = 0; x < bbox.width; ++x) {
                cropped[y * bbox.width + x] =
                    mask[(bbox.y + y) * sourceWidth + bbox.x + x] ? 1 : 0;
            }
        }

        return cropped;
    }

    function cropImageData(imageData, bbox) {
        var data = imageData.data,
            width = imageData.width,
            cropped = createRgbaBuffer(bbox.width * bbox.height * 4),
            sourceOffset, targetOffset, x, y;

        for (y = 0; y < bbox.height; ++y) {
            for (x = 0; x < bbox.width; ++x) {
                sourceOffset = ((bbox.y + y) * width + bbox.x + x) * 4;
                targetOffset = (y * bbox.width + x) * 4;
                cropped[targetOffset] = data[sourceOffset];
                cropped[targetOffset + 1] = data[sourceOffset + 1];
                cropped[targetOffset + 2] = data[sourceOffset + 2];
                cropped[targetOffset + 3] = data[sourceOffset + 3];
            }
        }

        return {
            width: bbox.width,
            height: bbox.height,
            data: cropped
        };
    }

    function buildIntegralImage(mask, width, height) {
        var stride = width + 1,
            integral = createNumberBuffer((width + 1) * (height + 1)),
            x, y, rowSum, index;

        for (y = 1; y <= height; ++y) {
            rowSum = 0;
            for (x = 1; x <= width; ++x) {
                rowSum += mask[(y - 1) * width + x - 1] ? 1 : 0;
                index = y * stride + x;
                integral[index] = integral[index - stride] + rowSum;
            }
        }

        return {
            width: width,
            height: height,
            stride: stride,
            data: integral
        };
    }

    function sumIntegralRect(integral, x0, y0, x1, y1) {
        var width = integral.width,
            height = integral.height,
            stride = integral.stride,
            data = integral.data;

        x0 = Math.max(0, Math.min(width, x0));
        y0 = Math.max(0, Math.min(height, y0));
        x1 = Math.max(0, Math.min(width, x1));
        y1 = Math.max(0, Math.min(height, y1));

        if (x1 <= x0 || y1 <= y0) {
            return 0;
        }

        return data[y1 * stride + x1] -
            data[y0 * stride + x1] -
            data[y1 * stride + x0] +
            data[y0 * stride + x0];
    }

    function getGridCellCount(sourceSize, cellSize, offset) {
        return Math.max(1, Math.ceil((sourceSize + offset) / cellSize));
    }

    function getCandidateCellStats(integral, cellSize, offsetX, offsetY, opts) {
        var cols = getGridCellCount(integral.width, cellSize, offsetX),
            rows = getGridCellCount(integral.height, cellSize, offsetY),
            ratios = new Array(rows),
            matrix = new Array(rows),
            wallCount = 0,
            confidence = 0,
            coverage = 0,
            x, y, x0, y0, x1, y1, clippedX0, clippedY0,
            clippedX1, clippedY1, area, fullArea, blackCount, ratio,
            isWallCell, wallConfidence;

        fullArea = cellSize * cellSize;
        for (y = 0; y < rows; ++y) {
            ratios[y] = new Array(cols);
            matrix[y] = new Array(cols);
            y0 = y * cellSize - offsetY;
            y1 = y0 + cellSize;
            clippedY0 = Math.max(0, y0);
            clippedY1 = Math.min(integral.height, y1);

            for (x = 0; x < cols; ++x) {
                x0 = x * cellSize - offsetX;
                x1 = x0 + cellSize;
                clippedX0 = Math.max(0, x0);
                clippedX1 = Math.min(integral.width, x1);
                area = Math.max(0, clippedX1 - clippedX0) *
                    Math.max(0, clippedY1 - clippedY0);
                blackCount = sumIntegralRect(
                    integral,
                    clippedX0,
                    clippedY0,
                    clippedX1,
                    clippedY1
                );
                ratio = area ? blackCount / area : 0;
                isWallCell = ratio >= opts.wallThreshold;
                wallConfidence = isWallCell ?
                    (ratio - opts.wallThreshold) / (1 - opts.wallThreshold) :
                    (opts.wallThreshold - ratio) / opts.wallThreshold;

                ratios[y][x] = ratio;
                matrix[y][x] = isWallCell ? 1 : 0;
                wallCount += isWallCell ? 1 : 0;
                confidence += Math.max(0, Math.min(1, wallConfidence));
                coverage += fullArea ? area / fullArea : 0;
            }
        }

        return {
            cols: cols,
            rows: rows,
            ratios: ratios,
            matrix: matrix,
            wallCount: wallCount,
            confidence: confidence / (cols * rows),
            coverage: coverage / (cols * rows)
        };
    }

    function countSolidBlocks(matrix, value) {
        var height = matrix.length,
            width = height ? matrix[0].length : 0,
            count = 0,
            x, y;

        for (y = 0; y < height - 1; ++y) {
            for (x = 0; x < width - 1; ++x) {
                if (matrix[y][x] === value &&
                        matrix[y][x + 1] === value &&
                        matrix[y + 1][x] === value &&
                        matrix[y + 1][x + 1] === value) {
                    count += 1;
                }
            }
        }

        return count;
    }

    function getWallContinuity(matrix) {
        var height = matrix.length,
            width = height ? matrix[0].length : 0,
            wallCount = 0,
            connectedCount = 0,
            x, y;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (!matrix[y][x]) {
                    continue;
                }
                wallCount += 1;
                if (isWall(matrix, x - 1, y) ||
                        isWall(matrix, x + 1, y) ||
                        isWall(matrix, x, y - 1) ||
                        isWall(matrix, x, y + 1)) {
                    connectedCount += 1;
                }
            }
        }

        return wallCount ? connectedCount / wallCount : 0;
    }

    function scoreGridCandidate(stats, cellSize, maxCellSize) {
        var total = stats.cols * stats.rows,
            density = total ? stats.wallCount / total : 0,
            possibleBlocks = Math.max(1, (stats.cols - 1) * (stats.rows - 1)),
            wallBlockRatio = countSolidBlocks(stats.matrix, 1) / possibleBlocks,
            wideWalkableRatio = countSolidBlocks(stats.matrix, 0) / possibleBlocks,
            continuity = getWallContinuity(stats.matrix),
            densityPenalty = 0,
            sizeBonus = Math.log(cellSize + 1) / Math.log(maxCellSize + 1);

        if (!stats.wallCount || stats.wallCount === total) {
            return -Infinity;
        }
        if (density < 0.08) {
            densityPenalty = (0.08 - density) * 4;
        } else if (density > 0.75) {
            densityPenalty = (density - 0.75) * 3;
        }

        return stats.confidence +
            continuity * 0.12 +
            sizeBonus * 0.18 -
            wideWalkableRatio * 2.4 -
            wallBlockRatio * 0.25 -
            densityPenalty -
            (1 - stats.coverage) * 0.2;
    }

    function getOffsetStep(cellSize) {
        return Math.max(1, Math.floor(cellSize / 8));
    }

    function estimateGrid(mask, width, height, opts) {
        var integral = buildIntegralImage(mask, width, height),
            minSide = Math.max(1, Math.min(width, height)),
            minCellSize = opts.minCellSize ||
                Math.max(DEFAULT_MIN_CELL_SIZE, Math.floor(minSide / opts.maxGridCells)),
            maxCellSize = opts.maxCellSize ||
                Math.max(minCellSize, Math.floor(minSide / opts.minGridCells)),
            best = null,
            cellSize, offsetX, offsetY, offsetStep,
            stats, score;

        maxCellSize = Math.max(minCellSize, maxCellSize);

        for (cellSize = minCellSize; cellSize <= maxCellSize; ++cellSize) {
            offsetStep = getOffsetStep(cellSize);
            for (offsetY = 0; offsetY < cellSize; offsetY += offsetStep) {
                for (offsetX = 0; offsetX < cellSize; offsetX += offsetStep) {
                    stats = getCandidateCellStats(
                        integral,
                        cellSize,
                        offsetX,
                        offsetY,
                        opts
                    );
                    if (stats.cols < 2 || stats.rows < 2) {
                        continue;
                    }

                    score = scoreGridCandidate(stats, cellSize, maxCellSize);
                    if (!best || score > best.score) {
                        best = {
                            score: score,
                            cellSize: cellSize,
                            offsetX: offsetX,
                            offsetY: offsetY,
                            cols: stats.cols,
                            rows: stats.rows,
                            ratios: stats.ratios,
                            matrix: stats.matrix
                        };
                    }
                }
            }
        }

        if (!best) {
            stats = getCandidateCellStats(integral, minCellSize, 0, 0, opts);
            best = {
                score: 0,
                cellSize: minCellSize,
                offsetX: 0,
                offsetY: 0,
                cols: stats.cols,
                rows: stats.rows,
                ratios: stats.ratios,
                matrix: stats.matrix
            };
        }

        return best;
    }

    function fillOneCellWallGaps(matrix) {
        var source = cloneWallMatrix(matrix),
            output = cloneWallMatrix(matrix),
            height = source.length,
            width = height ? source[0].length : 0,
            x, y, horizontalGap, verticalGap;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (source[y][x]) {
                    continue;
                }

                horizontalGap = isWall(source, x - 1, y) &&
                    isWall(source, x + 1, y) &&
                    (isWall(source, x - 2, y) || isWall(source, x + 2, y));
                verticalGap = isWall(source, x, y - 1) &&
                    isWall(source, x, y + 1) &&
                    (isWall(source, x, y - 2) || isWall(source, x, y + 2));

                if (horizontalGap || verticalGap) {
                    output[y][x] = 1;
                }
            }
        }

        return output;
    }

    function removeIsolatedWallCells(matrix) {
        var source = cloneWallMatrix(matrix),
            output = cloneWallMatrix(matrix),
            height = source.length,
            width = height ? source[0].length : 0,
            x, y;

        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                if (!source[y][x]) {
                    continue;
                }

                if (!isWall(source, x - 1, y) &&
                        !isWall(source, x + 1, y) &&
                        !isWall(source, x, y - 1) &&
                        !isWall(source, x, y + 1)) {
                    output[y][x] = 0;
                }
            }
        }

        return output;
    }

    function postProcessOccupancyGrid(matrix) {
        return removeIsolatedWallCells(fillOneCellWallGaps(matrix));
    }

    function buildEmptyScanResult(threshold, opts) {
        var matrix = [[0]];

        return {
            matrix: matrix,
            ratios: [[0]],
            metadata: {
                cropBox: { x: 0, y: 0, width: 0, height: 0 },
                threshold: threshold,
                cellSize: 1,
                offsetX: 0,
                offsetY: 0,
                wallThreshold: opts.wallThreshold,
                rows: 1,
                cols: 1
            },
            debug: {
                crop: { width: 0, height: 0, data: createRgbaBuffer(0) },
                thresholdMask: { width: 0, height: 0, data: [] },
                cleanMask: { width: 0, height: 0, data: [] },
                ratios: [[0]],
                occupancy: matrix
            }
        };
    }

    function scanImageDataToOccupancyGrid(imageData, options) {
        if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
            throw new Error('Invalid image data');
        }

        var opts = getOptions(options),
            width = imageData.width,
            height = imageData.height,
            grayscale = imageDataToGrayscale(imageData),
            threshold = opts.pixelThreshold === null ?
                getOtsuThreshold(grayscale) :
                opts.pixelThreshold,
            thresholdMask = thresholdGrayscale(grayscale, threshold, opts.darkAsWall),
            cleanMask = cleanWallMask(thresholdMask, width, height, opts),
            bbox = findMaskBoundingBox(cleanMask, width, height),
            croppedImage, croppedThresholdMask, croppedCleanMask,
            estimate, matrix;

        if (!bbox) {
            return buildEmptyScanResult(threshold, opts);
        }

        croppedImage = cropImageData(imageData, bbox);
        croppedThresholdMask = cropMask(thresholdMask, width, bbox);
        croppedCleanMask = cropMask(cleanMask, width, bbox);
        estimate = estimateGrid(
            croppedCleanMask,
            bbox.width,
            bbox.height,
            opts
        );
        matrix = opts.postProcess ?
            postProcessOccupancyGrid(estimate.matrix) :
            cloneWallMatrix(estimate.matrix);

        return {
            matrix: matrix,
            rawMatrix: cloneWallMatrix(estimate.matrix),
            ratios: estimate.ratios,
            metadata: {
                cropBox: bbox,
                threshold: threshold,
                cellSize: estimate.cellSize,
                offsetX: estimate.offsetX,
                offsetY: estimate.offsetY,
                wallThreshold: opts.wallThreshold,
                rows: matrix.length,
                cols: matrix.length ? matrix[0].length : 0,
                score: estimate.score
            },
            debug: {
                crop: croppedImage,
                thresholdMask: {
                    width: bbox.width,
                    height: bbox.height,
                    data: croppedThresholdMask
                },
                cleanMask: {
                    width: bbox.width,
                    height: bbox.height,
                    data: croppedCleanMask
                },
                ratios: estimate.ratios,
                occupancy: matrix
            }
        };
    }

    return {
        scanImageDataToOccupancyGrid: scanImageDataToOccupancyGrid,
        postProcessOccupancyGrid: postProcessOccupancyGrid
    };
}));
