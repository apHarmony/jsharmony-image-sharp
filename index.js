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

exports = module.exports = {};

function copyFile(source, target, cb) {
  var cbCalled = false;
  var rd = fs.createReadStream(source);
  rd.on("error", done);
  var wr = fs.createWriteStream(target);
  wr.on("error", done);
  wr.on("close", function (ex) { done(); });
  rd.pipe(wr);
  
  function done(err) {
    if (!cbCalled) { if (typeof err == 'undefined') err = null; cb(err); cbCalled = true; }
  }
};

exports.init = function(callback){
  var img = sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0.5 }
    }
  });
  
  img.toBuffer().then(function(){
    return callback();
  }).catch(function(err){ return callback(err); });
}

exports.driver = function(){
  return sharp;
}

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
        img.toFormat('jpeg', { quality: 90  });
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
    
    img.toFile(dest, function(err){
      if (err) return callback(err);
      return callback(null);
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
}

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
        img.toFormat('jpeg', { quality: 90  });
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
    img.resize(dstWidth, dstHeight, { fit: 'cover' });

    img.toFile(dest, function(err){
      if (err) return callback(err);
      return callback(null);
    });
  }).catch(function(err){ return callback(err); });
}

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
        img.toFormat('jpeg', { quality: 90  });
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

    img.toFile(dest, function(err){
      if (err) return callback(err);
      return callback(null);
    });
  }).catch(function(err){ return callback(err); });
}