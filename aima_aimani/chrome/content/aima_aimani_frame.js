/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

const Cu = Components.utils;
const Cr = Components.results;

Cu.import ("chrome://aima_aimani/content/aima_aimani.jsm");

Aima_Aimani.init ();

// 赤福との処理順序の調整
var waitCustomEvents = false;
addEventListener ("AkahukuFrameLoaded", function (event) {
  if (!waitCustomEvents) {
    waitCustomEvents = true;
    addEventListener ("AkahukuContentApplied", function (event) {
      Aima_Aimani.onDOMContentLoaded (event);
    });
  }
});

addEventListener ("DOMContentLoaded", function (event) {
  // 古い赤福との互換性のため
  // DOMContentLoaded の dispatch が完全に終わるのを待つ
  event.target.defaultView.setTimeout (function () {
    if (waitCustomEvents) {
      return; // AkahukuContentApplied を待つ
    }
    Aima_Aimani.onDOMContentLoaded (event);
  }, 0);
});

addEventListener ("unload", function (event) {
});

// XPCOMモジュールを現プロセスに動的登録
Cu.import ("chrome://aima_aimani/content/XPCOM.jsm");
Cu.import ("chrome://aima_aimani/content/contentpolicy.jsm");
try {
  registerXPCOM (arAima_AimaniContentPolicy);
  Aima_Aimani.log ("arAima_AimaniContentPolicy is registered.");
}
catch (e if e.result == Cr.NS_ERROR_FACTORY_EXISTS) {
  // 既に登録済み
}
catch (e) {
  Cu.reportError (e);
}

