/*
Copyright 2020 apHarmony

This file is part of jsHarmony.

jsHarmony is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

jsHarmony is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with this package.  If not, see <http://www.gnu.org/licenses/>.
*/
const sharp = require('sharp');
const _ = require('lodash');

/**
 * @typedef {object} TransformOptions
 * @property {(TransformCropOptions | undefined)} crop
 * @property {(TransformResizeOptions | undefined)} resize
 * @property {(TransformLevelsOptions | undefined)} levels
 * @property {(boolean | undefined)} flip_horizontal
 * @property {(boolean | undefined)} flip_vertical
 * @property {(number | undefined)} rotate - 0, 90, 180, 270
 * @property {(number | undefined)} sharpen - -1...1
 * @property {(number | undefined)} brightness - -1...1
 * @property {(number | undefined)} contrast - -1...1
 * @property {(number | undefined)} gamma - -1...1
 * @property {(boolean | undefined)} invert
 */

/**
 * @typedef {object} TransformCropOptions
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} TransformResizeOptions
 * @property {(number | undefined)} height
 * @property {(number | undefined)} width
 */

/**
 * @typedef {object} TransformLevelsOptions
 * @property {(number | undefined)} r - -1...1
 * @property {(number | undefined)} g - -1...1
 * @property {(number | undefined)} b - -1...1
 */


/**
 * @param {string} src
 * @param {TransformOptions} transforms
 * @returns {Promise<{sharp: sharp.Sharp, format: string}>}
 */
exports.transform = function(src, transforms) {

  // No mutating!
  transforms = _.extend({}, transforms);

  /** @type {sharp.Metadata} */
  let metadata = undefined;

  // Order of operations is very important here.
  // In all cases, order must be consistent, and in
  // some cases, sharp will perform operations
  // in a set order regardless of how they are ordered here.
  // Do not change order without a lot of testing!
  const inputImage = sharp(src);
  return inputImage.metadata().then(data => {
    metadata = data;
    return toRaw(inputImage);
  })
  .then(image => {
    return transforms.crop ?
      crop(image, transforms.crop.x, transforms.crop.y, transforms.crop.width, transforms.crop.height) : image;
  })
  .then(image => transforms.resize ? resize(image, transforms.resize.width, transforms.resize.height) : image)
  // Flipping and rotation HAS to be done in a very specific way.
  // This is a case where sharp will override order.
  // This also needs to match the expected behavior in the client.
  // Be very careful here and test rotation/flipping a lot (in the client) if
  // you change this.
  .then(image => transforms.flip_horizontal ? flipHorizontal(image) : image)
  .then(image => transforms.flip_vertical ? flipVertical(image) : image)
  .then(image => transforms.rotate ? rotate(image, transforms.rotate) : image)
  .then(image => transforms.levels ? levels(image, transforms.levels.r, transforms.levels.g, transforms.levels.b) : image)
  .then(image => {
    image = transforms.invert ? image.negate() : image;
    image = transforms.brightness ? brightness(image, transforms.brightness) : image;
    image = transforms.contrast ? contrast(image, transforms.contrast) : image;
    image = transforms.gamma ? gamma(image, transforms.gamma) : image;
    image = transforms.sharpen ? sharpen(image, transforms.sharpen) : image;

    return {
      format: metadata.format,
      sharp: image.toFormat(metadata.format)
    };
  });
}

/**
 * @param {sharp.Sharp} image
 * @returns {Promise<sharp.Sharp>}
 */
function apply(image) {
  return toRaw(image);
}

/**
 * @param {sharp.Sharp} image
 * @param {number} brightness - -1...1
 * @returns {sharp.Sharp}
 */
function brightness(image, brightness) {
  let brightnessFactor = 1;
  brightness = clamp(brightness, -1, 1);
  if (brightness> 0) {
    brightnessFactor = 1 + brightness * 9
  } else {
    brightnessFactor = (10 - (1 + Math.abs(brightness) * 9)) / 10
  }

  return image.modulate({ brightness: brightnessFactor});
}

/**
 * @params {number} value
 * @params {number} min
 * @params {number} max
 * @returns {number} a value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * @param {sharp.Sharp} image
 * @param {number} contrast - -1...1
 * @returns {sharp.Sharp}
 */
function contrast(image, contrast) {
  let slope = 0;
  contrast = clamp(contrast, -1, 1);
  if (contrast >= 0) {
    slope = 1 + contrast * 3;
  } else {
    slope = 1 + contrast;
  }
  return image.linear(slope, 0);
}

/**
 * @param {sharp.Sharp} image
 * @param {number} left - starting point; zero-indexed offset from left image
 * @param {number} top - starting point; zero-indexed offset from top image
 * @param {number} width
 * @param {number} height
 * @returns {sharp.Sharp}
 */
function crop(image, left, top, width, height) {
  return image.extract({ left, top, width, height });
}

/**
 * @param {sharp.Sharp} image
 * @returns {Promise<sharp.Sharp>}
 */
function  flipHorizontal(image) {
  return apply(image.flop());
}

/**
 * @param {sharp.Sharp} image
 * @returns {Promise<sharp.Sharp>}
 */
function  flipVertical(image) {
  return apply(image.flip());
}

/**
 * @param {sharp.Sharp} image
 * @param {number} gamma - -1...1
 * @returns {sharp.Sharp}
 */
function gamma(image, gamma) {
  const range = 2;
  gamma = 1 + (1 + clamp(gamma, -1, 1)) / 2 * range;
  return image.gamma(gamma);
}

/**
 * @param {sharp.Sharp} image
 * @param {number} red - -1...1
 * @param {number} green - -1...1
 * @param {number} blue - -1...1
 * @returns {Promise<sharp.Sharp>}
 */
function levels(image, red, green, blue) {

  const hasLevelChange =
      red !== 0 ||
      green !== 0 ||
      blue !== 0;

  if (!hasLevelChange) return image;

  return image.raw().toBuffer({ resolveWithObject: true }).then(result => {
    if (result.info.channels == 3) {
      // Order must match rgb channel order!
      const factors = [
        clamp(red, -1, 1) + 1,
        clamp(green, -1, 1) + 1,
        clamp(blue, -1, 1) + 1
      ];

      for (let i = 0; i < result.data.length; i++) {
        const channel = i % result.info.channels;
        if (channel < 3) {
          result.data[i] = Math.min(255, result.data[i] * factors[channel]);
        }
      }
    }

    return sharp(result.data, {
      raw: {
        channels: result.info.channels,
        height: result.info.height,
        width: result.info.width,
      }
    })
  });
}

/**
 * @param {sharp.Sharp} image
 * @param {number} width
 * @param {number} height
 * @returns {Promise<sharp.Sharp>}
 */
function resize(image, width, height) {
  width = width || undefined;
  height = height || undefined;
  if (!width && !height) {
    return Promise.resolve(image);
  }
  return apply(image.resize(width, height, { fit: (!width || !height) ? 'contain' : 'fill' }));
}

/**
 * @param {sharp.Sharp} image
 * @param {number} angle - 0, 90, 180, 270
 * @returns {sharp.Sharp}
 */
function rotate(image, angle) {
  return image.rotate(angle);
}

/**
 * @param {sharp.Sharp} image
 * @param {number} sharpness - -1...1
 * @returns {Promise<sharp.Sharp>}
 */
function sharpen(image, sharpness) {
  let sharpenFactor = 0;
  sharpness = clamp(sharpness, -1, 1);
  if (sharpness > 0) {
    sharpenFactor = sharpness * 20;
    return image.sharpen(1, sharpenFactor, sharpenFactor);
  } else {
    sharpenFactor = 0.3 + Math.abs(sharpness) * 5;
    return image.blur(sharpenFactor);
  }
}

/**
 * @param {sharp.Sharp} image
 * @returns {Promise<sharp.Sharp>}
 */
function toRaw(image) {
  return image.raw().toBuffer({ resolveWithObject: true }).then(result => {
    return sharp(result.data, {
      raw: {
        channels: result.info.channels,
        height: result.info.height,
        width: result.info.width
      }
    });
  });
}
