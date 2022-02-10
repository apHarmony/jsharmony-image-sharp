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

var _ = require('lodash');
var fs = require('fs');
var sharp = require('sharp');
sharp.cache(false);

exports = module.exports = {};

exports.type = 'jsharmony-image-sharp';

function copyFile(source, target, cb) {
  var cbCalled = false;
  var rd = fs.createReadStream(source);
  rd.on('error', done);
  var wr = fs.createWriteStream(target);
  wr.on('error', done);
  wr.on('close', function (ex) { done(); });
  rd.pipe(wr);
  
  function done(err) {
    if (!cbCalled) { if (typeof err == 'undefined') err = null; cb(err); cbCalled = true; }
  }
}

function execif(cond, apply, f){
  if (cond) apply(f);
  else f();
}

exports.init = function(callback){
  var img = sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0.5 }
    }
  });
  
  img.toBuffer().then(function(buffer){})
    .catch(function(err){ return callback(err);})
    .finally(function(){ return callback(); });
};

exports.driver = function(){
  return sharp;
};

exports.getDriver = function(cb){
  return cb(null, exports.driver());
};

exports.resample = function(src, dest, format, callback){
  var img = sharp(src);

  img.metadata().then(function(info){
    if(!info) return callback();

    var srcformat = (info && info.format || '').toString().toLowerCase();

    if(srcformat=='svg'){
      if((srcformat=='svg') && (!format || (format == 'svg'))){
        //Return input file
        if(src==dest) callback(null);
        else copyFile(src, dest, callback);
        return;
      }
    }

    if(srcformat=='gif'){
      if((srcformat=='gif') && (!format || (format == 'gif'))){
        //Return input file
        if(src==dest) callback(null);
        else copyFile(src, dest, callback);
        return;
      }
    }

    if (format) {
      if(format=='png'){
        var pngOptions = { compressionLevel: 9  };
        if(_.includes(['jpeg', 'jpg'], srcformat)) pngOptions.adaptiveFiltering = true;
        img.toFormat('png', pngOptions);
      }
      else if(_.includes(['jpeg', 'jpg'], format)){
        img.toFormat('jpeg', { quality: 90, chromaSubsampling: '4:4:4'  });
        img.flatten({ background:'#ffffff' });
      }
      else if(_.includes(['tif', 'tiff'], format)){
        img.toFormat('tiff');
        img.flatten({ background:'#ffffff' });
      }
      else img.toFormat(format);
    }
    else format = srcformat;
    img.rotate();
    
    img.toBuffer(function(err, buffer) {
      if (err) return callback(err);
      fs.writeFile(dest, buffer, function(err) {
        return callback(err);
      });
    });
  }).catch(function(err){ return callback(err); });
};

exports.size = function(src, callback){
  var img = sharp(src);

  img.metadata().then(function(info){
    if(!info) return callback();
    return callback(null, {
      width: info.width,
      height: info.height,
    });
  }).catch(function(err){ return callback(err); });
};

exports.crop = function(src, dest, destsize, format, callback){
  var img = sharp(src);

  img.metadata().then(function(info){
    var srcformat = (info && info.format || '').toString().toLowerCase();

    if (format) {
      if(format=='png'){
        var pngOptions = { compressionLevel: 9  };
        if(_.includes(['jpeg', 'jpg'], srcformat)) pngOptions.adaptiveFiltering = true;
        img.toFormat('png', pngOptions);
      }
      else if(_.includes(['jpeg', 'jpg'], format)){
        img.toFormat('jpeg', { quality: 90, chromaSubsampling: '4:4:4'  });
        img.flatten({ background:'#ffffff' });
      }
      else if(_.includes(['tif', 'tiff'], format)){
        img.toFormat('tiff');
        img.flatten({ background:'#ffffff' });
      }
      else img.toFormat(format);
    }
    else format = srcformat;
    img.rotate();
    
    var dstWidth = destsize[0];
    var dstHeight = destsize[1];
    var dstParams = {
      resize: true,
      x: 0,
      y: 0,
      trim: false,
    };
    if(destsize.length > 2) dstParams = _.extend(dstParams, destsize[2]);

    dstParams.x = dstParams.x || 0;
    dstParams.y = dstParams.y || 0;
    dstWidth = dstWidth || (info.width - dstParams.x);
    dstHeight = dstHeight || (info.height - dstParams.y);

    if(dstParams.resize) img.resize(dstWidth, dstHeight, { fit: 'cover' });
    else {
      img.extract({
        left: dstParams.x,
        top: dstParams.y,
        width: dstWidth,
        height: dstHeight
      });
    }

    img.toBuffer(function(err, buffer) {
      if (err) return callback(err);

      execif(dstParams.trim,
        function(f){
          img = sharp(buffer);
          img.trim();
          img.toBuffer().then(function(_buffer) {
            buffer = _buffer;
            f();
          }).catch(function(err){ return callback(err); });
        },
        function(){
          fs.writeFile(dest, buffer, function(err) {
            return callback(err);
          });
        }
      );
    });
  }).catch(function(err){ return callback(err); });
};

exports.resize = function(src, dest, destsize, format, callback){
  var imgoptions = {};
  if ((destsize.length >= 3) && destsize[2]) imgoptions = destsize[2];

  var img = sharp(src);

  img.metadata().then(function(info){
    var srcformat = (info && info.format || '').toString().toLowerCase();

    if(srcformat=='svg'){
      if((srcformat=='svg') && (!format || (format == 'svg'))){
        if(!imgoptions || !imgoptions.extend){
          //Return input file
          if(src==dest) callback(null);
          else copyFile(src, dest, callback);
          return;
        }
      }
    }

    if (format) {
      if(format=='png'){
        var pngOptions = { compressionLevel: 9  };
        if(_.includes(['jpeg', 'jpg'], srcformat)) pngOptions.adaptiveFiltering = true;
        img.toFormat('png', pngOptions);
      }
      else if(_.includes(['jpeg', 'jpg'], format)){
        img.toFormat('jpeg', { quality: 90, chromaSubsampling: '4:4:4'  });
        img.flatten({ background:'#ffffff' });
      }
      else if(_.includes(['tif', 'tiff'], format)){
        img.toFormat('tiff');
        img.flatten({ background:'#ffffff' });
      }
      else img.toFormat(format);
    }
    else format = srcformat;
    img.rotate();
    
    var resizeOptions = {};

    var dstWidth = destsize[0];
    var dstHeight = destsize[1];
    var noresize = false;
    var bgcolor = {r:255,g:255,b:255,alpha:0};
    if(_.includes(['jpeg', 'jpg', 'tif', 'tiff'], format)) bgcolor = {r:255,g:255,b:255,alpha:1};
    if (imgoptions.upsize && imgoptions.extend) resizeOptions = { fit: 'contain', background: bgcolor };
    else if (imgoptions.upsize) resizeOptions = { fit: 'inside' };
    else if (imgoptions.extend){
      if(info && ((info.width <= dstWidth) && (info.height <= dstHeight))){
        noresize = true;
        var diffHeight = dstHeight - info.height;
        var diffWidth = dstWidth - info.width;

        img.extend({
          top: Math.floor(diffHeight / 2),
          bottom: Math.ceil(diffHeight / 2),
          left: Math.floor(diffWidth / 2),
          right: Math.ceil(diffWidth / 2),
          background:bgcolor
        });
      }
      else resizeOptions = { fit: 'contain', background:bgcolor };
    }
    else resizeOptions = { fit: 'inside', withoutEnlargement: true };

    if(!noresize) img.resize(dstWidth, dstHeight, resizeOptions);

    img.toBuffer(function(err, buffer) {
      if (err) return callback(err);
      fs.writeFile(dest, buffer, function(err) {
        return callback(err);
      });
    });
  }).catch(function(err){ return callback(err); });
};

exports.compare = function(src1, src2, options, callback /* (err, isEqual, equality) */){
  options = _.extend({
    diff: null,
    tolerance: 0.05,
  }, options);

  /*
  1. difference
  2. >>> recomb
     >>> threshold
   
 
      <r g b>
 
       a b c
      <d e f>
       g h i
 
      <r*a + g*d + b*g, r*b + g*e + b*h, r*c + g*f + b*i>
 
       1 0 0
      <1 0 0>
       1 0 0
 
  3. over or add
  4. Use stats to get average or total of channel
  */
  
  return callback(new Error('jsharmony-image-sharp compare is not implemented'));
};