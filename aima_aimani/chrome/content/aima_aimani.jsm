/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/**
 * Aima_Aimani JavaScript module (ready for frame scripts)
 */
var EXPORTED_SYMBOLS = [
  // constructors
  "Aima_AimaniNGCatCache",
  "Aima_AimaniNGCatCacheManager",
  "Aima_AimaniLocationInfo",
  "Aima_AimaniStyle",
  "Aima_AimaniDocumentParam",
  "Aima_AimaniPopupManagerData",
  // singletons
  "Aima_AimaniNGCat",
  "Aima_AimaniConverter",
  "Aima_Aimani",
  "Aima_AimaniConfigManager",
  "Aima_AimaniPopupManager",
  "Aima_AimaniVersion",
  "Aima_AimaniServerName",
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

var loader
= Cc ["@mozilla.org/moz/jssubscript-loader;1"]
.getService (Ci.mozIJSSubScriptLoader);

loader.loadSubScript ("chrome://aima_aimani/content/version.js", this);
loader.loadSubScript ("chrome://aima_aimani/content/server.js", this);

Cu.import("resource://gre/modules/Timer.jsm");

/**
 * 赤福との連携準備: 必要なモジュールへの参照をインポート
 *
 * XUL 側 Aima_Aimani からの不要なインポートを避けるために
 * 必要になる時点でインポートする
 */
var tryImportAkahuku = (function (global) {
  return function () {
    // インポートに挑戦するのは一度だけ
    global.tryImportAkahuku = function () {};
    try {
      let tmp = {}
      Cu.import("resource://akahuku/akahuku.jsm", tmp);
      global.Akahuku = tmp.Akahuku;
    }
    catch (e if e.result == Cr.NS_ERROR_FILE_NOT_FOUND) {
      // 赤福が無い or 非対応バージョン
    }
    catch (e) { Cu.reportError (e);
    }
  };
})(this);

/**
 * NG カタログの各画像のハッシュ算出器
 */
function Aima_AimaniNGCatCache () {
  this._started = false;
  this._canceled = false;
  this._stopped = false;
  this._restarting = false;
}
Aima_AimaniNGCatCache.prototype = {
  targetNode : null,   /* HTMLTableCellElement  カタログの td 要素 */
  targetAnchor : null, /* HTMLAnchorElement  カタログのリンク */
  imageNode : null,    /* HTMLImageElement  画像の img 要素 */
  server : "",         /* String  サーバ名 */
  dir : "",            /* String  ディレクトリ名 */
  threadNum : 0,       /* Number  スレの番号 */
  imageNum : 0,        /* Number  画像の番号 */
  anchor : null,       /* HTMLElement  NG カタログのボタン */
    
  hiding : false,      /* Boolean  NG カタログに追加中か
                        *   true: 追加中
                        *   false: チェック中 */

  notificationTarget : null,

  _destruct : function () {
    if (this._restarting) {
      this._restarting = false;
      Aima_Aimani.executeSoon (function (that) {
        that._started = false;
        that._canceled = false;
        that._stopped = false;
        that.start ();
      }, [this]);
      return;
    }
    if (this.imageNode) {
      try {
        this.imageNode.style.visibility = "";
      }
      catch (e) {
      }
    }
    this.targetNode = null;
    this.targetAnchor = null;
    this.imageNode = null;
    this.anchor = null;
    this.notificationTarget = null;
  },

  cancel : function (status) {
    if (arguments.length == 0) {
      status = Cr.NS_BINDING_ABORTED;
    }
    if (this._canceled) {
      return;
    }
    this._canceled = true;
    if (!this._started) {
      this._notifyStart ();
    }
    this._notifyStop (status);
    this._destruct ();
  },

  isPending : function () {
    return this._started && !this._canceled && this.targetNode != null;
  },

  restart : function () {
    if (!this._stopped || !this.imageNode) {
      throw new Error ("restart is unable from the current state");
    }
    this._restarting = true; // not to be destructed
  },
    
  /**
   * チェック開始
   */
  start : function () {
    if (this._started) {
      throw new Error ("Aima_AimaniNGCatCache.start: already started")
    }
    try {
      this.asyncOpenCacheViaChannel ();
      this._notifyStart ();
    }
    catch (e) { Cu.reportError (e);
      this._notifyStart ();
      this._notifyStop (e.result);
      this._destruct ();
    }
  },

  asyncOpenCacheViaChannel : function () {
    var url = this.imageNode.src;
    var ios
      = Cc ["@mozilla.org/network/io-service;1"]
      .getService (Ci.nsIIOService);
    var ssm
      = Cc ["@mozilla.org/scriptsecuritymanager;1"]
      .getService (Ci.nsIScriptSecurityManager);
    // require gecko 36
    var channel = ios.newChannel2 (url, null, null,
        this.imageNode,
        ssm.getSystemPrincipal (),
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
        Ci.nsIContentPolicy.TYPE_IMAGE);

    channel.loadFlags = Ci.nsIRequest.LOAD_FROM_CACHE;

    var listener = {
      cache : this,
      destruct : function () {
        this.cache = null;
        this.pipe = null;
      },
      onStartRequest : function (request, context) {
        this.pipe
          = Cc ["@mozilla.org/pipe;1"]
          .createInstance (Ci.nsIPipe);
        this.pipe.init (true, false, null, 0xffffffff, null);
        this.dataSize = 0;
      },
      onDataAvailable : function (request, context, inputStream, offset, count) {
        var c = this.pipe.outputStream.writeFrom (inputStream, count);
        this.dataSize += c;
      },
      onStopRequest : function (request, context, statusCode) {
        this.pipe.outputStream.close ();
        if (!Components.isSuccessCode (statusCode)) {
          this.cache._notifyStop (statusCode);
          this.cache._destruct ();
          this.destruct ();
          return;
        }

        var entry = {
          mPipe : this.pipe,
          mDataSize : this.dataSize,
          get dataSize () {return this.mDataSize;},
          openInputStream : function () {return this.mPipe.inputStream;},
          close : function () {
            this.mPipe = null;
          },
        };
        this.cache._onCacheStreamAvailable (entry, this.pipe.inputStream, 0);
        this.destruct ();
      },
    };
    channel.asyncOpen (listener, null);
  },

  _onCacheStreamAvailable : function (entry, istream, result) {
    if (this._canceled) {
      return;
    }
    if (Components.isSuccessCode (result)) {
      try {
        var bstream
        = Cc ["@mozilla.org/binaryinputstream;1"]
        .createInstance (Ci.nsIBinaryInputStream);
        bstream.setInputStream (istream);
        var bindata = bstream.readBytes (entry.dataSize);
        bstream.close ();
        entry.close ();
                
        var hash = Aima_AimaniNGCat.md5 (bindata);
                
        var imageWidth = this.imageNode.getAttribute ("width")
        || this.imageNode.width;
        var imageHeight = this.imageNode.getAttribute ("height")
        || this.imageNode.height
        var ngcat
        = imageWidth
        + "_" + imageHeight
        + "_" + hash;
                
        this.imageNode.setAttribute ("aima_aimani_ngcat", ngcat);
                
        var now = (new Date ()).getTime ();
                
        var autoHide = false;
        var targetDocument = this.imageNode.ownerDocument;
        var param
        = Aima_Aimani.getDocumentParam (targetDocument);
                
        if (Aima_AimaniNGCat.enableNGCatAuto && param) {
          if (now - param.ngcat_last > 60 * 1000) {
            param.ngcat_last = now;
                        
            for (var c in param.ngcat_log) {
              for (var t in param.ngcat_log [c]) {
                if (t == "count") {
                  continue;
                }
                if (now - param.ngcat_log [c][t] > 10 * 1000) {
                  delete param.ngcat_log [c][t];
                  param.ngcat_log [c]["count"] --;
                }
              }
              if (param.ngcat_log [c]["count"] == 0) {
                delete param.ngcat_log [c];
              }
            }
          }
                        
          if (ngcat in param.ngcat_log) {
            if (param.ngcat_log [ngcat]["count"]
                < Aima_AimaniNGCat.NGCatAutoThreshold
                && !(this.threadNum in param.ngcat_log [ngcat])) {
              param.ngcat_log [ngcat]["count"] ++;
              param.ngcat_log [ngcat][this.threadNum] = now;
                            
              if (param.ngcat_log [ngcat]["count"]
                  == Aima_AimaniNGCat.NGCatAutoThreshold) {
                var oldest = now;
                var oldestT = 0;
                for (var t in param.ngcat_log [ngcat]) {
                  if (t == "count") {
                    continue;
                  }
                  if (param.ngcat_log [ngcat][t] < oldest) {
                    oldest = param.ngcat_log [ngcat][t];
                  }
                }
                                
                if (now - oldest < 3 * 1000) {
                  autoHide = true;
                }
                else {
                  delete param.ngcat_log [ngcat][oldestT];
                }
              }
            }
          }
          else {
            param.ngcat_log [ngcat] = new Object ();
            param.ngcat_log [ngcat]["count"] = 1;
            param.ngcat_log [ngcat][this.threadNum] = now;
          }
        }
                
        if (this.hiding) {
          this.hiding = false;
          Aima_Aimani.hideCatalogue
          (this.targetNode.ownerDocument,
           this.anchor,
           Aima_Aimani.REASON_NG_CAT, false);
                    
          Aima_AimaniNGCat.addNGCat (imageWidth, imageHeight,
                                     hash,
                                     "");
                    
          Aima_Aimani.addNGNumber (this.threadNum,
                                   this.server, this.dir,
                                   ngcat, Aima_Aimani.REASON_NG_CAT, this.imageNum);
                    
          Aima_Aimani.setText (this.anchor,
                               Aima_Aimani.bracketLeft
                               + Aima_AimaniNGCat.textShowNGCat
                               + Aima_Aimani.bracketRight);
          this.anchor.setAttribute ("name",
                                    "show_ngcat_"
                                    + this.threadNum
                                    + "_" + this.imageNum
                                    + "_" + ngcat);
        }
        else {
          Aima_AimaniNGCat.check
          (this.targetNode.ownerDocument, this.targetNode,
           this.targetAnchor,
           this.threadNum, this.server, this.dir, this.imageNum,
           this.imageNode, ngcat);
        }
                
        if (autoHide) {
          Aima_AimaniNGCat.addNGCat (imageWidth, imageHeight,
                                     hash,
                                     "auto");
          this.imageNode.ownerDocument.defaultView
          .setTimeout (function (width, height) {
              Aima_AimaniNGCat.applyAutoHide
                (targetDocument,
                 width,
                 height,
                 hash);
            }, 1000, imageWidth, imageHeight);
        }
        this._notifyStop ();
      }
      catch (e) { Cu.reportError (e);
        this._notifyStop (e.result);
      }
    }
    else {
      this._notifyStop (result);
    }
    this._destruct ();
  },

  // easy notification callback (same as nsIRequestObserver)
  _notify : function (result) {
    if (!this.notificationTarget) {
      return;
    }
    try {
      if (arguments.length > 0) {
        this.notificationTarget.onStopRequest (this, null, result);
      }
      else {
        this.notificationTarget.onStartRequest (this, null);
      }
    }
    catch (e) { Cu.reportError (e);
    }
  },
  _notifyStart : function ()
  {
    this._started = true;
    this._notify ();
  },
  _notifyStop : function (result) {
    this._stopped = true;
    this._notify (arguments.length == 0 ? Cr.NS_OK : result);
  },

};

function Aima_AimaniNGCatCacheManager () {
  this.caches = [];
  this._listeners = [];
  this.count = 0;
  this.countSuccess = 0;
  this.countFail = 0;
  this.numMaxRetry = 2;
};
Aima_AimaniNGCatCacheManager.prototype = {
  destruct : function () {
    for (var i = 0; this.caches.length; i ++) {
      this.caches [i].notificationTarget = null;
      this.caches [i].cancel ();
    }
    this.caches = null;
    this._listeners = null;
  },

  addNGCatCache : function (cache) {
    this.caches.push (cache);
    cache.notificationTarget = this;
    this.count ++;
  },
  onStartRequest : function (cache, context) {
  },
  onStopRequest : function (cache, context, status)
  {
    var spliced = false;
    for (var i = 0; i < this.caches.length; i ++) {
      if (this.caches [i] == cache) {
        this.caches.splice (i, 1);
        spliced = true;
        break;
      }
    }
    if (!spliced) {
      throw new Error ("Aima_AimaniNGCatCacheManager.onStopRequest: not registered");
    }
    if (Components.isSuccessCode (status)) {
      this.countSuccess ++;
    }
    else {
      var numRestart = cache.numRestart ? cache.numRestart : 0;
      if ((status == Cr.NS_ERROR_CACHE_KEY_NOT_FOUND
            || status == Cr.NS_ERROR_FILE_NOT_FOUND)
          && numRestart < this.numMaxRetry) {
        cache.numRestart = numRestart + 1;
        try {
          cache.restart ();
          this.caches.push (cache);
          return;
        }
        catch (e) { Cu.reportError (e);
        }
      }

      this.countFail ++;
      Aima_Aimani.log
        ("! open cache failed with " + this.resultCodeToString (status)
         + " for \"" + cache.imageNode.src + "\""
         + (cache.numRestart ? " after " + cache.numRestart + " retries" : ""));
    }
    if (this.caches.length == 0) {
      this._notifyAllListeners ("finished");
      this.count = 0;
      this.countSuccess = 0;
      this.countFail = 0;
    }
  },
  resultCodeToString : function (code) {
    var codeInHex = "(0x" + code.toString (16) + ")";
    var codeName = "";
    for (var name in Cr) {
      if (code === Cr [name]) {
        codeName = name + " ";
        break;
      }
    }
    return codeName + codeInHex;
  },

  isPending : function () {
    return (this.caches.length != 0);
  },

  addCallbackListener : function (listener) {
    for (var i = 0; i < this._listeners.length; i ++) {
      if (listener == this._listeners [i]) {
        return; // already listening
      }
    }
    this._listeners.push (listener);
  },
  _notifyAllListeners : function (status) {
    var l = this._listeners;
    this._listeners = [];
    for (var i = 0; i < l.length; i ++) {
      try {
        l [i].apply (null, [this, status]);
      }
      catch (e) { Cu.reportError (e);
      }
    }
  },

};


/**
 * NG カタログ
 */
var Aima_AimaniNGCat = {
  /* [NG カタログ] タブの設定 */
  enableNGCat : false,         /* Boolean  NG カタログ */
  enableNGCatNoButton : false, /* Boolean  [消] ボタンを表示しない */
  NGCatList : [],              /* Array  NG カタログリスト
                                * [[Number 幅, Number 高さ,
                                *   String ハッシュ,
                                *   String コメント,
                                *   Number 回数, Number 最終更新日時], ...] */
    
  enableNGCatAuto : false,     /* Boolean 同じ画像のスレが 3 秒以内に
                                *   n 個立ったら自動で登録する */
  NGCatAutoThreshold : 5,      /* Number  同時にカタログに存在する画像の数 */
    
  boardSelectExList : new Object (), /* Object  動作しない板
                                      *   <String 板名, Boolean ダミー> */
    
  textHideNGCat : "\u6D88",
  textShowNGCat : "\u89E3",

  useAkahukuCustomEvents : false, /* Boolean ハンドラ呼び出しではなく赤福のカスタムイベントに応じて更新するか */
    
  /**
   * 初期化
   */
  getPreference : function () {
    Aima_AimaniNGCat.enableNGCat
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.ng_cat", false);
    if (Aima_AimaniNGCat.enableNGCat) {
      Aima_AimaniNGCat.enableNGCatNoButton
        = Aima_AimaniConfigManager
        .initPref ("bool", "aima_aimani.ng_cat.no_button", false);
      Aima_AimaniNGCat.enableNGCatAuto
        = Aima_AimaniConfigManager
        .initPref ("bool", "aima_aimani.ng_cat.auto", false);
      Aima_AimaniNGCat.NGCatAutoThreshold
        = Aima_AimaniConfigManager
        .initPref ("int",  "aima_aimani.ng_cat.auto.threshold", 5);
      Aima_AimaniNGCat.loadNGCat ();
    }
  },
    
  /**
   * 自動で追加された NG カタログを指定個に達する前の画像に反映させる
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String hash
   *         ハッシュ
   */
  applyAutoHide : function (targetDocument, width, height, hash) {
    var ngcat = width + "_" + height + "_" + hash;
    var added = false;
    var item
    = Aima_AimaniNGCat.arrayExistsNGCat
    (Aima_AimaniNGCat.NGCatList,
     width, height, hash);
    if (!item) {
      return;
    }
        
    var now = (new Date ()).getTime ();
        
    var info
    = Aima_Aimani.getDocumentParam (targetDocument).location_info;
        
    var nodes = targetDocument.getElementsByTagName ("img");
    for (var i = 0; i < nodes.length; i ++) {
      try {
        if (nodes [i].style.display != "none") {
          var ngcat2 = nodes [i].getAttribute ("aima_aimani_ngcat");
          if (ngcat2 == ngcat) {
            added = true;
                        
            item [4] ++;
            item [5] = now;
            
            var targetNode
              = Aima_Aimani.findParentNode (nodes [i], "td");
                        
            var nodes2 = targetNode.getElementsByTagName ("small");
            
            for (var j = 0; j < nodes2.length; j ++) {
              var type = nodes2 [j].getAttribute ("name");
                
              if (type
                  && type.match
                  (/^hide_ngcat_([0-9]+)_([0-9]+)_/)) {
                var threadNum = RegExp.$1;
                var imageNum = RegExp.$2;
                Aima_Aimani.addNGNumber (threadNum,
                                         info.server, info.dir,
                                         ngcat, Aima_Aimani.REASON_NG_CAT, imageNum);
              }
            }
                        
            Aima_Aimani.hideCatalogue
              (targetDocument, nodes [i],
               Aima_Aimani.REASON_NG_CAT, Aima_Aimani.enableHideEntireThread);
          }
        }
      }
      catch (e) { Cu.reportError (e);
      }
    }
        
    if (added) {
      Aima_AimaniNGCat.saveNGCat ();
        
      if (Aima_Aimani.enableHideEntireThread) {
        try {
          tryImportAkahuku ();
          if (typeof Akahuku != "undefined"
              && Akahuku.onHideEntireThread) {
            Akahuku.onHideEntireThread (targetDocument);
          }
        }
        catch (e) { Cu.reportError (e);
        }
      }
    }
  },
    
  /**
   * NG カタログを追加する
   *
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String hash
   *         ハッシュ
   * @param  String comment
   *         コメント
   */
  addNGCat : function (width, height, hash, comment) {
    if (Aima_AimaniNGCat.arrayExistsNGCat (Aima_AimaniNGCat.NGCatList,
                                           width, height, hash)) {
      return;
    }
        
    var now = (new Date ()).getTime ();
    Aima_AimaniNGCat.NGCatList
    .unshift (new Array (width, height, hash, comment, 1, now));
        
    Aima_AimaniNGCat.saveNGCat ();
  },
    
  /**
   * NG カタログを削除する
   *
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String hash
   *         ハッシュ
   */
  deleteNGCat : function (width, height, hash) {
    if (!Aima_AimaniNGCat.arrayDeleteNGCat (Aima_AimaniNGCat.NGCatList,
                                            width, height, hash)) {
      return;
    }
        
    Aima_AimaniNGCat.saveNGCat ();
  },
    
  /**
   * NG カタログが存在するかどうかチェックする
   *
   * @param  Array array
   *         対象の配列
   * @param  Number num
   *         チェックする番号
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String hash
   *         ハッシュ
   * @return Array
   *         存在した場合 NG 番号
   *         存在しない場合 null
   */
  arrayExistsNGCat : function (array, width, height, hash) {
    for (var i = 0; i < array.length; i ++) {
      if (array [i][0] == width
          && array [i][1] == height
          && array [i][2] == hash) {
        return array [i];
      }
    }
    return null;
  },
    
  /**
   * NG カタログがハッシュ抜きで存在するかどうかチェックする
   *
   * @param  Array array
   *         対象の配列
   * @param  Number num
   *         チェックする番号
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @return Array
   *         存在した場合 NG 番号
   *         存在しない場合 null
   */
  arrayExistsNGCatNoHash : function (array, width, height) {
    for (var i = 0; i < array.length; i ++) {
      if (array [i][0] == width
          && array [i][1] == height) {
        return array [i];
      }
    }
    return null;
  },
    
  /**
   * NG カタログを削除する
   *
   * @param  Array array
   *         対象の配列
   * @param  Number num
   *         チェックする番号
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String hash
   *         ハッシュ
   * @return Boolean
   *         削除したか
   */
  arrayDeleteNGCat : function (array, width, height, hash) {
    var deleted = false;
        
    for (var i = 0; i < array.length; i ++) {
      if (array [i][0] == width
          && array [i][1] == height
          && array [i][2] == hash) {
        deleted = true;
        array.splice (i, 1);
        i --;
      }
    }
        
    return deleted;
  },
  /**
   * NG カタログを読み込む
   */
  loadNGCat : function () {
    Aima_AimaniNGCat.NGCatList = new Array ();
    var tmp
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.ng_cat.list", "");
    if (tmp != "") {
      /* 値を解析するだけなので代入はしない */
      tmp.replace
        (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&?([^&,]*)?,?/g,
         function (matched, width, height, hash, comment, count, date) {
          if (!comment) {
            comment = "";
          }
          if (!count) {
            count = 0;
          }
          if (!date) {
            date = 0;
          }
                    
          Aima_AimaniNGCat.NGCatList
            .push (new Array (parseInt (unescape (width)),
                              parseInt (unescape (height)),
                              unescape (hash),
                              unescape (comment),
                              parseInt (unescape (count)),
                              parseInt (unescape (date))));
          return "";
        });
    }
        
    var value
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.ng_cat.board_select.ex_list", "");
    Aima_AimaniNGCat.boardSelectExList = new Object ();
        
    if (value) {
      /* 値を解析するだけなので代入はしない */
      value.replace
        (/([^,]+),?/g,
         function (matched, part1) {
          Aima_AimaniNGCat.boardSelectExList [unescape (part1)]
            = true;
          return "";
        });
    }
  },
    
  /**
   * NG カタログを保存する
   */
  saveNGCat : function () {
    var tmp = "";
    for (var i = 0; i < Aima_AimaniNGCat.NGCatList.length; i ++) {
      if (tmp != "") {
        tmp += ",";
      }
      tmp
        += escape (Aima_AimaniNGCat.NGCatList [i][0])
        + "&" + escape (Aima_AimaniNGCat.NGCatList [i][1])
        + "&" + escape (Aima_AimaniNGCat.NGCatList [i][2])
        + "&" + escape (Aima_AimaniNGCat.NGCatList [i][3])
        + "&" + escape (Aima_AimaniNGCat.NGCatList [i][4])
        + "&" + escape (Aima_AimaniNGCat.NGCatList [i][5]);
    }
        
    Aima_AimaniConfigManager.prefBranch
    .setCharPref ("aima_aimani.ng_cat.list", tmp);
  },
    
  /**
   * MD5 を取得する
   *
   * @param  String data
   *         元の文字列
   * @return String
   *         MD5
   */
  md5 : function (data) {
    var r
    = new Array (7, 12, 17, 22,
                 5,  9, 14, 20,
                 4, 11, 16, 23,
                 6, 10, 15, 21);
            
    var k = new Array ();
            
    for (var i = 0; i < 64; i ++) {
      k [i]
        = parseInt (Math.abs (Math.sin (i + 1)) * Math.pow (2, 32));
    }
                                
    var h0 = 0x67452301;
    var h1 = 0xEFCDAB89;
    var h2 = 0x98BADCFE;
    var h3 = 0x10325476;
            
    var length = data.length * 8;
    data += "\x80";
    while (data.length % 64 != 56) {
      data += "\x00";
    }
            
    data += String.fromCharCode ((length      )  & 0xff);
    data += String.fromCharCode ((length >>  8)  & 0xff);
    data += String.fromCharCode ((length >> 16)  & 0xff);
    data += String.fromCharCode ((length >> 24)  & 0xff);
    data += String.fromCharCode (0x00);
    data += String.fromCharCode (0x00);
    data += String.fromCharCode (0x00);
    data += String.fromCharCode (0x00);
            
    for (var j = 0; j < data.length; j += 64) {
      var w = new Array ();
      for (var i = 0; i < 16; i ++) {
        w [i]
          = (data.charCodeAt (j + i * 4    )      )
          | (data.charCodeAt (j + i * 4 + 1) <<  8)
          | (data.charCodeAt (j + i * 4 + 2) << 16)
          | (data.charCodeAt (j + i * 4 + 3) << 24);
      }
                
      var a = h0;
      var b = h1;
      var c = h2;
      var d = h3;
                
      for (var i = 0; i < 64; i ++) {
        var f, g, ii;
        if (0 <= i && i <= 15) {
          f = (b & c) | (~b & d);
          g = i;
          ii = i % 4;
        }
        else if (16 <= i && i <= 31) {
          f = (d & b) | (~d & c);
          g = (5 * i + 1) % 16;
          ii = 4 + (i % 4);
        }
        else if (32 <= i && i <= 47) {
          f = b ^ c ^ d;
          g = (3 * i + 5) % 16;
          ii = 8 + (i % 4);
        }
        else if (48 <= i && i <= 63) {
          f = c ^ (b | ~d);
          g = (7 * i) % 16;
          ii = 12 + (i % 4);
        }
                    
        var temp = d;
        d = c;
        c = b;
        var temp2 = a + f + k [i] + w [g];
        while (temp2 < 0) {
          temp2 += 4294967296;
        }
        while (temp2 > 4294967295) {
          temp2 -= 4294967296;
        }
        var temp3 = (temp2 << r [ii]) | (temp2 >>> (32 - r [ii]));
        temp3 += b;
        while (temp3 < 0) {
          temp3 += 4294967296;
        }
        while (temp3 > 4294967295) {
          temp3 -= 4294967296;
        }
        b = temp3;
        a = temp;
      }
                
      h0 = h0 + a;
      h1 = h1 + b;
      h2 = h2 + c;
      h3 = h3 + d;
    }
            
    data
    = String.fromCharCode ((h0      ) & 0xff)
    + String.fromCharCode ((h0 >>  8) & 0xff)
    + String.fromCharCode ((h0 >> 16) & 0xff)
    + String.fromCharCode ((h0 >> 24) & 0xff)
    + String.fromCharCode ((h1      ) & 0xff)
    + String.fromCharCode ((h1 >>  8) & 0xff)
    + String.fromCharCode ((h1 >> 16) & 0xff)
    + String.fromCharCode ((h1 >> 24) & 0xff)
    + String.fromCharCode ((h2      ) & 0xff)
    + String.fromCharCode ((h2 >>  8) & 0xff)
    + String.fromCharCode ((h2 >> 16) & 0xff)
    + String.fromCharCode ((h2 >> 24) & 0xff)
    + String.fromCharCode ((h3      ) & 0xff)
    + String.fromCharCode ((h3 >>  8) & 0xff)
    + String.fromCharCode ((h3 >> 16) & 0xff)
    + String.fromCharCode ((h3 >> 24) & 0xff);
        
    return btoa (data);
  },
    
  /**
   * NG カタログをチェックし, 隠す
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLTableCellElement targetNode
   *         カタログの td 要素
   * @param  HTMLAnchorElement targetAnchor
   *         カタログのリンク
   * @param  Number threadNum
   *         追加する番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @param  Number imageNum
   *         画像の番号
   * @param  HTMLImageElement imageNode
   *         画像の img 要素
   * @param  String ngcat
   *         NG カタログデータ
   */
  check : function (targetDocument, targetNode, targetAnchor,
                    threadNum, server, dir, imageNum,
                    imageNode, ngcat) {
    var width;
    var height;
    var hash;
        
    if (ngcat.match (/([0-9]+)_([0-9]+)_(.+)/)) {
      width = RegExp.$1;
      height = RegExp.$2;
      hash = RegExp.$3;
    }
    else {
      width = 0;
      height = 0;
      hash = "";
    }
        
    if (imageNode.hasAttribute ("aima_aimani_ngcat_hide")) {
      imageNode.removeAttribute ("aima_aimani_ngcat_hide");
            
      name
      = "show_ngcat_" + threadNum + "_" + imageNum
      + "_" + ngcat;
      text = Aima_AimaniNGCat.textShowNGCat;
    }
    else {
      var item;
      if (hash) {
        item
          = Aima_AimaniNGCat.arrayExistsNGCat
          (Aima_AimaniNGCat.NGCatList,
           width, height, hash);
      }
      else {
        item = false;
      }
            
      var name;
      var text;
      if (item) {
        var now = (new Date ()).getTime ();
        item [4] ++;
        item [5] = now;
                
        Aima_AimaniNGCat.saveNGCat ();
                
        Aima_Aimani.addNGNumber (threadNum,
                                 server, dir,
                                 ngcat, Aima_Aimani.REASON_NG_CAT, imageNum);
            
        Aima_Aimani.hideCatalogue
          (targetDocument,
           imageNode,
           Aima_Aimani.REASON_NG_CAT,
           Aima_Aimani.enableHideEntireThread);
            
        name
          = "show_ngcat_" + threadNum + "_" + imageNum
          + "_" + ngcat;
        text = Aima_AimaniNGCat.textShowNGCat;
      }
      else {
        name
        = "hide_ngcat_" + threadNum + "_" + imageNum
        + "_" + ngcat;
        text = Aima_AimaniNGCat.textHideNGCat;
      }
    }
        
    var nodes = targetNode.getElementsByTagName ("small");
    for (var i = 0; i < nodes.length; i ++) {
      if (nodes [i].className == "aima_aimani_generated"
          && nodes [i].getAttribute ("name").match
          (/^(show|hide)_ngcat/)) {
        nodes [i].parentNode.removeChild (nodes [i]);
        i --;
      }
    }
        
    var newNode
    = Aima_Aimani.createAnchor
    (targetDocument, name, text, Aima_Aimani.enableBracket);
    newNode.style.fontSize = "8pt";
    newNode.style.color = "#7f2962";
    if (Aima_AimaniNGCat.enableNGCatNoButton) {
      newNode.style.display = "none";
    }
    targetAnchor.parentNode.appendChild (newNode);
        
    if (Aima_Aimani.enableHideEntireThread) {
      // Akahuku.onHideEntireThread は後で一度だけ呼ぶ
      var param = Aima_Aimani.getDocumentParam (targetDocument);
      targetDocument.defaultView
        .clearTimeout (param.ngcat_hideEntireThread_timerID);
      param.ngcat_hideEntireThread_timerID
      = targetDocument.defaultView
      .setTimeout (function () {
        tryImportAkahuku ();
        if (typeof Akahuku != "undefined") {
          try {
            Akahuku.onHideEntireThread (targetDocument);
          }
          catch (e) { Cu.reportError (e);
          }
        }
      }, 10);
    }
  },
    
  /**
   * NG カタログのアンカーを追加する
   *
   * @param  Aima_AimaniNGCatCache cache
   *         キャッシュ
   */
  addAnchor : function (cache) {
    var name
    = "hide_ngcat_" + cache.threadNum + "_" + cache.imageNum + "_null";
    var text = Aima_AimaniNGCat.textHideNGCat;
        
    var nodes = cache.targetNode.getElementsByTagName ("small");
    for (var i = 0; i < nodes.length; i ++) {
      if (nodes [i].className == "aima_aimani_generated"
          && nodes [i].getAttribute ("name").match
          (/^(show|hide)_ngcat/)) {
        nodes [i].parentNode.removeChild (nodes [i]);
        i --;
      }
    }
        
    var newNode
    = Aima_Aimani.createAnchor
    (cache.targetAnchor.ownerDocument, name, text,
     Aima_Aimani.enableBracket);
    newNode.style.fontSize = "8pt";
    newNode.style.color = "#7f2962";
    if (Aima_AimaniNGCat.enableNGCatNoButton) {
      newNode.style.display = "none";
    }
    cache.targetAnchor.parentNode.appendChild (newNode);
  },
    
  /**
   * カタログの NG カタログを非表示にする
   * 
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLTableCellElement targetNode
   *         カタログの td 要素
   * @param  HTMLAnachorElement targetAnchor
   *         カタログのリンク
   * @param  Number threadNum
   *         追加する番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @param  Number imageNum
   *         画像の番号
   * @param  HTMLImageElement imageNode
   *         画像の img 要素
   */
  apply : function (targetDocument, targetNode, targetAnchor,
                    threadNum, server, dir, imageNum,
                    imageNode) {
    var param = Aima_Aimani.getDocumentParam (targetDocument);
        
    var ngcat = "null";
    if (imageNode.hasAttribute ("aima_aimani_ngcat")) {
      var ngcat = imageNode.getAttribute ("aima_aimani_ngcat");
      imageNode.style.visibility = "";
    }
    else {
      var width = imageNode.getAttribute ("width") || imageNode.width;
      var height = imageNode.getAttribute ("height") || imageNode.height;
      var item
      = Aima_AimaniNGCat.arrayExistsNGCatNoHash
      (Aima_AimaniNGCat.NGCatList,
       width, height);
      if (item) {
        /* NG カタログに含まれる可能性がある */
        var cache = new Aima_AimaniNGCatCache ();
        cache.targetNode = targetNode;
        cache.targetAnchor = targetAnchor;
        cache.threadNum = threadNum;
        cache.server = server;
        cache.dir = dir;
        cache.imageNum = imageNum;
        cache.imageNode = imageNode;
        cache.hiding = false;

        ngcat = "null?";//ハッシュ計算中

        param.ngcat_cacheManager.addNGCatCache (cache);
                
        var getImgRequest = function (img) {
          var ILC = Ci.nsIImageLoadingContent;
          var load;
          try {
            load = img.QueryInterface (ILC);
          }
          catch (e) {
          }
          return load ? load.getRequest (ILC.CURRENT_REQUEST) : null;
        };
        var complete
          = Ci.imgIRequest.STATUS_LOAD_COMPLETE;

        var request = getImgRequest (cache.imageNode);
                
        if (!request
            || !(request.imageStatus & complete)) {
          // ロード完了していない場合(未ロードorロード中orエラー)
          // load/error イベントを待ってからハッシュ算出
          imageNode.style.visibility = "hidden";
          var waiting_for_p2p = false;
          var cache_handler = function (event) {
            event.target.removeEventListener ("load", cache_handler);
            event.target.removeEventListener ("error", cache_handler);
            if (event.type == "load") {
              cache.start ();
              return;
            }
            // on error
            if (!waiting_for_p2p &&
                /^akahuku:/.test (event.target.src) ) {
              // 赤福P2Pによるsrc書き換えのため再度loadを待つ
              waiting_for_p2p = true;
              // error 2連続を避けるため間を空けて再監視
              event.target.ownerDocument.defaultView
              .setTimeout (function (img) {
                img.addEventListener ("load", cache_handler, false);
                img.addEventListener ("error", cache_handler, false);
              }, 10, event.target);
            }
            else if (waiting_for_p2p) {
              // P2P画像ロードに失敗
              cache.cancel ();
            }
            else {
              // 赤福P2Pによるsrc書き換えを少し待つ
              event.target.ownerDocument.defaultView
              .setTimeout (function (img) {
                if (/^akahuku:/.test (img.src)) {
                  waiting_for_p2p = true;
                  var request = getImgRequest (img);
                  if (!request || !(request.imageStatus & complete)) {
                    img.addEventListener ("load", cache_handler, false);
                    img.addEventListener ("error", cache_handler, false);
                  }
                  else {
                    cache.start ();
                  }
                }
                else {
                  // ダメ元でcacheを探してみる
                  cache.start ();
                }
              }, 500, event.target);
            }
          };
          cache.imageNode.addEventListener ("load", cache_handler, false);
          cache.imageNode.addEventListener ("error", cache_handler, false);
        }
        else {
          cache.start ();
        }
      }
      else {
        imageNode.style.visibility = "";
      }
    }
        
    Aima_AimaniNGCat.check (targetDocument, targetNode, targetAnchor,
                            threadNum, server, dir, imageNum,
                            imageNode, ngcat);
  }
};

/**
 * 文字コード変換器
 */
var Aima_AimaniConverter = {
  converter : null, /* nsIScriptableUnicodeConverter  文字コード変換器 */
    
  /**
   * 初期化処理
   */
  init : function () {
    Aima_AimaniConverter.converter
    = Cc ["@mozilla.org/intl/scriptableunicodeconverter"]
    .getService (Ci.nsIScriptableUnicodeConverter);
  },
    
  /**
   * UTF-8 から UTF-16 に変換する
   *
   * @param  String text
   *         UTF-8 の文字列
   * @return String
   *         UTF-16 に変換した文字列
   */
  convertFromUTF8 : function (text) {
    Aima_AimaniConverter.converter.charset = "UTF-8";
    return Aima_AimaniConverter.converter.ConvertToUnicode (text);
  }
};

/**
 * アドレスの情報
 *
 * @param  HTMLDocument targetDocument
 *         対象のドキュメント
 */
function Aima_AimaniLocationInfo (targetDocument) {
  this.init (targetDocument);
}
Aima_AimaniLocationInfo.prototype = {
  isFutaba : false,    /* Boolean  ふたば内かどうか
                        *   ユーザースタイルシート、サムネのチェック */
  isMonaca : false,    /* Boolean  避難所内かどうか
                        *   避難所固有の仕様への対応 */
    
  isNormal : false,    /* Boolean  通常表示かどうか */
  isCatalog : false,   /* Boolean カタログかどうか */
  isReply : false,     /* Boolean レス送信モードかどうか */
  isNotFound : false,  /* Boolean  404 かどうか */
    
  threadNumber : 0,    /* Number  スレ番号 */
    
  server : "",         /* String  サーバ名 */
  dir : "",            /* String  ディレクトリ名 */
    
  threadRule : 0,      /* Number  スレッドルール */
    
  /**
   * アドレス情報を設定する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   */
  init : function (targetDocument) {
    var location = targetDocument.documentURI;
    var title = targetDocument.title;
    var path = ""; /* 板のディレクトリ以下のパス */
        
    if (title.indexOf ("404 File Not Found") != -1) {
      this.isNotFound = true;
    }
        
    tryImportAkahuku ();
    if (typeof Akahuku !== "undefined") {
      try {
        location = Akahuku.protocolHandler.deAkahukuURI (location);
      }
      catch (e) { Cu.reportError (e);
      }
    }
        
    if (location.match
        (/^http:\/\/([^\/]+\/|(?:www\.)?logch\.info\/(?:proxy|logs)\/)?([^\.\/]+)\.2chan\.net(:[0-9]+)?\/(may\/b|[^\/]+)\/(.*)$/)) {
      /* RegExp.$1: 双助のアドレス */
      this.server = RegExp.$2;
      /* RegExp.$3: ポート番号 */
      this.dir = RegExp.$4;
      path = RegExp.$5;
            
      if (this.dir == "may/b") {
        this.dir = "may-b";
      }
            
      this.isFutaba = true;
    }
    else if (location.match
             (/http:\/\/nijibox\.dyndns\.dk\/akahuku\/catalog\/dat\/(view.php\?mode=cat2?)/)) {
      /* dat のタテログ */
      this.server = "dat";
      this.dir = "b";
      path = RegExp.$1;
            
      this.isFutaba = true;
    }
    else if (location.match
             (/http:\/\/akahuku\.dw\.land\.to\/catalog\/dat\/(view\.php\?mode=cat2?)/)) {
      /* dat のタテログ */
      this.server = "dat";
      this.dir = "b";
      path = RegExp.$1;
            
      this.isFutaba = true;
    }
    else if (location.match
             (/http:\/\/akahuku\.s278\.xrea\.com\/catalog\/dat\/(view\.php\?mode=cat2?)/)) {
      /* dat のタテログ */
      this.server = "dat";
      this.dir = "b";
      path = RegExp.$1;
            
      this.isFutaba = true;
    }
    else if (Aima_Aimani.enableBoardExternal) {
      for (var i = 0; i < Aima_Aimani.boardExternalList.length; i ++) {
        if (Aima_Aimani.boardExternalList [i][1] & 2) {
          if (targetDocument.documentURI.indexOf
              (Aima_Aimani.boardExternalList [i][0]) == 0) {
            this.server
            = Aima_Aimani.boardExternalList [i][0]
            .replace (/^https?:\/\//, "")
            .replace (/\/$/, "");
            this.dir = "?";
            path
            = targetDocument.documentURI.substr
            (Aima_Aimani.boardExternalList [i][0].length);
                    
            this.isMonaca
            = Aima_Aimani.boardExternalList [i][1] & 1;
                    
            break;
          }
        }
        else {
          if (targetDocument.documentURI.match
              (Aima_Aimani.boardExternalList [i][0])) {
            this.server = RegExp.$1;
            this.dir = RegExp.$2;
            path = RegExp.$3;
                    
            this.isMonaca
            = Aima_Aimani.boardExternalList [i][1] & 1;
                    
            break;
          }
        }
      }
    }
        
    if (path.match (/^((futaba|up|post|index|[0-9]+)\.html?)?([#\?].*)?$/)) {
      this.isNormal = true;
    }
    else if (path.match (/^futaba\.php\?mode=cat/)) {
      this.isCatalog = true;
    }
    /* タテログ patch */
    else if (path.match (/view\.php\?mode=cat2?/)) {
      this.isCatalog = true;
    }
    /* 避難所 patch */
    else if (path.match (/^cat.htm/)) {
      this.isCatalog = true;
    }
    else if (path.match (/^res\/([0-9]+)\.html?$/)
             || path.match (/^2\/([0-9]+)\.html?$/)
             || path.match (/^b\/([0-9]+)\.html?$/)
             || path.match (/^futaba\.php\?res=([0-9]+)$/)) {
      this.isReply = true;
      if (parseInt (RegExp.$1)) {
        this.threadNumber = parseInt (RegExp.$1);
      }
      else {
        this.threadNumber = 0;
      }
            
      if (Aima_Aimani.enableThreadRule) {
        var item = Aima_Aimani.arrayExists3 (Aima_Aimani.ThreadRuleList,
                                             this.threadNumber,
                                             this.server, this.dir);
        if (item) {
          this.threadRule = item [3];
        }
      }
    }
  }
};

/**
 * スタイルシート管理
 * (ファイルI/O無し)
 */
function Aima_AimaniStyle (name) {
  this.name = name;
  this.styleText = "";
  this.registeredData = null;
}
Aima_AimaniStyle.prototype = {
  type : Ci.nsIStyleSheetService.USER_SHEET,
  getStyleSheetService : function () {
    return Cc ["@mozilla.org/content/style-sheet-service;1"]
      .getService (Ci.nsIStyleSheetService);
  },
  register : function () {
    if (this.registeredData) {
      return;
    }
    var sss = this.getStyleSheetService ();
    var uri = this.getDataURI ();
    this.registeredData = {uri: uri, type: this.type};
    sss.loadAndRegisterSheet (uri, this.type);
  },
  unregister : function () {
    if (this.registeredData) {
      var sss = this.getStyleSheetService ();
      var uri = this.registeredData.uri;
      var type = this.registeredData.type;
      if (sss.sheetRegistered (uri, type)) {
        sss.unregisterSheet (uri, type);
      }
      this.registeredData = null;
    }
  },
  getDataURI : function () {
    var name = this.name ? "/*" + this.name.replace (/(\*\/|#)/,"") + "*/": "";
    var str = "data:text/css," + name + encodeURIComponent (this.styleText);
    var ios
      = Cc ["@mozilla.org/network/io-service;1"]
      .getService (Ci.nsIIOService);
    return ios.newURI (str, null, null);
  },
  setStyle : function (styleText) {
    this.styleText = styleText;
  },
};

/**
 * ドキュメントごとの情報
 */
function Aima_AimaniDocumentParam () {
  this.ngcat_caches = new Array ();
  this.ngcat_cacheManager = new Aima_AimaniNGCatCacheManager ();
}
Aima_AimaniDocumentParam.prototype = {
  targetDocument : null,
  location_info : null,
  popup_managerdata : null,
  lastImage : null,
  ngcat_cacheManager : null,
  ngcat_caches : null,
  ngcat_log : new Object (),
  ngcat_last : 0,
  ngcat_hideEntireThread_timerID : null,
  easyNG : false,
  easyNGLeftDown : false,
  easyNGLastX : 0,
  easyNGLastY : 0,
  easyNGMode : 0,/* 1： NG 番号消
                  * 2： NG 番号解除
                  * 3： NG カタログ消
                  * 4： NG カタログ解除 */

  destruct : function () {
    this.targetDocument = null;
    this.location_info = null;
    this.popup_managerdata = null;
    if (this.ngcat_cacheManager) {
      this.ngcat_cacheManager.destruct ();
    }
    this.ngcat_cacheManager = null;
  },
};

/**
 * 本体
 */
var Aima_Aimani = {
  documentParams : new Array (), /* Array  ドキュメントごとの情報 */
  latestParam : null,            /* Aima_AimaniDocumentParam
                                  *   ドキュメントごとの情報 */
    
  initialized : false,           /* Boolean  初期化フラグ */
  isParent : false,
    
  enableAll : false,             /* Boolean  全機能の ON／OFF */
    
  nearestExpireTime : 0,         /* Number  NG ワードの期限のうち最も近いもの */
    
  /* [一般] タブの設定 */
  enableHideWarning : false,          /* Boolean  警告を表示しない */
  enableHideStyle : false,            /* Boolean  NG 番号で本文をロード中にも
                                       *   表示しない */
  enableHideThreadStyle : false,      /* Boolean  ロード完了するまでスレッドを
                                       *   表示しない */
  enableHideCatStyle : false,         /* Boolean  ロード完了するまでカタログを
                                       *   表示しない */
  enableCatalogueUnlink : false,      /* Boolean  カタログで消したスレの
                                       *   リンクも消す */
  enableShowTextThreadReply : false,  /* Boolea レス送信モードでは文字スレを
                                       *   表示する */
    
  enablePopupMessage : false,         /* Boolean  本文をポップアップする */
  popupMessageDelay : 1000,           /* Boolean  ポップアップ表示まで [ms] */
    
  enableNGNumberCatalogue : false,    /* Boolean  カタログに [消] ボタン */
  enableBracket : false,              /* Boolean  カタログのボタンに
                                       *   括弧を付ける */
  bracketLeft : "[",                  /* String  カタログの括弧 */
  bracketRight : "]",                  /* String  カタログの括弧 */
  enableEasyNG : false,               /* Boolean  カタログに [一括 NG] ボタン */
  enableEasyNGType : "all_open",      /* String  表示方法 */
  enableEasyNGStartup : false,        /* Boolean  ロード時に NG 番号オン */
  enableNGNumberBottom : false,       /* Boolean  0 〜 10 ページで
                                       *   スレの末尾に [消] ボタン */
  enableNGNumberSelection : false,    /* Boolean  選択範囲を [消]／[解除] */
    
  enableHideEntireThread : false,     /* Boolean  スレを無かった事にする */
  enableHideEntireRes : false,        /* Boolean  レスを無かった事にする */
  enableHideEntireResInstant : false, /* Boolean  レスを即無かった事にする */

  /* [NG ワード] タブの設定 */
  enableNGWord : false, /* Boolean  NG ワード */
  NGWordList : {},      /* Object  NG ワードリスト
                         * <Number 対象, [RegExp NG ワード, ...]>
                         * Number  対象 (or で結合)
                         *         0x0001: 本文
                         *         0x0002: メル欄など
                         *         0x0100: スレ
                         *         0x0200: レス
                         *         0x0400: カタログ
                         *         0x8000: 大文字/小文字を区別しない */
    
  enableNGWordCont : false, /* Boolean  本文で同じ言葉の繰り返しを
                             *   NG ワードにする */
  NGWordContLength : 6,     /* Number  言葉の長さ */
  NGWordContCount : 3,      /* Number  言葉の回数 */
  NGWordContRegExp : null,  /* RegExp  使用する正規表現 */

  NGWordBoardSelectExList : new Object (), /* Object  動作しない板
                                            *   <String 板名,
                                            *    Boolean ダミー> */
    
  /* [NG サムネ] タブの設定 */
  enableNGThumbnail : false, /* Boolean  NG サムネ */
  NGThumbnailList : [],      /* Array  NG サムネリスト
                              * [[Number 幅, Number 高さ,
                              *   String バイト数, String 拡張子,
                              *   String コメント,
                              *   Number 回数, Number 最終更新日時], ...] */
    
  NGThumbnailBoardSelectExList : new Object (), /* Object  動作しない板
                                                 *   <String 板名,
                                                 *    Boolean ダミー> */
    
  /* [NG 番号] タブの設定 */
  enableNGNumber : false,           /* Boolean  NG 番号 */
  NGNumberList : [],                /* Array NG 番号リスト
                                     * [[Number NG 番号,
                                     *   String サーバ名, String ディレクトリ名,
                                     *   String 依存関係, Number 理由,
                                     *   Number 画像の番号], ...]
                                     *
                                     * String  依存関係
                                     *           NG 番号:   
                                     *           NG ワード: NG ワード_[o|x]
                                     *           NG サムネ:
                                     *             幅_高さ_バイト数_拡張子
                                     *           文字スレ:  
                                     *           スレッドルール:
                                     *             NG 番号_スレッドルール
                                     *
                                     * Number    理由
                                     */
  NGNumberExpire : 4000,            /* Number  有効期限 */
    
  REASON_NONE : -1,
  REASON_NG_NUMBER : 0, // NG 番号
  REASON_NG_WORD :   1, // NG ワード
  REASON_NG_THUMB :  2, // NG サムネ
  REASON_TEXT_THRE : 3, // 文字スレ
  REASON_TEXT_RES :  4, // 文字レス (not in list)
  REASON_NO_SAGE :   5, // sage 以外 (not in list)
  REASON_NG_CAT :    6, // NG カタログ
  REASON_SAGE :      7, // sage 以外 (not in list)
  REASON_FORCE :     9, // 強制表示

  /* [スレッドルール] タブの設定 */
  enableThreadRule : false,           /* Boolean  スレッドルール */
  ThreadRuleList : [],                /* Array スレッドルール
                                       * [[Number NG 番号,
                                       *   String サーバ名,
                                       *   String ディレクトリ名,
                                       *   Number スレッドルール], ...] */
  ThreadRuleExpire : 4000,            /* Number  有効期限 */
  ThreadRuleMiniThumbSize : 32,       /* Number  小さいサムネのサイズ */
  enableThreadRuleMiniThumbHover : false, /* Boolean  マウスを乗せた時だけ拡大 */

  THREADRULE_NO_TEXTRES : (1<<0), // 1: 文字レス非表示
  THREADRULE_SAGE_ONLY :  (1<<1), // 2: sage のみ表示
  THREADRULE_NO_SAGE :    (1<<2), // 4: sage 以外表示
  THREADRULE_MINI_THUMB : (1<<3), // 8: サムネを小さく表示
  THREADRULE_NO_IMG_RES : (1<<4), //16: 画像レス非表示
    
  /* [文字スレ非表示] */
  enableMiniThumb : false, /* Boolean  小サムネ */
    
  /* [文字スレ非表示] */
  enableTextThread : false, /* Boolean  文字スレ非表示 */
    
  /* [板] タブの設定 */
  enableBoardSelect : false,         /* Boolean  動作する板を指定する */
  boardSelectExList : new Object (), /* Object  動作しない板
                                      *   <String 板名, Boolean ダミー> */
    
  enableBoardExternal : false,      /* Boolean  外部の板 */
  boardExternalList : new Array (), /* Object  外部の板のリスト
                                     *   [[String 板名, Number フラグ], ...] */
    
  /* [その他] タブの設定 */
  enableToolbarPreferences : false,   /* Boolean ツールバーにパネルを表示する */
  enableToolbarNGWord : false,        /* Boolean ツールバーに
                                       * NG ワードパネルを表示する */
  enableStatusbarPreferences : false, /* Boolean ステータスバーに
                                       * パネルを表示する */
  enableStatusbarNGWord : false,      /* Boolean ステータスバーに
                                       * NG ワードパネルを表示する */
    
  styleSheet : new Aima_AimaniStyle ("Aima_Aimani"),

  /* 表示する文字列 */
  textHideNumber : "\u6D88",
  textShowNumber : "\u89E3",
  textForceHideNumber : "\u6D88",
  textForceShowNumber : "\u89E3",
  textHideThumbnail : "NG \u30B5\u30E0\u30CD",
  textShowThumbnail : "NG \u30B5\u30E0\u30CD\u89E3\u9664",
  textThreadRule : "\u30EB\u30FC\u30EB",
  textHideTextRes : "\u6587\u5B57\u30EC\u30B9\u6D88",
  textShowTextRes : "\u6587\u5B57\u30EC\u30B9\u89E3\u9664",
  textHideImageRes : "\u753B\u50CF\u30EC\u30B9\u6D88",
  textShowImageRes : "\u753B\u50CF\u30EC\u30B9\u89E3\u9664",
  textHideSageOnly : "\u975E sage \u30EC\u30B9\u6D88",
  textShowSageOnly : "\u975E sage \u30EC\u30B9\u89E3\u9664",
  textHideNotSage : "sage \u30EC\u30B9\u6D88",
  textShowNotSage : "sage \u30EC\u30B9\u89E3\u9664",
  textHideMiniThumb : "\u5C0F\u30B5\u30E0\u30CD",
  textShowMiniThumb : "\u5C0F\u30B5\u30E0\u30CD\u89E3\u9664",
  textSelectRes : "\u7BC4\u56F2",
  textSelectResFrom : "\u958B\u59CB",
  textSelectResTo : "\u7D42\u4E86",
  textSelectResReset : "\u4E2D\u6B62",
    
  textEasyNGStart : "\u4E00\u62EC NG",
  textEasyNGStop : "\u7D42\u4E86",
    
  textHideCatalogue : "\u6D88",
  textShowCatalogue : "\u89E3",
    
  textHiddenCatalogue : ["\u756A\u53F7",
                         "\u30EF\u30FC\u30C9",
                         "\u30B5\u30E0\u30CD",
                         "\u6587\u5B57",
                         "", /* 文字レス */
                         "", /* sage レス */
                         "NG \u30AB\u30BF",
                         ""],
    
  textReasons : ["NG \u756A\u53F7",
                 "NG \u30EF\u30FC\u30C9",
                 "NG \u30B5\u30E0\u30CD",
                 "\u6587\u5B57\u30B9\u30EC",
                 "\u6587\u5B57\u30EC\u30B9",
                 "\u975E sage \u30EC\u30B9",
                 "NG \u30AB\u30BF\u30ED\u30B0",
                 "sage \u30EC\u30B9",
                 "",
                 "\u5F37\u5236\u8868\u793A\u89E3\u9664"],
    
  /* 共通CSSセレクタ */
  styleCatalogueTableSelector : "table + table" +
    ",#akahuku_catalog_reload_container + table" +
    ",#akahuku_catalog_reorder_container2 + table",

  /**
   * 初期化
   */
  init : function () {
    if (Aima_Aimani.initialized) {
      return;
    }
    Aima_Aimani.initialized = true;

    Aima_AimaniConfigManager.init ();
    Aima_AimaniConverter.init ();
  },

  /**
   * 初期化(Chrome process)
   */
  initAsParent : function () {
    if (Aima_Aimani.initialized) {
      return;
    }
    Aima_Aimani.initialized = true;
    Aima_Aimani.isParent = true;

    Aima_AimaniConfigManager.initAsParent ();
    Aima_AimaniConverter.init ();
  },

  term : function () {
    if (!Aima_Aimani.initialized) {
      return;
    }
    Aima_Aimani.initialized = false;
    Aima_Aimani.isParent = false;

    Aima_AimaniConfigManager.term ();
  },

  /**
   * ドキュメントごとの情報を追加する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  info
   */
  addDocumentParam : function (targetDocument, info) {
    var param = new Aima_AimaniDocumentParam ();
    param.targetDocument = targetDocument;
    param.location_info = info;
    Aima_Aimani.documentParams.push (param);
    Aima_Aimani.latestParam = param;

    // Chrome process (XUL) に通知
    var mm = this.getContentFrameMessageManager (targetDocument);
    if (mm) {
      var data = {
        url: targetDocument.documentURI,
        info: {
          isFutaba : info.isFutaba,
          isMonaca : info.isMonaca,
          isNormal : info.isNormal,
          isCatalog : info.isCatalog,
          isReply : info.isReply,
          isNotFound : info.isNotFound,
          threadNumber : info.threadNumber,
          server : info.server,
          dir : info.dir,
        },
      };
      mm.sendAsyncMessage ("Aima_Aimani:addDocumentParam", data);
    }
  },
    
  /**
   * ドキュメントごとの情報を削除する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   */
  deleteDocumentParam : function (targetDocument) {
    for (var i = 0; i < Aima_Aimani.documentParams.length; i ++) {
      var tmp = Aima_Aimani.documentParams [i];
      if (tmp.targetDocument == targetDocument) {
        Aima_Aimani.documentParams.splice (i, 1);
        tmp.destruct ();
        tmp = null;

        // Chrome process に通知
        var mm = this.getContentFrameMessageManager (targetDocument);
        if (mm) {
          var data = {url: targetDocument.documentURI};
          mm.sendAsyncMessage ("Aima_Aimani:deleteDocumentParam", data);
        }
        break;
      }
    }
    Aima_Aimani.latestParam = null;
  },

  getContentFrameMessageManager : function (targetDocument) {
    return targetDocument.defaultView
      .QueryInterface (Ci.nsIInterfaceRequestor)
      .getInterface (Ci.nsIWebNavigation)
      .QueryInterface (Ci.nsIInterfaceRequestor)
      .QueryInterface (Ci.nsIDocShell)
      .QueryInterface (Ci.nsIInterfaceRequestor)
      .getInterface (Ci.nsIContentFrameMessageManager);
  },
    
  /*
   * ドキュメントごとの情報を取得する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @return Aima_AimaniDocumentParam
   *         ドキュメントごとの情報
   */
  getDocumentParam : function (targetDocument) {
    var latest = Aima_Aimani.latestParam;
    if (latest
        && latest.targetDocument == targetDocument) {
      return latest;
    }
        
    for (var i = 0; i < Aima_Aimani.documentParams.length; i ++) {
      if (Aima_Aimani.documentParams [i].targetDocument
          == targetDocument) {
                
        return Aima_Aimani.documentParams [i];
      }
    }
        
    return null;
  },
    
  /**
   * 操作用のアンカーがクリックされたイベント
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLAnchorElement target
   *         対象のノード
   * @param  String type
   *         アンカーの内容
   *           (method)_(subtype)_(num)_(imageNum)(_additional)?
   * @param  Boolean update
   *         設定に反映するか
   * @param  Boolean save
   *         保存するか
   * @return Boolean
   *         操作用のアンカーだったか
   */
  onAnchorClick : function (targetDocument, target, type, update, save) {
    if (type && type.match (/^([^_]+)_([^_]+)_([^_]+)_([^_]+)(_(.+))?$/)) {
      var method, subtype, num, imageNum, additional;
      var tmpNode;
      var text = "";
      var mod_thumbnail = false;
      var mod_cat = false;
      var mod_thread_rule = false;
            
      var notupdated = false;
            
      method = RegExp.$1;
      subtype = RegExp.$2;
      num = parseInt (RegExp.$3);
      imageNum = parseInt (RegExp.$4);
      if (RegExp.$5) {
        additional = RegExp.$6;
      }
      else {
        additional = "";
      }
            
      var div = Aima_Aimani.findParentNode (target, "div");
            
      var param
      = Aima_Aimani.getDocumentParam (targetDocument);
      var info = param.location_info;
            
      if (method == "hide") {
        if (subtype == "thread") {
          var scroll = false;
          if (additional
              && additional
              .match (/^([^_]+)_([^_]+)_([^_]+)_([^_]+)_(.+)$/)) {
            var width, height, bytes, ext, comment;
            width = RegExp.$1;
            height = RegExp.$2;
            bytes = RegExp.$3;
            ext = RegExp.$4;
            comment = unescape (RegExp.$5);
                        
            tmpNode
              = Aima_Aimani.hideThread
              (targetDocument,
               target,
               Aima_Aimani.REASON_NG_THUMB, false);
                        
            if (update) {
              Aima_Aimani.addNGThumbnail (width, height, bytes,
                                          ext, comment);
              mod_thumbnail = true;
                            
              Aima_Aimani.addNGNumber (num, info.server, info.dir,
                                       width + "_" + height + "_"
                                       + bytes + "_" + ext,
                                       Aima_Aimani.REASON_NG_THUMB, imageNum);
                            
            }
            text = Aima_Aimani.textShowThumbnail;
          }
          else {
            if (additional == "header") {
              additional = "";
              var newNode;
                            
              var targetAnchor = target.previousSibling;
              targetAnchor.style.display = "none";
              if (!Aima_Aimani.enableHideWarning) {
                newNode
                  = Aima_Aimani.createWarning
                  (targetDocument,
                   Aima_Aimani.textReasons [Aima_Aimani.REASON_NG_NUMBER]);
                target.parentNode.insertBefore (newNode,
                                                target);
              }
              newNode
                = Aima_Aimani.createAnchor
                (targetDocument,
                 "show_thread_" + num + "_" + imageNum + "_header",
                 Aima_Aimani.textShowNumber, true);
              newNode.style.fontSize = "8pt";
              target.parentNode.insertBefore (newNode, target);
                            
              var lastTarget = target;
              target = null;
              var nodes
                = targetDocument.getElementsByTagName ("small");
              for (var i = 0; i < nodes.length; i ++) {
                var node = nodes [i];
                if (node == lastTarget) {
                  continue;
                }
                var type2 = node.getAttribute ("name");
                if (type == type2 + "_header") {
                  target = node;
                }
              }
              lastTarget.parentNode.removeChild (lastTarget);
                            
              if (!target) {
                return true;
              }
            }
                        
            tmpNode
              = Aima_Aimani.hideThread
              (targetDocument,
               target,
               Aima_Aimani.REASON_NG_NUMBER, false);
                        
            if (update) {
              Aima_Aimani.addNGNumber (num, info.server, info.dir,
                                       "", Aima_Aimani.REASON_NG_NUMBER, imageNum);
            }
                        
            text = Aima_Aimani.textShowNumber;
          }
                    
          if (additional == "bottom") {
            scroll = true;
          }
                    
          if (tmpNode) {
            var newNode;
            if (additional) {
              additional = "_" + additional;
            }
            else {
              additional = "";
            }

            newNode
              = Aima_Aimani.createAnchor
              (targetDocument,
               "show_thread_" + num + "_" + imageNum + additional,
               text, true);
            tmpNode.parentNode.insertBefore (newNode, tmpNode);
                        
            if (scroll) {
              var y = 0;
              for (var tmp = newNode; tmp;
                   tmp = tmp.offsetParent) {
                y += tmp.offsetTop;
              }
              if (y < targetDocument.body.scrollTop) {
                var targetWindow = targetDocument.defaultView;
                if (targetWindow) {
                  targetWindow.scrollTo (0, (y < 0) ? 0 : y);
                }
              }
            }
          }
        }
        else if (subtype == "res") {
          if (additional
              && additional
              .match (/^([^_]+)_([^_]+)_([^_]+)_([^_]+)_(.+)$/)) {
            var width, height, bytes, ext, comment;
            width = RegExp.$1;
            height = RegExp.$2;
            bytes = RegExp.$3;
            ext = RegExp.$4;
            comment = unescape (RegExp.$5);
                        
            tmpNode
              = Aima_Aimani
              .hideRes (targetDocument, target,
                        Aima_Aimani.REASON_NG_THUMB,
                        Aima_Aimani.enableHideEntireRes
                        && Aima_Aimani.enableHideEntireResInstant,
                        num, imageNum, false);
                        
            if (update) {
              Aima_Aimani.addNGThumbnail (width, height, bytes,
                                          ext, comment);
              mod_thumbnail = true;
                            
              Aima_Aimani.addNGNumber (num,
                                       info.server, info.dir, 
                                       width + "_" + height + "_"
                                       + bytes + "_" + ext,
                                       Aima_Aimani.REASON_NG_THUMB, imageNum);
            }
                        
            text = Aima_Aimani.textShowThumbnail;
          }
          else {
            tmpNode
              = Aima_Aimani
              .hideRes (targetDocument, target,
                        Aima_Aimani.REASON_NG_NUMBER,
                        Aima_Aimani.enableHideEntireRes
                        && Aima_Aimani.enableHideEntireResInstant,
                        num, imageNum, false);
                        
            if (update) {
              Aima_Aimani.addNGNumber (num, info.server, info.dir,
                                       "", Aima_Aimani.REASON_NG_NUMBER, imageNum);
            }
                        
            text = Aima_Aimani.textShowNumber;
          }
                    
          if (tmpNode) {
            var newNode;
            if (additional) {
              additional = "_" + additional;
            }
            else {
              additional = "";
            }

            newNode
              = Aima_Aimani.createAnchor
              (targetDocument,
               "show_res_" + num + "_" + imageNum + additional,
               text, true);
            tmpNode.appendChild (newNode);
          }
        }
        else if (subtype == "catalogue") {
          Aima_Aimani.hideCatalogue (targetDocument, target,
                                     Aima_Aimani.REASON_NG_NUMBER, false);
                    
          if (update) {
            Aima_Aimani.addNGNumber (num, info.server, info.dir,
                                     "", Aima_Aimani.REASON_NG_NUMBER, imageNum);
          }
                    
          Aima_Aimani.setText (target,
                               Aima_Aimani.bracketLeft
                               + Aima_Aimani.textShowCatalogue
                               + Aima_Aimani.bracketRight);
          target.setAttribute ("name",
                               "show_catalogue_"
                               + num + "_" + imageNum);
        }
        else if (subtype == "ngcat") {
          if (additional
              && additional
              .match (/([0-9]+)_([0-9]+)_(.+)/)) {
            var width = RegExp.$1;
            var height = RegExp.$2;
            var hash = RegExp.$3;
                        
            Aima_Aimani.hideCatalogue (targetDocument, target,
                                       Aima_Aimani.REASON_NG_CAT, false);
                        
            Aima_AimaniNGCat.addNGCat (width, height, hash,
                                       "");
                        
            if (update) {
              Aima_Aimani.addNGNumber (num, info.server, info.dir,
                                       additional, Aima_Aimani.REASON_NG_CAT, imageNum);
            }
                        
            Aima_Aimani.setText (target,
                                 Aima_Aimani.bracketLeft
                                 + Aima_AimaniNGCat.textShowNGCat
                                 + Aima_Aimani.bracketRight);
            target.setAttribute ("name",
                                 "show_ngcat_"
                                 + num + "_" + imageNum
                                 + "_" + additional);
          }
          else {
            var targetNode
              = Aima_Aimani.findParentNode (target, "td");
                        
            var targetAnchors
              = targetNode.getElementsByTagName ("a");
                        
            for (var j = 0; j < targetAnchors.length; j ++) {
              var targetAnchor = targetAnchors [j];
                            
              var href;
              href = targetAnchor.getAttribute ("href")
                || targetAnchor.getAttribute ("name");
              if (href
                  && (href.match (/res\/([0-9]+)/)
                      || href.match (/2\/([0-9]+)/)
                      || href.match (/b\/([0-9]+)/)
                      || href.match (/\?res=([0-9]+)/))) {
                var node = targetAnchor.firstChild;
                while (node) {
                  if (node.nodeName.toLowerCase () == "img"
                      && node.getAttribute ("src").match
                      (/cat\/([0-9]+)/)) {
                    var imageNode = node;
                    break;
                  }
                  node = node.nextSibling;
                }
                break;
              }
            }
                        
            var cache = new Aima_AimaniNGCatCache ();
            cache.targetNode = targetNode;
            cache.targetAnchor = targetAnchor;
            cache.threadNum = num;
            cache.server = info.server;
            cache.dir = info.dir;
            cache.imageNum = imageNum;
            cache.imageNode = imageNode;
            cache.hiding = true;
            cache.anchor = target;
            param.ngcat_cacheManager.addNGCatCache (cache);
            cache.start ();
          }
        }
        else if (subtype == "textres") {
          info.threadRule |= Aima_Aimani.THREADRULE_NO_TEXTRES;
          Aima_Aimani.apply (targetDocument,
                             false,
                             false,
                             false,
                             false,
                             false,
                             true,
                             []);
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            Aima_Aimani.addThreadRule (num,
                                       info.server, info.dir,
                                       imageNum);
            mod_thread_rule = true;
          }
        }
        else if (subtype == "imageres") {
          info.threadRule |= Aima_Aimani.THREADRULE_NO_IMG_RES;
          Aima_Aimani.apply (targetDocument,
                             false,
                             false,
                             false,
                             false,
                             false,
                             true,
                             []);
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            Aima_Aimani.addThreadRule (num,
                                       info.server, info.dir,
                                       imageNum);
            mod_thread_rule = true;
          }
        }
        else if (subtype == "sageonly") {
          info.threadRule |= Aima_Aimani.THREADRULE_SAGE_ONLY;
          Aima_Aimani.apply (targetDocument,
                             false,
                             false,
                             false,
                             false,
                             false,
                             true,
                             []);
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            Aima_Aimani.addThreadRule (num,
                                       info.server, info.dir,
                                       imageNum);
            mod_thread_rule = true;
          }
        }
        else if (subtype == "notsage") {
          info.threadRule |= Aima_Aimani.THREADRULE_NO_SAGE;
          Aima_Aimani.apply (targetDocument,
                             false,
                             false,
                             false,
                             false,
                             false,
                             true,
                             []);
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            Aima_Aimani.addThreadRule (num,
                                       info.server, info.dir,
                                       imageNum);
            mod_thread_rule = true;
          }
        }
        else if (subtype == "minithumb") {
          info.threadRule |= Aima_Aimani.THREADRULE_MINI_THUMB;
          Aima_Aimani.apply (targetDocument,
                             false,
                             false,
                             false,
                             false,
                             false,
                             true,
                             []);
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            Aima_Aimani.addThreadRule (num,
                                       info.server, info.dir,
                                       imageNum);
            mod_thread_rule = true;
          }
        }
      }
      else if (method == "show") {
        if (subtype == "thread") {
          if (additional
              && additional
              .match (/^([^_]+)_([^_]+)_([^_]+)_([^_]+)_(.+)$/)) {
            var width, height, bytes, ext, comment;
            width = RegExp.$1;
            height = RegExp.$2;
            bytes = RegExp.$3;
            ext = RegExp.$4;
            comment = unescape (RegExp.$5);
                        
            if (update) {
              Aima_Aimani.deleteNGThumbnail (width, height, bytes,
                                             ext);
              mod_thumbnail = true;
            }
                        
            text = Aima_Aimani.textHideThumbnail;
          }
          else {
            if (additional == "header") {
              additional = "";
              var newNode;
                            
              var targetWarning = target.previousSibling;
              if ("className" in targetWarning
                  && targetWarning.className
                  == "aima_aimani_warning") {
                targetWarning.parentNode.removeChild
                  (targetWarning);
              }
              var targetAnchor = target.previousSibling;
              targetAnchor.style.display = "";
              newNode
              = Aima_Aimani.createAnchor
              (targetDocument,
               "hide_thread_" + num + "_" + imageNum + "_header",
               Aima_Aimani.textHideNumber, true);
              newNode.style.fontSize = "8pt";
              target.parentNode.insertBefore (newNode, target);
                            
              var lastTarget = target;
              target = null;
              var nodes
              = targetDocument.getElementsByTagName ("small");
              for (var i = 0; i < nodes.length; i ++) {
                var node = nodes [i];
                if (node == lastTarget) {
                  continue;
                }
                var type2 = node.getAttribute ("name");
                if (type == type2 + "_header") {
                  target = node;
                }
              }
              lastTarget.parentNode.removeChild (lastTarget);
            }
                        
            text = Aima_Aimani.textHideNumber;
          }
                    
          if (update) {
            Aima_Aimani.deleteNGNumber (num, info.server, info.dir);
          }
                    
          if (additional) {
            additional = "_" + additional;
          }
          else {
            additional = "";
          }

          if (target) {
            Aima_Aimani.setText (target, "[" + text + "]");
            target.setAttribute ("name",
                                 "hide_thread_" + num + "_"
                                 + imageNum
                                 + additional);
                        
            var warningNode = null;
            var nextNode = null;
            if (target.previousSibling
                && "className" in target.previousSibling
                && target.previousSibling.className
                == "aima_aimani_warning") {
              warningNode = target.previousSibling;
              nextNode = target;
            }
            if (target.previousSibling.previousSibling
                && "className"
                in target.previousSibling.previousSibling
                && target.previousSibling.previousSibling.className
                == "aima_aimani_warning") {
              warningNode
              = target.previousSibling.previousSibling;
              nextNode = target.previousSibling;
            }
            if (warningNode) {
              warningNode.parentNode
              .removeChild (warningNode);
                            
              var newNode
              = Aima_Aimani.createWarning
              (targetDocument,
               "\u89E3\u9664\u3057\u307E\u3057\u305F");
              target.parentNode.insertBefore (newNode, nextNode);
            }
          }
        }
        else if (subtype == "res") {
          var container = Aima_Aimani.getMessageContainer (target);
          if (!container
              || Aima_Aimani.hasClassName
              (container.main, "aima_aimani_hidden")) {
            var hidden
              = Aima_Aimani.findParentNodeByClassName
              (target, "aima_aimani_hidden");
            container
              = Aima_Aimani.getMessageContainer
              (hidden.previousSibling.firstChild);
          }
          
          if (update) {
            Aima_Aimani.deleteNGNumber (num, info.server, info.dir);
          }
                    
          if (additional
              && additional
              .match (/^([^_]+)_([^_]+)_([^_]+)_([^_]+)_(.+)$/)) {
            var width, height, bytes, ext, comment;
            width = RegExp.$1;
            height = RegExp.$2;
            bytes = RegExp.$3;
            ext = RegExp.$4;
            comment = unescape (RegExp.$5);
                        
            if (update) {
              Aima_Aimani.deleteNGThumbnail (width, height, bytes,
                                             ext);
            }
            mod_thumbnail = true;
          }
          
          Aima_Aimani.showRes (targetDocument,
                               container, true, false);
        }
        else if (subtype == "catalogue") {
          Aima_Aimani.showCatalogue (targetDocument, target);
                    
          if (update) {
            Aima_Aimani.deleteNGNumber (num, info.server, info.dir);
          }
                    
          Aima_Aimani.setText (target,
                               Aima_Aimani.bracketLeft
                               + Aima_Aimani.textHideCatalogue
                               + Aima_Aimani.bracketRight);
          target.setAttribute ("name",
                               "hide_catalogue_"
                               + num + "_" + imageNum);
        }
        else if (subtype == "ngcat") {
          if (additional
              && additional
              .match (/([0-9]+)_([0-9]+)_(.+)/)) {
            var width = RegExp.$1;
            var height = RegExp.$2;
            var hash = RegExp.$3;
                        
            Aima_Aimani.showCatalogue (targetDocument, target);
                        
            Aima_AimaniNGCat.deleteNGCat (width, height, hash);
                        
            if (update) {
              Aima_Aimani.deleteNGNumber (num,
                                          info.server, info.dir);
            }
                        
            Aima_Aimani.setText (target,
                                 Aima_Aimani.bracketLeft
                                 + Aima_AimaniNGCat.textHideNGCat
                                 + Aima_Aimani.bracketRight);
            target.setAttribute ("name",
                                 "hide_ngcat_"
                                 + num + "_" + imageNum
                                 + "_" + additional);
          }
        }
        else if (subtype == "textres") {
          info.threadRule ^= Aima_Aimani.THREADRULE_NO_TEXTRES;
                    
          Aima_Aimani.showThreadRule (targetDocument);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            if (imageNum) {
              Aima_Aimani.addThreadRule (num,
                                         info.server, info.dir,
                                         imageNum);
            }
            mod_thread_rule = true;
          }
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
        }
        else if (subtype == "imageres") {
          info.threadRule ^= Aima_Aimani.THREADRULE_NO_IMG_RES;
                    
          Aima_Aimani.showThreadRule (targetDocument);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            if (imageNum) {
              Aima_Aimani.addThreadRule (num,
                                         info.server, info.dir,
                                         imageNum);
            }
            mod_thread_rule = true;
          }
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
        }
        else if (subtype == "sageonly") {
          info.threadRule ^= Aima_Aimani.THREADRULE_SAGE_ONLY;
                    
          Aima_Aimani.showThreadRule (targetDocument);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            if (imageNum) {
              Aima_Aimani.addThreadRule (num,
                                         info.server, info.dir,
                                         imageNum);
            }
            mod_thread_rule = true;
          }
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
        }
        else if (subtype == "notsage") {
          info.threadRule ^= Aima_Aimani.THREADRULE_NO_SAGE;
                    
          Aima_Aimani.showThreadRule (targetDocument);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            if (imageNum) {
              Aima_Aimani.addThreadRule (num,
                                         info.server, info.dir,
                                         imageNum);
            }
            mod_thread_rule = true;
          }
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
        }
        else if (subtype == "minithumb") {
          info.threadRule ^= Aima_Aimani.THREADRULE_MINI_THUMB;
                    
          Aima_Aimani.apply (targetDocument,
                             false,
                             false,
                             false,
                             false,
                             false,
                             true,
                             []);
                    
          if (update) {
            Aima_Aimani.deleteThreadRule (num,
                                          info.server, info.dir);
            if (imageNum) {
              Aima_Aimani.addThreadRule (num,
                                         info.server, info.dir,
                                         imageNum);
            }
            mod_thread_rule = true;
          }
                    
          var span = Aima_Aimani.findParentNode (target, "span");
          var name = "rule_open_" + num + "_" + imageNum;
          span.previousSibling.setAttribute ("name", name);
          span.previousSibling.style.color = "#627f29";
          span.parentNode.removeChild (span);
        }
      }
      else if (method == "forcehide") {
        if (subtype == "thread") {
          if (additional == "header") {
            additional = "";
            var newNode;
                            
            var targetAnchor = target.previousSibling;
            targetAnchor.style.display = "none";
            if (!Aima_Aimani.enableHideWarning) {
              newNode
                = Aima_Aimani.createWarning
                (targetDocument,
                 Aima_Aimani.textReasons [Aima_Aimani.REASON_FORCE]);
              target.parentNode.insertBefore (newNode,
                                              target);
            }
            newNode
            = Aima_Aimani.createAnchor
            (targetDocument,
             "forceshow_thread_" + num + "_" + imageNum + "_header",
             Aima_Aimani.textShowNumber, true);
            newNode.style.fontSize = "8pt";
            target.parentNode.insertBefore (newNode, target);
                            
            var lastTarget = target;
            target = null;
            var nodes
            = targetDocument.getElementsByTagName ("small");
            for (var i = 0; i < nodes.length; i ++) {
              var node = nodes [i];
              if (node == lastTarget) {
                continue;
              }
              var type2 = node.getAttribute ("name");
              if (type == type2 + "_header") {
                target = node;
              }
            }
            lastTarget.parentNode.removeChild (lastTarget);
                            
            if (!target) {
              return true;
            }
          }
                        
          if (update) {
            Aima_Aimani.deleteNGNumber (num, info.server, info.dir);
          }
                    
          tmpNode
          = Aima_Aimani.hideThread
          (targetDocument,
           target,
           Aima_Aimani.REASON_FORCE, false);
                    
          var newNode
          = Aima_Aimani.createAnchor
          (targetDocument,
           "forceshow_thread_" + num + "_" + imageNum + additional,
           Aima_Aimani.textForceShowNumber, true);
                    
          tmpNode.parentNode.insertBefore (newNode, tmpNode);
        }
        else if (subtype == "res") {
          if (update) {
            Aima_Aimani.deleteNGNumber (num, info.server, info.dir);
          }
                    
          tmpNode
          = Aima_Aimani
          .hideRes (targetDocument, target,
                    Aima_Aimani.REASON_FORCE,
                    Aima_Aimani.enableHideEntireRes
                    && Aima_Aimani.enableHideEntireResInstant,
                    num, imageNum, true);
        }
        else if (subtype == "catalogue") {
          Aima_Aimani.hideCatalogue (targetDocument, target,
                                     Aima_Aimani.REASON_NG_NUMBER, false);
                    
          if (update) {
            Aima_Aimani.deleteNGNumber (num, info.server, info.dir);
            Aima_Aimani.addNGNumber (num, info.server, info.dir,
                                     "", Aima_Aimani.REASON_NG_NUMBER, imageNum);
          }
          Aima_Aimani.setText (target,
                               Aima_Aimani.bracketLeft
                               + Aima_Aimani.textShowCatalogue
                               + Aima_Aimani.bracketRight);
          target.setAttribute ("name",
                               "show_catalogue_"
                               + num + "_" + imageNum);
        }
      }
      else if (method == "forceshow") {
        if (subtype == "thread") {
          if (additional == "header") {
            additional = "";
            var newNode;
                            
            var targetWarning = target.previousSibling;
            if ("className" in targetWarning
                && targetWarning.className
                == "aima_aimani_warning") {
              targetWarning.parentNode.removeChild
                (targetWarning);
            }
            var targetAnchor = target.previousSibling;
            targetAnchor.style.display = "";
            newNode
            = Aima_Aimani.createAnchor
            (targetDocument,
             "forcehide_thread_" + num + "_" + imageNum + "_header",
             Aima_Aimani.textHideNumber, true);
            newNode.style.fontSize = "8pt";
            target.parentNode.insertBefore (newNode, target);
                            
            var lastTarget = target;
            target = null;
            var nodes
            = targetDocument.getElementsByTagName ("small");
            for (var i = 0; i < nodes.length; i ++) {
              var node = nodes [i];
              if (node == lastTarget) {
                continue;
              }
              var type2 = node.getAttribute ("name");
              if (type == type2 + "_header") {
                target = node;
              }
            }
            lastTarget.parentNode.removeChild (lastTarget);
          }
                        
          if (update) {
            Aima_Aimani.deleteNGNumber (num, info.server, info.dir);
            Aima_Aimani.addNGNumber (num, info.server, info.dir,
                                     "", Aima_Aimani.REASON_FORCE, imageNum);
          }
                    
          text = Aima_Aimani.textForceHideNumber;
          var name = "forcehide_thread_" + num + "_" + imageNum;
          target.setAttribute ("name", name);
          Aima_Aimani.setText (target,
                               "[" + text + "]");
        }
        else if (subtype == "res") {
          var container = Aima_Aimani.getMessageContainer (target);
          if (!container
              || Aima_Aimani.hasClassName
              (container.main, "aima_aimani_hidden")) {
            var hidden
              = Aima_Aimani.findParentNodeByClassName
              (target, "aima_aimani_hidden");
            container
              = Aima_Aimani.getMessageContainer
              (hidden.previousSibling.firstChild);
          }
                    
          Aima_Aimani.showRes (targetDocument,
                               container, true, true);
                    
          if (update) {
            Aima_Aimani.deleteNGNumber (num, info.server, info.dir);
            Aima_Aimani.addNGNumber (num, info.server, info.dir,
                                     "", Aima_Aimani.REASON_FORCE, imageNum);
          }
        }
      }
            
      if (method == "rule") {
        if (subtype == "open") {
          target.style.color = "red";
                    
          var newNode;
          newNode = targetDocument.createElement ("span");
          newNode.style.fontSize = "10pt";
          newNode.className = "aima_aimani_generated";
          var containerAnchor = newNode;
                    
          newNode
          = targetDocument.createTextNode ("\uFF08");
          containerAnchor
          .appendChild (newNode);
                    
          var name, text;
          if (imageNum & 1) {
            name = "show_textres_" + num + "_" + (imageNum ^ 1);
            text = Aima_Aimani.textShowTextRes;
          }
          else {
            name = "hide_textres_" + num + "_" + (imageNum | 1);
            text = Aima_Aimani.textHideTextRes;
          }
          newNode
          = Aima_Aimani.createAnchor
          (targetDocument,
           name, text, true);
          newNode.style.color = "red";
          containerAnchor
          .appendChild (newNode);
                    
          newNode
          = targetDocument.createTextNode ("\uFF0F");
          containerAnchor
          .appendChild (newNode);
                    
          if (imageNum & 16) {
            name = "show_imageres_" + num + "_" + (imageNum ^ 16);
            text = Aima_Aimani.textShowImageRes;
          }
          else {
            name = "hide_imageres_" + num + "_" + (imageNum | 16);
            text = Aima_Aimani.textHideImageRes;
          }
          newNode
          = Aima_Aimani.createAnchor
          (targetDocument,
           name, text, true);
          newNode.style.color = "red";
          containerAnchor
          .appendChild (newNode);
                    
          newNode
          = targetDocument.createTextNode ("\uFF0F");
          containerAnchor
          .appendChild (newNode);
                    
          if (imageNum & 2) {
            name = "show_sageonly_" + num + "_" + (imageNum ^ 2);
            text = Aima_Aimani.textShowSageOnly;
          }
          else {
            name = "hide_sageonly_" + num + "_" + (imageNum | 2);
            text = Aima_Aimani.textHideSageOnly;
          }
          newNode
          = Aima_Aimani.createAnchor
          (targetDocument,
           name, text, true);
          newNode.style.color = "red";
          containerAnchor
          .appendChild (newNode);
                    
          newNode
          = targetDocument.createTextNode ("\uFF0F");
          containerAnchor
          .appendChild (newNode);
                    
          if (imageNum & 4) {
            name = "show_notsage_" + num + "_" + (imageNum ^ 4);
            text = Aima_Aimani.textShowNotSage;
          }
          else {
            name = "hide_notsage_" + num + "_" + (imageNum | 4);
            text = Aima_Aimani.textHideNotSage;
          }
          newNode
          = Aima_Aimani.createAnchor
          (targetDocument,
           name, text, true);
          newNode.style.color = "red";
          containerAnchor
          .appendChild (newNode);
                    
          newNode
          = targetDocument.createTextNode ("\uFF0F");
          containerAnchor
          .appendChild (newNode);
                    
          if (imageNum & 8) {
            name = "show_minithumb_" + num + "_" + (imageNum ^ 8);
            text = Aima_Aimani.textShowMiniThumb;
          }
          else {
            name = "hide_minithumb_" + num + "_" + (imageNum | 8);
            text = Aima_Aimani.textHideMiniThumb;
          }
          newNode
          = Aima_Aimani.createAnchor
          (targetDocument,
           name, text, true);
          newNode.style.color = "red";
          containerAnchor
          .appendChild (newNode);
                    
          newNode
          = targetDocument.createTextNode ("\uFF09");
          containerAnchor
          .appendChild (newNode);
                    
          target.parentNode
          .insertBefore (containerAnchor,
                         target.nextSibling);
                    
          target.setAttribute ("name",
                               "rule_close_"
                               + num + "_" + imageNum);
        }
        else {
          target.style.color = "#627f29";
                    
          if (target.nextSibling
              && "className" in target.nextSibling
              && target.nextSibling.className
              == "aima_aimani_generated") {
            target.parentNode.removeChild (target.nextSibling);
          }
                    
          target.setAttribute ("name",
                               "rule_open_"
                               + num + "_" + imageNum);
        }
      }
      if (method == "easyng") {
        if (subtype == "open") {
          if (Aima_Aimani.enableEasyNGType == "all_close") {
            target.style.color = "#ff0000";
            target.nextSibling.style.display = "";
            target.setAttribute ("name",
                                 "easyng_close_0_0");
          }
        }
        else if (subtype == "close") {
          if (target.nextSibling
              && "className" in target.nextSibling
              && target.nextSibling.className
              == "aima_aimani_generated") {
          }
          else {
            target.style.color = "#627f29";
            notupdated = true;
            target.setAttribute ("name",
                                 "easyng_hidenumber_1_0");
          }
        }
        else if (subtype == "hidenumber") {
          notupdated = true;
                    
          if (num == 1) {
            Aima_Aimani.setText (target,
                                 "["
                                 + "NG \u756A\u53F7"
                                 + ":"
                                 + Aima_Aimani.textEasyNGStop
                                 + "]");
            target.setAttribute
              ("name", "easyng_stopnumber_1_0");
            target.style.color
              = "#ff0000";
          }
          else {
            var container = Aima_Aimani.findParentNode (target,
                                                        "span");
            Aima_Aimani.setText (container.previousSibling,
                                 "["
                                 + "NG \u756A\u53F7"
                                 + ":"
                                 + Aima_Aimani.textEasyNGStop
                                 + "]");
            container.previousSibling.setAttribute
            ("name", "easyng_stopnumber_2_0");
            container.previousSibling.style.color
            = "#ff0000";
                        
            container.style.display = "none";
          }
                    
          param.easyNG = true;
          param.easyNGMode = 1;
          param.easyNGLeftDown = false;
        }
        else if (subtype == "shownumber") {
          notupdated = true;
                    
          var container = Aima_Aimani.findParentNode (target,
                                                      "span");
          Aima_Aimani.setText (container.previousSibling,
                               "["
                               + "NG \u756A\u53F7\u89E3\u9664"
                               + ":"
                               + Aima_Aimani.textEasyNGStop
                               + "]");
          container.previousSibling.setAttribute
          ("name", "easyng_stopnumber_2_0");
          container.previousSibling.style.color
          = "#ff0000";
                    
          container.style.display = "none";
                    
          param.easyNG = true;
          param.easyNGMode = 2;
          param.easyNGLeftDown = false;
        }
        else if (subtype == "hidecat") {
          notupdated = true;
                    
          var container = Aima_Aimani.findParentNode (target,
                                                      "span");
          Aima_Aimani.setText (container.previousSibling,
                               "["
                               + "NG \u30AB\u30BF\u30ED\u30B0"
                               + ":"
                               + Aima_Aimani.textEasyNGStop
                               + "]");
          container.previousSibling.setAttribute
          ("name", "easyng_stopnumber_2_0");
          container.previousSibling.style.color
          = "#ff0000";
                    
          container.style.display = "none";
                    
          param.easyNG = true;
          param.easyNGMode = 3;
          param.easyNGLeftDown = false;
        }
        else if (subtype == "showcat") {
          notupdated = true;
                    
          var container = Aima_Aimani.findParentNode (target,
                                                      "span");
          Aima_Aimani.setText (container.previousSibling,
                               "["
                               + "NG \u30AB\u30BF\u30ED\u30B0\u89E3\u9664"
                               + ":"
                               + Aima_Aimani.textEasyNGStop
                               + "]");
          container.previousSibling.setAttribute
          ("name", "easyng_stopnumber_2_0");
          container.previousSibling.style.color
          = "#ff0000";
                    
          container.style.display = "none";
                    
          param.easyNG = true;
          param.easyNGMode = 4;
          param.easyNGLeftDown = false;
        }
        else if (subtype == "stopnumber") {
          if (num == 1) {
            target.style.color = "#627f29";
            Aima_Aimani.setText (target,
                                 "[" + Aima_Aimani.textEasyNGStart
                                 + "]");
            target.setAttribute ("name",
                                 "easyng_hidenumber_1_0");
          }
          else {
            if (Aima_Aimani.enableEasyNGType != "all_close") {
              target.style.color = "#800000";
              target.nextSibling.style.display = "";
            }
            else {
              target.style.color = "#627f29";
            }
            Aima_Aimani.setText (target,
                                 "[" + Aima_Aimani.textEasyNGStart
                                 + "]");
            target.setAttribute ("name",
                                 "easyng_open_0_0");
          }
                    
          param.easyNG = false;
          param.easyNGMode = 0;
        }
      }
            
      if (update && !notupdated && save
          && Aima_Aimani.enableHideStyle) {
        Aima_Aimani.modifyStyleFile (true);
      }
            
      if (div
          && (subtype == "thread"
              || subtype == "res")) {
        /* 赤福のポップアップ内
         * コピー元のアンカーを押す */
                
        var nodes = targetDocument.getElementsByTagName ("small");
        for (var i = 0; i < nodes.length; i ++) {
          if (nodes [i].getAttribute ("name") == type) {
            if (nodes [i] != target) {
              var container = Aima_Aimani.getMessageContainer (nodes [i]);
              
              if (container.main.style.display != "none") {
                Aima_Aimani.onAnchorClick (targetDocument,
                                           nodes [i], type,
                                           false, false);
              }
            }
          }
        }
      }
      return true;
    }
    return false;
  },
    
  /**
   * 一括 NG
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLAnchorElement target
   *         対象のノード
   * @return Aima_AimaniDocumentParam
   *         ドキュメントごとの情報
   */
  onEasyNG : function (targetDocument, target, param) {
    var i;
        
    var div = Aima_Aimani.findParentNode (target, "div");
    if (div) {
      var originalTarget = null;
      var nodes = div.getElementsByTagName ("a");
      var href = "";
      for (var i = 0; i < nodes.length; i ++) {
        if ("href" in nodes [i]
            && nodes [i].href) {
          href = nodes [i].href;
          break;
        }
      }
      if (href) {
        nodes = targetDocument.getElementsByTagName ("a");
                
        for (var i = 0; i < nodes.length; i ++) {
          if ("href" in nodes [i]
              && nodes [i].href == href) {
            var td = Aima_Aimani.findParentNode (nodes [i], "td");
            if (td) {
              originalTarget = td;
              div.style.display = "none";
            }
          }
        }
      }
      target = originalTarget;
      if (!target) {
        return;
      }
    }
        
    if (target.nodeName.toLowerCase () != 'td') {
      target = Aima_Aimani.findParentNode (target, "td");
    }
        
    if (target) {
      var nodes = target.getElementsByTagName ("small");
            
      for (var i = 0; i < nodes.length; i ++) {
        var type = nodes [i].getAttribute ("name");
                
        if (type
            && ((param.easyNGMode == 1
                 && type.match (/^hide_catalogue_/))
                || (param.easyNGMode == 2
                    && type.match (/^show_catalogue_/))
                || (param.easyNGMode == 3
                    && type.match (/^hide_ngcat_/))
                || (param.easyNGMode == 4
                    && type.match (/^show_ngcat_/)))) {
          Aima_Aimani.onAnchorClick (targetDocument,
                                     nodes [i], type,
                                     true, false);
          break;
        }
      }
    }
  },
   
  /**
   * マウスを動かしたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onEasyNGMouseMove : function (event) {
    try {
      var targetDocument = event.target.ownerDocument;
      var param = Aima_Aimani.getDocumentParam (targetDocument);
            
      if (param.easyNG) {
        if (param.easyNGLeftDown) {
          var nowX = event.pageX;
          var nowY = event.pageY;
          var x, y;
          var top, left;
          var node, node2;
          var length
            = Math.sqrt (Math.pow (nowX - param.easyNGLastX,
                                   2.0)
                         + Math.pow (nowY - param.easyNGLastY,
                                     2.0));
          if (length > 30) {
            var points = new Array ();
            for (var i = 30; i < length; i += 30) {
              x
                = param.easyNGLastX
                + (nowX - param.easyNGLastX) * i / length;
              y
                = param.easyNGLastY
                + (nowY - param.easyNGLastY) * i / length;
              points.push (new Array (x, y));
            }
                        
            var nodes = targetDocument.getElementsByTagName ("td");
                        
            for (var j = 0; j < nodes.length; j ++) {
              node = nodes [j];
              left = 0;
              top = 0;
              node2 = node;
              while (node2) {
                left += node2.offsetLeft;
                top += node2.offsetTop;
                node2 = node2.offsetParent;
              }

              for (var i = 0; i < points.length; i ++) {
                x = points [i][0];
                y = points [i][1];
                if (x > left
                    && x < left + node.offsetWidth
                    && y > top
                    && y < top + node.offsetHeight) {
                  Aima_Aimani.onEasyNG (targetDocument,
                                        node, param);
                  break;
                }
              }
            }
          }
          Aima_Aimani.onEasyNG (targetDocument,
                                event.explicitOriginalTarget, param);
                    
          param.easyNGLastX = event.pageX;
          param.easyNGLastY = event.pageY;
                    
          event.preventDefault ();
          event.stopPropagation ();
        }
      }
    }
    catch (e) { Cu.reportError (e);
    }
  },
    
  /**
   * マウスボタンを押下したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onEasyNGMouseDown : function (event) {
    if (event.button == 0
        && !event.ctrlKey && !event.shiftKey
        && !event.altKey && !event.metaKey) {
      try {
        var targetDocument = event.target.ownerDocument;
        var param = Aima_Aimani.getDocumentParam (targetDocument);
        if (param.easyNG) {
          param.easyNGLeftDown = true;
          param.easyNGLastX = event.pageX;
          param.easyNGLastY = event.pageY;
                
          Aima_Aimani.onEasyNG (targetDocument,
                                event.explicitOriginalTarget, param);
                
          event.preventDefault ();
          event.stopPropagation ();
        }
      }
      catch (e) { Cu.reportError (e);
      }
    }
  },
    
  /**
   * マウスボタンを開放したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onEasyNGMouseUp : function (event) {
    try {
      var targetDocument = event.target.ownerDocument;
      var param = Aima_Aimani.getDocumentParam (targetDocument);
      if (param.easyNG) {
        if (param.easyNGLeftDown) {
          param.easyNGLeftDown = false;
                    
          event.preventDefault ();
          event.stopPropagation ();
        }
      }
    }
    catch (e) { Cu.reportError (e);
    }
  },
    
  /**
   * アンカーを作る
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  String name
   *         アンカーの名前
   * @param  String text
   *         アンカーのテキスト
   * @param  Boolean bracket
   *         括弧を付けるか
   */
  createAnchor : function (targetDocument, name, text, bracket) {
    var newNode = targetDocument.createElement ("small");
    newNode.setAttribute ("name", name);
    newNode.style.color = "#627f29";
    newNode.className = "aima_aimani_generated";
    if (bracket) {
      newNode.appendChild (targetDocument.createTextNode
                           ("[" + text +"]"));
    }
    else {
      newNode.appendChild (targetDocument.createTextNode (text));
    }
        
    return newNode;
  },
    
  /**
   * 警告を作る
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  String text
   *         アンカーのテキスト
   */
  createWarning : function (targetDocument, text) {
    var newNode = targetDocument.createElement ("small");
    newNode.style.color = "#ff0000";
    newNode.className = "aima_aimani_warning";
    newNode.style.fontSize = "10pt";
    newNode.appendChild (targetDocument.createTextNode (text));
        
    return newNode;
  },
    
  /**
   * コメント欄の先頭の行を取得する
   *
   * @param  HTMLQuoteElement node
   *         コメントの blockquote 要素
   * @return String
   *         コメント欄の先頭の行
   */
  getCommentFirstLine : function (node) {
    var comment = "";
    var list = Aima_Aimani.getInnerHTML2 (node).split (/<br.+>/i);
    if (list.length > 0) {
      comment = list [0];
      comment = comment.replace (/<[^>]+>/g, "");
    }
        
    return comment;
  },
    
  /**
   * クリックのイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onContentAreaClick : function (event) {
    if (event.button == 0
        && !event.ctrlKey && !event.shiftKey
        && !event.altKey && !event.metaKey) {
            
      var target = event.target;
            
      if (target && target.nodeName.toLowerCase () == "small") {
        var type = target.getAttribute ("name");
        if (type) {
          var targetDocument = target.ownerDocument;
                    
          Aima_Aimani.onAnchorClick (targetDocument, target, type,
                                     true, true);
        }
      }
    }
  },
    
  /**
   * コンテンツがロードされたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onDOMContentLoaded : function (event) {
    var targetDocument = Aima_Aimani.getTargetDocument (event);

    var frame = targetDocument.defaultView.frameElement;
    if (frame && frame.nodeName.toLowerCase () == "iframe"
        && !frame.hasAttribute ("src")) {
      // src の無い iframe の中には適用しない
      // (親ドキュメントの href と同じに見えてしまう)
      return;
    }
        
    var href = targetDocument.documentURI;
        
    if (Aima_Aimani.enableAll) {
            
      var needApply = false;
            
      tryImportAkahuku ();
      if (typeof Akahuku != "undefined") {
        try {
          href = Akahuku.protocolHandler.deAkahukuURI (href);
        }
        catch (e) { Cu.reportError (e);
        }
      }
            
      if (href.match
          (/^http:\/\/([^\/]+\/|(?:www\.)?logch\.info\/(?:proxy|logs)\/)?(tmp|up|img|cgi|zip|dat|may|nov|jun|dec|feb)\.2chan.net(:[0-9]+)?\/(may\/b|[^\/]+)\//)
          || href.match
          (/^http:\/\/([^\/|(?:www\.)?logch\.info\/(?:proxy|logs)\/]+\/)?(www)\.2chan\.net(:[0-9]+)?\/(h|oe)\//)) {
        needApply = true;
      }
      if (href.match
          (/http:\/\/nijibox\.dyndns\.dk\/akahuku\/catalog\/dat\/view.php\?mode=cat2?/)
          || href.match
          (/http:\/\/akahuku\.dw\.land\.to\/catalog\/dat\/view\.php\?mode=cat2?/)
          || href.match
          (/http:\/\/akahuku\.s278\.xrea\.com\/catalog\/dat\/view\.php\?mode=cat2?/)) {
        /* dat のタテログ */
        needApply = true;
      }
      /* 避難所 patch */
      if (Aima_Aimani.enableBoardExternal) {
        for (var i = 0;
             i < Aima_Aimani.boardExternalList.length;
             i ++) {
          if (Aima_Aimani.boardExternalList [i][1] & 2) {
            if (href.indexOf (Aima_Aimani.boardExternalList [i][0])
                == 0) {
              needApply = true;
              break;
            }
          }
          else {
            if (href.match (Aima_Aimani.boardExternalList [i][0])) {
              needApply = true;
              break;
            }
          }
        }
      }
            
      if (needApply) {
        if (Aima_Aimani.applyAll (targetDocument)) {

          try {
            tryImportAkahuku ();
            if (typeof Akahuku != "undefined"
                && Akahuku.onAima_Aimanied) {
              Akahuku.onAima_Aimanied (targetDocument);
            }
          }
          catch (e) { Cu.reportError (e);
          }
        }
      }
    }
  },
    
  /**
   * 全てを適用
   *
   * @return Boolean 実際に適用したか
   */
  applyAll : function (targetDocument) {
    var href = targetDocument.documentURI;
        
    var info = new Aima_AimaniLocationInfo (targetDocument);
                
    if (href.match (/futaba\.php$/)) {
      /* レス送信のインラインフレームの場合、なにもしない */
      return false;
    }
                
    if (info.isNotFound) {
      return false;
    }
                
    if (Aima_Aimani.nearestExpireTime != 0) {
      var now = (new Date ()).getTime ();
      if (now > Aima_Aimani.nearestExpireTime) {
        Aima_AimaniConfigManager.loadNGWord ();
      }
    }
        
    if (Aima_Aimani.enableBoardSelect) {
      /* 板を制限する場合はチェックする */
      var name = info.server + ":" + info.dir;
      if (name in Aima_Aimani.boardSelectExList) {
        return false;
      }
    }
                
    if (Aima_Aimani.getDocumentParam (targetDocument)) {
      /* 多重適用を避ける */
      return false;
    }
                
    Aima_Aimani.addDocumentParam (targetDocument, info);
    var param = Aima_Aimani.getDocumentParam (targetDocument);
                
    var targetWindow = null;
    if (true) {
      targetWindow = targetDocument.defaultView;
      targetWindow.addEventListener
        ("unload",
         function () {
          Aima_Aimani.onBodyUnload (targetDocument);
        }, false);
      targetDocument.body.addEventListener
        ("click",
         function () {
          Aima_Aimani.onContentAreaClick (arguments [0]);
        }, false);
    }
                
    if (info.isCatalog) {
      /* カタログの場合 */
      if (Aima_Aimani.enableNGNumber
          || Aima_AimaniNGCat.enableNGCat
          || Aima_Aimani.enableTextThread) {
        Aima_Aimani.applyCatalogue (targetDocument, false,
                                    Aima_Aimani.NGWordList);
                        
        if (Aima_Aimani.enableHideEntireThread) {
          try {
            tryImportAkahuku ();
            if (typeof Akahuku != "undefined"
                && Akahuku.onHideEntireThread) {
              Akahuku.onHideEntireThread (targetDocument);
            }
          }
          catch (e) { Cu.reportError (e);
          }
        }

        // カスタムイベントによる赤福との連携の準備
        var appending_container
          = targetDocument.getElementById ("akahuku_appending_container");
        if (appending_container) {
          var onAppendOrReAppend = function (event) {
            Aima_Aimani.useAkahukuCustomEvents = true;
            Aima_Aimani.applyNGNumberForCatalogueCell (event.target);
            if (event.target.style.display == "none") {
              event.preventDefault (); // 非表示にするために必要
            }
          };
          appending_container.addEventListener
            ("AkahukuContentAppend", onAppendOrReAppend, false);
          appending_container.addEventListener
            ("AkahukuContentReAppend", onAppendOrReAppend, false);
        }
                        
        var unhideCatalogue = (function (param) { return function () {
          var targetDocument = param.targetDocument;
          var header
          = targetDocument.getElementsByTagName ("head");
          if (header.length > 0) {
            header = header [0];
            var s
              = Aima_Aimani.styleCatalogueTableSelector
              + "{visibility: unset !important;}";
            var style
              = targetDocument.createElement ("style");
            style.appendChild (targetDocument.createTextNode
                               (s));
            header.appendChild (style);
          }
        } })(param);
        if (Aima_Aimani.enableHideCatStyle) {
          if (param.ngcat_cacheManager.isPending ()) {
            param.ngcat_cacheManager.addCallbackListener (function (mgr, status) {
              if (mgr.countFail) {
                Aima_Aimani.log ("! error(s) in checking caches: "
                  + mgr.countFail + "/" + mgr.count);
              }
              unhideCatalogue ();
            });
          }
          else {
            unhideCatalogue ();
          }
        }
      }
    }
    else {
      /* 通常、レス送信モードの場合 */
                    
      if (Aima_Aimani.enableNGNumber
          || Aima_Aimani.enableNGWord
          || Aima_Aimani.enableNGThumbnail
          || Aima_Aimani.enableTextThread
          || Aima_Aimani.enableMiniThumb
          || (Aima_Aimani.enableThreadRule && info.isReply)) {
                
        try {
          var header
          = targetDocument.getElementsByTagName ("head");
          if (header.length > 0) {
            header = header [0];
            var s
              = "small.aima_aimani_generated + a"
              + "{margin-left: 0.5em;}";
            var style
              = targetDocument.createElement ("style");
            style.appendChild (targetDocument.createTextNode
                               (s));
            header.appendChild (style);
          }
        }
        catch (e) { Cu.reportError (e);
        }
                
        var enableNGWord = Aima_Aimani.enableNGWord;
        var name = info.server + ":" + info.dir;
        if (name in Aima_Aimani.NGWordBoardSelectExList) {
          enableNGWord = false;
        }
        var enableNGThumbnail = Aima_Aimani.enableNGThumbnail;
        var name = info.server + ":" + info.dir;
        if (name in Aima_Aimani.NGThumbnailBoardSelectExList) {
          enableNGThumbnail = false;
        }
                        
        var result = Aima_Aimani
        .apply (targetDocument,
                true,
                Aima_Aimani.enableNGNumber,
                enableNGWord,
                enableNGThumbnail,
                Aima_Aimani.enableTextThread,
                Aima_Aimani.enableThreadRule && info.isReply,
                Aima_Aimani.NGWordList);
                        
        if (result) {
          if (Aima_Aimani.enableHideStyle) {
            Aima_Aimani.modifyStyleFile (true);
          }
                            
          if (enableNGThumbnail) {
            Aima_AimaniConfigManager.saveNGThumbnail ();
          }
        }

        // カスタムイベントによる赤福との連携の準備
        var onResAppend = function (event) {
          Aima_Aimani.useAkahukuCustomEvents = true;
          var hidden
            = Aima_Aimani.applyNGNumberForRes (event.target);
          if (hidden && Aima_Aimani.enableHideEntireRes) {
            event.preventDefault ();
          }
        };
        targetDocument.addEventListener
          ("AkahukuContentAppend", onResAppend, false);
      }
                    
      if (Aima_Aimani.enableHideThreadStyle) {
        var header
        = targetDocument.getElementsByTagName ("head");
        if (header.length > 0) {
          header = header [0];
          var s
            = "body > form"
            + "{visibility: unset !important;}";
          var style
            = targetDocument.createElement ("style");
          style.appendChild (targetDocument.createTextNode
                             (s));
          header.appendChild (style);
        }
      }
      
      if (Aima_Aimani.enableTextThread
          || (Aima_Aimani.enableThreadRule && info.isReply)) {
        Aima_Aimani.hideTextonlyCheckbox (targetDocument);
      }
      
      if (Aima_Aimani.enableMiniThumb
          || (Aima_Aimani.enableThreadRule && info.isReply)) {
        if (true) {
          targetDocument.body.addEventListener
          ("mousemove",
           function () {
            Aima_Aimani.onMouseMove (arguments [0]);
          }, false);
        }
      }
      
      if (Aima_Aimani.enablePopupMessage) {
        if (true) {
          Aima_Aimani.getDocumentParam (targetDocument)
          .popup_managerdata
          = new Aima_AimaniPopupManagerData ();
                        
          targetDocument.body.addEventListener
          ("mousemove",
           function () {
            Aima_AimaniPopupManager
            .onMouseMove (arguments [0]);
          }, false);
                            
          targetDocument.body.addEventListener
          ("click",
           function () {
            Aima_AimaniPopupManager
              .onClick (arguments [0]);
          }, false);
        }
      }
    }
    return true;
  },

  /**
   * ドキュメントを外部板に追加して適用する
   */
  addExternalForDocument : function (targetDocument) {
    var param
    = Aima_Aimani.getDocumentParam (targetDocument);

    if (param) {
      return;
    }

    var base = targetDocument.documentURI;

    base = base
    .replace (/\/res\/([0-9]+)\.html?$/, "/")
    .replace (/\/2\/([0-9]+)\.html?$/, "/")
    .replace (/\/b\/([0-9]+)\.html?$/, "/")
    .replace (/\/(([^\.\/]+)\.php)?([#\?].*)?$/, "/")
    .replace (/\/(([^\.\/]+)\.html?)?([#\?].*)?$/, "/");

    if (!base.match (/\/$/)) {
      return;
    }

    var flag = 2;

    var form = targetDocument.getElementById ("postbox");
    if (form) {
      if ("action" in form
          && form.action
          && form.action.match (/monaca\.php/)) {
        flag |= 1;
      }
    }

    var tmp
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.board_external.patterns", "");

    if (tmp) {
      tmp += ",";
    }
    tmp += escape (base)
    + "&" + escape (flag);

    Aima_AimaniConfigManager.prefBranch.setCharPref
    ("aima_aimani.board_external.patterns", tmp);

    Aima_AimaniConfigManager
    .getConfigurationFromPreferencesBoardExternal ();

    Aima_Aimani.applyAll (targetDocument);
  },
    
  /**
   * NG 番号を追加する
   *
   * @param  Number num
   *         追加する番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @param  String depend
   *         依存関係
   * @param  Number reason
   *         理由 (REASON_*)
   * @param  Number imageNum
   *         画像の番号
   */
  addNGNumber : function (num, server, dir, depend, reason, imageNum) {
    if (Aima_Aimani.arrayExists3 (Aima_Aimani.NGNumberList,
                                  num, server, dir)) {
      return;
    }
        
    Aima_Aimani.NGNumberList
    .unshift (new Array (num, server, dir, depend, reason, imageNum));
        
    Aima_AimaniConfigManager.saveNGNumber (num, server, dir);
  },
    
  /**
   * NG 番号を削除する
   *
   * @param  Number num
   *         削除する番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   */
  deleteNGNumber : function (num, server, dir) {
    if (!Aima_Aimani.arrayDelete3 (Aima_Aimani.NGNumberList,
                                   num, server, dir)) {
      return;
    }
        
    Aima_AimaniConfigManager.saveNGNumber (num, server, dir);
  },
    
  /**
   * NG サムネを追加する
   *
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String bytes
   *         バイト数
   * @param  String ext
   *         拡張子
   * @param  String comment
   *         コメント
   */
  addNGThumbnail : function (width, height, bytes, ext, comment) {
    if (Aima_Aimani.arrayExistsNGThumbnail(Aima_Aimani.NGThumbnailList,
                                           width, height, bytes, ext)) {
      return;
    }
        
    var now = (new Date ()).getTime ();
    Aima_Aimani.NGThumbnailList
    .unshift (new Array (width, height, bytes, ext, comment, 1, now));
        
    Aima_AimaniConfigManager.saveNGThumbnail ();
  },
    
  /**
   * NG サムネを削除する
   *
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String bytes
   *         バイト数
   * @param  String ext
   *         拡張子
   */
  deleteNGThumbnail : function (width, height, bytes, ext) {
    if (!Aima_Aimani.arrayDeleteNGThumbnail (Aima_Aimani.NGThumbnailList,
                                             width, height, bytes, ext)) {
      return;
    }
        
    Aima_AimaniConfigManager.saveNGThumbnail ();
  },
    
  /**
   * スレッドルールを追加する
   *
   * @param  Number num
   *         追加する番号
   * @param  String server
   *         サーバ名
   * @param  Number rule
   *         ルール
   *           1: 文字レス非表示
   *           2: sage のみ表示
   * @param  String dir
   *         ディレクトリ名
   */
  addThreadRule : function (num, server, dir, rule) {
    if (Aima_Aimani.arrayExists3 (Aima_Aimani.ThreadRuleList,
                                  num, server, dir, rule)) {
      return;
    }
        
    Aima_Aimani.ThreadRuleList.unshift (new Array (num, server, dir, rule));
        
    Aima_AimaniConfigManager.saveThreadRule (num, server, dir);
  },
    
  /**
   * スレッドルールを削除する
   *
   * @param  Number num
   *         削除する番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   */
  deleteThreadRule : function (num, server, dir) {
    if (!Aima_Aimani.arrayDelete3 (Aima_Aimani.ThreadRuleList,
                                   num, server, dir)) {
      return;
    }
        
    Aima_AimaniConfigManager.saveThreadRule (num, server, dir);
  },
    
  /**
   * ノードの子をコピーする
   *
   * @param  HTMLElement from
   *         コピー元のノード
   * @param  HTMLElement from
   *         コピー先のノード
   */
  copyChildren : function (from, to) {
    var node;
    node = from.firstChild;
        
    while (node) {
      to.appendChild (node.cloneNode (true));
      node = node.nextSibling;
    }
  },
    
  /**
   * 指定したノードの子をテキストノードのみにする
   *
   * @param  HTMLElement node
   *         対象のノード
   * @param  String text
   *         テキストの内容
   *         null の場合追加しない
   */
  setText : function (node, text) {
    while (node.firstChild) {
      node.removeChild (node.firstChild);
    }
    if (text != null) {
      node.appendChild (node.ownerDocument.createTextNode (text));
    }
  },
    
  /**
   * 指定したノード名の親ノードを探す
   *
   * @param  HTMLElement node
   *         対象のノード
   * @param  String nodeName
   *         親ノードのノード名
   * @return HTMLElement
   *         見付からなかった場合 null
   */
  findParentNode : function (node, nodeName) {
    while (node) {
      if (node.nodeName.toLowerCase () == nodeName) {
        return node;
      }
      node = node.parentNode;
    }
    
    return null;
  },
  
  /**
   * 指定したクラス名の親ノードを探す
   *
   * @param  HTMLElement node
   *         対象のノード
   * @param  String className
   *         親ノードのクラス名
   * @return HTMLElement
   *         見付からなかった場合 null
   */
  findParentNodeByClassName : function (node, className) {
    while (node) {
      if (Aima_Aimani.hasClassName (node, className)) {
        return node;
      }
      node = node.parentNode;
    }
    
    return null;
  },
  
  /**
   * スレッドを非表示にする
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLElement targetNode
   *         スレッドに含まれるノード
   * @param  Number reason
   *         非表示にする理由 (REASON_*)
   * @param  Boolean entire
   *         無かった事にするかどうか
   * @return HTMLElement
   *         末尾のノード
   *         無かった事にした場合は null
   */
  hideThread : function (targetDocument, targetNode, reason, entire) {
    var node = targetNode;
    var lastNode;
    var info;
    
    var info
    = Aima_Aimani.getDocumentParam (targetDocument).location_info;
        
    if (info.isReply) {
      entire = false;
    }
    
    /* スレの先頭に移動 */
    while (node.previousSibling
           && node.previousSibling.nodeName.toLowerCase () != "hr") {
      node = node.previousSibling;
    }
        
    if (!Aima_Aimani.enableHideWarning && !entire) {
      var blockquote = null;
      if (Aima_Aimani.isMessageBQ (targetNode)) {
        blockquote = targetNode;
      }
      else {
        var tmpNode = node;
        while (tmpNode
               && tmpNode.nodeName.toLowerCase () != "hr") {
          if (Aima_Aimani.isMessageBQ (tmpNode)) {
            blockquote = tmpNode;
            break;
          }
          else if (tmpNode.nodeName.toLowerCase () == "div"
                   && "className" in tmpNode
                   && tmpNode.className
                   == "aima_aimani_generated_comment") {
            blockquote = tmpNode;
            break;
          }
          tmpNode = tmpNode.nextSibling;
        }
      }
            
      if (blockquote) {
        var div = targetDocument.createElement ("div");
        div.className = "aima_aimani_generated_comment";
        div.style.display = "none";
        Aima_Aimani.copyChildren (blockquote, div);
        node.parentNode.insertBefore (div, node);
      }
            
      var newNode
      = Aima_Aimani.createWarning
      (targetDocument, Aima_Aimani.textReasons [reason]);
      node.parentNode.insertBefore (newNode, node);
    }
        
    /* 避難所 patch */
    if (info.isMonaca) {
      node = targetNode.parentNode;
            
      /* スレの先頭に移動 */
      while (node.previousSibling
             && node.previousSibling.nodeName.toLowerCase () != "hr") {
        node = node.previousSibling;
      }
    }
        
    /* スレの末尾まで非表示にする */
    while (node
           && node.nodeName.toLowerCase () != "hr") {
      lastNode = node;
      node = node.nextSibling;
      if (lastNode.parentNode) {
        lastNode.parentNode.removeChild (lastNode);
      }
    }
    if (entire) {
      /* 無かった事にする場合、末尾の hr も非表示にする */
      if (node) {
        node.parentNode.removeChild (node);
      }
            
      return null;
    }
        
    return node;
  },
    
  /**
   * レスを非表示にする
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLElement targetNode
   *         レスに含まれるノード
   * @param  Number reason
   *         非表示にする理由 (REASON_*)
   * @param  Boolean entire
   *         無かった事にするかどうか
   * @param  Number num
   *         レス番号
   * @param  Number imageNum
   *          画像の番号
   *          文字スレの場合は 0
   * @param  Boolean force
   *         強制表示を挿入するか
   * @return HTMLElement
   *         警告を含む td 要素
   *         見付からなかった場合は null
   */
  hideRes : function (targetDocument, targetNode, reason, entire,
                      num, imageNum, force) {
    var container = Aima_Aimani.getMessageContainer (targetNode);
    if (!container) {
      return null;
    }
    
    if (entire) {
      for (var i = 0; i < container.nodes.length; i ++) {
        container.nodes [i].style.display = "none";
      }
    }
    
    container.main.style.display = "none";
    
    var newtd;
    
    if (container.main.nodeName.toLowerCase () == "td") {
      newtd = targetDocument.createElement ("td");
    }
    else {
      newtd = targetDocument.createElement ("div");
      newtd.style.marginTop = "4px";
      newtd.style.cssFloat = "left";
    }
    newtd.style.backgroundColor = "#f0e0d6";
    newtd.className = "aima_aimani_hidden";
    if (container.main.nodeName.toLowerCase () == "div") {
      newtd.style.marginLeft = "1.1em";
    }
    if (entire) {
      newtd.style.display = "none";
    }
    
    newtd.appendChild (targetDocument.createTextNode ("No." + num));
    
    if (!Aima_Aimani.enableHideWarning && !entire) {
      var newNode
        = Aima_Aimani.createWarning
        (targetDocument, Aima_Aimani.textReasons [reason]);
      newtd.appendChild (newNode);
    }
    
    if (container.main.nextSibling) {
      container.main.parentNode.insertBefore
      (newtd, container.main.nextSibling);
    }
    else {
      container.main.parentNode.appendChild (newtd);
    }
    
    if (force) {
      var newNode
        = Aima_Aimani.createAnchor
        (targetDocument,
         "forceshow_res_" + num + "_" + imageNum,
         Aima_Aimani.textForceShowNumber, true);
      newtd.appendChild (newNode);
    }
    
    return newtd;
  },
    
  /**
   * レスを表示する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  Object container
   *         レスのコンテナ
   * @param  Boolean save
   *         変更を保存するかどうか
   * @param  Boolean force
   *         強制表示かどうか
   * @return Boolean
   *           NG 番号が増えたかどうか
   */
  showRes : function (targetDocument, container, save, force) {
    var tmp = container.main.nextSibling;
    if (tmp
        && Aima_Aimani.hasClassName (tmp, "aima_aimani_hidden")) {
      tmp.parentNode.removeChild (tmp);
    }
    
    for (var i = 0; i < container.nodes.length; i ++) {
      container.nodes [i].style.display = "";
    }
    
    container.main.style.display = "";
    
    var node = Aima_Aimani.getMessageBQ (container.main);
    
    if (node && node [0] && !force) {
      var param
        = Aima_Aimani.getDocumentParam (targetDocument);
      var info = param.location_info;
      var enableNGWord = Aima_Aimani.enableNGWord;
      var name = info.server + ":" + info.dir;
      if (name in Aima_Aimani.NGWordBoardSelectExList) {
        enableNGWord = false;
      }
      var enableNGThumbnail = Aima_Aimani.enableNGThumbnail;
      var name = info.server + ":" + info.dir;
      if (name in Aima_Aimani.NGThumbnailBoardSelectExList) {
        enableNGThumbnail = false;
      }
            
      result
        = Aima_Aimani
        .applyCore (targetDocument, node [0], true,
                    false,
                    false,
                    enableNGWord,
                    enableNGThumbnail,
                    false, Aima_Aimani.enableThreadRule,
                    Aima_Aimani.NGWordList);
            
      if (result & 4 && save) {
        if (Aima_Aimani.enableHideStyle) {
          Aima_Aimani.modifyStyleFile (true);
        }
                
        if (enableNGThumbnail) {
          Aima_AimaniConfigManager.saveNGThumbnail ();
        }
                
        return true;
      }
    }
    
    if (true) {
      targetDocument.defaultView
      .setTimeout (function (targetNode) {
          var nodes = targetNode.getElementsByTagName ("img");
                    
          for (var i = 0; i < nodes.length; i ++) {
            nodes [i].style.display = "inline";
            nodes [i].src = nodes [i].src;
          }
        }, 1000, container.main);
    }
        
    return false;
  },
    
  /**
   * カタログでスレッドを消す
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLElement targetNode
   *         スレッドに含まれるノード
   * @param  Number reason
   *         非表示にする理由 (REASON_*)
   * @param  Boolean entire
   *         無かった事にするかどうか
   */
  hideCatalogue : function (targetDocument, targetNode, reason, entire) {
    if (entire) {
      var td = Aima_Aimani.findParentNode (targetNode, "td");
      if (td) {
        td.style.display = "none";
      }
    }
    else {
      var td = Aima_Aimani.findParentNode (targetNode, "td");
            
      var nodes = new Array ();
      var hasImage = false;
      var tmp;
      var i;
            
      tmp = td.getElementsByTagName ("img");
      if (tmp && tmp.length > 0) {
        hasImage = true;
        for (i = 0; i < tmp.length; i ++) {
          nodes.push (tmp [i]);
        }
      }
            
      tmp = td.getElementsByTagName ("div");
      if (tmp && tmp.length > 0) {
        for (i = 0; i < tmp.length; i ++) {
          if ("className" in tmp [i]
              && tmp [i].className == "akahuku_comment") {
            nodes.push (tmp [i]);
          }
        }
      }
            
      tmp = td.getElementsByTagName ("small");
      if (tmp && tmp.length > 0) {
        for (i = 0; i < tmp.length; i ++) {
          if ("className" in tmp [i]
              && tmp [i].className.indexOf ("aima_aimani") != -1) {
            continue;
          }
          nodes.push (tmp [i]);
        }
      }
            
      if (nodes.length == 0) {
        tmp = td.getElementsByTagName ("a");
        if (tmp && tmp.length > 0) {
          nodes.push (tmp [0]);
        }
      }
            
      if (nodes.length > 0) {
        for (i = 0; i < nodes.length; i ++) {
          nodes [i].style.display = "none";
        }
                
        var prevNode = nodes [0].previousSibling;
        var warning = null;
                
        if (prevNode && prevNode.className == "aima_aimani_warning") {
          /* 非表示になっている所を NG 番号に追加した場合 */
                    
          /* 警告内容を変える */
          warning = prevNode;
        }
        else {
          warning
          = Aima_Aimani.createWarning
          (targetDocument, "");
          warning.style.fontSize = "8pt";
          nodes [0].parentNode.insertBefore (warning, nodes [0]);
        }
                
        Aima_Aimani
        .setText (warning,
                  "[" + Aima_Aimani.textHiddenCatalogue [reason] +"]");
      }
            
      if (Aima_Aimani.enableCatalogueUnlink) {
        nodes = td.getElementsByTagName ("a");
        for (var i = 0; i < nodes.length; i ++) {
          var href = nodes [i].getAttribute ("href");
          if (href) {
            nodes [i].removeAttribute ("href");
            nodes [i].setAttribute ("name", href);
          }
        }
      }
    }
  },
    
  /**
   * カタログで画像、もしくはテキストを表示する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLElement targetNode
   *         スレッドに含まれるノード
   */
  showCatalogue : function (targetDocument, targetNode) {
    var td = Aima_Aimani.findParentNode (targetNode, "td");
        
    var nodes = new Array ();
    var hasImage = false;
    var tmp;
    var i;
        
    tmp = td.getElementsByTagName ("img");
    if (tmp && tmp.length > 0) {
      hasImage = true;
      for (i = 0; i < tmp.length; i ++) {
        nodes.push (tmp [i]);
      }
    }
        
    tmp = td.getElementsByTagName ("div");
    if (tmp && tmp.length > 0) {
      for (i = 0; i < tmp.length; i ++) {
        if ("className" in tmp [i]
            && tmp [i].className == "akahuku_comment") {
          nodes.push (tmp [i]);
        }
      }
    }
        
    tmp = td.getElementsByTagName ("small");
    if (tmp && tmp.length > 0) {
      for (i = 0; i < tmp.length; i ++) {
        if ("className" in tmp [i]
            && tmp [i].className.indexOf ("aima_aimani") != -1) {
          continue;
        }
        nodes.push (tmp [i]);
      }
    }
        
    if (nodes.length == 0) {
      tmp = td.getElementsByTagName ("a");
      if (tmp && tmp.length > 0) {
        nodes.push (tmp [0]);
      }
    }
        
    if (nodes.length > 0) {
      var prevNode = nodes [0].previousSibling;
            
      if (!hasImage
          && Aima_Aimani.enableTextThread) {
        if (prevNode) {
          Aima_Aimani
            .setText (prevNode,
                      Aima_Aimani.textHiddenCatalogue [3]);
        }
        return;
      }
            
      if (prevNode && prevNode.className == "aima_aimani_warning") {
        prevNode.parentNode.removeChild (prevNode);
      }
            
      for (i = 0; i < nodes.length; i ++) {
        if (nodes [i].nodeName.toLowerCase () == "div") {
          nodes [i].style.display = "block";
        }
        else {
          nodes [i].style.display = "inline";
        }
                
        targetDocument.defaultView
        .setTimeout (function (node) {
            node.src = node.src;
          }, 1000, nodes [i]);
      }
            
      if (Aima_Aimani.enableCatalogueUnlink) {
        nodes = td.getElementsByTagName ("a");
        for (var i = 0; i < nodes.length; i ++) {
          var href = nodes [i].getAttribute ("name");
          if (href) {
            nodes [i].removeAttribute ("name");
            nodes [i].setAttribute ("href", href);
          }
        }
      }
    }
  },
    
  /**
   * NG 番号が存在するかどうかチェックする
   *
   * @param  Array array
   *         対象の配列
   * @param  Number num
   *         チェックする番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @return Array
   *         存在した場合 NG 番号
   *         存在しない場合 null
   */
  arrayExists3 : function (array, num, server, dir) {
    for (var i = 0; i < array.length; i++) {
      if (array [i][0] == num
          && array [i][1] == server && array [i][2] == dir) {
        return array [i];
      }
    }
    return null;
  },
    
  /**
   * NG サムネが存在するかどうかチェックする
   *
   * @param  Array array
   *         対象の配列
   * @param  Number num
   *         チェックする番号
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String bytes
   *         バイト数
   * @param  String ext
   *         拡張子
   * @return Array
   *         存在した場合 NG 番号
   *         存在しない場合 null
   */
  arrayExistsNGThumbnail : function (array, width, height, bytes, ext) {
    for (var i = 0; i < array.length; i ++) {
      if (array [i][2].indexOf ("-") != -1
          && array [i][2].match (/([0-9]+)\-([0-9]+)/)) {
        /* バイト数が可変の場合 */
        if (array [i][0] == width
            && array [i][1] == height
            && parseInt (bytes) >= parseInt (RegExp.$1)
            && parseInt (bytes) <= parseInt (RegExp.$2)
            && array [i][3] == ext) {
          return array [i];
        }
      }
      else if (array [i][0] == width
               && array [i][1] == height
               && array [i][2] == bytes
               && array [i][3] == ext) {
        return array [i];
      }
    }
    return null;
  },
    
  /**
   * NG 番号を削除する
   *
   * @param  Array array
   *         対象の配列
   * @param  Number num
   *         削除する番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @return Boolean
   *         削除したか
   */
  arrayDelete3 : function (array, num, server, dir) {
    var deleted = false;
        
    for (var i = 0; i < array.length; i++) {
      if (array [i][0] == num
          && array [i][1] == server && array [i][2] == dir) {
        deleted = true;
        array.splice (i, 1);
        i --;
      }
    }
        
    return deleted;
  },
    
  /**
   * NG サムネを削除する
   *
   * @param  Array array
   *         対象の配列
   * @param  Number num
   *         チェックする番号
   * @param  Number width
   *         幅
   * @param  Number height
   *         高さ
   * @param  String bytes
   *         バイト数
   * @param  String ext
   *         拡張子
   * @return Boolean
   *         削除したか
   */
  arrayDeleteNGThumbnail : function (array, width, height, bytes, ext) {
    var deleted = false;
        
    for (var i = 0; i < array.length; i ++) {
      if (array [i][0] == width
          && array [i][1] == height
          && array [i][2] == bytes
          && array [i][3] == ext) {
        deleted = true;
        array.splice (i, 1);
        i --;
      }
    }
        
    return deleted;
  },
    
  /**
   * サイドバーの NG 番号をチェックする
   * 赤福用のハンドラ
   * 
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @param  Number num
   *         スレ番号
   * @param  String comment
   *         コメント
   * @param  Number imageNum
   *          画像の番号
   *          文字スレの場合は 0
   * @param  Number imageWidth
   *          画像の幅
   * @param  Number imageHeight
   *          画像の高さ
   * @param  Number imageBytes
   *          画像のバイト数
   * @param  Number imageExt
   *          画像の拡張子
   * @return Number
   *           0: 表示する、NG 番号が無効
   *           1: 表示しない
   *           2: 表示する、NG 番号が有効
   */
  hideNGNumberSidebarHandler : function (server, dir,
                                         num,
                                         comment,
                                         imageNum, imageWidth, imageHeight,
                                         imageBytes, imageExt) {
    if (Aima_Aimani.enableAll) {
      var item;
      if (Aima_Aimani.enableTextThread) {
        if (imageNum == 0) {
          return 1;
        }
      }
            
      if (Aima_Aimani.enableNGNumber) {
        item
        = Aima_Aimani.arrayExists3 (Aima_Aimani.NGNumberList,
                                    num, server, dir);
        if (item) {
          return 1;
        }
      }
            
      var enableNGWord = Aima_Aimani.enableNGWord;
      var name = server + ":" + dir;
      if (name in Aima_Aimani.NGWordBoardSelectExList) {
        enableNGWord = false;
      }
            
      if (enableNGWord) {
        var ngword = "";
        for (var target in Aima_Aimani.NGWordList) {
          var words = Aima_Aimani.NGWordList [target];
          for (var k = 0; k < words.length; k ++) {
            var word = words [k];
            if (target & 0x0101) {
              /* スレの本文 */
                        
              if (comment.search (word) != -1) {
                ngword = RegExp.lastMatch
                  || word;
                break;
              }
                            
            }
          }
          if (Aima_Aimani.enableNGWordCont) {
            var re
              = comment.match
              (Aima_Aimani.NGWordContRegExp);
            if (re) {
              var m = re [1];
              var lastMatch = RegExp.lastMatch;
              m
                = m
                .replace (/<\/?[^>]+>/g, "")
                .replace (/&[^;]+;/g, "_");
              if (m.length >= Aima_Aimani.NGWordContLength) {
                ngword = lastMatch || " ";
              }
            }
          }
        }
        if (ngword) {
          Aima_Aimani.addNGNumber (num, server, dir,
                                   ngword,
                                   Aima_Aimani.REASON_NG_WORD, imageNum);
                    
          return 1;
        }
      }
            
      var enableNGThumbnail = Aima_Aimani.enableNGThumbnail;
      var name = server + ":" + dir;
      if (name in Aima_Aimani.NGThumbnailBoardSelectExList) {
        enableNGThumbnail = false;
      }
            
      if (enableNGThumbnail) {
        item
        = Aima_Aimani
        .arrayExistsNGThumbnail (Aima_Aimani.NGThumbnailList,
                                 imageWidth, imageHeight,
                                 imageBytes, imageExt);
        if (item) {
          var now = (new Date ()).getTime ();
          item [5] ++;
          item [6] = now;
                    
          Aima_Aimani.addNGNumber (num, server, dir,
                                   item [0] + "_" + item [1]
                                   + "_" + item [2] + "_" + item [3],
                                   Aima_Aimani.REASON_NG_THUMB, imageNum);
                    
          return 1;
        }
      }
            
      if (Aima_Aimani.enableNGNumber) {
        return 2;
      }
    }
        
    return 0;
  },
    
  /**
   * サイドバーの NG 番号を追加／削除する
   * 赤福用のハンドラ
   * 
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @param  Number num
   *          スレ番号
   * @param  Number imageNum
   *          画像の番号
   *          文字スレの場合は 0
   * @param  Boolean hide
   *          非表示にしたかどうか
   */
  changeNGNumberSidebarHandler : function (server, dir,
                                           num, imageNum, hide) {
    if (hide) {
      Aima_Aimani.addNGNumber
        (num, server, dir, "",
         Aima_Aimani.REASON_NG_NUMBER, imageNum);
    }
    else {
      Aima_Aimani.deleteNGNumber (num, server, dir);
    }
  },
    
  /**
   * カタログの NG 番号を非表示にする
   * 赤福用のハンドラ
   * 
   * @param  HTMLTableCellElement targetNode
   *          カタログの td 要素
   */
  hideNGNumberCatalogueHandler : function (targetNode) {
    if (Aima_Aimani.useAkahukuCustomEvents) {
      return;
    }
    Aima_Aimani.applyNGNumberForCatalogueCell (targetNode);
  },
  /**
   * カタログのセルの NG 番号等を非表示にする
   */
  applyNGNumberForCatalogueCell : function (targetNode) {
    if (Aima_Aimani.enableAll
        && (Aima_Aimani.enableNGNumber
            || Aima_AimaniNGCat.enableNGCat
            || Aima_Aimani.enableTextThread)) {
      /* 前回追加したアンカーを削除する */
      var nodes = targetNode.getElementsByTagName ("small");
      for (var i = 0; i < nodes.length; i ++) {
        if (nodes [i].className == "aima_aimani_generated") {
          nodes [i].parentNode.removeChild (nodes [i]);
          i --;
        }
      }
            
      var targetDocument = targetNode.ownerDocument;
      var param = Aima_Aimani.getDocumentParam (targetDocument);
      if (param == null) {
        return;
      }
      var info = param.location_info;
      if (info) {
        /* ロード時から有効だった場合のみ動作する */
        var ret
          = Aima_Aimani.applyCatalogueCore (targetDocument,
                                            targetNode, false,
                                            Aima_Aimani.NGWordList);
        if (ret == 0) {
          Aima_Aimani.showCatalogue (targetDocument,
                                     targetNode.firstChild);
        }
      }
    }
  },
    
  /**
   * カタログの NG ワード, NG 番号、文字スレを非表示にする
   * 
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLTableCellElement targetNode
   *         カタログの td 要素
   * @param  Boolean ngwordOnly
   *         NG ワードのみか
   * @param  Object NGWordList
   *         NG ワード
   * @return Number
   *         非表示にしたかどうか
   *           0: しなかった
   *           1: した
   */
  applyCatalogueCore : function (targetDocument, targetNode, ngwordOnly,
                                 NGWordList) {
    var targetAnchors = targetNode.getElementsByTagName ("a");
    var info = Aima_Aimani.getDocumentParam (targetDocument).location_info;
        
    var result = 0;
        
    var node = targetNode.firstChild;
    while (node
           && node.nextSibling) {
      node = node.nextSibling;
    }
    if (node
        && node.nodeName.toLowerCase () == "#text"
        && node.nodeValue
        && node.nodeValue.match (/^[ \t\r\n]*$/)) {
      node.parentNode.removeChild (node);
    }
        
    for (var j = 0; j < targetAnchors.length; j ++) {
      var targetAnchor = targetAnchors [j];
            
      if (targetAnchor.parentNode.nodeName.toLowerCase ()
          == "div") {
        continue;
      }
            
      var href;
      href = targetAnchor.getAttribute ("href")
      || targetAnchor.getAttribute ("name");
      if (href
          && (href.match (/res\/([0-9]+)/)
              || href.match (/2\/([0-9]+)/)
              || href.match (/b\/([0-9]+)/)
              || href.match (/\?res=([0-9]+)/))) {
        var threadNum = parseInt (RegExp.$1);
        var imageNum = 0;
        var imageNode = null;
                
        var node = targetAnchor.firstChild;
        while (node) {
          if (node.nodeName.toLowerCase () == "img"
              && node.getAttribute ("src").match (/cat\/([0-9]+)/)) {
            imageNum = parseInt (RegExp.$1);
            imageNode = node;
            break;
          }
          node = node.nextSibling;
        }
                
        var reason = Aima_Aimani.REASON_NONE;
                
        if (!ngwordOnly && Aima_Aimani.enableNGNumber) {
          var item;
          item
            = Aima_Aimani.arrayExists3 (Aima_Aimani.NGNumberList,
                                        threadNum,
                                        info.server, info.dir);
                    
          if (item) {
            /* NG 番号にあった場合 */
                        
            reason = item [4];
            if (reason != Aima_Aimani.REASON_FORCE) {
              if (reason == Aima_Aimani.REASON_NG_CAT && imageNode) {
                /* NG カタログ */
                imageNode.setAttribute
                  ("aima_aimani_ngcat", item [3]);
                imageNode.setAttribute
                  ("aima_aimani_ngcat_hide", 1);
              }
                            
              Aima_Aimani.hideCatalogue
                (targetDocument,
                 targetAnchor,
                 reason,
                 Aima_Aimani.enableHideEntireThread);
                            
              result = 1;
                            
              if (Aima_Aimani.enableHideEntireThread) {
                return 1;
              }
            }
          }
        }
                
        if (!ngwordOnly
            && Aima_AimaniNGCat.enableNGCat
            && imageNode) {
          var name = info.server + ":" + info.dir;
          if (!(name in Aima_AimaniNGCat.boardSelectExList)) {
            if (Aima_Aimani.enableHideCatStyle
                && imageNode.getAttribute ("__aima_aimani_style") != "1") {
              imageNode.style.visibility = "hidden";
              imageNode.setAttribute ("__aima_aimani_style", "1");
            }
                    
            Aima_AimaniNGCat.apply
              (targetDocument, targetNode,
               targetAnchor,
               threadNum,
               info.server, info.dir,
               imageNum,
               imageNode);
          }
        }
                
        if (reason == Aima_Aimani.REASON_NONE) {
          var enableNGWord = Aima_Aimani.enableNGWord;
          var name = info.server + ":" + info.dir;
          if (name in Aima_Aimani.NGWordBoardSelectExList) {
            enableNGWord = false;
          }
                    
          if (!ngwordOnly
              && imageNum == 0 && Aima_Aimani.enableTextThread) {
            /* 文字スレの場合 */
                        
            reason = Aima_Aimani.REASON_TEXT_THRE;
            if (Aima_Aimani.enableHideStyle) {
              Aima_Aimani.addNGNumber (threadNum,
                                       info.server, info.dir,
                                       "", reason, imageNum);
            }
                        
            result = 1;
                        
            Aima_Aimani
              .hideCatalogue (targetDocument,
                              targetAnchor,
                              reason,
                              Aima_Aimani.enableHideEntireThread);
          }
          else if (enableNGWord) {
            /* NG ワードのチェック */
                        
            var node = null;
                        
            var nodes = targetNode.getElementsByTagName ("small");
            if (nodes && nodes [0]
                && !("className" in nodes [0]
                     && nodes [0].className
                     == "aima_aimani_generated")) {
              /* 本来の本文 */
              node = nodes [0];
            }
            if (node == null) {
              nodes = targetNode.getElementsByTagName ("div");
              node = null;
              for (var i = 0; i < nodes.length; i ++) {
                if ("className" in nodes [i]
                    && nodes [i].className
                    == "akahuku_comment") {
                  /* 赤福の本文 */
                  node = nodes [i];
                  break;
                }
              }
            }
                        
            if (node) {
              var ngword = "";
              for (var target in NGWordList) {
                var words = NGWordList [target];
                for (var k = 0; k < words.length; k ++) {
                  var word = words [k];
                  if (target & 0x0401) {
                    /* カタログ */
                                    
                    if (Aima_Aimani.getInnerHTML2 (node)
                        .search (word)
                        != -1) {
                      ngword = RegExp.lastMatch
                        || word;
                      break;
                    }
                  }
                }
              }
                            
              if (ngword) {
                /* NG ワードがあった場合 */
                Aima_Aimani.addNGNumber (threadNum,
                                         info.server, info.dir,
                                         ngword, Aima_Aimani.REASON_NG_WORD, imageNum);
                        
                result = 1;
                                
                Aima_Aimani.hideCatalogue
                  (targetDocument,
                   targetAnchor,
                   Aima_Aimani.REASON_NG_WORD,
                   Aima_Aimani.enableHideEntireThread);
              }
            }
          }
        }
                
        if (!ngwordOnly
            && (reason == Aima_Aimani.REASON_NONE
              || reason == Aima_Aimani.REASON_NG_NUMBER
              || reason == Aima_Aimani.REASON_NG_CAT
              || reason == Aima_Aimani.REASON_FORCE)
            && Aima_Aimani.enableNGNumber) {
          var name, text;
          if (reason == Aima_Aimani.REASON_NG_NUMBER) {
            name = "show_catalogue_" + threadNum + "_" + imageNum;
            text = Aima_Aimani.textShowCatalogue;
          }
          else if (reason == Aima_Aimani.REASON_FORCE) {
            name
              = "forcehide_catalogue_"
              + threadNum + "_" + imageNum;
            text = Aima_Aimani.textHideCatalogue;
          }
          else {
            name = "hide_catalogue_" + threadNum + "_" + imageNum;
            text = Aima_Aimani.textHideCatalogue;
          }
          var newNode
            = Aima_Aimani.createAnchor
            (targetDocument, name, text,
             Aima_Aimani.enableBracket);
          newNode.style.fontSize = "8pt";
          if (!Aima_Aimani.enableNGNumberCatalogue) {
            newNode.style.display = "none";
          }
          if (targetAnchor.parentNode.lastChild
              && "className" in targetAnchor.parentNode.lastChild
              && targetAnchor.parentNode.lastChild.className
              == "aima_aimani_generated") {
            /* 先に NG カタログが入っている */
            targetAnchor.parentNode.insertBefore
              (newNode,
               targetAnchor.parentNode.lastChild);
          }
          else {
            targetAnchor.parentNode.appendChild (newNode);
          }
        }
        break;
      }
    }
        
    return result;
  },
    
  /**
   * 全てのカタログの NG 番号、文字スレを非表示にする
   * 
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  Boolean ngwordOnly
   *         NG ワードのみか
   */
  applyCatalogueEasyNG : function (targetDocument) {
    var container
    = targetDocument.createElement ("div");
    container.className = "aima_aimani_generated";
    container.style.backgroundColor = "#ffffee";
    container.style.cssFloat = "right";
        
    var numNode = null;
    if (Aima_Aimani.enableEasyNGType == "num") {
      var newNode
        = Aima_Aimani.createAnchor
        (targetDocument, "easyng_hidenumber_1_0",
         Aima_Aimani.textEasyNGStart, true);
      numNode = newNode;
      container.appendChild (newNode);
    }
    else {
      var newNode
      = Aima_Aimani.createAnchor
      (targetDocument, "easyng_open_0_0",
       Aima_Aimani.textEasyNGStart, true);
      if (Aima_Aimani.enableEasyNGType != "all_close") {
        newNode.style.color = "#800000";
      }
      container.appendChild (newNode);
            
      newNode = targetDocument.createElement ("span");
      newNode.style.fontSize = "10pt";
      newNode.className = "aima_aimani_generated";
      newNode.style.marginLeft = "8px";
      if (Aima_Aimani.enableEasyNGType == "all_close") {
        newNode.style.display = "none";
      }
            
      var containerAnchor = newNode;
                    
      newNode
      = Aima_Aimani.createAnchor
      (targetDocument, "easyng_hidenumber_2_0",
       Aima_Aimani.textHideNumber, true);
      numNode = newNode;
      containerAnchor
      .appendChild (newNode);
            
      if (Aima_Aimani.enableEasyNGType == "all_open"
          || Aima_Aimani.enableEasyNGType == "all_close") {
        newNode
          = targetDocument.createTextNode ("\uFF0F");
        containerAnchor
          .appendChild (newNode);
                
        newNode
          = Aima_Aimani.createAnchor
          (targetDocument, "easyng_shownumber_0_0",
           Aima_Aimani.textShowNumber, true);
        containerAnchor
          .appendChild (newNode);
      }
            
      var param
      = Aima_Aimani.getDocumentParam (targetDocument);
      var info = param.location_info;
            
      if (Aima_AimaniNGCat.enableNGCat
          && !((info.server + ":" + info.dir)
               in Aima_AimaniNGCat.boardSelectExList)) {
        newNode
          = targetDocument.createTextNode ("\uFF0F");
        containerAnchor
          .appendChild (newNode);
                        
        newNode
          = Aima_Aimani.createAnchor
          (targetDocument, "easyng_hidecat_0_0",
           Aima_Aimani.textHideNumber, true);
        newNode.style.color = "#7f2962";
        containerAnchor
          .appendChild (newNode);
                
        if (Aima_Aimani.enableEasyNGType == "all_open"
            || Aima_Aimani.enableEasyNGType == "all_close") {
          newNode
            = targetDocument.createTextNode ("\uFF0F");
          containerAnchor
            .appendChild (newNode);
                    
          newNode
            = Aima_Aimani.createAnchor
            (targetDocument, "easyng_showcat_0_0",
             Aima_Aimani.textShowNumber, true);
          newNode.style.color = "#7f2962";
          containerAnchor
            .appendChild (newNode);
        }
      }
            
      container.appendChild (containerAnchor);
    }
        
    if (Aima_Aimani.enableEasyNGStartup) {
      Aima_Aimani.onAnchorClick (targetDocument,
                                 numNode, numNode.getAttribute ("name"),
                                 false, false);
    }
        
    var nodes = targetDocument.getElementsByTagName ("th");
    if (nodes.length >= 1) {
      var th;
      th = nodes [0];
            
      th.insertBefore (container, th.firstChild);
    }
    /* 避難所 patch */
    else {
      var div = targetDocument.getElementById ("modebox");
      div.insertBefore (container, div.firstChild);
    }
        
    if (true) {
      targetDocument.body.addEventListener
      ("mousemove",
       function () {
        Aima_Aimani.onEasyNGMouseMove (arguments [0]);
      }, true);
      targetDocument.body.addEventListener
      ("mousedown",
       function () {
        Aima_Aimani.onEasyNGMouseDown (arguments [0]);
      }, true);
      targetDocument.body.addEventListener
      ("mouseup",
       function () {
        Aima_Aimani.onEasyNGMouseUp (arguments [0]);
      }, true);
    }
  },
    
  /**
   * 全てのカタログの NG 番号、文字スレを非表示にする
   * 
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  Boolean ngwordOnly
   *         NG ワードのみか
   * @param  Object NGWordList
   *         NG ワード
   */
  applyCatalogue : function (targetDocument, ngwordOnly,
                             NGWordList) {
    var nodes = targetDocument.getElementsByTagName ("td");
    for (var i = 0; i < nodes.length; i ++) {
      Aima_Aimani.applyCatalogueCore (targetDocument, nodes [i],
                                      ngwordOnly, NGWordList);
    }
    if (!ngwordOnly && Aima_Aimani.enableEasyNG) {
      Aima_Aimani.applyCatalogueEasyNG (targetDocument);
    }
  },
    
  /**
   * レスの NG 番号、NG ワード、NG サムネ、スレッドルールを非表示にする
   * 赤福用のハンドラ
   * 
   * @param  HTMLTableCellElement targetNode
   *         レスの td 要素
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   */
  hideNGNumberHandler : function (targetNode, targetDocument) {
    if (Aima_Aimani.useAkahukuCustomEvents) {
      return;
    }
    Aima_Aimani.applyNGNumberForRes (targetNode, targetDocument);
  },
  /**
   * レスの NG 番号等を非表示にする
   *
   * @param  HTMLTableCellElement targetNode
   * @param  HTMLDocument targetDocument [optional]
   * @return Boolean 非表示にしたか
   */
  applyNGNumberForRes : function (targetNode, targetDocument) {
    if (Aima_Aimani.enableAll) {
      var hide = false;
      var result = 0;
      
      targetNode = Aima_Aimani.getMessageBQ (targetNode);
      if (targetNode.length == 0) {
        return false;
      }
      targetNode = targetNode [0];
      if (!targetDocument) {
        targetDocument = targetNode.ownerDocument;
      }
      
      /* 非表示にしていた場合、解除する */
      var container;
      
      container = Aima_Aimani.getMessageContainer (targetNode);
      if (!container) {
        return false;
      }
      var tmp = container.main.nextSibling;
      if (tmp
          && Aima_Aimani.hasClassName (tmp, "aima_aimani_hidden")) {
        tmp.parentNode.removeChild (tmp);
      }
      container.main.style.display = "";
      
      var param = Aima_Aimani.getDocumentParam (targetDocument);
      if (param == null) {
        return;
      }
      var info = param.location_info;
      if (info) {
        var enableNGWord = Aima_Aimani.enableNGWord;
        var name = info.server + ":" + info.dir;
        if (name in Aima_Aimani.NGWordBoardSelectExList) {
          enableNGWord = false;
        }
        var enableNGThumbnail = Aima_Aimani.enableNGThumbnail;
        var name = info.server + ":" + info.dir;
        if (name in Aima_Aimani.NGThumbnailBoardSelectExList) {
          enableNGThumbnail = false;
        }
        /* ロード時から有効だった場合のみ動作する */
        result
          = Aima_Aimani
          .applyCore (targetDocument, targetNode, true,
                      true,
                      Aima_Aimani.enableNGNumber,
                      enableNGWord,
                      enableNGThumbnail,
                      false, Aima_Aimani.enableThreadRule, 
                      Aima_Aimani.NGWordList);
      }
            
      if (result & 1 || result & 2) {
        hide = true;
      }
      if (result & 4) {
        if (Aima_Aimani.enableHideStyle) {
          Aima_Aimani.modifyStyleFile (true);
        }
                
        if (enableNGThumbnail) {
          Aima_AimaniConfigManager.saveNGThumbnail ();
        }
      }
            
      if (!hide) {
        /* 非表示にしなかった場合テーブルを表示する */
        for (var i = 0; i < container.nodes.length; i ++) {
          container.nodes [i].style.display = "";
        }
        return false;
      }
      else {
        return true;
      }
    }
    return false;
  },
    
  /**
   * DOM ツリーに追加後に呼ばれる赤福用のハンドラ
   * 
   * @param  HTMLTableCellElement targetNode
   *         レスの td 要素
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   */
  hideNGNumberHandler2 : function (targetNode, targetDocument) {
  },
    
  /**
   * NG 番号、NG ワード、NG サムネ、スレッドルールを非表示にする
   * 
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLQuoteElement targetNode
   *         対象の blockquote 要素
   * @param  Boolean isRes
   *         レスかどうか
   * @param  Boolean anchor
   *         アンカーを付けるかどうか
   * @param  Boolean enableNGNumber
   *         NG 番号
   * @param  Boolean enableNGWord
   *         NG ワード
   * @param  Boolean enableNGThumbnail
   *         NG サムネ
   * @param  Boolean enableTextThread
   *         文字スレ非表示
   * @param  Boolean enableThreadRule
   *         スレッドルール
   * @param  Object NGWordList
   *         NG ワード
   * @return Number
   *         結果 (or で結合)
   *           1: スレを非表示にした
   *           2: レスを非表示にした
   *           4: NG 番号が増えた
   */
  applyCore : function (targetDocument, targetNode, isRes,
                        anchor,
                        enableNGNumber, enableNGWord, enableNGThumbnail,
                        enableTextThread, enableThreadRule,
                        NGWordList) {
    var hideThread;
    var checkNo;
    
    var num = 0;
    var imageNum = 0;
    var imageNode = null;
    var imageWidth = 0;
    var imageHeight = 0;
    var imageBytes = 0;
    var imageExt = 0;
    
    var hide_reason = Aima_Aimani.REASON_NONE;
    
    var ngword = "";
    var ngword_subject = "";
    var ngword_name = "";
    var ngword_mail = "";
    var ngword_id = "";
    var ngword_ip = "";
    
    var node;
    
    var noNode = null;
    var linkNode = null;
    var threadTmpNode = null;
        
    var info = Aima_Aimani.getDocumentParam (targetDocument).location_info;
        
    node = targetNode;
    while (node
           && node.nodeName.toLowerCase () != "hr") {
      var prevNode = node.previousSibling;
            
      if (node.nodeName.toLowerCase () == "#text") {
        if (num == 0
            && node.nodeValue.indexOf ("No.") != -1
            && node.nodeValue.match (/No\.([0-9]+)/)) {
          /* スレ番号、レス番号の場合 */
          num = parseInt (RegExp.$1);
                    
          noNode = node;
        }
                
        if (node.nodeValue.indexOf ("ID:") != -1
            && node.nodeValue.match (/ID:([^ ]+)/)) {
          /* ID の場合 */
          ngword_id = RegExp.$1;
        }
                
        if (node.nodeValue.indexOf ("IP:") != -1
            && node.nodeValue.match (/IP:([^ ]+)/)) {
          /* IP アドレス の場合 */
          ngword_ip = RegExp.$1;
        }
      }
      else if (node.nodeName.toLowerCase () == "a") {
        var href;
        href = node.getAttribute ("href");
                
        if (href) {
          if (href.match (/red\/([0-9]+)/)
              || href.match (/d\/([0-9]+)/)
              || href.match (/src\/([0-9]+)/)
              || href.match (/r\.php\?r=([0-9]+)/)) {
            /* 画像のリンクの場合 */
            if (node.firstChild) {
              if (node.firstChild.nodeName.toLowerCase ()
                  == "img") {
                /* 画像の場合 */
                                
                imageNode = node.firstChild;
                imageNum = parseInt (RegExp.$1);
                imageWidth
                  = node.firstChild.getAttribute ("width")
                  || node.firstChild.width;
                imageHeight = node.firstChild.getAttribute ("height")
                  || node.firstChild.height;
                if ("alt" in node.firstChild
                    && node.firstChild.alt
                    .match (/([0-9]*)/)) {
                  imageBytes = RegExp.$1;
                }
                else {
                  imageBytes = "0";
                }
              }
              else if (node.firstChild.nodeValue
                       && node.firstChild.nodeValue
                       .match (/[0-9]+\.(.+)$/)) {
                /* 画像のファイル名の場合 */
                imageExt = RegExp.$1;
                linkNode = node;
              }
            }
          }
          else if (href.match (/^mailto:/)) {
            /* メール欄の場合 */
            ngword_mail = href.replace (/^mailto:/, "");
                        
            try {
              ngword_mail = unescape (ngword_mail);
                            
              ngword_mail
                = Aima_AimaniConverter
                .convertFromUTF8 (ngword_mail);
            }
            catch (e) {
            }
                        
            if (Aima_Aimani.getInnerHTML2 (node)
                .indexOf ("IP:") != -1
                && Aima_Aimani.getInnerHTML2 (node)
                .match (/IP:([^ ]+)/)) {
              /* IP アドレス の場合 */
              ngword_ip = RegExp.$1;
            }
          }
          else if (href.match (/http:\/\/www\.amazon\.co\.jp\//)) {
            /* Amazon の広告 */
            return 0;
          }
        }
      }
      else if (node.nodeName.toLowerCase () == "font") {
        var color = node.getAttribute ("color");
        var color2 = node.style.color;
        var className = "className" in node ? node.className : "";
                
        if (color == "blue" || color2 == "blue" || color == "green") {
          ngword_mail = Aima_Aimani.getInnerText (node);
          ngword_mail
            = ngword_mail
            .replace (/^\[/, "")
            .replace (/\]$/, "");
        }
        else if (color == "#cc1105") {
          ngword_subject = Aima_Aimani.getInnerText (node);
          ngword_subject = ngword_subject.replace (/ $/, "");
        }
        else if (color == "#117743") {
          var nodes2 = node.getElementsByTagName ("font");
          if (nodes2.length > 0) {
            ngword_name = Aima_Aimani.getInnerText (nodes2 [0]);
          }
          else {
            ngword_name = Aima_Aimani.getInnerText (node);
          }
          ngword_name = ngword_name.replace (/ $/, "");
          var nodes2 = node.getElementsByTagName ("a");
          for (var i = 0; i < nodes2.length; i ++) {
            var href = nodes2 [i].getAttribute ("href");
            if (href) {
              if (href.match (/^mailto:/)) {
                /* メール欄の場合 */
                ngword_mail
                  = href.replace (/^mailto:/, "");
              }
            }
          }
          var nodes = node.getElementsByTagName ("font");
          for (var i = 0; i < nodes.length; i ++) {
            var color = nodes [i].getAttribute ("color");
            var color2 = nodes [i].style.color;
            if (("className" in nodes [i]
                 && nodes [i].className == "akahuku_shown_mail")
                || color == "blue" || color2 == "blue") {
              ngword_mail = Aima_Aimani.getInnerText (nodes [i]);
              ngword_mail
                = ngword_mail
                .replace (/^\[/, "")
                .replace (/\]$/, "");
            }
          }
        }
        else if (className == "akahuku_shown_mail") {
          ngword_mail = Aima_Aimani.getInnerText (node);
          ngword_mail
            = ngword_mail
            .replace (/^\[/, "")
            .replace (/\]$/, "");
        }
        else {
          if (Aima_Aimani.getInnerHTML2 (node).indexOf ("IP:") != -1
              && Aima_Aimani.getInnerHTML2 (node)
              .match (/IP:([^ ]+)/)) {
            /* IP アドレス の場合 */
            ngword_ip = RegExp.$1;
          }
        }
      }
            
      node = prevNode;
    }
        
    var tmpNode;
        
    var result = 0;
        
    if (enableNGNumber) {
      var item;
            
      item
        = Aima_Aimani
        .arrayExists3 (Aima_Aimani.NGNumberList,
                       num, info.server, info.dir);
            
      if (item && item [4] == 3
          && Aima_Aimani.enableShowTextThreadReply && info.isReply) {
        item = null;
      }
      if (item) {
        hide_reason = item [4];
      }
    }
        
    var nodes = targetNode.getElementsByTagName ("font");
    var admin = false;
    for (var i = 0; i < nodes.length; i ++) {
      if (nodes [i].getAttribute ("color") == "#ff0000"
          && Aima_Aimani.getInnerHTML2 (nodes [i])
          .match (/^\u7BA1\u7406\u4EBA$/)) {
        hide_reason = Aima_Aimani.REASON_NONE;
        admin = true;
      }
    }
        
    if (hide_reason != Aima_Aimani.REASON_NONE
        && hide_reason != Aima_Aimani.REASON_FORCE) {
      /* NG 番号にあった場合 */
            
      if (isRes) {
        tmpNode
        = Aima_Aimani
        .hideRes (targetDocument, targetNode,
                  hide_reason, Aima_Aimani.enableHideEntireRes,
                  num, imageNum, hide_reason != Aima_Aimani.REASON_NG_NUMBER);
                
        if (tmpNode) {
          var newNode;
          if (hide_reason == Aima_Aimani.REASON_NG_NUMBER) {
            newNode
              = Aima_Aimani.createAnchor
              (targetDocument,
               "show_res_" + num + "_" + imageNum,
               Aima_Aimani.textShowNumber, true);
            tmpNode.appendChild (newNode);
          }
        }
        result = 2;
      }
      else {
        tmpNode
        = Aima_Aimani
        .hideThread (targetDocument, targetNode,
                     hide_reason, Aima_Aimani.enableHideEntireThread);
                
        if (hide_reason == Aima_Aimani.REASON_NG_NUMBER && tmpNode) {
          var newNode;
          newNode
            = Aima_Aimani.createAnchor
            (targetDocument,
             "show_thread_" + num + "_" + imageNum,
             Aima_Aimani.textShowNumber, true);
          tmpNode.parentNode.insertBefore (newNode,
                                           tmpNode);
        }
        else {
          threadTmpNode = tmpNode;
        }
                
        noNode = null;
        linkNode = null;
                
        result = 1;
      }       
    }
    else if (!admin && hide_reason == Aima_Aimani.REASON_NONE) {
      if (imageNum == 0) {
        /* 文字スレ、文字レスの場合 */
                
        if (isRes) {
          /* 文字レスの場合 */
                    
          if (enableThreadRule && info.isReply
              && info.threadRule & Aima_Aimani.THREADRULE_NO_TEXTRES) {
            Aima_Aimani
            .hideRes (targetDocument, targetNode,
                      Aima_Aimani.REASON_TEXT_RES,
                      Aima_Aimani.enableHideEntireRes,
                      num, imageNum, true);
                        
            hide_reason = 2;//FIXME: REASON_NG_THUMB ?
            result = 2;
          }
        }
        else {
          /* 文字スレの場合 */
                    
          if (enableTextThread
              && (!Aima_Aimani.enableShowTextThreadReply
                  || info.isNormal)) {
            hide_reason = Aima_Aimani.REASON_TEXT_THRE;
            if (Aima_Aimani.enableHideStyle) {
              Aima_Aimani.addNGNumber (num,
                                       info.server, info.dir,
                                       "", hide_reason, 0);
            }
                        
            threadTmpNode
            = Aima_Aimani
            .hideThread (targetDocument, targetNode,
                         hide_reason,
                         Aima_Aimani.enableHideEntireThread);
            noNode = null;
            linkNode = null;
            result = 1 | 4;
          }
        }
      }
      else {
        if (isRes) {
          /* 画像レスの場合 */
                    
          if (enableThreadRule && info.isReply
              && info.threadRule & Aima_Aimani.THREADRULE_NO_IMG_RES) {
            Aima_Aimani
            .hideRes (targetDocument, targetNode,
                      Aima_Aimani.REASON_TEXT_RES,
                      Aima_Aimani.enableHideEntireRes,
                      num, imageNum, true);
                        
            hide_reason = 2; // FIXME: REASON_NG_THUMB ?
            result = 2;
          }
        }
                
        if (Aima_Aimani.enableMiniThumb
            || (enableThreadRule && info.isReply && isRes)) {
          if (Aima_Aimani.enableMiniThumb
              || info.threadRule & Aima_Aimani.THREADRULE_MINI_THUMB) {
            var w, h, s;
            w = imageNode.getAttribute ("width")
            || imageNode.width;
            h = imageNode.getAttribute ("height")
            || imageNode.height;
            s = Aima_Aimani.ThreadRuleMiniThumbSize;
            if (w > h) {
              if (w > s) {
                h = parseInt (h * s / w);
                w = s;
              }
            }
            else {
              if (h > s) {
                w = parseInt (w * s / h);
                h = s;
              }
            }
            if (imageNode.style.width == w + "px") {
              /* 適用済み */
            }
            else {
              imageNode.style.width = w + "px";
              imageNode.style.height = h + "px";
              imageNode.setAttribute ("__aima_aimani_mini_thumb", "1");
            }
          }
          else {
            imageNode.style.width = "";
            imageNode.style.height = "";
          }
        }
                
        if (enableNGThumbnail) {
          var item
          = Aima_Aimani
          .arrayExistsNGThumbnail (Aima_Aimani.NGThumbnailList,
                                   imageWidth, imageHeight,
                                   imageBytes, imageExt);
          if (item) {
            /* NG サムネの場合 */
            hide_reason = Aima_Aimani.REASON_NG_THUMB;
            item [5] ++;
                        
            Aima_Aimani.addNGNumber (num,
                                     info.server, info.dir,
                                     item [0] + "_" + item [1]
                                     + "_" + item [2] + "_"
                                     + item [3],
                                     hide_reason, imageNum);
                        
            if (isRes) {
              Aima_Aimani
                .hideRes (targetDocument, targetNode,
                          hide_reason,
                          Aima_Aimani.enableHideEntireRes,
                          num, imageNum, true);
              result = 2 | 4;
            }
            else {
              threadTmpNode
                = Aima_Aimani
                .hideThread (targetDocument, targetNode,
                             hide_reason,
                             Aima_Aimani
                             .enableHideEntireThread);
              noNode = null;
              linkNode = null;
              result = 1 | 4;
            }
          }
        }
      }
            
      if (enableThreadRule && info.isReply && isRes
          && info.threadRule & Aima_Aimani.THREADRULE_SAGE_ONLY) {

        if (ngword_mail.indexOf ("sage") == -1) {
          Aima_Aimani
          .hideRes (targetDocument, targetNode,
                    Aima_Aimani.REASON_NO_SAGE,
                    Aima_Aimani.enableHideEntireRes,
                    num, imageNum, true);
                    
          hide_reason = 2; // FIXME: REASON_NG_THUMB ?
          result = 2;
        }
      }
            
      if (enableThreadRule && info.isReply && isRes
          && info.threadRule & Aima_Aimani.THREADRULE_NO_SAGE) {

        if (ngword_mail.indexOf ("sage") != -1) {
          Aima_Aimani
          .hideRes (targetDocument, targetNode,
                    Aima_Aimani.REASON_SAGE,
                    Aima_Aimani.enableHideEntireRes,
                    num, imageNum, true);
                    
          hide_reason = 2; // FIXME: REASON_NG_THUMB ?
          result = 2;
        }
      }
      
      if (hide_reason == Aima_Aimani.REASON_NONE && enableNGWord) {
        /* どれにもあてはまらない場合、NG ワードを検索する */
        
        var ngword = "";
        var comment = Aima_Aimani.getInnerHTML2 (targetNode);
        
        for (var target in NGWordList) {
          var words = NGWordList [target];
          for (var k = 0; k < words.length; k ++) {
            var word = words [k];
            if ((!isRes && target & 0x0100)
                || (isRes && target & 0x0200)) {
                        
              if (target & 0x0001) {
                /* 本文 */
                                
                if (comment.search (word) != -1) {
                  ngword = RegExp.lastMatch
                    || word;
                  break;
                }
              }
                        
              if (target & 0x0002) {
                /* メル欄など */
                            
                if (ngword_mail.search (word) != -1) {
                  ngword = RegExp.lastMatch
                    || word;
                  break;
                }
                if (ngword_name.search (word) != -1) {
                  ngword = RegExp.lastMatch
                    || word;
                  break;
                }
                if (ngword_subject.search (word) != -1) {
                  ngword = RegExp.lastMatch
                    || word;
                  break;
                }
                if (ngword_id.search (word) != -1) {
                  ngword = RegExp.lastMatch
                    || word;
                  break;
                }
                if (ngword_ip.search (word) != -1) {
                  ngword = RegExp.lastMatch
                    || word;
                  break;
                }
              }
            }
          }
        }
        if (Aima_Aimani.enableNGWordCont) {
          var re
          = comment.match
          (Aima_Aimani.NGWordContRegExp);
          if (re) {
            var m = re [1];
            var lastMatch = RegExp.lastMatch;
            m
              = m
              .replace (/<\/?[^>]+>/g, "")
              .replace (/&[^;]+;/g, "_");
            if (m.length >= Aima_Aimani.NGWordContLength) {
              ngword = lastMatch || " ";
            }
          }
        }
        if (ngword) {
          /* NG ワードがあった場合 */
          hide_reason = Aima_Aimani.REASON_NG_WORD;
          Aima_Aimani.addNGNumber (num,
                                   info.server, info.dir,
                                   ngword, hide_reason, imageNum);
                    
          if (isRes) {
            Aima_Aimani
              .hideRes (targetDocument, targetNode,
                        hide_reason, Aima_Aimani.enableHideEntireRes,
                        num, imageNum, true);
            result = 2 | 4;
          }
          else {
            threadTmpNode
            = Aima_Aimani
            .hideThread (targetDocument, targetNode,
                         hide_reason, Aima_Aimani.enableHideEntireThread);
            noNode = null;
            linkNode = null;
            result = 1 | 4;
          }
        }
      }
    }
        
    if (anchor) {
      if (!admin && (noNode || threadTmpNode) && enableNGNumber) {
        /* NG 番号のアンカー */
                
        var name = "";
        var text = "";
        if (hide_reason == Aima_Aimani.REASON_FORCE) {
          text = Aima_Aimani.textForceHideNumber;
          if (isRes) {
            name = "forcehide_res_" + num + "_" + imageNum;
          }
          else {
            name = "forcehide_thread_" + num + "_" + imageNum;
          }
        }
        else if (hide_reason != Aima_Aimani.REASON_NONE && !isRes) {
          text = Aima_Aimani.textForceShowNumber;
          name = "forceshow_thread_" + num + "_" + imageNum;
        }
        else if (hide_reason != Aima_Aimani.REASON_NONE
            && hide_reason != Aima_Aimani.REASON_NG_NUMBER
            && isRes) {
          text = Aima_Aimani.textForceHideNumber;
          name = "forcehide_res_" + num + "_" + imageNum;
        }
        else {
          text = Aima_Aimani.textHideNumber;
          if (isRes) {
            name = "hide_res_" + num + "_" + imageNum;
          }
          else {
            name = "hide_thread_" + num + "_" + imageNum;
          }
        }
                
        if (name) {
          var newNode
          = Aima_Aimani.createAnchor
          (targetDocument, name, text, true);
                    
          if (noNode) {
            noNode.parentNode.insertBefore (newNode,
                                            noNode.nextSibling);
          }
          else {
            threadTmpNode.parentNode.insertBefore (newNode,
                                                   threadTmpNode);
          }
        }
                
        if (!isRes && info.isNormal
            && Aima_Aimani.enableNGNumberBottom) {
          var hrNode = null;
          tmpNode = targetNode;
          while (tmpNode) {
            if (tmpNode.nodeName.toLowerCase () == "hr") {
              hrNode = tmpNode;
              break;
            }
            tmpNode = tmpNode.nextSibling;
          }
          if (hrNode) {
            newNode
            = Aima_Aimani.createAnchor
            (targetDocument,
             "hide_thread_" + num + "_" + imageNum + "_bottom",
             Aima_Aimani.textHideNumber, true);
                        
            hrNode.parentNode.insertBefore (newNode, hrNode);
          }
        }
      }
            
      if (hide_reason == Aima_Aimani.REASON_NONE
          || hide_reason == Aima_Aimani.REASON_FORCE) {
        /* 該当なし, もしくは強制表示 */
                
        if (noNode && !isRes && enableThreadRule && info.isReply) {
          /* スレッドルールのアンカー */
          var name, text;
          name
          = "rule_open_" + info.threadNumber + "_" + info.threadRule;
          text = Aima_Aimani.textThreadRule;
          newNode
          = Aima_Aimani.createAnchor
          (targetDocument, name, text, true);
                    
          noNode.parentNode.insertBefore (newNode,
                                          noNode.nextSibling);
        }
            
        if (!admin && linkNode && imageNum != 0 && enableNGThumbnail) {
          /* NG サムネのアンカー */
          var name;
          var comment = Aima_Aimani.getCommentFirstLine (targetNode);
                
          if (isRes) {
            name
              = "hide_res_" + num + "_" + imageNum
              + "_" + imageWidth + "_" + imageHeight
              + "_" + imageBytes + "_" + imageExt
              + "_" + escape (comment);
          }
          else {
            name
            = "hide_thread_" + num + "_" + imageNum
            + "_" + imageWidth + "_" + imageHeight
            + "_" + imageBytes + "_" + imageExt
            + "_" + escape (comment);
          }
                
          newNode
          = Aima_Aimani.createAnchor
          (targetDocument, name,
           Aima_Aimani.textHideThumbnail, true);
          linkNode.parentNode.insertBefore (newNode,
                                            linkNode.nextSibling);
        }
      }
    }
        
    return result;
  },
    
  /**
   * HTMLElement.innerHTML と同等の機能を提供する
   * ただし、赤福、合間合間に が追加したアンカーは削除する
   *
   * @param  HTMLElement element
   *         対象の要素
   * @return String
   *         要素の中の文字列
   */
  getInnerHTML2 : function (element) {
    var nodes, i;
    var normal = true;
        
    nodes = element.getElementsByTagName ("a");
    for (i = 0; i < nodes.length; i ++) {
      if ("className" in nodes [i]
          && nodes [i].className == "akahuku_generated_link") {
        normal = false;
        break;
      }
    }
        
    nodes = element.getElementsByTagName ("font");
    for (i = 0; i < nodes.length; i ++) {
      if (nodes [i].getAttribute ("__akahuku_troll") == "1") {
        normal = false;
        break;
      }
    }
        
    nodes = element.getElementsByTagName ("small");
    for (i = 0; i < nodes.length; i ++) {
      if ("className" in nodes [i]
          && nodes [i].className == "akahuku_generated") {
        normal = false;
        break;
      }
    }
        
    if (normal) {
      return element.innerHTML;
    }
    
    var innerHTML;
    var element2 = element.cloneNode (true);
    element2.style.display = "none";
    element.parentNode.appendChild (element2);
    
    nodes = element2.getElementsByTagName ("font");
    for (i = 0; i < nodes.length; i ++) {
      if (nodes [i].getAttribute ("__akahuku_troll") == "1") {
        nodes [i].parentNode.replaceChild
          (nodes [i].firstChild, nodes [i]);
      }
      else if ("className" in nodes [i]
               && nodes [i].className == "akahuku_generated_link_child") {
        var dummyText
          = unescape (atob (nodes [i].getAttribute
                            ("__akahuku_link_tmp")));
        var newNode = element.ownerDocument.createTextNode (dummyText);
        nodes [i].parentNode.replaceChild (newNode, nodes [i]);
        i --;
      }
    }
        
    nodes = element2.getElementsByTagName ("a");
    for (i = 0; i < nodes.length; i ++) {
      if ("className" in nodes [i]
          && nodes [i].className == "akahuku_generated_link") {
        var dummyText;
        dummyText
          = Aima_Aimani.unescapeEntity
          (Aima_Aimani.getInnerText (nodes [i]));
        var newNode
          = element.ownerDocument.createTextNode (dummyText);
        nodes [i].parentNode.replaceChild (newNode, nodes [i]);
        i --;
      }
    }

    nodes = element2.getElementsByTagName ("small");
    for (i = 0; i < nodes.length; i ++) {
      if ("className" in nodes [i]
          && nodes [i].className == "akahuku_generated") {
        nodes [i].parentNode.removeChild (nodes [i]);
        i --;
      }
    }
        
    innerHTML = element2.innerHTML;
        
    element.parentNode.removeChild (element2);
    
    return innerHTML;
  },

  unescapeEntity : function (text) {
    return text
    .replace (/&gt;/g, ">")
    .replace (/&lt;/g, "<")
    .replace (/&quot;/g, "\"")
    .replace (/&#x27;/g, "\'")
    .replace (/&nbsp;/g, " ")
    .replace (/&amp;/g, "&");
  },
    
  /**
   * Opera/IE の HTMLElement.getInnerText と同等の機能を提供する
   * ただし、赤福、合間合間に が追加したアンカーは削除する
   *
   * @param  HTMLElement element
   *         対象の要素
   * @return String
   *         要素の中の文字列
   */
  getInnerText : function (element) {
    if ("className" in element
        && (element.className == "akahuku_generated"
            || element.className == "aima_aimani_generated")) {
      return "";
    }
        
    if (element.nodeName.toLowerCase () == "br") {
      return "\n";
    }
    else if (element.firstChild) {
      var text = "";
      var node = element.firstChild;
      while (node) {
        text += Aima_Aimani.getInnerText (node);
        node = node.nextSibling;
      }
      return text;
    }
    else if (element.nodeName.toLowerCase () == "#text") {
      return Aima_Aimani.escapeEntity (element.nodeValue);
    }
    else if (element.alt) {
      return element.alt;
    }
        
    return "";
  },
    
  /**
   * HTML に使えない文字をエスケープする
   * 
   * @param  String text
   *         エスケープする文字列
   * @return String
   *         エスケープした文字列
   */
  escapeEntity : function (text) {
    return text
    .replace (/&/g, "&amp;")
    .replace (/\"/g, "&quot;")
    .replace (/\'/g, "&#x27;")
    .replace (/</g, "&lt;")
    .replace (/>/g, "&gt;")
    .replace (/\xa0/g, "&nbsp;");
  },
    
  /**
   * 全ての NG 番号、NG ワード、NG サムネ、スレッドルールを非表示にする
   * 
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  Boolean anchor
   *         アンカーを付けるかどうか
   * @param  Boolean enableNGNumber
   *         NG 番号
   * @param  Boolean enableNGWord
   *         NG ワード
   * @param  Boolean enableNGThumbnail
   *         NG サムネ
   * @param  Boolean enableTextThread
   *         文字スレ非表示
   * @param  Boolean enableThreadRule
   *         スレッドルール
   * @param  Object NGWordList
   *         NG ワード
   * @param  Boolean
   *         NG 番号が増えたかどうか
   */
  apply : function (targetDocument,
                    anchor,
                    enableNGNumber, enableNGWord, enableNGThumbnail,
                    enableTextThread, enableThreadRule,
                    NGWordList) {
    var nodes;
        
    var threadIndex = 0;
    var node;
        
    var number_add = false;
    var result;
    
    nodes = Aima_Aimani.getMessageBQ (targetDocument.body);
    for (var i = 0; i < nodes.length; i ++) {
      node = nodes [i];
      var isRes = false;
      var container = Aima_Aimani.getMessageContainer (node);
      if (container) {
        isRes = true;
        
        if (container.nodes [0].parentNode == null) {
          /* スレごと削除された */
          continue;
        }
      }
      else {
        var n = Aima_Aimani.findParentNodeByClassName (node, "r");
        if (n) {
          /* スレごと削除された */
          continue;
        }
      }
      
      if (!isRes) {
        threadIndex = i;
      }
            
      if (!anchor) {
        if (isRes && node.parentNode.style.display == "none") {
          /* 二回目以降は非表示になったものは飛ばす */
          continue;
        }
      }
      
      result
        = Aima_Aimani.applyCore (targetDocument, node, isRes,
                                 anchor,
                                 enableNGNumber, enableNGWord,
                                 enableNGThumbnail,
                                 enableTextThread, enableThreadRule,
                                 NGWordList);
            
      if (result & 4) {
        number_add = true;
      }
    }
        
    return number_add;
  },
    
  /**
   * スレッドルールから外れたものを表示する
   * 
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @param  HTMLQuoteElement targetNode
   *         対象の blockquote 要素
   */
  showThreadRuleCore : function (targetDocument, targetNode) {
    var container = Aima_Aimani.getMessageContainer (targetNode);
    
    if (container.main.style.display == "none") {
      var tmp = container.main.nextSibling;
      if (tmp
          && Aima_Aimani.hasClassName (tmp, "aima_aimani_hidden")) {
        container.main.parentNode.removeChild (tmp);
      }
      container.main.style.display = "";
      
      for (var i = 0; i < container.nodes.length; i ++) {
        container.nodes [i].style.display = "";
      }
      
      var param
        = Aima_Aimani.getDocumentParam (targetDocument);
      var info = param.location_info;
      var enableNGWord = Aima_Aimani.enableNGWord;
      var name = info.server + ":" + info.dir;
      if (name in Aima_Aimani.NGWordBoardSelectExList) {
        enableNGWord = false;
      }
      var enableNGThumbnail = Aima_Aimani.enableNGThumbnail;
      var name = info.server + ":" + info.dir;
      if (name in Aima_Aimani.NGThumbnailBoardSelectExList) {
        enableNGThumbnail = false;
      }
            
      Aima_Aimani.applyCore (targetDocument, targetNode, true,
                             false,
                             Aima_Aimani.enableNGNumber,
                             enableNGWord,
                             enableNGThumbnail,
                             false, Aima_Aimani.enableThreadRule,
                             Aima_Aimani.NGWordList);
    }
  },
    
  /**
   * 全てのスレッドルールを表示する
   * 
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   */
  showThreadRule : function (targetDocument) {
    var nodes = Aima_Aimani.getMessageBQ (targetDocument.body);
    
    var node;
        
    for (var i = 0; i < nodes.length; i ++) {
      node = nodes [i];
            
      var container = Aima_Aimani.getMessageContainer (node);
      if (container) {
        Aima_Aimani.showThreadRuleCore (targetDocument, node);
      }
    }
  },
    
  /**
   * レスの NG ワードを非表示にする
   * (旧) 赤福用のハンドラ
   * NG 番号のハンドラと統合したため、こちらは使用しない
   * 
   * @param  HTMLTableCellElement targetNode
   *         レスの td 要素
   */
  hideNGWordHandler : function (targetNode) {
  },
    
  /**
   * 「画像なし」のチェックボックスを非表示にする
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   */
  hideTextonlyCheckbox : function (targetDocument) {
    var textonly = targetDocument.getElementsByName ("textonly") [0];
    if (!textonly
        || textonly.nodeName.toLowerCase () != "input"
        || textonly.type.toLowerCase () != "checkbox") {
      return;
    }
        
    if  (textonly.parentNode.nodeName.toLowerCase () == "label") {
      textonly.parentNode.style.display = "none";
      var node;
      node = textonly.parentNode.previousSibling;
      if (node
          && node.nodeValue
          && node.nodeValue.match (/^[ \r\n\t]*\[[ \r\n\t]*$/)) {
        node.parentNode.removeChild (node);
      }
      node = textonly.parentNode.nextSibling;
      if (node
          && node.nodeValue
          && node.nodeValue.match (/^[ \r\n\t]*\][ \r\n\t]*$/)) {
        node.parentNode.removeChild (node);
      }
    }
    else {
      textonly.style.display = "none";
    }
  },

  /**
   * 選択範囲内のレスかスレを表示／非表示にする
   *
   * @param  Boolean hide
   *         非表示フラグ
   * @param  targetDocument
   */
  hideSelectedResOrThread : function (hide, targetDocument) {
    var param = Aima_Aimani.getDocumentParam (targetDocument);
    var info = param.location_info;
    if (info.isReply || info.isNormal) {
      Aima_Aimani.hideSelectedRes (hide, targetDocument, info);
    }
    else if (info.isCatalog) {
      Aima_Aimani.hideSelectedThread (hide, targetDocument, info);
    }
  },
    
  /**
   * 選択範囲内のレスを表示／非表示にする
   *
   * @param  Boolean hide
   *         非表示フラグ
   * @param  targetDocument
   * @param  info
   */
  hideSelectedRes : function (hide, targetDocument, info) {
    var nodes = Aima_Aimani.getSelectedAnchor (targetDocument);
        
    var number_add = false;
        
    for (var i = 0; i < nodes.length; i ++) {
      nodes [i].style.type = "1px solid red";
      var method, subtype, num, imageNum, additional;
            
      var shown = true;
      var container = Aima_Aimani.getMessageContainer (nodes [i]);
      if (container) {
        if (container.main.style.display == "none") {
          shown = false;
        }
      }
      else {
        shown = hide;
      }
            
      var type = nodes [i].getAttribute ("name");
      if (type
          && type.match (/^([^_]+)_([^_]+)_([^_]+)_([^_]+)(_(.+))?$/)) {
        method = RegExp.$1;
        subtype = RegExp.$2;
        num = parseInt (RegExp.$3);
        imageNum = parseInt (RegExp.$4);
        if (RegExp.$5) {
          additional = RegExp.$6;
        }
        else {
          additional = "";
        }
      }
            
      if (subtype == "thread") {
        var scroll = false;
      }
      if (additional) {
        if (additional
            .match (/^([^_]+)_([^_]+)_([^_]+)_([^_]+)_(.+)$/)) {
          /* NG サムネのアンカーは無視する */
          continue;
        }
        else if (additional == "bottom") {
          /* 下のアンカーは無視する */
          continue;
        }
      }
      if ((hide && method.match (/hide/) && shown)
          || (!hide && method.match (/show/))) {
        Aima_Aimani.onAnchorClick (targetDocument, nodes [i], type,
                                   true, false);
      }
    }
        
    var enableNGThumbnail = Aima_Aimani.enableNGThumbnail;
    var name = info.server + ":" + info.dir;
    if (name in Aima_Aimani.NGThumbnailBoardSelectExList) {
      enableNGThumbnail = false;
    }
        
    if (number_add) {
      if (Aima_Aimani.enableHideStyle) {
        Aima_Aimani.modifyStyleFile (true);
      }
            
      if (enableNGThumbnail) {
        Aima_AimaniConfigManager.saveNGThumbnail ();
      }
    }
  },
    
  /**
   * 選択範囲内のアンカーを取得する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   * @return Array
   *         選択範囲内のアンカー
   *         [HTMLAnchorElement, ...]
   */
  getSelectedAnchor : function (targetDocument) {
    if (true) {
      var focusedWindow = targetDocument.defaultView;
            
      var nodes = new Array ();
      var selection = focusedWindow.getSelection ();
      var range;
      var nodeName = "";
      var i;
      for (i = 0; i < selection.rangeCount; i ++) {
        range = selection.getRangeAt (i).cloneRange ();
                
        var node;
        var lastNode = null;
        var td;
        var startContainer = null;
        var endContainer = null;
        
        var container = Aima_Aimani.getMessageContainer (range.startContainer);
        if (container) {
          startContainer = container.main;
        }
        else {
          while (startContainer
                 && startContainer.nodeName.toLowerCase () != "hr") {
            if (startContainer.previousSibling) {
              startContainer = startContainer.previousSibling;
            }
            else {
              startContaier = startContainer.parentNode;
            }
          }
          if (startContainer == null) {
            startContainer = range.startContainer;
          }
        }
        
        var container = Aima_Aimani.getMessageContainer (range.endContainer);
        if (container) {
          endContainer = container.main;
        }
        else {
          while (endContainer
                 && endContainer.nodeName.toLowerCase () != "hr"
                 && endContainer.nodeName.toLowerCase () != "table") {
            if (endContainer.nextSibling) {
              endContainer = startContainer.nextSibling;
            }
            else {
              endContainer = startContainer.parentNode;
            }
          }
          if (endContainer
              && endContainer.nodeName.toLowerCase () == "table") {
            endContainer = endContainer.previousSibling;
          }
        }
                
        node = startContainer;
        while (node) {
          nodeName = node.nodeName.toLowerCase ();
          if (nodeName == "small"
              && "className" in node
              && node.className == "aima_aimani_generated") {
            if (node != lastNode) {
              nodes.push (node);
              lastNode = node;
            }
          }
                    
          if (node.firstChild) {
            node = node.firstChild;
          }
          else {
            var end = false;
            while (node) {
              if (node == endContainer) {
                end = true;
                break;
              }
                            
              if (node.nextSibling) {
                node = node.nextSibling;
                break;
              }
              node = node.parentNode;
            }
            if (end) {
              break;
            }
          }
        }
      }
            
      selection.removeAllRanges ();
      return nodes;
    }
  },

  /**
   * 選択範囲内のスレを表示／非表示にする(カタログ)
   *
   * @param  Boolean hide
   *         非表示フラグ
   * @param  targetDocument
   * @param  info
   */
  hideSelectedThread : function (hide, targetDocument, info)
  {
    var nodes = Aima_Aimani.getSelectedCatalogueCell (targetDocument);

    for (var i = 0; i < nodes.length; i ++) {
      if (hide) {
        Aima_Aimani.hideCatalogue
          (targetDocument, nodes [i],
           Aima_Aimani.REASON_NG_NUMBER,
           Aima_Aimani.enableHideEntireThread);
      }
      else {
        Aima_Aimani.showCatalogue (targetDocument, nodes [i]);
      }
    }
  },
  getSelectedCatalogueCell : function (targetDocument) {
    var nodes = [];
    var focusedWindow = targetDocument.defaultView;
    var selection = focusedWindow.getSelection ();

    var tables = targetDocument.getElementsByTagName ("table");
    var catTable = tables [1] || tables [0];
    var catRange = targetDocument.createRange ();
    catRange.selectNode (catTable);

    var tds = catTable.getElementsByTagName ("td");

    for (var i = 0; i < selection.rangeCount; i ++) {
      var range = selection.getRangeAt (i).cloneRange ();

      // range をカタログのテーブル内に丸める
      if (range.compareBoundaryPoints (range.START_TO_START, catRange) < 0) {
        range.setStart (catRange.startContainer, catRange.startOffset);
      }
      if (range.compareBoundaryPoints (range.END_TO_END, catRange) > 0) {
        range.setEnd (catRange.endContainer, catRange.endOffset);
      }

      // 範囲開始位置のセルをポイント
      var tmp;
      var startTd = range.startContainer;
      if (startTd.nodeType == startTd.TEXT_NODE) {
        startTd = startTd.parentNode;
      }
      else if (startTd.nodeType == startTd.ELEMENT_NODE) {
        startTd = range.startContainer.childNodes [range.startOffset];
      }
      else {
        startTd = tds [0];
      }
      if (startTd.nodeName.toLowerCase () != "td") {
        tmp = Aima_Aimani.findParentNode (startTd, "td");
        if (tmp) {
          startTd = tmp;
        }
        else {
          if (startTd.nodeName.toLowerCase () == "th") {
            do {
              startTd = startTd.nextSibling;
            } while (startTd && startTd.nodeName.toLowerCase () != "td");
            if (!startTd) {
              startTd = tds [0];
            }
          }
          else {
            startTd = tds [0];
          }
        }
      }

      // 範囲終了位置のセルをポイント
      var endTd = range.endContainer;
      var stopBeforeEndTd = false;
      if (endTd.nodeType == endTd.TEXT_NODE) {
        endTd = endTd.parentNode;
      }
      else if (endTd.nodeType == endTd.ELEMENT_NODE) {
        endTd = range.endContainer.childNodes [range.endOffset];
      }
      else {
        endTd = tds [tds.length-1];
      }
      if (endTd.nodeName.toLowerCase () == "td") {
        stopBeforeEndTd = true;
      }
      else {
        tmp = Aima_Aimani.findParentNode (endTd, "td");
        if (tmp) {
          endTd = tmp;
        }
        else {
          if (endTd.nodeName.toLowerCase () == "th") {
            do {
              endTd = endTd.nextSibling;
            } while (endTd && endTd.nodeName.toLowerCase () != "td");
            if (endTd) {
              stopBeforeEndTd = true;
            }
            else {
              endTd = tds [tds.length-1];
            }
          }
          else {
            endTd = tds [tds.length-1];
          }
        }
      }

      // 範囲内のセル(td)を回収
      var started = false;
      for (var j = 0; j < tds.length; j ++) {
        if (stopBeforeEndTd && tds [j] == endTd) {
          break;
        }
        if (tds [j] == startTd || started) {
          nodes.push (tds [j]);
          started = true;
        }
        if (tds [j] == endTd) {
          break;
        }
      }

      range.detach ();
    }
    return nodes;
  },
    
  /**
   * 対象のドキュメントを取得する
   *
   * @param  Event event
   *         対象のイベント
   * @return HTMLDocument
   *         対象のドキュメント
   */
  getTargetDocument : function (event) {
    return event.target.defaultView.document;
  },
    
  /**
   * スタイルファイルを修正する
   *
   * @param  Boolean register
   *         true: 修正して登録する
   *         false: 解除する
   */
  modifyStyleFile : function (register) {
    if (true) {

      this.styleSheet.unregister ();

      if (register) {
        var style = "";
        var prevPrefix;
        var prefix;
                
        prevPrefix= "";
        prefix = "";
        if (Aima_Aimani.enableHideStyle) {
          for (var i = 0; i < Aima_Aimani.NGNumberList.length; i ++) {
            if (Aima_Aimani.NGNumberList [i][4] == 9) {
              continue;
            }
            prefix
              = "http://" + Aima_Aimani.NGNumberList [i][1]
              + ".2chan.net/" + Aima_Aimani.NGNumberList [i][2]
              + "/";
            if (prefix != prevPrefix) {
              if (prevPrefix) {
                style += "}";
              }
              style
                += "@-moz-document url-prefix(" + prefix
                + ") {";
              prevPrefix = prefix;
            }
                    
            var num = Aima_Aimani.NGNumberList [i][0];
                    
            style
              += "a[href=\"futaba.php?res="+ num + "\"]"
              + " + blockquote {display: none !important;}";
                    
            style
              += "a[href*=\"res/" + num + ".htm\"]"
              + " + blockquote {display: none !important;}";
                    
            style
              += "td > input[name=\"" + num + "\"]"
              + "  +  blockquote {display: none !important;}";
                    
            style
              += "a[href=\"futaba.php?res="+ num + "\"]"
              + " + br + small {display: none !important;}";
                    
            style
              += "a[href*=\"res/" + num + ".htm\"]"
              + " + br + small {display: none !important;}";
                    
            if (Aima_Aimani.NGNumberList [i][1] == "zip"
                && Aima_Aimani.NGNumberList [i][1] == "6") {
              style
                += "td > font > a[href*=\"res/" + num
                + ".htm\"]"
                + " {display: none !important;}";
            }
          }
          if (prevPrefix) {
            style += "}";
          }
        }
        if (Aima_Aimani.enableHideThreadStyle) {
          for (var name in Aima_AimaniServerName) {
            if (name in Aima_Aimani.boardSelectExList) {
              continue;
            }
            if (name.match (/^([^:]+):(.+)$/)) {
              var server = RegExp.$1;
              var dir = RegExp.$2;
              
              prefix
              = "http://" + server
              + ".2chan.net/" + dir
              + "/";
              style
              += "@-moz-document url-prefix(" + prefix
              + ") {";
                            
              style
              += "body > form {visibility: hidden;}";
                            
              style
              += "}";
            }
          }
        }
        if (Aima_AimaniNGCat.enableNGCat) {
          for (var name in Aima_AimaniServerName) {
            if (name in Aima_AimaniNGCat.boardSelectExList) {
              continue;
            }
            if (name.match (/^([^:]+):(.+)$/)) {
              var server = RegExp.$1;
              var dir = RegExp.$2;
              prefix = "http://" + server + ".2chan.net/" + dir + "/";
              style
                += "@-moz-document url-prefix(" + prefix + ") {"
                // ハッシュ計算未成功
                + "td small.aima_aimani_generated"
                + "[name^='hide_ngcat_'][name$='_null?']"
                + "{color: #ccc !important;}"

                + "}";
            }
          }
        }
        if (Aima_Aimani.enableHideCatStyle) {
          for (var name in Aima_AimaniServerName) {
            if (name in Aima_AimaniNGCat.boardSelectExList) {
              continue;
            }
            if (name.match (/^([^:]+):(.+)$/)) {
              var server = RegExp.$1;
              var dir = RegExp.$2;
                            
              prefix
              = "http://" + server
              + ".2chan.net/" + dir
              + "/futaba.php?mode=cat";
              style
              += "@-moz-document url-prefix(" + prefix
              + ") {";
                            
              style
              += Aima_Aimani.styleCatalogueTableSelector
              + "{visibility: hidden;}";
                            
              style
              += "}";
            }
          }
        }

        this.styleSheet.setStyle (style);
        this.styleSheet.register ();
      }
    }
  },
    
  /**
   * body の unload イベント
   * 各種データを削除する
   *
   * @param  HTMLDocument targetDocument
   *         対象のドキュメント
   */
  onBodyUnload : function (targetDocument) {
    /* 各種データの参照関係を消し、削除する */
        
    try {
      var managerdata;
      var param;
            
      param = Aima_Aimani.getDocumentParam (targetDocument);
            
      managerdata = param.popup_managerdata;
      if (managerdata != null) {
        managerdata.targetDocument = null;
        managerdata.target = null;
        managerdata.popup = null;
      }
      param.popup_managerdata = null;
            
      Aima_Aimani.deleteDocumentParam (targetDocument);
    }
    catch (e){ Cu.reportError (e);
    }
  },
    
  /**
   * マウスを動かしたイベント
   * 選択範囲のアンカーの状態を変える
   *
   * @param  Event event
   *         対象のイベント
   */
  onMouseMove : function (event) {
    try {
      var targetDocument = event.target.ownerDocument;
      var param
      = Aima_Aimani.getDocumentParam (targetDocument);
      var info = param.location_info;

      if (Aima_Aimani.enableMiniThumb
          || info.threadRule & Aima_Aimani.THREADRULE_MINI_THUMB) {
        var node = event.target;
        var isReply;
        if (node
            && node.nodeName.toLowerCase () == "img") {
          if (Aima_Aimani.enableMiniThumb) {
            isReply = true;
          }
          else {
            var container = Aima_Aimani.getMessageContainer (node);
            if (container) {
              isReply = true;
            }
          }
          if (isReply) {
            var href = node.parentNode.getAttribute ("href");
            if (href.match (/red\/([0-9]+)/)
                || href.match (/d\/([0-9]+)/)
                || href.match (/src\/([0-9]+)/)
                || href.match (/r\.php\?r=([0-9]+)/)) {
              if (Aima_Aimani.enableThreadRuleMiniThumbHover) {
                param.lastImage = node;
              }
              node.style.width = "";
              node.style.height = "";
            }
                
            return;
          }
        }
            
        if (param.lastImage) {
          var w, h, s;
          var imageNode = param.lastImage;
                
          w = imageNode.getAttribute ("width") || imageNode.width;
          h = imageNode.getAttribute ("height") || imageNode.height;
          s = Aima_Aimani.ThreadRuleMiniThumbSize;
          if (w > h) {
            if (w > s) {
              h = parseInt (h * s / w);
              w = s;
            }
          }
          else {
            if (h > s) {
              w = parseInt (w * s / h);
              h = s;
            }
          }
          if (imageNode.style.width == w + "px") {
            /* 適用済み */
          }
          else {
            imageNode.style.width = w + "px";
            imageNode.style.height = h + "px";
            imageNode.setAttribute ("__aima_aimani_mini_thumb", "1");
          }
        }
      }
            
      if (node
          && node.nodeName.toLowerCase () != "small") {
        node = Aima_Aimani.findParentNode (node, "small");
      }
    }
    catch (e) { Cu.reportError (e);
    }
  },
    
  /**
   * 範囲選択のアンカーにマウスが乗ったイベント
   *
   * @param  HTMLElement target
   *         対象のアンカー
   */
  onAnchorOver : function (target) {
    target.firstChild.nodeValue
    = "[" + Aima_Aimani.textSelectResFrom + "]";
  },
    
  /**
   * 範囲選択のアンカーからマウスが出たイベント
   *
   * @param  HTMLElement target
   *         対象のアンカー
   */
  onAnchorOut : function (target) {
    target.firstChild.nodeValue
    = "[" + Aima_Aimani.textSelectRes + "]";
  },
  
  /**
   * メッセージの BLOCKQUOTE 列を取得する
   * メッセージ以外で BLOCKQUOTE が使用される事があるので
   * 必ずこれを使用する
   *
   * @param  HTMLElement targetNode
   *         対象のドキュメント
   * @return Array
   *         [HTMLQuoteElement, ...]
   */
  getMessageBQ : function (targetNode) {
    try {
      return Aima_Aimani.getMessageBQByXPath (targetNode);
    }
    catch (e) { Aima_Aimani.log (e);
    }
    return Aima_Aimani.getMessageBQByDOM (targetNode);
  },
  getMessageBQByXPath : function (targetNode) {
    var doc = targetNode.ownerDocument || targetNode;
    if (doc.nodeType != doc.DOCUMENT_NODE) {
      throw new Error ();
    }
    var newNodes = new Array ();
    var xpath = ".//blockquote"
      + "[count(ancestor::center)=0]"
      + "[count(ancestor::table[@border='1' or @class='ama'])=0]"
      + "[count(ancestor::div[@id='akahuku_respanel_content' or @class='ama'])=0]";
    var type = doc.defaultView.XPathResult.ORDERED_NODE_ITERATOR_TYPE;
    var it = doc.evaluate (xpath, targetNode, null, type, null);
    var node = it.iterateNext ();
    while (node) {
      newNodes.push (node);
      node = it.iterateNext ();
    }
    if (newNodes.length == 0) {
      // BLOCKQUOTE ではないバージョン
      xpath = ".//div["
        + "contains(concat(' ',normalize-space(@class),' '),' re ')"
        + " or contains(concat(' ',normalize-space(@class),' '),' t ')"
        + "]";
      it = doc.evaluate (xpath, targetNode, null, type, it);
      node = it.iterateNext ();
      while (node) {
        newNodes.push (node);
        node = it.iterateNext ();
      }
    }
    return newNodes;
  },
  getMessageBQByDOM : function (targetNode) {
    var nodes = targetNode.getElementsByTagName ("blockquote");
    var newNodes = new Array ();
    for (var i = 0; i < nodes.length; i ++) {
      if (Aima_Aimani.findParentNode (nodes [i], "center") != null) {
        continue;
      }
      var table = Aima_Aimani.findParentNode (nodes [i], "table");
      if (table && table.getAttribute ("border") == 1) {
        /* 広告のテーブルなので無視 */
        continue;
      }
      var div = Aima_Aimani.findParentNode (nodes [i], "div");
      if (div
          && div.id == "akahuku_respanel_content") {
        /* レスパネル中なので無視 */
        continue;
      }
      newNodes.push (nodes [i]);
    }
    
    if (newNodes.length == 0) {
      /* BLOCKQUOTE ではない */
      
      nodes = targetNode.getElementsByTagName ("div");
      for (var i = 0; i < nodes.length; i ++) {
        if (Aima_Aimani.isMessageBQ (nodes [i])) {
          newNodes.push (nodes [i]);
        }
      }
    }
    
    return newNodes;
  },
  
  /**
   * メッセージの BLOCKQUOTE 相当かどうかチェック
   *
   * @param  HTMLElement node
   *         対象の要素
   * @return Boolean
   *         メッセージの BLOCKQUOTE 相当かどうか
   */
  isMessageBQ : function (node) {
    if (node.nodeName.toLowerCase () == "blockquote") {
      return true;
    }
    
    if (Aima_Aimani.hasClassName (node, "re")
        || Aima_Aimani.hasClassName (node, "t")) {
      return true;
    }
    
    return false;
  },
  
  /**
   * クラス名を持つかどうか返す
   *
   * @param  HTMLElement node
   *         対象の要素
   * @param  String className
   *         クラス名
   * @return Boolean
   *         クラス名を持つかどうか
   */
  hasClassName : function (node, className) {
    var name = "";
    if ("className" in node
        && node.className) {
      name = node.className;
      var names = name.split (/ +/);
      for (var i = 0; i < names.length; i ++) {
        if (names [i] == className) {
          return true;
        }
      }
    }
    
    return false;
  },
  
  /**
   * レスのコンテナを返す
   *
   * @param  HTMLElement node
   *         レスのコンテナに含まれる要素
   * @return Object
   *         コンテナ
   */
  getMessageContainer : function (node) {
    try {
      return Aima_Aimani.getMessageContainerByXPath (node);
    }
    catch (e) {
    }
    return Aima_Aimani.getMessageContainerByDOM (node);
  },
  getMessageContainerByXPath : function (node) {
    var xpath = "./ancestor-or-self::td[1]/ancestor::table[1]";
    var doc = node.ownerDocument;
    var type = doc.defaultView.XPathResult.FIRST_ORDERED_NODE_TYPE;
    var re = doc.evaluate (xpath, node, null, type, null);
    var table = re.singleNodeValue;
    if (table) {
      xpath = ".//blockquote[1]/ancestor::td[1]";
      re = doc.evaluate (xpath, table, null, type, null);
      var td = re.singleNodeValue;
      if (td) {
        return {main: td, nodes: [table]};
      }
    }
    throw new Error ();
  },
  getMessageContainerByDOM : function (node) {
    var container = {};
    
    var td = Aima_Aimani.findParentNode (node, "td");
    if (td) {
      var table = Aima_Aimani.findParentNode (td, "table");
      if (table) {
        var nodes = table.getElementsByTagName ("blockquote");
        if (nodes.length > 0) {
          var td2 = Aima_Aimani.findParentNode (nodes [0], "td");
          if (td2) {
            container.main = td2;
            container.nodes = [table];
            
            return container;
          }
        }
      }
    }
    
    var n = Aima_Aimani.findParentNodeByClassName (node, "r");
    if (n) {
      var s = n;
      while (s) {
        if (Aima_Aimani.hasClassName (s, "s")) {
          break;
        }            
        s = s.previousSibling;
      }
      
      var br = n;
      while (br) {
        if (br.nodeName.toLowerCase () == "br") {
          break;
        }            
        br = br.nextSibling;
      }
      
      if (s && br) {
        container.main = n;
        container.nodes = [s, n, br];
          
        return container;
      }
      if (br) {
        container.main = n;
        container.nodes = [n, br];
          
        return container;
      }
    }
    
    return null;
  },
  
  /**
   * レスのコンテナを削除する
   *
   * @param  Object container
   *         対象のコンテナ
   */
  removeMessageContainer : function (container) {
    for (var i = 0; i < container.nodes.length; i ++) {
      container.nodes [i].parentNode.removeChild (container.nodes [i]);
    }
  },

  _consoleService : null,
  log : function (message) {
    if (!this._consoleService) {
      this._consoleService
        = Cc ["@mozilla.org/consoleservice;1"]
        .getService (Ci.nsIConsoleService);
    }
    var stack = Components.stack.caller;
    var flag = Ci.nsIScriptError.infoFlag;
    if (typeof message == "string") {
      if (/^!/.test (message)) {
        flag = Ci.nsIScriptError.errorFlag;
      }
    }
    else if (message instanceof Error) {
      flag = Ci.nsIScriptError.warningFlag;
    }
    var scriptError
      = Cc ["@mozilla.org/scripterror;1"]
      .createInstance (Ci.nsIScriptError);
    scriptError.init
      ("Aima_Aimani: " + String (message),
       stack.filename, null, stack.lineNumber, null,
       flag, "chrome javascript");
    this._consoleService.logMessage (scriptError);
  },

  executeSoon : function (func, optArgs) {
    var tm = Cc ["@mozilla.org/thread-manager;1"]
      .getService (Ci.nsIThreadManager);
    var runnable = {
      run: function () {
        if (typeof optArgs === "undefined") {
          func.apply (null);
        }
        else {
          func.apply (null, optArgs);
        }
      }
    };
    tm.mainThread.dispatch
      (runnable, Ci.nsIThread.DISPATCH_NORMAL);
  },

};

/**
 * 設定管理
 *   Inherits From: nsIObserver
 */
var Aima_AimaniConfigManager = {
  prefBranch : null,    /* nsIPrefBranch pref サービス */
  initialized : false,
  isParent : false,
  ipcListener : null,
  listeners : [],
  prefChangedTimerID : null,
    
  /**
   * 初期化処理
   */
  init : function (frame) {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.loadPrefBranch (frame);

    // 設定を取得する
    this.getConfigurationFromPreferencesAll ();
    this.getConfigurationFromPreferences ();
    this.getConfigurationFromPreferencesBoardExternal ();

    // ダイアログからの設定の変更を監視する
    this.prefBranch.addObserver ("aima_aimani.", this, false);
  },

  /**
   * 初期化処理 (Chrome process)
   */
  initAsParent : function () {
    if (this.initialized) {
      return;
    }
    this.isParent = true;
    this.loadPrefBranch ();

    var version = "";
    if (this.prefBranch.prefHasUserValue
        ("aima_aimani.version")) {
      version
        = this.prefBranch
        .getCharPref ("aima_aimani.version");
    }
    if (version != Aima_AimaniVersion) {
      this.prefBranch
      .setCharPref ("aima_aimani.version", Aima_AimaniVersion);
    }

    this.init ();

    Aima_Aimani.modifyStyleFile (Aima_Aimani.enableAll);
  },
    
  /**
   * prefBranch を初期化
   */
  loadPrefBranch : function () {
    if (this.prefBranch) {
      return;
    }

    this.prefBranch
    = Cc ["@mozilla.org/preferences-service;1"]
    .getService (Ci.nsIPrefBranch);

    if (!this.isParent) {
      this.prefBranch = new Aima_AimaniPrefBranchChild (this.prefBranch);
    }

    if (this.isParent) {
      // 書き込み要求を Chrome process で処理するためのリスナ登録
      var listener = new Aima_AimaniPrefBranchIPCListener (this.prefBranch);
      listener.init ();
      this.ipcListener = listener;
    }
  },
    
  /**
   * 終了処理
   */
  term : function () {
    // 設定の変更の監視を解除する
    if (this.prefBranch) {
      this.prefBranch.removeObserver ("aima_aimani.", this);
    }
    this.prefBranch = null;

    if (this.ipcListener) {
      this.ipcListener.term ();
    }
    this.ipcListener = null;

    this.listeners = [];

    if (this.prefChangedTimerID) {
      clearTimeout (this.prefChangedTimerID);
    }
    this.prefChangedTimerID = null;

    this.initialized = false;
  },
    
  /**
   * 設定の変更のイベント
   *   nsIObserver.observe
   *
   * @param  nsISupports subject
   *         不明
   * @param  String topic
   *         通知の対象
   * @param  String data
   *         通知の内容
   */
  observe : function (subject, topic, data){
    if (topic == "nsPref:changed"){
      /* 設定の変更の場合 */

      if (this.prefChangedTimerID) {
        clearTimeout (this.prefChangedTimerID);
      }
      this.prefChangedTimerID = setTimeout (function (that) {
        that.prefChangedTimerID = null;
        that.onPrefChanged ();
      }, 200, this);
    }
  },

  onPrefChanged : function () {
    this.getConfigurationFromPreferencesAll ();
    this.getConfigurationFromPreferences ();
    this.getConfigurationFromPreferencesBoardExternal ();

    this.notifyPrefChanged ();
  },

  notifyPrefChanged : function () {
    for (var i = 0; i < this.listeners.length; i ++) {
      try {
        this.listeners [i].onPrefChanged ();
      }
      catch (e) { Cu.reportError (e);
      }
    }
  },

  addPrefChangedListener : function (listener) {
    for (var i = 0; i < this.listeners.length; i ++) {
      if (this.listeners [i] == listener)
        return;
    }
    this.listeners.push (listener);
  },

  removePrefChangedListener : function (listener) {
    for (var i = 0; i < this.listeners.length; i ++) {
      if (this.listeners [i] == listener) {
        this.listeners.splice (i, 1);
        return;
      }
    }
  },
    
  /**
   * 設定を読み込む
   * 設定が無ければ既定値を書き込む
   *
   * @param  String type
   *         設定の種類
   *           "bool": bool
   *           "char": 文字列
   *           "int":  数値
   * @param  String name
   *         設定名
   * @param  Boolean/String/Number value
   *         既定値
   * @return Boolean/String/Number
   *         取得した値
   *         設定が無ければ既定値
   */
  initPref : function (type, name, value) {
    if (Aima_AimaniConfigManager.prefBranch.prefHasUserValue (name)) {
      ; /* switch のインデント用 */
      switch (type) {
        case "bool":
          value
            = Aima_AimaniConfigManager.prefBranch
            .getBoolPref (name);
          break;
        case "char":
          value
            = Aima_AimaniConfigManager.prefBranch
            .getCharPref (name);
          break;
        case "int":
          value
            = Aima_AimaniConfigManager.prefBranch
            .getIntPref (name);
          break;
      }
    }
    else {
      if (value == null) {
        return null;
      }
      ; /* switch のインデント用 */
      switch (type) {
        case "bool":
          Aima_AimaniConfigManager.prefBranch
            .setBoolPref (name, value);
          break;
        case "char":
          Aima_AimaniConfigManager.prefBranch
            .setCharPref (name, value);
          break;
        case "int":
          Aima_AimaniConfigManager.prefBranch
            .setIntPref (name, value);
          break;
      }
    }
        
    return value;
  },
    
  /**
   * 全機能の ON／OFF について、設定を読み込む
   */
  getConfigurationFromPreferencesAll : function () {
    Aima_AimaniConfigManager.loadPrefBranch ();
        
    Aima_Aimani.enableAll
    = Aima_AimaniConfigManager.initPref ("bool", "aima_aimani.all", true);
  },
    
  /**
   * 外部の板について、設定を読み込む
   */
  getConfigurationFromPreferencesBoardExternal : function () {
    Aima_AimaniConfigManager.loadPrefBranch ();
        
    Aima_Aimani.enableBoardExternal
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.board_external", false);
    if (Aima_Aimani.enableBoardExternal) {
      Aima_Aimani.boardExternalList = new Array ();
      var tmp
        = Aima_AimaniConfigManager
        .initPref ("char", "aima_aimani.board_external.patterns", "");
      if (tmp != "") {
        /* 値を解析するだけなので代入はしない */
        tmp.replace
          (/([^&,]*)&([^&,]*),?/g,
           function (matched, pattern, flag) {
            flag = parseInt (flag);
            if (flag & 2) {
              /* プレフィックス */
              Aima_Aimani.boardExternalList.push
                (new Array (unescape (pattern),
                            flag));
            }
            else {
              /* パターン */
              Aima_Aimani.boardExternalList.push
                (new Array (new RegExp (unescape (pattern)),
                            flag));
            }
            return "";
          });
      }
    }
  },
    
  /**
   * ステータスバー、ツールバーのパネルについて、設定を読み込む
   */
  getConfigurationFromPreferencesPanel : function () {
    Aima_AimaniConfigManager.loadPrefBranch ();
        
    Aima_Aimani.enableStatusbarPreferences
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.statusbar.preferences", true);
    Aima_Aimani.enableStatusbarNGWord
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.statusbar.ng_word", true);
    Aima_Aimani.enableToolbarPreferences
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.toolbar.preferences", false);
    Aima_Aimani.enableToolbarNGWord
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.toolbar.ng_word", false);
  },
    
  /**
   * 各種設定を読み込む
   */
  getConfigurationFromPreferences : function () {
    var value;
        
    Aima_AimaniConfigManager.loadPrefBranch ();
        
    Aima_Aimani.enableHideWarning
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.hide_warning", false);
    Aima_Aimani.enableHideStyle
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.hide_style", false);
    Aima_Aimani.enableHideThreadStyle
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.hide_thread_style", false);
    Aima_Aimani.enableHideCatStyle
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.hide_cat_style", false);
    Aima_Aimani.enableCatalogueUnlink
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.catalogue_unlink", false);
    Aima_Aimani.enableShowTextThreadReply
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.show_textthread_reply", false);
        
    Aima_Aimani.enablePopupMessage
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.popup_message", true);
    if (Aima_Aimani.enablePopupMessage) {
      Aima_Aimani.popupMessageDelay
        = Aima_AimaniConfigManager
        .initPref ("int",  "aima_aimani.popup_message.delay", 1000);
    }
        
    Aima_Aimani.enableHideEntireThread
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.hide_entire_thread", false);
    Aima_Aimani.enableHideEntireRes
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.hide_entire_res", false);
    if (Aima_Aimani.enableHideEntireRes) {
      Aima_Aimani.enableHideEntireResInstant
        = Aima_AimaniConfigManager
        .initPref ("bool", "aima_aimani.hide_entire_res_instant", true);
    }
        
    Aima_Aimani.enableNGWord
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.ng_word", true);
    if (Aima_Aimani.enableNGWord) {
      Aima_Aimani.enableNGWordCont
        = Aima_AimaniConfigManager
        .initPref ("bool", "aima_aimani.ng_word.cont", false);
      Aima_Aimani.NGWordContLength
        = Aima_AimaniConfigManager
        .initPref ("int", "aima_aimani.ng_word.cont.length", 6);
      Aima_Aimani.NGWordContCount
        = Aima_AimaniConfigManager
        .initPref ("int", "aima_aimani.ng_word.cont.count", 3);
      if (Aima_Aimani.NGWordContLength < 2) {
        Aima_Aimani.NGWordContLength = 2;
      }
      if (Aima_Aimani.NGWordContCount < 2) {
        Aima_Aimani.NGWordContCount = 2;
      }
            
      var word
        = "((<[^>]+>)?(([^<]+)(?!\\4)[^<]+)(<[^>]+>)?)"
        + "((<[Bb][Rr]>)?\\1){"
        + (Aima_Aimani.NGWordContCount - 1)
        + ",}";
            
      Aima_Aimani.NGWordContRegExp = new RegExp (word);
            
      Aima_AimaniConfigManager.loadNGWord ();
            
      value
        = Aima_AimaniConfigManager
        .initPref ("char", "aima_aimani.ng_word.board_select.ex_list",
                   "");
      Aima_Aimani.NGWordBoardSelectExList = new Object ();
      if (value) {
        /* 値を解析するだけなので代入はしない */
        value.replace
          (/([^,]+),?/g,
           function (matched, part1) {
            Aima_Aimani.NGWordBoardSelectExList [unescape (part1)]
              = true;
            return "";
          });
      }
    }
        
    Aima_Aimani.enableNGThumbnail
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.ng_thumbnail", true);
    if (Aima_Aimani.enableNGThumbnail) {
      Aima_AimaniConfigManager
        .loadNGThumbnail ();
      value
        = Aima_AimaniConfigManager
        .initPref ("char",
                   "aima_aimani.ng_thumbnail.board_select.ex_list",
                   "");
      Aima_Aimani.NGThumbnailBoardSelectExList = new Object ();
      if (value) {
        /* 値を解析するだけなので代入はしない */
        value.replace
          (/([^,]+),?/g,
           function (matched, part1) {
            Aima_Aimani.NGThumbnailBoardSelectExList
              [unescape (part1)]
              = true;
            return "";
          });
      }
    }
        
    Aima_AimaniNGCat.getPreference ();
        
    Aima_Aimani.enableBracket
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.bracket", true);
    if (Aima_Aimani.enableBracket) {
      Aima_Aimani.bracketLeft = "[";
      Aima_Aimani.bracketRight = "]";
    }
    else {
      Aima_Aimani.bracketLeft = "";
      Aima_Aimani.bracketRight = "";
    }
        
    Aima_Aimani.enableNGNumber
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.ng_number", true);
    if (Aima_Aimani.enableNGNumber) {
      Aima_Aimani.enableNGNumberCatalogue
        = Aima_AimaniConfigManager
        .initPref ("bool", "aima_aimani.ng_number.catalogue", true);
      Aima_Aimani.enableEasyNG
        = Aima_AimaniConfigManager
        .initPref ("bool", "aima_aimani.easyng", false);
      if (Aima_Aimani.enableEasyNG) {
        value = "all_open";
        if (Aima_AimaniConfigManager
            .initPref ("char", "aima_aimani.easyng.type", null)
            == null) {
          /* バージョンが古い */
          if (Aima_AimaniConfigManager
              .initPref ("bool", "aima_aimani.easyng.hideonly",
                         false)) {
            value = "num";
          }
          else {
            value = "all_open";
          }
        }
        else {
          value
            = Aima_AimaniConfigManager
            .initPref ("char", "aima_aimani.easyng.type",
                       "all_open");
        }
                
        Aima_Aimani.enableEasyNGType = value;
                
        Aima_Aimani.enableEasyNGStartup
          = Aima_AimaniConfigManager
          .initPref ("bool", "aima_aimani.easyng.startup", false);
      }
      Aima_Aimani.enableNGNumberBottom
        = Aima_AimaniConfigManager
        .initPref ("bool", "aima_aimani.ng_number.bottom", false);
      Aima_Aimani.NGNumberExpire
        = Aima_AimaniConfigManager
        .initPref ("int",  "aima_aimani.ng_number.expire", 4000);
      Aima_Aimani.enableNGNumberSelection
        = Aima_AimaniConfigManager
        .initPref ("bool", "aima_aimani.ng_number.selection", false);
            
      Aima_AimaniConfigManager.loadNGNumber ();
    }
        
    Aima_Aimani.enableThreadRule
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.thread_rule", false);
    if (Aima_Aimani.enableThreadRule) {
      Aima_Aimani.ThreadRuleExpire
        = Aima_AimaniConfigManager
        .initPref ("int",  "aima_aimani.thread_rule.expire", 4000);
    }
    Aima_Aimani.ThreadRuleMiniThumbSize
    = Aima_AimaniConfigManager
    .initPref ("int",  "aima_aimani.thread_rule.mini_thumb.size",
               32);
    Aima_Aimani.enableThreadRuleMiniThumbHover
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.thread_rule.mini_thumb.hover",
               false);
    Aima_AimaniConfigManager.loadThreadRule ();
        
    Aima_Aimani.enableMiniThumb
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.mini_thumb", false);
        
    Aima_Aimani.enableTextThread
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.text_thread", true);
        
    Aima_Aimani.enableBoardSelect
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.board_select", false);
    if (Aima_Aimani.enableBoardSelect) {
      value
        = Aima_AimaniConfigManager
        .initPref ("char", "aima_aimani.board_select.ex_list", "");
      Aima_Aimani.boardSelectExList = new Object ();
            
      if (value) {
        /* 値を解析するだけなので代入はしない */
        value.replace
          (/([^,]+),?/g,
           function (matched, part1) {
            Aima_Aimani.boardSelectExList [unescape (part1)] = true;
            return "";
          });
      }
    }
  },
    
  /**
   * NG ワードを読み込む
   */
  loadNGWord : function () {
    var now = (new Date ()).getTime ();
    Aima_Aimani.nearestExpireTime = 0;
    var expired = false;
    var list = "";
    Aima_Aimani.NGWordList = new Object ();
    var tmp
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.ng_word.list", "");
    if (tmp != "") {
      /* 値を解析するだけなので代入はしない */
      tmp.replace
        (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&?([^&,]*)?,?/g,
         function (matched, word, r, target, dummy1, dummy2, expire) {
          word = unescape (word);
          r = unescape (r) == "o";
          target = parseInt (unescape (target));
          if (dummy1 == "o") {
            target |= 0x0500;
          }
          if (dummy2 == "o") {
            target |= 0x0200;
          }
          if (!expire) {
            expire = "0";
          }
                    
          expire = unescape (expire);
          if (expire != "0") {
            if (expire.match (/^1_([0-9]*)$/)) {
              /* 時間制限 */
              var expireTime = parseInt (RegExp.$1);
              if (expireTime < now) {
                /* 期限切れ */
                expired = true;
                return "";
              }
              if (Aima_Aimani.nearestExpireTime == 0
                  || Aima_Aimani.nearestExpireTime > expireTime) {
                Aima_Aimani.nearestExpireTime = expireTime;
              }
            }
          }
          list += matched;
                    
          if (r) {
            word = word.replace (/\xa5/g, "\\");
          }
          else {
            word = word.replace
              (/([\(\)\[\]\{\}\\\^\$\+\*\?\|\-])/g, "\\$1");
          }
                    
          if (target in Aima_Aimani.NGWordList) {
            if (r && word.match (/\\[0-9]+/)) {
              Aima_Aimani.NGWordList [target].push (word);
            }
            else {
              Aima_Aimani.NGWordList [target][0] += "|" + word;
            }
          }
          else {
            Aima_Aimani.NGWordList [target] = new Array ();
            Aima_Aimani.NGWordList [target].push (word);
          }
                    
          return "";
        });
    }
        
    if (expired) {
      Aima_AimaniConfigManager.prefBranch
      .setCharPref ("aima_aimani.ng_word.list", list);
    }
        
    /* 全てを正規表現に変換する */
    for (var target in Aima_Aimani.NGWordList) {
      var words = Aima_Aimani.NGWordList [target];
      var ic = false;
      if (target & 0x8000) {
        ic = true;
      }
      for (var k = 0; k < words.length; k ++) {
        if (ic) {
          words [k] = new RegExp (words [k], "i");
        }
        else {
          words [k] = new RegExp (words [k]);
        }
      }
      Aima_Aimani.NGWordList [target] = words;
    }
  },

  /**
   * NG ワード追加後に現在のドキュメントに適用する
   */
  loadNGWordAndApply : function (targetDocument) {
    var now
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.ng_word.list", "");
    var param = Aima_Aimani.getDocumentParam (targetDocument);
    if (!param) {
      return;
    }

    var info = param.location_info;
    var enableNGWord = Aima_Aimani.enableNGWord;
    var name = info.server + ":" + info.dir;
    if (name in Aima_Aimani.NGWordBoardSelectExList) {
      enableNGWord = false;
    }
    if (!(enableNGWord && now)) {
      return;
    }

    var tmp = now.split (",");
    var tmp2 = tmp [0].split ("&");

    var a = new Object ();

    var word = unescape (tmp2 [0]);
    var r = unescape (tmp2 [1]) == "o";
    var ic = parseInt (unescape (tmp2 [2])) & 0x8000;

    var target = 0;
    target |= tmp2 [2];
    if (unescape (tmp2 [3]) == "o") {
      target |= 0x0100;
    }
    if (unescape (tmp2 [4]) == "o") {
      target |= 0x0200;
    }

    if (r) {
      word = word.replace (/\xa5/g, "\\");
    }
    else {
      word = word.replace
        (/([\(\)\[\]\{\}\\\^\$\+\*\?\|\-])/g, "\\$1");
    }

    if (ic) {
      word = new RegExp (word, "i");
    }
    else {
      word = new RegExp (word);
    }

    a [target] = new Array ();
    a [target].push (word);

    info = param.location_info;

    if (info.isCatalog) {
      Aima_Aimani.applyCatalogue (targetDocument, true, a);
      if (Aima_Aimani.enableHideStyle) {
        Aima_Aimani.modifyStyleFile (true);
      }
    }
    else {
      var result
        = Aima_Aimani.apply (targetDocument,
                             false,
                             false,
                             true,
                             false,
                             false,
                             false,
                             a);

      if (result) {
        if (Aima_Aimani.enableHideStyle) {
          Aima_Aimani.modifyStyleFile (true);
        }
      }
    }
    Aima_AimaniConfigManager.loadNGWord ();
  },
    
  /**
   * NG サムネを読み込む
   */
  loadNGThumbnail : function () {
    Aima_Aimani.NGThumbnailList = new Array ();
    var tmp
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.ng_thumbnail.list", "");
    if (tmp != "") {
      /* 値を解析するだけなので代入はしない */
      tmp.replace
        (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&?([^&,]*)?&?([^&,]*)?&?([^&,]*)?,?/g,
         function (matched, width, height, bytes, ext, comment,
                   count, date) {
          if (!comment) {
            comment = "";
          }
          if (!count) {
            count = 0;
          }
          if (!date) {
            date = 0;
          }
                    
          Aima_Aimani.NGThumbnailList
            .push (new Array (parseInt (unescape (width)),
                              parseInt (unescape (height)),
                              unescape (bytes),
                              unescape (ext),
                              unescape (comment),
                              parseInt (unescape (count)),
                              parseInt (unescape (date))));
          return "";
        });
    }
  },
    
  /**
   * NG 番号を読み込む
   */
  loadNGNumber : function () {
    Aima_Aimani.NGNumberList = new Array ();
    var tmp
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.ng_number.list", "");
    if (tmp != "") {
      /* 値を解析するだけなので代入はしない */
      tmp.replace
        (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*),?/g,
         function (matched,
                   number, server, dir, depend, reason, image) {
          Aima_Aimani.NGNumberList
            .push (new Array (parseInt (unescape (number)),
                              unescape (server),
                              unescape (dir),
                              unescape (depend),
                              parseInt (unescape (reason)),
                              parseInt (unescape (image))));
          return "";
        });
    }
  },
    
  /**
   * スレッドルールを読み込む
   */
  loadThreadRule : function () {
    Aima_Aimani.ThreadRuleList = new Array ();
    var tmp
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.thread_rule.list", "");
    if (tmp != "") {
      /* 値を解析するだけなので代入はしない */
      tmp.replace
        (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*),?/g,
         function (matched, number, server, dir, rule) {
          Aima_Aimani.ThreadRuleList
            .push (new Array (parseInt (unescape (number)),
                              unescape (server),
                              unescape (dir),
                              parseInt (unescape (rule))));
          return "";
        });
    }
  },
    
  /**
   * NG サムネを保存する
   */
  saveNGThumbnail : function () {
    var tmp = "";
    for (var i = 0; i < Aima_Aimani.NGThumbnailList.length; i ++) {
      if (tmp != "") {
        tmp += ",";
      }
      tmp
        += escape (Aima_Aimani.NGThumbnailList [i][0])
        + "&" + escape (Aima_Aimani.NGThumbnailList [i][1])
        + "&" + escape (Aima_Aimani.NGThumbnailList [i][2])
        + "&" + escape (Aima_Aimani.NGThumbnailList [i][3])
        + "&" + escape (Aima_Aimani.NGThumbnailList [i][4])
        + "&" + escape (Aima_Aimani.NGThumbnailList [i][5])
        + "&" + escape (Aima_Aimani.NGThumbnailList [i][6]);
    }
        
    Aima_AimaniConfigManager.prefBranch
    .setCharPref ("aima_aimani.ng_thumbnail.list", tmp);
  },
    
  /**
   * NG 番号を保存する
   *
   * @param  Number num
   *         操作した番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   */
  saveNGNumber : function (num, server, dir) {
    var tmp = "";
    for (var i = 0; i < Aima_Aimani.NGNumberList.length; i ++) {
      var expire;
      var board;
      board = server + ":" + dir;
            
      expire = Aima_Aimani.NGNumberExpire;
      if (board in Aima_AimaniMaxNum
          && Aima_AimaniMaxNum [board] > expire) {
        expire = Aima_AimaniMaxNum [board];
      }
            
      if (Aima_Aimani.NGNumberList [i][1] == server
          && Aima_Aimani.NGNumberList [i][2] == dir
          && Aima_Aimani.NGNumberList [i][0]
          + expire < num) {
        /* 期限が切れたら削除する */
        Aima_Aimani.NGNumberList.splice (i, 1);
                
        i --;
      }
      else {
        if (tmp != "") {
          tmp += ",";
        }
        tmp
          += escape (Aima_Aimani.NGNumberList [i][0])
          + "&" + escape (Aima_Aimani.NGNumberList [i][1])
          + "&" + escape (Aima_Aimani.NGNumberList [i][2])
          + "&" + escape (Aima_Aimani.NGNumberList [i][3])
          + "&" + escape (Aima_Aimani.NGNumberList [i][4])
          + "&" + escape (Aima_Aimani.NGNumberList [i][5]);
      }
    }
        
    Aima_AimaniConfigManager.prefBranch
    .setCharPref ("aima_aimani.ng_number.list", tmp);
  },
    
  /**
   * スレッドルールを保存する
   *
   * @param  Number num
   *         操作した番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   */
  saveThreadRule : function (num, server, dir) {
    var tmp = "";
    for (var i = 0; i < Aima_Aimani.ThreadRuleList.length; i ++) {
      var expire;
      var board;
      board = server + ":" + dir;
            
      expire = Aima_Aimani.ThreadRuleExpire;
      if (board in Aima_AimaniMaxNum
          && Aima_AimaniMaxNum [board] > expire) {
        expire = Aima_AimaniMaxNum [board];
      }
            
      if (Aima_Aimani.ThreadRuleList [i][1] == server
          && Aima_Aimani.ThreadRuleList [i][2] == dir
          && Aima_Aimani.ThreadRuleList [i][0]
          + expire < num) {
        /* 期限が切れたら削除する */
        Aima_Aimani.ThreadRuleList.splice (i, 1);
                
        i --;
      }
      else {
        if (tmp != "") {
          tmp += ",";
        }
        tmp
          += escape (Aima_Aimani.ThreadRuleList [i][0])
          + "&" + escape (Aima_Aimani.ThreadRuleList [i][1])
          + "&" + escape (Aima_Aimani.ThreadRuleList [i][2])
          + "&" + escape (Aima_Aimani.ThreadRuleList [i][3]);
      }
    }
        
    Aima_AimaniConfigManager.prefBranch
    .setCharPref ("aima_aimani.thread_rule.list", tmp);
  }
};

/**
 * e10s用 nsIPrefBranch もどき(child process)
 */
function Aima_AimaniPrefBranchChild (branch) {
  this.prefBranch = branch;
  this.messageManager
    = Cc ['@mozilla.org/childprocessmessagemanager;1']
    .getService (Ci.nsIMessageSender);
};
Aima_AimaniPrefBranchChild.prototype = {
  MESSAGE: "Aima_AimaniPrefBranchIPC",

  sendIPCMessage : function (methodName, args) {
    var data = {method: methodName, args: args};

    var rets = this.messageManager.sendSyncMessage (this.MESSAGE, data);
    if (rets.length !== 1) {
      Aima_Aimani.log ("! no response from IPC sync message: "+methodName);
      return undefined;
    }
    var ret = rets [0];
    if (ret !== null && typeof ret == "object"
        && "nsresult" in ret && "value" in ret && "message" in ret) {
      if (Components.isSuccessCode (ret.nsresult)) {
        return ret.value;
      }
      else {
        throw Components.Exception
          (ret.message, ret.nsresult, Components.stack.caller);
      }
    }
    Aima_Aimani.log ("! invalid response from IPC sync message: "+methodName);
    return undefined;
  },

  // nsIPrefBranch methods only possible in chrome process

  setBoolPref : function (prefName, value) {
    this.sendIPCMessage ("setBoolPref", [prefName, value]);
  },
  setCharPref : function (prefName, value) {
    this.sendIPCMessage ("setCharPref", [prefName, value]);
  },
  setIntPref : function (prefName, value) {
    this.sendIPCMessage ("setIntPref", [prefName, value]);
  },
  clearUserPref : function (prefName) {
    this.sendIPCMessage ("clearUserPref", [prefName]);
  },

  // e10s-ready nsIPrefBranch methods

  getBoolPref : function (prefName) {
    return this.prefBranch.getBoolPref (prefName);
  },
  getCharPref : function (prefName) {
    return this.prefBranch.getCharPref (prefName);
  },
  getIntPref : function (prefName) {
    return this.prefBranch.getIntPref (prefName);
  },
  prefHasUserValue : function (prefName) {
    return this.prefBranch.prefHasUserValue (prefName);
  },
  addObserver : function (name, observer, flag) {
    this.prefBranch.addObserver (name, observer, flag);
  },
  removeObserver : function (name, observer) {
    this.prefBranch.removeObserver (name, observer);
  },
};

function Aima_AimaniPrefBranchIPCListener (branch) {
  this.prefBranch = branch;
};
Aima_AimaniPrefBranchIPCListener.prototype = {
  MESSAGE: Aima_AimaniPrefBranchChild.prototype.MESSAGE,

  init : function () {
    var gppmm
      = Cc  ['@mozilla.org/parentprocessmessagemanager;1']
      .getService (Ci.nsIMessageListenerManager);
    gppmm.addMessageListener (this.MESSAGE, this, false);
  },

  term : function () {
    var gppmm
      = Cc  ['@mozilla.org/parentprocessmessagemanager;1']
      .getService (Ci.nsIMessageListenerManager);
    gppmm.removeMessageListener (this.MESSAGE, this);
    this.prefBranch = null;
  },

  // nsIMessageListener.receiveMessage
  receiveMessage : function (message) {
    if (message.name !== this.MESSAGE) {
      return;
    }

    var methodName = message.data.method;
    var args = message.data.args;
    var func = null;
    switch (methodName) {
      case "setBoolPref":
        func = this.prefBranch.setBoolPref;
        break;
      case "setCharPref":
        func = this.prefBranch.setCharPref;
        break;
      case "setIntPref":
        func = this.prefBranch.setIntPref;
        break;
      case "clearUserPref":
        func = this.prefBranch.clearUserPref;
        break;
    }

    var ret = {nsresult: 0, value: null, message: null};
    if (!func) {
      ret.message = "unknown method name:" + methodName;
      ret.nsresult = Cr.NS_ERROR_FAILURE;
      return ret;
    }
    try {
      ret.value = func.apply (this.prefBranch, args);
    }
    catch (e) {
      ret.nsresult = e.result;
      ret.message = e.message;
    }
    return ret;
  },
};


/**
 * 非表示にしたメッセージを表示するポップアップのデータ
 */
function Aima_AimaniPopupManagerData () {
}
Aima_AimaniPopupManagerData.prototype = {
  timerID : 0,           /* Number  タイマーの ID */
  pageX : 0,             /* Number  カーソルの X 座標 */
  pageY : 0,             /* Number  カーソルの Y 座標 */
  target : null,         /* HTMLElement  イベントの対象) */
  targetDocument : null, /* HTMLDocument  対象のドキュメント) */
  popup : null           /* HTMLDivElement  現在表示しているボップアップ) */
};

/**
 * 非表示にしたメッセージを表示するポップアップの管理
 */
var Aima_AimaniPopupManager = {
  /**
   * マウスを動かしたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onMouseMove : function (event) {
    try {
      var targetDocument = event.target.ownerDocument;
      var param = Aima_Aimani.getDocumentParam (targetDocument);
      if (!param) {
        return;
      }
      var managerdata = param.popup_managerdata;
            
      if (managerdata.timerID) {
        if (managerdata.target == event.explicitOriginalTarget) {
          /* 対象が同じで表示待ちの場合、抜ける */
          managerdata.pageX = event.pageX;
          managerdata.pageY = event.pageY;
          return;
        }
        targetDocument.defaultView
        .clearTimeout (managerdata.timerID);
      }
            
      managerdata.target = event.explicitOriginalTarget;
      managerdata.targetDocument = managerdata.target.ownerDocument;
      managerdata.pageX = event.pageX;
      managerdata.pageY = event.pageY;
            
      managerdata.timerID
      = targetDocument.defaultView
        .setTimeout (Aima_AimaniPopupManager.onTimeout,
                    Aima_Aimani.popupMessageDelay,
                    managerdata);
    }
    catch (e) { Cu.reportError (e);
    }
  },
    
  /**
   * マウスをクリックしたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onClick : function (event) {
    try {
      var targetDocument = event.target.ownerDocument;
      var managerdata
      = Aima_Aimani.getDocumentParam (targetDocument).popup_managerdata;
            
      var node = event.explicitOriginalTarget;
      while (node) {
        if (node.nodeName.toLowerCase () == "div"
            && "className" in node
            && node.className == "aima_aimani_generated_popup") {
          /* ポップアップの上にいる */
          return;
        }
        node = node.parentNode;
      }
            
      if (managerdata.popup) {
        /* 前のポップアップを削除する */
        managerdata.popup.parentNode.removeChild (managerdata.popup);
        managerdata.popup = null;
      }
    }
    catch (e) { Cu.reportError (e);
    }
  },
    
  /**
   * マウスを動かしてから指定時間経ったイベント
   *
   * @param  Aima_AimaniPopupManagerData managerdata
   *         ポップアップのデータ
   */
  onTimeout : function (managerdata) {
    var targetDocument;
        
    targetDocument = managerdata.targetDocument;
    
    /* 警告のノードを探す */
    var node = managerdata.target;
    while (node) {
      if (node.nodeName.toLowerCase () == "small"
          && "className" in node
          && node.className == "aima_aimani_warning") {
        break;
      }
      if (Aima_Aimani.hasClassName (node, "aima_aimani_hidden")) {
        var nodes = node.getElementsByTagName ("small");
        var ok = false;
        for (var i = 0; i < nodes.length; i ++) {
          if (nodes [i].nodeName.toLowerCase () == "small"
              && "className" in nodes [i]
              && nodes [i].className == "aima_aimani_warning") {
            node = nodes [i];
            ok = true;
            break;
          }
        }
        if (ok) {
          break;
        }
      }
      if (node.nodeName.toLowerCase () == "div"
          && "className" in node
          && node.className == "aima_aimani_generated_popup") {
        /* ポップアップの上にいる */
        return;
      }
      node = node.parentNode;
    }
    
    managerdata.target = node;
        
    if (managerdata.target) {
      /* ポップアップを作成する */
      
      var blockquote = null;
      var nodeName;
      
      var container = Aima_Aimani.getMessageContainer (managerdata.target);
      if (container) {
        var nodes = Aima_Aimani.getMessageBQ (container.main);
        if (nodes.length > 0) {
          blockquote = nodes [0];
        }
      }
      else {
        blockquote = managerdata.target.previousSibling;
      }
            
      if (blockquote) {
        var div = targetDocument.createElement ("div");
        Aima_Aimani.copyChildren (blockquote, div);
        div.className = "aima_aimani_generated_popup";
        div.style.position = "absolute";
        div.style.zIndex = "200";
        div.style.border = "1px solid #eeaa88";
        div.style.padding = "2px";
        div.style.backgroundColor = "#ffffee";
        div.style.fontSize = "9pt";
        div.style.left = (managerdata.pageX + 8) + "px";
        div.style.top = (managerdata.pageY + 8) + "px";
                
        if (managerdata.popup) {
          /* 前のポップアップを削除する */
          managerdata.popup.parentNode
            .removeChild (managerdata.popup);
          managerdata.popup = null;
        }
        managerdata.popup = div;
        targetDocument.body.appendChild (managerdata.popup);
      }
    }
    else {
      if (managerdata.popup) {
        /* 前のポップアップを削除する */
        targetDocument.body.removeChild (managerdata.popup);
        managerdata.popup = null;
      }
    }
  }
};

