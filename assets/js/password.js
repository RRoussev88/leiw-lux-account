// Password reset flow (moved from the old one-page site; behavior unchanged).
// Supabase's recovery link carries the token in the URL; supabase-js exchanges it on load
// (detectSessionInUrl defaults to true) and fires PASSWORD_RECOVERY.
(function () {
  "use strict";

  var data = JSON.parse(document.getElementById("page-data").textContent);
  var strings = data.strings;

  var loadingState = document.getElementById("loadingState");
  var invalidState = document.getElementById("invalidState");
  var formState = document.getElementById("formState");
  var doneState = document.getElementById("doneState");
  var form = document.getElementById("resetForm");
  var submitBtn = document.getElementById("submitBtn");
  var formMessage = document.getElementById("formMessage");

  function showOnly(el, moveFocus) {
    [loadingState, invalidState, formState, doneState].forEach(function (s) {
      s.hidden = true;
    });
    el.hidden = false;
    if (moveFocus) {
      var h = el.querySelector("h1");
      if (h) h.focus();
    }
  }

  function showFormError(text) {
    formMessage.textContent = text;
    formMessage.hidden = false;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error("supabase-js failed to load");
    showOnly(invalidState, true);
    return;
  }

  var client = window.supabase.createClient(
    data.config.supabaseUrl,
    data.config.supabaseAnonKey
  );

  var recoveryReady = false;

  client.auth.onAuthStateChange(function (event) {
    if (event === "PASSWORD_RECOVERY") {
      recoveryReady = true;
      showOnly(formState, true);
    }
  });

  // Fallback: if no PASSWORD_RECOVERY event fires shortly after load,
  // the link was likely already used, expired, or malformed.
  setTimeout(function () {
    if (!recoveryReady) showOnly(invalidState, true);
  }, 4000);

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    formMessage.hidden = true;

    var password = document.getElementById("password").value;
    var confirmPassword = document.getElementById("confirmPassword").value;

    if (password.length < 6) return showFormError(strings.too_short);
    if (password !== confirmPassword) return showFormError(strings.mismatch);

    submitBtn.disabled = true;
    submitBtn.textContent = strings.updating;

    var failed = false;
    try {
      var result = await client.auth.updateUser({ password: password });
      if (result.error) {
        // Supabase's own messages are English-only: show a localized generic message
        // and keep the raw one in the console for debugging.
        console.warn("updateUser failed:", result.error.message);
        failed = true;
      }
    } catch (err) {
      console.warn("updateUser threw:", err);
      failed = true;
    }

    if (failed) {
      showFormError(strings.generic_error);
      submitBtn.disabled = false;
      submitBtn.textContent = strings.submit;
      return;
    }

    showOnly(doneState, true);
  });
})();
