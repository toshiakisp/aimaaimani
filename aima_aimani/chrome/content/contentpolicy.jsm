/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/**
 * NG 画像ブロック用コンテントポリシー XPCOMモジュール
 */
var EXPORTED_SYMBOLS = [
  "arAima_AimaniContentPolicy",
];

Components.utils.import ("resource://gre/modules/XPCOMUtils.jsm");

const Ci = Components.interfaces;

/**
 * 本体
 * NG 番号で画像のブロックを行う
 *   Inherits From: nsIContentPolicy, nsIObserver
 */
function arAima_AimaniContentPolicy () {
  this._init ();
}
arAima_AimaniContentPolicy.prototype = {
  // required properties for XPCOM registration by XPCOMUtils
  classDescription: "Aima_Aimani Content Policy JS Component",
  classID : Components.ID ("{812162d9-2c38-4012-a5e0-60205537cdad}"),
  contractID : "@unmht.org/aima-aimani-content-policy;1",
  _xpcom_categories : [
    {category: "content-policy",
      entry: "arAima_AimaniContentPolicy",
    },
  ],

  QueryInterface : XPCOMUtils.generateQI ([
    Ci.nsIContentPolicy,
    Ci.nsIObserver,
  ]),

  /* nsIContentPolicy の定数 */
  TYPE_IMAGE       : Ci.nsIContentPolicy.TYPE_IMAGE,
  ACCEPT           : Ci.nsIContentPolicy.ACCEPT,
  REJECT_OTHER     : Ci.nsIContentPolicy.REJECT_OTHER,
    
  /* Aima_Aimani 側の設定 */
  _prefAllName          : "aima_aimani.all",
  _prefCheckName        : "aima_aimani.savepref",
    
  _prefNGNumberName     : "aima_aimani.ng_number",
  _prefNGNumberListName : "aima_aimani.ng_number.list",
    
  _pref : null,          /* nsIPrefBranch  pref サービス */
    
  _enableBlock : false,  /* Boolean  ブロック有効かどうか */
  _blockList : null,     /* Array  ブロックする画像情報
                          *   [[String サーバ名, String ディレクトリ名,
                          *     String NG 番号], ...] */
    
  /**
   * 初期化処理
   */
  _init : function () {
    /* pref サービスの取得 */

    this._observerService
    = Components.classes ["@mozilla.org/observer-service;1"]
    .getService (Ci.nsIObserverService);
            
    this._observerService.addObserver (this, "xpcom-shutdown", false);
            
    this._pref
    = Components.classes ["@mozilla.org/preferences-service;1"]
    .getService (Ci.nsIPrefBranch);
    this._pref.addObserver (this._prefAllName, this, false);
    this._pref.addObserver (this._prefCheckName, this, false);
    this._pref.addObserver (this._prefNGNumberListName, this, false);
        
    /* 設定を取得する */
    this._updateList ();
    this._updateEnabled ();
  },
    
  /**
   * 設定の変更、および終了のイベント
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
    if (topic == "xpcom-shutdown"){
      /* 終了の場合 */
            
      /* オブザーバの登録を削除する */
      this._observerService.removeObserver (this, "xpcom-shutdown");
      this._pref.removeObserver (this._prefAllName, this);
      this._pref.removeObserver (this._prefCheckName, this);
      this._pref.removeObserver (this._prefNGNumberListName, this);
    }
    else if (topic == "nsPref:changed"){
      /* 設定の変更の場合 */
            
      /* 設定を取得する */
      this._updateEnabled ();
      this._updateList ();
    }
  },
    
  /**
   * ブロック有効かどうかの設定を取得する
   */
  _updateEnabled : function () {
    var enableAll = false;
    var enableNGNumber = false;
        
    if (this._pref.prefHasUserValue (this._prefAllName)) {
      enableAll = this._pref.getBoolPref (this._prefAllName);
    }
    if (this._pref.prefHasUserValue (this._prefNGNumberName)) {
      enableNGNumber = this._pref.getBoolPref (this._prefNGNumberName);
    }
        
    this._enableBlock = enableAll && enableNGNumber;
  },
    
  /**
   * ブロックする NG 番号の設定を取得する
   */
  _updateList : function () {
    var list = new Array ();
    if (this._pref.prefHasUserValue (this._prefNGNumberListName)) {
      var tmp = this._pref.getCharPref (this._prefNGNumberListName);
      if (tmp != "") {
        if (true) {
          /* 値を解析するだけなので代入はしない */
          tmp.replace
            (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*),?/g,
             function (matched,
                       number, server, dir, depend, reason, image) {
              if (image && unescape (reason) != 9) {
                list.push (unescape (image)
                           + ":" + unescape (server)
                           + ":" + unescape (dir));
              }
              return "";
            });
        }
      }
    }
        
    this._blockList = list;
  },
    
  /**
   * ロードするかどうかのチェック
   *   nsIContentPolicy.shouldLoad
   *
   * @param  Number contentType
   *         コンテントの種類
   * @param  nsIURI contentLocation
   *         対象の URI
   * @param  nsIURI requestOrigin
   *         呼び出し元の URI
   * @param  Browser/HTMLElement context
   *         ロード先
   * @param  String mimeTypeGuess
   *         予想される MIME-Type
   * @param  nsISupports extra
   *         不明
   */
  shouldLoad : function (contentType, contentLocation,
                         requestOrigin, context,
                         mimeTypeGuess, extra) {
    if (!this._enableBlock) {
      /* ブロックが無効の場合許可する */
      return this.ACCEPT;
    }
        
    if (contentLocation.scheme.substring (0, 4) != "http") {
      /* http(s) 以外の場合許可する */
      return this.ACCEPT;
    }
    if (contentType == this.TYPE_IMAGE) {
      /* 画像 の場合 */
            
      if (requestOrigin.scheme.substring (0, 4) != "http") {
        /* 呼出し元が http(s) 以外の場合は許可する */
        return this.ACCEPT;
      }
            
      if (requestOrigin.host.indexOf ("2chan.net") != -1) {
        /* 2chan.net からの呼び出しの場合チェックする */
                
        if (contentLocation.spec.match
            (/^http:\/\/([^\/]+\/|(?:www\.)?logch\.info\/(?:proxy|logs)\/)?([^\.\/]+)\.2chan\.net(:[0-9]+)?\/((?:apr|feb|tmp|up|img|cgi|zip|dat|may|nov|jun|dec)\/)?([^\/]+)\/(cat|thumb|src)\/([0-9]+)s?\.(jpg|png|gif)(\?.*)?$/)) {
          var server = RegExp.$2;
          var sdir = RegExp.$4;
          var dir = RegExp.$5;
          var leafName = RegExp.$7;
                    
          if (sdir) {
            sdir = sdir.replace (/\//, "");
            server = sdir;
          }
                    
          /* サーバ名、ディレクトリ名、番号を取得 */
          var item = leafName + ":" + server + ":" + dir;
                    
          for (var i = 0; i < this._blockList.length; i ++) {
            if (item == this._blockList [i]) {
              /* ブロックのリストにある場合 */
                            
              try {
                /* 非表示にする */
                context.style.display = "none";
              }
              catch (e) {
              }
                            
              /* 拒否する */
              return this.REJECT_OTHER;
            }
          }
        }
      }
    }
        
    return this.ACCEPT;
  },
    
  /**
   * 処理するかどうかのチェック
   *   nsIContentPolicy.shouldProcess
   *
   * @param  Number contentType
   *         コンテントの種類
   * @param  nsIURI contentLocation
   *         対象の URI
   * @param  nsIURI requestOrigin
   *         呼び出し元の URI
   * @param  Browser/HTMLElement context
   *         ロード先
   * @param  String mimeType
   *         MIME-Type
   * @param  nsISupports extra
   *         不明
   */
  shouldProcess : function (contentType, contentLocation,
                            requestOrigin, context,
                            mimeTypeGuess, extra) {
    return this.ACCEPT;
  }
};

var components = [arAima_AimaniContentPolicy];
this.NSGetFactory = XPCOMUtils.generateNSGetFactory (components);

// for registerXPCOM
arAima_AimaniContentPolicy.prototype._xpcom_factory
= NSGetFactory (arAima_AimaniContentPolicy.prototype.classID);

