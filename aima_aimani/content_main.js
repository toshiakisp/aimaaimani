/**
 * Content script main (run_at document_start)
 */

if (document.readyState == "loading") {
  Promise.all ([// wait for all parallel async initializations
    Aima_Aimani.asyncInit (),
    new Promise (function (resolve, reject) {

      // 赤福との処理順序の調整
      var waitCustomEvents = false;
      window.addEventListener ("AkahukuFrameLoaded", (event) => {
        if (!waitCustomEvents) {
          waitCustomEvents = true;
          window.addEventListener ("AkahukuContentApplied", (event) => {
            resolve (event);
          });
        }
      });

      window.addEventListener ("DOMContentLoaded", (event) => {
        // 古い赤福との互換性のため
        // DOMContentLoaded の dispatch が完全に終わるのを待つ
        event.target.defaultView.setTimeout (() => {
          if (waitCustomEvents) {
            return; // AkahukuContentApplied を待つ
          }
          resolve (event);
        }, 0);
      });
    }),
  ]).then ((values) => {
    // 全ての初期化が終了したのちに
    var event = values [1];
    Aima_Aimani.onDOMContentLoaded (event);
  });
}
else {
  //TODO:既存のロード済みコンテンツに適用された場合
  console.warn ("Aima_Aimani: content scripts aborted because of",
      "document.readyState =", document.readyState,
      document.documentURI);
}

