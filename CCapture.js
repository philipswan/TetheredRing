
  "use strict";
  
  var isNodeEnviroment = typeof module !== 'undefined' && typeof module.exports !== 'undefined';
  
  var Tar = isNodeEnviroment ? require('./tar') : window.Tar;
  var download = isNodeEnviroment ? require('./download') : window.download;
  var GIF = isNodeEnviroment ? require('./gif').GIF : window.GIF;
  var WebMWriter = isNodeEnviroment ? require('./webm-writer-0.2.0') : window.WebMWriter;
  
  var objectTypes = {
  'function': true,
  'object': true
  };
  
  function checkGlobal(value) {
      return (value && value.Object === Object) ? value : null;
    }
  
  /** Built-in method references without a dependency on `root`. */
  var freeParseFloat = parseFloat,
    freeParseInt = parseInt;
  
  /** Detect free variable `exports`. */
  var freeExports = (objectTypes[typeof exports] && exports && !exports.nodeType)
  ? exports
  : undefined;
  
  /** Detect free variable `module`. */
  var freeModule = (objectTypes[typeof module] && module && !module.nodeType)
  ? module
  : undefined;
  
  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = (freeModule && freeModule.exports === freeExports)
  ? freeExports
  : undefined;
  
  /** Detect free variable `global` from Node.js. */
  var freeGlobal = checkGlobal(freeExports && freeModule && typeof global == 'object' && global);
  
  /** Detect free variable `self`. */
  var freeSelf = checkGlobal(objectTypes[typeof self] && self);
  
  /** Detect free variable `window`. */
  var freeWindow = checkGlobal(objectTypes[typeof window] && window);
  
  /** Detect `this` as the global object. */
  var thisGlobal = checkGlobal(objectTypes[typeof this] && this);
  
  /**
  * Used as a reference to the global object.
  *
  * The `this` value is used if it's the global object to avoid Greasemonkey's
  * restricted `window` object, otherwise the `window` object is used.
  */
  var root = freeGlobal ||
  ((freeWindow !== (thisGlobal && thisGlobal.window)) && freeWindow) ||
    freeSelf || thisGlobal || Function('return this')();
  
  if( !('gc' in window ) ) {
    window.gc = function(){}
  }
  
  if (!HTMLCanvasElement.prototype.toBlob) {
   Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: function (callback, type, quality) {
  
      var binStr = atob( this.toDataURL(type, quality).split(',')[1] ),
          len = binStr.length,
          arr = new Uint8Array(len);
  
      for (var i=0; i<len; i++ ) {
       arr[i] = binStr.charCodeAt(i);
      }
  
      callback( new Blob( [arr], {type: type || 'image/png'} ) );
    }
   });
  }
  
  // @license http://opensource.org/licenses/MIT
  // copyright Paul Irish 2015
  
  
  // Date.now() is supported everywhere except IE8. For IE8 we use the Date.now polyfill
  //   github.com/Financial-Times/polyfill-service/blob/master/polyfills/Date.now/polyfill.js
  // as Safari 6 doesn't have support for NavigationTiming, we use a Date.now() timestamp for relative values
  
  // if you want values similar to what you'd get with real perf.now, place this towards the head of the page
  // but in reality, you're just getting the delta between now() calls, so it's not terribly important where it's placed
  
  
  (function(){
  
    if ("performance" in window == false) {
        window.performance = {};
    }
  
    Date.now = (Date.now || function () {  // thanks IE8
      return new Date().getTime();
    });
  
    if ("now" in window.performance == false){
  
      var nowOffset = Date.now();
  
      if (performance.timing && performance.timing.navigationStart){
        nowOffset = performance.timing.navigationStart
      }
  
      window.performance.now = function now(){
        return Date.now() - nowOffset;
      }
    }
  
  })();
  
  
  function pad( n ) {
    return String("0000000" + n).slice(-7);
  }
  // https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Timers
  
  var g_startTime = window.Date.now();
  
  function guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }
  
  function CCFrameEncoder( settings ) {
  
    var _handlers = {};
  
    this.settings = settings;
  
    this.on = function(event, handler) {
  
      _handlers[event] = handler;
  
    };
  
    this.emit = function(event) {
  
      var handler = _handlers[event];
      if (handler) {
  
        handler.apply(null, Array.prototype.slice.call(arguments, 1));
  
      }
  
    };
  
    this.filename = settings.name || guid();
    this.extension = '';
    this.mimeType = '';
  
  }
  
  CCFrameEncoder.prototype.start = function(){};
  CCFrameEncoder.prototype.stop = function(){};
  CCFrameEncoder.prototype.add = function(){};
  CCFrameEncoder.prototype.save = function(){};
  CCFrameEncoder.prototype.dispose = function(){};
  CCFrameEncoder.prototype.safeToProceed = function(){ return true; };
  CCFrameEncoder.prototype.step = function() { console.log( 'Step not set!' ) }
  
  function CCTarEncoder( settings ) {
  
    CCFrameEncoder.call( this, settings );
  
    this.extension = '.tar'
    this.mimeType = 'application/x-tar'
    this.fileExtension = '';
    this.baseFilename = this.filename;
  
    this.tape = null
    this.count = 0;
    this.part = 1;
    this.frames = 0;
  
  }
  
  CCTarEncoder.prototype = Object.create( CCFrameEncoder.prototype );
  
  CCTarEncoder.prototype.start = function(){
  
    this.dispose();
  
  };
  
  CCTarEncoder.prototype.add = function( blob ) {
  
    var fileReader = new FileReader();
    fileReader.onload = function() {
      this.tape.append( pad( this.count ) + this.fileExtension, new Uint8Array( fileReader.result ) );
  
      if( this.settings.autoSaveTime > 0 && ( this.frames / this.settings.framerate ) >= this.settings.autoSaveTime ) {
        this.save( function( blob ) {
          this.filename = this.baseFilename + '-part-' + pad( this.part );
          download( blob, this.filename + this.extension, this.mimeType );
          var count = this.count;
          this.dispose();
          this.count = count+1;
          this.part++;
          this.filename = this.baseFilename + '-part-' + pad( this.part );
          this.frames = 0;
          this.step();
        }.bind( this ) )
      } else {
        this.count++;
        this.frames++;
        this.step();
      }
  
    }.bind( this );
    fileReader.readAsArrayBuffer(blob);
  
  }
  
  CCTarEncoder.prototype.save = function( callback ) {
  
    callback( this.tape.save() );
  
  }
  
  CCTarEncoder.prototype.dispose = function() {
  
    this.tape = new Tar();
    this.count = 0;
  
  }
  
  function CCPNGEncoder( settings ) {
  
    CCTarEncoder.call( this, settings );
  
    this.type = 'image/png';
    this.fileExtension = '.png';
  
  }
  
  CCPNGEncoder.prototype = Object.create( CCTarEncoder.prototype );
  
  CCPNGEncoder.prototype.add = function( canvas ) {
  
    canvas.toBlob( function( blob ) {
      CCTarEncoder.prototype.add.call( this, blob );
    }.bind( this ), this.type )
  
  }
  
  function CCJPEGEncoder( settings ) {
  
    CCTarEncoder.call( this, settings );
  
    this.type = 'image/jpeg';
    this.fileExtension = '.jpg';
    this.quality = ( settings.quality / 100 ) || .8;
  
  }
  
  CCJPEGEncoder.prototype = Object.create( CCTarEncoder.prototype );
  
  CCJPEGEncoder.prototype.add = function( canvas ) {
  
    canvas.toBlob( function( blob ) {
      CCTarEncoder.prototype.add.call( this, blob );
    }.bind( this ), this.type, this.quality )
  
  }
  
  /*
  
    WebM Encoder
  
  */
  
  function CCWebMEncoder( settings ) {
  
    var canvas = document.createElement( 'canvas' );
    if( canvas.toDataURL( 'image/webp' ).substr(5,10) !== 'image/webp' ){
      console.log( "WebP not supported - try another export format" )
    }
  
    CCFrameEncoder.call( this, settings );
  
    this.quality = ( settings.quality / 100 ) || .8;
  
    this.extension = '.webm'
    this.mimeType = 'video/webm'
    this.baseFilename = this.filename;
    this.framerate = settings.framerate;
  
    this.frames = 0;
    this.part = 1;
  
    this.videoWriter = new WebMWriter({
      quality: this.quality,
      fileWriter: null,
      fd: null,
      frameRate: this.framerate
    });
  
  }
  
  CCWebMEncoder.prototype = Object.create( CCFrameEncoder.prototype );
  
  CCWebMEncoder.prototype.start = function( canvas ) {
  
    this.dispose();
  
  }
  
  CCWebMEncoder.prototype.add = function( canvas ) {
  
    this.videoWriter.addFrame(canvas);
  
    if( this.settings.autoSaveTime > 0 && ( this.frames / this.settings.framerate ) >= this.settings.autoSaveTime ) {
      this.save( function( blob ) {
        this.filename = this.baseFilename + '-part-' + pad( this.part );
        download( blob, this.filename + this.extension, this.mimeType );
        this.dispose();
        this.part++;
        this.filename = this.baseFilename + '-part-' + pad( this.part );
        this.step();
      }.bind( this ) )
    } else {
      this.frames++;
      this.step();
    }
  
  }
  
  CCWebMEncoder.prototype.save = function( callback ) {
  
    this.videoWriter.complete().then(callback);
  
  }
  
  CCWebMEncoder.prototype.dispose = function( canvas ) {
  
    this.frames = 0;
    this.videoWriter = new WebMWriter({
      quality: this.quality,
      fileWriter: null,
      fd: null,
      frameRate: this.framerate
    });
  
  }
  
  function CCFFMpegServerEncoder( settings ) {
  
    CCFrameEncoder.call( this, settings );
  
    settings.quality = ( settings.quality / 100 ) || .8;
  
    this.encoder = new FFMpegServer.Video( settings );
      this.encoder.on( 'process', function() {
          this.emit( 'process' )
      }.bind( this ) );
      this.encoder.on('finished', function( url, size ) {
          var cb = this.callback;
          if ( cb ) {
              this.callback = undefined;
              cb( url, size );
          }
      }.bind( this ) );
      this.encoder.on( 'progress', function( progress ) {
          if ( this.settings.onProgress ) {
              this.settings.onProgress( progress )
          }
      }.bind( this ) );
      this.encoder.on( 'error', function( data ) {
          alert(JSON.stringify(data, null, 2));
      }.bind( this ) );
  
  }
  
  CCFFMpegServerEncoder.prototype = Object.create( CCFrameEncoder.prototype );
  
  CCFFMpegServerEncoder.prototype.start = function() {
  
    this.encoder.start( this.settings );
  
  };
  
  CCFFMpegServerEncoder.prototype.add = function( canvas ) {
  
    this.encoder.add( canvas );
  
  }
  
  CCFFMpegServerEncoder.prototype.save = function( callback ) {
  
      this.callback = callback;
      this.encoder.end();
  
  }
  
  CCFFMpegServerEncoder.prototype.safeToProceed = function() {
      return this.encoder.safeToProceed();
  };
  
  /*
    HTMLCanvasElement.captureStream()
  */
  
  function CCStreamEncoder( settings ) {
  
    CCFrameEncoder.call( this, settings );
  
    this.framerate = this.settings.framerate;
    this.type = 'video/webm';
    this.extension = '.webm';
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  
  }
  
  CCStreamEncoder.prototype = Object.create( CCFrameEncoder.prototype );
  
  CCStreamEncoder.prototype.add = function( canvas ) {
  
    if( !this.stream ) {
      this.stream = canvas.captureStream( this.framerate );
      this.mediaRecorder = new MediaRecorder( this.stream );
      this.mediaRecorder.start();
  
      this.mediaRecorder.ondataavailable = function(e) {
        this.chunks.push(e.data);
      }.bind( this );
  
    }
    this.step();
  
  }
  
  CCStreamEncoder.prototype.save = function( callback ) {
  
    this.mediaRecorder.onstop = function( e ) {
      var blob = new Blob( this.chunks, { 'type' : 'video/webm' });
      this.chunks = [];
      callback( blob );
  
    }.bind( this );
  
    this.mediaRecorder.stop();
  
  }
  
  function CCGIFEncoder( settings ) {
    CCFrameEncoder.call( this, settings );
  
    settings.quality = 31 - ( ( settings.quality * 30 / 100 ) || 10 );
    settings.workers = settings.workers || 4;
  
    this.extension = '.gif'
    this.mimeType = 'image/gif'
  
      this.canvas = document.createElement( 'canvas' );
      this.ctx = this.canvas.getContext( '2d' );
      this.sizeSet = false;
  
    var gifWorkerText = "(function(b){function a(b,d){if({}.hasOwnProperty.call(a.cache,b))return a.cache[b];var e=a.resolve(b);if(!e)throw new Error('Failed to resolve module '+b);var c={id:b,require:a,filename:b,exports:{},loaded:!1,parent:d,children:[]};d&&d.children.push(c);var f=b.slice(0,b.lastIndexOf('/')+1);return a.cache[b]=c.exports,e.call(c.exports,c,c.exports,f,b),c.loaded=!0,a.cache[b]=c.exports}a.modules={},a.cache={},a.resolve=function(b){return{}.hasOwnProperty.call(a.modules,b)?a.modules[b]:void 0},a.define=function(b,c){a.modules[b]=c},a.define('/gif.worker.coffee',function(d,e,f,g){var b,c;b=a('/GIFEncoder.js',d),c=function(a){var c,e,d,f;return c=new b(a.width,a.height),a.index===0?c.writeHeader():c.firstFrame=!1,c.setTransparent(a.transparent),c.setRepeat(a.repeat),c.setDelay(a.delay),c.setQuality(a.quality),c.addFrame(a.data),a.last&&c.finish(),d=c.stream(),a.data=d.pages,a.cursor=d.cursor,a.pageSize=d.constructor.pageSize,a.canTransfer?(f=function(c){for(var b=0,d=a.data.length;b<d;++b)e=a.data[b],c.push(e.buffer);return c}.call(this,[]),self.postMessage(a,f)):self.postMessage(a)},self.onmessage=function(a){return c(a.data)}}),a.define('/GIFEncoder.js',function(e,h,i,j){function c(){this.page=-1,this.pages=[],this.newPage()}function b(a,b){this.width=~~a,this.height=~~b,this.transparent=null,this.transIndex=0,this.repeat=-1,this.delay=0,this.image=null,this.pixels=null,this.indexedPixels=null,this.colorDepth=null,this.colorTab=null,this.usedEntry=new Array,this.palSize=7,this.dispose=-1,this.firstFrame=!0,this.sample=10,this.out=new c}var f=a('/TypedNeuQuant.js',e),g=a('/LZWEncoder.js',e);c.pageSize=4096,c.charMap={};for(var d=0;d<256;d++)c.charMap[d]=String.fromCharCode(d);c.prototype.newPage=function(){this.pages[++this.page]=new Uint8Array(c.pageSize),this.cursor=0},c.prototype.getData=function(){var d='';for(var a=0;a<this.pages.length;a++)for(var b=0;b<c.pageSize;b++)d+=c.charMap[this.pages[a][b]];return d},c.prototype.writeByte=function(a){this.cursor>=c.pageSize&&this.newPage(),this.pages[this.page][this.cursor++]=a},c.prototype.writeUTFBytes=function(b){for(var c=b.length,a=0;a<c;a++)this.writeByte(b.charCodeAt(a))},c.prototype.writeBytes=function(b,d,e){for(var c=e||b.length,a=d||0;a<c;a++)this.writeByte(b[a])},b.prototype.setDelay=function(a){this.delay=Math.round(a/10)},b.prototype.setFrameRate=function(a){this.delay=Math.round(100/a)},b.prototype.setDispose=function(a){a>=0&&(this.dispose=a)},b.prototype.setRepeat=function(a){this.repeat=a},b.prototype.setTransparent=function(a){this.transparent=a},b.prototype.addFrame=function(a){this.image=a,this.getImagePixels(),this.analyzePixels(),this.firstFrame&&(this.writeLSD(),this.writePalette(),this.repeat>=0&&this.writeNetscapeExt()),this.writeGraphicCtrlExt(),this.writeImageDesc(),this.firstFrame||this.writePalette(),this.writePixels(),this.firstFrame=!1},b.prototype.finish=function(){this.out.writeByte(59)},b.prototype.setQuality=function(a){a<1&&(a=1),this.sample=a},b.prototype.writeHeader=function(){this.out.writeUTFBytes('GIF89a')},b.prototype.analyzePixels=function(){var g=this.pixels.length,d=g/3;this.indexedPixels=new Uint8Array(d);var a=new f(this.pixels,this.sample);a.buildColormap(),this.colorTab=a.getColormap();var b=0;for(var c=0;c<d;c++){var e=a.lookupRGB(this.pixels[b++]&255,this.pixels[b++]&255,this.pixels[b++]&255);this.usedEntry[e]=!0,this.indexedPixels[c]=e}this.pixels=null,this.colorDepth=8,this.palSize=7,this.transparent!==null&&(this.transIndex=this.findClosest(this.transparent))},b.prototype.findClosest=function(e){if(this.colorTab===null)return-1;var k=(e&16711680)>>16,l=(e&65280)>>8,m=e&255,c=0,d=16777216,j=this.colorTab.length;for(var a=0;a<j;){var f=k-(this.colorTab[a++]&255),g=l-(this.colorTab[a++]&255),h=m-(this.colorTab[a]&255),i=f*f+g*g+h*h,b=parseInt(a/3);this.usedEntry[b]&&i<d&&(d=i,c=b),a++}return c},b.prototype.getImagePixels=function(){var a=this.width,g=this.height;this.pixels=new Uint8Array(a*g*3);var b=this.image,c=0;for(var d=0;d<g;d++)for(var e=0;e<a;e++){var f=d*a*4+e*4;this.pixels[c++]=b[f],this.pixels[c++]=b[f+1],this.pixels[c++]=b[f+2]}},b.prototype.writeGraphicCtrlExt=function(){this.out.writeByte(33),this.out.writeByte(249),this.out.writeByte(4);var b,a;this.transparent===null?(b=0,a=0):(b=1,a=2),this.dispose>=0&&(a=dispose&7),a<<=2,this.out.writeByte(0|a|0|b),this.writeShort(this.delay),this.out.writeByte(this.transIndex),this.out.writeByte(0)},b.prototype.writeImageDesc=function(){this.out.writeByte(44),this.writeShort(0),this.writeShort(0),this.writeShort(this.width),this.writeShort(this.height),this.firstFrame?this.out.writeByte(0):this.out.writeByte(128|this.palSize)},b.prototype.writeLSD=function(){this.writeShort(this.width),this.writeShort(this.height),this.out.writeByte(240|this.palSize),this.out.writeByte(0),this.out.writeByte(0)},b.prototype.writeNetscapeExt=function(){this.out.writeByte(33),this.out.writeByte(255),this.out.writeByte(11),this.out.writeUTFBytes('NETSCAPE2.0'),this.out.writeByte(3),this.out.writeByte(1),this.writeShort(this.repeat),this.out.writeByte(0)},b.prototype.writePalette=function(){this.out.writeBytes(this.colorTab);var b=768-this.colorTab.length;for(var a=0;a<b;a++)this.out.writeByte(0)},b.prototype.writeShort=function(a){this.out.writeByte(a&255),this.out.writeByte(a>>8&255)},b.prototype.writePixels=function(){var a=new g(this.width,this.height,this.indexedPixels,this.colorDepth);a.encode(this.out)},b.prototype.stream=function(){return this.out},e.exports=b}),a.define('/LZWEncoder.js',function(e,g,h,i){function f(y,D,C,B){function w(a,b){r[f++]=a,f>=254&&t(b)}function x(b){u(a),k=i+2,j=!0,l(i,b)}function u(b){for(var a=0;a<b;++a)h[a]=-1}function A(z,r){var g,t,d,e,y,w,s;for(q=z,j=!1,n_bits=q,m=p(n_bits),i=1<<z-1,o=i+1,k=i+2,f=0,e=v(),s=0,g=a;g<65536;g*=2)++s;s=8-s,w=a,u(w),l(i,r);a:while((t=v())!=c){if(g=(t<<b)+e,d=t<<s^e,h[d]===g){e=n[d];continue}if(h[d]>=0){y=w-d,d===0&&(y=1);do if((d-=y)<0&&(d+=w),h[d]===g){e=n[d];continue a}while(h[d]>=0)}l(e,r),e=t,k<1<<b?(n[d]=k++,h[d]=g):x(r)}l(e,r),l(o,r)}function z(a){a.writeByte(s),remaining=y*D,curPixel=0,A(s+1,a),a.writeByte(0)}function t(a){f>0&&(a.writeByte(f),a.writeBytes(r,0,f),f=0)}function p(a){return(1<<a)-1}function v(){if(remaining===0)return c;--remaining;var a=C[curPixel++];return a&255}function l(a,c){g&=d[e],e>0?g|=a<<e:g=a,e+=n_bits;while(e>=8)w(g&255,c),g>>=8,e-=8;if((k>m||j)&&(j?(m=p(n_bits=q),j=!1):(++n_bits,n_bits==b?m=1<<b:m=p(n_bits))),a==o){while(e>0)w(g&255,c),g>>=8,e-=8;t(c)}}var s=Math.max(2,B),r=new Uint8Array(256),h=new Int32Array(a),n=new Int32Array(a),g,e=0,f,k=0,m,j=!1,q,i,o;this.encode=z}var c=-1,b=12,a=5003,d=[0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535];e.exports=f}),a.define('/TypedNeuQuant.js',function(A,F,E,D){function C(A,B){function I(){o=[],q=new Int32Array(256),t=new Int32Array(a),y=new Int32Array(a),z=new Int32Array(a>>3);var c,d;for(c=0;c<a;c++)d=(c<<b+8)/a,o[c]=new Float64Array([d,d,d,0]),y[c]=e/a,t[c]=0}function J(){for(var c=0;c<a;c++)o[c][0]>>=b,o[c][1]>>=b,o[c][2]>>=b,o[c][3]=c}function K(b,a,c,e,f){o[a][0]-=b*(o[a][0]-c)/d,o[a][1]-=b*(o[a][1]-e)/d,o[a][2]-=b*(o[a][2]-f)/d}function L(j,e,n,l,k){var h=Math.abs(e-j),i=Math.min(e+j,a),g=e+1,f=e-1,m=1,b,d;while(g<i||f>h)d=z[m++],g<i&&(b=o[g++],b[0]-=d*(b[0]-n)/c,b[1]-=d*(b[1]-l)/c,b[2]-=d*(b[2]-k)/c),f>h&&(b=o[f--],b[0]-=d*(b[0]-n)/c,b[1]-=d*(b[1]-l)/c,b[2]-=d*(b[2]-k)/c)}function C(p,s,q){var h=2147483647,k=h,d=-1,m=d,c,j,e,n,l;for(c=0;c<a;c++)j=o[c],e=Math.abs(j[0]-p)+Math.abs(j[1]-s)+Math.abs(j[2]-q),e<h&&(h=e,d=c),n=e-(t[c]>>i-b),n<k&&(k=n,m=c),l=y[c]>>g,y[c]-=l,t[c]+=l<<f;return y[d]+=x,t[d]-=r,m}function D(){var d,b,e,c,h,g,f=0,i=0;for(d=0;d<a;d++){for(e=o[d],h=d,g=e[1],b=d+1;b<a;b++)c=o[b],c[1]<g&&(h=b,g=c[1]);if(c=o[h],d!=h&&(b=c[0],c[0]=e[0],e[0]=b,b=c[1],c[1]=e[1],e[1]=b,b=c[2],c[2]=e[2],e[2]=b,b=c[3],c[3]=e[3],e[3]=b),g!=f){for(q[f]=i+d>>1,b=f+1;b<g;b++)q[b]=d;f=g,i=d}}for(q[f]=i+n>>1,b=f+1;b<256;b++)q[b]=n}function E(j,i,k){var b,d,c,e=1e3,h=-1,f=q[i],g=f-1;while(f<a||g>=0)f<a&&(d=o[f],c=d[1]-i,c>=e?f=a:(f++,c<0&&(c=-c),b=d[0]-j,b<0&&(b=-b),c+=b,c<e&&(b=d[2]-k,b<0&&(b=-b),c+=b,c<e&&(e=c,h=d[3])))),g>=0&&(d=o[g],c=i-d[1],c>=e?g=-1:(g--,c<0&&(c=-c),b=d[0]-j,b<0&&(b=-b),c+=b,c<e&&(b=d[2]-k,b<0&&(b=-b),c+=b,c<e&&(e=c,h=d[3]))));return h}function F(){var c,f=A.length,D=30+(B-1)/3,y=f/(3*B),q=~~(y/w),n=d,o=u,a=o>>h;for(a<=1&&(a=0),c=0;c<a;c++)z[c]=n*((a*a-c*c)*m/(a*a));var i;f<s?(B=1,i=3):f%l!==0?i=3*l:f%k!==0?i=3*k:f%p!==0?i=3*p:i=3*j;var r,t,x,e,g=0;c=0;while(c<y)if(r=(A[g]&255)<<b,t=(A[g+1]&255)<<b,x=(A[g+2]&255)<<b,e=C(r,t,x),K(n,e,r,t,x),a!==0&&L(a,e,r,t,x),g+=i,g>=f&&(g-=f),c++,q===0&&(q=1),c%q===0)for(n-=n/D,o-=o/v,a=o>>h,a<=1&&(a=0),e=0;e<a;e++)z[e]=n*((a*a-e*e)*m/(a*a))}function G(){I(),F(),J(),D()}function H(){var b=[],g=[];for(var c=0;c<a;c++)g[o[c][3]]=c;var d=0;for(var e=0;e<a;e++){var f=g[e];b[d++]=o[f][0],b[d++]=o[f][1],b[d++]=o[f][2]}return b}var o,q,t,y,z;this.buildColormap=G,this.getColormap=H,this.lookupRGB=E}var w=100,a=256,n=a-1,b=4,i=16,e=1<<i,f=10,B=1<<f,g=10,x=e>>g,r=e<<f-g,z=a>>3,h=6,t=1<<h,u=z*t,v=30,o=10,d=1<<o,q=8,m=1<<q,y=o+q,c=1<<y,l=499,k=491,p=487,j=503,s=3*j;A.exports=C}),a('/gif.worker.coffee')}.call(this,this))"
    var workerBlob = new Blob([gifWorkerText], {
      type: 'application/javascript'
      })
    var workerScript = URL.createObjectURL(workerBlob)
  
      this.encoder = new GIF({
      workers: settings.workers,
      quality: settings.quality,
      workerScript: workerScript
    } );
  
      this.encoder.on( 'progress', function( progress ) {
          if ( this.settings.onProgress ) {
              this.settings.onProgress( progress )
          }
      }.bind( this ) );
  
      this.encoder.on('finished', function( blob ) {
          var cb = this.callback;
          if ( cb ) {
              this.callback = undefined;
              cb( blob );
          }
      }.bind( this ) );
  }
  
  CCGIFEncoder.prototype = Object.create( CCFrameEncoder.prototype );
  
  CCGIFEncoder.prototype.add = function( canvas ) {
  
    if( !this.sizeSet ) {
      this.encoder.setOption( 'width',canvas.width );
      this.encoder.setOption( 'height',canvas.height );
      this.sizeSet = true;
    }
  
    this.canvas.width = canvas.width;
    this.canvas.height = canvas.height;
    this.ctx.drawImage( canvas, 0, 0 );
  
    this.encoder.addFrame( this.ctx, { copy: true, delay: this.settings.step } );
    this.step();
  
    /*this.encoder.setSize( canvas.width, canvas.height );
    var readBuffer = new Uint8Array(canvas.width * canvas.height * 4);
    var context = canvas.getContext( 'webgl' );
    context.readPixels(0, 0, canvas.width, canvas.height, context.RGBA, context.UNSIGNED_BYTE, readBuffer);
    this.encoder.addFrame( readBuffer, true );*/
  
  }
  
  CCGIFEncoder.prototype.save = function( callback ) {
  
      this.callback = callback;
  
    this.encoder.render();
  
  }
  
  function CCapture( settings ) {
  
    var _settings = settings || {},
      _date = new Date(),
      _verbose,
      _display,
      _time,
      _startTime,
      _performanceTime,
      _performanceStartTime,
      _step,
          _encoder,
      _timeouts = [],
      _intervals = [],
      _frameCount = 0,
      _intermediateFrameCount = 0,
      _lastFrame = null,
      _requestAnimationFrameCallbacks = [],
      _capturing = false,
          _handlers = {};
  
    _settings.framerate = _settings.framerate || 60;
    _settings.motionBlurFrames = 2 * ( _settings.motionBlurFrames || 1 );
    _verbose = _settings.verbose || false;
    _display = _settings.display || false;
    _settings.step = 1000.0 / _settings.framerate ;
    _settings.timeLimit = _settings.timeLimit || 0;
    _settings.frameLimit = _settings.frameLimit || 0;
    _settings.startTime = _settings.startTime || 0;
  
    var _timeDisplay = document.createElement( 'div' );
    _timeDisplay.style.position = 'absolute';
    _timeDisplay.style.left = _timeDisplay.style.top = 0
    _timeDisplay.style.backgroundColor = 'black';
    _timeDisplay.style.fontFamily = 'monospace'
    _timeDisplay.style.fontSize = '11px'
    _timeDisplay.style.padding = '5px'
    _timeDisplay.style.color = 'red';
    _timeDisplay.style.zIndex = 100000
    if( _settings.display ) document.body.appendChild( _timeDisplay );
  
    var canvasMotionBlur = document.createElement( 'canvas' );
    var ctxMotionBlur = canvasMotionBlur.getContext( '2d' );
    var bufferMotionBlur;
    var imageData;
  
    _log( 'Step is set to ' + _settings.step + 'ms' );
  
      var _encoders = {
      gif: CCGIFEncoder,
      webm: CCWebMEncoder,
      ffmpegserver: CCFFMpegServerEncoder,
      png: CCPNGEncoder,
      jpg: CCJPEGEncoder,
      'webm-mediarecorder': CCStreamEncoder
      };
  
      var ctor = _encoders[ _settings.format ];
      if ( !ctor ) {
      throw "Error: Incorrect or missing format: Valid formats are " + Object.keys(_encoders).join(", ");
      }
      _encoder = new ctor( _settings );
      _encoder.step = _step
  
    _encoder.on('process', _process);
      _encoder.on('progress', _progress);
  
      if ("performance" in window == false) {
        window.performance = {};
      }
  
    Date.now = (Date.now || function () {  // thanks IE8
      return new Date().getTime();
    });
  
    if ("now" in window.performance == false){
  
      var nowOffset = Date.now();
  
      if (performance.timing && performance.timing.navigationStart){
        nowOffset = performance.timing.navigationStart
      }
  
      window.performance.now = function now(){
        return Date.now() - nowOffset;
      }
    }
  
    var _oldSetTimeout = window.setTimeout,
      _oldSetInterval = window.setInterval,
          _oldClearInterval = window.clearInterval,
      _oldClearTimeout = window.clearTimeout,
      _oldRequestAnimationFrame = window.requestAnimationFrame,
      _oldNow = window.Date.now,
      _oldPerformanceNow = window.performance.now,
      _oldGetTime = window.Date.prototype.getTime;
    // Date.prototype._oldGetTime = Date.prototype.getTime;
  
    var media = [];
  
    function _init() {
  
      _log( 'Capturer start' );
  
      _startTime = window.Date.now();
      _time = _startTime + _settings.startTime;
      _performanceStartTime = window.performance.now();
      _performanceTime = _performanceStartTime + _settings.startTime;
  
      window.Date.prototype.getTime = function(){
        return _time;
      };
      window.Date.now = function() {
        return _time;
      };
  
      window.setTimeout = function( callback, time ) {
        var t = {
          callback: callback,
          time: time,
          triggerTime: _time + time
        };
        _timeouts.push( t );
        _log( 'Timeout set to ' + t.time );
              return t;
      };
      window.clearTimeout = function( id ) {
        for( var j = 0; j < _timeouts.length; j++ ) {
          if( _timeouts[ j ] == id ) {
            _timeouts.splice( j, 1 );
            _log( 'Timeout cleared' );
            continue;
          }
        }
      };
      window.setInterval = function( callback, time ) {
        var t = {
          callback: callback,
          time: time,
          triggerTime: _time + time
        };
        _intervals.push( t );
        _log( 'Interval set to ' + t.time );
        return t;
      };
      window.clearInterval = function( id ) {
        _log( 'clear Interval' );
        return null;
      };
      window.requestAnimationFrame = function( callback ) {
        _requestAnimationFrameCallbacks.push( callback );
      };
      window.performance.now = function(){
        return _performanceTime;
      };
  
      function hookCurrentTime() { 
        if( !this._hooked ) {
          this._hooked = true;
          this._hookedTime = this.currentTime || 0;
          this.pause();
          media.push( this );
        }
        return this._hookedTime + _settings.startTime;
      };
  
      try {
        Object.defineProperty( HTMLVideoElement.prototype, 'currentTime', { get: hookCurrentTime } )
        Object.defineProperty( HTMLAudioElement.prototype, 'currentTime', { get: hookCurrentTime } )
      } catch (err) {
        _log(err);
      }
  
    }
  
    function _start() {
      _init();
      _encoder.start();
      _capturing = true;
    }
  
    function _stop() {
      _capturing = false;
      _encoder.stop();
      _destroy();
    }
  
    function _call( fn, p ) {
      _oldSetTimeout( fn, 0, p );
    }
  
    function _step() {
      //_oldRequestAnimationFrame( _process );
      _call( _process );
    }
  
    function _destroy() {
      _log( 'Capturer stop' );
      window.setTimeout = _oldSetTimeout;
      window.setInterval = _oldSetInterval;
      window.clearInterval = _oldClearInterval;
      window.clearTimeout = _oldClearTimeout;
      window.requestAnimationFrame = _oldRequestAnimationFrame;
      window.Date.prototype.getTime = _oldGetTime;
      window.Date.now = _oldNow;
      window.performance.now = _oldPerformanceNow;
    }
  
    function _updateTime() {
      var seconds = _frameCount / _settings.framerate;
      if( ( _settings.frameLimit && _frameCount >= _settings.frameLimit ) || ( _settings.timeLimit && seconds >= _settings.timeLimit ) ) {
        _stop();
        _save();
      }
      var d = new Date( null );
      d.setSeconds( seconds );
      if( _settings.motionBlurFrames > 2 ) {
        _timeDisplay.textContent = 'CCapture ' + _settings.format + ' | ' + _frameCount + ' frames (' + _intermediateFrameCount + ' inter) | ' +  d.toISOString().substr( 11, 8 );
      } else {
        _timeDisplay.textContent = 'CCapture ' + _settings.format + ' | ' + _frameCount + ' frames | ' +  d.toISOString().substr( 11, 8 );
      }
    }
  
    function _checkFrame( canvas ) {
  
      if( canvasMotionBlur.width !== canvas.width || canvasMotionBlur.height !== canvas.height ) {
        canvasMotionBlur.width = canvas.width;
        canvasMotionBlur.height = canvas.height;
        bufferMotionBlur = new Uint16Array( canvasMotionBlur.height * canvasMotionBlur.width * 4 );
        ctxMotionBlur.fillStyle = '#0'
        ctxMotionBlur.fillRect( 0, 0, canvasMotionBlur.width, canvasMotionBlur.height );
      }
  
    }
  
    function _blendFrame( canvas ) {
  
      //_log( 'Intermediate Frame: ' + _intermediateFrameCount );
  
      ctxMotionBlur.drawImage( canvas, 0, 0 );
      imageData = ctxMotionBlur.getImageData( 0, 0, canvasMotionBlur.width, canvasMotionBlur.height );
      for( var j = 0; j < bufferMotionBlur.length; j+= 4 ) {
        bufferMotionBlur[ j ] += imageData.data[ j ];
        bufferMotionBlur[ j + 1 ] += imageData.data[ j + 1 ];
        bufferMotionBlur[ j + 2 ] += imageData.data[ j + 2 ];
      }
      _intermediateFrameCount++;
  
    }
  
    function _saveFrame(){
  
      var data = imageData.data;
      for( var j = 0; j < bufferMotionBlur.length; j+= 4 ) {
        data[ j ] = bufferMotionBlur[ j ] * 2 / _settings.motionBlurFrames;
        data[ j + 1 ] = bufferMotionBlur[ j + 1 ] * 2 / _settings.motionBlurFrames;
        data[ j + 2 ] = bufferMotionBlur[ j + 2 ] * 2 / _settings.motionBlurFrames;
      }
      ctxMotionBlur.putImageData( imageData, 0, 0 );
      _encoder.add( canvasMotionBlur );
      _frameCount++;
      _intermediateFrameCount = 0;
      _log( 'Full MB Frame! ' + _frameCount + ' ' +  _time );
      for( var j = 0; j < bufferMotionBlur.length; j+= 4 ) {
        bufferMotionBlur[ j ] = 0;
        bufferMotionBlur[ j + 1 ] = 0;
        bufferMotionBlur[ j + 2 ] = 0;
      }
      gc();
  
    }
  
    function _capture( canvas ) {
  
      if( _capturing ) {
  
        if( _settings.motionBlurFrames > 2 ) {
  
          _checkFrame( canvas );
          _blendFrame( canvas );
  
          if( _intermediateFrameCount >= .5 * _settings.motionBlurFrames ) {
            _saveFrame();
          } else {
            _step();
          }
  
        } else {
          _encoder.add( canvas );
          _frameCount++;
          _log( 'Full Frame! ' + _frameCount );
        }
  
      }
  
    }
  
    function _process() {
  
      var step = 1000 / _settings.framerate;
      var dt = ( _frameCount + _intermediateFrameCount / _settings.motionBlurFrames ) * step;
  
      _time = _startTime + dt;
      _performanceTime = _performanceStartTime + dt;
  
      media.forEach( function( v ) {
        v._hookedTime = dt / 1000;
      } );
  
      _updateTime();
      _log( 'Frame: ' + _frameCount + ' ' + _intermediateFrameCount );
  
      for( var j = 0; j < _timeouts.length; j++ ) {
        if( _time >= _timeouts[ j ].triggerTime ) {
          _call( _timeouts[ j ].callback )
          //console.log( 'timeout!' );
          _timeouts.splice( j, 1 );
          continue;
        }
      }
  
      for( var j = 0; j < _intervals.length; j++ ) {
        if( _time >= _intervals[ j ].triggerTime ) {
          _call( _intervals[ j ].callback );
          _intervals[ j ].triggerTime += _intervals[ j ].time;
          //console.log( 'interval!' );
          continue;
        }
      }
  
      _requestAnimationFrameCallbacks.forEach( function( cb ) {
           _call( cb, _time - g_startTime );
          } );
          _requestAnimationFrameCallbacks = [];
  
    }
  
    function _save( callback ) {
  
      if( !callback ) {
        callback = function( blob ) {
          download( blob, _encoder.filename + _encoder.extension, _encoder.mimeType );
          return false;
        }
      }
      _encoder.save( callback );
  
    }
  
    function _log( message ) {
      if( _verbose ) console.log( message );
    }
  
      function _on( event, handler ) {
  
          _handlers[event] = handler;
  
      }
  
      function _emit( event ) {
  
          var handler = _handlers[event];
          if ( handler ) {
  
              handler.apply( null, Array.prototype.slice.call( arguments, 1 ) );
  
          }
  
      }
  
      function _progress( progress ) {
  
          _emit( 'progress', progress );
  
      }
  
    return {
      start: _start,
      capture: _capture,
      stop: _stop,
      save: _save,
          on: _on
    }
  }
  
  (freeWindow || freeSelf || {}).CCapture = CCapture;
  
    // Some AMD build optimizers like r.js check for condition patterns like the following:
    if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
      // Define as an anonymous module so, through path mapping, it can be
      // referenced as the "underscore" module.
      define(function() {
        return CCapture;
      });
  }
    // Check for `exports` after `define` in case a build optimizer adds an `exports` object.
    else if (freeExports && freeModule) {
      // Export for Node.js.
      if (moduleExports) {
        (freeModule.exports = CCapture).CCapture = CCapture;
      }
      // Export for CommonJS support.
      freeExports.CCapture = CCapture;
  }
  else {
      // Export to the global object.
      root.CCapture = CCapture;
  }
  
  