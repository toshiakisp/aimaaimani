/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/**
 * Aima_Aimani XUL overlay
 *
 * Dependant globals:
 *   Components, document, window, gBrowser, gContextMenu,
 *   Aima_Aimani, Aima_AimaniVersion, Aima_AimaniNGCat,
 *   Aima_AimaniConfigManager,
 */

Components.utils.import ("chrome://aima_aimani/content/aima_aimani.js");

Components.utils.import ("chrome://aima_aimani/content/contentjob.jsm");

/**
 * XUL関係のイベントハンドラ
 */
var Aima_AimaniXUL = {

  /**
   * ウィンドウが開かれたイベント
   */
  onLoad : function () {
    Aima_AimaniUIManager.showPanel ();
    Aima_AimaniUIManager.setPanelStatus ();

    Aima_AimaniConfigManager.addPrefChangedListener (this);

    var menu = document.getElementById ("contentAreaContextMenu");
    if (menu) {
      menu.addEventListener
        ("popupshowing",
         function () {
          Aima_AimaniXUL.setContextMenu (arguments [0]);
        }, false);
    }

    var sidebar = document.getElementById ("sidebar");
    if (sidebar) {
      sidebar.addEventListener
        ("DOMContentLoaded",
         Aima_AimaniXUL.onSidebarLoaded,
         false);
    }

    Aima_AimaniXUL.startListening ();
  },

  /**
   * ウィンドウが閉じられたイベント
   */
  onUnload : function () {
    Aima_AimaniConfigManager.removePrefChangedListener (this);
    Aima_AimaniXUL.stopListening ();
  },

  /**
   * サイドバーで何かがロードされたイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onSidebarLoaded : function (event) {
    var browser = event.target.getElementById ("web-panels-browser");

    if (browser) {
      browser.addEventListener
        ("DOMContentLoaded",
         Aima_Aimani.onDOMContentLoaded,
         false);
    }
  },

  /**
   * メニューが開かれたイベント
   * メニューの項目の表示／非表示を設定する
   *
   * @param  Event event
   *         対象のイベント
   */
  setContextMenu : function (event) {
    if (gContextMenu) {
      var menuitem;

      var visible = (gContextMenu.isTextSelected
                     && Aima_Aimani.enableNGNumberSelection);

      if (!Aima_AimaniXUL.hasBrowserParam (gContextMenu.browser)) {
        visible = false;
      }

      menuitem
      = document
      .getElementById ("aima_aimani-menuitem-content-separator");
      if (menuitem) {
        menuitem.hidden = !visible;
      }
      menuitem
      = document
      .getElementById
      ("aima_aimani-menuitem-content-ngnumber-selection-add");
      if (menuitem) {
        menuitem.hidden = !visible;
      }
      menuitem
      = document
      .getElementById
      ("aima_aimani-menuitem-content-ngnumber-selection-delete");
      if (menuitem) {
        menuitem.hidden = !visible;
      }
    }
  },

  onPrefChanged : function () {
    Aima_Aimani.modifyStyleFile (Aima_Aimani.enableAll);
    Aima_AimaniUIManager.showPanel ();
    Aima_AimaniUIManager.setPanelStatus ();
  },

  /**
   * フォーカスを持つウィンドウのドキュメントを取得する
   *
   * @return HTMLDocument
   *         フォーカスを持つウィンドウのドキュメント
   */
  getFocusedDocument : function () {
    var focusedWindow = document.commandDispatcher.focusedWindow;
    if (focusedWindow == window) {
      focusedWindow = content;
    }
    return focusedWindow.document;
  },

  /**
   * 選択範囲内のレス・スレを表示／非表示にする (context menu)
   *
   * @param  Boolean hide
   *         非表示フラグ
   */
  hideSelectedResOrThread : function (hide) {
    ContentJob.call (gBrowser.selectedBrowser,
        "hideSelectedResOrThread", [hide]);
  },


  params : new Map (),

  MESSAGE_ADD : "Aima_Aimani:addDocumentParam",
  MESSAGE_DELETE : "Aima_Aimani:deleteDocumentParam",

  addBrowserParam : function (browser, data) {
    this.params.set (browser, data);
  },
  deleteBrowserParam : function (browser) {
    this.params.delete (browser);
  },
  getBrowserParam : function (browser) {
    return this.params.get (browser);
  },
  hasBrowserParam : function (browser) {
    return this.params.has (browser);
  },

  receiveMessage : function (message) {
    var browser = message.target;
    if (message.name == this.MESSAGE_ADD) {
      var param = {
        url: message.data.url,
        location_info: message.data.info,
      };
      this.addBrowserParam (browser, param);
    }
    else if (message.name == this.MESSAGE_DELETE) {
      this.deleteBrowserParam (browser);
    }
  },

  startListening : function () {
    var mm = window.messageManager;
    mm.addMessageListener (this.MESSAGE_ADD, this, false);
    mm.addMessageListener (this.MESSAGE_DELETE, this, false);
  },
  stopListening : function () {
    var mm = window.messageManager;
    mm.removeMessageListener (this.MESSAGE_ADD, this);
    mm.removeMessageListener (this.MESSAGE_DELETE, this);
  },

};

/**
 * UI 管理
 */
var Aima_AimaniUIManager = {
  prefDialog : null, /* ChromeWindow  設定ダイアログ */

  /**
   * NGワード追加のダイアログを開く
   *
   * @param  Event event
   *         対象のイベント
   */
  showNGWordDialog : function (event) {
    if (!Aima_Aimani.enableNGWord) {
      return;
    }
    if (("button" in event && event.button != 0)
        || event.ctrlKey || event.shiftKey
        || event.altKey || event.metaKey) {
      return;
    }

    ContentJob.call (gBrowser.selectedBrowser,
        "getSelectionString", [],
        function (text) {
          Aima_AimaniUIManager.showNGWordDialogWith (text);
        });
  },

  showNGWordDialogWith : function (selection) {
    selection = selection.replace (/^\n+/, "");
    selection = selection.replace (/\n+$/, "");
    selection = selection.replace (/&/g, "&amp;");
    selection = selection.replace (/</g, "&lt;");
    selection = selection.replace (/>/g, "&gt;");
    selection = selection.replace (/\n/g, "<br>");

    var optionsURL = "chrome://aima_aimani/content/ng_word.xul";
    var features = "chrome,titlebar,toolbar,centerscreen,modal";

    var prev
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.ng_word.list", "");

    window.openDialog (optionsURL, "", features, selection);

    // after closing modal dialog
    var now
    = Aima_AimaniConfigManager
    .initPref ("char", "aima_aimani.ng_word.list", "");

    if (now && now != prev) {
      ContentJob.call (gBrowser.selectedBrowser, "loadNGWordAndApply");
    }
  },

  /**
   * 設定ダイアログを開く
   *
   * @param  Event event
   *         対象のイベント
   */
  showPreferences : function (event) {
    if (("button" in event && event.button != 0)
        || event.ctrlKey || event.shiftKey
        || event.altKey || event.metaKey) {
      return;
    }

    try {
      if (this.prefDialog != null) {
        if (!this.prefDialog.closed) {
          this.prefDialog.focus ();
          return;
        }
      }
    }
    catch (e) { Components.utils.reportError (e);
      this.prefDialog = null;
    }
    var optionsURL = "chrome://aima_aimani/content/options.xul";
    var features = "chrome,titlebar,toolbar,centerscreen,resizable";
    this.prefDialog = window.openDialog (optionsURL, "", features);
  },

  /**
   * ステータスバーのメニューを設定する
   */
  setStatusbarPopup : function () {
    var menuitem;

    menuitem = document.getElementById ("aima_aimani-statusbar-popup-all");
    if (menuitem) {
      if (Aima_Aimani.enableAll) {
        menuitem.label = "\u5168\u6A5F\u80FD\u3092 OFF";
      }
      else {
        menuitem.label = "\u5168\u6A5F\u80FD\u3092 ON";
      }
    }
    menuitem = document.getElementById ("aima_aimani-statusbar-popup-ngword");
    if (menuitem) {
      if (Aima_Aimani.enableNGWord) {
        menuitem.label = "NG \u30EF\u30FC\u30C9\u3092 OFF";
      }
      else {
        menuitem.label = "NG \u30EF\u30FC\u30C9\u3092 ON";
      }
    }
    menuitem = document.getElementById ("aima_aimani-statusbar-popup-ngthumbnail");
    if (menuitem) {
      if (Aima_Aimani.enableNGThumbnail) {
        menuitem.label = "NG \u30B5\u30E0\u30CD\u3092 OFF";
      }
      else {
        menuitem.label = "NG \u30B5\u30E0\u30CD\u3092 ON";
      }
    }
    menuitem = document.getElementById ("aima_aimani-statusbar-popup-ngnumber");
    if (menuitem) {
      if (Aima_Aimani.enableNGNumber) {
        menuitem.label = "NG \u756A\u53F7\u3092 OFF";
      }
      else {
        menuitem.label = "NG \u756A\u53F7\u3092 ON";
      }
    }
    menuitem = document.getElementById ("aima_aimani-statusbar-popup-ngcat");
    if (menuitem) {
      if (Aima_AimaniNGCat.enableNGCat) {
        menuitem.label = "NG \u30AB\u30BF\u30ED\u30B0\u3092 OFF";
      }
      else {
        menuitem.label = "NG \u30AB\u30BF\u30ED\u30B0\u3092 ON";
      }
    }
    menuitem = document.getElementById ("aima_aimani-statusbar-popup-threadrule");
    if (menuitem) {
      if (Aima_Aimani.enableThreadRule) {
        menuitem.label = "\u30B9\u30EC\u30C3\u30C9\u30EB\u30FC\u30EB\u3092 OFF";
      }
      else {
        menuitem.label = "\u30B9\u30EC\u30C3\u30C9\u30EB\u30FC\u30EB\u3092 ON";
      }
    }
    menuitem = document.getElementById ("aima_aimani-statusbar-popup-minithumb");
    if (menuitem) {
      if (Aima_Aimani.enableMiniThumb) {
        menuitem.label = "\u5C0F\u30B5\u30E0\u30CD\u3092 OFF";
      }
      else {
        menuitem.label = "\u5C0F\u30B5\u30E0\u30CD\u3092 ON";
      }
    }
    menuitem = document.getElementById ("aima_aimani-statusbar-popup-text");
    if (menuitem) {
      if (Aima_Aimani.enableTextThread) {
        menuitem.label = "\u6587\u5B57\u30B9\u30EC\u975E\u8868\u793A\u3092 OFF";
      }
      else {
        menuitem.label = "\u6587\u5B57\u30B9\u30EC\u975E\u8868\u793A\u3092 ON";
      }
    }
  },

  /**
   * 機能の ON／OFF を切り替える
   *
   * @param  Number type
   *         対象の機能
   *            1: 全機能を OFF
   *            2: NG ワードを OFF
   *            3: NG サムネを OFF
   *            4: NG 番号を OFF
   *            5: NG カタログを OFF
   *            6: スレッドルールを OFF
   *            7: 文字スレ非表示を OFF
   */
  switchDisabled : function (type) {
    if (type == 1) {
      Aima_Aimani.enableAll
      = !Aima_AimaniConfigManager
      .initPref ("bool", "aima_aimani.all", true);
      Aima_AimaniConfigManager.prefBranch
      .setBoolPref ("aima_aimani.all", Aima_Aimani.enableAll);
    }
    else if (type == 2) {
      Aima_Aimani.enableNGWord
      = !Aima_AimaniConfigManager
      .initPref ("bool", "aima_aimani.ng_word", true);
      Aima_AimaniConfigManager.prefBranch
      .setBoolPref ("aima_aimani.ng_word", Aima_Aimani.enableNGWord);
    }
    else if (type == 3) {
      Aima_Aimani.enableNGThumbnail
      = !Aima_AimaniConfigManager
      .initPref ("bool", "aima_aimani.ng_thumbnail", true);
      Aima_AimaniConfigManager.prefBranch
      .setBoolPref ("aima_aimani.ng_thumbnail",
                    Aima_Aimani.enableNGThumbnail);
    }
    else if (type == 4) {
      Aima_Aimani.enableNGNumber
      = !Aima_AimaniConfigManager
      .initPref ("bool", "aima_aimani.ng_number", true);
      Aima_AimaniConfigManager.prefBranch
      .setBoolPref ("aima_aimani.ng_number",
                    Aima_Aimani.enableNGNumber);
    }
    else if (type == 5) {
      Aima_AimaniNGCat.enableNGCat
      = !Aima_AimaniConfigManager
      .initPref ("bool", "aima_aimani.ng_cat", true);
      Aima_AimaniConfigManager.prefBranch
      .setBoolPref ("aima_aimani.ng_cat",
                    Aima_AimaniNGCat.enableNGCat);
    }
    else if (type == 6) {
      Aima_Aimani.enableThreadRule
      = !Aima_AimaniConfigManager
      .initPref ("bool", "aima_aimani.thread_rule", true);
      Aima_AimaniConfigManager.prefBranch
      .setBoolPref ("aima_aimani.thread_rule",
                    Aima_Aimani.enableThreadRule);
    }
    else if (type == 7) {
      Aima_Aimani.enableTextThread
      = !Aima_AimaniConfigManager
      .initPref ("bool", "aima_aimani.text_thread", true);
      Aima_AimaniConfigManager.prefBranch
      .setBoolPref ("aima_aimani.text_thread",
                    Aima_Aimani.enableTextThread);
    }
    else if (type == 8) {
      Aima_Aimani.enableMiniThumb
      = !Aima_AimaniConfigManager
      .initPref ("bool", "aima_aimani.mini_thumb", true);
      Aima_AimaniConfigManager.prefBranch
      .setBoolPref ("aima_aimani.mini_thumb",
                    Aima_Aimani.enableMiniThumb);
    }

    Aima_AimaniConfigManager.loadNGNumber ();
    /* 設定で無効になった NG 番号を削除する */
    for (var i = 0; i < Aima_Aimani.NGNumberList.length; i ++) {
      if (Aima_Aimani.NGNumberList [i][4] == 1
          && !Aima_Aimani.enableNGWord) {
        Aima_Aimani.NGNumberList.splice (i, 1);

        i --;
      }
      else if (Aima_Aimani.NGNumberList [i][4] == 2
               && !Aima_Aimani.enableNGThumbnail) {
        Aima_Aimani.NGNumberList.splice (i, 1);

        i --;
      }
      else if (Aima_Aimani.NGNumberList [i][4] == 3
               && !Aima_Aimani.enableTextThread) {
        Aima_Aimani.NGNumberList.splice (i, 1);

        i --;
      }
      else if (Aima_Aimani.NGNumberList [i][4] == 6
               && !Aima_AimaniNGCat.enableNGCat) {
        Aima_Aimani.NGNumberList.splice (i, 1);

        i --;
      }
    }
    Aima_AimaniConfigManager.saveNGNumber (-1, "", "");

    if (type != 1) {
      Aima_AimaniConfigManager.getConfigurationFromPreferencesAll ();
      Aima_AimaniConfigManager.getConfigurationFromPreferences ();
      Aima_AimaniConfigManager
        .getConfigurationFromPreferencesBoardExternal ();
    }

    if (Aima_Aimani.enableHideStyle) {
      Aima_Aimani.modifyStyleFile (Aima_Aimani.enableAll);
    }

    Aima_AimaniUIManager.setPanelStatus ();
  },

  /**
   * サイトを開く
   */
  openWebsite : function () {
    var browser = document.getElementById ("content");
    var newTab
    = browser.addTab ("http://www.unmht.org/aima_aimani/");
    browser.selectedTab = newTab;
  },

  /**
   * ステータスバー、ツールバーのパネルを表示する
   */
  showPanel : function () {
    Aima_AimaniConfigManager.getConfigurationFromPreferencesPanel ();

    if (Aima_Aimani.enableToolbarPreferences
        || Aima_Aimani.enableToolbarNGWord) {
      var style = -1;
      if (Aima_AimaniConfigManager.prefBranch
          .prefHasUserValue ("browser.chrome.toolbar_style")) {
        style
          = Aima_AimaniConfigManager.prefBranch
          .getIntPref ("browser.chrome.toolbar_style");
      }
      var navbar;
      var button;
      var inner;
      var label;
      navbar = document.getElementById ("nav-bar");
      inner = document.getElementById ("nav-bar-inner");
      if (navbar && inner) {
        if (Aima_Aimani.enableToolbarPreferences) {
          button = document.createElement ("toolbarbutton");
          var id = "";
          if (style != 1) {
            id = "aima_aimani-toolbarbutton-preferences-image";
          }
          else {
            id = "aima_aimani-toolbarbutton-preferences-text";
          }
          button.setAttribute ("id", id);

          label = "\u5408\u9593\u5408\u9593\u306B";
          button.addEventListener ("command", function (ev) {
            Aima_AimaniUIManager.showPreferences (ev);
          }, false);
          button.setAttribute ("class", "toolbarbutton-1");
          button.setAttribute ("status", Aima_Aimani.enableAll);
          if (style != 0) {
            button.setAttribute ("label", label);
          }
          button.setAttribute ("tooltiptext", label)

            navbar.insertBefore (button, inner);
        }
        if (Aima_Aimani.enableToolbarNGWord) {
          button = document.createElement ("toolbarbutton");
          var id = "";
          if (style != 1) {
            id = "aima_aimani-toolbarbutton-ng_word-image";
          }
          else {
            id = "aima_aimani-toolbarbutton-ng_word-text";
          }
          button.setAttribute ("id", id);

          label = "NG \u30EF\u30FC\u30C9";
          button.addEventListener ("command", function (ev) {
            Aima_AimaniUIManager.showNGWordDialog (ev);
          }, false);
          button.setAttribute ("class", "toolbarbutton-1");
          button.setAttribute ("status", Aima_Aimani.enableAll);
          if (style != 0) {
            button.setAttribute ("label", label);
          }
          button.setAttribute ("tooltiptext", label);

          navbar.insertBefore (button, inner);
        }
      }
    }

    var panel;
    panel
    = document.getElementById ("aima_aimani-statusbarpanel-preferences");
    if (panel) {
      panel.hidden = !Aima_Aimani.enableStatusbarPreferences;
    }
    panel = document.getElementById ("aima_aimani-statusbarpanel-ng_word");
    if (panel) {
      panel.hidden = !Aima_Aimani.enableStatusbarNGWord;
    }
  },

  /**
   * パネルのアイコンを、全機能の ON／OFF に合わせて切り替える
   */
  setPanelStatus : function () {
    Aima_AimaniConfigManager.loadPrefBranch ();

    var enableAll
    = Aima_AimaniConfigManager
    .initPref ("bool", "aima_aimani.all", true);

    var panel;
    if (enableAll) {
      panel
        = document
        .getElementById ("aima_aimani-statusbarpanel-preferences");
      if (panel) {
        panel.setAttribute ("status", "enabled");
        var text = panel.getAttribute ("tooltiptext");
        if (text.indexOf (Aima_AimaniVersion) == -1) {
          panel.setAttribute ("tooltiptext",
                              text + " " + Aima_AimaniVersion);
        }
      }
      panel
        = document
        .getElementById ("aima_aimani-statusbarpanel-ng_word");
      if (panel) {
        panel.setAttribute ("status", "enabled");
        panel.setAttribute ("disabled", false);
      }
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-preferences", "status", "enabled");
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-ng_word", "status", "enabled");
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-ng_word", "disabled", false);
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-preferences-image", "status", "enabled");
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-ng_word-image", "status", "enabled");
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-ng_word-image", "disabled", false);
    }
    else {
      panel
      = document
      .getElementById ("aima_aimani-statusbarpanel-preferences");
      if (panel) {
        panel.setAttribute ("status", "disabled");
      }
      panel
      = document
      .getElementById ("aima_aimani-statusbarpanel-ng_word");
      if (panel) {
        panel.setAttribute ("status", "disabled");
        panel.setAttribute ("disabled", true);
      }
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-preferences", "status", "disabled");
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-ng_word", "status", "disabled");
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-ng_word", "disabled", true);
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-preferences-image", "status", "disabled");
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-ng_word-image", "status", "disabled");
      this._setAttributeOfToolbarButton
        ("aima_aimani-toolbarbutton-ng_word-image", "disabled", true);
    }
  },

  _setAttributeOfToolbarButton : function (id, attr, value) {
    var button = document.getElementById (id);
    if (button) {
      button.setAttribute (attr, value);
    }
    else if (typeof CustomizableUI != "undefined") {
      // For Australis
      var widgets = CustomizableUI.getWidget (id);
      if (widgets) {
        for (var i = 0; i < widgets.instances.length; i ++) {
          button = widgets.instances [i].node;
          if (button) {
            button.setAttribute (attr, value);
          }
        }
      }
    }
  },

  /**
   * 外部板に追加する
   */
  addExternal : function () {
    ContentJob.call (gBrowser.selectedBrowser, "addExternal");
  },

};


/**
 *  Initialization for XUL Window
 */

Aima_Aimani.initAsParent ();

window.addEventListener
  ("load", function () { Aima_AimaniXUL.onLoad (); }, false);

window.addEventListener
  ("unload", function () { Aima_AimaniXUL.onUnload (); }, false);

/**
 * Register the frame script
 */
window.messageManager.loadFrameScript
  ("chrome://aima_aimani/content/aima_aimani_frame.js", true);


