/* ==========================================================
   merkhilfe.js – Suche und Kopieren auf den Merkhilfe-Seiten
   ========================================================== */
(function () {
  "use strict";

  /* ---------- Kopieren-Buttons an Code-Blöcken ---------- */
  function fallback(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove();
    return ok;
  }

  function copy(text, btn) {
    function done(ok) {
      btn.textContent = ok ? "kopiert" : "Strg+C";
      setTimeout(function () { btn.textContent = "kopieren"; }, 1500);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback(text)); });
    } else done(fallback(text));
  }

  document.querySelectorAll(".ref-code").forEach(function (box) {
    var pre = box.querySelector("pre");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "kopieren";
    btn.addEventListener("click", function () { copy(pre.textContent, btn); });
    box.appendChild(btn);
  });

  /* ---------- Suche ---------- */
  var input = document.getElementById("ref-suche");
  var leer = document.getElementById("leer");
  if (!input) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll(".ref-section")).map(function (s) {
    var items = Array.prototype.slice.call(s.querySelectorAll("tbody tr, .ref-item"));
    return {
      el: s,
      title: s.querySelector("h2").textContent.toLowerCase(),
      items: items.map(function (it) { return { el: it, text: it.textContent.toLowerCase() }; })
    };
  });

  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase(), total = 0;
    sections.forEach(function (s) {
      var titleHit = q && s.title.indexOf(q) !== -1, visible = 0;
      s.items.forEach(function (it) {
        var show = !q || titleHit || it.text.indexOf(q) !== -1;
        it.el.hidden = !show;
        if (show) visible++;
      });
      s.el.hidden = visible === 0;
      total += visible;
    });
    if (leer) leer.hidden = total !== 0;
  });
})();
