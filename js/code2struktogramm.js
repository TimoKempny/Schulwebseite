/* ==========================================================
   code2struktogramm.js – liest Python- oder C-Code und baut daraus
   Struktogramm-Blöcke für struktogramm.html.

   CodeZuStruktogramm.umwandeln(code, { sprache: "auto"|"python"|"c", pseudo: true })
   liefert { sprache, programme: [{ name, root }], hinweise: [] }.
   Die Blöcke haben dieselbe Form wie im Editor (statement, call, if,
   switch, for, while, dowhile), nur ohne id – die vergibt der Editor.
   ========================================================== */
(function (global) {
  "use strict";

  /* ---------- Gemeinsame Hilfen ---------- */

  // Teilt einen Ausdruck in Code- und String-Stücke, damit Ersetzungen keine Strings verändern
  function stuecke(s) {
    var out = [], i = 0, start = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === '"' || c === "'") {
        if (i > start) out.push({ code: true, s: s.slice(start, i) });
        var j = i + 1;
        while (j < s.length && s[j] !== c) { if (s[j] === "\\") j++; j++; }
        out.push({ code: false, s: s.slice(i, j + 1) });
        i = start = j + 1;
      } else i++;
    }
    if (start < s.length) out.push({ code: true, s: s.slice(start) });
    return out;
  }
  function nurCode(s, fn) { return stuecke(s).map(function (p) { return p.code ? fn(p.s) : p.s; }).join(""); }

  // Trennt an einem Zeichen, aber nur außerhalb von Klammern und Strings
  function trenneOben(s, zeichen) {
    var teile = [], tiefe = 0, akt = "", i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === '"' || c === "'") {
        var j = i + 1;
        while (j < s.length && s[j] !== c) { if (s[j] === "\\") j++; j++; }
        akt += s.slice(i, j + 1); i = j + 1; continue;
      }
      if ("([{".indexOf(c) >= 0) tiefe++;
      else if (")]}".indexOf(c) >= 0) tiefe--;
      if (c === zeichen && tiefe === 0) { teile.push(akt); akt = ""; } else akt += c;
      i++;
    }
    teile.push(akt);
    return teile;
  }
  // Index des ersten Zeichens außerhalb von Klammern und Strings (oder -1)
  function findeOben(s, test) {
    var tiefe = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '"' || c === "'") { var j = i + 1; while (j < s.length && s[j] !== c) { if (s[j] === "\\") j++; j++; } i = j; continue; }
      if ("([{".indexOf(c) >= 0) tiefe++;
      else if (")]}".indexOf(c) >= 0) tiefe--;
      else if (tiefe === 0 && test(s, i)) return i;
    }
    return -1;
  }
  // Position eines einzelnen "=" (Zuweisung, nicht ==, <=, >=, !=)
  function zuweisungsIndex(s) {
    return findeOben(s, function (t, i) {
      return t[i] === "=" && t[i + 1] !== "=" && "=<>!+-*/%&|^:".indexOf(t[i - 1] || " ") < 0;
    });
  }
  function ohneAussenklammern(s) {
    s = s.trim();
    while (s[0] === "(" && s[s.length - 1] === ")" && findeOben(s.slice(1, -1), function () { return false; }) === -1) {
      // nur entfernen, wenn die Klammern zusammengehören
      var tiefe = 0, ok = true;
      for (var i = 0; i < s.length - 1; i++) { if (s[i] === "(") tiefe++; else if (s[i] === ")") tiefe--; if (tiefe === 0) { ok = false; break; } }
      if (!ok) break;
      s = s.slice(1, -1).trim();
    }
    return s;
  }
  function leer(s) { return s.replace(/\s+/g, " ").trim(); }
  function minusEins(s) {
    s = s.trim();
    if (/^-?\d+$/.test(s)) return String(parseInt(s, 10) - 1);
    var m = /^(.*\S)\s*\+\s*1$/.exec(s); if (m) return m[1];
    return s + " - 1";
  }
  function plusEins(s) {
    s = s.trim();
    if (/^-?\d+$/.test(s)) return String(parseInt(s, 10) + 1);
    var m = /^(.*\S)\s*-\s*1$/.exec(s); if (m) return m[1];
    return s + " + 1";
  }

  // Operatoren in lesbare Pseudocode-Zeichen übersetzen
  function ausdruck(s, sprache, pseudo) {
    s = leer(s);
    if (!pseudo) return s;
    return leer(nurCode(s, function (t) {
      t = t.replace(/!=/g, "≠").replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/==/g, "=");
      if (sprache === "c") {
        t = t.replace(/&&/g, " und ").replace(/\|\|/g, " oder ").replace(/!(?!=)/g, "nicht ");
        t = t.replace(/\btrue\b/g, "wahr").replace(/\bfalse\b/g, "falsch");
        t = t.replace(/\(\s*(?:int|float|double|char|long)\s*\)\s*/g, "");   // Typumwandlung weglassen
      } else {
        t = t.replace(/\band\b/g, "und").replace(/\bor\b/g, "oder").replace(/\bnot\b/g, "nicht");
        t = t.replace(/\bTrue\b/g, "wahr").replace(/\bFalse\b/g, "falsch");
        t = t.replace(/\/\//g, " div ").replace(/\*\*/g, "^");
      }
      t = t.replace(/%/g, " mod ");
      return t;
    }));
  }

  /* ---------- Python einlesen ---------- */

  // Code in logische Zeilen zerlegen: Kommentare raus, Klammer- und \-Fortsetzungen zusammenfügen
  function pyZeilen(code) {
    var zeilen = [], akt = "", einr = -1, nr = 1, startNr = 1, tiefe = 0, i = 0, zeilenStart = true;
    code = code.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
    function abschliessen() {
      if (akt.trim()) zeilen.push({ einr: einr, text: akt.trim(), nr: startNr });
      akt = ""; einr = -1; tiefe = 0; zeilenStart = true;
    }
    while (i < code.length) {
      var c = code[i];
      if (zeilenStart) {
        var j = i; while (code[j] === " ") j++;
        if (code[j] === "\n" || code[j] === "#" || j >= code.length) {
          // Leer- oder Kommentarzeile
          while (j < code.length && code[j] !== "\n") j++;
          i = j + 1; nr++; continue;
        }
        einr = j - i; startNr = nr; i = j; zeilenStart = false; continue;
      }
      if (c === "#") { while (i < code.length && code[i] !== "\n") i++; continue; }
      if (c === '"' || c === "'") {
        var drei = code.substr(i, 3) === c + c + c, ende = drei ? c + c + c : c, k = i + (drei ? 3 : 1);
        while (k < code.length && code.substr(k, ende.length) !== ende) { if (code[k] === "\\") k++; if (code[k] === "\n") nr++; k++; }
        akt += code.slice(i, k + ende.length).replace(/\n/g, " ");
        i = k + ende.length; continue;
      }
      if (c === "\\" && code[i + 1] === "\n") { i += 2; nr++; akt += " "; continue; }
      if ("([{".indexOf(c) >= 0) tiefe++;
      if (")]}".indexOf(c) >= 0) tiefe = Math.max(0, tiefe - 1);
      if (c === "\n") {
        nr++;
        if (tiefe > 0) { akt += " "; i++; continue; }
        abschliessen(); i++; continue;
      }
      akt += c; i++;
    }
    abschliessen();
    return zeilen;
  }

  var PY_KOPF = /^(if|elif|else|while|for|def|async\s+def|class|try|except|finally|with|match|case)\b/;

  function pyParse(code, hinweise) {
    var zeilen = pyZeilen(code), pos = 0, funktionen = [];

    function kopf(text) {
      var m = PY_KOPF.exec(text); if (!m) return null;
      var dp = findeOben(text, function (t, i) { return t[i] === ":" && t[i + 1] !== "="; });
      if (dp < 0) return null;
      return { wort: m[1].replace(/\s+/g, " "), rest: text.slice(m[0].length, dp).trim(), inline: text.slice(dp + 1).trim() };
    }
    function einfach(text, nr) {
      return trenneOben(text, ";").map(function (t) { return t.trim(); }).filter(Boolean).map(function (t) { return pyEinfach(t, nr); });
    }
    function pyEinfach(t, nr) {
      if (t === "pass") return null;
      if (t === "break") return { art: "break" };
      if (t === "continue") return { art: "continue" };
      var m = /^return\b\s*(.*)$/.exec(t); if (m) return { art: "return", wert: m[1] };
      if (/^(import|from)\s/.test(t)) return null;
      if (/^(global|nonlocal)\s/.test(t)) return null;
      if (/^["'].*["']$/.test(t)) return null;   // Docstring
      return { art: "einfach", text: t, nr: nr };
    }
    // Körper eines Kopfes: entweder in derselben Zeile oder eingerückt darunter
    function koerper(k, einr) {
      if (k.inline) return einfach(k.inline, zeilen[pos - 1].nr);
      if (pos < zeilen.length && zeilen[pos].einr > einr) return block(zeilen[pos].einr);
      hinweise.push("Zeile " + zeilen[pos - 1].nr + ": Block ohne eingerückten Inhalt");
      return [];
    }
    function block(einr) {
      var knoten = [];
      while (pos < zeilen.length && zeilen[pos].einr >= einr) {
        var z = zeilen[pos];
        if (z.einr > einr) { hinweise.push("Zeile " + z.nr + ": unerwartete Einrückung"); knoten = knoten.concat(block(z.einr)); continue; }
        var k = kopf(z.text);
        pos++;
        if (!k) { knoten = knoten.concat(einfach(z.text, z.nr)); continue; }
        switch (k.wort) {
          case "if": knoten.push(pyIf(k, einr)); break;
          case "while": {
            var wb = koerper(k, einr);
            knoten.push({ art: "while", bed: k.rest, body: wb });
            sonstWeg(einr, "while");
            break;
          }
          case "for": {
            var fm = /^(.+?)\s+in\s+(.+)$/.exec(k.rest);
            var fb = koerper(k, einr);
            knoten.push({ art: "for", py: fm ? { ziel: fm[1].trim(), quelle: fm[2].trim() } : null, roh: "for " + k.rest, body: fb });
            sonstWeg(einr, "for");
            break;
          }
          case "def": case "async def": {
            var dm = /^(\w+)\s*\((.*)\)\s*(->.*)?$/.exec(k.rest);
            var db = koerper(k, einr);
            funktionen.push({ name: dm ? dm[1] : k.rest, params: dm ? leer(dm[2]) : "", body: db });
            break;
          }
          case "class": {
            var klasse = k.rest.replace(/\(.*\)$/, "").trim();
            var vorher = funktionen.length;
            koerper(k, einr);
            for (var f = vorher; f < funktionen.length; f++) funktionen[f].name = klasse + "." + funktionen[f].name;
            hinweise.push("Zeile " + z.nr + ": Klasse " + klasse + " – nur ihre Methoden werden als eigene Struktogramme übernommen");
            break;
          }
          case "try": {
            knoten = knoten.concat(koerper(k, einr));
            var bloecke = [];
            while (pos < zeilen.length && zeilen[pos].einr === einr) {
              var k2 = kopf(zeilen[pos].text);
              if (!k2 || (k2.wort !== "except" && k2.wort !== "finally" && k2.wort !== "else")) break;
              pos++;
              var inhalt = koerper(k2, einr);
              if (k2.wort === "finally") knoten = knoten.concat(inhalt); else bloecke.push(k2.wort);
            }
            hinweise.push("Zeile " + z.nr + ": try/except vereinfacht – dargestellt ist nur der normale Ablauf");
            break;
          }
          case "with": {
            var wm = /^(.+?)\s+as\s+(\w+)$/.exec(k.rest);
            knoten.push({ art: "einfach", text: wm ? wm[2] + " = " + wm[1] : k.rest, nr: z.nr });
            knoten = knoten.concat(koerper(k, einr));
            break;
          }
          case "match": {
            var faelle = [];
            var mEinr = pos < zeilen.length ? zeilen[pos].einr : einr + 4;
            while (pos < zeilen.length && zeilen[pos].einr === mEinr) {
              var kc = kopf(zeilen[pos].text);
              if (!kc || kc.wort !== "case") break;
              pos++;
              faelle.push({ labels: [kc.rest], sonst: kc.rest === "_", body: koerper(kc, mEinr) });
            }
            knoten.push({ art: "switch", ausdruck: k.rest, faelle: faelle });
            break;
          }
          default:
            hinweise.push("Zeile " + z.nr + ": „" + k.wort + "“ ohne passenden Anfang");
            koerper(k, einr);
        }
      }
      return knoten;
    }
    function pyIf(k, einr) {
      var knoten = { art: "if", bed: k.rest, ja: koerper(k, einr), nein: [] };
      if (pos < zeilen.length && zeilen[pos].einr === einr) {
        var k2 = kopf(zeilen[pos].text);
        if (k2 && k2.wort === "elif") { pos++; knoten.nein = [pyIf(k2, einr)]; }
        else if (k2 && k2.wort === "else") { pos++; knoten.nein = koerper(k2, einr); }
      }
      return knoten;
    }
    function sonstWeg(einr, wort) {
      if (pos < zeilen.length && zeilen[pos].einr === einr) {
        var k2 = kopf(zeilen[pos].text);
        if (k2 && k2.wort === "else") {
          pos++; koerper(k2, einr);
          hinweise.push("Zeile " + zeilen[pos - 1].nr + ": else nach " + wort + " wird nicht dargestellt");
        }
      }
    }

    var haupt = block(zeilen.length ? zeilen[0].einr : 0);
    while (pos < zeilen.length) { hinweise.push("Zeile " + zeilen[pos].nr + ": Einrückung passt nicht"); pos++; haupt = haupt.concat(block(zeilen[pos - 1].einr)); }
    return { haupt: haupt, funktionen: funktionen };
  }

  /* ---------- C einlesen ---------- */

  function cOhneKommentare(code) {
    var out = "", i = 0;
    code = code.replace(/\r\n?/g, "\n");
    while (i < code.length) {
      var c = code[i];
      if (c === '"' || c === "'") {
        var j = i + 1;
        while (j < code.length && code[j] !== c && code[j] !== "\n") { if (code[j] === "\\") j++; j++; }
        out += code.slice(i, j + 1); i = j + 1; continue;
      }
      if (c === "/" && code[i + 1] === "/") { while (i < code.length && code[i] !== "\n") i++; continue; }
      if (c === "/" && code[i + 1] === "*") { var e = code.indexOf("*/", i + 2); var stueck = code.slice(i, e < 0 ? code.length : e + 2); out += stueck.replace(/[^\n]/g, " "); i = e < 0 ? code.length : e + 2; continue; }
      out += c; i++;
    }
    // Präprozessor-Zeilen (#include, #define …) entfernen
    return out.replace(/^[ \t]*#.*$/gm, "");
  }

  function cParse(code, hinweise) {
    var s = cOhneKommentare(code), pos = 0, funktionen = [], haupt = null;

    function nr() { return s.slice(0, pos).split("\n").length; }
    function ws() { while (pos < s.length && /\s/.test(s[pos])) pos++; }
    function wort() { ws(); var m = /^[A-Za-z_]\w*/.exec(s.slice(pos)); return m ? m[0] : ""; }
    function nimmWort(w) { ws(); if (s.slice(pos, pos + w.length) === w && !/\w/.test(s[pos + w.length] || "")) { pos += w.length; return true; } return false; }
    function zeichen(ch) { ws(); if (s[pos] === ch) { pos++; return true; } return false; }
    // Liest bis zum passenden Schlusszeichen, Strings werden übersprungen
    function bisPassend(auf, zu) {
      ws(); if (s[pos] !== auf) return "";
      var tiefe = 0, start = pos + 1;
      for (; pos < s.length; pos++) {
        var c = s[pos];
        if (c === '"' || c === "'") { var j = pos + 1; while (j < s.length && s[j] !== c) { if (s[j] === "\\") j++; j++; } pos = j; continue; }
        if (c === auf) tiefe++;
        else if (c === zu) { tiefe--; if (tiefe === 0) { pos++; return s.slice(start, pos - 1); } }
      }
      return s.slice(start);
    }
    // Liest bis zu einem der Zeichen (außerhalb von Klammern und Strings), ohne es zu verbrauchen
    function bis(zeichenliste) {
      var tiefe = 0, start = pos;
      for (; pos < s.length; pos++) {
        var c = s[pos];
        if (c === '"' || c === "'") { var j = pos + 1; while (j < s.length && s[j] !== c) { if (s[j] === "\\") j++; j++; } pos = j; continue; }
        if ("([{".indexOf(c) >= 0 && !(tiefe === 0 && zeichenliste.indexOf(c) >= 0)) tiefe++;
        else if (")]}".indexOf(c) >= 0) { if (tiefe === 0 && zeichenliste.indexOf(c) >= 0) break; tiefe--; }
        else if (tiefe === 0 && zeichenliste.indexOf(c) >= 0) break;
      }
      return s.slice(start, pos);
    }

    function anweisung() {
      ws();
      if (pos >= s.length) return [];
      var start = pos, z = nr();
      if (s[pos] === "{") {
        pos++;
        var liste = [];
        while (true) { ws(); if (pos >= s.length) break; if (s[pos] === "}") { pos++; break; } var vor = pos; liste = liste.concat(anweisung()); if (pos === vor) pos++; }
        return liste;
      }
      if (s[pos] === ";") { pos++; return []; }
      var w = wort();
      if (w === "if") {
        pos += 2; var bed = bisPassend("(", ")");
        var ja = anweisung(), nein = [];
        if (nimmWort("else")) nein = anweisung();
        return [{ art: "if", bed: bed, ja: ja, nein: nein }];
      }
      if (w === "while") {
        pos += 5; var wb = bisPassend("(", ")");
        return [{ art: "while", bed: wb, body: anweisung() }];
      }
      if (w === "do") {
        pos += 2; var db = anweisung();
        nimmWort("while"); var dbed = bisPassend("(", ")"); zeichen(";");
        return [{ art: "dowhile", bed: dbed || "", body: db }];
      }
      if (w === "for") {
        pos += 3; var kopfText = bisPassend("(", ")") || "";
        var t = trenneOben(kopfText, ";");
        return [{ art: "for", c: { init: (t[0] || "").trim(), bed: (t[1] || "").trim(), schritt: (t[2] || "").trim() }, roh: "for (" + leer(kopfText) + ")", body: anweisung() }];
      }
      if (w === "switch") {
        pos += 6; var sx = bisPassend("(", ")");
        ws(); if (s[pos] !== "{") return [{ art: "einfach", text: "switch (" + sx + ")", nr: z }];
        pos++;
        var faelle = [], akt = null;
        while (true) {
          ws(); if (pos >= s.length) break;
          if (s[pos] === "}") { pos++; break; }
          if (nimmWort("case")) {
            var label = leer(bis(":")); pos++;
            if (akt && !akt.body.length) akt.labels.push(label);
            else { akt = { labels: [label], sonst: false, body: [] }; faelle.push(akt); }
            continue;
          }
          if (nimmWort("default")) {
            ws(); pos++;
            if (akt && !akt.body.length) { akt.labels.push("sonst"); akt.sonst = true; }
            else { akt = { labels: ["sonst"], sonst: true, body: [] }; faelle.push(akt); }
            continue;
          }
          var vorher = pos, inhalt = anweisung();
          if (pos === vorher) pos++;
          if (!akt) { akt = { labels: ["?"], sonst: false, body: [] }; faelle.push(akt); }
          akt.body = akt.body.concat(inhalt);
        }
        faelle.forEach(function (f, i) {
          var letztes = f.body[f.body.length - 1];
          if (letztes && letztes.art === "break") f.body.pop();
          else if (i < faelle.length - 1 && !(letztes && letztes.art === "return")) hinweise.push("Zeile " + z + ": Fall " + f.labels.join(", ") + " ohne break – das Durchfallen zum nächsten Fall wird nicht dargestellt");
        });
        return [{ art: "switch", ausdruck: sx, faelle: faelle }];
      }
      if (w === "break") { pos += 5; zeichen(";"); return [{ art: "break" }]; }
      if (w === "continue") { pos += 8; zeichen(";"); return [{ art: "continue" }]; }
      if (w === "return") { pos += 6; var rw = bis(";"); zeichen(";"); return [{ art: "return", wert: rw.trim() }]; }
      if (w === "goto") { bis(";"); zeichen(";"); hinweise.push("Zeile " + z + ": goto lässt sich im Struktogramm nicht darstellen"); return []; }
      if (w === "else") { pos += 4; hinweise.push("Zeile " + z + ": else ohne passendes if"); return anweisung(); }
      // Ausdruck oder Deklaration bis zum Semikolon
      var text = bis(";{");
      if (s[pos] === "{") {
        // z. B. Struktur-Initialisierung: bis zum Semikolon weiterlesen
        bisPassend("{", "}"); text = s.slice(start, pos) + bis(";");
      }
      zeichen(";");
      if (!text.trim()) return [];
      return [{ art: "einfach", text: leer(text), nr: z }];
    }

    // Oberste Ebene: Funktionen, globale Deklarationen, Strukturen
    while (true) {
      ws(); if (pos >= s.length) break;
      var start = pos;
      var kopf = bis(";{");
      if (pos >= s.length) break;
      if (s[pos] === ";") { pos++; continue; }   // Deklaration oder Prototyp
      var fm = /([A-Za-z_]\w*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/.exec(kopf);
      if (fm && !/^\s*(struct|union|enum|typedef)\b/.test(kopf)) {
        var body = anweisung();
        var f = { name: fm[1], params: leer(fm[2]) === "void" ? "" : leer(fm[2]), body: body };
        if (fm[1] === "main") haupt = f; else funktionen.push(f);
      } else {
        bisPassend("{", "}"); bis(";"); pos++;
        if (/^\s*(typedef\s+)?(struct|union|enum)\b/.test(kopf)) hinweise.push("Zeile " + s.slice(0, start).split("\n").length + ": Typdefinition (" + leer(kopf).slice(0, 30) + ") wird nicht dargestellt");
      }
      if (pos === start) pos++;
    }
    if (!haupt && !funktionen.length) {
      // Kein Funktionsrahmen: Code als Folge von Anweisungen lesen
      pos = 0; var alles = [];
      while (true) { ws(); if (pos >= s.length) break; var v = pos; alles = alles.concat(anweisung()); if (pos === v) pos++; }
      return { haupt: alles, funktionen: [], ohneRahmen: true };
    }
    return { haupt: haupt ? haupt.body : [], hauptName: haupt ? "main" : "", funktionen: funktionen };
  }

  /* ---------- Übersetzen in Struktogramm-Blöcke ---------- */

  var C_TYP = /^(?:(?:const|static|unsigned|signed|long|short|volatile|register)\s+)*(?:int|float|double|char|long|short|bool|_Bool|size_t|unsigned|signed|void|FILE|struct\s+\w+)\b\s*\**\s*/;

  function uebersetzer(sprache, pseudo, eigeneFunktionen) {

    function ausgabeC(args) {
      var teile = trenneOben(args, ",").map(function (t) { return t.trim(); });
      var fmt = teile.shift() || "";
      var m = /^"((?:[^"\\]|\\.)*)"$/.exec(fmt);
      if (!m) return [ausdruck(fmt, "c", true)].concat(teile.map(function (a) { return ausdruck(a, "c", true); }));
      var stuecke = m[1].split(/(%[-+ #0]*\d*(?:\.\d+)?(?:hh|h|ll|l|L|z|j|t)?[diouxXfFeEgGcspn%])/);
      var out = [];
      stuecke.forEach(function (st, i) {
        if (i % 2 === 1) {
          if (st === "%%") { out.push('"%"'); return; }
          var a = teile.shift(); if (a !== undefined) out.push(ausdruck(a, "c", true));
        } else {
          var txt = st.replace(/\\n/g, "").replace(/\\t/g, " ");
          if (txt.length) out.push('"' + txt + '"');
        }
      });
      return out;
    }
    function ausgabePy(args) {
      return trenneOben(args, ",").map(function (t) { return t.trim(); }).filter(function (t) { return t && !/^(sep|end|file|flush)\s*=/.test(t); })
        .reduce(function (acc, a) {
          var fm = /^[fF]("|')(.*)\1$/.exec(a);
          if (!fm) { acc.push(ausdruck(a, "python", true)); return acc; }
          fm[2].split(/(\{[^{}]*\})/).forEach(function (st, i) {
            if (i % 2 === 1) acc.push(ausdruck(st.slice(1, -1).replace(/:[^:]*$/, ""), "python", true));
            else if (st) acc.push('"' + st + '"');
          });
          return acc;
        }, []);
    }

    function einfach(text) {
      var t = leer(text).replace(/;$/, "");
      if (!t) return null;
      // Aufruf einer eigenen Funktion als Unterprogramm
      var aufruf = /^([A-Za-z_][\w.]*)\s*\((.*)\)$/.exec(t);
      if (aufruf && eigeneFunktionen.has(aufruf[1].replace(/^self\./, ""))) return { type: "call", text: pseudo ? aufruf[1].replace(/^self\./, "") + "(" + leer(aufruf[2]) + ")" : t };
      if (!pseudo) return { type: "statement", text: t };

      if (sprache === "python") {
        var m = /^print\s*\((.*)\)$/.exec(t);
        if (m) { var a = ausgabePy(m[1]); return { type: "statement", text: a.length ? "Ausgabe " + a.join(", ") : "Ausgabe Zeilenumbruch" }; }
        m = /^(.+?)\s*=\s*(?:int|float|str|eval)?\s*\(?\s*input\s*\((.*)\)\s*\)?$/.exec(t);
        if (m && zuweisungsIndex(t) >= 0) return { type: "statement", text: "Eingabe " + m[1].trim() };
        if (/^input\s*\(/.test(t)) return { type: "statement", text: "Eingabe (warten auf Enter)" };
      } else {
        var mc = /^printf\s*\((.*)\)$/.exec(t);
        if (mc) { var ac = ausgabeC(mc[1]); return { type: "statement", text: ac.length ? "Ausgabe " + ac.join(", ") : "Ausgabe Zeilenumbruch" }; }
        mc = /^puts\s*\((.*)\)$/.exec(t);
        if (mc) return { type: "statement", text: "Ausgabe " + mc[1].trim() };
        mc = /^scanf(?:_s)?\s*\((.*)\)$/.exec(t);
        if (mc) {
          var ziele = trenneOben(mc[1], ",").slice(1).map(function (z) { return z.trim().replace(/^&/, ""); });
          return { type: "statement", text: "Eingabe " + ziele.join(", ") };
        }
        mc = /^(?:fgets|gets)\s*\(\s*([^,)]+)/.exec(t);
        if (mc) return { type: "statement", text: "Eingabe " + mc[1].trim() };
        mc = /^(?:\+\+\s*(\w[\w\[\].]*)|(\w[\w\[\].]*)\s*\+\+)$/.exec(t);
        if (mc) { var v = mc[1] || mc[2]; return { type: "statement", text: v + " ← " + v + " + 1" }; }
        mc = /^(?:--\s*(\w[\w\[\].]*)|(\w[\w\[\].]*)\s*--)$/.exec(t);
        if (mc) { var v2 = mc[1] || mc[2]; return { type: "statement", text: v2 + " ← " + v2 + " - 1" }; }
        // Deklaration: Typ entfernen, ohne Startwert ganz weglassen
        var typ = C_TYP.exec(t);
        if (typ && !/^\w+\s*\(/.test(t.slice(typ[0].length))) {
          var dekl = trenneOben(t.slice(typ[0].length), ",").map(function (d) { return d.trim().replace(/^\*+\s*/, ""); })
            .filter(function (d) { return zuweisungsIndex(d) >= 0; })
            .map(function (d) { var i = zuweisungsIndex(d); return leer(d.slice(0, i)) + " ← " + ausdruck(d.slice(i + 1), "c", true); });
          return dekl.length ? { type: "statement", text: dekl.join("\n") } : null;
        }
      }
      // Verkürzte Zuweisung (x += 2) und normale Zuweisung
      var km = /^([\w.\[\]]+(?:\s*,\s*[\w.\[\]]+)*)\s*(\+|-|\*|\/\/|\/|%|\*\*)=\s*(.+)$/.exec(t);
      if (km) return { type: "statement", text: km[1] + " ← " + ausdruck(km[1] + " " + km[2] + " " + km[3], sprache, true) };
      var zi = zuweisungsIndex(t);
      if (zi > 0) return { type: "statement", text: leer(t.slice(0, zi)) + " ← " + ausdruck(t.slice(zi + 1), sprache, true) };
      return { type: "statement", text: ausdruck(t, sprache, true) };
    }

    function zaehlschleifeC(c) {
      var init = /^(?:(?:unsigned\s+|signed\s+|long\s+|short\s+)*(?:int|long|short|size_t|char)\s+)?(\w+)\s*=\s*(.+)$/.exec(c.init);
      if (!init) return null;
      var v = init[1], von = init[2].trim();
      var bed = new RegExp("^" + v + "\\s*(<=|<|>=|>|!=)\\s*(.+)$").exec(c.bed);
      if (!bed) return null;
      var st = c.schritt.replace(/\s+/g, ""), schritt = null;
      if (st === v + "++" || st === "++" + v || st === v + "+=1" || st === v + "=" + v + "+1") schritt = 1;
      else if (st === v + "--" || st === "--" + v || st === v + "-=1" || st === v + "=" + v + "-1") schritt = -1;
      else { var sm = new RegExp("^" + v + "(\\+|-)=(.+)$").exec(st); if (sm) schritt = sm[1] === "+" ? sm[2] : "-" + sm[2]; }
      if (schritt === null) return null;
      var grenze = bed[2].trim(), op = bed[1], bis;
      if (op === "<") bis = minusEins(grenze); else if (op === ">") bis = plusEins(grenze); else if (op === "!=") bis = schritt === -1 ? plusEins(grenze) : minusEins(grenze); else bis = grenze;
      return zaehlText(v, ausdruck(von, "c", true), ausdruck(bis, "c", true), schritt);
    }
    function zaehlschleifePy(ziel, quelle) {
      var m = /^range\s*\((.*)\)$/.exec(quelle);
      if (!m) return "für jedes " + ziel + " in " + ausdruck(quelle, "python", true);
      var a = trenneOben(m[1], ",").map(function (x) { return x.trim(); });
      var von = a.length > 1 ? a[0] : "0", stop = a.length > 1 ? a[1] : a[0], schritt = a[2] || "1";
      var abwaerts = /^-/.test(schritt);
      var bis = abwaerts ? plusEins(stop) : minusEins(stop);
      return zaehlText(ziel, ausdruck(von, "python", true), ausdruck(bis, "python", true), schritt === "1" ? 1 : schritt === "-1" ? -1 : schritt);
    }
    function zaehlText(v, von, bis, schritt) {
      if (schritt === 1) return "für " + v + " von " + von + " bis " + bis;
      if (schritt === -1) return "für " + v + " von " + von + " abwärts bis " + bis;
      return "für " + v + " von " + von + " bis " + bis + " mit Schrittweite " + String(schritt).replace(/^\+/, "");
    }

    function liste(knoten, imHaupt) {
      var out = [];
      knoten.forEach(function (k, i) {
        if (!k) return;
        // "return 0;" am Ende von main ist im Struktogramm nur Rauschen
        if (pseudo && imHaupt && sprache === "c" && k.art === "return" && /^0?$/.test(k.wert) && i === knoten.length - 1) return;
        // if __name__ == "__main__": … ist nur ein Startschutz – den Inhalt direkt übernehmen
        if (k.art === "if" && /^\(?\s*__name__\s*==\s*["']__main__["']\s*\)?$/.test((k.bed || "").trim())) { out = out.concat(liste(k.ja, imHaupt)); return; }
        var n = block(k);
        if (n) out.push(n);
      });
      return out;
    }
    function bedingung(b) { return ausdruck(ohneAussenklammern(b || ""), sprache, pseudo); }

    function block(k) {
      switch (k.art) {
        case "einfach": return einfach(k.text);
        case "break": return { type: "statement", text: pseudo ? "Schleife verlassen" : "break" };
        case "continue": return { type: "statement", text: pseudo ? "nächster Durchlauf" : "continue" };
        case "return": return { type: "statement", text: pseudo ? ("Rückgabe " + ausdruck(k.wert, sprache, true)).trim() : ("return " + k.wert).trim() };
        case "if": return { type: "if", text: bedingung(k.bed) + (pseudo ? "?" : ""), yesLabel: pseudo ? "wahr" : "ja", noLabel: pseudo ? "falsch" : "nein", yes: liste(k.ja), no: liste(k.nein) };
        case "while": return { type: "while", text: pseudo ? "solange " + bedingung(k.bed) : "while " + (sprache === "c" ? "(" + bedingung(k.bed) + ")" : bedingung(k.bed)), body: liste(k.body) };
        case "dowhile": return { type: "dowhile", text: pseudo ? "solange " + bedingung(k.bed) : "while (" + bedingung(k.bed) + ")", body: liste(k.body) };
        case "for": {
          var text = k.roh;
          if (pseudo) text = (k.c ? zaehlschleifeC(k.c) : k.py ? zaehlschleifePy(k.py.ziel, k.py.quelle) : null) ||
            (k.c ? "für " + [einfachText(k.c.init), "solange " + bedingung(k.c.bed), einfachText(k.c.schritt)].filter(function (x) { return x && x !== "solange "; }).join("; ") : text);
          return { type: "for", text: text, body: liste(k.body) };
        }
        case "switch": return {
          type: "switch", text: pseudo ? ausdruck(ohneAussenklammern(k.ausdruck || ""), sprache, true) : ohneAussenklammern(k.ausdruck || ""),
          cases: (k.faelle.length ? k.faelle : [{ labels: ["?"], body: [] }]).map(function (f) {
            var labels = f.labels.map(function (l) { return pseudo ? ausdruck(sprache === "python" ? trenneOben(l, "|").map(function (x) { return x.trim(); }).join(", ") : l, sprache, true) : l; });
            return { label: f.sonst && pseudo ? "sonst" : labels.join(", "), body: liste(f.body) };
          })
        };
      }
      return null;
    }
    function einfachText(t) { var n = einfach(t); return n ? n.text : ""; }

    return { liste: liste };
  }

  /* ---------- Spracherkennung und Einstieg ---------- */

  function erkenne(code) {
    var c = 0, p = 0;
    if (/#include\s*[<"]/.test(code)) c += 5;
    if (/\b(int|void)\s+main\s*\(/.test(code)) c += 5;
    if (/\bprintf\s*\(|\bscanf\s*\(/.test(code)) c += 2;
    if (/;\s*$/m.test(code)) c += 1;
    if (/\{\s*$/m.test(code)) c += 1;
    if (/^\s*def\s+\w+\s*\(.*\)\s*:/m.test(code)) p += 5;
    if (/^\s*(if|elif|while|for)\b.*:\s*$/m.test(code)) p += 3;
    if (/\bprint\s*\(|\binput\s*\(/.test(code)) p += 2;
    if (/^\s*(import|from)\s+\w+/m.test(code)) p += 2;
    if (/\belif\b|\bTrue\b|\bFalse\b|\bNone\b/.test(code)) p += 2;
    return c > p ? "c" : "python";
  }

  function umwandeln(code, optionen) {
    optionen = optionen || {};
    var sprache = optionen.sprache && optionen.sprache !== "auto" ? optionen.sprache : erkenne(code);
    var pseudo = optionen.pseudo !== false, hinweise = [];
    var baum = sprache === "c" ? cParse(code, hinweise) : pyParse(code, hinweise);
    var namen = new Set(baum.funktionen.map(function (f) { return f.name.split(".").pop(); }));
    baum.funktionen.forEach(function (f) { namen.add(f.name); });
    var u = uebersetzer(sprache, pseudo, namen);
    var programme = [];
    var haupt = u.liste(baum.haupt, true);
    if (haupt.length || !baum.funktionen.length) {
      programme.push({ name: sprache === "c" ? (baum.hauptName ? "main()" : "Programm") : "Hauptprogramm", root: haupt });
    }
    baum.funktionen.forEach(function (f) {
      programme.push({ name: f.name + "(" + f.params + ")", root: u.liste(f.body, false) });
    });
    return { sprache: sprache, programme: programme, hinweise: hinweise };
  }

  var api = { umwandeln: umwandeln, erkenne: erkenne };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.CodeZuStruktogramm = api;
})(this);
