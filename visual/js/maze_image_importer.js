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
            darkAsWall: options.darkAsWall !== false
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

        return matrix;
    }

    return {
        imageDataToMatrix: imageDataToMatrix,
        clampThreshold: clampThreshold,
        getLuminance: getLuminance
    };
}));
