/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

/**
 * NG ワード設定管理
 **/
var Aima_AimaniNGWord = {
  prefix : "",                   /* String  要素の ID のプレフィックス */
    
  /**
   * 初期化処理
   */
  init : function () {
    var ng_word = "";
        
    ng_word = window.arguments [0];
        
    document.getElementById (Aima_AimaniNGWord.prefix
                             + "ng_word_word").value = ng_word;
        
    document.getElementById (Aima_AimaniNGWord.prefix
                             + "ng_word_ignore_case").checked = false;
    document.getElementById (Aima_AimaniNGWord.prefix
                             + "ng_word_message").checked = true;
    document.getElementById (Aima_AimaniNGWord.prefix
                             + "ng_word_mail").checked = true;
    document.getElementById (Aima_AimaniNGWord.prefix
                             + "ng_word_thread").checked = true;
    document.getElementById (Aima_AimaniNGWord.prefix
                             + "ng_word_res").checked = true;
    document.getElementById (Aima_AimaniNGWord.prefix
                             + "ng_word_cat").checked = true;
  },
    
  /**
   * NG ワードを追加するボタンのイベント
   */
  onAddNGWord : function () {
    var text
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_word").value;
    var r
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_regexp").checked;
    var ic
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_ignore_case").checked;
    var message
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_message").checked;
    var mail
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_mail").checked;
    var thread
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_thread").checked;
    var res
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_res").checked;
    var cat
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_cat").checked;
    var expire
    = document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_expire").value;
    var expireDate
    = document.getElementById (Aima_AimaniNGWord.prefix
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
        
    document.getElementById (Aima_AimaniNGWord.prefix
                             + "ng_word_illegal").value = "";
        
    if (expire == "none" || !expire) {
      expire = "0";
    }
    else if (expire == "1day") {
      expire = "1_" + Aima_AimaniNGWord.readableToDate ("1d");
    }
    else if (expire == "3day") {
      expire = "1_" + Aima_AimaniNGWord.readableToDate ("3d");
    }
    else if (expire == "date") {
      expire = Aima_AimaniNGWord.readableToDate (expireDate);
      if (expire) {
        expire = "1_" + expire;
      }
      else {
        document.getElementById (Aima_AimaniNGWord.prefix
                                 + "ng_word_illegal").value
        = "\u6642\u523B\u304C\u7570\u5E38\u3067\u3059";
                
        return false;
      }
    }
        
    if (r) {
      try {
        var tmp = "test";
        tmp.search (text);
      }
      catch (e) { Components.utils.reportError (e);
        document.getElementById (Aima_AimaniNGWord.prefix
                                 + "ng_word_illegal").value
        = "\u6B63\u898F\u8868\u73FE\u304C\u4E0D\u6B63\u3067\u3059";
                
        return false;
      }
    }
        
    r = r ? "o" : "x";
        
    var exist = false;
    var ng_word = "";
        
    if (text) {
      ng_word
        = Aima_AimaniNGWord
        .initPref ("char", "aima_aimani.ng_word.list", "");
      if (ng_word != "") {
        tmp = ng_word.split (",");
        for (var i in tmp) {
          var tmp2 = tmp [i].split ("&");
          if (text == unescape (tmp2 [0])
              && r == unescape (tmp2 [1])) {
            exist = true;
            break;
          }
        }
      }
            
      if (!exist) {
        if (ng_word) {
          ng_word = "," + ng_word;
        }
        ng_word
          = escape (text) + "&" + escape (r)
          + "&" + escape (target)
          + "&" + "0"
          + "&" + "0"
          + "&" + escape (expire) + ng_word;
                
        Aima_AimaniNGWord
          .setPref ("char", "aima_aimani.ng_word.list", ng_word);
                
        Aima_AimaniNGWord
          .setPref ("char", "aima_aimani.savepref",
                    new Date ().getTime ());
      }
      else {
        document.getElementById (Aima_AimaniNGWord.prefix
                                 + "ng_word_illegal").value
          = "\u540C\u3058\u9805\u76EE\u304C\u3042\u308A\u307E\u3059";
        return false;
      }
    }
    else {
      document.getElementById (Aima_AimaniNGWord.prefix
                               + "ng_word_illegal").value
      = "NG \u30EF\u30FC\u30C9\u304C\u4E0D\u6B63\u3067\u3059";
            
      return false;
    }
        
    return true;
  },
    
  /**
   * エポックミリ秒を可読表記に変換する
   *
   * @param  Number date
   *         エポックミリ秒
   * @return String
   *         可読表記
   */
  dateToReadable : function (date) {
    var d = new Date ();
    d.setTime (date);
    var year = d.getYear () + 1900;
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
    var readable
    = year + "/" + month + "/" + day
    + " " + hour + ":" + min + ":" + sec;
        
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
   * 設定を読み込む
   * 設定が無ければ既定値を書き込む
   *
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
  initPref : function (type, name, value) {
    var prefBranch;
            
    prefBranch
      = Components
      .classes ["@mozilla.org/preferences-service;1"]
      .getService (Components.interfaces.nsIPrefBranch);
            
    if (prefBranch.prefHasUserValue (name)) {
      ; /* switch のインデント用 */
      switch (type) {
        case "bool":
          value = prefBranch.getBoolPref (name);
          break;
        case "char":
          value = prefBranch.getCharPref (name);
          break;
        case "int":
          value = prefBranch.getIntPref (name);
          break;
      }
    }
    else {
      ; /* switch のインデント用 */
      switch (type) {
        case "bool":
          prefBranch.setBoolPref (name, value);
          break;
        case "char":
          prefBranch.setCharPref (name, value);
          break;
        case "int":
          prefBranch.setIntPref (name, value);
          break;
      }
    }
        
    return value;
  },
    
  /**
   * 設定を保存する
   *
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
  setPref : function (type, name, value) {
    var prefBranch;
        
    prefBranch
      = Components
      .classes ["@mozilla.org/preferences-service;1"]
      .getService (Components.interfaces.nsIPrefBranch);
            
    ; /* switch のインデント用 */
    switch (type) {
      case "bool":
        prefBranch.setBoolPref (name, value);
        break;
      case "char":
        prefBranch.setCharPref (name, value);
        break;
      case "int":
        prefBranch.setIntPref (name, value);
        break;
    }
  }
};
