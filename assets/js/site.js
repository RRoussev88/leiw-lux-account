// Shared behavior: remember an explicit language choice, and pick the language block on the 404 page.
// No cookies, no network, no tracking. localStorage is used only when the visitor clicks a language link.
(function () {
  "use strict";
  var KEY = "ll_lang";
  var LANGS = ["fr", "en", "de", "lb"];

  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[data-lang]") : null;
    if (!a) return;
    try {
      localStorage.setItem(KEY, a.getAttribute("data-lang"));
    } catch (_) {}
  });

  var blocks = document.querySelectorAll("[data-lang-block]");
  if (blocks.length) {
    var chosen = null;
    try {
      var stored = localStorage.getItem(KEY);
      if (LANGS.indexOf(stored) > -1) chosen = stored;
    } catch (_) {}
    if (!chosen) {
      var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
      for (var i = 0; i < prefs.length && !chosen; i++) {
        var c = String(prefs[i]).toLowerCase().split("-")[0];
        if (c === "ltz") c = "lb";
        if (LANGS.indexOf(c) > -1) chosen = c;
      }
    }
    if (chosen) {
      for (var j = 0; j < blocks.length; j++) {
        blocks[j].hidden = blocks[j].getAttribute("data-lang-block") !== chosen;
      }
      document.documentElement.lang = chosen;
    }
  }
})();
