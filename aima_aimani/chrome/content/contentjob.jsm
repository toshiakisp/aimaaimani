/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/**
 * Chrome プロセスからコンテントへのアクセスを
 * メッセージ経由で行うためのモジュール
 */

var EXPORTED_SYMBOLS = [
  "ContentJob",
];

const Cc = Components.classes;
const Ci = Components.interfaces;


// コンテントジョブを提供する frame script
const frameScript = "chrome://aima_aimani/content/contentjob_frame.jsm";

var callbacks = new Map ();

var gId = 0;

function createId () {
  gId ++;
  return gId;
}

/**
 * 提供するモジュール
 */
this.ContentJob = {
  MESSAGE_CALL : "Aima_AimaniContentJob:call",
  MESSAGE_RESULT : "Aima_AimaniContentJob:result",

  /**
   * コンテントに対する処理を呼び出す(非同期)
   *
   * @param browser  xul:browser
   * @param jobName  対象ジョブ名
   * @param args     引数
   * @param callback コールバック関数
   */
  call : function (browser, jobName, args, callback) {
    var id = createId ();
    var message = this.MESSAGE_CALL;
    var data = {name: jobName, args: args || [], id: id};
    browser.messageManager.sendAsyncMessage (message, data);

    var container = {
      func: callback,
      stack: Components.stack.caller,
    };
    callbacks.set (id, container);
  },
};


/**
 * ChromeプロセスではリスナーとFrameスクリプトを登録
 * (jsm はプロセス毎に実行されるため)
 */
var appinfo = Cc ["@mozilla.org/xre/app-info;1"].getService (Ci.nsIXULRuntime);
if (appinfo.processType === appinfo.PROCESS_TYPE_DEFAULT) {
  var gfmm
    = Cc ["@mozilla.org/globalmessagemanager;1"]
    .getService (Ci.nsIMessageListenerManager);

  /**
   * コンテントジョブの結果を待つためのリスナー
   */
  var listener = {
    receiveMessage : function (message) {
      if (message.name == ContentJob.MESSAGE_RESULT) {
        var id = message.data.id;
        var nsresult = message.data.nsresult;
        var ret = message.data.value;
        var errmsg = message.data.message;

        var callback = callbacks.get (id);
        callbacks.delete (id);

        if (Components.isSuccessCode (nsresult)) {
          if (callback.func) {
            callback.func.call (null, ret);
          }
        }
        else {
          throw Components.Exception
            ("Aima_Aimani/ContentJob: " + errmsg,
             nsresult, callback.stack);
        }
      }
    },
  };

  gfmm.addMessageListener (ContentJob.MESSAGE_RESULT, listener, true);

  gfmm.loadFrameScript (frameScript, true);
}

