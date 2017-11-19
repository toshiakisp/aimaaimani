"use strict";

function setFormInputs (prefs) {
  for (var key in prefs) {
    var nodes = document.getElementsByName(key);
    for (var i = 0; i < nodes.length; i ++) {
      var node = nodes[i];
      if (!node.form) { // HTMLInputElement
        console.warn ("unexpeced node has a name: " + key);
        continue;
      }
      switch (node.type) {
        case "checkbox":
          node.checked = prefs[key];
          break;
        case "radio":
          node.checked = (node.value == prefs[key]);
          break;
        case "text":
          node.value = prefs[key];
      }
    }
  }
}

function getFormInputs (prefs) {
  var newPrefs = {};
  for (var key in prefs) {
    newPrefs[key] = prefs[key];
    var nodes = document.getElementsByName(key);
    for (var i = 0; i < nodes.length; i ++) {
      var node = nodes[i];
      if (!node.form) { // HTMLInputElement
        console.warn ("unexpeced node has a name: " + key);
        continue;
      }
      switch (node.type) {
        case "checkbox":
          newPrefs[key] = node.checked;
          break;
        case "radio":
          if (node.checked) {
            newPrefs[key] = node.value;
          }
          break;
        case "text":
          newPrefs[key] = node.value;
      }
    }
  }
  return newPrefs;
}


browser.runtime.sendMessage({
  "target": "pref.js",
  "command": "get",
  "args": [null] // all prefs
}).then(function (prefs) {
  // on success
  if (!prefs) {
    console.error ("options.js: no response!");
    return;
  }
  setFormInputs (prefs);

  var button = document.getElementById("save-button");
  button.disabled = false;
  button.addEventListener("click", function (event) {
    event.target.disabled = true;
    var newPrefs = getFormInputs (prefs);
    browser.runtime.sendMessage({
      "target": "pref.js",
      "command": "set",
      "args": [newPrefs]
    }).then(function (a){
      event.target.disabled = false;
    }, function (e){ // rejected
      console.error("options.js: pref.js/set failure;" + e);
    });
  }, false);

  button = document.getElementById("cancel-button");
  button.disabled = false;
  button.addEventListener("click", function (event) {
    setFormInputs (prefs);
  }, false);
}, function (e) {
  // on rejected
  console.error ("options.js: sendMessage rejected!:" + e);
})


