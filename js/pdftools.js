/* ==========================================================
   pdftools.js – Logik für pdf-editor.html
   Alles läuft lokal im Browser, es wird nichts hochgeladen.
   Bibliotheken (in js/pdf/, siehe LIZENZ.txt):
     pdf-lib  PDFs bearbeiten und speichern
     pdf.js   Seiten anzeigen (Vorschaubilder, Seitenansicht)
     fflate   mehrere Ergebnisse als ZIP
     qpdf     Passwortschutz setzen/entfernen (wird erst bei Bedarf geladen)
   ========================================================== */

(function () {
  "use strict";

  const { PDFDocument, degrees } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "js/pdf/pdf.worker.min.js";

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ---------- Hilfsfunktionen ---------- */
  function h(tag, attrs, ...kinder) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true && !k.startsWith("aria-") ? "" : v);
    }
    for (const k of kinder.flat()) if (k != null && k !== false) e.append(k);
    return e;
  }

  const basisName = name => name.replace(/\.pdf$/i, "");
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function download(bytes, name, typ = "application/pdf") {
    const url = URL.createObjectURL(new Blob([bytes], { type: typ }));
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Mehrere Ergebnisse: eine Datei direkt, sonst als ZIP (PDFs sind schon komprimiert -> level 0)
  function downloadMehrere(dateien, zipName) {
    const namen = Object.keys(dateien);
    if (namen.length === 1) return download(dateien[namen[0]], namen[0]);
    download(fflate.zipSync(dateien, { level: 0 }), zipName, "application/zip");
  }

  // "1-3, 5, 8-" -> [[0,1,2],[4],[7,8,…]] (0-basiert)
  function parseBereiche(text, anzahl) {
    const teile = text.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (!teile.length) throw new Error("Keine Seiten angegeben.");
    return teile.map(t => {
      const m = t.match(/^(\d+)\s*(-\s*(\d*))?$/);
      if (!m) throw new Error(`„${t}“ verstehe ich nicht. Beispiel: 1-3, 5, 8-`);
      const von = +m[1];
      const bis = m[2] ? (m[3] ? +m[3] : anzahl) : von;
      if (von < 1 || bis > anzahl || von > bis) {
        throw new Error(`„${t}“ passt nicht – die PDF hat ${anzahl} Seite${anzahl === 1 ? "" : "n"}.`);
      }
      return Array.from({ length: bis - von + 1 }, (_, i) => von - 1 + i);
    });
  }

  // [0,1,2,4] -> "1-3, 5"
  function alsBereiche(indizes) {
    const s = [...new Set(indizes)].sort((a, b) => a - b);
    const teile = [];
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      teile.push(i === j ? `${s[i] + 1}` : `${s[i] + 1}-${s[j] + 1}`);
      i = j;
    }
    return teile.join(", ");
  }

  function canvasBytes(canvas, typ, qualitaet) {
    return new Promise(ok => canvas.toBlob(b => b.arrayBuffer().then(a => ok(new Uint8Array(a))), typ, qualitaet));
  }

  /* ---------- PDFs öffnen ---------- */
  async function ladeDatei(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kopf = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
    if (!kopf.includes("%PDF")) throw new Error(`„${file.name}“ ist keine PDF-Datei.`);
    return { name: file.name, bytes };
  }

  // pdf-lib (zum Bearbeiten)
  async function oeffneLib(datei) {
    try {
      return await PDFDocument.load(datei.bytes);
    } catch (e) {
      if (/encrypt/i.test(e.message)) {
        throw new Error(`„${datei.name}“ ist geschützt. Entsperre sie zuerst mit „PDF entsperren“.`);
      }
      throw new Error(`„${datei.name}“ konnte nicht gelesen werden (${e.message}).`);
    }
  }

  // pdf.js (zum Anzeigen). isEvalSupported: false = kein eval() für Schriften (Sicherheitsempfehlung von pdf.js)
  async function oeffneJs(datei, passwort) {
    const task = pdfjsLib.getDocument({ data: datei.bytes.slice(), password: passwort, isEvalSupported: false });
    try {
      return await task.promise;
    } catch (e) {
      if (e.name === "PasswordException") {
        const fehler = new Error(passwort ? "Falsches Passwort." : `„${datei.name}“ ist mit einem Passwort geschützt. Entsperre sie zuerst mit „PDF entsperren“.`);
        fehler.passwort = true;
        throw fehler;
      }
      throw new Error(`„${datei.name}“ konnte nicht angezeigt werden (${e.message}).`);
    }
  }

  // Seite in ein Canvas zeichnen, Breite in CSS-Pixeln
  async function rendere(pdf, index, breite, canvas) {
    const seite = await pdf.getPage(index + 1);
    const skala = breite / seite.getViewport({ scale: 1 }).width;
    const vp = seite.getViewport({ scale: skala * DPR });
    canvas = canvas || h("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    canvas.style.width = breite + "px";
    await seite.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    return canvas;
  }

  // Vorschaubilder erst zeichnen, wenn sie sichtbar werden – nacheinander, damit große PDFs nicht hängen
  function vorschauWarteschlange(pdf) {
    let kette = Promise.resolve();
    const io = new IntersectionObserver(eintraege => {
      for (const en of eintraege) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        const c = en.target;
        kette = kette.then(() => rendere(pdf, +c.dataset.index, 100, c)).catch(() => {});
      }
    }, { rootMargin: "400px" });
    return index => {
      const c = h("canvas", { width: 77, height: 100, "data-index": index });
      io.observe(c);
      return c;
    };
  }

  // Ist die PDF verschlüsselt, und braucht man zum Öffnen ein Passwort?
  // (pdf-lib kann AES-256-Dateien nicht einmal mit ignoreEncryption lesen, daher pdf.js)
  async function pruefeSchutz(datei) {
    try {
      const pdf = await oeffneJs(datei);
      const { info } = await pdf.getMetadata();
      const seiten = pdf.numPages;
      pdf.destroy();
      return { verschluesselt: !!info.EncryptFilterName, passwort: false, seiten };
    } catch (e) {
      if (!e.passwort) throw e;
      return { verschluesselt: true, passwort: true, seiten: null };
    }
  }

  /* ---------- qpdf (Verschlüsselung) ---------- */
  let qpdfGeladen = null;
  function ladeQpdf() {
    qpdfGeladen = qpdfGeladen || new Promise((ok, fehler) => {
      const s = h("script", { src: "js/pdf/qpdf.js" });
      s.onload = ok;
      s.onerror = () => { qpdfGeladen = null; fehler(new Error("qpdf konnte nicht geladen werden.")); };
      document.head.append(s);
    });
    return qpdfGeladen;
  }

  // Für jeden Aufruf eine neue Instanz: callMain lässt sich pro Instanz nur einmal sicher aufrufen
  async function qpdf(args, eingabe) {
    await ladeQpdf();
    const meldungen = [];
    const m = await window.Module({
      locateFile: () => "js/pdf/qpdf.wasm",
      print: s => meldungen.push(s),
      printErr: s => meldungen.push(s)
    });
    m.FS.writeFile("/in.pdf", eingabe);
    let code;
    try {
      code = m.callMain(args);
    } catch (e) {
      code = typeof e.status === "number" ? e.status : 1;
    }
    // 0 = ok, 3 = ok mit Warnungen
    if (code !== 0 && code !== 3) {
      const text = meldungen.join("\n");
      if (/invalid password/i.test(text)) throw new Error("Falsches Passwort.");
      throw new Error("qpdf: " + (meldungen.filter(Boolean).pop() || "Fehler " + code));
    }
    return m.FS.readFile("/out.pdf");
  }

  /* ---------- Bausteine für die Werkzeuge ---------- */

  // Knopf + Statuszeile; fn liefert die Erfolgsmeldung
  function aktionsLeiste(label, fn) {
    const status = h("span", { class: "status", role: "status" });
    const btn = h("button", { class: "btn btn-big", type: "button", text: label });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.className = "status";
      status.textContent = "arbeite …";
      try {
        status.textContent = (await fn(status)) || "fertig ✓";
        status.className = "status ok";
      } catch (e) {
        console.error(e);
        status.textContent = e.message;
        status.className = "status bad";
      } finally {
        btn.disabled = false;
      }
    });
    return { el: h("div", { class: "actions" }, btn, status), btn, status };
  }

  function dateiInfo(datei, anzahl) {
    return h("p", { class: "small muted" },
      h("b", { text: datei.name }), ` · ${anzahl} Seite${anzahl === 1 ? "" : "n"}`);
  }

  function panel(titel, ...inhalt) {
    return h("div", { class: "panel opts" }, titel ? h("span", { class: "flabel", text: titel }) : null, ...inhalt);
  }

  // Ziehen & Ablegen innerhalb eines Kachel-Rasters; verschiebe(von, nach) ordnet die Daten um
  function sortierbar(raster, verschiebe) {
    let quelle = null, ziel = null;
    function markiere(pg, danach) {
      raster.querySelectorAll(".drop-before, .drop-after").forEach(e => e.classList.remove("drop-before", "drop-after"));
      ziel = pg ? { pg, danach } : null;
      if (pg) pg.classList.add(danach ? "drop-after" : "drop-before");
    }
    raster.addEventListener("dragstart", e => {
      const pg = e.target.closest(".pg");
      if (!pg) return;
      quelle = pg;
      pg.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
    });
    raster.addEventListener("dragend", () => {
      if (quelle) quelle.classList.remove("dragging");
      quelle = null;
      markiere(null);
    });
    raster.addEventListener("dragover", e => {
      if (!quelle) return;
      e.preventDefault();
      const pg = e.target.closest(".pg");
      if (!pg || pg === quelle) return markiere(null);
      const r = pg.getBoundingClientRect();
      markiere(pg, e.clientX > r.left + r.width / 2);
    });
    raster.addEventListener("drop", e => {
      if (!quelle) return;
      e.preventDefault();
      e.stopPropagation();
      if (!ziel) return;
      const kacheln = [...raster.children];
      const von = kacheln.indexOf(quelle);
      let nach = kacheln.indexOf(ziel.pg) + (ziel.danach ? 1 : 0);
      if (von < nach) nach--;
      markiere(null);
      if (von !== nach) verschiebe(von, nach);
    });
  }

  function verschiebeImArray(arr, von, nach) {
    const [x] = arr.splice(von, 1);
    arr.splice(nach, 0, x);
  }

  /* ---------- Seitenansicht mit Objekten (Unterschreiben, Schwärzen) ----------
     Objekte werden als Bruchteile der Seitengröße gespeichert (x, y, w, h zwischen 0 und 1),
     damit sie bei jeder Fenstergröße an der gleichen Stelle sitzen. */
  function seitenAnsicht(pdf, opt) {
    const objekte = new Map();   // Seitenindex -> [{x, y, w, h, ...}]
    let index = 0, seitenVerhaeltnis = 1, renderTask = null;

    const canvas = h("canvas");
    const layer = h("div", { class: "layer" });
    const stage = h("div", { class: "stage" + (opt.zeichnen ? " draw-mode" : "") }, canvas, layer);
    const anzeige = h("span", { class: "status" });
    const zurueck = h("button", { class: "btn btn-ghost", type: "button", text: "‹ zurück", onclick: () => gehe(index - 1) });
    const weiter = h("button", { class: "btn btn-ghost", type: "button", text: "weiter ›", onclick: () => gehe(index + 1) });
    const nav = h("div", { class: "row viewer-nav" }, zurueck, anzeige, weiter);
    const el = h("div", { class: "opts" }, nav, stage);

    const liste = i => objekte.get(i) || (objekte.set(i, []), objekte.get(i));

    async function zeichneSeite() {
      const seite = await pdf.getPage(index + 1);
      const vp1 = seite.getViewport({ scale: 1 });
      const breite = Math.min(el.clientWidth || 800, 820);
      const vp = seite.getViewport({ scale: breite / vp1.width * DPR });
      seitenVerhaeltnis = vp1.width / vp1.height;
      stage.style.width = breite + "px";
      stage.style.height = breite / seitenVerhaeltnis + "px";
      if (renderTask) renderTask.cancel();
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      renderTask = seite.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
      try { await renderTask.promise; } catch (e) { /* abgebrochen */ }
    }

    function zeichneObjekte() {
      layer.replaceChildren(...liste(index).map(o => {
        o.el = o.el || opt.erzeuge(o);
        setze(o);
        return o.el;
      }));
    }

    function setze(o) {
      Object.assign(o.el.style, {
        left: o.x * 100 + "%", top: o.y * 100 + "%",
        width: o.w * 100 + "%", height: o.h * 100 + "%"
      });
    }

    async function gehe(i) {
      index = clamp(i, 0, pdf.numPages - 1);
      anzeige.textContent = `${index + 1} / ${pdf.numPages}`;
      zurueck.disabled = index === 0;
      weiter.disabled = index === pdf.numPages - 1;
      zeichneObjekte();
      await zeichneSeite();
      if (opt.geaendert) opt.geaendert();
    }

    // Zeiger: Objekt verschieben, Größe ändern, löschen oder neu anlegen
    let aktion = null;
    function punkt(e) {
      const r = layer.getBoundingClientRect();
      return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
    }
    layer.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const p = punkt(e);
      const objEl = e.target.closest(".item");
      const o = objEl && liste(index).find(x => x.el === objEl);
      if (o && e.target.classList.contains("x")) {
        liste(index).splice(liste(index).indexOf(o), 1);
        objEl.remove();
        if (opt.geaendert) opt.geaendert();
        return;
      }
      if (o) {
        aktion = { art: e.target.classList.contains("rz") ? "groesse" : "schieben", o, p, start: { ...o } };
      } else {
        const neu = opt.neu && opt.neu(p, seitenVerhaeltnis);
        if (!neu) return;
        liste(index).push(neu.o);
        neu.o.el = opt.erzeuge(neu.o);
        layer.append(neu.o.el);
        setze(neu.o);
        aktion = { art: neu.art, o: neu.o, p, start: { ...neu.o } };
        if (opt.geaendert) opt.geaendert();
      }
      layer.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    layer.addEventListener("pointermove", e => {
      if (!aktion) return;
      const p = punkt(e), { o, start } = aktion;
      const dx = p.x - aktion.p.x, dy = p.y - aktion.p.y;
      if (aktion.art === "schieben") {
        o.x = clamp(start.x + dx, 0, 1 - o.w);
        o.y = clamp(start.y + dy, 0, 1 - o.h);
      } else if (aktion.art === "groesse") {
        o.w = clamp(start.w + dx, 0.02, 1 - o.x);
        // Seitenverhältnis von Bildern beibehalten (in Pixeln, daher mit Seitenformat umrechnen)
        o.h = o.verhaeltnis ? o.w * o.verhaeltnis * seitenVerhaeltnis : clamp(start.h + dy, 0.01, 1 - o.y);
        if (o.y + o.h > 1) { o.h = 1 - o.y; if (o.verhaeltnis) o.w = o.h / o.verhaeltnis / seitenVerhaeltnis; }
      } else if (aktion.art === "aufziehen") {
        o.x = Math.min(aktion.p.x, p.x);
        o.y = Math.min(aktion.p.y, p.y);
        o.w = Math.abs(p.x - aktion.p.x);
        o.h = Math.abs(p.y - aktion.p.y);
      }
      setze(o);
    });
    function ende() {
      if (!aktion) return;
      const { o, art } = aktion;
      aktion = null;
      if (art === "aufziehen" && (o.w < 0.005 || o.h < 0.005)) {
        liste(index).splice(liste(index).indexOf(o), 1);
        o.el.remove();
      }
      if (opt.geaendert) opt.geaendert();
    }
    layer.addEventListener("pointerup", ende);
    layer.addEventListener("pointercancel", ende);

    let timer;
    const beiGroesse = () => { clearTimeout(timer); timer = setTimeout(zeichneSeite, 150); };
    window.addEventListener("resize", beiGroesse);

    return {
      el,
      objekte,
      start: () => gehe(0),
      aktuelleSeite: () => index,
      anzahl: () => [...objekte.values()].reduce((s, l) => s + l.length, 0),
      fuegeHinzu(o) {
        liste(index).push(o);
        zeichneObjekte();
        if (opt.geaendert) opt.geaendert();
      },
      leeren() {
        objekte.clear();
        zeichneObjekte();
        if (opt.geaendert) opt.geaendert();
      },
      beenden() {
        window.removeEventListener("resize", beiGroesse);
        pdf.destroy();
      }
    };
  }

  function loeschKnopf() {
    return h("span", { class: "x", title: "entfernen", "aria-label": "entfernen", text: "×" });
  }

  /* ==========================================================
     Die Werkzeuge
     Jedes Werkzeug bekommt den Arbeitsbereich (body) und liefert
     { mehrere, dateien(liste), beenden() }.
     ========================================================== */

  /* ---------- PDF zusammenfügen ---------- */
  function zusammenfuegen(body) {
    const liste = [];
    const raster = h("div", { class: "pages" });

    function zeichne() {
      raster.replaceChildren(...liste.map((d, i) => h("div", { class: "pg", draggable: "true" },
        h("div", { class: "thumb" }, d.canvas),
        h("span", { class: "name", title: d.name, text: d.name }),
        h("span", { class: "nr", text: `${d.seiten} Seite${d.seiten === 1 ? "" : "n"}` }),
        h("div", { class: "tools" },
          h("button", { type: "button", title: "nach vorne", text: "←", disabled: i === 0,
            onclick: () => { verschiebeImArray(liste, i, i - 1); zeichne(); } }),
          h("button", { type: "button", title: "nach hinten", text: "→", disabled: i === liste.length - 1,
            onclick: () => { verschiebeImArray(liste, i, i + 1); zeichne(); } }),
          h("button", { type: "button", class: "del", title: "entfernen", text: "✕",
            onclick: () => { liste.splice(i, 1); zeichne(); } })
        )
      )));
      leiste.btn.disabled = liste.length < 2;
    }
    sortierbar(raster, (von, nach) => { verschiebeImArray(liste, von, nach); zeichne(); });

    const leiste = aktionsLeiste("PDFs zusammenfügen", async () => {
      const ziel = await PDFDocument.create();
      for (const d of liste) {
        const quelle = await oeffneLib(d);
        const seiten = await ziel.copyPages(quelle, quelle.getPageIndices());
        seiten.forEach(s => ziel.addPage(s));
      }
      download(await ziel.save(), "zusammengefuegt.pdf");
      return `${liste.length} Dateien mit ${ziel.getPageCount()} Seiten zusammengefügt ✓`;
    });

    body.append(
      h("p", { class: "note", text: "Reihenfolge durch Ziehen der Kacheln oder mit ← → ändern. Weitere PDFs kannst du jederzeit dazunehmen." }),
      raster, leiste.el);

    return {
      mehrere: true,
      async dateien(neue) {
        for (const d of neue) {
          const pdf = await oeffneJs(d);
          d.seiten = pdf.numPages;
          d.canvas = await rendere(pdf, 0, 100);
          pdf.destroy();
          liste.push(d);
        }
        zeichne();
      }
    };
  }

  /* ---------- PDF teilen ---------- */
  function teilen(body) {
    return { async dateien([datei]) {
      const pdf = await oeffneJs(datei);
      const n = pdf.numPages;
      const vorschau = vorschauWarteschlange(pdf);

      const modus = name => h("input", { type: "radio", name: "teilmodus", value: name, checked: name === "einzeln" });
      const rEinzeln = modus("einzeln"), rBereiche = modus("bereiche"), rAlle = modus("alle");
      const eBereiche = h("input", { class: "inp", type: "text", placeholder: "z. B. 1-3, 4-6, 7-", value: n > 1 ? `1-${Math.ceil(n / 2)}, ${Math.ceil(n / 2) + 1}-` : "1" });
      const eAlle = h("input", { class: "inp", type: "number", min: 1, max: n, value: Math.min(2, n), style: "width: 7ch" });
      const ergebnis = h("span", { class: "status" });

      function gruppen() {
        if (rEinzeln.checked) return Array.from({ length: n }, (_, i) => [i]);
        if (rBereiche.checked) return parseBereiche(eBereiche.value, n);
        const k = Math.floor(+eAlle.value);
        if (!(k >= 1)) throw new Error("Gib eine Seitenzahl ab 1 ein.");
        const g = [];
        for (let i = 0; i < n; i += k) g.push(Array.from({ length: Math.min(k, n - i) }, (_, j) => i + j));
        return g;
      }
      function aktualisiere() {
        try {
          const g = gruppen();
          eBereiche.removeAttribute("aria-invalid");
          ergebnis.className = "status";
          ergebnis.textContent = `→ ergibt ${g.length} Datei${g.length === 1 ? "" : "en"}${g.length > 1 ? " (als ZIP)" : ""}`;
        } catch (e) {
          if (rBereiche.checked) eBereiche.setAttribute("aria-invalid", "true");
          ergebnis.className = "status bad";
          ergebnis.textContent = e.message;
        }
      }

      const leiste = aktionsLeiste("PDF teilen", async () => {
        const g = gruppen();
        const quelle = await oeffneLib(datei);
        const basis = basisName(datei.name);
        const stellen = String(g.length).length;
        const dateien = {};
        for (let i = 0; i < g.length; i++) {
          const teil = await PDFDocument.create();
          (await teil.copyPages(quelle, g[i])).forEach(s => teil.addPage(s));
          const seiten = g[i].length === 1 ? `s${g[i][0] + 1}` : `s${g[i][0] + 1}-${g[i][g[i].length - 1] + 1}`;
          dateien[`${basis}_${String(i + 1).padStart(stellen, "0")}_${seiten}.pdf`] = await teil.save();
        }
        downloadMehrere(dateien, `${basis}_geteilt.zip`);
        return `${g.length} Datei${g.length === 1 ? "" : "en"} erstellt ✓`;
      });

      const optionen = panel("aufteilen",
        h("label", { class: "radio" }, rEinzeln, "jede Seite als eigene PDF"),
        h("label", { class: "radio" }, rBereiche, "nach Seitenbereichen:", eBereiche),
        h("label", { class: "radio" }, rAlle, "immer", eAlle, "Seiten pro Datei"),
        ergebnis);
      optionen.addEventListener("input", aktualisiere);
      optionen.addEventListener("change", aktualisiere);

      body.append(
        dateiInfo(datei, n),
        optionen,
        leiste.el,
        h("div", { class: "pages" }, Array.from({ length: n }, (_, i) =>
          h("div", { class: "pg", style: "cursor: default" }, h("div", { class: "thumb" }, vorschau(i)), h("span", { class: "nr", text: `${i + 1}` }))))
      );
      eBereiche.addEventListener("focus", () => { rBereiche.checked = true; aktualisiere(); });
      eAlle.addEventListener("focus", () => { rAlle.checked = true; aktualisiere(); });
      aktualisiere();
      this.beenden = () => pdf.destroy();
    } };
  }

  /* ---------- Seiten auswählen (Grundlage für Entfernen und Extrahieren) ---------- */
  function seitenAuswahl(body, datei, pdf, art) {
    const n = pdf.numPages;
    const gewaehlt = new Set();
    const vorschau = vorschauWarteschlange(pdf);
    const eingabe = h("input", { class: "inp", type: "text", placeholder: "z. B. 2, 5-7", style: "flex: 1 1 200px" });
    const info = h("span", { class: "status" });
    const kacheln = Array.from({ length: n }, (_, i) =>
      h("div", { class: "pg", tabindex: 0, role: "checkbox", "aria-checked": "false", "aria-label": `Seite ${i + 1}` },
        h("div", { class: "thumb" }, vorschau(i)),
        h("span", { class: "nr", text: `${i + 1}` }),
        h("span", { class: "mark", text: art === "remove" ? "✕" : "✓" })));

    function zeige(textAuch) {
      kacheln.forEach((k, i) => {
        k.classList.toggle("sel", gewaehlt.has(i));
        k.setAttribute("aria-checked", gewaehlt.has(i));
      });
      if (textAuch) eingabe.value = alsBereiche([...gewaehlt]);
      eingabe.removeAttribute("aria-invalid");
      info.className = "status";
      info.textContent = `${gewaehlt.size} von ${n} Seiten ${art === "remove" ? "zum Entfernen " : ""}markiert`;
    }
    function umschalten(i) {
      gewaehlt.has(i) ? gewaehlt.delete(i) : gewaehlt.add(i);
      zeige(true);
    }

    const raster = h("div", { class: "pages mode-" + (art === "remove" ? "remove" : "pick") }, kacheln);
    raster.addEventListener("click", e => {
      const k = e.target.closest(".pg");
      if (k) umschalten(kacheln.indexOf(k));
    });
    raster.addEventListener("keydown", e => {
      const k = e.target.closest(".pg");
      if (k && (e.key === " " || e.key === "Enter")) { e.preventDefault(); umschalten(kacheln.indexOf(k)); }
    });
    eingabe.addEventListener("input", () => {
      gewaehlt.clear();
      if (!eingabe.value.trim()) return zeige(false);
      try {
        parseBereiche(eingabe.value, n).flat().forEach(i => gewaehlt.add(i));
        zeige(false);
      } catch (e) {
        zeige(false);
        eingabe.setAttribute("aria-invalid", "true");
        info.className = "status bad";
        info.textContent = e.message;
      }
    });
    const alle = h("button", { class: "btn btn-ghost", type: "button", text: "alle",
      onclick: () => { kacheln.forEach((_, i) => gewaehlt.add(i)); zeige(true); } });
    const keine = h("button", { class: "btn btn-ghost", type: "button", text: "keine",
      onclick: () => { gewaehlt.clear(); zeige(true); } });

    body.append(dateiInfo(datei, n),
      panel("seiten anklicken oder eingeben", h("div", { class: "row" }, eingabe, alle, keine), info));
    zeige(true);
    return { gewaehlt, raster };
  }

  /* ---------- Seiten entfernen ---------- */
  function entfernen(body) {
    let pdf;
    return {
      async dateien([datei]) {
        pdf = await oeffneJs(datei);
        const { gewaehlt, raster } = seitenAuswahl(body, datei, pdf, "remove");
        const leiste = aktionsLeiste("Seiten entfernen", async () => {
          const behalten = [...Array(pdf.numPages).keys()].filter(i => !gewaehlt.has(i));
          if (!gewaehlt.size) throw new Error("Markiere zuerst die Seiten, die weg sollen.");
          if (!behalten.length) throw new Error("Es muss mindestens eine Seite übrig bleiben.");
          const quelle = await oeffneLib(datei);
          const ziel = await PDFDocument.create();
          (await ziel.copyPages(quelle, behalten)).forEach(s => ziel.addPage(s));
          download(await ziel.save(), `${basisName(datei.name)}_bearbeitet.pdf`);
          return `${gewaehlt.size} Seite${gewaehlt.size === 1 ? "" : "n"} entfernt, ${behalten.length} übrig ✓`;
        });
        body.append(leiste.el, raster);
      },
      beenden: () => pdf && pdf.destroy()
    };
  }

  /* ---------- Seiten extrahieren ---------- */
  function extrahieren(body) {
    let pdf;
    return {
      async dateien([datei]) {
        pdf = await oeffneJs(datei);
        const { gewaehlt, raster } = seitenAuswahl(body, datei, pdf, "pick");
        const einzeln = h("input", { type: "checkbox" });
        const leiste = aktionsLeiste("Seiten extrahieren", async () => {
          if (!gewaehlt.size) throw new Error("Wähle zuerst Seiten aus.");
          const seiten = [...gewaehlt].sort((a, b) => a - b);
          const quelle = await oeffneLib(datei);
          const basis = basisName(datei.name);
          const gruppen = einzeln.checked ? seiten.map(s => [s]) : [seiten];
          const dateien = {};
          for (const g of gruppen) {
            const ziel = await PDFDocument.create();
            (await ziel.copyPages(quelle, g)).forEach(s => ziel.addPage(s));
            dateien[einzeln.checked ? `${basis}_s${g[0] + 1}.pdf` : `${basis}_auszug.pdf`] = await ziel.save();
          }
          downloadMehrere(dateien, `${basis}_seiten.zip`);
          return `${seiten.length} Seite${seiten.length === 1 ? "" : "n"} extrahiert ✓`;
        });
        body.append(
          h("label", { class: "radio" }, einzeln, "jede Seite als eigene PDF (ZIP)"),
          leiste.el, raster);
      },
      beenden: () => pdf && pdf.destroy()
    };
  }

  /* ---------- PDF organisieren ---------- */
  function organisieren(body) {
    let pdf;
    return {
      async dateien([datei]) {
        pdf = await oeffneJs(datei);
        const n = pdf.numPages;
        const vorschau = vorschauWarteschlange(pdf);
        const canvasse = Array.from({ length: n }, (_, i) => vorschau(i));
        let reihe;   // [{index, drehung}]
        const raster = h("div", { class: "pages", style: "grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))" });

        function zuruecksetzen() {
          reihe = Array.from({ length: n }, (_, i) => ({ index: i, drehung: 0 }));
          zeichne();
        }
        function zeichne() {
          raster.replaceChildren(...reihe.map((s, pos) => {
            const c = canvasse[s.index];
            c.style.transform = `rotate(${s.drehung}deg)`;
            return h("div", { class: "pg", draggable: "true", style: "cursor: grab" },
              h("div", { class: "thumb" }, c),
              h("span", { class: "nr", text: `Seite ${s.index + 1}` }),
              h("div", { class: "tools" },
                h("button", { type: "button", title: "nach vorne", text: "←", disabled: pos === 0,
                  onclick: () => { verschiebeImArray(reihe, pos, pos - 1); zeichne(); } }),
                h("button", { type: "button", title: "nach links drehen", text: "↺",
                  onclick: () => { s.drehung = (s.drehung + 270) % 360; zeichne(); } }),
                h("button", { type: "button", title: "nach rechts drehen", text: "↻",
                  onclick: () => { s.drehung = (s.drehung + 90) % 360; zeichne(); } }),
                h("button", { type: "button", title: "nach hinten", text: "→", disabled: pos === reihe.length - 1,
                  onclick: () => { verschiebeImArray(reihe, pos, pos + 1); zeichne(); } }),
                h("button", { type: "button", class: "del", title: "Seite löschen", text: "✕", disabled: reihe.length === 1,
                  onclick: () => { reihe.splice(pos, 1); zeichne(); } })
              ));
          }));
        }
        sortierbar(raster, (von, nach) => { verschiebeImArray(reihe, von, nach); zeichne(); });

        const leiste = aktionsLeiste("PDF speichern", async () => {
          const quelle = await oeffneLib(datei);
          const ziel = await PDFDocument.create();
          const seiten = await ziel.copyPages(quelle, reihe.map(s => s.index));
          seiten.forEach((seite, i) => {
            seite.setRotation(degrees((seite.getRotation().angle + reihe[i].drehung) % 360));
            ziel.addPage(seite);
          });
          download(await ziel.save(), `${basisName(datei.name)}_organisiert.pdf`);
          return `${reihe.length} Seiten gespeichert ✓`;
        });

        body.append(
          dateiInfo(datei, n),
          h("p", { class: "note", text: "Seiten durch Ziehen umsortieren, mit ↺ ↻ drehen und mit ✕ löschen." }),
          h("div", { class: "actions" }, leiste.el,
            h("button", { class: "btn btn-ghost", type: "button", text: "zurücksetzen", onclick: zuruecksetzen })),
          raster);
        zuruecksetzen();
      },
      beenden: () => pdf && pdf.destroy()
    };
  }

  /* ---------- PDF entsperren ---------- */
  function entsperren(body) {
    return { async dateien([datei]) {
      const schutz = await pruefeSchutz(datei);
      const kopf = schutz.seiten ? dateiInfo(datei, schutz.seiten) : h("p", { class: "small muted" }, h("b", { text: datei.name }));
      if (!schutz.verschluesselt) {
        body.append(kopf, h("p", { class: "note", text: "Diese PDF ist nicht geschützt – hier gibt es nichts zu entsperren." }));
        return;
      }
      const brauchtPasswort = schutz.passwort;

      const pw = h("input", { class: "inp", type: "password", autocomplete: "off", placeholder: "Passwort" });
      const leiste = aktionsLeiste("PDF entsperren", async () => {
        if (brauchtPasswort && !pw.value) throw new Error("Bitte das Passwort eingeben.");
        if (brauchtPasswort) (await oeffneJs(datei, pw.value)).destroy();   // wirft „Falsches Passwort.“
        const args = ["--decrypt"];
        if (pw.value) args.push("--password=" + pw.value);
        const ergebnis = await qpdf(args.concat(["/in.pdf", "/out.pdf"]), datei.bytes);
        download(ergebnis, `${basisName(datei.name)}_entsperrt.pdf`);
        return "Schutz entfernt ✓";
      });
      pw.addEventListener("keydown", e => { if (e.key === "Enter") leiste.btn.click(); });

      body.append(
        kopf,
        brauchtPasswort
          ? panel("passwort zum öffnen", h("div", { class: "pw-wrap" }, pw),
              h("p", { class: "small muted", text: "Ohne das richtige Passwort lässt sich die PDF nicht entsperren." }))
          : h("p", { class: "note", text: "Die PDF lässt sich ohne Passwort öffnen, ist aber gegen Drucken, Kopieren oder Bearbeiten gesperrt. Diese Sperre wird entfernt." }),
        leiste.el);
      if (brauchtPasswort) pw.focus();
    } };
  }

  /* ---------- PDF schützen ---------- */
  function schuetzen(body) {
    return { async dateien([datei]) {
      const schutz = await pruefeSchutz(datei);
      if (schutz.verschluesselt) throw new Error("Diese PDF ist schon geschützt. Entsperre sie zuerst, wenn du ein neues Passwort setzen willst.");

      const pw1 = h("input", { class: "inp", type: "password", autocomplete: "new-password", placeholder: "Passwort" });
      const pw2 = h("input", { class: "inp", type: "password", autocomplete: "new-password", placeholder: "Passwort wiederholen" });
      const zeigen = h("input", { type: "checkbox", onchange: e => { pw1.type = pw2.type = e.target.checked ? "text" : "password"; } });

      const leiste = aktionsLeiste("PDF schützen", async () => {
        if (!pw1.value) throw new Error("Bitte ein Passwort eingeben.");
        if (pw1.value !== pw2.value) throw new Error("Die Passwörter stimmen nicht überein.");
        const ergebnis = await qpdf(["/in.pdf", "--encrypt", "--user-password=" + pw1.value,
          "--owner-password=" + pw1.value, "--bits=256", "--", "/out.pdf"], datei.bytes);
        download(ergebnis, `${basisName(datei.name)}_geschuetzt.pdf`);
        return "PDF mit Passwort geschützt (AES-256) ✓";
      });
      pw2.addEventListener("keydown", e => { if (e.key === "Enter") leiste.btn.click(); });

      body.append(
        dateiInfo(datei, schutz.seiten),
        panel("passwort festlegen",
          h("div", { class: "pw-wrap" }, pw1, pw2),
          h("label", { class: "radio small" }, zeigen, "Passwort anzeigen"),
          h("p", { class: "small muted", text: "Die PDF lässt sich danach nur noch mit diesem Passwort öffnen. Merke es dir gut – vergessene Passwörter kann niemand wiederherstellen." })),
        leiste.el);
      pw1.focus();
    } };
  }

  /* ---------- PDF unterschreiben ---------- */
  const SCHRIFTEN = [
    { name: "Schreibschrift", css: '"Segoe Script", "Brush Script MT", "Apple Chancery", "URW Chancery L", cursive' },
    { name: "Handschrift", css: '"Lucida Handwriting", "Bradley Hand", "Comic Sans MS", cursive' },
    { name: "Kursiv", css: 'Georgia, "Times New Roman", serif', stil: "italic " }
  ];
  const FARBEN = [{ name: "schwarz", wert: "#111111" }, { name: "blau", wert: "#1d3fa8" }];

  // Bereich mit Inhalt (nicht transparent) ausschneiden
  function zuschneiden(canvas) {
    const ctx = canvas.getContext("2d");
    const { width: w, height: hh } = canvas;
    const d = ctx.getImageData(0, 0, w, hh).data;
    let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const rand = 4;
    x0 = Math.max(0, x0 - rand); y0 = Math.max(0, y0 - rand);
    x1 = Math.min(w - 1, x1 + rand); y1 = Math.min(hh - 1, y1 + rand);
    const aus = h("canvas", { width: x1 - x0 + 1, height: y1 - y0 + 1 });
    aus.getContext("2d").drawImage(canvas, x0, y0, aus.width, aus.height, 0, 0, aus.width, aus.height);
    return aus;
  }

  function unterschriftErstellen(fertig) {
    let farbe = FARBEN[0].wert, reiter = "zeichnen";

    // Zeichnen
    const pad = h("canvas", { class: "sig-pad" });
    let striche = [], strich = null;
    function padGroesse() {
      const r = pad.getBoundingClientRect();
      if (!r.width) return;
      pad.width = Math.round(r.width * DPR);
      pad.height = Math.round(r.height * DPR);
      padZeichnen();
    }
    function padZeichnen() {
      const ctx = pad.getContext("2d");
      ctx.clearRect(0, 0, pad.width, pad.height);
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.lineWidth = 2.6 * DPR;
      ctx.strokeStyle = farbe;
      for (const s of striche) {
        ctx.beginPath();
        s.forEach((p, i) => {
          const x = p.x * pad.width, y = p.y * pad.height;
          if (i === 0) ctx.moveTo(x, y);
          else {
            const v = s[i - 1];
            ctx.quadraticCurveTo(v.x * pad.width, v.y * pad.height, (v.x * pad.width + x) / 2, (v.y * pad.height + y) / 2);
          }
        });
        if (s.length === 1) ctx.lineTo(s[0].x * pad.width + 0.1, s[0].y * pad.height);
        ctx.stroke();
      }
    }
    const padPunkt = e => {
      const r = pad.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    pad.addEventListener("pointerdown", e => {
      strich = [padPunkt(e)];
      striche.push(strich);
      pad.setPointerCapture(e.pointerId);
      padZeichnen();
    });
    pad.addEventListener("pointermove", e => {
      if (!strich) return;
      strich.push(padPunkt(e));
      padZeichnen();
    });
    pad.addEventListener("pointerup", () => { strich = null; });
    new ResizeObserver(padGroesse).observe(pad);

    // Tippen
    const name = h("input", { class: "inp", type: "text", placeholder: "Dein Name", style: "font-family: var(--font-sans); flex: 1 1 220px" });
    const schrift = h("select", { class: "inp" }, SCHRIFTEN.map((s, i) => h("option", { value: i, text: s.name })));

    // Bild
    const bildInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
    const weissWeg = h("input", { type: "checkbox", checked: true });
    let bild = null;
    bildInput.addEventListener("change", () => {
      const f = bildInput.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => { bild = img; URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(f);
    });

    const bereiche = {
      zeichnen: h("div", { class: "opts" }, pad,
        h("div", { class: "row" }, h("button", { class: "btn btn-ghost", type: "button", text: "löschen",
          onclick: () => { striche = []; padZeichnen(); } }))),
      tippen: h("div", { class: "row" }, name, schrift),
      bild: h("div", { class: "opts" }, bildInput,
        h("label", { class: "radio small" }, weissWeg, "weißen Hintergrund entfernen (bei eingescannten Unterschriften)"))
    };

    function erzeuge() {
      let c;
      if (reiter === "zeichnen") {
        c = h("canvas", { width: pad.width, height: pad.height });
        c.getContext("2d").drawImage(pad, 0, 0);
      } else if (reiter === "tippen") {
        if (!name.value.trim()) return null;
        const s = SCHRIFTEN[+schrift.value];
        c = h("canvas", { width: 1600, height: 260 });
        const ctx = c.getContext("2d");
        ctx.font = `${s.stil || ""}120px ${s.css}`;
        ctx.fillStyle = farbe;
        ctx.textBaseline = "middle";
        ctx.fillText(name.value.trim(), 20, 130, 1560);
      } else {
        if (!bild) return null;
        const skala = Math.min(1, 1600 / bild.naturalWidth);
        c = h("canvas", { width: Math.round(bild.naturalWidth * skala), height: Math.round(bild.naturalHeight * skala) });
        const ctx = c.getContext("2d");
        ctx.drawImage(bild, 0, 0, c.width, c.height);
        if (weissWeg.checked) {
          const daten = ctx.getImageData(0, 0, c.width, c.height);
          const d = daten.data;
          for (let i = 0; i < d.length; i += 4) {
            const hell = Math.min(d[i], d[i + 1], d[i + 2]);
            if (hell > 225) d[i + 3] = 0;
            else if (hell > 180) d[i + 3] = Math.round(d[i + 3] * (225 - hell) / 45);
          }
          ctx.putImageData(daten, 0, 0);
        }
      }
      return zuschneiden(c);
    }

    const tabs = h("div", { class: "tabs" });
    const flaeche = h("div");
    function zeigeReiter(r) {
      reiter = r;
      tabs.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.r === r));
      flaeche.replaceChildren(bereiche[r]);
      if (r === "zeichnen") padGroesse();
    }
    ["zeichnen", "tippen", "bild"].forEach(r =>
      tabs.append(h("button", { class: "chip", type: "button", "data-r": r, text: r, onclick: () => zeigeReiter(r) })));

    const farbWahl = h("div", { class: "row" }, h("span", { class: "small muted", text: "Farbe:" }),
      FARBEN.map(f => h("button", { class: "swatch", type: "button", title: f.name, "aria-label": f.name,
        "aria-pressed": f.wert === farbe, style: `background: ${f.wert}`,
        onclick: e => {
          farbe = f.wert;
          farbWahl.querySelectorAll(".swatch").forEach(s => s.setAttribute("aria-pressed", s === e.currentTarget));
          padZeichnen();
        } })));

    const vorschau = h("img", { class: "sig-preview", alt: "Unterschrift", hidden: true });
    const status = h("span", { class: "status" });
    const uebernehmen = h("button", { class: "btn", type: "button", text: "Unterschrift übernehmen" });
    uebernehmen.addEventListener("click", async () => {
      const c = erzeuge();
      if (!c) {
        status.className = "status bad";
        status.textContent = reiter === "zeichnen" ? "Erst unterschreiben." : reiter === "tippen" ? "Erst den Namen eingeben." : "Erst ein Bild wählen.";
        return;
      }
      vorschau.src = c.toDataURL("image/png");
      vorschau.hidden = false;
      status.className = "status ok";
      status.textContent = "✓ jetzt auf die Seite klicken, um sie zu platzieren";
      fertig({ url: vorschau.src, bytes: await canvasBytes(c, "image/png"), verhaeltnis: c.height / c.width });
    });

    const el = panel("1 · unterschrift erstellen", tabs, flaeche, farbWahl,
      h("div", { class: "row" }, uebernehmen, vorschau, status));
    zeigeReiter("zeichnen");
    return el;
  }

  function unterschreiben(body) {
    let ansicht;
    return {
      async dateien([datei]) {
        const pdf = await oeffneJs(datei);
        let unterschrift = null;

        const leiste = aktionsLeiste("PDF unterschreiben", async () => {
          if (!ansicht.anzahl()) throw new Error("Platziere die Unterschrift zuerst auf einer Seite.");
          const doc = await oeffneLib(datei);
          const eingebettet = new Map();
          for (const [index, liste] of ansicht.objekte) {
            if (!liste.length) continue;
            const seite = doc.getPage(index);
            const jsSeite = await pdf.getPage(index + 1);
            const vp = jsSeite.getViewport({ scale: 1 });
            const dreh = ((jsSeite.rotate % 360) + 360) % 360;
            for (const o of liste) {
              if (!eingebettet.has(o.sig)) eingebettet.set(o.sig, await doc.embedPng(o.sig.bytes));
              // Ansichtskoordinaten (oben links, ggf. gedreht) -> PDF-Koordinaten
              const [ax, ay] = vp.convertToPdfPoint(o.x * vp.width, o.y * vp.height);
              const [bx, by] = vp.convertToPdfPoint((o.x + o.w) * vp.width, (o.y + o.h) * vp.height);
              const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
              // Bei gedrehten Seiten das Bild gegenläufig drehen, damit es aufrecht erscheint
              const anker = { 0: [x0, y0], 90: [x1, y0], 180: [x1, y1], 270: [x0, y1] }[dreh];
              seite.drawImage(eingebettet.get(o.sig), {
                x: anker[0], y: anker[1],
                width: o.w * vp.width, height: o.h * vp.height,
                rotate: degrees(dreh)
              });
            }
          }
          download(await doc.save(), `${basisName(datei.name)}_unterschrieben.pdf`);
          return "Unterschrift eingefügt ✓";
        });

        ansicht = seitenAnsicht(pdf, {
          neu(p, seitenVerhaeltnis) {
            if (!unterschrift) return null;
            const w = 0.28, hh = w * unterschrift.verhaeltnis * seitenVerhaeltnis;
            const o = { sig: unterschrift, verhaeltnis: unterschrift.verhaeltnis, w, h: hh,
              x: clamp(p.x - w / 2, 0, 1 - w), y: clamp(p.y - hh / 2, 0, 1 - hh) };
            return { o, art: "schieben" };
          },
          erzeuge: o => h("div", { class: "item sig" }, h("img", { src: o.sig.url, alt: "" }), loeschKnopf(), h("span", { class: "rz" })),
          geaendert() { leiste.btn.disabled = !ansicht || !ansicht.anzahl(); }
        });

        body.append(
          dateiInfo(datei, pdf.numPages),
          unterschriftErstellen(sig => { unterschrift = sig; }),
          panel("2 · auf der seite platzieren",
            h("p", { class: "small muted", text: "Auf die Seite klicken, um die Unterschrift einzufügen. Ziehen zum Verschieben, Ecke unten rechts für die Größe, × zum Entfernen. Du kannst auf mehreren Seiten unterschreiben." }),
            ansicht.el),
          leiste.el);
        await ansicht.start();
      },
      beenden: () => ansicht && ansicht.beenden()
    };
  }

  /* ---------- PDF schwärzen ----------
     Ein schwarzes Rechteck über Text reicht nicht – der Text wäre darunter weiter vorhanden
     und kopierbar. Deshalb wird jede Seite mit Schwärzungen als Bild neu erzeugt.
     Seiten ohne Schwärzung bleiben unverändert. */
  const SCHWAERZ_DPI = 180;

  function schwaerzen(body) {
    let ansicht;
    return {
      async dateien([datei]) {
        const pdf = await oeffneJs(datei);

        const leiste = aktionsLeiste("PDF schwärzen", async status => {
          if (!ansicht.anzahl()) throw new Error("Ziehe zuerst Rechtecke über die Stellen, die geschwärzt werden sollen.");
          const geschwaerzt = i => (ansicht.objekte.get(i) || []).length > 0;
          const quelle = await oeffneLib(datei);
          const ziel = await PDFDocument.create();
          // Nur die unveränderten Seiten kopieren – sonst landen die Originalinhalte doch in der Datei
          const behalten = quelle.getPageIndices().filter(i => !geschwaerzt(i));
          const kopien = await ziel.copyPages(quelle, behalten);
          let k = 0, anzahl = 0;
          for (let i = 0; i < pdf.numPages; i++) {
            if (!geschwaerzt(i)) { ziel.addPage(kopien[k++]); continue; }
            status.textContent = `schwärze Seite ${i + 1} …`;
            const jsSeite = await pdf.getPage(i + 1);
            const vp1 = jsSeite.getViewport({ scale: 1 });
            const skala = Math.min(SCHWAERZ_DPI / 72, 5000 / Math.max(vp1.width, vp1.height));
            const vp = jsSeite.getViewport({ scale: skala });
            const c = h("canvas", { width: Math.round(vp.width), height: Math.round(vp.height) });
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, c.width, c.height);
            await jsSeite.render({ canvasContext: ctx, viewport: vp }).promise;
            ctx.fillStyle = "#000";
            for (const o of ansicht.objekte.get(i)) {
              ctx.fillRect(Math.floor(o.x * c.width), Math.floor(o.y * c.height), Math.ceil(o.w * c.width) + 1, Math.ceil(o.h * c.height) + 1);
            }
            const bild = await ziel.embedJpg(await canvasBytes(c, "image/jpeg", 0.92));
            const seite = ziel.addPage([vp1.width, vp1.height]);
            seite.drawImage(bild, { x: 0, y: 0, width: vp1.width, height: vp1.height });
            anzahl++;
          }
          download(await ziel.save(), `${basisName(datei.name)}_geschwaerzt.pdf`);
          return `${ansicht.anzahl()} Stelle${ansicht.anzahl() === 1 ? "" : "n"} auf ${anzahl} Seite${anzahl === 1 ? "" : "n"} geschwärzt ✓`;
        });

        ansicht = seitenAnsicht(pdf, {
          zeichnen: true,
          neu: p => ({ o: { x: p.x, y: p.y, w: 0, h: 0 }, art: "aufziehen" }),
          erzeuge: () => h("div", { class: "item box" }, loeschKnopf(), h("span", { class: "rz" })),
          geaendert() { leiste.btn.disabled = !ansicht || !ansicht.anzahl(); }
        });

        body.append(
          dateiInfo(datei, pdf.numPages),
          h("p", { class: "note", text: "Seiten mit Schwärzungen werden in ein Bild umgewandelt. So ist der Text darunter wirklich gelöscht – auf diesen Seiten lässt sich danach aber auch kein anderer Text mehr markieren oder durchsuchen." }),
          panel("bereiche markieren",
            h("p", { class: "small muted", text: "Mit der Maus (oder dem Finger) Rechtecke über die Stellen ziehen. Ziehen verschiebt, Ecke unten rechts ändert die Größe, × entfernt." }),
            ansicht.el),
          h("div", { class: "actions" }, leiste.el,
            h("button", { class: "btn btn-ghost", type: "button", text: "alle schwärzungen entfernen", onclick: () => ansicht.leeren() })));
        await ansicht.start();
      },
      beenden: () => ansicht && ansicht.beenden()
    };
  }

  /* ==========================================================
     Werkzeug-Liste, Auswahl und Datei-Annahme
     ========================================================== */
  const ICON = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const WERKZEUGE = [
    { id: "zusammenfuegen", titel: "PDF zusammenfügen", text: "Mehrere PDFs in der gewünschten Reihenfolge zu einer Datei verbinden.",
      icon: '<path d="M4 4h8v11H4z"/><path d="M12 9h8v11h-8z"/>', start: zusammenfuegen },
    { id: "teilen", titel: "PDF teilen", text: "Eine PDF in einzelne Seiten oder Seitenbereiche aufteilen.",
      icon: '<path d="M6 3h12v6H6zM6 15h12v6H6z"/><path d="M3 12h3m3 0h2m3 0h2m3 0h2" />', start: teilen },
    { id: "entfernen", titel: "Seiten entfernen", text: "Einzelne Seiten aus einer PDF löschen.",
      icon: '<path d="M6 3h12v18H6z"/><path d="M9.5 10.5l5 5m0-5l-5 5"/>', start: entfernen },
    { id: "extrahieren", titel: "Seiten extrahieren", text: "Ausgewählte Seiten als neue PDF speichern.",
      icon: '<path d="M14 3H5v18h9"/><path d="M11 12h10m-3-3l3 3-3 3"/>', start: extrahieren },
    { id: "organisieren", titel: "PDF organisieren", text: "Seiten umsortieren, drehen und löschen.",
      icon: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>', start: organisieren },
    { id: "entsperren", titel: "PDF entsperren", text: "Passwort und Sperren (Drucken, Kopieren) entfernen.",
      icon: '<path d="M5 11h14v10H5z"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/>', start: entsperren },
    { id: "schuetzen", titel: "PDF schützen", text: "PDF mit einem Passwort verschlüsseln (AES-256).",
      icon: '<path d="M5 11h14v10H5z"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/>', start: schuetzen },
    { id: "unterschreiben", titel: "PDF unterschreiben", text: "Unterschrift zeichnen, tippen oder als Bild einfügen.",
      icon: '<path d="M3 20h18"/><path d="M5 16l10-10 3 3-10 10H5z"/>', start: unterschreiben },
    { id: "schwaerzen", titel: "PDF schwärzen", text: "Stellen dauerhaft unkenntlich machen.",
      icon: '<path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h5M8 16h8" stroke-width="2.8"/>', start: schwaerzen }
  ];

  const auswahl = document.getElementById("auswahl");
  const bereich = document.getElementById("arbeitsbereich");
  const wsBody = document.getElementById("wsBody");
  const drop = document.getElementById("drop");
  const fileInput = document.getElementById("fileInput");
  const dropTitel = document.getElementById("dropTitel");
  let werkzeug = null, instanz = null, kette = Promise.resolve();

  document.getElementById("toolGrid").append(...WERKZEUGE.map(w =>
    h("a", { class: "card tool-card", href: "#" + w.id },
      h("span", { class: "ico", html: ICON(w.icon) }),
      h("h3", { text: w.titel }),
      h("p", { text: w.text }))));

  function starte() {
    if (instanz && instanz.beenden) instanz.beenden();
    wsBody.replaceChildren();
    instanz = werkzeug.start(wsBody);
    fileInput.multiple = !!instanz.mehrere;
    fileInput.value = "";
    drop.classList.remove("small-drop");
    dropTitel.textContent = instanz.mehrere ? "PDFs auswählen" : "PDF auswählen";
  }

  function route() {
    const w = WERKZEUGE.find(x => "#" + x.id === location.hash);
    if (!w) {
      if (instanz && instanz.beenden) instanz.beenden();
      werkzeug = instanz = null;
      wsBody.replaceChildren();
      bereich.hidden = true;
      auswahl.hidden = false;
      document.title = "PDF-Editor · Unterricht";
      return;
    }
    werkzeug = w;
    auswahl.hidden = true;
    bereich.hidden = false;
    document.getElementById("wsTitel").textContent = w.titel;
    document.getElementById("wsText").textContent = w.text;
    document.title = w.titel + " · PDF-Editor";
    starte();
    window.scrollTo(0, 0);
  }

  // Dateien nacheinander verarbeiten, damit schnelles Mehrfach-Ablegen nichts durcheinanderbringt
  function nimmDateien(files) {
    if (!werkzeug || !files.length) return;
    kette = kette.then(async () => {
      try {
        const liste = instanz.mehrere ? [...files] : [files[0]];
        const dateien = [];
        for (const f of liste) dateien.push(await ladeDatei(f));
        if (!instanz.mehrere) starte();
        drop.classList.add("small-drop");
        dropTitel.textContent = instanz.mehrere ? "weitere PDFs hinzufügen" : "andere PDF wählen";
        await instanz.dateien(dateien);
      } catch (e) {
        console.error(e);
        if (!instanz.mehrere) wsBody.replaceChildren();
        wsBody.append(h("p", { class: "status bad", text: e.message }));
      }
    });
  }

  document.getElementById("wsZurueck").addEventListener("click", () => { location.hash = ""; });
  fileInput.addEventListener("change", () => { nimmDateien(fileInput.files); fileInput.value = ""; });

  // Dateien überall auf der Seite ablegen können, ohne dass der Browser die PDF selbst öffnet
  const hatDateien = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  document.addEventListener("dragover", e => {
    if (!hatDateien(e)) return;
    e.preventDefault();
    if (werkzeug) drop.classList.add("over");
  });
  document.addEventListener("dragleave", e => { if (!e.relatedTarget) drop.classList.remove("over"); });
  document.addEventListener("drop", e => {
    if (!hatDateien(e)) return;
    e.preventDefault();
    drop.classList.remove("over");
    nimmDateien(e.dataTransfer.files);
  });

  window.addEventListener("hashchange", route);
  route();
})();
