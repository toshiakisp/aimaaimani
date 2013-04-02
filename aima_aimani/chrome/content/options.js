/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

/* Unicode をエスケープ解除できない場合に unescape を定義しなおす */
if (unescape ("%u3042") == "%u3042") {
  unescape = function (text) {
    var converter
    = Components.classes ["@mozilla.org/intl/scriptableunicodeconverter"]
    .getService (Components.interfaces.nsIScriptableUnicodeConverter);
    converter.charset = "utf-8";
        
    text = text
    .replace (/((%[0-9A-Fa-f][0-9A-Fa-f])+)|%u([0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f])/g,
              function (match, part1, part2, part3) {
                if (part1) {
                  var t = part1
                  .replace (/%([0-9A-Fa-f][0-9A-Fa-f])/g,
                            function (submatch, subpart1) {
                              return String
                              .fromCharCode (parseInt ("0x"
                                                       + subpart1));
                            });
                  try {
                    t = converter.ConvertToUnicode (t);
                  }
                  catch (e) { Components.utils.reportError (e);
                  }
                  return t;
                }
                else {
                  return String
                  .fromCharCode (parseInt ("0x" + part3));
                }
              });
    return text;
  }
}

/* Opera/IE/Safari 版に移植する部分 ---- ここから ---- */
/**
 * 設定管理
 */
var Aima_AimaniOptions = {
  prefBranch : null,    /* nsIPrefBranch/nsIPrefBranch2  pref サービス */
  
  mode : 1,                      /* Number  動作モード
                                  *   1: Firefox/Mozilla Suite
                                  *   2: Opera/IE/Safari */
    
  prefix : "",                   /* String  要素の ID のプレフィックス */
  attrName : "value",            /* String  値を格納する属性名 */
  itemName : "listitem",
  cellName : "listcell",
    
  /**
   * 初期化処理
   */
  init : function () {
    Aima_AimaniOptions.loadPrefs (null);
  },
    
  /**
   * 適用
   */
  apply : function () {
    Aima_AimaniOptions.savePrefs (null);
  },
    
  /**
   * 終了処理
   *
   * @return Boolean
   *         ダイアログを閉じるか
   */
  term : function () {
    if (Aima_AimaniOptions2.checkFocus ()) {
      return Aima_AimaniOptions.savePrefs (null);
    }
    else {
      return false;
    }
  },
    
  /**
   * 設定を読み込む
   * 設定が無ければ既定値を書き込む
   *
   * @param Object map
   *        設定のマップ
   *        prefs.js から読む場合は null
   *        <String 設定名, String 設定値>
   * @param  String type
   *         設定の種類
   *          "bool"
   *          "char"
   *          "int"
   * @param  String name
   *         設定名
   * @param  Boolean/String/Number value
   *         既定値
   * @return Boolean/String/Number
   *         取得した値
   *         設定が無ければ既定値
   */
  initPref : function (map, type, name, value) {
    if (map == null) {
      if (Aima_AimaniOptions.prefBranch == null) {
        if (Aima_AimaniOptions.mode == 1) {
          if (Components.interfaces.nsIPrefBranch2) {
            Aima_AimaniOptions.prefBranch
            = Components
            .classes ["@mozilla.org/preferences-service;1"]
            .getService (Components.interfaces.nsIPrefBranch2);
          }
          else {
            Aima_AimaniOptions.prefBranch
            = Components
            .classes ["@mozilla.org/preferences-service;1"]
            .getService (Components.interfaces.nsIPrefBranch);
          }
        }
        else {
          Aima_AimaniOptions.prefBranch = Aima_AimaniConfigManager.prefBranch;
        }
      }
            
      if (Aima_AimaniOptions.prefBranch.prefHasUserValue (name)) {
        ; /* switch のインデント用 */
        switch (type) {
          case "bool":
            value = Aima_AimaniOptions.prefBranch.getBoolPref (name);
            break;
          case "char":
            value = Aima_AimaniOptions.prefBranch.getCharPref (name);
            break;
          case "int":
            value = Aima_AimaniOptions.prefBranch.getIntPref (name);
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
            Aima_AimaniOptions.prefBranch.setBoolPref (name, value);
            break;
          case "char":
            Aima_AimaniOptions.prefBranch.setCharPref (name, value);
            break;
          case "int":
            Aima_AimaniOptions.prefBranch.setIntPref (name, value);
            break;
        }
      }
    }
    else {
      var ok = false;
      for (var name2 in map) {
        if (name2 == name) {
          ok = true;
          switch (type) {
            case "bool":
              value = (map [name2] == "true");
              break;
            case "char":
              value = map [name2];
              break;
            case "int":
              value = parseInt (map [name2]);
              break;
          }
          break;
        }
      }
      if (!ok && value == null) {
        return null;
      }
    }
        
    return value;
  },
    
  /**
   * 設定を読み込む
   *
   * @param Object map
   *        設定のマップ
   *        prefs.js から読む場合は null
   *        <String 設定名, String 設定値>
   */
  loadPrefs : function (map) {
    var value;
        
    if (Aima_AimaniOptions.mode == 1) {
      if (map == null) {
        document.getElementById ("version").value
          += Aima_AimaniVersion;
                
        var button;
            
        button = document
          .getElementById ("aima_aimani_preferences_dialog")
          .getButton ("extra1");
        button.addEventListener
          ("command",
           function () {
            Aima_AimaniOptions.apply ();
          }, true);
                
        button
          = document
          .getElementById ("aima_aimani_preferences_dialog")
          .getButton ("accept");
        button.addEventListener
          ("mousedown",
           function () {
            arguments [0].explicitOriginalTarget.focus ();
          }, true);
      }
    }
        
    document.getElementById (Aima_AimaniOptions.prefix + "all").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.all", true);
        
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "statusbar_preferences").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.statusbar.preferences",
                   true);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "statusbar_ng_word").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.statusbar.ng_word", true);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "toolbar_preferences").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.toolbar.preferences",
                   false);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "toolbar_ng_word").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.toolbar.ng_word", false);
    }
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "hide_warning").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.hide_warning", false);
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "hide_style").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.hide_style", false);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "hide_thread_style").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.hide_thread_style", false);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "hide_cat_style").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.hide_cat_style", false);
    }
    document.getElementById (Aima_AimaniOptions.prefix
                             + "catalogue_unlink").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.catalogue_unlink", false);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "show_textthread_reply").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.show_textthread_reply", false);
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "popup_message").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.popup_message", true);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "popup_message_delay_show").value
    = Aima_AimaniOptions
    .initPref (map, "int", "aima_aimani.popup_message.delay.show", 1000);
    Aima_AimaniOptions.checkPopupMessage ();
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "bracket").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.bracket", false);
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "easyng").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.easyng", false);
    var value = "all_open";
    if (Aima_AimaniOptions
        .initPref (map, "char", "aima_aimani.easyng.type", null)
        == null) {
      /* バージョンが古い */
      if (Aima_AimaniOptions
          .initPref (map, "bool", "aima_aimani.easyng.hideonly", false)) {
        value = "num";
      }
      else {
        value = "all_open";
      }
    }
    else {
      value
      = Aima_AimaniOptions
      .initPref (map, "char", "aima_aimani.easyng.type", "all_open");
    }
    document.getElementById (Aima_AimaniOptions.prefix
                             + "easyng_type").value = value;
    Aima_AimaniOptions.selectItem
    (document.getElementById (Aima_AimaniOptions.prefix
                              + "easyng_type"));
    document.getElementById (Aima_AimaniOptions.prefix
                             + "easyng_startup").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.easyng.startup", false);
    Aima_AimaniOptions.checkEasyNG ();
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "hide_entire_thread").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.hide_entire_thread", false);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "hide_entire_res").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.hide_entire_res", false);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "hide_entire_res_instant").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.hide_entire_res_instant", true);
    Aima_AimaniOptions.checkHideEntireRes ();
        
    document.getElementById (Aima_AimaniOptions.prefix + "ng_word").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.ng_word", true);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_cont").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.ng_word.cont", false);
    value
    = Aima_AimaniOptions
    .initPref (map, "int", "aima_aimani.ng_word.cont.length", 6);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_cont_length").value = value;
    value
    = Aima_AimaniOptions
    .initPref (map, "int", "aima_aimani.ng_word.cont.count", 3);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_cont_count").value = value;
    Aima_AimaniOptions.loadNGWord (map);
    Aima_AimaniOptions.loadBoardSelect (map, "ng_word.", "ng_word_");
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_thumbnail").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.ng_thumbnail", true);
    Aima_AimaniOptions.loadNGThumbnail (map);
    Aima_AimaniOptions.loadBoardSelect (map, "ng_thumbnail.",
                                        "ng_thumbnail_");
        
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.ng_cat", false);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_no_button").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.ng_cat.no_button", false);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_auto").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.ng_cat.auto", false);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_auto_threshold").value
        = Aima_AimaniOptions
        .initPref (map, "int",  "aima_aimani.ng_cat.auto.threshold",
                   5);
      Aima_AimaniOptions.checkNGCatAuto ();
      Aima_AimaniOptions.loadNGCat (map);
      Aima_AimaniOptions.loadBoardSelect (map, "ng_cat.", "ng_cat_");
    }
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_number").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.ng_number", true);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_number_catalogue").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.ng_number.catalogue", true);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_number_bottom").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.ng_number.bottom", false);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_number_selection").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.ng_number.selection", false);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_number_expire").value
    = Aima_AimaniOptions
    .initPref (map, "int",  "aima_aimani.ng_number.expire", 10000);
    Aima_AimaniOptions.loadNGNumber (map);
        
    document.getElementById (Aima_AimaniOptions.prefix + "thread_rule")
    .checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.thread_rule", false);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "thread_rule_expire").value
    = Aima_AimaniOptions
    .initPref (map, "int", "aima_aimani.thread_rule.expire", 10000);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "thread_rule_mini_thumb_size").value
    = Aima_AimaniOptions
    .initPref (map, "int", "aima_aimani.thread_rule.mini_thumb.size", 32);
    document.getElementById (Aima_AimaniOptions.prefix
                             + "thread_rule_mini_thumb_hover").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.thread_rule.mini_thumb.hover",
               false);
    Aima_AimaniOptions.loadThreadRule (map);
        
    document.getElementById (Aima_AimaniOptions.prefix + "mini_thumb")
    .checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.mini_thumb", false);

    document.getElementById (Aima_AimaniOptions.prefix
                             + "text_thread").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.text_thread", true);
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "board_select").checked
    = Aima_AimaniOptions
    .initPref (map, "bool", "aima_aimani.board_select", false);
        
    Aima_AimaniOptions.loadBoardSelect (map, "", "");
    Aima_AimaniOptions.checkBoardSelect ();
        
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById ("board_external").checked
        = Aima_AimaniOptions
        .initPref (map, "bool", "aima_aimani.board_external", false);
      value
        = Aima_AimaniOptions
        .initPref (map, "char", "aima_aimani.board_external.patterns",
                   "");
      var listbox = document.getElementById ("board_external_list");
      var node = listbox.firstChild;
      while (node) {
        var nextNode = node.nextSibling;
        if (node.nodeName == "listitem") {
          listbox.removeChild (node);
        }
        node = nextNode;
      }
      if (value != "") {
        /* 値を解析するだけなので代入はしない */
        value.replace
          (/([^&,]*)&([^&,]*),?/g,
           function (matched, pattern, flag) {
            Aima_AimaniOptions
              .addBoardExternalItem (unescape (pattern),
                                     unescape (flag),
                                     null);
          });
      }
      Aima_AimaniOptions.checkBoardExternal ();
    }
        
    if (map == null) {
      var menu;
      menu
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_number_server");
      Aima_AimaniOptions.initMenu (menu);
      menu
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "thread_rule_server");
      Aima_AimaniOptions.initMenu (menu);
    }
  },
    
  /* -- NG ワード -- ここから -- */
    
  /**
   * NG ワードを読み込む
   *
   * @param Object map
   *        設定のマップ
   *        prefs.js から読む場合は null
   *        <String 設定名, String 設定値>
   */
  loadNGWord : function (map) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_list");
    Aima_AimaniOptions.clearListitem (listbox);
        
    var now = (new Date ()).getTime ();
    var tmp
    = Aima_AimaniOptions
    .initPref (map, "char", "aima_aimani.ng_word.list", "");
    if (tmp != "") {
      /* 値を解析するだけなので代入はしない */
      tmp.replace
        (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&?([^&,]*)?,?/g,
         function (matched, word, r, target, dummy1, dummy2, expire) {
          if (!expire) {
            expire = "0";
          }
          target = parseInt (unescape (target));
          if (dummy1 == "o") {
            target |= 0x0500;
          }
          if (dummy2 == "o") {
            target |= 0x0200;
          }
          expire = unescape (expire);
          if (expire != "0") {
            if (expire.match (/^1_([0-9]*)$/)) {
              /* 時間制限 */
              var expireTime = parseInt (RegExp.$1);
              if (expireTime < now) {
                /* 期限切れ */
                return "";
              }
            }
          }
          Aima_AimaniOptions
            .addNGWordItem (unescape (word),
                            unescape (r) == "o",
                            target,
                            expire,
                            null);
          return "";
        });
    }
  },
    
  /**
   * NG ワードを保存する
   *
   * @param  nsIFileOutputStream/HTMLTextAreaElement fstream
   *         保存先のファイル
   *         prefs.js に保存する場合は null
   */
  saveNGWord : function (fstream) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix + "ng_word_list");
        
    var tmp = "";
    var node = Aima_AimaniOptions.getFirstItem (listbox);
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        var value = Aima_AimaniOptions.getNGWordItem (node);
                
        if (tmp != "") {
          tmp += ",";
        }
                
        tmp
          += escape (value [0])
          + "&" + (value [1] ? "o" : "x")
          + "&" + escape (value [2])
          + "&" + "0"
          + "&" + "0"
          + "&" + escape (value [3]);
      }
      node = nextNode;
    }
        
    Aima_AimaniOptions
    .setPref (fstream, "char", "aima_aimani.ng_word.list", tmp);
  },
    
  /**
   * NG ワードを取得する
   *
   * @param  Listitem/HTMLTableRowElement listitem 
   *         対象の項目
   * @return Array
   *         NG ワード
   *           [String NG ワード,
   *            Boolean 正規表現フラグ, Number 対象, String 期限]
   */
  getNGWordItem : function (listitem) {
    var listcell_word    = listitem.firstChild;
    var listcell_regexp  = listcell_word.nextSibling;
    var listcell_ic      = listcell_regexp.nextSibling;
    var listcell_message = listcell_ic.nextSibling;
    var listcell_mail    = listcell_message.nextSibling;
    var listcell_thread  = listcell_mail.nextSibling;
    var listcell_res     = listcell_thread.nextSibling;
    var listcell_cat     = listcell_res.nextSibling;
    var listcell_expire  = listcell_cat.nextSibling;
        
    return new Array (listcell_word.getAttribute
                      (Aima_AimaniOptions.attrName),
                      listcell_regexp.getAttribute
                      (Aima_AimaniOptions.attrName)
                      == "o",
                      parseInt (listcell_ic.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      listcell_expire.getAttribute
                      (Aima_AimaniOptions.attrName));
  },
    
  /**
   * NG ワードを追加する
   *
   * @param  String word
   *         NG ワード
   * @param  Boolean r
   *         正規表現フラグ
   * @param  Number target
   *         対象 (or で結合)
   *           0x0001: 本文
   *           0x0002: メル欄など
   *           0x0100: スレッド
   *           0x0200: レス
   *           0x0400: カタログ
   *           0x8000: 大文字/小文字を区別しない
   * @param  String expire
   *         期限
   * @param  XULElement/HTMLTableRowElement listitem
   *         置き換えるノード
   *         追加する場合は null
   */
  addNGWordItem : function (word, r, target, expire, listitem) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix + "ng_word_list");
    var listcell;
    var append = false;
    var input;
        
    if (listitem == null) {
      append = true;
      listitem = document.createElement (Aima_AimaniOptions.itemName);
      if (Aima_AimaniOptions.mode == 2) {
        Aima_Aimani.addEventListener
          (listitem,
           "click",
           function () {
            Aima_AimaniOptions
              .onSelectNGWord (arguments [0]);
          }, false);
      }
            
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "regexp";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckNGWordItem (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "ignore_case";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckNGWordItem (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "message";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckNGWordItem (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "mail";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckNGWordItem (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "thread";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckNGWordItem (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "res";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckNGWordItem (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "cat";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckNGWordItem (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
            
      if (Aima_AimaniOptions.mode == 1) {
        listitem.addEventListener
          ("mousedown",
           function () {
            Aima_AimaniOptions.onCheckNGWordItem (arguments [0]);
          }, false);
      }
      else if (Aima_Aimani.isIE) {
        listbox.appendChild (listitem);
      }
    }
        
    listcell = listitem.firstChild;
    Aima_AimaniOptions.setItem (listcell, 0, word, word);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, r ? "o" : "x", r);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, target, target & 0x8000);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, target, target & 0x0001);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, target, target & 0x0002);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, target, target & 0x0100);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, target, target & 0x0200);

    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, target, target & 0x0400);
        
    var expireText;
    if (expire == "0") {
      expireText = "\u306A\u3057";
    }
    else if (expire.match (/^1_([0-9]*)$/)) {
      var expireText
      = Aima_AimaniOptions.dateToReadable (parseInt (RegExp.$1), false);
    }
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, expireText, expire);
        
    if (Aima_AimaniOptions.mode == 1) {
      if (append) {
        listbox.appendChild (listitem);
      }
    }
    else {
      if (append
          && !Aima_Aimani.isIE) {
        listbox.appendChild (listitem);
      }
    }
  },
    
  /**
   * エポックミリ秒を可読表記に変換する
   *
   * @param  Number date
   *         エポックミリ秒
   * @param  Boolean isShort
   *         略記かどうか
   * @return String
   *         可読表記
   */
  dateToReadable : function (date, isShort) {
    if (isShort && date == 0) {
      return "\u4E0D\u660E";
    }
        
    var d = new Date ();
    d.setTime (date);
    var year = d.getYear () + 1900;
    if (Aima_AimaniOptions.mode == 2
        && Aima_Aimani.isIE) {
      year -= 1900;
    }
        
    if (isShort) {
      year = year % 100;
      if (year < 10) {
        year = "0" + year;
      }
    }
        
    var month = d.getMonth () + 1;
    if (month < 10) {
      month = "0" + month;
    }
    var day = d.getDate ();
    if (day < 10) {
      day = "0" + day;
    }
    var hour = d.getHours ();
    if (hour < 10) {
      hour = "0" + hour;
    }
    var min = d.getMinutes ();
    if (min < 10) {
      min = "0" + min;
    }
    var sec = d.getSeconds ();
    if (sec < 10) {
      sec = "0" + sec;
    }
    var readable;
    if (isShort) {
      readable
        = year + "/" + month + "/" + day;
    }
    else {
      readable
      = year + "/" + month + "/" + day
      + " " + hour + ":" + min + ":" + sec;
    }
        
    return readable;
  },
    
  /**
   * 可読表記をエポックミリ秒に変換する
   *
   * @param String readable
   *         可読表記
   * @return Number
   *         エポックミリ秒
   */
  readableToDate : function (readable) {
    var date;
    if (readable.match (/^(([0-9][0-9])?[0-9]?[0-9])\/([0-9]?[0-9])\/([0-9]?[0-9]) ([0-9]?[0-9]):([0-9]?[0-9]):([0-9]?[0-9])$/)) {
      var year = RegExp.$1;
      var month = RegExp.$3;
      var day = RegExp.$4;
      var hour = RegExp.$5;
      var min = RegExp.$6;
      var sec = RegExp.$7;
      var d = new Date ();
      if (year.length == 2) {
        year = "20" + year;
      }
      month = month.replace (/^0/, "");
      day = day.replace (/^0/, "");
      hour = hour.replace (/^0/, "");
      min = min.replace (/^0/, "");
      sec = sec.replace (/^0/, "");
      d.setYear (parseInt (year));
      d.setDate (1);
      d.setMonth (parseInt (month) - 1);
      d.setDate (parseInt (day));
            
      d.setHours (parseInt (hour));
      d.setMinutes (parseInt (min));
      d.setSeconds (parseInt (sec));
      date = d.getTime ();
    }
    else {
      var diff = 0;
      var d;
      if (readable.match
          (new RegExp ("([0-9]+(\\.[0-9]+)?)[^0-9]*(\u65E5\u5F8C?|D|d)"))) {
        d = RegExp.$1;
        d = d.replace (/^0/, "");
        diff += parseInt (parseFloat (d) * 60 * 60 * 24 * 1000);
      }
      if (readable.match
          (new RegExp ("([0-9]+(\\.[0-9]+)?)[^0-9]*(\u6642\u9593\u5F8C?|H|h)"))) {
        d = RegExp.$1;
        d = d.replace (/^0/, "");
        diff += parseInt (parseFloat (d) * 60 * 60 * 1000);
      }
      if (readable.match
          (new RegExp ("([0-9]+(\\.[0-9]+)?)[^0-9]*(\u5206\u5F8C?|M|m)"))) {
        d = RegExp.$1;
        d = d.replace (/^0/, "");
        diff += parseInt (parseFloat (d) * 60 * 1000);
      }
      if (readable.match
          (new RegExp ("([0-9]+(\\.[0-9]+)?)[^0-9]*(\u79D2\u5F8C?|S|s)"))) {
        d = RegExp.$1;
        d = d.replace (/^0/, "");
        diff += parseInt (parseFloat (d) * 1000);
      }
      if (diff != 0) {
        var d = new Date ();
        date = d.getTime () + diff;
      }
      else {
        date = "";
      }
    }
        
    return date;
  },
    
  /**
   * NG ワードを追加するボタンのイベント
   *
   * @param  Boolean modify
   *         修正するか追加するか
   *           true: 修正
   *           false: 追加
   */
  onAddNGWord : function (modify) {
    var text
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_word").value;
    var r
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_regexp").checked;
    var message
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_message").checked;
    var mail
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_mail").checked;
    var thread
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_thread").checked;
    var res
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_res").checked;
    var cat
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_cat").checked;
    var ic
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_ignore_case").checked;
    var expire
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_expire").value;
    var expireDate
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_expire_date").value;
        
    var target = 0;
    if (message) {
      target |= 0x0001;
    }
    if (mail) {
      target |= 0x0002;
    }
    if (thread) {
      target |= 0x0100;
    }
    if (res) {
      target |= 0x0200;
    }
    if (cat) {
      target |= 0x0400;
    }
    if (ic) {
      target |= 0x8000;
    }
        
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_illegal").value = "";
    }
    else {
      Aima_Aimani
      .setText (document
                .getElementById (Aima_AimaniOptions.prefix
                                 + "ng_word_illegal"), "");
    }
        
    if (expire == "none" || !expire) {
      expire = "0";
    }
    else if (expire == "1day") {
      expire = "1_" + Aima_AimaniOptions.readableToDate ("1d");
    }
    else if (expire == "3day") {
      expire = "1_" + Aima_AimaniOptions.readableToDate ("3d");
    }
    else if (expire == "date") {
      expire = Aima_AimaniOptions.readableToDate (expireDate);
      if (expire) {
        expire = "1_" + expire;
      }
      else {
        if (Aima_AimaniOptions.mode == 1) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_word_illegal").value
          = "\u6642\u523B\u304C\u7570\u5E38\u3067\u3059";
        }
        else {
          Aima_Aimani
          .setText (document
                    .getElementById (Aima_AimaniOptions.prefix
                                     + "ng_word_illegal"),
                    "\u6642\u523B\u304C\u7570\u5E38\u3067\u3059");
        }
                
        return;
      }
    }
        
    if (r) {
      try {
        var tmp = "test";
        tmp.search (text);
      }
      catch (e) { Components.utils.reportError (e);
        if (Aima_AimaniOptions.mode == 1) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_word_illegal").value
          = "\u6B63\u898F\u8868\u73FE\u304C\u4E0D\u6B63\u3067\u3059";
        }
        else {
          Aima_Aimani
          .setText (document
                    .getElementById (Aima_AimaniOptions.prefix
                                     + "ng_word_illegal"),
                    "\u6B63\u898F\u8868\u73FE\u304C\u4E0D\u6B63\u3067\u3059");
        }
                
        return;
      }
    }
        
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix + "ng_word_list");
    var exist = false;
        
    if (text) {
      var nextNode = null;
      var node = null;
      if (modify) {
        node = listbox.firstChild;
        while (node) {
          if (Aima_AimaniOptions.isListitem (node)) {
            if (Aima_AimaniOptions.isSelected (node)) {
              break;
            }
          }
          node = node.nextSibling;
        }
      }
            
      var node2 = listbox.firstChild;
      while (node2) {
        var nextNode2 = node2.nextSibling;
        if (Aima_AimaniOptions.isListitem (node2)) {
          var value = Aima_AimaniOptions.getNGWordItem (node2);
                    
          if (text == value [0] && r == value [1]
              && node2 != node) {
            exist = true;
            break;
          }
        }
        node2 = nextNode2;
      }
            
      if (!exist) {
        Aima_AimaniOptions.addNGWordItem (text,
                                          r, target, expire,
                                          node);
        if (node == null) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_word_word").value = "";
        }
      }
      else {
        if (Aima_AimaniOptions.mode == 1) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_word_illegal").value
            = "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059";
        }
        else {
          Aima_Aimani
            .setText (document
                      .getElementById (Aima_AimaniOptions.prefix
                                       + "ng_word_illegal"),
                      "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059");
        }
      }
    }
    else {
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_word_illegal").value
        = "\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059";
      }
      else {
        Aima_Aimani
        .setText (document
                  .getElementById (Aima_AimaniOptions.prefix
                                   + "ng_word_illegal"),
                  "\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059");
      }
    }
  },
    
  /**
   * NG ワードを削除するボタンのイベント
   */
  onDeleteNGWord : function () {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix + "ng_word_list");
        
    var node = listbox.firstChild;
    var listbox2
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
        
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          var value = Aima_AimaniOptions.getNGWordItem (node);
          var word = value [0];
          var ic = value [2] & 0x8000;
          if (!value [1]) {
            word = word.replace
              (/([\(\)\[\]\{\}\\\^\$\+\*\?\|\-])/g, "\\$1");
          }
          if (ic) {
            word = new RegExp (word, "i");
          }
          else {
            word = new RegExp (word);
          }
                    
          var node2 = Aima_AimaniOptions.getFirstItem (listbox2);
          while (node2) {
            var nextNode2 = node2.nextSibling;
            if (Aima_AimaniOptions.isListitem (node2)) {
              var value2
                = Aima_AimaniOptions
                .getNGNumberItem (node2);
                            
              if (value2 [4] == 1
                  && value2 [3].search (word) != -1) {
                listbox2.removeChild (node2);
              }
            }
            node2 = nextNode2;
          }
                    
          listbox.removeChild (node);
        }
      }
      node = nextNode;
    }
        
    if (Aima_AimaniOptions.mode == 2) {
      if (Aima_Aimani.isOpera
          && "version" in window.opera
          && window.opera.version ().match (/^9/)) {
        window.scrollBy (0, 0);
      }
    }
  },
    
  /**
   * NG ワードを選択したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onSelectNGWord : function (event) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix + "ng_word_list");
    if (Aima_AimaniOptions.mode == 2) {
      Aima_AimaniUIUtil.onSelectList (event);
    }
    var selectedItem = Aima_AimaniOptions.getSelectedItem (event, listbox);
        
    if (Aima_AimaniOptions.getSelectedIndex (listbox) != -1) {
      var value = Aima_AimaniOptions.getNGWordItem (selectedItem);
            
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_word").value = value [0];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_regexp").checked = value [1];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_message").checked
        = value [2] & 0x0001;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_mail").checked
        = value [2] & 0x0002;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_thread").checked
        = value [2] & 0x0100;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_res").checked
        = value [2] & 0x0200;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_cat").checked
        = value [2] & 0x0400;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_ignore_case").checked
        = value [2] & 0x8000;
      if (value [3] == "0") {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_word_expire").value = "none";
        if (Aima_AimaniOptions.mode == 2) {
          document.getElementById
            (Aima_AimaniOptions.prefix
             + "ng_word_expire_none").checked
            = "checked";
          document.getElementById
            (Aima_AimaniOptions.prefix
             + "ng_word_expire_1day").checked
            = "";
          document.getElementById
            (Aima_AimaniOptions.prefix
             + "ng_word_expire_3day").checked
            = "";
          document.getElementById
            (Aima_AimaniOptions.prefix
             + "ng_word_expire_date").checked
            = "";
        }
        Aima_AimaniOptions.selectItem
          (document.getElementById (Aima_AimaniOptions.prefix
                                    + "ng_word_expire"));
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_word_expire_date").value
          = "";
      }
      else if (value [3].match (/^1_([0-9]*)$/)) {
        var expireTime = parseInt (RegExp.$1);
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_word_expire").value = "date";
        if (Aima_AimaniOptions.mode == 2) {
          document.getElementById
            (Aima_AimaniOptions.prefix
             + "ng_word_expire_none").checked
            = "";
          document.getElementById
            (Aima_AimaniOptions.prefix
             + "ng_word_expire_1day").checked
            = "";
          document.getElementById
            (Aima_AimaniOptions.prefix
             + "ng_word_expire_3day").checked
            = "";
          document.getElementById
            (Aima_AimaniOptions.prefix
             + "ng_word_expire_date").checked
            = "checked";
        }
        Aima_AimaniOptions.selectItem
          (document.getElementById (Aima_AimaniOptions.prefix
                                    + "ng_word_expire"));
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_word_expire_date").value
          = Aima_AimaniOptions.dateToReadable (expireTime, false);
      }
            
      var selectedCount = Aima_AimaniOptions.getSelectedCount (listbox);
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_word_modify").disabled
          = (selectedCount > 1);
      }
      else {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_word_modify")
          .disabled = (selectedCount > 1) ? "disabled" : "";
      }
    }
  },
    
  /**
   * ラヂオボタンの選択肢を表示に反映する
   * (古いバージョンだと value の変更だけでは反映されない)
   *
   */
  selectItem : function (node) {
    var value = node.value;
        
    var nodes = node.getElementsByTagName ("radio");
    for (var i = 0; i < nodes.length; i ++) {
      if (nodes [i].value == value) {
        node.selectedItem = nodes [i];
      }
    }
  },
    
  /**
   * NG ワードの項目を変更したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onCheckNGWordItem : function (event) {
    var listitem;
    var target = null;
        
    if (Aima_AimaniOptions.mode == 1) {
      listitem = event.target;
      if (!Aima_AimaniOptions.isListitem (listitem)) {
        return;
      }
    }
    else {
      target = event.target;
      listitem = Aima_Aimani.findParentNode (target,
                                             Aima_AimaniOptions.itemName);
    }
        
    var value = Aima_AimaniOptions.getNGWordItem (listitem);
        
    if (Aima_AimaniOptions.mode == 1) {
      var listcell_word    = listitem.firstChild;
      var listcell_regexp  = listcell_word.nextSibling;
      var listcell_ic      = listcell_regexp.nextSibling;
      var listcell_message = listcell_ic.nextSibling;
      var listcell_mail    = listcell_message.nextSibling;
      var listcell_thread  = listcell_mail.nextSibling;
      var listcell_res     = listcell_thread.nextSibling;
      var listcell_cat     = listcell_res.nextSibling;
      var listcell_expire  = listcell_cat.nextSibling;
            
      if (event.clientX
          < listcell_word.boxObject.x
          + listcell_word.boxObject.width) {
        return;
      }
      else if (event.clientX
               < listcell_regexp.boxObject.x
               + listcell_regexp.boxObject.width) {
        if (event.clientX
            < listcell_regexp.boxObject.x + 16) {
          value [1] = !value [1];
        }
      }
      else if (event.clientX
               < listcell_ic.boxObject.x
               + listcell_ic.boxObject.width) {
        if (event.clientX
            < listcell_ic.boxObject.x + 16) {
          value [2] = value [2] ^ 0x8000;
        }
      }
      else if (event.clientX
               < listcell_message.boxObject.x
               + listcell_message.boxObject.width) {
        if (event.clientX
            < listcell_message.boxObject.x + 16) {
          value [2] = value [2] ^ 0x0001;
        }
      }
      else if (event.clientX
               < listcell_mail.boxObject.x
               + listcell_mail.boxObject.width) {
        if (event.clientX
            < listcell_mail.boxObject.x + 16) {
          value [2] = value [2] ^ 0x0002;
        }
      }
      else if (event.clientX
               < listcell_thread.boxObject.x
               + listcell_thread.boxObject.width) {
        if (event.clientX
            < listcell_thread.boxObject.x + 16) {
          value [2] = value [2] ^ 0x0100;
        }
      }
      else if (event.clientX
               < listcell_res.boxObject.x
               + listcell_res.boxObject.width) {
        if (event.clientX
            < listcell_res.boxObject.x + 16) {
          value [2] = value [2] ^ 0x0200;
        }
      }
      else if (event.clientX
               < listcell_cat.boxObject.x
               + listcell_cat.boxObject.width) {
        if (event.clientX
            < listcell_cat.boxObject.x + 16) {
          value [2] = value [2] ^ 0x0400;
        }
      }
      else if (event.clientX
               < listcell_expire.boxObject.x
               + listcell_expire.boxObject.width) {
        return;
      }
    }
    else {
      if (target.className == Aima_AimaniOptions.prefix + "regexp") {
        value [1] = !value [1];
      }
      else if (target.className
               == Aima_AimaniOptions.prefix + "ignore_case") {
        value [2] = value [2] ^ 0x8000;
      }
      else if (target.className
               == Aima_AimaniOptions.prefix + "message") {
        value [2] = value [2] ^ 0x0001;
      }
      else if (target.className == Aima_AimaniOptions.prefix + "mail") {
        value [2] = value [2] ^ 0x0002;
      }
      else if (target.className == Aima_AimaniOptions.prefix + "thread") {
        value [2] = value [2] ^ 0x0100;
      }
      else if (target.className == Aima_AimaniOptions.prefix + "res") {
        value [2] = value [2] ^ 0x0200;
      }
      else if (target.className == Aima_AimaniOptions.prefix + "cat") {
        value [2] = value [2] ^ 0x0400;
      }
    }
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_word").value = value [0];
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_regexp").checked = value [1];
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_message").checked
    = value [2] & 0x0001;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_mail").checked
    = value [2] & 0x0002;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_thread").checked
    = value [2] & 0x0100;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_res").checked
    = value [2] & 0x0200;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_cat").checked
    = value [2] & 0x0400;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_word_ignore_case").checked
    = value [2] & 0x8000;
    if (value [3] == "0") {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_expire").value = "none";
      if (Aima_AimaniOptions.mode == 2) {
        document.getElementById
          (Aima_AimaniOptions.prefix
           + "ng_word_expire_none").checked
          = "checked";
        document.getElementById
          (Aima_AimaniOptions.prefix
           + "ng_word_expire_1day").checked
          = "";
        document.getElementById
          (Aima_AimaniOptions.prefix
           + "ng_word_expire_3day").checked
          = "";
        document.getElementById
          (Aima_AimaniOptions.prefix
           + "ng_word_expire_date").checked
          = "";
      }
      Aima_AimaniOptions.selectItem
        (document.getElementById (Aima_AimaniOptions.prefix
                                  + "ng_word_expire"));
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_expire_date").value
        = "";
    }
    else if (value [3].match (/^1_([0-9]*)$/)) {
      var expireTime = parseInt (RegExp.$1);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_expire").value = "date";
      if (Aima_AimaniOptions.mode == 2) {
        document.getElementById
          (Aima_AimaniOptions.prefix
           + "ng_word_expire_none").checked
          = "";
        document.getElementById
          (Aima_AimaniOptions.prefix
           + "ng_word_expire_1day").checked
          = "";
        document.getElementById
          (Aima_AimaniOptions.prefix
           + "ng_word_expire_3day").checked
          = "";
        document.getElementById
          (Aima_AimaniOptions.prefix
           + "ng_word_expire_date").checked
          = "checked";
      }
      Aima_AimaniOptions.selectItem
      (document.getElementById (Aima_AimaniOptions.prefix
                                + "ng_word_expire"));
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_expire_date").value
      = Aima_AimaniOptions.dateToReadable (expireTime, false);
    }
        
    Aima_AimaniOptions.addNGWordItem (value [0], value [1],
                                      value [2], value [3],
                                      listitem);
  },
    
  /* -- NG ワード -- ここまで -- */
    
  /* -- NG サムネ -- ここから -- */
    
  /**
   * NG サムネを読み込む
   *
   * @param Object map
   *        設定のマップ
   *        prefs.js から読む場合は null
   *        <String 設定名, String 設定値>
   */
  loadNGThumbnail : function (map) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_list");
    Aima_AimaniOptions.clearListitem (listbox);
        
    var tmp
    = Aima_AimaniOptions
    .initPref (map, "char", "aima_aimani.ng_thumbnail.list", "");
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
                    
          Aima_AimaniOptions
            .addNGThumbnailItem (parseInt (unescape (width)),
                                 parseInt (unescape (height)),
                                 unescape (bytes),
                                 unescape (ext),
                                 unescape (comment),
                                 parseInt (unescape (count)),
                                 parseInt (unescape (date)),
                                 null);
          return "";
        });
    }
  },
    
  /**
   * NG サムネを保存する
   *
   * @param  nsIFileOutputStream/HTMLTextAreaElement fstream
   *         保存先のファイル
   *         prefs.js に保存する場合は null
   */
  saveNGThumbnail : function (fstream) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_list");
        
    var tmp = "";
    var node = Aima_AimaniOptions.getFirstItem (listbox);
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        var value = Aima_AimaniOptions.getNGThumbnailItem (node);
                
        if (tmp != "") {
          tmp += ",";
        }
                
        tmp
          += escape (value [0])
          + "&" + escape (value [1])
          + "&" + escape (value [2])
          + "&" + escape (value [3])
          + "&" + escape (value [4])
          + "&" + escape (value [5])
          + "&" + escape (value [6]);
      }
      node = nextNode;
    }
        
    Aima_AimaniOptions
    .setPref (fstream, "char", "aima_aimani.ng_thumbnail.list", tmp);
  },
    
  /**
   * NG サムネを取得する
   *
   * @param  Listitem/HTMLTableRowElement listitem
   *         対象の項目
   * @return Array
   *         NG サムネ
   *           [Number 幅, Number 高さ, String バイト数, String 拡張子,
   *            String コメント, Number 回数]
   */
  getNGThumbnailItem : function (listitem) {
    var listcell_width   = listitem.firstChild;
    var listcell_height  = listcell_width.nextSibling;
    var listcell_bytes   = listcell_height.nextSibling;
    var listcell_ext     = listcell_bytes.nextSibling;
    var listcell_comment = listcell_ext.nextSibling;
    var listcell_count   = listcell_comment.nextSibling;
    var listcell_date    = listcell_count.nextSibling;
        
    return new Array (parseInt (listcell_width.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      parseInt (listcell_height.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      listcell_bytes.getAttribute
                      (Aima_AimaniOptions.attrName),
                      listcell_ext.getAttribute
                      (Aima_AimaniOptions.attrName),
                      listcell_comment.getAttribute
                      (Aima_AimaniOptions.attrName),
                      parseInt (listcell_count.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      parseInt (listcell_date.getAttribute
                                (Aima_AimaniOptions.attrName)));
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
   * @param  Number count
   *         回数
   * @param  XULElement/HTMLTableRowElement listitem
   *         置き換えるノード
   *         追加する場合は null
   */
  addNGThumbnailItem : function (width, height, bytes, ext,
                                 comment, count, date, listitem) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_list");
    var listcell;
    var input;
    var append = false;
        
    if (listitem == null) {
      append = true;
      listitem = document.createElement (Aima_AimaniOptions.itemName);
      if (Aima_AimaniOptions.mode == 2) {
        Aima_Aimani.addEventListener
          (listitem,
           "click",
           function () {
            Aima_AimaniOptions
              .onSelectNGThumbnail (arguments [0]);
          }, false);
      }
            
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
    }
        
    listcell = listitem.firstChild;
    Aima_AimaniOptions.setItem (listcell, 0, width, width);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, height, height);
        
    listcell = listcell.nextSibling;
    if (bytes.match (/([0-9]+)\-([0-9]+)/)) {
      Aima_AimaniOptions.setItem (listcell, 0,
                                  parseInt (RegExp.$1) + "-"
                                  + parseInt (RegExp.$2),
                                  parseInt (RegExp.$1) + "-"
                                  + parseInt (RegExp.$2));
    }
    else {
      Aima_AimaniOptions.setItem (listcell, 0,
                                  bytes,
                                  bytes);
    }
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, ext, ext);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, comment, comment);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, count, count);
        
    r = Aima_AimaniOptions.dateToReadable (date, true);
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, r, date);
        
    if (append) {
      listbox.appendChild (listitem);
    }
  },
    
  /**
   * NG サムネを追加するボタンのイベント
   *
   * @param  Boolean modify
   *         修正するか追加するか
   *           true: 修正
   *           false: 追加
   */
  onAddNGThumbnail : function (modify) {
    var width
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_thumbnail_width").value);
    var height
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_thumbnail_height").value);
    var bytes
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_thumbnail_bytes").value);
    var bytes2
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_thumbnail_bytes2").value);
    var ext
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_ext").value;
    var comment
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_comment").value;
    var count
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_thumbnail_count").value)
    || 0;
    var date
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_thumbnail_date_value").value)
    || 0;
    if (!modify) {
      var now = (new Date ()).getTime ();
      date = now;
    }
        
    if (bytes2 > bytes) {
      bytes = bytes + "-" + bytes2;
    }
    else {
      bytes = bytes + "";
    }
        
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_illegal").value = "";
    }
    else {
      Aima_Aimani
      .setText (document
                .getElementById (Aima_AimaniOptions.prefix
                                 + "ng_thumbnail_illegal"), "");
    }
        
    var listbox = document.getElementById (Aima_AimaniOptions.prefix
                                           + "ng_thumbnail_list");
    var exist = false;
        
    if (width && height && bytes && ext) {
      var nextNode = null;
      var node = null;
      if (modify) {
        node = listbox.firstChild;
        while (node) {
          if (Aima_AimaniOptions.isListitem (node)) {
            if (Aima_AimaniOptions.isSelected (node)) {
              break;
            }
          }
          node = node.nextSibling;
        }
      }
            
      var node2 = listbox.firstChild;
      while (node2) {
        var nextNode2 = node2.nextSibling;
        if (Aima_AimaniOptions.isListitem (node2)) {
          var value = Aima_AimaniOptions.getNGThumbnailItem (node2);
                    
          if (width == value [0] && height == value [1]
              && bytes == value [2] && ext == value [3]
              && node2 != node) {
            exist = true;
            break;
          }
        }
        node2 = nextNode2;
      }
            
      if (!exist) {
        Aima_AimaniOptions.addNGThumbnailItem (width, height,
                                               bytes, ext,
                                               comment, count, date,
                                               node);
        if (node == null) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_width").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_height").value
            = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_bytes").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_bytes2").value
            = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_ext").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_comment").value
            = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_count").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_date").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_date_value").value = "";
        }
      }
      else {
        if (Aima_AimaniOptions.mode == 1) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_illegal").value
            = "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059";
        }
        else {
          Aima_Aimani
            .setText (document
                      .getElementById (Aima_AimaniOptions.prefix
                                       + "ng_thumbnail_illegal"),
                      "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059");
        }
      }
    }
    else {
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_thumbnail_illegal").value
        = "\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059";
      }
      else {
        Aima_Aimani
        .setText (document
                  .getElementById (Aima_AimaniOptions.prefix
                                   + "ng_thumbnail_illegal"),
                  "\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059");
      }
    }
  },
    
  /**
   * NG サムネを削除するボタンのイベント
   */
  onDeleteNGThumbnail : function () {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_list");
        
    var node = listbox.firstChild;
    var listbox2
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
        
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          var value = Aima_AimaniOptions.getNGThumbnailItem (node);
          var word
            = value [0] + "_" + value [1]
            + "_" + value [2] + "_" + value [3];
                    
          var node2 = Aima_AimaniOptions.getFirstItem (listbox2);
          while (node2) {
            var nextNode2 = node2.nextSibling;
            if (Aima_AimaniOptions.isListitem (node2)) {
              var value2
                = Aima_AimaniOptions
                .getNGNumberItem (node2);
                            
              if (value2 [4] == 2
                  && word == value2 [3]) {
                listbox2.removeChild (node2);
              }
            }
            node2 = nextNode2;
          }
                    
          listbox.removeChild (node);
        }
      }
      node = nextNode;
    }
            
    if (Aima_AimaniOptions.mode == 2) {
      if (Aima_Aimani.isOpera
          && "version" in window.opera
          && window.opera.version ().match (/^9/)) {
        window.scrollBy (0, 0);
      }
    }
  },
    
  /**
   * NG サムネを回数でソートするボタンのイベント
   *
   * @param  Number type
   *         ソート対象
   *           0:  回数
   *           1:  幅
   *           2:  高さ
   *           3:  サイズ
   *           4:  バイト数
   *           5:  反転
   */
  onSortNGThumbnail : function (type) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_list");
    var nowNode = listbox.firstChild;
        
    var array = new Array ();
    var i;
        
    while (nowNode) {
      if (Aima_AimaniOptions.isListitem (nowNode)) {
        var value = Aima_AimaniOptions.getNGThumbnailItem (nowNode);
        if (value [2].match (/([0-9]+)\-([0-9]+)/)) {
          value [2]
            = (parseInt (RegExp.$1) + parseInt (RegExp.$2)) / 2;
        }
        else {
          value [2] = parseInt (value [2]);
        }
        array.push (new Array (nowNode, value));
      }
      nowNode = nowNode.nextSibling;
    }
        
    var sortFunc = function () {};
    if (type == 0) {
      sortFunc = function (a, b) {
        return (a [1])[5] - (b [1])[5];
      }
    }
    else if (type == 1) {
      sortFunc = function (a, b) {
        return (a [1])[0] - (b [1])[0];
      }
    }
    else if (type == 2) {
      sortFunc = function (a, b) {
        return (a [1])[1] - (b [1])[1];
      }
    }
    else if (type == 3) {
      sortFunc = function (a, b) {
        return (a [1])[0] * (a [1])[1] - (b [1])[0] * (b [1])[1];
      }
    }
    else if (type == 4) {
      sortFunc = function (a, b) {
        return (a [1])[2] - (b [1])[2];
      }
    }
    else if (type == 5) {
      sortFunc = function (a, b) {
        return (a [1])[6] - (b [1])[6];
      }
    }
        
    if (type == 10) {
      array = array.reverse ();
    }
    else {
      array.sort (sortFunc);
    }
        
    for (i = 0; i < array.length; i ++) {
      listbox.removeChild (array [i][0]);            
      listbox.appendChild (array [i][0]);            
    }
  },
    
  /**
   * NG サムネを選択したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onSelectNGThumbnail : function (event) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_list");
    if (Aima_AimaniOptions.mode == 2) {
      Aima_AimaniUIUtil.onSelectList (event);
    }
    var selectedItem = Aima_AimaniOptions.getSelectedItem (event, listbox);
        
    if (Aima_AimaniOptions.getSelectedIndex (listbox) != -1) {
      var value = Aima_AimaniOptions.getNGThumbnailItem (selectedItem);
            
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_width").value = value [0];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_height").value = value [1];
      if (value [2].match (/([0-9]+)\-([0-9]+)/)) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_thumbnail_bytes").value
          = RegExp.$1;
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_thumbnail_bytes2").value
          = RegExp.$2;
      }
      else {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_thumbnail_bytes").value
          = value [2];
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_thumbnail_bytes2").value = "";
      }
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_ext").value = value [3];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_comment").value
        = value [4];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_count").value = value [5];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_date_value").value = value [6];
      r = Aima_AimaniOptions.dateToReadable (value [6], false);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_date").value = r;
            
      var selectedCount = Aima_AimaniOptions.getSelectedCount (listbox);
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_thumbnail_modify").disabled
          = (selectedCount > 1);
      }
      else {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_thumbnail_modify").disabled
          = (selectedCount > 1) ? "disabled" : "";
      }
    }
  },
    
  /* -- NG サムネ -- ここまで -- */
  /* -- NG カタログ -- ここから -- */
    
  /**
   * NG カタログを読み込む
   *
   * @param Object map
   *        設定のマップ
   *        prefs.js から読む場合は null
   *        <String 設定名, String 設定値>
   */
  loadNGCat : function (map) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_list");
    Aima_AimaniOptions.clearListitem (listbox);
        
    var tmp
    = Aima_AimaniOptions
    .initPref (map, "char", "aima_aimani.ng_cat.list", "");
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
                    
          Aima_AimaniOptions
            .addNGCatItem (parseInt (unescape (width)),
                           parseInt (unescape (height)),
                           unescape (hash),
                           unescape (comment),
                           parseInt (unescape (count)),
                           parseInt (unescape (date)),
                           null);
          return "";
        });
    }
  },
    
  /**
   * NG カタログを保存する
   *
   * @param  nsIFileOutputStream/HTMLTextAreaElement fstream
   *         保存先のファイル
   *         prefs.js に保存する場合は null
   */
  saveNGCat : function (fstream) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix + "ng_cat_list");
        
    var tmp = "";
    var node = Aima_AimaniOptions.getFirstItem (listbox);
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        var value = Aima_AimaniOptions.getNGCatItem (node);
                
        if (tmp != "") {
          tmp += ",";
        }
                
        tmp
          += escape (value [0])
          + "&" + escape (value [1])
          + "&" + escape (value [2])
          + "&" + escape (value [3])
          + "&" + escape (value [4])
          + "&" + escape (value [5]);
      }
      node = nextNode;
    }
        
    Aima_AimaniOptions
    .setPref (fstream, "char", "aima_aimani.ng_cat.list", tmp);
  },
    
  /**
   * NG カタログを取得する
   *
   * @param  Listitem/HTMLTableRowElement listitem
   *         対象の項目
   * @return Array
   *         NG カタログ
   *           [Number 幅, Number 高さ, String ハッシュ,
   *            String コメント, Number 回数]
   */
  getNGCatItem : function (listitem) {
    var listcell_width   = listitem.firstChild;
    var listcell_height  = listcell_width.nextSibling;
    var listcell_md5     = listcell_height.nextSibling;
    var listcell_comment = listcell_md5.nextSibling;
    var listcell_count   = listcell_comment.nextSibling;
    var listcell_date    = listcell_count.nextSibling;
        
    return new Array (parseInt (listcell_width.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      parseInt (listcell_height.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      listcell_md5.getAttribute
                      (Aima_AimaniOptions.attrName),
                      listcell_comment.getAttribute
                      (Aima_AimaniOptions.attrName),
                      parseInt (listcell_count.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      parseInt (listcell_date.getAttribute
                                (Aima_AimaniOptions.attrName)));
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
   * @param  Number count
   *         回数
   * @param  Number date
   *         最終更新日時
   * @param  XULElement/HTMLTableRowElement listitem
   *         置き換えるノード
   *         追加する場合は null
   */
  addNGCatItem : function (width, height, hash,
                           comment, count, date, listitem) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_list");
    var listcell;
    var input;
    var append = false;
        
    if (listitem == null) {
      append = true;
      listitem = document.createElement (Aima_AimaniOptions.itemName);
      if (Aima_AimaniOptions.mode == 2) {
        Aima_Aimani.addEventListener
          (listitem,
           "click",
           function () {
            Aima_AimaniOptions
              .onSelectNGCat (arguments [0]);
          }, false);
      }
            
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
    }
        
    listcell = listitem.firstChild;
    Aima_AimaniOptions.setItem (listcell, 0, width, width);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, height, height);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, hash, hash);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, comment, comment);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, count, count);
        
    var r = Aima_AimaniOptions.dateToReadable (date, true);
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, r, date);
        
    if (append) {
      listbox.appendChild (listitem);
    }
  },
    
  /**
   * NG カタログを追加するボタンのイベント
   *
   * @param  Boolean modify
   *         修正するか追加するか
   *           true: 修正
   *           false: 追加
   */
  onAddNGCat : function (modify) {
    var width
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_cat_width").value);
    var height
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_cat_height").value);
    var hash
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_hash").value;
    var comment
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_comment").value;
    var count
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_cat_count").value)
    || 0;
    var date
    = parseInt (document.getElementById (Aima_AimaniOptions.prefix
                                         + "ng_cat_date_value").value)
    || 0;
    if (!modify) {
      var now = (new Date ()).getTime ();
      date = now;
    }
        
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_illegal").value = "";
    }
    else {
      Aima_Aimani
      .setText (document
                .getElementById (Aima_AimaniOptions.prefix
                                 + "ng_cat_illegal"), "");
    }
        
    var listbox = document.getElementById (Aima_AimaniOptions.prefix
                                           + "ng_cat_list");
    var exist = false;
        
    if (width && height && hash) {
      var nextNode = null;
      var node = null;
      if (modify) {
        node = listbox.firstChild;
        while (node) {
          if (Aima_AimaniOptions.isListitem (node)) {
            if (Aima_AimaniOptions.isSelected (node)) {
              break;
            }
          }
          node = node.nextSibling;
        }
      }
            
      var node2 = listbox.firstChild;
      while (node2) {
        var nextNode2 = node2.nextSibling;
        if (Aima_AimaniOptions.isListitem (node2)) {
          var value = Aima_AimaniOptions.getNGCatItem (node2);
                    
          if (width == value [0] && height == value [1]
              && hash == value [2]
              && node2 != node) {
            exist = true;
            break;
          }
        }
        node2 = nextNode2;
      }
            
      if (!exist) {
        Aima_AimaniOptions.addNGCatItem (width, height,
                                         hash,
                                         comment, count, date,
                                         node);
        if (node == null) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_width").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_height").value
            = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_hash").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_comment").value
            = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_count").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_date").value = "";
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_date_value").value = "";
        }
      }
      else {
        if (Aima_AimaniOptions.mode == 1) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_illegal").value
            = "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059";
        }
        else {
          Aima_Aimani
            .setText (document
                      .getElementById (Aima_AimaniOptions.prefix
                                       + "ng_cat_illegal"),
                      "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059");
        }
      }
    }
    else {
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_cat_illegal").value
        = "\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059";
      }
      else {
        Aima_Aimani
        .setText (document
                  .getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_illegal"),
                  "\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059");
      }
    }
  },
    
  /**
   * NG カタログを削除するボタンのイベント
   */
  onDeleteNGCat : function () {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_list");
        
    var node = listbox.firstChild;
    var listbox2
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
        
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          var value = Aima_AimaniOptions.getNGCatItem (node);
          var word
            = value [0] + "_" + value [1]
            + "_" + value [2];
                    
          var node2 = Aima_AimaniOptions.getFirstItem (listbox2);
          while (node2) {
            var nextNode2 = node2.nextSibling;
            if (Aima_AimaniOptions.isListitem (node2)) {
              var value2
                = Aima_AimaniOptions
                .getNGNumberItem (node2);
                            
              if (value2 [4] == 6
                  && word == value2 [3]) {
                listbox2.removeChild (node2);
              }
            }
            node2 = nextNode2;
          }
                    
          listbox.removeChild (node);
        }
      }
      node = nextNode;
    }
            
    if (Aima_AimaniOptions.mode == 2) {
      if (Aima_Aimani.isOpera
          && "version" in window.opera
          && window.opera.version ().match (/^9/)) {
        window.scrollBy (0, 0);
      }
    }
  },
    
  /**
   * NG カタログを回数でソートするボタンのイベント
   * 
   * @param  Number type
   *         ソート対象
   *           0:  回数
   *           1:  幅
   *           2:  高さ
   *           3:  サイズ
   *           4:  最終更新日時
   *           5:  反転
   */
  onSortNGCat : function (type) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_list");
    var nowNode = listbox.firstChild;
        
    var array = new Array ();
    var i;
        
    while (nowNode) {
      if (Aima_AimaniOptions.isListitem (nowNode)) {
        var value = Aima_AimaniOptions.getNGCatItem (nowNode);
        if (value [2].match (/([0-9]+)\-([0-9]+)/)) {
          value [2]
            = (parseInt (RegExp.$1) + parseInt (RegExp.$2)) / 2;
        }
        else {
          value [2] = parseInt (value [2]);
        }
        array.push (new Array (nowNode, value));
      }
      nowNode = nowNode.nextSibling;
    }
        
    var sortFunc = function () {};
    if (type == 0) {
      sortFunc = function (a, b) {
        return (a [1])[4] - (b [1])[4];
      }
    }
    else if (type == 1) {
      sortFunc = function (a, b) {
        return (a [1])[0] - (b [1])[0];
      }
    }
    else if (type == 2) {
      sortFunc = function (a, b) {
        return (a [1])[1] - (b [1])[1];
      }
    }
    else if (type == 3) {
      sortFunc = function (a, b) {
        return (a [1])[0] * (a [1])[1] - (b [1])[0] * (b [1])[1];
      }
    }
    else if (type == 4) {
      sortFunc = function (a, b) {
        return (a [1])[5] - (b [1])[5];
      }
    }
        
    if (type == 10) {
      array = array.reverse ();
    }
    else {
      array.sort (sortFunc);
    }
        
    for (i = 0; i < array.length; i ++) {
      listbox.removeChild (array [i][0]);            
      listbox.appendChild (array [i][0]);            
    }
  },
    
  /**
   * NG カタログを選択したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onSelectNGCat : function (event) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_list");
    if (Aima_AimaniOptions.mode == 2) {
      Aima_AimaniUIUtil.onSelectList (event);
    }
    var selectedItem = Aima_AimaniOptions.getSelectedItem (event, listbox);
        
    if (Aima_AimaniOptions.getSelectedIndex (listbox) != -1) {
      var value = Aima_AimaniOptions.getNGCatItem (selectedItem);
            
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_width").value = value [0];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_height").value = value [1];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_hash").value = value [2];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_comment").value
        = value [3];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_count").value = value [4];
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_date_value").value = value [5];
      r = Aima_AimaniOptions.dateToReadable (value [5], false);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_date").value = r;
            
      var selectedCount = Aima_AimaniOptions.getSelectedCount (listbox);
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_cat_modify").disabled
          = (selectedCount > 1);
      }
      else {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_cat_modify").disabled
          = (selectedCount > 1) ? "disabled" : "";
      }
    }
  },
    
  /* -- NG カタログ -- ここまで -- */
  /* -- NG 番号 -- ここから -- */
    
  /**
   * NG 番号を読み込む
   *
   * @param Object map
   *        設定のマップ
   *        prefs.js から読む場合は null
   *        <String 設定名, String 設定値>
   */
  loadNGNumber : function (map) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
    Aima_AimaniOptions.clearListitem (listbox);
        
    var tmp
    = Aima_AimaniOptions
    .initPref (map, "char", "aima_aimani.ng_number.list", "");
    if (tmp != "") {
      /* 値を解析するだけなので代入はしない */
      tmp.replace
        (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*),?/g,
         function (matched,
                   number, server, dir, depend, reason, image) {
          Aima_AimaniOptions
            .addNGNumberItem (parseInt (unescape (number)),
                              unescape (server),
                              unescape (dir),
                              unescape (depend),
                              parseInt (unescape (reason)),
                              parseInt (unescape (image)),
                              null);
          return "";
        });
    }
  },
    
  /**
   * NG 番号を保存する
   *
   * @param  nsIFileOutputStream/HTMLTextAreaElement fstream
   *         保存先のファイル
   *         prefs.js に保存する場合は null
   */
  saveNGNumber : function (fstream) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
        
    var ng_word
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word").checked;
    var ng_thumbnail
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail").checked;
    var ng_cat = false;
    if (Aima_AimaniOptions.mode == 1) {
      ng_cat
        = document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat").checked;
    }
    var text_thread
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "text_thread").checked;
        
    var tmp = "";
    var node = Aima_AimaniOptions.getFirstItem (listbox);
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        var value = Aima_AimaniOptions.getNGNumberItem (node);
                
        if (!ng_word && value [4] == 1) {
          node = nextNode;
          continue;
        }
        if (!ng_thumbnail && value [4] == 2) {
          node = nextNode;
          continue;
        }
        if (!ng_cat && value [4] == 6) {
          node = nextNode;
          continue;
        }
        if (!text_thread && value [4] == 3) {
          node = nextNode;
          continue;
        }
                
        if (tmp != "") {
          tmp += ",";
        }
                
        tmp
          += escape (value [0]) + "&" + escape (value [1])
          + "&" + escape (value [2]) + "&" + escape (value [3])
          + "&" + escape (value [4]) + "&" + escape (value [5]);
      }
      node = nextNode;
    }
    Aima_AimaniOptions
    .setPref (fstream, "char", "aima_aimani.ng_number.list", tmp);
  },
    
  /**
   * NG 番号を取得する
   *
   * @param  Listitem/HTMLTableRowElement listitem
   *         対象の項目
   * @return Array
   *         NG 番号
   *           [Number NG 番号,
   *            String サーバ名, String ディレクトリ名,
   *            String 追加情報, Number 種類, Number 画像の番号]
   */
  getNGNumberItem : function (listitem) {
    var listcell_number = listitem.firstChild;
    var listcell_image  = listcell_number.nextSibling;
    var listcell_board  = listcell_image.nextSibling;
    var listcell_reason = listcell_board.nextSibling;
    var listcell_depend = listcell_reason.nextSibling;
        
    var server = listcell_board.getAttribute (Aima_AimaniOptions.attrName);
    var dir = "";
    if (server.match (/^([^:]+):(.+)$/)) {
      server = RegExp.$1;
      dir = RegExp.$2;
    }
        
    return new Array (listcell_number.getAttribute
                      (Aima_AimaniOptions.attrName),
                      server,
                      dir,
                      listcell_depend.getAttribute
                      (Aima_AimaniOptions.attrName),
                      parseInt (listcell_reason.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      parseInt (listcell_image.getAttribute
                                (Aima_AimaniOptions.attrName)));
  },
    
  /**
   * NG 番号を追加する
   *
   * @param  Number number
   *         NG 番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @param  String depend
   *         追加情報
   * @param  Number type
   *         種類
   * @param  Number imageNum
   *         画像の番号
   * @param  XULElement/HTMLElement listitem
   *         置き換えるノード
   *         追加する場合は null
   */
  addNGNumberItem : function (number, server, dir, depend, type, imageNum,
                              listitem) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
    var listcell;
    var typeList = [
      "\u901A\u5E38",
      "NG \u30EF\u30FC\u30C9",
      "NG \u30B5\u30E0\u30CD",
      "\u6587\u5B57\u30B9\u30EC",
      "",
      "",
      "NG \u30AB\u30BF\u30ED\u30B0",
      "",
      "",
      "\u5F37\u5236\u8868\u793A"
      ];
        
    var append = false;
        
    if (listitem == null) {
      append = true;
            
      listitem = document.createElement (Aima_AimaniOptions.itemName);
      if (Aima_AimaniOptions.mode == 2) {
        Aima_Aimani.addEventListener
          (listitem,
           "click",
           function () {
            Aima_AimaniOptions
              .onSelectNGNumber (arguments [0]);
          }, false);
      }
            
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
    }
        
    listcell = listitem.firstChild;
    Aima_AimaniOptions.setItem (listcell, 0, number, number);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0,
                                imageNum ? imageNum : "\u306A\u3057",
                                imageNum);
        
    var label
    = Aima_AimaniServerName [server + ":" + dir]
    || (server + ":" + dir);
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, label, server + ":" + dir);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, typeList [parseInt (type)],
                                type);
        
    listcell = listcell.nextSibling;
    if (type == 1) {
      Aima_AimaniOptions.setItem (listcell, 0, depend, depend);
    }
    else if (type == 2 && depend.match (/^(.+)_(.+)_(.+)_(.+)$/)) {
      Aima_AimaniOptions.setItem (listcell, 0, RegExp.$1 + "x" + RegExp.$2
                                  + "_" + RegExp.$3 + "B." + RegExp.$4,
                                  depend);
    }
    else if (type == 6 && depend.match (/^(.+)_(.+)_(.+)$/)) {
      Aima_AimaniOptions.setItem (listcell, 0, RegExp.$1 + "x" + RegExp.$2
                                  + "_" + RegExp.$3,
                                  depend);
    }
    else {
      Aima_AimaniOptions.setItem (listcell, 0, " ", depend);
    }
        
    if (append) {
      listbox.appendChild (listitem);
    }
  },
    
  /**
   * NG 番号を追加するボタンのイベント
   *
   * @param  Boolean modify
   *         修正するか追加するか
   *           true: 修正
   *           false: 追加
   */
  onAddNGNumber : function (modify) {
    var text
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_number").value;
    var server
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_server").value;
    var dir = "";
        
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_illegal").value = "";
    }
    else {
      Aima_Aimani
      .setText (document
                .getElementById (Aima_AimaniOptions.prefix
                                 + "ng_number_illegal"), "");
    }
            
    if (server.match (/^([^:]+):(.+)$/)) {
      server = RegExp.$1;
      dir = RegExp.$2;
    }
    else {
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_number_illegal").value
        = "\u677F\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093";
      }
      else {
        Aima_Aimani
        .setText (document
                  .getElementById (Aima_AimaniOptions.prefix
                                   + "ng_number_illegal"),
                  "\u677F\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
      }
            
      return;
    }
        
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
    var exist = false;
        
    if (text.match (/^([0-9]+)$/)) {
      var num = parseInt (RegExp.$1);
            
      var nextNode = null;
      var node = null;
      if (modify) {
        node = listbox.firstChild;
        while (node) {
          if (Aima_AimaniOptions.isListitem (node)) {
            if (Aima_AimaniOptions.isSelected (node)) {
              break;
            }
          }
          node = node.nextSibling;
        }
      }
            
      var node2 = Aima_AimaniOptions.getFirstItem (listbox);
      while (node2) {
        var nextNode2 = node2.nextSibling;
        if (Aima_AimaniOptions.isListitem (node2)) {
          var value = Aima_AimaniOptions.getNGNumberItem (node2);
          if (num == value [0] && server == value [2]
              && dir == value [3]
              && node2 != node) {
            exist = true;
            break;
          }
        }
        node2 = nextNode2;
      }
            
      if (!exist) {
        Aima_AimaniOptions.addNGNumberItem (num,
                                            server, dir, "", 0, 0,
                                            node);
        if (node == null) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_number_number").value = "";
        }
      }
      else {
        if (Aima_AimaniOptions.mode == 1) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_number_illegal").value
            = "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059";
        }
        else {
          Aima_Aimani
            .setText (document
                      .getElementById (Aima_AimaniOptions.prefix
                                       + "ng_number_illegal"),
                      "\u540C\u3058 NG \u756A\u53F7\u304C\u3042\u308A\u307E\u3059");
        }
      }
    }
    else {
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_number_illegal").value
        = "\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059";
      }
      else {
        Aima_Aimani
        .setText (document
                  .getElementById (Aima_AimaniOptions.prefix
                                   + "ng_number_illegal"),
                  "\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059");
      }
    }
  },
    
  /**
   * NG 番号を削除するボタンのイベント
   */
  onDeleteNGNumber : function () {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
        
    var node = listbox.firstChild;
        
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          listbox.removeChild (node);
        }
      }
      node = nextNode;
    }
            
    if (Aima_AimaniOptions.mode == 2) {
      if (Aima_Aimani.isOpera
          && "version" in window.opera
          && window.opera.version ().match (/^9/)) {
        window.scrollBy (0, 0);
      }
    }
  },
    
  /**
   * NG 番号を選択したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onSelectNGNumber : function (event) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_list");
    if (Aima_AimaniOptions.mode == 2) {
      Aima_AimaniUIUtil.onSelectList (event);
    }
    var selectedItem = Aima_AimaniOptions.getSelectedItem (event, listbox);
        
    if (Aima_AimaniOptions.getSelectedIndex (listbox) != -1) {
      var value = Aima_AimaniOptions.getNGNumberItem (selectedItem);
            
      document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_number_number").value = value [0];
            
      var menu = document.getElementById (Aima_AimaniOptions.prefix
                                          + "ng_number_server");
      Aima_AimaniOptions.selectMenu (menu, value [1] + ":" + value [2]);
            
      var selectedCount = Aima_AimaniOptions.getSelectedCount (listbox);
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_number_modify").disabled
          = (selectedCount > 1);
      }
      else {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "ng_number_modify")
          .disabled = (selectedCount > 1) ? "disabled" : "";
      }
    }
  },
    
  /* -- NG 番号 -- ここまで -- */
  /* -- スレッドルール -- ここから -- */
    
  /**
   * スレッドルールを読み込む
   *
   * @param Object map
   *        設定のマップ
   *        prefs.js から読む場合は null
   *        <String 設定名, String 設定値>
   */
  loadThreadRule : function (map) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_list");
    Aima_AimaniOptions.clearListitem (listbox);
        
    var tmp
    = Aima_AimaniOptions
    .initPref (map, "char", "aima_aimani.thread_rule.list", "");
    if (tmp != "") {
      /* 値を解析するだけなので代入はしない */
      tmp.replace
        (/([^&,]*)&([^&,]*)&([^&,]*)&([^&,]*),?/g,
         function (matched, number, server, dir, rule) {
          Aima_AimaniOptions
            .addThreadRuleItem (parseInt (unescape (number)),
                                unescape (server),
                                unescape (dir),
                                parseInt (unescape (rule)),
                                null);
          return "";
        });
    }
  },
    
  /**
   * スレッドルールを保存する
   *
   * @param  nsIFileOutputStream/HTMLTextAreaElement fstream
   *         保存先のファイル
   *         prefs.js に保存する場合は null
   */
  saveThreadRule : function (fstream) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_list");
        
    var tmp = "";
    var node = Aima_AimaniOptions.getFirstItem (listbox);
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        var value = Aima_AimaniOptions.getThreadRuleItem (node);
                
        if (tmp != "") {
          tmp += ",";
        }
                
        tmp
          += escape (value [0]) + "&" + escape (value [1])
          + "&" + escape (value [2]) + "&" + escape (value [3]);
      }
      node = nextNode;
    }
    Aima_AimaniOptions
    .setPref (fstream, "char", "aima_aimani.thread_rule.list", tmp);
  },
    
  /**
   * スレッドルールを取得する
   *
   * @param  Listitem/HTMLTableRowElement listitem
   *         対象の項目
   * @return Array
   *         スレッドルール
   *           [Number NG 番号, String サーバ名, String ディレクトリ名,
   *            Number スレッドルール]
   */
  getThreadRuleItem : function (listitem) {
    var listcell_number     = listitem.firstChild;
    var listcell_board      = listcell_number.nextSibling;
    var listcell_text_res   = listcell_board.nextSibling;
    var listcell_image_res  = listcell_text_res.nextSibling;
    var listcell_sage_only  = listcell_image_res.nextSibling;
    var listcell_not_sage   = listcell_sage_only.nextSibling;
    var listcell_mini_thumb = listcell_not_sage.nextSibling;
        
    var server = listcell_board.getAttribute (Aima_AimaniOptions.attrName);
    var dir = "";
    if (server.match (/^([^:]+):(.+)$/)) {
      server = RegExp.$1;
      dir = RegExp.$2;
    }
        
    return new Array (parseInt (listcell_number.getAttribute
                                (Aima_AimaniOptions.attrName)),
                      server,
                      dir,
                      listcell_text_res.getAttribute
                      (Aima_AimaniOptions.attrName));
  },
    
  /**
   * スレッドルールを追加する
   *
   * @param  Number number
   *         NG 番号
   * @param  String server
   *         サーバ名
   * @param  String dir
   *         ディレクトリ名
   * @param  Number rule
   *         ルール
   *           1: 文字レス非表示
   *           2: sage のみ表示
   *           4: sage 以外表示
   *           8: サムネを小さく表示
   *          16: 画像レス非表示
   * @param  XULElement listitem
   *         置き換えるノード
   *         追加する場合は null
   */
  addThreadRuleItem : function (number, server, dir, rule, listitem) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_list");
    var listcell;
    var input;
    var append = false;
        
    if (listitem == null) {
      append = true;
            
      listitem = document.createElement (Aima_AimaniOptions.itemName);
      if (Aima_AimaniOptions.mode == 2) {
        Aima_Aimani.addEventListener
          (listitem,
           "click",
           function () {
            Aima_AimaniOptions
              .onSelectThreadRule (arguments [0]);
          }, false);
      }
            
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "text_res";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckThreadRuleItem
              (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "image_res";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckThreadRuleItem
              (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "sage_only";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckThreadRuleItem
              (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "not_sage";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckThreadRuleItem
              (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
      listcell = document.createElement (Aima_AimaniOptions.cellName);
      if (Aima_AimaniOptions.mode == 2) {
        listcell.style.fontSize = "9pt";
        listcell.style.padding = "0em 0.4em 0em 0.4em";
        input = document.createElement ("input");
        input.className = Aima_AimaniOptions.prefix + "mini_thumb";
        input.type = "checkbox";
        Aima_Aimani.addEventListener
          (input,
           "click",
           function () {
            Aima_AimaniOptions.onCheckThreadRuleItem
              (arguments [0]);
          }, false);
        listcell.appendChild (input);
      }
      listitem.appendChild (listcell);
            
      if (Aima_AimaniOptions.mode == 1) {
        listitem.addEventListener
          ("mousedown",
           function () {
            Aima_AimaniOptions.onCheckThreadRuleItem (arguments [0]);
          }, false);
      }
      else if (Aima_Aimani.isIE) {
        listbox.appendChild (listitem);
      }
    }
        
    listcell = listitem.firstChild;
    Aima_AimaniOptions.setItem (listcell, 0, number, number);
        
    var label
    = Aima_AimaniServerName [server + ":" + dir]
    || (server + ":" + dir);
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 0, label, server + ":" + dir);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, rule, rule & 1);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, rule, rule & 16);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, rule, rule & 2);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, rule, rule & 4);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, rule, rule & 8);
        
    if (Aima_AimaniOptions.mode == 1) {
      if (append) {
        listbox.appendChild (listitem);
      }
    }
    else {
      if (append
          && !Aima_Aimani.isIE) {
        listbox.appendChild (listitem);
      }
    }
  },
    
  /**
   * スレッドルールを追加するボタンのイベント
   *
   * @param  Boolean modify
   *         修正するか追加するか
   *           true: 修正
   *           false: 追加
   */
  onAddThreadRule : function (modify) {
    var text
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_number").value;
    var server
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_server").value;
    var dir = "";
    var text_res
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_text_res").checked;
    var image_res
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_image_res").checked;
    var sage_only
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_sage_only").checked;
    var not_sage
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_not_sage").checked;
    var mini_thumb
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_mini_thumb").checked;
        
    var rule = 0;
        
    if (text_res) {
      rule |= 1;
    }
    if (image_res) {
      rule |= 16;
    }
    if (sage_only) {
      rule |= 2;
    }
    if (not_sage) {
      rule |= 4;
    }
    if (mini_thumb) {
      rule |= 8;
    }
       
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_illegal").value = "";
    }
    else {
      Aima_Aimani
      .setText (document
                .getElementById (Aima_AimaniOptions.prefix
                                 + "thread_rule_illegal"), "");
    }
        
    if (server.match (/^([^:]+):(.+)$/)) {
      server = RegExp.$1;
      dir = RegExp.$2;
    }
    else {
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "thread_rule_illegal").value
        = "\u677F\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093";
      }
      else {
        Aima_Aimani
        .setText (document
                  .getElementById (Aima_AimaniOptions.prefix
                                   + "thread_rule_illegal"),
                  "\u677F\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
      }
            
      return;
    }
        
    if (!rule) {
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "thread_rule_illegal").value
        = "\u30EB\u30FC\u30EB\u304C\u7A7A\u3067\u3059";
      }
      else {
        Aima_Aimani
        .setText (document
                  .getElementById (Aima_AimaniOptions.prefix
                                   + "thread_rule_illegal"),
                  "\u30EB\u30FC\u30EB\u304C\u7A7A\u3067\u3059");
      }
            
      return;
    }
        
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix + "thread_rule_list");
    var exist = false;
        
    if (text.match (/^([0-9]+)$/)) {
      var num = parseInt (RegExp.$1);
            
      var nextNode = null;
      var node = null;
      if (modify) {
        node = listbox.firstChild;
        while (node) {
          if (Aima_AimaniOptions.isListitem (node)) {
            if (Aima_AimaniOptions.isSelected (node)) {
              break;
            }
          }
          node = node.nextSibling;
        }
      }
            
      var node2 = Aima_AimaniOptions.getFirstItem (listbox);
      while (node2) {
        var nextNode2 = node2.nextSibling;
        if (Aima_AimaniOptions.isListitem (node2)) {
          var value = Aima_AimaniOptions.getThreadRuleItem (node2);
          if (num == value [0] && server == value [1]
              && dir == value [2]
              && node2 != node) {
            exist = true;
            break;
          }
        }
        node2 = nextNode2;
      }
            
      if (!exist) {
        Aima_AimaniOptions.addThreadRuleItem (num, server, dir, rule,
                                              node);
        if (node == null) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "thread_rule_number").value = "";
        }
      }
      else {
        if (Aima_AimaniOptions.mode == 1) {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "thread_rule_illegal").value
            = "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059";
        }
        else {
          Aima_Aimani
            .setText (document
                      .getElementById (Aima_AimaniOptions.prefix
                                       + "thread_rule_illegal"),
                      "\u540C\u3058 NG \u756A\u53F7\u304C\u3042\u308A\u307E\u3059");
        }
      }
    }
    else {
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "thread_rule_illegal").value
        = "\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059";
      }
      else {
        Aima_Aimani
        .setText (document
                  .getElementById (Aima_AimaniOptions.prefix
                                   + "thread_rule_illegal"),
                  "\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059");
      }
    }
  },
    
  /**
   * スレッドルールを削除するボタンのイベント
   */
  onDeleteThreadRule : function () {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_list");
        
    var node = listbox.firstChild;
        
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          listbox.removeChild (node);
        }
      }
      node = nextNode;
    }
        
    if (Aima_AimaniOptions.mode == 2) {
      if (Aima_Aimani.isOpera
          && "version" in window.opera
          && window.opera.version ().match (/^9/)) {
        window.scrollBy (0, 0);
      }
    }
  },
    
  /**
   * スレッドルールを選択したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onSelectThreadRule : function (event) {
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_list");
    if (Aima_AimaniOptions.mode == 2) {
      Aima_AimaniUIUtil.onSelectList (event);
    }
    var selectedItem = Aima_AimaniOptions.getSelectedItem (event, listbox);
        
    if (Aima_AimaniOptions.getSelectedIndex (listbox) != -1) {
      var value = Aima_AimaniOptions.getThreadRuleItem (selectedItem);
            
      document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_number").value = value [0];
            
      var menu = document.getElementById (Aima_AimaniOptions.prefix
                                          + "thread_rule_server");
      Aima_AimaniOptions.selectMenu (menu, value [1] + ":" + value [2]);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_text_res").checked
        = value [3] & 1;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_image_res").checked
        = value [3] & 16;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_sage_only").checked
        = value [3] & 2;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_not_sage").checked
        = value [3] & 4;
      document.getElementById (Aima_AimaniOptions.prefix
                               + "thread_rule_mini_thumb").checked
        = value [3] & 8;
            
      var selectedCount = Aima_AimaniOptions.getSelectedCount (listbox);
      if (Aima_AimaniOptions.mode == 1) {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "thread_rule_modify").disabled
          = (selectedCount > 1);
      }
      else {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "thread_rule_modify").disabled
          = (selectedCount > 1) ? "disabled" : "";
      }
    }
  },
    
  /**
   * スレッドルールの項目を変更したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onCheckThreadRuleItem : function (event) {
    var listitem;
    var target = null;
        
    if (Aima_AimaniOptions.mode == 1) {
      listitem = event.target;
      if (!Aima_AimaniOptions.isListitem (listitem)) {
        return;
      }
    }
    else {
      target = event.target;
      listitem = Aima_Aimani.findParentNode (target,
                                             Aima_AimaniOptions.itemName);
    }
        
    var value = Aima_AimaniOptions.getThreadRuleItem (listitem);
        
    if (Aima_AimaniOptions.mode == 1) {
      var listcell_number     = listitem.firstChild;
      var listcell_board      = listcell_number.nextSibling;
      var listcell_text_res   = listcell_board.nextSibling;
      var listcell_image_res  = listcell_text_res.nextSibling;
      var listcell_sage_only  = listcell_image_res.nextSibling;
      var listcell_not_sage   = listcell_sage_only.nextSibling;
      var listcell_mini_thumb = listcell_not_sage.nextSibling;
        
      if (event.clientX
          < listcell_number.boxObject.x
          + listcell_number.boxObject.width) {
        return;
      }
      else if (event.clientX
               < listcell_board.boxObject.x
               + listcell_board.boxObject.width) {
        return;
      }
      else if (event.clientX
               < listcell_text_res.boxObject.x
               + listcell_text_res.boxObject.width) {
        if (event.clientX
            < listcell_text_res.boxObject.x + 16) {
          value [3] = value [3] ^ 1;
        }
      }
      else if (event.clientX
               < listcell_image_res.boxObject.x
               + listcell_image_res.boxObject.width) {
        if (event.clientX
            < listcell_image_res.boxObject.x + 16) {
          value [3] = value [3] ^ 16;
        }
      }
      else if (event.clientX
               < listcell_sage_only.boxObject.x
               + listcell_sage_only.boxObject.width) {
        if (event.clientX
            < listcell_sage_only.boxObject.x + 16) {
          value [3] = value [3] ^ 2;
        }
      }
      else if (event.clientX
               < listcell_not_sage.boxObject.x
               + listcell_not_sage.boxObject.width) {
        if (event.clientX
            < listcell_not_sage.boxObject.x + 16) {
          value [3] = value [3] ^ 4;
        }
      }
      else if (event.clientX
               < listcell_mini_thumb.boxObject.x
               + listcell_mini_thumb.boxObject.width) {
        if (event.clientX
            < listcell_mini_thumb.boxObject.x + 16) {
          value [3] = value [3] ^ 8;
        }
      }
    }
    else {
      if (target.className == Aima_AimaniOptions.prefix + "text_res") {
        value [3] = value [3] ^ 1;
      }
      else if (target.className
               == Aima_AimaniOptions.prefix + "image_res") {
        value [3] = value [3] ^ 16;
      }
      else if (target.className
               == Aima_AimaniOptions.prefix + "sage_only") {
        value [3] = value [3] ^ 2;
      }
      else if (target.className
               == Aima_AimaniOptions.prefix + "not_sage") {
        value [3] = value [3] ^ 4;
      }
      else if (target.className
               == Aima_AimaniOptions.prefix + "mini_thumb") {
        value [3] = value [3] ^ 8;
      }
    }
        
    document.getElementById (Aima_AimaniOptions.prefix
                             + "thread_rule_text_res").checked
    = value [3] & 1;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "thread_rule_image_res").checked
    = value [3] & 16;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "thread_rule_sage_only").checked
    = value [3] & 2;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "thread_rule_not_sage").checked
    = value [3] & 4;
    document.getElementById (Aima_AimaniOptions.prefix
                             + "thread_rule_mini_thumb").checked
    = value [3] & 8;
        
    Aima_AimaniOptions.addThreadRuleItem (value [0], value [1],
                                          value [2], value [3],
                                          listitem);
  },
    
  /* -- スレッドルール -- ここまで -- */
    
  /**
   * 設定を読み込む
   *
   * @param Object map
   *        設定のマップ
   *        prefs.js から読む場合は null
   *        <String 設定名, String 設定値>
   */
  loadBoardSelect : function (map, prefPrefix, idPrefix) {
    var value;
        
    value
    = Aima_AimaniOptions
    .initPref (map, "char",
               "aima_aimani." + prefPrefix + "board_select.ex_list", "");
    var names = new Object ();
    var name;
    for (name in Aima_AimaniServerName) {
      names [name] = Aima_AimaniServerName [name];
    }
    var listbox, node;
    listbox = document.getElementById (Aima_AimaniOptions.prefix
                                       + idPrefix + "board_select_ex_list");
    Aima_AimaniOptions.clearListitem (listbox);
    listbox = document.getElementById (Aima_AimaniOptions.prefix
                                       + idPrefix + "board_select_in_list");
    Aima_AimaniOptions.clearListitem (listbox);
    var listitem, listcell;
    if (value != "") {
      listbox = document.getElementById (Aima_AimaniOptions.prefix
                                         + idPrefix
                                         + "board_select_ex_list");
      /* 値を解析するだけなので代入はしない */
      value.replace
        (/([^,]+),?/g,
         function (matched, part1) {
          name = unescape (part1);
          if (name in names
              && names [name]) {
            if (Aima_AimaniOptions.mode == 1) {
              listitem
                = document.createElement
                (Aima_AimaniOptions.itemName);
              listcell
                = document.createElement
                (Aima_AimaniOptions.cellName);
              listcell.setAttribute ("value", name);
              listcell.setAttribute ("label", names [name]);
            }
            else {
              listitem
                = document.createElement
                (Aima_AimaniOptions.itemName);
              Aima_Aimani.addEventListener
                (listitem,
                 "click",
                 function () {
                  Aima_AimaniUIUtil
                    .onSelectList (arguments [0]);
                }, false);
                            
              listcell
                = document.createElement
                (Aima_AimaniOptions.cellName);
              listcell.style.fontSize = "9pt";
              listcell.style.padding = "0em 0.4em 0em 0.4em";
              listcell.setAttribute ("name", name);
              listcell.appendChild
                (document.createTextNode (names [name]));
            }
                        
            names [name] = null;
            listitem.appendChild (listcell);
            listbox.appendChild (listitem);
          }
          return "";
        });
    }
    listbox = document.getElementById (Aima_AimaniOptions.prefix
                                       + idPrefix + "board_select_in_list");
    for (name in names) {
      if (names [name]) {
        if (Aima_AimaniOptions.mode == 1) {
          listitem
            = document.createElement (Aima_AimaniOptions.itemName);
          listcell
            = document.createElement (Aima_AimaniOptions.cellName);
          listcell.setAttribute ("value", name);
          listcell.setAttribute ("label", names [name]);
        }
        else {
          listitem
            = document.createElement (Aima_AimaniOptions.itemName);
          Aima_Aimani.addEventListener
            (listitem,
             "click",
             function () {
              Aima_AimaniUIUtil
                .onSelectList (arguments [0]);
            }, false);
                    
          listcell
            = document.createElement (Aima_AimaniOptions.cellName);
          listcell.style.fontSize = "9pt";
          listcell.style.padding = "0em 0.4em 0em 0.4em";
          listcell.setAttribute ("name", name);
          listcell.appendChild (document
                                .createTextNode (names [name]));
        }
        listitem.appendChild (listcell);
        listbox.appendChild (listitem);
      }
    }
  },
    
    
    
  /**
   * 動作する板を追加するボタンのイベント
   *
   * @param  String id_prefix
   *                リストのプレフィックス
   */
  onBoardSelectAdd : function (id_prefix) {
    var listbox_ex
    = document.getElementById (Aima_AimaniOptions.prefix
                               + id_prefix + "board_select_ex_list");
    var listbox_in
    = document.getElementById (Aima_AimaniOptions.prefix
                               + id_prefix + "board_select_in_list");
        
    var node = Aima_AimaniOptions.getFirstItem (listbox_ex);
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          listbox_ex.removeChild (node);
          listbox_in.appendChild (node);
        }
      }
      node = nextNode;
    }
  },
    
  /**
   * 動作する板を削除するボタンのイベント
   *
   * @param  String id_prefix
   *                リストのプレフィックス
   */
  onBoardSelectDelete : function (id_prefix) {
    var listbox_ex
    = document.getElementById (Aima_AimaniOptions.prefix
                               + id_prefix + "board_select_ex_list");
    var listbox_in
    = document.getElementById (Aima_AimaniOptions.prefix
                               + id_prefix + "board_select_in_list");
        
    var node = Aima_AimaniOptions.getFirstItem (listbox_in);
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          listbox_in.removeChild (node);
          listbox_ex.appendChild (node);
        }
      }
      node = nextNode;
    }
  },
    
  /**
   * 外部の板を追加するボタンのイベント
   *
   * @param  Boolean modify
   *         修正するか追加するか
   *           true: 修正
   *           false: 追加
   */
  onAddBoardExternal : function (modify) {
    var pattern = document.getElementById ("board_external_pattern").value;
    var flag = 0
    if (document.getElementById ("board_external_monaca").checked) {
      flag |= 1;
    }
    if (document.getElementById ("board_external_prefix").checked) {
      flag |= 2;
    }
    document.getElementById ("board_external_illegal").value = "";
        
    if ((flag & 2) == 0) {
      try {
        var tmp = "test";
        tmp.search (pattern);
      }
      catch (e) { Components.utils.reportError (e);
        document.getElementById ("board_external_illegal").value
          = "\u6B63\u898F\u8868\u73FE\u304C\u4E0D\u6B63\u3067\u3059";
                
        return;
      }
            
      var count = 0;
      pattern.replace (/\([^\)]*\)/g,
                       function (matched) {
                         count ++;
                       });
      if (count < 3) {
        document.getElementById ("board_external_illegal").value
          = "\u30AB\u30C3\u30B3\u306E\u6570\u304C\u8DB3\u308A\u307E\u305B\u3093";
                
        return;
      }
    }
        
    var listbox = document.getElementById ("board_external_list");
    var exist = false;
        
    if (pattern) {
      var nextNode = null;
      var node = null;
      if (modify) {
        var node = listbox.firstChild;
        while (node) {
          if (node.nodeName == "listitem") {
            if (node.selected) {
              break;
            }
          }
          node = node.nextSibling;
        }
      }
            
      var node2 = listbox.firstChild;
      while (node2) {
        var nextNode2 = node2.nextSibling;
                
        var value = Aima_AimaniOptions.getBoardExternalItem (node2);
        if (pattern == value [0] && flag == value [1]
            && node2 != node) {
          exist = true;
          break;
        }
        node2 = nextNode2;
      }
            
      if (!exist) {
        Aima_AimaniOptions.addBoardExternalItem (pattern, flag, node);
                
        if (node == null) {
          document.getElementById ("board_external_pattern").value
            = "";
        }
      }
      else {
        document.getElementById ("board_external_illegal").value
          = "\u540C\u3058\u30D1\u30BF\u30FC\u30F3\u304C\u3042\u308A\u307E\u3059";
      }
    }
    else {
      document.getElementById ("board_external_illegal").value
      = "\u30D1\u30BF\u30FC\u30F3\u304C\u7A7A\u3067\u3059";
    }
  },
    
  /**
   * 外部の板を削除するボタンのイベント
   */
  onDeleteBoardExternal : function () {
    var listbox = document.getElementById ("board_external_list");
        
    var node = listbox.firstChild;
    while (node) {
      var nextNode = node.nextSibling;
      if (node.selected) {
        listbox.removeChild (node);
      }
      node = nextNode;
    }
  },
    
  /**
   * 外部の板を選択したイベント
   */
  onSelectBoardExternal : function () {
    var listbox = document.getElementById ("board_external_list");
        
    if (listbox.selectedIndex != -1) {
      var value = Aima_AimaniOptions
        .getBoardExternalItem (listbox.selectedItem);
            
      document.getElementById ("board_external_pattern").value
        = value [0];
      document.getElementById ("board_external_monaca").checked
        = value [1] & 1;
      document.getElementById ("board_external_prefix").checked
        = value [1] & 2;
            
      document.getElementById ("board_external_modify").disabled
        = !document.getElementById ("board_external").checked
        || (listbox.selectedCount > 1);
    }
  },
    
  /**
   * 外部の板を取得する
   *
   * @param  Listitem listitem 
   *         対象の項目
   * @return Array
   *         外部の板
   *           [String パターン,
   *            String monaca.php ならば "o" そうでなければ "x"]
   */
  getBoardExternalItem : function (listitem) {
    var listcell_pattern = listitem.firstChild;
    var listcell_monaca  = listcell_pattern.nextSibling;
    return new Array (listcell_pattern.getAttribute ("value"),
                      listcell_monaca.getAttribute ("value"));
  },
    
  /**
   * 外部の板を追加する
   *
   * @param  String pattern
   *         パターン
   * @param  Number flag
   *         フラグ
   * @param  XULElement listitem
   *         置き換えるノード
   *         追加する場合は null
   */
  addBoardExternalItem : function (pattern, flag, listitem) {
    var listbox = document.getElementById ("board_external_list");
    var listcell;
    var append = false;
        
    if (listitem == null) {
      append = true;
      listitem = document.createElement ("listitem");
            
      listcell = document.createElement ("listcell");
      listitem.appendChild (listcell);
      listcell = document.createElement ("listcell");
      listitem.appendChild (listcell);
      listcell = document.createElement ("listcell");
      listitem.appendChild (listcell);
            
      listitem.addEventListener
        ("mousedown",
         function () {
          Aima_AimaniOptions.onMouseDownBoardExternal (arguments [0]);
        }, false);
    }
        
    var listcell = listitem.firstChild;
    Aima_AimaniOptions.setItem (listcell, 0, pattern, pattern);
        
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, flag, flag & 1);
    listcell = listcell.nextSibling;
    Aima_AimaniOptions.setItem (listcell, 1, flag, flag & 2);
        
    if (append) {
      listbox.appendChild (listitem);
    }
  },
    
  /**
   * 外部の板の項目を押したイベント
   *
   * @param  Event event
   *         対象のイベント
   */
  onMouseDownBoardExternal : function (event) {
    var listitem = event.target;
    if (listitem.nodeName.toLowerCase () != "listitem") {
      return;
    }
        
    var listcell_pattern = listitem.firstChild;
    var listcell_monaca  = listcell_pattern.nextSibling;
    var listcell_prefix  = listcell_monaca.nextSibling;
        
    var value = Aima_AimaniOptions.getBoardExternalItem (listitem);
        
    if (event.clientX
        < listcell_pattern.boxObject.x
        + listcell_pattern.boxObject.width) {
      return;
    }
    else if (event.clientX
             < listcell_monaca.boxObject.x
             + listcell_monaca.boxObject.width) {
      if (event.clientX
          < listcell_monaca.boxObject.x + 16) {
        value [1] = value [1] ^ 1;
      }
    }
    else if (event.clientX
             < listcell_prefix.boxObject.x
             + listcell_prefix.boxObject.width) {
      if (event.clientX
          < listcell_prefix.boxObject.x + 16) {
        value [1] = value [1] ^ 2;
      }
    }
        
    document.getElementById ("board_external_pattern").value
    = value [0];
    document.getElementById ("board_external_monaca").checked
    = value [1] & 1;
    document.getElementById ("board_external_prefix").checked
    = value [1] & 2;
        
    Aima_AimaniOptions.addBoardExternalItem (value [0], value [1],
                                             listitem);
  },
    
  /**
   * NG 番号のサーバのメニュー項目を設定する
   *
   * @param Menupopup/HTMLSelectElement menu
   *        対象のメニュー
   */
  initMenu : function (menu) {
    var menuItem;
        
    if (Aima_AimaniOptions.mode == 1) {
      for (var name in Aima_AimaniServerName) {
        menuItem = document.createElement ("menuitem");
        menuItem.setAttribute ("label", Aima_AimaniServerName [name]);
        menuItem.setAttribute ("value", name);
        menu.firstChild.appendChild (menuItem);
      }
      menu.selectedIndex = 0;
    }
    else {
      var first = true;
            
      for (var name in Aima_AimaniServerName) {
        menuItem = document.createElement ("option");
        var label = Aima_AimaniServerName [name];
        menuItem.appendChild (document.createTextNode (label));
        menuItem.value = name;
        if (first) {
          menuItem.selected = "selected";
          first = false;
        }
        menu.appendChild (menuItem);
      }
    }
  },
    
  /**
   * 設定を保存する
   *
   * @param  nsIFileOutputStream/HTMLTextAreaElement fstream
   *         保存先のファイル
   *         prefs.js に保存する場合は null
   * @param  String type
   *         設定の種類
   *          "bool"
   *          "char"
   *          "int"
   * @param  String name
   *         設定名
   * @param  Boolean/String/Number value
   *         既定値
   */
  setPref : function (fstream, type, name, value) {
    if (fstream == null) {
      if (Aima_AimaniOptions.prefBranch == null) {
        if (Aima_AimaniOptions.mode == 1) {
          if (Components.interfaces.nsIPrefBranch2) {
            Aima_AimaniOptions.prefBranch
            = Components
            .classes ["@mozilla.org/preferences-service;1"]
            .getService (Components.interfaces.nsIPrefBranch2);
          }
          else {
            Aima_AimaniOptions.prefBranch
            = Components
            .classes ["@mozilla.org/preferences-service;1"]
            .getService (Components.interfaces.nsIPrefBranch);
          }
        }
        else {
          Aima_AimaniOptions.prefBranch = Aima_AimaniConfigManager.prefBranch;
        }
      }
      
      ; /* switch のインデント用 */
      switch (type) {
        case "bool":
          Aima_AimaniOptions.prefBranch.setBoolPref (name, value);
          break;
        case "char":
          Aima_AimaniOptions.prefBranch.setCharPref (name, value);
          break;
        case "int":
          Aima_AimaniOptions.prefBranch.setIntPref (name, value);
          break;
      }
    }
    else {
      if (Aima_AimaniOptions.mode == 1) {
        var line = escape (name) + "," + escape (value) + "\r\n";
        fstream.write (line, line.length);
      }
      else {
        fstream.value
        += escape (name) + "," + escape (value) + "\r\n";
      }
    }
  },
    
  /**
   * 設定を保存する
   *
   * @param  nsIFileOutputStream/HTMLTextAreaElement fstream
   *         保存先のファイル
   *         prefs.js に保存する場合は null
   * @return Boolean
   *         成功フラグ
   */
  savePrefs : function (fstream) {
    var value;
        
    if (fstream) {
      Aima_AimaniOptions
        .setPref (fstream, "char", "aima_aimani.version",
                  Aima_AimaniVersion);
    }
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.all",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "all").checked);
        
    if (Aima_AimaniOptions.mode == 1) {
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.statusbar.preferences",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "statusbar_preferences")
                  .checked);
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.statusbar.ng_word",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "statusbar_ng_word")
                  .checked);
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.toolbar.preferences",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "toolbar_preferences")
                  .checked);
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.toolbar.ng_word",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "toolbar_ng_word")
                  .checked);
    }
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.hide_warning",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "hide_warning").checked);
    if (Aima_AimaniOptions.mode == 1) {
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.hide_style",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "hide_style").checked);
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.hide_thread_style",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "hide_thread_style").checked);
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.hide_cat_style",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "hide_cat_style").checked);
    }
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.catalogue_unlink",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "catalogue_unlink").checked);
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.show_textthread_reply",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "show_textthread_reply")
              .checked);
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.popup_message",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "popup_message").checked);
    value   = document.getElementById (Aima_AimaniOptions.prefix
                                       + "popup_message_delay_show").value;
    Aima_AimaniOptions
    .setPref (fstream, "int",  "aima_aimani.popup_message.delay.show",
              parseInt (value));
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.bracket",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "bracket").checked);
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.easyng",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "easyng").checked);
    Aima_AimaniOptions
    .setPref (fstream, "char", "aima_aimani.easyng.type",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "easyng_type").value);
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.easyng.startup",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "easyng_startup").checked);
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.hide_entire_thread",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "hide_entire_thread").checked);
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.hide_entire_res",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "hide_entire_res").checked);
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.hide_entire_res_instant",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "hide_entire_res_instant")
              .checked);
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.ng_word",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_word").checked);
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.ng_word.cont",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_word_cont").checked);
    value
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_cont_length").value;
    Aima_AimaniOptions
    .setPref (fstream, "int", "aima_aimani.ng_word.cont.length",
              parseInt (value));
    value
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_cont_count").value;
    Aima_AimaniOptions
    .setPref (fstream, "int", "aima_aimani.ng_word.cont.count",
              parseInt (value));
    Aima_AimaniOptions.saveNGWord (fstream);
        
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_word_board_select_ex_list");
    value = "";
    var node = Aima_AimaniOptions.getFirstItem (listbox);
    while (node) {
      if (value != "") {
        value += ",";
      }
            
      value += node.firstChild.getAttribute
        (Aima_AimaniOptions.attrName);
            
      node = node.nextSibling;
    }
    Aima_AimaniOptions
    .setPref (fstream, "char",
              "aima_aimani.ng_word.board_select.ex_list",
              value);
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.ng_thumbnail",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_thumbnail").checked);
    Aima_AimaniOptions.saveNGThumbnail (fstream);
    var listbox
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_thumbnail_board_select_ex_list");
    value = "";
    var node = Aima_AimaniOptions.getFirstItem (listbox);
    while (node) {
      if (value != "") {
        value += ",";
      }
            
      value += node.firstChild.getAttribute
        (Aima_AimaniOptions.attrName);
            
      node = node.nextSibling;
    }
    Aima_AimaniOptions
    .setPref (fstream, "char",
              "aima_aimani.ng_thumbnail.board_select.ex_list",
              value);

    if (Aima_AimaniOptions.mode == 1) {
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.ng_cat",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "ng_cat").checked);
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.ng_cat.no_button",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "ng_cat_no_button")
                  .checked);
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.ng_cat.auto",
                  document.getElementById (Aima_AimaniOptions.prefix
                                           + "ng_cat_auto")
                  .checked);
      value = document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_cat_auto_threshold").value
        Aima_AimaniOptions
        .setPref (fstream, "int",  "aima_aimani.ng_cat.auto.threshold",
                  parseInt (value));
      Aima_AimaniOptions.saveNGCat (fstream);
            
      listbox
        = document.getElementById (Aima_AimaniOptions.prefix
                                   + "ng_cat_board_select_ex_list");
      value = "";
      var node = Aima_AimaniOptions.getFirstItem (listbox);
      while (node) {
        if (value != "") {
          value += ",";
        }
                
        value += node.firstChild.getAttribute
          (Aima_AimaniOptions.attrName);
                
        node = node.nextSibling;
      }
      Aima_AimaniOptions
        .setPref (fstream, "char",
                  "aima_aimani.ng_cat.board_select.ex_list",
                  value);
    }
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.ng_number",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_number").checked);
    value   = document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_number_expire").value;
    Aima_AimaniOptions
    .setPref (fstream, "int",  "aima_aimani.ng_number.expire",
              parseInt (value));
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.ng_number.catalogue",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_number_catalogue").checked);
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.ng_number.bottom",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_number_bottom").checked);
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.ng_number.selection",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "ng_number_selection").checked);
    Aima_AimaniOptions.saveNGNumber (fstream);
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.thread_rule",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "thread_rule").checked);
    value   = document.getElementById (Aima_AimaniOptions.prefix
                                       + "thread_rule_expire").value;
    Aima_AimaniOptions
    .setPref (fstream, "int",  "aima_aimani.thread_rule.expire",
              parseInt (value));
    value   = document.getElementById (Aima_AimaniOptions.prefix
                                       + "thread_rule_mini_thumb_size")
    .value;
    Aima_AimaniOptions
    .setPref (fstream, "int",  "aima_aimani.thread_rule.mini_thumb.size",
              parseInt (value));
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.thread_rule.mini_thumb.hover",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "thread_rule_mini_thumb_hover")
              .checked);
    Aima_AimaniOptions.saveThreadRule (fstream);
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.mini_thumb",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "mini_thumb").checked);

    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.text_thread",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "text_thread").checked);
        
    Aima_AimaniOptions
    .setPref (fstream, "bool", "aima_aimani.board_select",
              document.getElementById (Aima_AimaniOptions.prefix
                                       + "board_select").checked);
    listbox = document.getElementById (Aima_AimaniOptions.prefix
                                       + "board_select_ex_list");
    value = "";
    var node = Aima_AimaniOptions.getFirstItem (listbox);
    while (node) {
      if (value != "") {
        value += ",";
      }
            
      value += node.firstChild.getAttribute (Aima_AimaniOptions.attrName);
            
      node = node.nextSibling;
    }
    Aima_AimaniOptions
    .setPref (fstream, "char", "aima_aimani.board_select.ex_list",
              value);
        
    if (Aima_AimaniOptions.mode == 1) {
      Aima_AimaniOptions
        .setPref (fstream, "bool", "aima_aimani.board_external",
                  document.getElementById ("board_external").checked);
      listbox = document.getElementById ("board_external_list");
      var tmp = "";
      node = listbox.firstChild;
      while (node) {
        var nextNode = node.nextSibling;
        if (node.nodeName == "listitem") {
          value = Aima_AimaniOptions.getBoardExternalItem (node);
                
          if (tmp != "") {
            tmp += ",";
          }
                
          tmp
            += escape (value [0])
            + "&" + escape (value [1]);
        }
        node = nextNode;
      }
      Aima_AimaniOptions
        .setPref (fstream,
                  "char", "aima_aimani.board_external.patterns",
                  tmp);
    }
        
    if (Aima_AimaniOptions.mode == 1) {
      Aima_AimaniOptions
      .setPref (fstream, "char", "aima_aimani.savepref",
                new Date ().getTime ());
            
      if (fstream == null) {
        var prefService
          = Components.classes ["@mozilla.org/preferences-service;1"].
          getService (Components.interfaces.nsIPrefService);
            
        prefService.savePrefFile (null);
      }
    }
    else {
      if (fstream == null) {
        Aima_AimaniConfigManager.prefBranch.saveAllPrefs ();
                
        var configbox
        = document.getElementById ("aima_aimani_configbox");
        configbox.style.display = "none";
        Aima_Aimani.setText (configbox, null);
                
        Aima_AimaniConfigManager.getConfigurationFromPreferencesAll ();
        Aima_AimaniConfigManager.getConfigurationFromPreferences ();
      }
    }
        
    return true;
  },
    
  /**
   * キーが押されたイベント
   *
   * @param  Event event
   *         対象のイベント
   * @param  Function func
   *         削除関数
   */
  onKeyDown : function (event, func) {
    if (event.keyCode == 8 || event.keyCode == 46) {
      func ();
    }
  },
    
  /**
   * リストの選択項目を上にずらすボタンのイベント
   *
   * @param  String id
   *         リストの id
   */
  onMoveupList : function (id) {
    var listbox = document.getElementById (Aima_AimaniOptions.prefix
                                           + id);
        
    var node = listbox.firstChild;
    var nextNode = null;
    var prevNode = null;
    while (node) {
      nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          if (prevNode) {
            Aima_AimaniOptions.swapItem (listbox,
                                         node, prevNode, true);
            prevNode = node;
          }
        }
        else {
          prevNode = node;
        }
      }
      node = nextNode;
    }
  },
    
  /**
   * リストの選択項目を下にずらすボタンのイベント
   *
   * @param  String id
   *         リストの id
   */
  onMovedownList : function (id) {
    var listbox = document.getElementById (Aima_AimaniOptions.prefix + id);
        
    var node = listbox.lastChild;
    var nextNode = null;
    var prevNode = null;
    while (node) {
      prevNode = node.previousSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        if (Aima_AimaniOptions.isSelected (node)) {
          if (nextNode) {
            Aima_AimaniOptions.swapItem (listbox,
                                         node, nextNode, true);
            nextNode = node;
          }
        }
        else {
          nextNode = node;
        }
      }
      node = prevNode;
    }
  },
    
  /* 親のチェックボックスの状態で子の操作不可を設定する - ここから - */
    
  checkNGCatAuto : function () {
    document.getElementById (Aima_AimaniOptions.prefix
                             + "ng_cat_auto_threshold").disabled
    = document.getElementById (Aima_AimaniOptions.prefix
                               + "ng_cat_auto_label").disabled
    = !document.getElementById (Aima_AimaniOptions.prefix
                                + "ng_cat_auto").checked;
  },
    
  checkPopupMessage : function () {
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "popup_message_delay_show").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "popup_message_delay_show_label1")
      .disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "popup_message_delay_show_label2")
      .disabled
      = !document.getElementById (Aima_AimaniOptions.prefix
                                  + "popup_message").checked;
    }
    else {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "popup_message_delay_show").disabled
      = (!document.getElementById (Aima_AimaniOptions.prefix
                                   + "popup_message").checked)
      ? "disabled" : "";
    }
  },
    
  checkHideEntireRes : function () {
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "hide_entire_res_instant").disabled
      = !document.getElementById (Aima_AimaniOptions.prefix
                                  + "hide_entire_res").checked;
    }
    else {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "hide_entire_res_instant").disabled
      = (!document.getElementById (Aima_AimaniOptions.prefix
                                   + "hide_entire_res").checked)
      ? "disabled" : "";
    }
  },

  checkBoardSelect : function () {
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "board_select_in_list").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "board_select_ex_list").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "board_select_add").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "board_select_delete").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "board_select_in_label").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "board_select_ex_label").disabled
      = !document.getElementById (Aima_AimaniOptions.prefix
                                  + "board_select").checked;
    }
    else {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "board_select_in_list").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "board_select_ex_list").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "board_select_add").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "board_select_delete").disabled
      = (!document.getElementById (Aima_AimaniOptions.prefix
                                   + "board_select").checked)
      ? "disabled" : "";
        
    }
  },
    
  checkEasyNG : function () {
    if (Aima_AimaniOptions.mode == 1) {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "easyng_type").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "easyng_startup").disabled
      = !document.getElementById (Aima_AimaniOptions.prefix
                                  + "easyng").checked;
    }
    else {
      document.getElementById (Aima_AimaniOptions.prefix
                               + "easyng_type").disabled
      = document.getElementById (Aima_AimaniOptions.prefix
                                 + "easyng_startup").disabled
      = (!document.getElementById (Aima_AimaniOptions.prefix
                                   + "easyng").checked)
      ? "disabled" : "";
    }
  },
    
  checkBoardExternal : function () {
    document.getElementById ("board_external_pattern_label").disabled
    = document.getElementById ("board_external_pattern").disabled
    = document.getElementById ("board_external_monaca").disabled
    = document.getElementById ("board_external_prefix").disabled
    = document.getElementById ("board_external_list").disabled
    = document.getElementById ("board_external_sample1").disabled
    = document.getElementById ("board_external_sample2").disabled
    = document.getElementById ("board_external_add").disabled
    = document.getElementById ("board_external_moveup").disabled
    = document.getElementById ("board_external_movedown").disabled
    = document.getElementById ("board_external_delete").disabled
    = !document.getElementById ("board_external").checked;
        
    document.getElementById ("board_external_modify").disabled
    = !document.getElementById ("board_external").checked
    || (document.getElementById ("board_external_list").selectedCount > 1);
  },
    
  /* 親のチェックボックスの状態で子の操作不可を設定する - ここまで - */
    
  /**
   * 項目の値を設定する
   *
   * @param  Listcell/HTMLTableCellElement listcell
   *         対象の項目
   * @param  Number type
   *         項目の種類
   *           0: 文字列
   *           1: チェックボックス
   * @param  String label
   *         項目のラベル
   * @param  String/Boolean value
   *         項目の値
   */
  setItem : function (listcell, type, label, value) {
    label = label + "";
    if (type == 0) {
      if (Aima_AimaniOptions.mode == 1) {
        listcell.setAttribute ("label", label);
        listcell.setAttribute ("value", value);
      }
      else {
        /* Aima_AimaniUIUtil.escapeEntity の結果に
         * エンティティ参照が含まれる可能性があるので innerHTML を使用する */
        listcell.innerHTML
          = Aima_AimaniUIUtil.escapeEntity (label);
        listcell.setAttribute ("name", value);
      }
    }
    else if (type == 1) {
      if (Aima_AimaniOptions.mode == 1) {
        listcell.setAttribute ("value", label);
        listcell.setAttribute ("class", "listcell-iconic");
        if (value) {
          listcell.setAttribute
            ("image",
             "chrome://aima_aimani/content/check_o.png");
        }
        else {
          listcell.setAttribute
          ("image",
           "chrome://aima_aimani/content/check_x.png");
        }
      }
      else {
        listcell.setAttribute ("name", label);
        if (value) {
          listcell.firstChild.checked = "checked";
        }
        else {
          listcell.firstChild.checked = "";
        }
      }
    }
  },
    
  /**
   * 項目が選択されているか
   *
   * @param  Listitem/HTMLTableRowElement listitem
   *         対象の項目
   * @return Boolean
   *         項目が選択されているか
   */
  isSelected : function (listitem) {
    if (Aima_AimaniOptions.mode == 1) {
      if (listitem.selected) {
        return true;
      }
    }
    else {
      if (listitem.firstChild.style.backgroundColor
          == "#3875d7"
          || listitem.firstChild.style.backgroundColor
          == "rgb(56, 117, 215)") {
        return true;
      }
    }
    return false;
  },
    
  /**
   * 選択されている項目の数を返す
   *
   * @param  Listbox/HTMLTableSectionElement listbox
   *         対象のリストボックス
   * @return Number
   *         選択されている項目の数
   */
  getSelectedCount : function (listbox) {
    if (Aima_AimaniOptions.mode == 1) {
      return listbox.selectedCount;
    }
    else {
      var selectedCount = 0;
            
      node = listbox.firstChild;
      while (node) {
        if (Aima_AimaniOptions.isSelected (node)) {
          selectedCount ++;
        }
        node = node.nextSibling;
      }
      return selectedCount;
    }
  },
    
  /**
   * 選択されている項目の位置を返す
   *
   * @param  Listbox/HTMLTableSectionElement listbox
   *         対象のリストボックス
   * @return Number
   *         選択されている項目の位置
   */
  getSelectedIndex : function (listbox) {
    if (Aima_AimaniOptions.mode == 1) {
      return listbox.selectedIndex;
    }
    else {
      return 0;
    }
  },
    
  /**
   * 選択されている項目を返す
   *
   * @param  Listbox/HTMLTableSectionElement listbox
   *         対象のリストボックス
   * @return Listitem/HTMLTableRowElement
   *         選択されている項目
   */
  getSelectedItem : function (event, listbox) { 
    if (Aima_AimaniOptions.mode == 1) {
      return listbox.selectedItem;
    }
    else {
      return Aima_Aimani.findParentNode (event.target,
                                         Aima_AimaniOptions.itemName);
    }
  },
    
  /**
   * 項目を全て削除する
   *
   * @param  Listbox/HTMLTableSectionElement listbox
   *         対象のリストボックス
   */
  clearListitem : function (listbox) {
    var node = listbox.firstChild;
    while (node) {
      var nextNode = node.nextSibling;
      if (Aima_AimaniOptions.isListitem (node)) {
        listbox.removeChild (node);
      }
      node = nextNode;
    }
  },
    
  /**
   * メニューの選択項目を変更する
   *
   * @param Menupopup/HTMLSelectElement menu
   *        対象のメニュー
   * @param String value
   *        選択する項目の値
   */
  selectMenu : function (menu, value) {
    if (Aima_AimaniOptions.mode == 1) {
      var i = 0;
      var node = menu.firstChild.firstChild;
      while (node) {
        if (node.getAttribute ("value") == value) {
          menu.selectedIndex = i;
          break;
        }
                
        node = node.nextSibling;
        i ++;
      }
    }
    else {
      var node = menu.firstChild;
      while (node) {
        if (node.value == value) {
          node.selected = "selected";
        }
        else {
          node.selected = "";
        }
                
        node = node.nextSibling;
      }
    }
  },
    
  /**
   * 最初の項目を取得する
   *
   * @param  Listbox/HTMLTableSectionElement listbox
   *         対象のリストボックス
   * @return Listitem/HTMLTableRowElement
   *         最初の項目
   */
  getFirstItem : function (listbox) { 
    if (Aima_AimaniOptions.mode == 1) {
      return listbox.firstChild;
    }
    else {
      return listbox.firstChild.nextSibling;
    }
  },
    
  /**
   * 項目がデータかどうか
   *
   * @param  Listitem/HTMLTableRowElement listitem
   *         対象の項目
   * @param  Boolean
   *         項目がデータかどうか
   *           true: データ
   *           false: ヘッダ
   */
  isListitem : function (listitem) {
    if (Aima_AimaniOptions.mode == 1) {
      return  (listitem.nodeName
               == Aima_AimaniOptions.itemName);
    }
    else {
      return (listitem.firstChild.nodeName.toLowerCase ()
              == Aima_AimaniOptions.cellName);
    }
  },
    
  /**
   * 項目を入れ替える
   *
   * @param  Listbox/HTMLTableSectionElement listbox
   *         対象のリストボックス
   * @param  Listitem/HTMLTableRowElement node1
   *         対象の項目
   * @param  Listitem/HTMLTableRowElement node2
   *         対象の項目
   * @param  Boolean toggle
   *         選択を反転するか
   */
  swapItem : function (listbox, node1, node2, toggle) {
    var tmp = "";
    var subnode1 = node1.firstChild;
    var subnode2 = node2.firstChild;
        
    while (subnode1 && subnode2) {
      tmp = subnode1.getAttribute (Aima_AimaniOptions.attrName);
      subnode1.setAttribute (Aima_AimaniOptions.attrName, 
                             subnode2.getAttribute
                             (Aima_AimaniOptions.attrName));
      subnode2.setAttribute (Aima_AimaniOptions.attrName, tmp);
            
      if (Aima_AimaniOptions.mode == 1) {
        if (subnode1.getAttribute ("class")
            == "listcell-iconic") {
          tmp = subnode1.getAttribute ("image");
          subnode1.setAttribute ("image",
                                 subnode2
                                 .getAttribute ("image"));
          subnode2.setAttribute ("image", tmp);
        }
        else {
          tmp = subnode1.getAttribute ("label");
          subnode1.setAttribute ("label",
                                 subnode2
                                 .getAttribute ("label"));
          subnode2.setAttribute ("label", tmp);
        }
      }
      else {
        var subsubnode1 = subnode1.firstChild;
        var subsubnode2 = subnode2.firstChild;
        if (subsubnode1) {
          subnode1.removeChild (subsubnode1);
          subnode2.appendChild (subsubnode1);
        }
        if (subsubnode2) {
          subnode2.removeChild (subsubnode2);
          subnode1.appendChild (subsubnode2);
        }
      }
      subnode1 = subnode1.nextSibling;
      subnode2 = subnode2.nextSibling;
    }
        
    if (toggle) {
      Aima_AimaniOptions.toggleItemSelection (listbox, node1);
      Aima_AimaniOptions.toggleItemSelection (listbox, node2);
    }
  },
    
  /**
   * 項目の選択状態を変える
   *
   * @param  Listbox/HTMLTableSectionElement listbox
   *         対象のリストボックス
   * @param  Listitem/HTMLTableRowElement listitem
   *         対象の項目
   */
  toggleItemSelection : function (listbox, listitem) {
    if (Aima_AimaniOptions.mode == 1) {
      listbox.toggleItemSelection (listitem);
    }
    else {
      var td;
      if (Aima_AimaniOptions.isSelected (listitem)) {
        td = listitem.firstChild;
        while (td) {
          td.style.fontWeight = "";
          td.style.color = "";
          td.style.backgroundColor = "";
          td = td.nextSibling;
        }
      }
      else {
        td = listitem.firstChild;
        while (td) {
          td.style.fontWeight = "";
          bold = td.style.fontWeight;
          td.style.color = "#ffffff";
          td.style.backgroundColor = "#3875d7";
          td = td.nextSibling;
        }
      }
    }
  }
};
/* Opera/IE/Safari 版に移植する部分 ---- ここまで ---- */

/**
 * Firefox 版のみの設定管理
 */
var Aima_AimaniOptions2 = {
  /**
   * 設定のインポート
   */
  importPrefs : function () {
    try {
      var filename;
            
      var filePicker
      = Components.classes ["@mozilla.org/filepicker;1"]
      .createInstance (Components.interfaces.nsIFilePicker);
      filePicker.init (window,
                       "\u30A4\u30F3\u30DD\u30FC\u30C8\u3059\u308B\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044",
                       Components.interfaces.nsIFilePicker.modeOpen);
      filePicker.appendFilter ("Text", "*.txt");
      filePicker.defaultString = "aima_aimaniConfig.txt";
      filePicker.appendFilters (Components.interfaces.nsIFilePicker
                                .filterAll);
            
      var ret = filePicker.show ();
      if (ret == Components.interfaces.nsIFilePicker.returnOK) {
        var file
          = filePicker.file
          .QueryInterface (Components.interfaces.nsILocalFile);
                
        var fstream
          = Components
          .classes ["@mozilla.org/network/file-input-stream;1"]
          .createInstance (Components.interfaces.nsIFileInputStream);
        var sstream
          = Components
          .classes ["@mozilla.org/scriptableinputstream;1"]
          .createInstance (Components.interfaces
                           .nsIScriptableInputStream);
        fstream.init (file, 0x01, 0x0124, false);
        sstream.init (fstream);
        var text = sstream.read (-1);
        sstream.close ();
        fstream.close ();
                
        text = text.replace (/\r\n/g, "\n");
        var map = new Object ();
        var ok = false;
                
        /* ファイルを解析するだけなので代入はしない */
        text.replace
          (/([^\n]+)\n?/g,
           function (matched, part1) {
            if (part1.match (/^(aima_aimani\..+),(.+)$/)) {
              map [unescape (RegExp.$1)] = unescape (RegExp.$2);
              ok = true;
            }
            return "";
          });
                
        if (ok) {
          Aima_AimaniOptions.loadPrefs (map);
                    
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "import_export_message").value
            = "\u30A4\u30F3\u30DD\u30FC\u30C8\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F";
        }
        else {
          document.getElementById (Aima_AimaniOptions.prefix
                                   + "import_export_message").value
            = "\u4E0D\u6B63\u306A\u8A2D\u5B9A\u30D5\u30A1\u30A4\u30EB\u3067\u3059";
        }
      }
      else {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "import_export_message").value
        = "\u30A4\u30F3\u30DD\u30FC\u30C8\u3092\u4E2D\u65AD\u3057\u307E\u3057\u305F";
      }
    }
    catch (e) { Components.utils.reportError (e);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "import_export_message").value
      = "\u30A4\u30F3\u30DD\u30FC\u30C8\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
    }
  },
    
  /**
   * 設定のエクスポート
   */
  exportPrefs : function () {
    try {
      var filename;
            
      var filePicker = Components.classes ["@mozilla.org/filepicker;1"]
      .createInstance (Components.interfaces.nsIFilePicker);
      filePicker.init (window,
                       "\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3059\u308B\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u000A",
                       Components.interfaces.nsIFilePicker.modeSave);
      filePicker.appendFilter ("Text", "*.txt");
      filePicker.defaultString = "aima_aimaniConfig.txt";
      filePicker.appendFilters (Components.interfaces.nsIFilePicker
                                .filterAll);
            
      var ret = filePicker.show ();
      if (ret == Components.interfaces.nsIFilePicker.returnOK ||
          ret == Components.interfaces.nsIFilePicker.returnReplace) {
        var file
          = filePicker.file
          .QueryInterface (Components.interfaces.nsILocalFile);
                
        var fstream
          = Components
          .classes ["@mozilla.org/network/file-output-stream;1"]
          .createInstance (Components.interfaces.nsIFileOutputStream);
        fstream.init (file, 0x02 | 0x08 | 0x20, 0x01b4, 0);
                
        Aima_AimaniOptions.savePrefs (fstream);
                
        fstream.close ();
                
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "import_export_message").value
          = "\u30A8\u30B9\u30AF\u30DD\u30FC\u30C8\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F";
      }
      else {
        document.getElementById (Aima_AimaniOptions.prefix
                                 + "import_export_message").value
        = "\u30A8\u30B9\u30AF\u30DD\u30FC\u30C8\u3092\u4E2D\u65AD\u3057\u307E\u3057\u305F";
      }
    }
    catch (e) { Components.utils.reportError (e);
      document.getElementById (Aima_AimaniOptions.prefix
                               + "import_export_message").value
      = "\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
    }
  },
    
  /**
   * 設定の初期化
   */
  initPrefs : function () {
    var map = new Object ();
    Aima_AimaniOptions.loadPrefs (map);
  },
    
  /**
   * フォーカスされている要素を調べる
   *
   * @return Boolean
   *         1行のテキストボックスにフォーカスが無ければ true
   */
  checkFocus : function () {
    var node = document.commandDispatcher.focusedElement;
        
    if  (node
         && node.nodeName == "html:input") {
      return false;
    }
        
    return true;
  },
    
  /**
   * サイトを開く
   */
  openWebsite : function () {
    var mediator
    = Components.classes ["@mozilla.org/appshell/window-mediator;1"]
    .getService (Components.interfaces.nsIWindowMediator);
    var chromeWindow = mediator.getMostRecentWindow ("navigator:browser");
    if (chromeWindow) {
      chromeWindow.Aima_AimaniUIManager.openWebsite ();
    }
    else {
      window.open ("http://www.unmht.org/aima_aimani/");
    }
  }
};
