/* ==========================================================
   app.js – baut die Kacheln aus links.js und steuert
   Suche, Filter und Hell/Dunkel. Normalerweise nicht ändern.
   ========================================================== */

(function () {
  "use strict";

  /* ---------- Hell / Dunkel ---------- */
  var root = document.documentElement;
  var themeBtn = document.getElementById("theme-toggle");
  var MODI = ["auto", "hell", "dunkel"];

  function gespeichertesTheme() {
    try { return localStorage.getItem("theme") || "auto"; } catch (e) { return "auto"; }
  }

  function setzeTheme(modus) {
    if (modus === "hell") root.setAttribute("data-theme", "light");
    else if (modus === "dunkel") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try {
      if (modus === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", modus);
    } catch (e) { /* Speicher nicht verfügbar – egal */ }
    if (themeBtn) themeBtn.textContent = "theme: " + modus;
  }

  if (themeBtn) {
    setzeTheme(gespeichertesTheme());
    themeBtn.addEventListener("click", function () {
      var aktuell = MODI.indexOf(gespeichertesTheme());
      setzeTheme(MODI[(aktuell + 1) % MODI.length]);
    });
  }

  /* ---------- Kacheln (nur auf der Startseite) ---------- */
  var ziel = document.getElementById("eintraege");
  if (!ziel || typeof EINTRAEGE === "undefined") return;

  var chipsBox = document.getElementById("chips");
  var suche = document.getElementById("suche");
  var leer = document.getElementById("leer");
  var aktiverTyp = "alle";

  function el(tag, klasse, text) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text) e.textContent = text;
    return e;
  }

  function istExtern(url) { return /^https?:\/\//i.test(url); }

  // fach ist eine Liste; ein einzelner Text geht aber auch
  function faecher(eintrag) {
    if (!eintrag.fach) return [];
    return Array.isArray(eintrag.fach) ? eintrag.fach : [eintrag.fach];
  }

  function suchtext(eintrag) {
    return [eintrag.titel, eintrag.beschreibung, faecher(eintrag).join(" "), (eintrag.klassen || []).join(" ")]
      .join(" ").toLowerCase();
  }

  function baueKachel(eintrag) {
    var a = el("a", "card");
    a.href = eintrag.url || "#";
    if (istExtern(a.getAttribute("href"))) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    a.dataset.suche = suchtext(eintrag);

    var top = el("div", "card-top");
    top.appendChild(el("span", "card-fach", faecher(eintrag).join(", ")));
    if (eintrag.neu) top.appendChild(el("span", "badge-neu", "neu"));
    a.appendChild(top);

    var h3 = el("h3", istExtern(eintrag.url || "") ? "card-extern" : "", eintrag.titel);
    a.appendChild(h3);

    if (eintrag.beschreibung) a.appendChild(el("p", "", eintrag.beschreibung));

    if (eintrag.klassen && eintrag.klassen.length) {
      var tags = el("div", "card-tags");
      eintrag.klassen.forEach(function (k) { tags.appendChild(el("span", "tag", k)); });
      a.appendChild(tags);
    }
    return a;
  }

  // Abschnitte pro Typ, nur wenn Einträge vorhanden
  var abschnitte = [];
  TYPEN.forEach(function (typ) {
    var liste = EINTRAEGE.filter(function (e) { return e.typ === typ.id; });
    if (!liste.length) return;

    var section = el("section", "section");
    section.id = typ.id;
    section.dataset.typ = typ.id;

    var head = el("div", "section-head");
    head.appendChild(el("h2", "", typ.titel));
    var count = el("span", "count", "");
    head.appendChild(count);
    section.appendChild(head);

    var grid = el("div", "grid");
    liste.forEach(function (e) { grid.appendChild(baueKachel(e)); });
    section.appendChild(grid);

    ziel.appendChild(section);
    abschnitte.push({ section: section, count: count, typ: typ.id });

    // Filter-Chip
    var chip = el("button", "chip", typ.titel);
    chip.type = "button";
    chip.dataset.typ = typ.id;
    chip.setAttribute("aria-pressed", "false");
    chipsBox.appendChild(chip);
  });

  function aktualisiere() {
    var q = (suche.value || "").trim().toLowerCase();
    var gesamt = 0;

    abschnitte.forEach(function (ab) {
      var typPasst = aktiverTyp === "alle" || aktiverTyp === ab.typ;
      var sichtbar = 0;
      ab.section.querySelectorAll(".card").forEach(function (karte) {
        var zeigen = typPasst && (!q || karte.dataset.suche.indexOf(q) !== -1);
        karte.hidden = !zeigen;
        if (zeigen) sichtbar++;
      });
      ab.section.hidden = sichtbar === 0;
      ab.count.textContent = "(" + sichtbar + ")";
      gesamt += sichtbar;
    });

    leer.hidden = gesamt !== 0;
  }

  chipsBox.addEventListener("click", function (ev) {
    var chip = ev.target.closest(".chip");
    if (!chip) return;
    aktiverTyp = chip.dataset.typ;
    chipsBox.querySelectorAll(".chip").forEach(function (c) {
      c.setAttribute("aria-pressed", c === chip ? "true" : "false");
    });
    aktualisiere();
  });

  suche.addEventListener("input", aktualisiere);
  aktualisiere();
})();
