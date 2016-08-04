/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/**
 * Chrome プロセスからコンテントへのアクセスを
 * メッセージ経由で受け付けるための frame script
 */

Components.utils.import ("chrome://aima_aimani/content/aima_aimani.js");

Components.utils.import ("chrome://aima_aimani/content/contentjob.jsm");

/**
 * 提供するジョブの定義
 */
var ContentJobs = {

  isAima_Aimanied : function () {
    var param = Aima_Aimani.getDocumentParam (content.document);
    return param ? true : false;
  },

  getSelectionString : function () {
    return content.getSelection ().toString ();
  },

  loadNGWordAndApply : function () {
    Aima_AimaniConfigManager.loadNGWordAndApply (content.document);
  },

  hideSelectedResOrThread : function (hide) {
    Aima_Aimani.hideSelectedResOrThread (hide, content.document);
  },

  addExternal : function () {
    Aima_Aimani.addExternalForDocument (content.document);
  },
};


/**
 * ジョブの呼び出し要求を聞く
 */
addMessageListener (ContentJob.MESSAGE_CALL, function (message) {
  var method = message.data.name;
  var args = message.data.args;
  var id = message.data.id;

  var func = ContentJobs [method];

  var data = {id: id, value: null, nsresult: 0, message: null};
  try {
    if (typeof func === "function") {
      data.value = func.apply (null, args);
    }
    else {
      data.nsresult = Components.results.NS_ERROR_FAILURE;
      data.message = "no valid function defined for '" + method + "'";
    }
  }
  catch (e) {
    data.nsresult = e.result;
    data.message = e.message;
  }
  sendAsyncMessage (ContentJob.MESSAGE_RESULT, data);

});

