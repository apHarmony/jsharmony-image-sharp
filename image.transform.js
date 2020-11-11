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
 * @property {number} x - proportional to image width [0, 1]
 * @property {number} y - proportional to image height [0, 1]
 * @property {number} width - proportional to image width [0, 1]
 * @property {number} height - proportional to image height [0, 1]
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
 * @param {string | undefined} format - specify the output format of the image. If empty, the output
 * @param {TransformOptions} transforms
 * @returns {Promise<sharp.Sharp}>}
 */
exports.transform = function(src, format, transforms) {


  let image = sharp(src);

  return image.metadata().then(metadata => {

    transforms = preprocessTransforms(transforms, metadata);

    if (format === 'png') {
      const pngOptions = { compressionLevel: 9  };
      if(_.includes(['jpeg', 'jpg'], metadata.format)) pngOptions.adaptiveFiltering = true;
      image.toFormat('png', pngOptions);
    } else if (_.includes(['jpeg', 'jpg'], format)) {
      image.toFormat('jpeg', { quality: 90, chromaSubsampling: '4:4:4'  });
      image.flatten({ background:'#ffffff' });
    } else if (_.includes(['tif', 'tiff'], format)) {
      image.toFormat('tiff');
      image.flatten({ background:'#ffffff' });
    } else if (format) {
      image.toFormat(format);
    }

    // Order of operations is very important here.
    // In all cases, order must be consistent, and in
    // some cases, sharp will perform operations
    // in a set order regardless of how they are ordered here.
    // Do not change order without a lot of testing!
    // Also, may need to change preprocessTransforms() function if order changes.


    image = transforms.crop ?
      crop(image, transforms.crop.x, transforms.crop.y, transforms.crop.width, transforms.crop.height) : image;

    image = transforms.resize ? resize(image, transforms.resize.width, transforms.resize.height) : image;

    // Always perform rotation even if rotation is 0!
    // This removes EXIF data.
    image = rotate(image, transforms.rotate || 0);

    image = transforms.flip_horizontal ? flipHorizontal(image) : image;
    image = transforms.flip_vertical ? flipVertical(image) : image;
    image = transforms.sharpen ? sharpen(image, transforms.sharpen) : image;
    image = transforms.levels ? levels(image, transforms.levels.r, transforms.levels.g, transforms.levels.b) : image;
    image = transforms.brightness ? brightness(image, transforms.brightness) : image;
    image = transforms.contrast ? contrast(image, transforms.contrast) : image;
    image = transforms.invert ? image.negate() : image;
    image = transforms.gamma ? gamma(image, transforms.gamma) : image;

    return image;
  });
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
 * @returns {sharp.Sharp}
 */
function  flipHorizontal(image) {
  return image.flop(true);
}

/**
 * @param {sharp.Sharp} image
 * @returns {sharp.Sharp}
 */
function  flipVertical(image) {
  return image.flip(true);
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
 * @returns {sharp.Sharp}
 */
function levels(image, red, green, blue) {

  const hasLevelChange =
      red !== 0 ||
      green !== 0 ||
      blue !== 0;

  if (!hasLevelChange) return image;

  const factors = _.map([
    clamp(red, -1, 1),
    clamp(green, -1, 1),
    clamp(blue, -1, 1)
  ], factor => {
    if (factor < 0) {
      return 1 + factor;
    }
    return 1 + factor * 5;
  });

  const levelMatrix = [
    [factors[0], 0, 0],
    [0, factors[1], 0],
    [0, 0, factors[2]]
  ];

  image.recomb(levelMatrix);
  return image;
}

/**
 * @param {TransformOptions} transforms
 * @param {sharp.Metadata} metadata
 * @returns {TransformOptions}
 */
function preprocessTransforms(transforms, metadata) {

  // No mutating!
  transforms = _.extend({}, transforms);

  if (transforms.flip_horizontal && transforms.flip_vertical) {
    const rotation = transforms.rotate || 0;
    transforms.rotate = (rotation + 180) % 360;
    transforms.flip_horizontal = false;
    transforms.flip_vertical = false;
  }

  const isSideways = transforms.rotate === 90 || transforms.rotate === 270;
  if (isSideways && transforms.resize) {
    // No mutating!
    transforms.resize = _.extend({}, transforms.resize);
    const tempHeight = transforms.resize.height;
    transforms.resize.height = transforms.resize.width;
    transforms.resize.width = tempHeight;
  }

  if (isSideways) {
    const tempFlipHorizontal = transforms.flip_horizontal;
    transforms.flip_horizontal = transforms.flip_vertical;
    transforms.flip_vertical = tempFlipHorizontal;
  }

  if (transforms.crop) {
    const validCrop =
      // Validate height
      transforms.crop.height > 0 &&
      (transforms.crop.height + transforms.crop.y) <= 1 &&
      // Validate width
      transforms.crop.width > 0 &&
      (transforms.crop.width + transforms.crop.x) <= 1
      // Validate x, y
      transforms.crop.x > 0 &&
      transforms.crop.x <= 1 &&
      transforms.crop.y > 0 &&
      transforms.crop.y <= 1;

    if (validCrop) {
      // No mutating!
      transforms.crop = _.extend({}, transforms.crop);
      transforms.crop.height = Math.round(metadata.height * transforms.crop.height);
      transforms.crop.width = Math.round(metadata.width * transforms.crop.width);
      transforms.crop.x = Math.round(metadata.width * transforms.crop.x);
      transforms.crop.y = Math.round(metadata.height * transforms.crop.y);
    } else {
      delete transforms.crop;
    }
  }

  return transforms;
}

/**
 * @param {sharp.Sharp} image
 * @param {number} width
 * @param {number} height
 * @returns {sharp.Sharp}
 */
function resize(image, width, height) {
  width = width || undefined;
  height = height || undefined;
  if (!width && !height) {
    return image;
  }
  return image.resize(width, height, { fit: (!width || !height) ? 'contain' : 'fill' });
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
 * @returns {sharp.Sharp}
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