/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

const nsISupports           = Components.interfaces.nsISupports;

const nsICategoryManager    = Components.interfaces.nsICategoryManager;
const nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
const nsIFactory            = Components.interfaces.nsIFactory;
const nsIModule             = Components.interfaces.nsIModule;
const nsIContentPolicy      = Components.interfaces.nsIContentPolicy;

const nsIObserverService    = Components.interfaces.nsIObserverService;
const nsIPrefBranch         = Components.interfaces.nsIPrefBranch;
const nsIPrefBranch2        = Components.interfaces.nsIPrefBranch2;
const nsIURI                = Components.interfaces.nsIURI;

/**
 * 本体
 * NG 番号で画像のブロックを行う
 *   Inherits From: nsIContentPolicy, nsIObserver
 */
function arAima_AimaniContentPolicy () {
  this._init ();
}
arAima_AimaniContentPolicy.prototype = {
  /* nsIContentPolicy の定数 */
  TYPE_IMAGE       : nsIContentPolicy.TYPE_IMAGE,
  ACCEPT           : nsIContentPolicy.ACCEPT,
  REJECT_OTHER     : nsIContentPolicy.REJECT_OTHER,
    
  /* Aima_Aimani 側の設定 */
  _prefAllName          : "aima_aimani.all",
  _prefCheckName        : "aima_aimani.savepref",
    
  _prefNGNumberName     : "aima_aimani.ng_number",
  _prefNGNumberListName : "aima_aimani.ng_number.list",
    
  _pref : null,          /* nsIPrefBranch2/nsIPrefBranch  pref サービス */
    
  _enableBlock : false,  /* Boolean  ブロック有効かどうか */
  _blockList : null,     /* Array  ブロックする画像情報
                          *   [[String サーバ名, String ディレクトリ名,
                          *     String NG 番号], ...] */
    
  _old : false,          /* Boolean  旧バージョンかどうか */
    
  /**
   * インターフェースの要求
   *   nsISupports.QueryInterface
   *
   * @param  nsIIDRef iid
   *         インターフェース ID
   * @throws Components.results.NS_NOINTERFACE
   * @return nsIContentPolicy
   *         this
   */
  QueryInterface : function (iid) {
    if (iid.equals (nsISupports)
        || iid.equals (nsIContentPolicy)) {
      return this;
    }
        
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },
    
  /**
   * 初期化処理
   */
  _init : function () {
    /* 旧バージョンのチェック */
    this._old = "OTHER" in Components.interfaces.nsIContentPolicy;
    if (this._old) {
      /* 旧バージョンの場合、定数を取得し直す */
      this.TYPE_IMAGE = nsIContentPolicy.IMAGE;
      this.ACCEPT = true;
      this.REJECT_OTHER = false;
    }
        
    /* pref サービスの取得 */
    if (nsIPrefBranch2 != undefined) {
      /* 新バージョンの場合、オブザーバを登録する */
      this._observerService
      = Components.classes ["@mozilla.org/observer-service;1"]
      .getService (nsIObserverService);
            
      this._observerService.addObserver (this, "xpcom-shutdown", false);
            
      this._pref
      = Components.classes ["@mozilla.org/preferences-service;1"]
      .getService (nsIPrefBranch2);
      this._pref.addObserver (this._prefAllName, this, false);
      this._pref.addObserver (this._prefCheckName, this, false);
      this._pref.addObserver (this._prefNGNumberListName, this, false);
    }
    else {
      this._pref
      = Components.classes ["@mozilla.org/preferences-service;1"]
      .getService (nsIPrefBranch);
    }
        
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
        if (this._old) {
          /* 古い場合は this._unescape を使う */
          var self = this;
          /* 値を解析するだけなので代入はしない */
          tmp.replace
            (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*),?/g,
             function (matched,
                       number, server, dir, depend, reason, image) {
              if (image && self._unescape (image) != 9) {
                list.push (self._unescape (image)
                           + ":" + self._unescape (server)
                           + ":" + self._unescape (dir));
              }
              return "";
            });
        }
        else {
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
   * unescape の代替品
   * 旧バージョンの場合このスコープでは未定義なので使用する
   *
   * @param  String text
   *         エスケープ解除する文字列
   * @return String
   *         エスケープ解除した文字列
   */
  _unescape : function (text) {
    text
    = text.replace (/%([0-9A-Za-z][0-9A-Za-z])/g,
                    function (match, part1) {
                      return String
                      .fromCharCode (parseInt ("0x" + part1));
                    });
        
    return text;
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
   *
   * 旧バージョンでは
   * @param  Number contentType
   *         コンテントの種類
   * @param  nsIURI contentLocation
   *         対象の URI
   * @param  HTMLElement requestOrigin
   *         ロード先
   * @param  Window context
   *         対象のウィンドウ
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
            
      if (this._old) {
        /* 旧バージョンの場合引数が違うので入れ替える */
                
        var targetWindow = context;
        context = requestOrigin;
                
        requestOrigin
        = Components.classes ["@mozilla.org/network/standard-url;1"]
        .createInstance (nsIURI);
        if (targetWindow.document.location) {
          try {
            requestOrigin.spec
              = targetWindow.document.location.href;
          }
          catch (e) {
            /* 古い Mozilla Suite の場合、許可する */
            return this.ACCEPT;
          }
        }
        else {
          /* 古い Mozilla Suite でのアンカーによる移動の場合、許可する */
          return this.ACCEPT;
        }
      }
            
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
   *
   * 旧バージョンでは
   * @param  Number contentType
   *         コンテントの種類
   * @param  nsIURI contentLocation
   *         対象の URI
   * @param  HTMLElement requestOrigin
   *         ロード先
   * @param  Window context
   *         対象のウィンドウ
   */
  shouldProcess : function (contentType, contentLocation,
                            requestOrigin, context,
                            mimeTypeGuess, extra) {
    return this.ACCEPT;
  }
};

/**
 * 本体のファクトリー
 *   Inherits From: nsIFactory
 */
var arAima_AimaniContentPolicyFactory = {
  /**
   * 本体を生成する
   *   nsIFactory.createInstance
   *
   * @param  nsISupport outer
   *          統合する対象
   * @param  nsIIDRef iid
   *         生成する対象のインターフェース ID
   * @return arAima_AimaniContentPolicy
   *         本体
   */
  createInstance : function (outer, iid) {
    if (outer != null) {
      /* 統合する対象がある場合はエラー */
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    }
        
    return new arAima_AimaniContentPolicy ().QueryInterface (iid);
  }
};

/**
 * XPCOM のモジュール
 *   Inherits From: nsIModule
 */
var arAima_AimaniContentPolicyModule = {
  /* 本体に関する情報 */
  CONTRACTID: "@unmht.org/aima-aimani-content-policy;1",
  CID: Components.ID ("{812162d9-2c38-4012-a5e0-60205537cdad}"),
  CNAME: "Aima_Aimani Content Policy JS Component",
    
  /**
   * インターフェースの要求
   *   nsISupports.QueryInterface
   *
   * @param  nsIIDRef iid
   *         インターフェースID
   * @throws Components.results.NS_NOINTERFACE
   * @return nsIModule
   *         this
   */
  QueryInterface : function (iid) {
    if (iid.equals (nsISupports)
        || iid.equals (nsIModule)) {
      return this;
    }
        
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },
    
  /**
   * 登録処理
   *   nsIModule.registerSelf
   *
   * @param  nsIComponentManager compMgr
   * @param  nsIFile fileSpec
   *         モジュールのファイル
   *           reference と他のソースコード中で並びが違う
   * @param  String location
   *         不明
   *           reference と他のソースコード中で並びが違う
   * @param  String type
   *         ローダの種類
   */
  registerSelf : function (compMgr, fileSpec, location, type) {
    compMgr = compMgr.QueryInterface (nsIComponentRegistrar);
    compMgr.registerFactoryLocation (this.CID,
                                     this.CNAME,
                                     this.CONTRACTID,
                                     fileSpec, location, type);
        
    var catman
    = Components.classes ["@mozilla.org/categorymanager;1"]
    .getService (nsICategoryManager);
    catman.addCategoryEntry ("content-policy",
                             this.CONTRACTID,
                             this.CONTRACTID, true, true);
  },
    
  /**
   * 登録解除処理
   *   nsIModule.unregisterSelf
   *
   * @param  nsIComponentManager compMgr
   * @param  nsIFile fileSpec
   *         モジュールのファイル
   *           reference と他のソースコード中で並びが違う
   * @param  String location
   *         不明
   *           reference と他のソースコード中で並びが違う
   */
  unregisterSelf : function (compMgr, fileSpec, location) {
    compMgr = compMgr.QueryInterface (nsIComponentRegistrar);
    compMgr.unregisterFactoryLocation (this.CID, fileSpec);
        
    var catman
    = Components.classes ["@mozilla.org/categorymanager;1"]
    .getService (nsICategoryManager);
    catman.deleteCategoryEntry ("content-policy",
                                this.CONTRACTID, true);
  },
    
  /**
   * ファクトリーオブジェクトを取得する
   *   nsIModule.getClassObject
   *
   * @param  nsIComponentManager compMgr
   * @param  nsCIDRef cid
   *         取得対象のクラス ID
   * @param  nsIIDRef iid
   *         取得対象のインターフェース ID
   * @throws Components.results.NS_ERROR_NOT_IMPLEMENTED
   *         Components.results.NS_ERROR_NO_INTERFACE
   * @return arAima_AimaniContentPolicyFactory
   *         本体のファクトリー
   */
  getClassObject : function (compMgr, cid, iid) {
    if (cid.equals (this.CID)) {
      return arAima_AimaniContentPolicyFactory;
    }
        
    if (!iid.equals (nsIFactory)) {
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    }
        
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },
    
  /**
   * 終了できるかどうか
   *   nsIModule.canUnload
   *
   * @param  nsIComponentManager compMgr
   * @return Boolean
   *         終了できるかどうか
   */
  canUnload : function (compMgr){
    return true;
  }
};

/**
 * モジュールを取得する
 * @param  nsIComponentManager compMgr
 * @param  nsIFile fileSpec
 *         モジュールのファイル
 * @return arAima_AimaniContentPolicyModule
 *         モジュール
 */
function NSGetModule (compMgr, fileSpec) {
  return arAima_AimaniContentPolicyModule;
}

try {
  Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
  
  arAima_AimaniContentPolicy.prototype.classID
    = Components.ID ("{812162d9-2c38-4012-a5e0-60205537cdad}");
  const NSGetFactory = XPCOMUtils.generateNSGetFactory ([arAima_AimaniContentPolicy]);
}
catch (e) {
}
