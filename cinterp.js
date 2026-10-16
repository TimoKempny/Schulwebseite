/*! C-Interpreter für die Schulseite – führt C-Programme im Browser aus.
    Umfang: C-Teilmenge des Unterrichts (Variablen, Verzweigungen, Schleifen, Funktionen,
    Arrays, Zeichenketten, struct, Zeiger), printf/scanf und Standardbibliothek. */
(function (root) {
"use strict";
/* =====================================================================
   Teil 1: Grundlagen – Fehler, Typen, Lexer
   ===================================================================== */

// ---------- Fehler ----------
// Übersetzungsfehler (vor dem Start) und Laufzeitfehler werden als Objekte geworfen.
function cerr(msg, at, hint) {
  return { cerr: true, sev: "error", msg: msg, line: at ? at.line : 0, col: at ? at.col : 0, hint: hint || null };
}
function rterr(msg, at, hint) {
  return { rterr: true, sev: "error", msg: msg, line: at ? at.line : 0, col: at ? at.col : 0, hint: hint || null };
}

// Ähnlichster Name (für "Meintest du …?")
function similar(name, candidates) {
  var best = null, bestD = 99, lname = name.toLowerCase();
  candidates.forEach(function (c) {
    if (c === name) return;
    var d = c.toLowerCase() === lname ? 0 : lev(lname, c.toLowerCase());
    if (d < bestD) { bestD = d; best = c; }
  });
  var limit = name.length <= 3 ? 1 : 2;
  return bestD <= limit ? best : null;
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur = [i];
    for (j = 1; j <= b.length; j++) {
      var c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev[j - 2] + 1);
    }
    prev = cur;
  }
  return prev[b.length];
}

// ---------- Typen ----------
function mkInt(name, size, signed, rank) { return { k: "int", name: name, size: size, align: size, signed: signed, rank: rank }; }
var TY = {
  void: { k: "void", name: "void", size: 1, align: 1 },
  bool: mkInt("_Bool", 1, false, 0),
  char: mkInt("char", 1, true, 1),
  schar: mkInt("signed char", 1, true, 1),
  uchar: mkInt("unsigned char", 1, false, 1),
  short: mkInt("short", 2, true, 2),
  ushort: mkInt("unsigned short", 2, false, 2),
  int: mkInt("int", 4, true, 3),
  uint: mkInt("unsigned int", 4, false, 3),
  long: mkInt("long", 8, true, 4),
  ulong: mkInt("unsigned long", 8, false, 4),
  llong: mkInt("long long", 8, true, 5),
  ullong: mkInt("unsigned long long", 8, false, 5),
  float: { k: "float", name: "float", size: 4, align: 4 },
  double: { k: "float", name: "double", size: 8, align: 8 },
  ldouble: { k: "float", name: "long double", size: 16, align: 16 },
  err: { k: "err", name: "?", size: 1, align: 1 }
};
TY.bool.isBool = true;
TY.char.isChar = TY.schar.isChar = TY.uchar.isChar = true;
TY.sizet = TY.ulong;

function ptrTo(t) { return { k: "ptr", to: t, size: 8, align: 8 }; }
function arrOf(t, n) { return { k: "arr", of: t, len: n, size: n == null ? 0 : n * t.size, align: t.align }; }
function funcT(ret, params, variadic, unspec) { return { k: "func", ret: ret, params: params, variadic: !!variadic, unspec: !!unspec, size: 1, align: 1 }; }
function withConst(t) { var c = Object.assign({}, t); c.cq = true; return c; }
function unqual(t) { if (!t.cq) return t; var c = Object.assign({}, t); delete c.cq; return c; }

function isInt(t) { return t.k === "int"; }
function isFloat(t) { return t.k === "float"; }
function isArith(t) { return t.k === "int" || t.k === "float"; }
function isPtr(t) { return t.k === "ptr"; }
function isScalar(t) { return isArith(t) || isPtr(t); }
function is64(t) { return t.k === "int" && t.size === 8; }
function isVoidPtr(t) { return t.k === "ptr" && t.to.k === "void"; }
function isCharPtrLike(t) { return (t.k === "ptr" || t.k === "arr") && (t.k === "ptr" ? t.to : t.of).isChar; }

function sameType(a, b) {
  if (a === b) return true;
  if (a.k !== b.k) return false;
  switch (a.k) {
    case "int": return a.name === b.name;
    case "float": return a.size === b.size;
    case "void": return true;
    case "ptr": return sameType(a.to, b.to);
    case "arr": return sameType(a.of, b.of) && (a.len == null || b.len == null || a.len === b.len);
    case "struct": return a.def === b.def;
    case "func":
      if (!sameType(a.ret, b.ret)) return false;
      if (a.unspec || b.unspec) return true;
      if (a.params.length !== b.params.length || a.variadic !== b.variadic) return false;
      for (var i = 0; i < a.params.length; i++) if (!sameType(a.params[i].type, b.params[i].type)) return false;
      return true;
  }
  return false;
}

// Typ als lesbarer Text, z. B. "char *", "int [5]", "struct Datum"
function typeStr(t) {
  function base(t) {
    if (t.k === "struct") return t.def.dispName || ((t.def.union ? "union " : "struct ") + (t.def.tag || "{…}"));
    if (t.tdname) return t.tdname;
    return t.name;
  }
  function go(t, inner) {
    var c = t.cq ? "const " : "";
    switch (t.k) {
      case "ptr":
        var p = "*" + (t.cq ? " const" : "") + inner;
        if (t.to.k === "arr" || t.to.k === "func") p = "(" + p + ")";
        return go(t.to, p);
      case "arr": return go(t.of, inner + "[" + (t.len == null ? "" : t.len) + "]");
      case "func":
        var ps = t.unspec ? "" : (t.params.length ? t.params.map(function (p) { return typeStr(p.type); }).join(", ") + (t.variadic ? ", ..." : "") : "void");
        return go(t.ret, inner + "(" + ps + ")");
      default: return c + base(t) + (inner ? " " + inner : "");
    }
  }
  return go(t, "").replace(/ +/g, " ").replace(/\* /g, "*").replace(/ \*/g, " *").trim();
}

function alignUp(n, a) { return Math.ceil(n / a) * a; }

// ---------- Lexer ----------
var KEYWORDS = {};
("auto break case char const continue default do double else enum extern float for goto if inline int long " +
 "register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool")
  .split(" ").forEach(function (k) { KEYWORDS[k] = true; });

var PUNCT = ["...", "<<=", ">>=", "->", "++", "--", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||",
  "+=", "-=", "*=", "/=", "%=", "&=", "^=", "|=", "##",
  "[", "]", "(", ")", "{", "}", ".", ",", ";", ":", "?", "~", "!", "+", "-", "*", "/", "%", "<", ">", "=", "&", "|", "^", "#"];

// UTF-8-Kodierung (C-Strings bestehen aus Bytes)
function utf8(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.codePointAt(i);
    if (c > 0xffff) i++;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function Lexer(src, diags) {
  this.src = src; this.diags = diags;
}
Lexer.prototype.run = function () {
  var src = this.src, n = src.length, i = 0, line = 1, lineStart = 0, toks = [], diags = this.diags;
  var atLineStart = true;
  function pos() { return { line: line, col: i - lineStart + 1 }; }
  function lexErr(msg, at, hint) { diags.push({ sev: "error", msg: msg, line: at.line, col: at.col, hint: hint || null }); }
  function warn(msg, at, hint) { diags.push({ sev: "warning", msg: msg, line: at.line, col: at.col, hint: hint || null }); }

  function readEscape(at) {
    // i zeigt auf das Zeichen nach dem Backslash
    var c = src[i];
    var map = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, "\\": 92, "'": 39, '"': 34, "?": 63 };
    if (c in map) { i++; return map[c]; }
    if (c >= "0" && c <= "7") {
      var v = 0, k = 0;
      while (k < 3 && src[i] >= "0" && src[i] <= "7") { v = v * 8 + (src.charCodeAt(i) - 48); i++; k++; }
      return v & 255;
    }
    if (c === "x") {
      i++; var h = "";
      while (/[0-9a-fA-F]/.test(src[i] || "")) h += src[i++];
      if (!h) { lexErr("\\x ohne Hex-Ziffern", at); return 0; }
      return parseInt(h, 16) & 255;
    }
    if (c === "\n" || c === undefined) { lexErr("Backslash am Zeilenende in einer Zeichenkette", at); return 92; }
    warn("Unbekannte Escape-Sequenz '\\" + c + "'", at, "Für einen Backslash schreibe \\\\ – z. B. \"C:\\\\Schule\".");
    i++;
    return utf8(c)[0];
  }

  while (i < n) {
    var ch = src[i];
    if (ch === "\n") { i++; line++; lineStart = i; atLineStart = true; continue; }
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\f" || ch === "\v") { i++; continue; }
    if (ch === "\\" && src[i + 1] === "\n") { i += 2; line++; lineStart = i; continue; }
    // Kommentare
    if (ch === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (ch === "/" && src[i + 1] === "*") {
      var at0 = pos(); i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") { line++; lineStart = i + 1; } i++; }
      if (i >= n) throw cerr("Kommentar /* wird nicht mit */ geschlossen", at0);
      i += 2; continue;
    }
    var at = pos(), start = i, tok = null;
    var bol = atLineStart; atLineStart = false;

    if (/[A-Za-z_]/.test(ch) || ch.charCodeAt(0) > 127) {
      var j = i;
      while (j < n && (/[A-Za-z0-9_]/.test(src[j]) || src.charCodeAt(j) > 127)) j++;
      var word = src.slice(i, j);
      if (/[^\x00-\x7f]/.test(word)) {
        lexErr("Ungültiges Zeichen im Namen '" + word + "'", at,
          "Bezeichner dürfen nur a–z, A–Z, 0–9 und _ enthalten – keine Umlaute, kein ß.");
      }
      i = j;
      tok = { t: KEYWORDS[word] ? "kw" : "id", v: word };
    } else if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      var m = /^(?:0[xX][0-9a-fA-F]+|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)/.exec(src.slice(i, i + 80));
      var lit = m[0], j2 = i + lit.length;
      var suf = "";
      while (j2 < n && /[A-Za-z0-9_]/.test(src[j2])) suf += src[j2++];
      i = j2;
      var isHex = /^0[xX]/.test(lit);
      var isFl = !isHex && /[.eE]/.test(lit);
      if (isFl) {
        if (suf && !/^[fFlL]$/.test(suf)) { lexErr("Ungültige Zahl '" + lit + suf + "'", at, "Ein Bezeichner darf nicht mit einer Ziffer beginnen."); suf = ""; }
        tok = { t: "num", v: parseFloat(lit), fl: true, ty: /^[fF]$/.test(suf) ? TY.float : /^[lL]$/.test(suf) ? TY.ldouble : TY.double };
      } else {
        var s2 = suf.toLowerCase();
        if (suf && !/^(u|l|ul|lu|ll|ull|llu)$/.test(s2)) {
          lexErr("Ungültige Zahl oder ungültiger Name '" + lit + suf + "'", at, "Ein Bezeichner darf nicht mit einer Ziffer beginnen.");
          s2 = "";
        }
        if (!isHex && lit.length > 1 && lit[0] === "0" && /[89]/.test(lit)) { lexErr("Ungültige Oktalzahl '" + lit + "'", at, "Zahlen mit führender 0 sind Oktalzahlen (nur Ziffern 0–7)."); lit = lit.replace(/^0+/, "") || "0"; }
        var bv = BigInt(isHex ? lit : (lit.length > 1 && lit[0] === "0" ? "0o" + lit.slice(1) : lit));
        var uns = s2.indexOf("u") >= 0, lcount = (s2.match(/l/g) || []).length;
        // Typ nach C-Regeln bestimmen
        var cands;
        if (lcount === 0) cands = uns ? [TY.uint, TY.ulong] : (isHex || lit[0] === "0") ? [TY.int, TY.uint, TY.long, TY.ulong] : [TY.int, TY.long];
        else if (lcount === 1) cands = uns ? [TY.ulong] : (isHex || lit[0] === "0") ? [TY.long, TY.ulong] : [TY.long];
        else cands = uns ? [TY.ullong] : (isHex || lit[0] === "0") ? [TY.llong, TY.ullong] : [TY.llong];
        var ty = null;
        for (var q = 0; q < cands.length; q++) {
          var c2 = cands[q], max = c2.signed ? (1n << BigInt(c2.size * 8 - 1)) - 1n : (1n << BigInt(c2.size * 8)) - 1n;
          if (bv <= max) { ty = c2; break; }
        }
        if (!ty) { warn("Ganzzahl-Konstante ist zu groß", at); ty = TY.ullong; bv = BigInt.asUintN(64, bv); }
        tok = { t: "num", v: ty.size === 8 ? bv : Number(bv), fl: false, ty: ty };
      }
    } else if (ch === '"') {
      i++; var bytes = [];
      while (true) {
        if (i >= n || src[i] === "\n") { lexErr("Zeichenkette ist nicht abgeschlossen – das \" am Ende fehlt", at, "Jeder Text beginnt und endet mit \". Für ein \" im Text schreibt man \\\"."); break; }
        var c3 = src[i];
        if (c3 === '"') { i++; break; }
        if (c3 === "\\") { i++; bytes.push(readEscape(pos())); continue; }
        var cp = src.codePointAt(i);
        var piece = String.fromCodePoint(cp);
        i += piece.length;
        Array.prototype.push.apply(bytes, utf8(piece));
      }
      tok = { t: "str", v: bytes };
    } else if (ch === "'") {
      i++; var vals = [];
      while (true) {
        if (i >= n || src[i] === "\n") { lexErr("Zeichenkonstante ist nicht abgeschlossen – das ' am Ende fehlt", at); break; }
        var c4 = src[i];
        if (c4 === "'") { i++; break; }
        if (c4 === "\\") { i++; vals.push(readEscape(pos())); continue; }
        var cp2 = src.codePointAt(i), piece2 = String.fromCodePoint(cp2);
        i += piece2.length;
        Array.prototype.push.apply(vals, utf8(piece2));
      }
      if (vals.length === 0) { lexErr("Leere Zeichenkonstante ''", at, "In einfachen Hochkommas steht genau ein Zeichen, z. B. 'A'."); vals = [0]; }
      if (vals.length > 1) {
        var raw = src.slice(start, i);
        if (vals.length > 4 || /[^\x00-\x7f]/.test(raw)) {
          var hint = /[^\x00-\x7f]/.test(raw) && vals.length <= 4 ? "Umlaute bestehen aus mehreren Bytes und passen nicht in ein char." :
            "Ein einzelnes Zeichen steht in einfachen Hochkommas ('A'), ein Text in doppelten Anführungszeichen (\"Hallo\").";
          lexErr("Zu viele Zeichen in der Zeichenkonstante " + raw, at, hint);
          vals = [0];
        } else
        warn("Zeichenkonstante mit mehreren Zeichen: " + raw, at, "Ein Text gehört in doppelte Anführungszeichen.");
      }
      var cv = 0;
      for (var q2 = 0; q2 < vals.length; q2++) cv = (cv << 8) | vals[q2];
      if (vals.length === 1) cv = (vals[0] << 24) >> 24;   // char ist vorzeichenbehaftet
      tok = { t: "char", v: cv | 0 };
    } else {
      var p = null;
      for (var k = 0; k < PUNCT.length; k++) { if (src.startsWith(PUNCT[k], i)) { p = PUNCT[k]; break; } }
      if (!p) {
        var bad = String.fromCodePoint(src.codePointAt(i));
        var h2 = null;
        if (bad === "“" || bad === "”" || bad === "„") h2 = "Typografische Anführungszeichen sind kein C – verwende \" (Umschalt + 2).";
        else if (bad === "’" || bad === "‘") h2 = "Verwende das einfache Hochkomma ' (Umschalt + #).";
        else if (bad === "`") h2 = "Für Zeichen verwende ' und für Texte \".";
        lexErr("Unbekanntes Zeichen '" + bad + "' im Programm", at, h2);
        i += bad.length; continue;
      }
      i += p.length;
      tok = { t: "op", v: p };
    }
    tok.line = at.line; tok.col = at.col; tok.s = start; tok.e = i;
    tok.eline = line; tok.ecol = i - lineStart + 1;
    if (bol) tok.bol = true;
    toks.push(tok);
  }
  toks.push({ t: "eof", v: "", line: line, col: i - lineStart + 1, s: n, e: n, eline: line, ecol: i - lineStart + 1 });
  return toks;
};
/* =====================================================================
   Teil 2: Präprozessor (#include, #define, #ifdef …)
   ===================================================================== */

// Was jede Header-Datei bereitstellt. Funktionen werden in Teil 5 definiert.
var HEADERS = {
  "stdio.h": {
    macros: { EOF: "(-1)", NULL: "((void*)0)", BUFSIZ: "8192" },
    types: ["size_t", "FILE"], vars: ["stdin", "stdout", "stderr"],
    funcs: ["printf", "scanf", "getchar", "putchar", "puts", "fgets", "gets", "sprintf", "snprintf", "sscanf",
      "fprintf", "fflush", "setvbuf", "setbuf", "fputs", "fputc", "putc", "getc", "fgetc", "ungetc", "perror",
      "fopen", "fclose", "fscanf"]
  },
  "stdlib.h": {
    macros: { NULL: "((void*)0)", RAND_MAX: "2147483647", EXIT_SUCCESS: "0", EXIT_FAILURE: "1" },
    types: ["size_t"],
    funcs: ["rand", "srand", "abs", "labs", "llabs", "exit", "malloc", "calloc", "realloc", "free", "atoi", "atol",
      "atoll", "atof", "strtol", "strtod", "system", "qsort"]
  },
  "string.h": {
    macros: { NULL: "((void*)0)" }, types: ["size_t"],
    funcs: ["strlen", "strcpy", "strncpy", "strcat", "strncat", "strcmp", "strncmp", "strchr", "strrchr", "strstr",
      "strcspn", "strspn", "strpbrk", "memset", "memcpy", "memmove", "memcmp", "strtok"]
  },
  "math.h": {
    macros: { M_PI: "3.14159265358979323846", M_E: "2.7182818284590452354", M_SQRT2: "1.41421356237309504880",
      HUGE_VAL: "(1e308*10.0)", INFINITY: "(1e308f*10.0f)", NAN: "(0.0f/0.0f)" },
    funcs: ["sqrt", "pow", "fabs", "round", "floor", "ceil", "trunc", "fmod", "sin", "cos", "tan", "asin", "acos",
      "atan", "atan2", "exp", "log", "log10", "log2", "hypot", "cbrt", "fmin", "fmax", "lround", "sinh", "cosh", "tanh", "isnan", "isinf"]
  },
  "ctype.h": {
    funcs: ["isalpha", "isdigit", "isalnum", "isspace", "isupper", "islower", "ispunct", "isxdigit", "iscntrl",
      "isprint", "isgraph", "toupper", "tolower"]
  },
  "stdbool.h": { macros: { bool: "_Bool", true: "1", false: "0", __bool_true_false_are_defined: "1" } },
  "time.h": { macros: { CLOCKS_PER_SEC: "((long)1000000)", NULL: "((void*)0)" }, types: ["time_t", "clock_t", "size_t"], funcs: ["time", "clock", "difftime"] },
  "limits.h": {
    macros: {
      CHAR_BIT: "8", CHAR_MIN: "(-128)", CHAR_MAX: "127", SCHAR_MIN: "(-128)", SCHAR_MAX: "127", UCHAR_MAX: "255",
      SHRT_MIN: "(-32768)", SHRT_MAX: "32767", USHRT_MAX: "65535", INT_MIN: "(-2147483647-1)", INT_MAX: "2147483647",
      UINT_MAX: "4294967295U", LONG_MIN: "(-9223372036854775807L-1L)", LONG_MAX: "9223372036854775807L",
      ULONG_MAX: "18446744073709551615UL", LLONG_MIN: "(-9223372036854775807LL-1LL)", LLONG_MAX: "9223372036854775807LL",
      ULLONG_MAX: "18446744073709551615ULL"
    }
  },
  "float.h": {
    macros: { FLT_MAX: "3.40282347e+38F", FLT_MIN: "1.17549435e-38F", FLT_EPSILON: "1.19209290e-7F", FLT_DIG: "6",
      DBL_MAX: "1.7976931348623157e+308", DBL_MIN: "2.2250738585072014e-308", DBL_EPSILON: "2.2204460492503131e-16", DBL_DIG: "15" }
  },
  "stddef.h": { macros: { NULL: "((void*)0)" }, types: ["size_t"] },
  "stdint.h": { types: ["int8_t", "uint8_t", "int16_t", "uint16_t", "int32_t", "uint32_t", "int64_t", "uint64_t"],
    macros: { INT32_MAX: "2147483647", INT32_MIN: "(-2147483647-1)", UINT8_MAX: "255", INT64_MAX: "9223372036854775807L" } },
  "locale.h": { macros: { LC_ALL: "6", LC_NUMERIC: "1", NULL: "((void*)0)" }, funcs: ["setlocale"] },
  "assert.h": { funcs: ["assert"] },
  "iso646.h": { macros: { and: "&&", or: "||", not: "!", not_eq: "!=" } }
};
var BAD_HEADERS = {
  "conio.h": "conio.h gibt es nur bei alten Windows-Compilern. Verwende getchar() aus stdio.h.",
  "windows.h": "windows.h ist eine Windows-Bibliothek und steht im Browser nicht zur Verfügung.",
  "iostream": "iostream ist C++, nicht C. Für Ein- und Ausgabe in C: #include <stdio.h>",
  "cstdio": "cstdio ist der C++-Name. In C heißt der Header stdio.h.",
  "unistd.h": "unistd.h (Linux-Systemfunktionen) wird hier nicht unterstützt."
};

function preprocess(toks, src, diags) {
  var macros = Object.create(null), headers = Object.create(null), out = [];
  var cond = [];          // Stapel für #if/#ifdef: { on, done, parentOn, line }
  var active = true;
  var lexCache = Object.create(null);

  function lexText(text) {
    if (!lexCache[text]) lexCache[text] = new Lexer(text, []).run().slice(0, -1);
    return lexCache[text];
  }
  function defineBuiltin(name, text) {
    macros[name] = { params: null, body: lexText(text), builtin: true };
  }
  function include(name, at) {
    if (headers[name]) return;
    var h = HEADERS[name];
    if (!h) {
      if (BAD_HEADERS[name]) throw cerr("Header-Datei <" + name + "> wird nicht unterstützt", at, BAD_HEADERS[name]);
      var sug = similar(name, Object.keys(HEADERS));
      throw cerr(name + ": Diese Header-Datei gibt es nicht", at, sug ? "Meintest du <" + sug + ">?" : null);
    }
    headers[name] = true;
    if (h.macros) Object.keys(h.macros).forEach(function (m) { defineBuiltin(m, h.macros[m]); });
  }

  // Ersetzt Positionsangaben, damit Fehler im Makro an der Aufrufstelle gemeldet werden
  function relocate(list, at, macro) {
    return list.map(function (t) {
      var c = Object.assign({}, t);
      c.line = at.line; c.col = at.col; c.s = at.s; c.e = at.e; c.eline = at.eline; c.ecol = at.ecol;
      c.mac = macro; delete c.bol;
      return c;
    });
  }

  // Makros in einer Tokenliste ersetzen (mit erneutem Durchsuchen)
  function expandList(list, hide, depth) {
    if (depth > 60) throw cerr("Makro-Ersetzung zu tief verschachtelt", list[0]);
    var res = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.t !== "id" || !macros[t.v] || hide.indexOf(t.v) >= 0) { res.push(t); continue; }
      var m = macros[t.v];
      if (!m.params) {
        Array.prototype.push.apply(res, expandList(relocate(m.body, t, t.v), hide.concat([t.v]), depth + 1));
        continue;
      }
      if (!list[i + 1] || list[i + 1].v !== "(" || list[i + 1].t !== "op") { res.push(t); continue; }
      var r = collectArgs(list, i + 1, t);
      i = r.end;
      Array.prototype.push.apply(res, expandList(substitute(m, r.args, t), hide.concat([t.v]), depth + 1));
    }
    return res;
  }
  function collectArgs(list, openIdx, at) {
    var args = [[]], depth = 0, i = openIdx + 1;
    for (; i < list.length; i++) {
      var t = list[i];
      if (t.t === "eof") break;
      if (t.t === "op" && t.v === "(") depth++;
      if (t.t === "op" && t.v === ")") { if (depth === 0) return { args: args, end: i }; depth--; }
      if (t.t === "op" && t.v === "," && depth === 0) { args.push([]); continue; }
      args[args.length - 1].push(t);
    }
    throw cerr("Makro-Aufruf von '" + at.v + "' wird nicht mit ) geschlossen", at);
  }
  function substitute(m, args, at) {
    if (args.length === 1 && args[0].length === 0 && m.params.length === 0) args = [];
    if (args.length !== m.params.length && !m.variadic) {
      throw cerr("Makro '" + at.v + "' erwartet " + m.params.length + " Argument(e), bekommt " + args.length, at);
    }
    var res = [];
    for (var i = 0; i < m.body.length; i++) {
      var b = m.body[i];
      if (b.t === "op" && b.v === "#" && m.body[i + 1] && m.body[i + 1].t === "id" && m.params.indexOf(m.body[i + 1].v) >= 0) {
        var a = args[m.params.indexOf(m.body[i + 1].v)];
        var text = a.map(function (x) { return src.slice(x.s, x.e); }).join(" ");
        res.push({ t: "str", v: utf8(text) });
        i++; continue;
      }
      if (b.t === "op" && b.v === "##") throw cerr("Der Operator ## wird nicht unterstützt", at);
      var pi = b.t === "id" ? m.params.indexOf(b.v) : -1;
      if (pi >= 0) Array.prototype.push.apply(res, expandList(args[pi], [], 0));
      else if (b.t === "id" && b.v === "__VA_ARGS__" && m.variadic) {
        var rest = args.slice(m.params.length);
        rest.forEach(function (a2, k) { if (k) res.push({ t: "op", v: "," }); Array.prototype.push.apply(res, a2); });
      }
      else res.push(b);
    }
    return relocate(res, at, at.v);
  }

  // Einfache Auswertung für #if
  function evalIf(list, at) {
    var x = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.t === "id" && t.v === "defined") {
        var paren = list[i + 1] && list[i + 1].v === "(";
        var nm = list[i + (paren ? 2 : 1)];
        if (!nm || nm.t !== "id") throw cerr("defined braucht einen Makronamen", at);
        x.push({ t: "num", v: macros[nm.v] ? 1 : 0, ty: TY.int });
        i += paren ? 3 : 1; continue;
      }
      x.push(t);
    }
    x = expandList(x, [], 0).map(function (t) { return t.t === "id" || t.t === "kw" ? { t: "num", v: 0, ty: TY.int } : t; });
    var p = 0;
    function peek() { return x[p] || { t: "end", v: "" }; }
    function num(v) { return typeof v === "bigint" ? Number(v) : v; }
    function prim() {
      var t = x[p++];
      if (!t) throw cerr("Unvollständiger Ausdruck in #if", at);
      if (t.t === "num" || t.t === "char") return num(t.v);
      if (t.v === "(") { var v = tern(); if (!x[p] || x[p].v !== ")") throw cerr(") fehlt in #if", at); p++; return v; }
      if (t.v === "!") return prim() ? 0 : 1;
      if (t.v === "-") return -prim();
      if (t.v === "+") return prim();
      if (t.v === "~") return ~prim();
      throw cerr("Unerwartetes '" + t.v + "' in #if", at);
    }
    var levels = [["*", "/", "%"], ["+", "-"], ["<<", ">>"], ["<", ">", "<=", ">="], ["==", "!="], ["&"], ["^"], ["|"], ["&&"], ["||"]];
    function bin(l) {
      if (l < 0) return prim();
      var v = bin(l - 1);
      while (levels[l].indexOf(peek().v) >= 0 && peek().t === "op") {
        var op = x[p++].v, r = bin(l - 1);
        switch (op) {
          case "*": v = v * r; break; case "/": v = r ? Math.trunc(v / r) : 0; break; case "%": v = r ? v % r : 0; break;
          case "+": v += r; break; case "-": v -= r; break; case "<<": v <<= r; break; case ">>": v >>= r; break;
          case "<": v = +(v < r); break; case ">": v = +(v > r); break; case "<=": v = +(v <= r); break; case ">=": v = +(v >= r); break;
          case "==": v = +(v === r); break; case "!=": v = +(v !== r); break; case "&": v &= r; break; case "^": v ^= r; break;
          case "|": v |= r; break; case "&&": v = +(v && r); break; case "||": v = +(v || r); break;
        }
      }
      return v;
    }
    function tern() {
      var c = bin(levels.length - 1);
      if (peek().v === "?") { p++; var a = tern(); if (peek().v !== ":") throw cerr(": fehlt in #if", at); p++; var b = tern(); return c ? a : b; }
      return c;
    }
    var v = tern();
    return v !== 0;
  }

  var i = 0;
  while (i < toks.length) {
    var t = toks[i];
    if (t.t === "eof") break;
    if (t.t === "op" && t.v === "#" && t.bol) {
      // Direktive: alle Token derselben Zeile
      var j = i + 1, line = [];
      while (j < toks.length && toks[j].t !== "eof" && toks[j].line === t.line) line.push(toks[j++]);
      i = j;
      var name = line[0] ? line[0].v : "";
      var args = line.slice(1);
      if (!active && ["if", "ifdef", "ifndef", "else", "elif", "endif"].indexOf(name) < 0) continue;
      switch (name) {
        case "include": {
          if (!args.length) throw cerr("#include ohne Dateiname", t);
          var hname;
          if (args[0].t === "op" && args[0].v === "<") {
            var gt = null;
            for (var q = 1; q < args.length; q++) if (args[q].t === "op" && args[q].v === ">") { gt = args[q]; break; }
            if (!gt) throw cerr("#include <…>: Die spitze Klammer > fehlt", t);
            hname = src.slice(args[0].e, gt.s).trim();
          } else if (args[0].t === "str") {
            hname = String.fromCharCode.apply(null, args[0].v);
            if (!HEADERS[hname]) throw cerr("Eigene Header-Dateien (\"" + hname + "\") werden hier nicht unterstützt", t,
              "Im Online-Editor besteht ein Programm aus genau einer Datei.");
          } else throw cerr("#include erwartet <datei.h>", t);
          include(hname, line[0]);
          break;
        }
        case "define": {
          var nm = args[0];
          if (!nm || nm.t !== "id") {
            throw cerr("#define braucht einen Namen", line[0], nm && nm.t === "kw" ? "'" + nm.v + "' ist ein Schlüsselwort." : null);
          }
          if (args[1] && args[1].t === "op" && args[1].v === "(" && args[1].s === nm.e) {
            var params = [], k = 2, variadic = false;
            while (args[k] && args[k].v !== ")") {
              if (args[k].t === "id") params.push(args[k].v);
              else if (args[k].v === "...") variadic = true;
              else if (args[k].v !== ",") throw cerr("Ungültiger Parameter in #define", args[k]);
              k++;
            }
            if (!args[k]) throw cerr("#define " + nm.v + "(: Die Klammer ) fehlt", nm);
            macros[nm.v] = { params: params, body: args.slice(k + 1), variadic: variadic, at: nm };
          } else {
            var body = args.slice(1);
            if (body.length && body[body.length - 1].t === "op" && body[body.length - 1].v === ";") {
              diags.push({ sev: "warning", msg: "#define " + nm.v + " endet mit einem Semikolon", line: nm.line, col: nm.col,
                hint: "Das ; wird überall mit eingesetzt, wo " + nm.v + " steht. Hinter #define gehört kein Semikolon." });
            }
            if (body.length && body[0].t === "op" && body[0].v === "=") {
              throw cerr("#define " + nm.v + " = …: Hier steht kein Gleichheitszeichen", body[0], "Richtig: #define " + nm.v + " 3.14");
            }
            macros[nm.v] = { params: null, body: body, at: nm };
          }
          break;
        }
        case "undef": if (args[0]) delete macros[args[0].v]; break;
        case "ifdef": case "ifndef": {
          var def = !!(args[0] && macros[args[0].v]);
          var on = name === "ifdef" ? def : !def;
          cond.push({ parentOn: active, done: on, line: t });
          active = active && on;
          break;
        }
        case "if": {
          var on2 = active ? evalIf(args, t) : false;
          cond.push({ parentOn: active, done: on2, line: t });
          active = active && on2;
          break;
        }
        case "elif": {
          var c = cond[cond.length - 1];
          if (!c) throw cerr("#elif ohne #if", t);
          if (c.done || !c.parentOn) active = false;
          else { var on3 = evalIf(args, t); c.done = on3; active = on3; }
          break;
        }
        case "else": {
          var c2 = cond[cond.length - 1];
          if (!c2) throw cerr("#else ohne #if", t);
          active = c2.parentOn && !c2.done; c2.done = true;
          break;
        }
        case "endif": {
          var c3 = cond.pop();
          if (!c3) throw cerr("#endif ohne #if", t);
          active = c3.parentOn;
          break;
        }
        case "pragma": case "": break;
        case "error": throw cerr("#error " + args.map(function (a) { return src.slice(a.s, a.e); }).join(" "), t);
        case "warning": diags.push({ sev: "warning", msg: "#warning " + args.map(function (a) { return src.slice(a.s, a.e); }).join(" "), line: t.line, col: t.col }); break;
        default: {
          var sug = similar(name, ["include", "define", "ifdef", "ifndef", "endif", "undef", "pragma"]);
          throw cerr("Unbekannte Präprozessor-Anweisung #" + name, t, sug ? "Meintest du #" + sug + "?" : null);
        }
      }
      continue;
    }
    i++;
    if (!active) continue;
    if (t.t === "id" && macros[t.v]) {
      var m = macros[t.v];
      if (!m.params) { Array.prototype.push.apply(out, expandList(relocate(m.body, t, t.v), [t.v], 0)); continue; }
      if (toks[i] && toks[i].t === "op" && toks[i].v === "(") {
        var r = collectArgs(toks, i, t);
        i = r.end + 1;
        Array.prototype.push.apply(out, expandList(substitute(m, r.args, t), [t.v], 0));
        continue;
      }
    }
    out.push(t);
  }
  if (cond.length) throw cerr("#if/#ifdef ohne passendes #endif", cond[cond.length - 1].line);
  out.push(toks[toks.length - 1]);
  return { toks: out, headers: headers, macros: macros };
}
/* =====================================================================
   Teil 3: Parser mit Typprüfung (ein Durchgang, wie ein C-Compiler)
   Ergebnis: AST mit Typen, Speicheradressen und Konvertierungen
   ===================================================================== */

var LIT_BASE = 0x1000, GLOBAL_BASE = 0x100000, HEAP_BASE = 0x400000, TEMP_BASE = 0x780000,
    STACK_BASE = 0x800000, MEM_SIZE = 0x1000000, GAP = 16;

// Welche Header-Datei einen Namen bereitstellt (für Hinweise)
var NAME_HEADER = (function () {
  var m = {};
  Object.keys(HEADERS).forEach(function (h) {
    var d = HEADERS[h];
    (d.funcs || []).concat(d.types || [], d.vars || [], Object.keys(d.macros || {})).forEach(function (n) { if (!m[n]) m[n] = h; });
  });
  m.NULL = "stdio.h"; m.size_t = "stdio.h";
  return m;
})();

function Scope(parent, kind) { this.parent = parent; this.kind = kind; this.syms = Object.create(null); this.tags = Object.create(null); }
Scope.prototype.find = function (n) { for (var s = this; s; s = s.parent) if (s.syms[n]) return s.syms[n]; return null; };
Scope.prototype.findTag = function (n) { for (var s = this; s; s = s.parent) if (s.tags[n]) return s.tags[n]; return null; };

function Parser(toks, src, diags, pp) {
  this.toks = toks; this.p = 0; this.src = src; this.diags = diags; this.headers = pp.headers;
  this.global = new Scope(null, "global"); this.scope = this.global;
  this.globalSize = 0; this.globalInits = [];
  this.litSize = 0; this.lits = []; this.litMap = Object.create(null);
  this.funcs = Object.create(null);
  this.fn = null; this.loopDepth = 0; this.switches = []; this.blocks = [];
  this.errCount = 0; this.usedLib = Object.create(null);
  this.structId = 0;
  this.called = [];
}
var PP = Parser.prototype;

// ---------- Token-Hilfen ----------
PP.peek = function (k) { return this.toks[this.p + (k || 0)]; };
PP.next = function () { return this.toks[this.p++]; };
PP.prev = function () { return this.toks[this.p - 1]; };
PP.is = function (v, k) { var t = this.peek(k); return (t.t === "op" || t.t === "kw") && t.v === v; };
PP.accept = function (v) { if (this.is(v)) { return this.next(); } return null; };
PP.tokText = function (t) { return t.t === "eof" ? "Dateiende" : t.t === "str" ? "\"…\"" : this.src.slice(t.s, t.e) || t.v; };
PP.expect = function (v, what) {
  if (this.is(v)) return this.next();
  var t = this.peek(), pr = this.prev();
  if (v === ";" || v === ")" || v === "]") {
    // Wie gcc: Position direkt hinter dem vorherigen Token melden
    var at = pr ? { line: pr.eline, col: pr.ecol } : t;
    var hint = v === ";" ? "Jede Anweisung endet mit einem Semikolon. Der Fehler steht oft am Ende der Zeile davor." : null;
    if (v === ";" && t.t === "eof") throw cerr("';' fehlt am Ende", at, hint);
    throw cerr("'" + v + "' fehlt vor '" + this.tokText(t) + "'", at, hint);
  }
  if (t.t === "eof") {
    if (v === "}") {
      var open = this.blocks.length ? this.blocks[this.blocks.length - 1].open : null;
      throw cerr("Am Ende der Datei fehlt eine schließende Klammer '}'", t,
        open ? "Die Klammer '{' aus Zeile " + open.line + " wird nicht geschlossen." : null);
    }
    throw cerr("'" + v + "' erwartet, aber die Datei ist zu Ende", t);
  }
  throw cerr("'" + v + "' erwartet" + (what ? " " + what : "") + ", gefunden: '" + this.tokText(t) + "'", t);
};
PP.error = function (msg, at, hint) {
  var line = at ? at.line : 0, col = at ? at.col : 0;
  for (var i = 0; i < this.diags.length; i++) { var d = this.diags[i]; if (d.sev === "error" && d.line === line && d.col === col) return; }
  this.diags.push({ sev: "error", msg: msg, line: at ? at.line : 0, col: at ? at.col : 0, hint: hint || null });
  if (++this.errCount > 25) throw cerr("Zu viele Fehler – Übersetzung abgebrochen", at);
};
PP.warn = function (msg, at, hint, sev) {
  var line = at ? at.line : 0, col = at ? at.col : 0;
  for (var i = 0; i < this.diags.length; i++) { var d = this.diags[i]; if (d.line === line && d.col === col && d.msg === msg) return; }
  this.diags.push({ sev: sev || "warning", msg: msg, line: line, col: col, hint: hint || null });
};
PP.text = function (n) { return this.src.slice(n.s, n.e).replace(/\s+/g, " "); };

// ---------- Knoten ----------
function N(k, at, o) {
  var n = o || {};
  n.k = k; n.line = at.line; n.col = at.col;
  if (n.s === undefined) n.s = at.s;
  if (n.e === undefined) n.e = at.e;
  if (n.pure === undefined) n.pure = true;
  return n;
}
function span(n, a, b) { n.s = a.s; n.e = b.e; return n; }
var ERRN = function (at) { return N("err", at, { ty: TY.err }); };

// ---------- Typ-Spezifizierer ----------
var TYPE_KW = { "void": 1, "char": 1, "short": 1, "int": 1, "long": 1, "float": 1, "double": 1, "signed": 1, "unsigned": 1, "_Bool": 1, "struct": 1, "union": 1, "enum": 1, "const": 1, "volatile": 1, "static": 1, "extern": 1, "typedef": 1, "auto": 1, "register": 1, "inline": 1, "restrict": 1 };

PP.isTypedefName = function (t) {
  if (!t || t.t !== "id") return false;
  var s = this.scope.find(t.v);
  if (s) return s.kind === "typedef";
  var h = NAME_HEADER[t.v];
  return !!(LIB_TYPES[t.v] && h && this.headers[h]) ;
};
PP.startsType = function (k) {
  var t = this.peek(k);
  if (t.t === "kw" && TYPE_KW[t.v]) return true;
  return this.isTypedefName(t);
};

PP.declSpecs = function () {
  var start = this.peek(), storage = null, cq = false, base = null, cnt = { long: 0, short: 0, signed: 0, unsigned: 0 }, any = false, tdTok = null;
  for (;;) {
    var t = this.peek();
    if (t.t === "kw") {
      switch (t.v) {
        case "typedef": case "static": case "extern": case "auto": case "register":
          if (storage && storage !== t.v) this.error("Mehrere Speicherklassen (" + storage + ", " + t.v + ")", t);
          storage = t.v; this.next(); any = true; continue;
        case "const": cq = true; this.next(); any = true; continue;
        case "volatile": case "inline": case "restrict": this.next(); any = true; continue;
        case "long": case "short": case "signed": case "unsigned": cnt[t.v]++; this.next(); any = true; continue;
        case "void": case "char": case "int": case "float": case "double": case "_Bool":
          if (base) this.error("Zwei Datentypen in einer Deklaration: '" + (base.name || base) + "' und '" + t.v + "'", t);
          base = t.v; this.next(); any = true; continue;
        case "struct": case "union":
          if (base) this.error("Zwei Datentypen in einer Deklaration", t);
          base = this.structSpec(); any = true; continue;
        case "enum":
          if (base) this.error("Zwei Datentypen in einer Deklaration", t);
          base = this.enumSpec(); any = true; continue;
      }
    }
    if (t.t === "id" && !base && !cnt.long && !cnt.short && !cnt.signed && !cnt.unsigned && this.isTypedefName(t)) {
      var s = this.scope.find(t.v);
      if (!s) { this.useLibName(t.v, t); base = Object.assign({}, LIB_TYPES[t.v]); base.tdname = t.v; }
      else base = s.type;
      tdTok = t; this.next(); any = true; continue;
    }
    break;
  }
  if (!any) return null;
  var ty;
  if (base && typeof base === "object") {
    ty = base;
    if (cnt.long || cnt.short || cnt.signed || cnt.unsigned) this.error("'" + (tdTok ? tdTok.v : typeStr(base)) + "' kann nicht mit long/short/signed/unsigned kombiniert werden", start);
  } else {
    var u = cnt.unsigned > 0;
    if (cnt.signed && cnt.unsigned) this.error("signed und unsigned gleichzeitig", start);
    switch (base) {
      case "void": ty = TY.void; break;
      case "_Bool": ty = TY.bool; break;
      case "float": ty = TY.float; break;
      case "double": ty = cnt.long ? TY.ldouble : TY.double; break;
      case "char": ty = u ? TY.uchar : cnt.signed ? TY.schar : TY.char; break;
      case "int": case null:
        if (base === null && !cnt.long && !cnt.short && !cnt.signed && !cnt.unsigned) {
          var nt = this.peek();
          var hint = nt.t === "id" ? "Steht '" + nt.v + "' für einen Datentyp? Dann ist er unbekannt (Tippfehler oder fehlendes typedef/#include)." : null;
          throw cerr("Datentyp fehlt in der Deklaration", start, hint || "Vor den Namen gehört ein Datentyp, z. B. int, double oder char.");
        }
        if (cnt.short) ty = u ? TY.ushort : TY.short;
        else if (cnt.long >= 2) ty = u ? TY.ullong : TY.llong;
        else if (cnt.long === 1) ty = u ? TY.ulong : TY.long;
        else ty = u ? TY.uint : TY.int;
        break;
    }
    if ((base === "char" || base === "float" || base === "void" || base === "_Bool") && (cnt.long || cnt.short)) this.error("Ungültige Kombination: " + (cnt.long ? "long " : "short ") + base, start);
  }
  if (cq) ty = withConst(ty);
  return { type: ty, storage: storage, at: start };
};

PP.structSpec = function () {
  var kw = this.next(), isUnion = kw.v === "union", tagTok = null, tag = null;
  if (this.peek().t === "id") { tagTok = this.next(); tag = tagTok.v; }
  if (this.is("{")) {
    var open = this.next();
    var existing = tag ? this.scope.tags[tag] : null;
    var def;
    if (existing && !existing.def.complete) def = existing.def;
    else {
      if (existing) this.error((isUnion ? "union " : "struct ") + tag + " ist schon definiert", tagTok);
      def = { tag: tag, union: isUnion, fields: [], size: 0, align: 1, complete: false, id: ++this.structId };
    }
    var ty = { k: "struct", def: def, size: 0, align: 1 };
    if (tag) this.scope.tags[tag] = ty;
    var off = 0, maxAlign = 1, maxSize = 0;
    while (!this.is("}")) {
      if (this.peek().t === "eof") throw cerr("struct-Definition wird nicht mit } geschlossen", open);
      var ds = this.declSpecs();
      if (!ds) throw cerr("Datentyp für Komponente erwartet, gefunden: '" + this.tokText(this.peek()) + "'", this.peek());
      do {
        var d = this.declarator(false);
        var ft = d.apply(ds.type);
        if (!d.name) { this.error("Komponente ohne Namen", this.peek()); continue; }
        if (ft.k === "func") { this.error("Funktionen können keine Komponenten einer Struktur sein", d.nameTok); continue; }
        if (ft.k === "arr" && ft.len == null) { this.error("Array-Komponente '" + d.name + "' braucht eine Größe", d.nameTok); ft = arrOf(ft.of, 1); }
        if (ft.k === "struct" && !ft.def.complete) { this.error("Komponente '" + d.name + "' hat einen unvollständigen Typ", d.nameTok); continue; }
        if (ft.k === "void") { this.error("Komponente '" + d.name + "' kann nicht void sein", d.nameTok); continue; }
        if (def.fields.some(function (f) { return f.name === d.name; })) this.error("Komponente '" + d.name + "' ist doppelt", d.nameTok);
        var a = ft.align;
        var fo = isUnion ? 0 : alignUp(off, a);
        def.fields.push({ name: d.name, type: ft, offset: fo });
        if (!isUnion) off = fo + ft.size;
        maxSize = Math.max(maxSize, ft.size);
        maxAlign = Math.max(maxAlign, a);
      } while (this.accept(","));
      this.expect(";");
    }
    this.next();
    def.align = maxAlign;
    def.size = alignUp(isUnion ? maxSize : off, maxAlign) || maxAlign;
    def.complete = true;
    ty.size = def.size; ty.align = def.align;
    if (!def.fields.length) this.warn("Leere Struktur", kw);
    return ty;
  }
  if (!tag) throw cerr("Nach 'struct' wird ein Name oder '{' erwartet", this.peek());
  var found = this.scope.findTag(tag);
  if (found) return found;
  // Vorwärtsdeklaration
  var d2 = { tag: tag, union: isUnion, fields: [], size: 0, align: 1, complete: false, id: ++this.structId };
  var t2 = { k: "struct", def: d2, size: 0, align: 1 };
  this.scope.tags[tag] = t2;
  return t2;
};

PP.enumSpec = function () {
  var kw = this.next();
  if (this.peek().t === "id") this.next();
  if (this.accept("{")) {
    var v = 0;
    while (!this.is("}")) {
      var nt = this.next();
      if (nt.t !== "id") throw cerr("Name in enum erwartet", nt);
      if (this.accept("=")) {
        var e = this.assignExpr(), c = this.constVal(e);
        if (c === null) this.error("Wert in enum muss eine Konstante sein", nt); else v = Number(c);
      }
      this.declare(nt.v, { kind: "enum", value: v, type: TY.int, name: nt.v }, nt);
      v++;
      if (!this.accept(",")) break;
    }
    this.expect("}");
  }
  return TY.int;
};

// ---------- Deklaratoren ----------
PP.declarator = function (abstract) {
  var self = this, ptrs = [], name = null, nameTok = null, inner = null, suffixes = [], params = null;
  while (this.is("*")) {
    this.next(); var c = false;
    while (this.is("const") || this.is("volatile") || this.is("restrict")) { if (this.next().v === "const") c = true; }
    ptrs.push(c);
  }
  if (this.is("(") && (this.is("*", 1) || (this.is("(", 1)) || (this.peek(1).t === "id" && !this.isTypedefName(this.peek(1)) && abstract !== true && this.peek(2).v === ")" && false))) {
    this.next(); inner = this.declarator(abstract); this.expect(")");
  } else if (this.peek().t === "id" && !(abstract === true)) {
    nameTok = this.next(); name = nameTok.v;
  } else if (this.peek().t === "kw" && !TYPE_KW[this.peek().v] && abstract === false) {
    throw cerr("'" + this.peek().v + "' ist ein Schlüsselwort und kann nicht als Name verwendet werden", this.peek());
  }
  for (;;) {
    if (this.is("[")) {
      var ob = this.next();
      if (this.is("]")) { this.next(); suffixes.push({ arr: true, len: null, at: ob }); continue; }
      var e = this.assignExpr(), cv = this.constVal(e);
      this.expect("]");
      if (cv === null) {
        this.error("Die Arraygröße muss eine Konstante sein", e,
          "Verwende eine Konstante, z. B. #define N 10 und dann int werte[N];");
        cv = 1;
      } else if (Number(cv) <= 0) { this.error("Die Arraygröße muss größer als 0 sein", e); cv = 1; }
      suffixes.push({ arr: true, len: Number(cv), at: ob });
      continue;
    }
    if (this.is("(")) {
      var op = this.next();
      var pl = this.paramList();
      suffixes.push({ fn: true, params: pl.params, variadic: pl.variadic, unspec: pl.unspec, at: op });
      if (!params) params = pl.params;
      continue;
    }
    break;
  }
  return {
    name: name || (inner && inner.name), nameTok: nameTok || (inner && inner.nameTok),
    params: inner && inner.params ? inner.params : params,
    apply: function (base) {
      var t = base;
      ptrs.forEach(function (c) { t = ptrTo(t); if (c) t = withConst(t); });
      for (var i = suffixes.length - 1; i >= 0; i--) {
        var s = suffixes[i];
        if (s.arr) {
          if (t.k === "func") self.error("Arrays von Funktionen gibt es nicht", s.at);
          if (t.k === "void") { self.error("Ein Array kann nicht vom Typ void sein", s.at); t = TY.int; }
          if (t.k === "arr" && t.len == null) self.error("Bei mehrdimensionalen Arrays darf nur die erste Größe fehlen", s.at);
          t = arrOf(t, s.len);
        } else {
          if (t.k === "arr") self.error("Eine Funktion kann kein Array zurückgeben", s.at);
          t = funcT(t, s.params, s.variadic, s.unspec);
        }
      }
      return inner ? inner.apply(t) : t;
    }
  };
};

PP.paramList = function () {
  var params = [], variadic = false;
  if (this.accept(")")) return { params: params, variadic: false, unspec: true };
  if (this.is("void") && this.is(")", 1)) { this.next(); this.next(); return { params: params, variadic: false, unspec: false }; }
  for (;;) {
    if (this.accept("...")) { variadic = true; break; }
    var t = this.peek();
    var ds = this.declSpecs();
    if (!ds) {
      if (t.t === "id") throw cerr("Unbekannter Datentyp '" + t.v + "' im Parameter", t,
        this.peek(1).t === "id" ? null : "Jeder Parameter braucht einen Datentyp, z. B. (int " + t.v + ").");
      throw cerr("Parameter erwartet, gefunden: '" + this.tokText(t) + "'", t);
    }
    var d = this.declarator(null);
    var pt = d.apply(ds.type);
    // Anpassungen: Array -> Zeiger, Funktion -> Zeiger
    if (pt.k === "arr") pt = ptrTo(pt.of);
    else if (pt.k === "func") pt = ptrTo(pt);
    if (pt.k === "void") { this.error("Parameter kann nicht void sein", t); pt = TY.int; }
    params.push({ name: d.name, type: pt, tok: d.nameTok || t });
    if (!this.accept(",")) break;
  }
  this.expect(")");
  return { params: params, variadic: variadic, unspec: false };
};

PP.typeName = function () {
  var ds = this.declSpecs();
  if (!ds) return null;
  if (ds.storage) this.error("Speicherklasse in Typangabe nicht erlaubt", ds.at);
  var d = this.declarator(true);
  return d.apply(ds.type);
};

// ---------- Symbole ----------
PP.declare = function (name, sym, at) {
  var sc = this.scope;
  var old = sc.syms[name];
  if (old) {
    if (old.kind === "func" && sym.kind === "func") return old;
    if (sc.kind === "global" && old.kind === "var" && sym.kind === "var" && sameType(old.type, sym.type) && (old.ext || sym.ext)) return old;
    this.error("'" + name + "' ist hier schon deklariert (Zeile " + old.line + ")", at);
    return old;
  }
  sym.line = at.line; sym.col = at.col;
  sc.syms[name] = sym;
  return sym;
};

PP.allocGlobal = function (ty) {
  var off = alignUp(this.globalSize, Math.max(ty.align, 8));
  this.globalSize = off + Math.max(ty.size, 1) + GAP;
  if (GLOBAL_BASE + this.globalSize > HEAP_BASE) throw cerr("Zu viele globale Daten", null);
  return GLOBAL_BASE + off;
};
PP.allocLocal = function (ty) {
  var f = this.fn;
  var off = alignUp(f.frameSize, Math.max(ty.align, 8));
  f.frameSize = off + Math.max(ty.size, 1) + GAP;
  f.slots.push({ off: off, size: Math.max(ty.size, 1) });
  if (f.frameSize > 0x300000) throw cerr("Lokale Variablen sind zu groß für den Stack", null, "Sehr große Arrays global anlegen.");
  return off;
};
PP.literal = function (bytes) {
  var key = bytes.join(",");
  if (this.litMap[key] != null) return this.litMap[key];
  var addr = LIT_BASE + this.litSize;
  this.litSize += bytes.length + 1 + 8;
  if (LIT_BASE + this.litSize > GLOBAL_BASE) throw cerr("Zu viele Zeichenketten im Programm", null);
  this.lits.push({ addr: addr, bytes: bytes });
  this.litMap[key] = addr;
  return addr;
};

PP.useLibName = function (name, at) {
  this.usedLib[name] = true;
};

// Name auflösen (Variable, Funktion, Bibliothek)
PP.lookup = function (t) {
  var s = this.scope.find(t.v);
  if (s) return s;
  var h = NAME_HEADER[t.v];
  if (h && this.headers[h]) {
    if (LIB[t.v]) return { kind: "lib", name: t.v, type: LIB[t.v].type, lib: LIB[t.v] };
    if (LIB_VARS[t.v]) return { kind: "libvar", name: t.v, type: LIB_VARS[t.v].type, id: LIB_VARS[t.v].id };
  }
  return null;
};
PP.undeclared = function (t, isCall) {
  var name = t.v, h = NAME_HEADER[name], hint = null;
  if (h && !this.headers[h]) {
    hint = "#include <" + h + "> fehlt am Anfang des Programms.";
    this.missingHdr = this.missingHdr || {};
    if (this.missingHdr[name]) return null;
    this.missingHdr[name] = true;
    if (isCall) { this.error("Funktion '" + name + "' ist unbekannt", t, hint); return null; }
    this.error("'" + name + "' ist unbekannt", t, hint);
    return null;
  }
  var names = [];
  for (var sc = this.scope; sc; sc = sc.parent) names = names.concat(Object.keys(sc.syms));
  Object.keys(NAME_HEADER).forEach(function (n) { if (this.headers[NAME_HEADER[n]]) names.push(n); }, this);
  var sug = similar(name, names);
  if (isCall) {
    var later = this.laterFunctions && this.laterFunctions[name];
    if (later) {
      this.error("Funktion '" + name + "' ist an dieser Stelle noch nicht bekannt", t,
        "Sie wird erst in Zeile " + later.line + " definiert. Schreibe vor main einen Prototyp: " + later.proto + ";");
      return null;
    }
    this.error("Funktion '" + name + "' ist nicht deklariert", t,
      sug ? "Meintest du '" + sug + "'?" + (sug.toLowerCase() === name.toLowerCase() ? " C unterscheidet Groß- und Kleinschreibung." : "") : null);
    return null;
  }
  var msg = "'" + name + "' ist nicht deklariert";
  if (this.fn) msg += " (erste Verwendung in dieser Funktion)";
  if (!sug && /^[A-Z]$/.test(name) === false && name === "O") sug = null;
  var hint2 = sug ? "Meintest du '" + sug + "'?" : null;
  if (!hint2 && this.outOfScope && this.outOfScope[name]) hint2 = "'" + name + "' gibt es nur innerhalb des Blocks bzw. der Schleife, in dem es deklariert wurde.";
  if (!hint2 && name === "O") hint2 = "Ist hier die Ziffer 0 gemeint statt des Buchstabens O?";
  if (!hint2 && (name === "string" || name === "String")) hint2 = "C hat keinen Datentyp string. Texte speichert man in char-Arrays, z. B. char name[30];";
  this.error(msg, t, hint2);
  return null;
};

// ---------- Konstante Ausdrücke ----------
PP.constVal = function (n) {
  try { return constEval(n); } catch (e) { return null; }
};
function constEval(n) {
  switch (n.k) {
    case "num": if (n.ty.k === "float") throw 0; return n.v;
    case "conv": {
      var v = constEval(n.x);
      if (n.ty.k !== "int") throw 0;
      return convConst(v, n.ty);
    }
    case "enumc": return n.v;
    case "sizeof": return n.v;
    case "un": {
      var a = constEval(n.x);
      var big = typeof a === "bigint";
      switch (n.op) {
        case "-": return big ? BigInt.asIntN(64, -a) : convConst(-a, n.ty);
        case "+": return a;
        case "~": return big ? BigInt.asIntN(64, ~a) : convConst(~a, n.ty);
        case "!": return (big ? a === 0n : a === 0) ? 1 : 0;
      }
      throw 0;
    }
    case "bin": {
      var l = constEval(n.l), r = constEval(n.r);
      if (n.ty.k !== "int" && ["<", ">", "<=", ">=", "==", "!="].indexOf(n.op) < 0) throw 0;
      var opt = n.opt || n.ty;
      if (opt.size === 8) { l = BigInt(l); r = BigInt(r); } else { l = Number(l); r = Number(r); }
      var res;
      switch (n.op) {
        case "+": res = l + r; break; case "-": res = l - r; break; case "*": res = opt.size === 8 ? l * r : Math.imul(l, r); break;
        case "/": if (r == 0) throw 0; res = opt.size === 8 ? l / r : Math.trunc(l / r); break;
        case "%": if (r == 0) throw 0; res = l % r; break;
        case "<<": res = opt.size === 8 ? l << r : l << r; break; case ">>": res = l >> r; break;
        case "&": res = l & r; break; case "|": res = l | r; break; case "^": res = l ^ r; break;
        case "<": return l < r ? 1 : 0; case ">": return l > r ? 1 : 0; case "<=": return l <= r ? 1 : 0;
        case ">=": return l >= r ? 1 : 0; case "==": return l == r ? 1 : 0; case "!=": return l != r ? 1 : 0;
        default: throw 0;
      }
      return convConst(res, n.ty);
    }
    case "log": { var a2 = constEval(n.l); var t2 = Number(a2) !== 0; if (n.op === "&&") return t2 && Number(constEval(n.r)) !== 0 ? 1 : 0; return t2 || Number(constEval(n.r)) !== 0 ? 1 : 0; }
    case "cond": return Number(constEval(n.c)) !== 0 ? constEval(n.a) : constEval(n.b);
  }
  throw 0;
}
function convConst(v, t) {
  if (t.k !== "int") throw 0;
  if (t.size === 8) return t.signed ? BigInt.asIntN(64, BigInt(v)) : BigInt.asUintN(64, BigInt(v));
  return wrapInt(Number(v), t);
}
function wrapInt(v, t) {
  if (t.isBool) return v ? 1 : 0;
  switch (t.size) {
    case 1: return t.signed ? (v << 24) >> 24 : v & 255;
    case 2: return t.signed ? (v << 16) >> 16 : v & 65535;
    default: return t.signed ? v | 0 : v >>> 0;
  }
}

// ---------- Typregeln ----------
function promote(t) {
  if (t.k === "int" && t.size < 4) return TY.int;
  return unqual(t);
}
function arithResult(a, b) {
  if (a.k === "float" || b.k === "float") {
    if (a.size === 16 || b.size === 16) return TY.ldouble;
    if ((a.k === "float" && a.size === 8) || (b.k === "float" && b.size === 8)) return TY.double;
    return TY.float;
  }
  a = promote(a); b = promote(b);
  if (a.name === b.name) return a;
  if (a.signed === b.signed) return a.rank >= b.rank ? a : b;
  var u = a.signed ? b : a, s = a.signed ? a : b;
  if (u.rank >= s.rank) return u;
  if (s.size > u.size) return s;
  // vorzeichenlose Variante des vorzeichenbehafteten Typs
  return s.rank === 4 ? TY.ulong : s.rank === 5 ? TY.ullong : TY.uint;
}

// Wert eines Ausdrucks als rvalue (Array -> Zeiger, lvalue -> Laden)
PP.rv = function (n) {
  if (n.ty.k === "err") return n;
  if (n.ty.k === "arr") {
    return N("decay", n, { x: n, ty: ptrTo(n.ty.of), pure: n.pure, s: n.s, e: n.e, src: n });
  }
  if (n.ty.k === "func") return N("fdesig", n, { x: n, ty: ptrTo(n.ty), pure: n.pure, s: n.s, e: n.e });
  if (n.lv) return N("load", n, { x: n, ty: unqual(n.ty), pure: n.pure, s: n.s, e: n.e });
  return n;
};
PP.conv = function (n, t) {
  if (n.ty.k === "err" || t.k === "err") return n;
  var from = n.ty;
  if (sameType(unqual(from), unqual(t)) && from.k !== "int") return n;
  if (from.k === "int" && t.k === "int" && from.name === t.name) return n;
  if (t.k === "void") return N("conv", n, { x: n, ty: TY.void, pure: n.pure, s: n.s, e: n.e });
  return N("conv", n, { x: n, ty: unqual(t), from: from, pure: n.pure, s: n.s, e: n.e });
};
function isNullConst(n) {
  var x = n;
  while (x.k === "conv") x = x.x;
  return x.k === "num" && x.ty.k === "int" && (x.v === 0 || x.v === 0n);
}

// Zuweisungskompatibilität prüfen und konvertieren
PP.assignConv = function (n, t, ctx, at) {
  if (n.ty.k === "err" || t.k === "err") return n;
  var f = n.ty;
  at = at || n;
  if (t.k === "arr") {
    this.error("Einem Array kann man nichts mit = zuweisen", at,
      isCharPtrLike(t) ? "Texte kopiert man mit strcpy(ziel, quelle) aus string.h." : "Werte einzeln zuweisen, z. B. mit einer for-Schleife.");
    return n;
  }
  if (f.k === "void") { this.error("Ein void-Ausdruck hat keinen Wert", at); return n; }
  if (t.k === "struct") {
    if (f.k !== "struct" || f.def !== t.def) this.error(ctx + ": " + typeStr(f) + " passt nicht zu " + typeStr(t), at);
    return n;
  }
  if (f.k === "struct") { this.error(ctx + ": Eine Struktur (" + typeStr(f) + ") passt nicht zu " + typeStr(t), at); return n; }
  if (isArith(t) && isArith(f)) {
    this.checkIntDiv(n, t);
    return this.conv(n, t);
  }
  if (t.k === "ptr") {
    if (f.k === "ptr") {
      var a = unqual(t.to), b = unqual(f.to);
      if (!(a.k === "void" || b.k === "void" || sameType(a, b))) {
        this.warn(ctx + ": Zeigertypen passen nicht zusammen (" + typeStr(f) + " statt " + typeStr(t) + ")", at,
          f.to.k === "ptr" || t.to.k === "ptr" ? null : (f.to.k === "arr" && t.to.k !== "arr" ? "Bei Arrays und Strings steht kein &." : null));
      }
      return this.conv(n, t);
    }
    if (f.k === "int") {
      if (isNullConst(n)) return this.conv(n, t);
      this.error(ctx + ": Aus einer Ganzzahl (" + typeStr(f) + ") wird ein Zeiger (" + typeStr(t) + ")", at,
        ctx.indexOf("Argument") === 0 ? "Fehlt ein & vor der Variable – oder wird ein Zeichen statt eines Textes übergeben?" : null);
      return this.conv(n, t);
    }
  }
  if (t.k === "int" && f.k === "ptr") {
    var hint = null;
    if (n.k === "decay" && n.x.k === "str") hint = t.isChar ? "Ein Text passt nicht in eine char-Variable. Verwende ein Array: char name[] = \"…\";" : "Ein Text ist keine Zahl.";
    else if (t.isChar && isCharPtrLike(f)) hint = "Ein einzelnes Zeichen holt man mit Index, z. B. text[0].";
    this.error(ctx + ": Aus einem Zeiger (" + typeStr(f) + ") wird eine Ganzzahl (" + typeStr(t) + ")", at, hint);
    return this.conv(n, t);
  }
  this.error(ctx + ": " + typeStr(f) + " passt nicht zu " + typeStr(t), at);
  return n;
};

PP.checkIntDiv = function (n, t) {
  if (t.k !== "float") return;
  var x = n;
  while (x.k === "conv" && x.ty.k === "int") x = x.x;
  if (x.k === "bin" && x.op === "/" && x.ty.k === "int") {
    this.warn("Ganzzahldivision: " + this.text(x) + " rechnet ohne Nachkommastellen", x,
      "Beide Operanden sind ganzzahlig, daher wird abgeschnitten. Für ein Kommaergebnis z. B. (double) " + this.text(x.l) + " / " + this.text(x.r) + " schreiben.", "hint");
  }
};

PP.cond = function (n, what) {
  var c = this.rv(n);
  if (c.ty.k === "err") return c;
  if (!isScalar(c.ty)) { this.error("Die Bedingung " + what + " muss eine Zahl oder ein Zeiger sein, nicht " + typeStr(c.ty), n); return c; }
  if (n.k === "asg" && n.op === "=" && !n.paren) {
    this.warn("Zuweisung statt Vergleich in der Bedingung?", n,
      "= weist zu, == vergleicht. Für einen Vergleich: " + this.text(n.l) + " == " + this.text(n.r));
  }
  return c;
};

// ---------- Ausdrücke ----------
PP.expr = function () {
  var e = this.assignExpr();
  while (this.is(",")) {
    var op = this.next(), r = this.assignExpr();
    var l2 = this.rv(e), r2 = this.rv(r);
    e = span(N("comma", op, { l: l2, r: r2, ty: r2.ty, pure: l2.pure && r2.pure }), e, r);
  }
  return e;
};

var ASSIGN_OPS = { "=": 1, "+=": 1, "-=": 1, "*=": 1, "/=": 1, "%=": 1, "<<=": 1, ">>=": 1, "&=": 1, "^=": 1, "|=": 1 };
PP.assignExpr = function () {
  var l = this.condExpr();
  var t = this.peek();
  if (t.t === "op" && ASSIGN_OPS[t.v]) {
    this.next();
    var r = this.assignExpr();
    return span(this.mkAssign(t.v, l, r, t), l, r);
  }
  return l;
};
PP.checkLvalue = function (l, at, what) {
  if (l.ty.k === "err") return false;
  if (!l.lv) {
    var hint = null;
    if (l.k === "bin" || l.k === "num") hint = "Links vom = muss eine Variable stehen, rechts der Wert. Beispiel: x = x + 1;";
    this.error((what || "Zuweisung") + ": Links steht keine Variable (" + this.text(l) + ")", at, hint);
    return false;
  }
  if (l.ty.k === "arr") {
    this.error("Einem Array kann man nichts mit = zuweisen", at,
      isCharPtrLike(l.ty) ? "Texte kopiert man mit strcpy(ziel, quelle) aus string.h." : "Werte einzeln zuweisen, z. B. mit einer for-Schleife.");
    return false;
  }
  if (l.ty.cq || (l.k === "id" && l.sym && l.sym.type.cq)) {
    this.error("'" + this.text(l) + "' ist const und darf nicht verändert werden", at);
    return false;
  }
  if (l.ty.k === "struct" && l.ty.def.fields.some(function (f) { return f.type.cq; })) {
    this.error("Struktur mit const-Komponenten kann nicht zugewiesen werden", at);
    return false;
  }
  return true;
};
PP.mkAssign = function (op, l, r, at) {
  if (l.ty.k === "err" || r.ty.k === "err") return ERRN(at);
  if (!this.checkLvalue(l, at)) return ERRN(at);
  var rr = this.rv(r);
  var lt = unqual(l.ty);
  if (op === "=") {
    var v = this.assignConv(rr, lt, "Zuweisung", at);
    return N("asg", at, { op: "=", l: l, r: v, ty: lt, pure: l.pure && v.pure, srcR: r });
  }
  // zusammengesetzte Zuweisung: l = l op r
  var bop = op.slice(0, -1);
  var fake = N("casgval", l, { x: l, ty: lt, pure: true, s: l.s, e: l.e });
  var b = this.mkBinary(bop, fake, rr, at, true);
  if (b.ty.k === "err") return b;
  var res = b.k === "padd" || b.k === "psub" ? b : this.conv(b, lt);
  return N("casg", at, { op: op, l: l, val: res, ty: lt, pure: l.pure && rr.pure, ldummy: fake });
};

PP.condExpr = function () {
  var c = this.binExpr(0);
  if (this.is("?")) {
    var q = this.next();
    var a = this.expr();
    this.expect(":", "im Bedingungsoperator ?:");
    var b = this.condExpr();
    var cc = this.cond(c, "vor ?");
    var a2 = this.rv(a), b2 = this.rv(b), ty;
    if (a2.ty.k === "err" || b2.ty.k === "err") return ERRN(q);
    if (isArith(a2.ty) && isArith(b2.ty)) { ty = arithResult(a2.ty, b2.ty); a2 = this.conv(a2, ty); b2 = this.conv(b2, ty); }
    else if (a2.ty.k === "struct" && b2.ty.k === "struct" && a2.ty.def === b2.ty.def) ty = a2.ty;
    else if (a2.ty.k === "void" && b2.ty.k === "void") ty = TY.void;
    else if (isPtr(a2.ty) && (isPtr(b2.ty) || isNullConst(b2))) { ty = a2.ty; b2 = this.conv(b2, ty); }
    else if (isPtr(b2.ty) && isNullConst(a2)) { ty = b2.ty; a2 = this.conv(a2, ty); }
    else { this.error("Die beiden Seiten von ?: haben unverträgliche Typen (" + typeStr(a2.ty) + " und " + typeStr(b2.ty) + ")", q); return ERRN(q); }
    return span(N("cond", q, { c: cc, a: a2, b: b2, ty: ty, pure: cc.pure && a2.pure && b2.pure }), c, b);
  }
  return c;
};

var BIN_LEVELS = [["||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"]];
PP.binExpr = function (lvl) {
  if (lvl >= BIN_LEVELS.length) return this.castExpr();
  var l = this.binExpr(lvl + 1);
  for (;;) {
    var t = this.peek();
    if (t.t !== "op" || BIN_LEVELS[lvl].indexOf(t.v) < 0) break;
    this.next();
    var r = this.binExpr(lvl + 1);
    var n;
    if (t.v === "&&" || t.v === "||") {
      var lc = this.cond(l, "links von " + t.v), rc = this.cond(r, "rechts von " + t.v);
      n = N("log", t, { op: t.v, l: lc, r: rc, ty: TY.int, pure: lc.pure && rc.pure });
    } else {
      if ((lvl === 5 || lvl === 6) && (l.k === "bin" && ["<", ">", "<=", ">=", "==", "!="].indexOf(l.op) >= 0) && !l.paren) {
        this.warn("Vergleichsketten wie " + this.text(l) + " " + t.v + " " + this.src.slice(r.s, r.e) + " funktionieren in C nicht wie in der Mathematik", t,
          "C wertet von links aus: Der erste Vergleich ergibt 0 oder 1. Richtig ist z. B.: x >= 1 && x <= 6");
      }
      n = this.mkBinary(t.v, this.rv(l), this.rv(r), t, false);
      if (n.k === "bin") { n.srcL = l; n.srcR = r; }
    }
    l = span(n, l, r);
  }
  return l;
};

PP.mkBinary = function (op, l, r, at, compound) {
  var lt = l.ty, rt = r.ty;
  if (lt.k === "err" || rt.k === "err") return ERRN(at);
  if (lt.k === "void" || rt.k === "void") { this.error("Mit einem void-Wert kann man nicht rechnen", at); return ERRN(at); }
  if (lt.k === "struct" || rt.k === "struct") {
    var hint = (op === "==" || op === "!=") ? "Strukturen vergleicht man Komponente für Komponente, z. B. a.x == b.x" : null;
    this.error("Der Operator " + op + " funktioniert nicht mit Strukturen (" + typeStr(lt.k === "struct" ? lt : rt) + ")", at, hint);
    return ERRN(at);
  }
  var pure = l.pure && r.pure;
  switch (op) {
    case "+": case "-":
      if (isPtr(lt) && isInt(rt)) return N(op === "+" ? "padd" : "psub", at, { p: l, i: r, ty: lt, pure: pure, elem: this.elemSize(lt, at) });
      if (op === "+" && isInt(lt) && isPtr(rt)) return N("padd", at, { p: r, i: l, ty: rt, pure: pure, elem: this.elemSize(rt, at) });
      if (op === "-" && isPtr(lt) && isPtr(rt)) {
        if (!sameType(unqual(lt.to), unqual(rt.to))) this.error("Subtraktion von Zeigern verschiedenen Typs", at);
        return N("pdiff", at, { l: l, r: r, ty: TY.long, pure: pure, elem: this.elemSize(lt, at) });
      }
      // fallthrough
    case "*": case "/":
      if (!isArith(lt) || !isArith(rt)) { this.error("Der Operator " + op + " passt nicht zu " + typeStr(lt) + " und " + typeStr(rt), at); return ERRN(at); }
      var t1 = arithResult(lt, rt);
      return N("bin", at, { op: op, l: this.conv(l, t1), r: this.conv(r, t1), ty: t1, opt: t1, pure: pure });
    case "%":
      if (isFloat(lt) || isFloat(rt)) {
        this.error("Der Operator % funktioniert nur mit Ganzzahlen", at, "Für Kommazahlen gibt es fmod(a, b) aus math.h.");
        return ERRN(at);
      }
      // fallthrough
    case "<<": case ">>": case "&": case "|": case "^":
      if (!isInt(lt) || !isInt(rt)) { this.error("Der Operator " + op + " braucht Ganzzahlen", at); return ERRN(at); }
      if (op === "<<" || op === ">>") {
        var pl = promote(lt);
        return N("bin", at, { op: op, l: this.conv(l, pl), r: this.conv(r, TY.int), ty: pl, opt: pl, pure: pure });
      }
      var t2 = arithResult(lt, rt);
      return N("bin", at, { op: op, l: this.conv(l, t2), r: this.conv(r, t2), ty: t2, opt: t2, pure: pure });
    case "<": case ">": case "<=": case ">=": case "==": case "!=":
      if (isArith(lt) && isArith(rt)) {
        var t3 = arithResult(lt, rt);
        if ((op === "==" || op === "!=") && isFloat(t3)) {
          // erlaubt, aber oft problematisch – kein Hinweis, um nicht zu stören
        }
        if (isInt(lt) && isInt(rt) && lt.signed !== rt.signed && !t3.signed && !(isNullConst(l) || isNullConst(r))) {
          var sgn = lt.signed ? l : r;
          if (!(sgn.k === "num" && Number(sgn.v) >= 0)) {
            this.warn("Vergleich zwischen vorzeichenbehaftetem und vorzeichenlosem Wert", at,
              "Negative Zahlen werden dabei zu sehr großen Zahlen. Tipp: (int) vor den vorzeichenlosen Wert, z. B. (int) strlen(s).");
          }
        }
        return N("bin", at, { op: op, l: this.conv(l, t3), r: this.conv(r, t3), ty: TY.int, opt: t3, pure: pure });
      }
      if (isPtr(lt) && isPtr(rt)) {
        if ((op === "==" || op === "!=") && isCharPtrLike(lt) && isCharPtrLike(rt)) {
          this.warn("Zeichenketten mit " + op + " zu vergleichen vergleicht nur die Adressen", at,
            "Den Inhalt vergleicht man mit strcmp(a, b) == 0 aus string.h.");
        }
        return N("bin", at, { op: op, l: l, r: r, ty: TY.int, opt: TY.ulong, ptrcmp: true, pure: pure });
      }
      if (isPtr(lt) && isInt(rt) || isInt(lt) && isPtr(rt)) {
        var pn = isPtr(lt) ? l : r, iN = isPtr(lt) ? r : l;
        if (!isNullConst(iN)) {
          var h3 = isCharPtrLike(pn.ty) && iN.k === "num" ? "Ein einzelnes Zeichen vergleicht man mit text[i] == 'x'." : null;
          this.warn("Vergleich zwischen Zeiger und Ganzzahl", at, h3);
        }
        return N("bin", at, { op: op, l: this.conv(l, TY.ulong), r: this.conv(r, TY.ulong), ty: TY.int, opt: TY.ulong, ptrcmp: true, pure: pure });
      }
      this.error("Vergleich von " + typeStr(lt) + " und " + typeStr(rt) + " ist nicht möglich", at);
      return ERRN(at);
  }
  this.error("Unbekannter Operator " + op, at);
  return ERRN(at);
};
PP.elemSize = function (pt, at) {
  var t = pt.to;
  if (t.k === "void") { this.warn("Rechnen mit void-Zeiger", at); return 1; }
  if (t.k === "func") { this.error("Rechnen mit Funktionszeigern ist nicht möglich", at); return 1; }
  if (t.k === "struct" && !t.def.complete) { this.error("Unvollständiger Typ " + typeStr(t), at); return 1; }
  return t.size;
};

PP.castExpr = function () {
  if (this.is("(") && this.startsType(1)) {
    var op = this.next();
    var ty = this.typeName();
    this.expect(")");
    if (this.is("{")) throw cerr("Zusammengesetzte Literale (type){…} werden nicht unterstützt", op);
    var x = this.castExpr();
    var v = this.rv(x);
    if (v.ty.k === "err") return v;
    if (ty.k === "void") return span(N("conv", op, { x: v, ty: TY.void, pure: v.pure }), op, x);
    if (ty.k === "struct" || ty.k === "arr" || ty.k === "func") { this.error("Umwandlung in " + typeStr(ty) + " ist nicht möglich", op); return ERRN(op); }
    if (!isScalar(v.ty)) { this.error("Umwandlung von " + typeStr(v.ty) + " nach " + typeStr(ty) + " ist nicht möglich", op); return ERRN(op); }
    if (isFloat(ty) && isPtr(v.ty) || isPtr(ty) && isFloat(v.ty)) { this.error("Zeiger und Kommazahlen lassen sich nicht ineinander umwandeln", op); return ERRN(op); }
    var c = N("conv", op, { x: v, ty: unqual(ty), from: v.ty, pure: v.pure, cast: true });
    return span(c, op, x);
  }
  return this.unaryExpr();
};

PP.unaryExpr = function () {
  var t = this.peek();
  if (t.t === "op") {
    switch (t.v) {
      case "++": case "--": {
        this.next(); var x = this.unaryExpr();
        return span(this.mkIncDec(t.v, x, t, true), t, x);
      }
      case "+": case "-": case "~": case "!": {
        this.next(); var x2 = this.castExpr(), v = this.rv(x2);
        if (v.ty.k === "err") return v;
        if (t.v === "!") {
          if (!isScalar(v.ty)) { this.error("! braucht eine Zahl oder einen Zeiger", t); return ERRN(t); }
          return span(N("not", t, { x: v, ty: TY.int, pure: v.pure }), t, x2);
        }
        if (t.v === "~" ? !isInt(v.ty) : !isArith(v.ty)) { this.error("Der Operator " + t.v + " passt nicht zu " + typeStr(v.ty), t); return ERRN(t); }
        var pt = promote(v.ty);
        return span(N("un", t, { op: t.v, x: this.conv(v, pt), ty: pt, pure: v.pure }), t, x2);
      }
      case "&": {
        this.next(); var x3 = this.castExpr();
        if (x3.ty.k === "err") return x3;
        if (x3.ty.k === "func") return span(N("fdesig", t, { x: x3, ty: ptrTo(x3.ty), pure: true }), t, x3);
        if (!x3.lv) {
          this.error("Der Adressoperator & braucht eine Variable, nicht " + this.text(x3), t,
            x3.k === "num" ? "Vor Zahlen steht kein &." : null);
          return ERRN(t);
        }
        if (x3.k === "idx") x3.inAddr = true;
        return span(N("addr", t, { x: x3, ty: ptrTo(x3.ty), pure: x3.pure }), t, x3);
      }
      case "*": {
        this.next(); var x4 = this.castExpr(), v4 = this.rv(x4);
        if (v4.ty.k === "err") return v4;
        if (!isPtr(v4.ty)) {
          this.error("Der Operator * (Dereferenzierung) braucht einen Zeiger, " + this.text(x4) + " ist " + typeStr(v4.ty), t);
          return ERRN(t);
        }
        if (v4.ty.to.k === "void") { this.error("Ein void-Zeiger kann nicht dereferenziert werden", t); return ERRN(t); }
        if (v4.ty.to.k === "func") return v4;
        return span(N("deref", t, { x: v4, ty: v4.ty.to, lv: true, pure: v4.pure }), t, x4);
      }
    }
  }
  if (t.t === "kw" && t.v === "sizeof") {
    this.next();
    var ty;
    if (this.is("(") && this.startsType(1)) {
      this.next(); ty = this.typeName(); this.expect(")");
    } else {
      var x5 = this.unaryExpr();
      if (x5.ty.k === "err") return x5;
      ty = x5.ty;
      if (x5.k === "decay") ty = x5.x.ty;
    }
    var end = this.prev();
    if (ty.k === "func") { this.error("sizeof einer Funktion ist nicht möglich", t); return ERRN(t); }
    if (ty.k === "struct" && !ty.def.complete) { this.error("sizeof eines unvollständigen Typs", t); return ERRN(t); }
    if (ty.k === "arr" && ty.len == null) { this.error("sizeof eines Arrays ohne Größe", t); return ERRN(t); }
    return span(N("sizeof", t, { v: BigInt(ty.size), ty: TY.sizet }), t, end);
  }
  return this.postfixExpr();
};

PP.mkIncDec = function (op, x, at, prefix) {
  if (x.ty.k === "err") return x;
  if (!this.checkLvalue(x, at, op)) return ERRN(at);
  var t = unqual(x.ty);
  if (!isScalar(t)) { this.error(op + " passt nicht zu " + typeStr(t), at); return ERRN(at); }
  var step = isPtr(t) ? this.elemSize(t, at) : 1;
  return N(prefix ? "pre" : "post", at, { op: op, x: x, ty: t, step: step, pure: x.pure });
};

PP.postfixExpr = function () {
  var e = this.primary();
  for (;;) {
    var t = this.peek();
    if (t.t !== "op") break;
    if (t.v === "[") {
      this.next();
      var idx = this.expr();
      var close = this.expect("]");
      e = span(this.mkIndex(e, idx, t), e, close);
      continue;
    }
    if (t.v === "(") {
      this.next();
      e = this.mkCall(e, t);
      continue;
    }
    if (t.v === "." || t.v === "->") {
      this.next();
      var nt = this.next();
      if (nt.t !== "id") throw cerr("Nach " + t.v + " wird der Name einer Komponente erwartet", nt);
      e = span(this.mkMember(e, nt, t.v === "->", t), e, nt);
      continue;
    }
    if (t.v === "++" || t.v === "--") {
      this.next();
      e = span(this.mkIncDec(t.v, e, t, false), e, t);
      continue;
    }
    break;
  }
  return e;
};

PP.mkIndex = function (a, i, at) {
  if (a.ty.k === "err" || i.ty.k === "err") return ERRN(at);
  var arrLen = null, base = a;
  if (a.ty.k === "arr") arrLen = a.ty.len;
  var av = this.rv(a), iv = this.rv(i);
  if (isInt(av.ty) && isPtr(iv.ty)) { var tmp = av; av = iv; iv = tmp; arrLen = null; }
  if (!isPtr(av.ty)) {
    this.error("[ ] ist nur bei Arrays und Zeigern möglich – " + this.text(a) + " ist " + typeStr(av.ty), at,
      av.ty.k === "int" || av.ty.k === "float" ? "Ist " + this.text(a) + " wirklich als Array deklariert?" : null);
    return ERRN(at);
  }
  if (!isInt(iv.ty)) {
    this.error("Der Index muss eine Ganzzahl sein, nicht " + typeStr(iv.ty), i, isFloat(iv.ty) ? "Kommazahlen können kein Index sein. Ggf. (int) davor schreiben." : null);
    return ERRN(at);
  }
  var elt = av.ty.to;
  if (elt.k === "void") { this.error("Index bei einem void-Zeiger ist nicht möglich", at); return ERRN(at); }
  var c = this.constVal(iv);
  if (c !== null && arrLen != null && (Number(c) < 0 || Number(c) >= arrLen)) {
    this.warn("Index " + c + " liegt außerhalb des Arrays " + this.text(a) + " (gültig: 0 bis " + (arrLen - 1) + ")", i,
      Number(c) === arrLen ? "Ein Array mit " + arrLen + " Elementen hat die Indizes 0 bis " + (arrLen - 1) + "." : null);
  }
  return N("idx", at, { a: av, i: iv, ty: elt, lv: true, pure: av.pure && iv.pure, elem: elt.size,
    len: arrLen, name: this.text(base) });
};

PP.mkMember = function (x, nt, arrow, at) {
  if (x.ty.k === "err") return ERRN(at);
  var st, base;
  if (arrow) {
    var v = this.rv(x);
    if (!isPtr(v.ty) || v.ty.to.k !== "struct") {
      this.error("-> braucht einen Zeiger auf eine Struktur", at,
        x.ty.k === "struct" ? "" + this.text(x) + " ist kein Zeiger. Verwende den Punkt: " + this.text(x) + "." + nt.v : null);
      return ERRN(at);
    }
    st = v.ty.to; base = v;
  } else {
    if (x.ty.k !== "struct") {
      var h = isPtr(x.ty) && x.ty.to.k === "struct" ? this.text(x) + " ist ein Zeiger. Verwende -> statt ." : null;
      this.error("Der Punkt-Operator braucht eine Struktur – " + this.text(x) + " ist " + typeStr(x.ty), at, h);
      return ERRN(at);
    }
    st = x.ty; base = x;
  }
  if (!st.def.complete) { this.error("Unvollständige Struktur " + typeStr(st), at); return ERRN(at); }
  var f = null;
  st.def.fields.forEach(function (fl) { if (fl.name === nt.v) f = fl; });
  if (!f) {
    var sug = similar(nt.v, st.def.fields.map(function (fl) { return fl.name; }));
    this.error(typeStr(st) + " hat keine Komponente '" + nt.v + "'", nt, sug ? "Meintest du '" + sug + "'?" : "Vorhanden: " + st.def.fields.map(function (fl) { return fl.name; }).join(", "));
    return ERRN(at);
  }
  var ft = f.type;
  if ((x.ty.cq || (arrow && st.cq)) && !ft.cq) ft = withConst(ft);
  if (arrow) return N("mem", at, { x: base, arrow: true, off: f.offset, ty: ft, lv: true, pure: base.pure });
  if (!x.lv) return N("mem", at, { x: base, arrow: false, rvbase: true, off: f.offset, ty: ft, lv: true, pure: base.pure });
  return N("mem", at, { x: base, arrow: false, off: f.offset, ty: ft, lv: true, pure: base.pure });
};

PP.mkCall = function (f, at) {
  var args = [];
  if (!this.is(")")) {
    do { args.push(this.assignExpr()); } while (this.accept(","));
  }
  var close = this.expect(")");
  if (f.ty.k === "err") return ERRN(at);
  var ft = f.ty;
  if (ft.k === "ptr" && ft.to.k === "func") { this.error("Aufrufe über Funktionszeiger werden nicht unterstützt", at); return ERRN(at); }
  if (ft.k !== "func") {
    this.error("'" + this.text(f) + "' ist keine Funktion", at, isArith(ft) ? "Fehlt zwischen Zahl und Klammer ein Rechenzeichen, z. B. 2 * (a + b)?" : null);
    return ERRN(at);
  }
  var name = f.sym ? f.sym.name : this.text(f);
  var ps = ft.params, conv = [], self = this;
  if (!ft.unspec) {
    if (args.length < ps.length) {
      this.error("Zu wenige Argumente für " + name + ": erwartet " + ps.length + ", übergeben " + args.length, at,
        "Funktionskopf: " + typeStr(ft.ret) + " " + name + "(" + (ps.map(function (p) { return typeStr(p.type) + (p.name ? " " + p.name : ""); }).join(", ") || "void") + ")");
      return ERRN(at);
    }
    if (args.length > ps.length && !ft.variadic) {
      this.error("Zu viele Argumente für " + name + ": erwartet " + ps.length + ", übergeben " + args.length, at);
      return ERRN(at);
    }
  }
  args.forEach(function (a, k) {
    var v = self.rv(a);
    if (k < ps.length && !ft.unspec) v = self.assignConv(v, ps[k].type, (k + 1) + ". Argument von " + name, a);
    else {
      // Standard-Erweiterungen für ... (float -> double, char/short -> int)
      if (v.ty.k === "float" && v.ty.size === 4) v = self.conv(v, TY.double);
      else if (v.ty.k === "int" && v.ty.size < 4) v = self.conv(v, TY.int);
      else if (v.ty.k === "void") self.error("void-Wert als Argument", a);
    }
    conv.push(v);
  });
  var pure = conv.every(function (a) { return a.pure; });
  var n = N("call", at, { f: f, args: conv, raw: args, ty: ft.ret, pure: pure, name: name, s: f.s, e: close.e });
  if (f.sym && f.sym.kind === "lib") {
    n.lib = f.sym.lib;
    if (n.lib.gen) n.pure = false;
    if (n.lib.check) n.lib.check.call(this, n, args, conv);
  } else if (f.sym && f.sym.kind === "func") {
    n.fsym = f.sym; n.pure = false;
    this.called.push({ sym: f.sym, at: f });
  } else { this.error("Nur direkte Funktionsaufrufe werden unterstützt", at); return ERRN(at); }
  if (ft.ret.k === "struct") { n.lv = false; }
  return n;
};

PP.primary = function () {
  var t = this.next();
  switch (t.t) {
    case "num": return N("num", t, { v: t.v, ty: t.ty });
    case "char": return N("num", t, { v: t.v, ty: TY.int, isChar: true });
    case "str": {
      var bytes = t.v.slice(), last = t;
      while (this.peek().t === "str") { last = this.next(); bytes = bytes.concat(last.v); }
      var addr = this.literal(bytes);
      return span(N("str", t, { addr: addr, bytes: bytes, ty: arrOf(TY.char, bytes.length + 1), lv: true }), t, last);
    }
    case "id": {
      var s = this.lookup(t);
      if (!s) {
        var isCall = this.is("(");
        this.undeclared(t, isCall);
        if (isCall) return ERRN(t);
        return ERRN(t);
      }
      switch (s.kind) {
        case "var": return N("id", t, { sym: s, ty: s.type, lv: true });
        case "enum": return N("num", t, { v: s.value, ty: TY.int, enumc: true });
        case "func": case "lib": return N("id", t, { sym: s, ty: s.type, lv: false });
        case "libvar": return N("libvar", t, { id: s.id, ty: s.type });
        case "typedef":
          throw cerr("'" + t.v + "' ist ein Datentyp und kann hier nicht stehen", t);
      }
      return ERRN(t);
    }
    case "op":
      if (t.v === "(") {
        var e = this.expr();
        var close = this.expect(")");
        e = Object.assign({}, e); e.paren = true; e.s = t.s; e.e = close.e;
        return e;
      }
      break;
    case "kw":
      if (TYPE_KW[t.v]) throw cerr("Hier wird ein Ausdruck erwartet, kein Datentyp '" + t.v + "'", t,
        this.prev() && this.toks[this.p - 2] && this.toks[this.p - 2].v === "(" ? null : "Deklarationen stehen am Anfang einer Anweisung, z. B. int x = 5;");
      throw cerr("'" + t.v + "' kann hier nicht stehen", t);
    case "eof": throw cerr("Unerwartetes Dateiende – der Ausdruck ist unvollständig", t);
  }
  throw cerr("Ausdruck erwartet, gefunden: '" + this.tokText(t) + "'", t);
};

// ---------- Initialisierung ----------
// Ergebnis: Liste {off, ty, x} plus ggf. abgeleitete Arraygröße
PP.initializer = function (ty, at, isStatic) {
  var self = this, items = [];
  function scalarInit(t, off, n) {
    var v = self.rv(n);
    v = self.assignConv(v, unqual(t), "Initialisierung", n);
    if (isStatic && !self.isConstInit(v)) self.error("Globale und static-Variablen brauchen einen konstanten Anfangswert", n);
    items.push({ off: off, ty: unqual(t), x: v });
  }
  function strInit(t, off, s) {
    var n = s.bytes.length;
    if (t.len != null && n > t.len) {
      self.warn("Der Text \"" + String.fromCharCode.apply(null, s.bytes.slice(0, 30)) + "\" (" + n + " Zeichen) ist zu lang für " + typeStr(t), s,
        "Ein char-Array braucht Platz für alle Zeichen plus '\\0' am Ende.");
    }
    var len = t.len != null ? t.len : n + 1;
    for (var k = 0; k < Math.min(len, n + 1); k++) items.push({ off: off + k, ty: TY.char, x: N("num", s, { v: k < n ? (s.bytes[k] << 24) >> 24 : 0, ty: TY.char }) });
    if (t.len != null && n === t.len) {
      self.warn("Für das Abschlusszeichen '\\0' ist kein Platz mehr in " + typeStr(t), s, "Das Array um 1 größer machen.");
    }
    return len;
  }
  // rekursive Verarbeitung mit "Brace elision"
  function fill(t, off, list, pos, braced) {
    // list: Array der Elemente auf der aktuellen Ebene; pos: {i}
    if (t.k === "arr") {
      var count = 0;
      var maxN = t.len;
      while (pos.i < list.length && (maxN == null || count < maxN)) {
        var el = list[pos.i];
        if (el.k === "desig") break;
        if (el.k === "ilist") { pos.i++; fillBraced(t.of, off + count * t.of.size, el); }
        else if (t.of.k === "arr" && t.of.of.isChar && el.k === "str") { pos.i++; strInit(t.of, off + count * t.of.size, el); }
        else if (t.of.k === "arr" || t.of.k === "struct") fill(t.of, off + count * t.of.size, list, pos, false);
        else { pos.i++; scalarInit(t.of, off + count * t.of.size, el); }
        count++;
        if (!braced && maxN != null && count >= maxN) break;
      }
      return count;
    }
    if (t.k === "struct") {
      var fields = t.def.union ? t.def.fields.slice(0, 1) : t.def.fields, fi = 0;
      while (pos.i < list.length && fi < fields.length) {
        var el2 = list[pos.i];
        if (el2.k === "desig") {
          if (!braced) break;
          var idx = -1;
          t.def.fields.forEach(function (f, k) { if (f.name === el2.name) idx = k; });
          if (idx < 0) { self.error(typeStr(t) + " hat keine Komponente '" + el2.name + "'", el2); pos.i++; continue; }
          fi = idx; list[pos.i] = el2.x; continue;
        }
        var f = fields[fi];
        if (el2.k === "ilist") { pos.i++; fillBraced(f.type, off + f.offset, el2); }
        else if (f.type.k === "arr" && f.type.of.isChar && el2.k === "str") { pos.i++; strInit(f.type, off + f.offset, el2); }
        else if (f.type.k === "arr" || (f.type.k === "struct" && !(el2.ty && el2.ty.k === "struct"))) fill(f.type, off + f.offset, list, pos, false);
        else { pos.i++; scalarInit(f.type, off + f.offset, el2); }
        fi++;
      }
      return fi;
    }
    if (pos.i < list.length) { var el3 = list[pos.i++]; if (el3.k === "ilist") fillBraced(t, off, el3); else scalarInit(t, off, el3); }
    return 1;
  }
  function fillBraced(t, off, il) {
    if (t.k === "arr" && t.of.isChar && il.items.length === 1 && il.items[0].k === "str") return strInit(t, off, il.items[0]);
    if (t.k !== "arr" && t.k !== "struct") {
      if (il.items.length === 0) { self.error("Leere geschweifte Klammern für " + typeStr(t), il); return 0; }
      if (il.items.length > 1) self.warn("Zu viele Werte für " + typeStr(t), il.items[1]);
      fill(t, off, il.items, { i: 0 }, true);
      return 1;
    }
    var pos = { i: 0 };
    var n = fill(t, off, il.items, pos, true);
    if (pos.i < il.items.length) {
      self.warn("Zu viele Werte in der Initialisierung von " + typeStr(t) + (t.k === "arr" && t.len != null ? " (Platz für " + t.len + ")" : ""), il.items[pos.i]);
    }
    return n;
  }
  var raw = this.parseInit();
  var len = null;
  if (raw.k === "ilist") {
    if (ty.k !== "arr" && ty.k !== "struct" && raw.items.length === 1) {
      fill(ty, 0, raw.items, { i: 0 }, true);
    } else len = fillBraced(ty, 0, raw);
  } else if (ty.k === "arr") {
    if (ty.of.isChar && raw.k === "str") len = strInit(ty, 0, raw);
    else {
      this.error("Ein Array wird mit geschweiften Klammern initialisiert, z. B. {1, 2, 3}", raw,
        ty.of.isChar ? "Für Text: char name[] = \"Text\";" : null);
    }
  } else if (ty.k === "struct") {
    var v = this.rv(raw);
    v = this.assignConv(v, ty, "Initialisierung", raw);
    items.push({ off: 0, ty: ty, x: v });
  } else scalarInit(ty, 0, raw);
  var pure = items.every(function (it) { return it.x.pure; });
  return { items: items, len: len, pure: pure };
};
PP.parseInit = function () {
  if (this.is("{")) {
    var open = this.next(), items = [];
    while (!this.is("}")) {
      if (this.is(".") && this.peek(1).t === "id") {
        var dot = this.next(), nm = this.next();
        this.expect("=");
        items.push(N("desig", dot, { name: nm.v, x: this.parseInit() }));
      } else if (this.is("[")) {
        throw cerr("Array-Designatoren [i] = … werden nicht unterstützt", this.peek());
      } else items.push(this.parseInit());
      if (!this.accept(",")) break;
    }
    this.expect("}", "am Ende der Initialisierung");
    return N("ilist", open, { items: items });
  }
  return this.assignExpr();
};
PP.isConstInit = function (n) {
  if (this.constVal(n) !== null) return true;
  var x = n;
  while (x.k === "conv") x = x.x;
  if (x.k === "num") return true;
  if (x.k === "un" && x.x && (x.x.k === "num" || (x.x.k === "conv" && x.x.x.k === "num"))) return true;
  if (x.k === "bin" && this.isConstInit(x.l) && this.isConstInit(x.r)) return true;
  if (x.k === "decay" && (x.x.k === "str" || (x.x.k === "id" && x.x.sym.storage === "global"))) return true;
  if (x.k === "addr" && x.x.k === "id" && x.x.sym.storage === "global") return true;
  return false;
};

// ---------- Deklarationen ----------
PP.declaration = function (ds, isGlobal) {
  var decls = [], self = this;
  if (this.is(";")) {
    this.next();
    if (ds.type.k !== "struct" && ds.type.k !== "int") this.warn("Deklaration ohne Namen", ds.at);
    return N("decl", ds.at, { decls: decls });
  }
  do {
    var d = this.declarator(false);
    if (!d.name) throw cerr("Name in der Deklaration erwartet, gefunden: '" + this.tokText(this.peek()) + "'", this.peek(),
      this.peek().t === "num" ? "Ein Bezeichner darf nicht mit einer Ziffer beginnen." : null);
    var ty = d.apply(ds.type), nameTok = d.nameTok;
    if (ds.storage === "typedef") {
      var tdt = Object.assign({}, ty);
      if (ty.k === "struct" && !ty.def.dispName && !ty.def.tag) ty.def.dispName = d.name;
      if (ty.k !== "struct") tdt.tdname = d.name;
      this.declare(d.name, { kind: "typedef", type: tdt, name: d.name }, nameTok);
      continue;
    }
    if (ty.k === "func") {
      if (!isGlobal && ds.storage === "static") this.error("Lokale Funktionsdeklaration mit static", nameTok);
      this.declareFunc(d.name, ty, nameTok, d.params, false);
      if (this.is("{")) throw cerr("Funktionen können nicht innerhalb anderer Funktionen definiert werden", this.peek(),
        "Schreibe die Funktion außerhalb von main, z. B. davor oder dahinter (mit Prototyp).");
      continue;
    }
    if (ty.k === "void") { this.error("Variable '" + d.name + "' kann nicht vom Typ void sein", nameTok); ty = TY.int; }
    if (ty.k === "struct" && !ty.def.complete) { this.error("Variable '" + d.name + "' hat den unvollständigen Typ " + typeStr(ty), nameTok); ty = TY.int; }
    var isStatic = isGlobal || ds.storage === "static";
    var ext = ds.storage === "extern";
    var sym = { kind: "var", name: d.name, type: ty, storage: isStatic ? "global" : "local", ext: ext };
    var init = null;
    if (this.accept("=")) {
      if (ext) this.error("extern-Variable mit Anfangswert", nameTok);
      init = this.initializer(ty, nameTok, isStatic);
      if (ty.k === "arr" && ty.len == null) {
        ty = arrOf(ty.of, init.len || 0);
        if (!init.len) this.error("Array '" + d.name + "' hat die Größe 0", nameTok);
        sym.type = ty;
      }
    } else if (ty.k === "arr" && ty.len == null && !ext) {
      this.error("Größe des Arrays '" + d.name + "' fehlt", nameTok, "Entweder eine Größe angeben (int werte[10];) oder Werte (int werte[] = {1, 2, 3};).");
      ty = arrOf(ty.of, 1); sym.type = ty;
    }
    if (ty.cq && !init && !ext && ty.k !== "arr") this.warn("const-Variable '" + d.name + "' ohne Anfangswert", nameTok);
    var existing = this.scope.syms[d.name];
    var s = this.declare(d.name, sym, nameTok);
    if (s === sym || (existing && existing.ext && !s.addr)) {
      if (!ext || !isGlobal) {
        if (isStatic) s.addr = s.addr || this.allocGlobal(ty);
        else s.off = this.allocLocal(ty);
      } else if (!s.addr) s.addr = this.allocGlobal(ty);
    }
    if (isStatic) {
      if (init) this.globalInits.push({ sym: s, init: init });
    } else decls.push({ sym: s, init: init, at: nameTok });
  } while (this.accept(","));
  if (!this.is(";")) {
    var t = this.peek();
    if (t.t === "id" || t.t === "kw") {
      var pr = this.prev();
      throw cerr("';' oder ',' fehlt vor '" + this.tokText(t) + "'", { line: pr.eline, col: pr.ecol },
        "Mehrere Variablen in einer Zeile trennt man mit Komma: int a, b, c;");
    }
  }
  this.expect(";");
  return N("decl", ds.at, { decls: decls });
};

PP.declareFunc = function (name, ty, at, params, isDef) {
  var old = this.global.syms[name];
  if (old && old.kind !== "func") { this.error("'" + name + "' ist schon als Variable deklariert", at); return old; }
  if (old) {
    if (!sameType(old.type, ty)) {
      this.error("Widersprüchliche Typen für die Funktion '" + name + "'", at,
        "Prototyp (Zeile " + old.line + ") und Definition müssen genau gleich sein: gleicher Rückgabetyp, gleiche Parametertypen.");
    } else if (old.type.unspec && !ty.unspec) old.type = ty;
    return old;
  }
  if (LIB[name] && NAME_HEADER[name] && this.headers[NAME_HEADER[name]]) {
    this.error("'" + name + "' ist schon eine Bibliotheksfunktion aus " + NAME_HEADER[name], at, "Wähle einen anderen Namen.");
  }
  var s = { kind: "func", name: name, type: ty, defined: false, line: at.line, col: at.col };
  this.global.syms[name] = s;
  if (this.scope !== this.global) this.scope.syms[name] = s;
  return s;
};

PP.funcDef = function (ds, d, ty) {
  var name = d.name, at = d.nameTok;
  if (ds.storage === "typedef") throw cerr("typedef mit Funktionsrumpf", at);
  var sym = this.declareFunc(name, ty, at, d.params, true);
  if (sym.defined) this.error("Die Funktion '" + name + "' ist doppelt definiert (zuerst in Zeile " + sym.defLine + ")", at);
  sym.defined = true; sym.defLine = at.line;
  if (name === "main") {
    if (ty.ret.k !== "int" || ty.ret.size !== 4) this.warn("main sollte int zurückgeben: int main(void)", at);
  }
  var fn = { name: name, sym: sym, frameSize: GAP, params: [], ret: ty.ret, slots: [] };
  this.fn = fn;
  var outer = this.scope;
  this.scope = new Scope(this.global, "func");
  var self = this;
  (d.params || []).forEach(function (p, k) {
    if (!p.name) { self.error((k + 1) + ". Parameter von '" + name + "' hat keinen Namen", p.tok); return; }
    var ps = { kind: "var", name: p.name, type: p.type, storage: "local", isParam: true };
    self.declare(p.name, ps, p.tok);
    ps.off = self.allocLocal(p.type);
    fn.params.push(ps);
  });
  if (!d.params && ty.unspec) fn.params = [];
  var body = this.block(true);
  this.scope = outer;
  this.fn = null;
  fn.body = body;
  sym.fn = fn;
  if (ty.ret.k !== "void" && name !== "main" && !returns(body)) {
    this.warn("Die Funktion '" + name + "' gibt nicht in jedem Fall einen Wert zurück", { line: body.endLine, col: body.endCol },
      "Am Ende einer Funktion mit Rückgabetyp " + typeStr(ty.ret) + " fehlt ein return.");
  }
  return fn;
};
function returns(s) {
  if (!s) return false;
  switch (s.k) {
    case "return": return true;
    case "block": return s.items.length > 0 && s.items.some(function (x, i) { return i === s.items.length - 1 && returns(x); });
    case "if": return !!s.f && returns(s.t) && returns(s.f);
    case "while": case "for": return (!s.c || (s.c.k === "num" && Number(s.c.v) !== 0) || (s.c.k === "conv" && s.c.x.k === "num" && Number(s.c.x.v) !== 0)) && !hasBreak(s.body);
    case "do": return returns(s.body) || ((s.c.k === "num" && Number(s.c.v) !== 0) && !hasBreak(s.body));
    case "call": return false;
    case "expr": return s.x.k === "call" && s.x.lib && (s.x.lib.name === "exit");
    case "switch": return false;
  }
  return false;
}
function hasBreak(s) {
  if (!s) return false;
  if (s.k === "break") return true;
  if (s.k === "while" || s.k === "for" || s.k === "do" || s.k === "switch") return false;
  if (s.k === "block") return s.items.some(hasBreak);
  if (s.k === "if") return hasBreak(s.t) || hasBreak(s.f);
  return false;
}

// ---------- Anweisungen ----------
PP.block = function (isFuncBody) {
  var open = this.expect("{");
  var outer = this.scope;
  if (!isFuncBody) this.scope = new Scope(outer, "block");
  var node = N("block", open, { items: [] });
  this.blocks.push({ open: open, node: node });
  while (!this.is("}")) {
    if (this.peek().t === "eof") this.expect("}");
    var s = this.statement(true);
    if (s) node.items.push(s);
  }
  var close = this.next();
  node.endLine = close.line; node.endCol = close.col;
  this.blocks.pop();
  if (!isFuncBody) {
    var sc = this.scope;
    this.outOfScope = this.outOfScope || {};
    Object.keys(sc.syms).forEach(function (k) { this.outOfScope[k] = true; }, this);
  }
  this.scope = outer;
  return node;
};

PP.statement = function (inBlock) {
  var t = this.peek();
  if (t.t === "kw") {
    switch (t.v) {
      case "if": {
        this.next(); this.expect("(", "nach if");
        var c = this.expr(); var cp = this.expect(")");
        var cc = this.cond(c, "von if");
        this.emptyBody("if", cp);
        var th = this.subStatement(), el = null;
        if (this.is("else")) {
          var et = this.next();
          if (this.is(";") && this.peek().line === et.line) this.warn("Leere Anweisung nach else", this.peek());
          el = this.subStatement();
        }
        return N("if", t, { c: cc, t: th, f: el });
      }
      case "while": {
        this.next(); this.expect("(", "nach while");
        var c2 = this.expr(); var cp2 = this.expect(")");
        var cc2 = this.cond(c2, "von while");
        this.emptyBody("while", cp2);
        this.loopDepth++;
        var body = this.subStatement();
        this.loopDepth--;
        return N("while", t, { c: cc2, body: body });
      }
      case "do": {
        this.next();
        this.loopDepth++;
        var body2 = this.subStatement();
        this.loopDepth--;
        if (!this.is("while")) throw cerr("Nach dem do-Block wird 'while (Bedingung);' erwartet", this.peek());
        this.next(); this.expect("(", "nach while");
        var c3 = this.expr(); this.expect(")");
        if (!this.is(";")) {
          var pr = this.prev();
          throw cerr("Nach } while (…) fehlt das Semikolon", { line: pr.eline, col: pr.ecol }, "Bei do-while steht am Ende ein ; – z. B. } while (x < 0);");
        }
        this.next();
        return N("do", t, { body: body2, c: this.cond(c3, "von do-while") });
      }
      case "for": {
        this.next(); this.expect("(", "nach for");
        var outer = this.scope;
        this.scope = new Scope(outer, "block");
        var init = null;
        if (this.is(";")) this.next();
        else if (this.startsType()) {
          var ds = this.declSpecs();
          init = this.declaration(ds, false);
        } else { var ie = this.expr(); init = N("expr", ie, { x: this.rv(ie) }); this.expect(";"); }
        var c4 = null;
        if (!this.is(";")) { var ce = this.expr(); c4 = this.cond(ce, "von for"); }
        if (this.is(",")) throw cerr("In for (…) werden die drei Teile mit ; getrennt, nicht mit Komma", this.peek());
        this.expect(";");
        var step = null;
        if (!this.is(")")) { var se = this.expr(); step = this.rv(se); }
        var cp4 = this.expect(")");
        this.emptyBody("for", cp4);
        this.loopDepth++;
        var body3 = this.subStatement();
        this.loopDepth--;
        var sc = this.scope;
        this.outOfScope = this.outOfScope || {};
        Object.keys(sc.syms).forEach(function (k) { this.outOfScope[k] = true; }, this);
        this.scope = outer;
        return N("for", t, { init: init, c: c4, step: step, body: body3 });
      }
      case "switch": {
        this.next(); this.expect("(", "nach switch");
        var x = this.expr(); this.expect(")");
        var xv = this.rv(x);
        if (xv.ty.k !== "err" && !isInt(xv.ty)) {
          this.error("switch braucht einen ganzzahligen Wert (int oder char), nicht " + typeStr(xv.ty), x,
            isFloat(xv.ty) ? "Für Bereiche oder Kommazahlen eine else-if-Kette verwenden." : null);
        }
        var pt = xv.ty.k === "int" ? promote(xv.ty) : TY.int;
        var sw = { cases: [], def: null, ty: pt, block: null, values: Object.create(null) };
        this.switches.push(sw);
        if (!this.is("{")) throw cerr("Nach switch (…) wird ein Block { … } erwartet", this.peek());
        var save = this.loopDepth;
        sw.depth = this.blocks.length + 1;
        var b = this.block(false);
        this.switches.pop();
        this.loopDepth = save;
        return N("switch", t, { x: this.conv(xv, pt), body: b, cases: sw.cases, def: sw.def, ty: pt });
      }
      case "case": case "default": {
        this.next();
        var sw2 = this.switches[this.switches.length - 1];
        var val = null;
        if (t.v === "case") {
          var ve = this.condExpr();
          if (sw2) {
            val = this.constVal(ve);
            if (val === null) this.error("Hinter case muss eine ganzzahlige Konstante stehen", ve,
              "Erlaubt sind z. B. case 5: oder case 'A':. Variablen, Kommazahlen und Texte gehen nicht.");
          }
        }
        if (!this.is(":")) {
          var pr2 = this.prev();
          throw cerr("':' fehlt nach " + (t.v === "case" ? "case " + this.text(ve) : "default"), { line: pr2.eline, col: pr2.ecol });
        }
        this.next();
        if (!sw2) { this.error(t.v + " steht außerhalb von switch", t); return null; }
        if (this.blocks.length !== sw2.depth) { this.error(t.v + " muss direkt im Block von switch stehen", t); return null; }
        var node = N("label", t, { isDefault: t.v === "default", v: val });
        if (t.v === "default") {
          if (sw2.def) this.error("default kommt doppelt vor", t);
          sw2.def = node;
        } else if (val !== null) {
          var key = String(convConst(val, sw2.ty));
          if (sw2.values[key]) this.error("case " + key + " kommt doppelt vor", t);
          sw2.values[key] = true;
          node.v = convConst(val, sw2.ty);
          sw2.cases.push(node);
        }
        return node;
      }
      case "break": {
        this.next(); this.expect(";");
        if (!this.loopDepth && !this.switches.length) this.error("break steht außerhalb einer Schleife oder eines switch", t);
        return N("break", t);
      }
      case "continue": {
        this.next(); this.expect(";");
        if (!this.loopDepth) this.error("continue steht außerhalb einer Schleife", t);
        return N("continue", t);
      }
      case "return": {
        this.next();
        var rx = null;
        if (!this.is(";")) {
          var re = this.expr();
          var rt = this.fn.ret;
          if (rt.k === "void") {
            var rv = this.rv(re);
            if (rv.ty.k !== "void") this.error("return mit Wert in einer void-Funktion", t, "Eine void-Funktion gibt nichts zurück. Entweder return; oder den Rückgabetyp ändern.");
          } else rx = this.assignConv(this.rv(re), unqual(rt), "return", re);
        } else if (this.fn.ret.k !== "void" && this.fn.name !== "main") {
          this.warn("return ohne Wert in einer Funktion, die " + typeStr(this.fn.ret) + " zurückgibt", t);
        }
        this.expect(";");
        return N("return", t, { x: rx });
      }
      case "goto": throw cerr("goto wird hier nicht unterstützt", t, "Verwende Schleifen und break.");
      case "else": throw cerr("else ohne passendes if", t, "Steht direkt hinter if (…) ein Semikolon oder fehlt eine geschweifte Klammer?");
    }
  }
  if (t.t === "op" && t.v === "{") return this.block(false);
  if (t.t === "op" && t.v === ";") { this.next(); return N("empty", t); }
  if (this.startsType()) {
    if (!inBlock) {
      // C erlaubt keine Deklaration als alleinige Anweisung nach if/while – wir lassen es mit Block zu
    }
    var ds2 = this.declSpecs();
    var d = this.declaration(ds2, false);
    return d;
  }
  if (t.t === "id" && this.peek(1).t === "op" && this.peek(1).v === ":" ) {
    throw cerr("Sprungmarken (Labels) werden nicht unterstützt", t);
  }
  if (t.t === "id" && this.peek(1).t === "id" && !this.lookup(t)) {
    // Zwei Namen hintereinander: vermutlich unbekannter Typ
    var sug = similar(t.v, ["int", "double", "char", "float", "long", "short", "void", "bool"]);
    throw cerr("Unbekannter Datentyp '" + t.v + "'", t,
      sug ? "Meintest du '" + sug + "'?" : (t.v === "string" || t.v === "String" ? "C hat keinen Datentyp string. Texte speichert man in char-Arrays, z. B. char name[30];" :
        NAME_HEADER[t.v] ? "#include <" + NAME_HEADER[t.v] + "> fehlt." : null));
  }
  var e = this.expr();
  if (!this.is(";")) {
    var nt = this.peek(), pr3 = this.prev();
    var hint = "Jede Anweisung endet mit einem Semikolon. Der Fehler steht oft am Ende der Zeile davor.";
    if (nt.t === "op" && nt.v === "{" && e.k === "call") hint = "Eine Funktion wird außerhalb von main definiert – oder fehlt hier ein Semikolon?";
    throw cerr(nt.t === "eof" ? "';' fehlt am Ende" : "';' fehlt vor '" + this.tokText(nt) + "'", { line: pr3.eline, col: pr3.ecol }, hint);
  }
  this.next();
  if (e.k === "bin" && ["==", "!=", "<", ">", "<=", ">="].indexOf(e.op) >= 0) {
    this.warn("Anweisung ohne Wirkung: Das Ergebnis des Vergleichs wird nicht verwendet", e,
      e.op === "==" ? "Für eine Zuweisung schreibt man =, nicht ==." : null);
  } else if (e.k === "bin" || e.k === "num" || (e.k === "id" && e.sym && e.sym.kind === "var")) {
    this.warn("Anweisung ohne Wirkung", e);
  } else if (e.k === "id" && e.sym && (e.sym.kind === "func" || e.sym.kind === "lib")) {
    this.warn("Funktion '" + e.sym.name + "' wird nicht aufgerufen", e, "Für den Aufruf braucht man Klammern: " + e.sym.name + "();");
  }
  return N("expr", e, { x: e.ty.k === "err" ? e : (e.ty.k === "arr" || e.ty.k === "func" ? e : this.rv(e)) });
};
PP.subStatement = function () {
  var t = this.peek();
  if (this.startsType() && !(t.t === "id")) {
    var ds = this.declSpecs();
    this.error("Eine Deklaration kann hier nicht allein stehen – setze geschweifte Klammern { } darum", ds.at);
    return this.declaration(ds, false);
  }
  return this.statement(false);
};
PP.emptyBody = function (what, closeParen) {
  var t = this.peek();
  if (t.t === "op" && t.v === ";" && t.line === closeParen.line) {
    var nt = this.peek(1);
    var msg = what === "if" ? "Semikolon direkt nach if (…): Die Verzweigung endet hier" : "Semikolon direkt nach " + what + " (…): Die Schleife hat keinen Rumpf";
    var hint = what === "if" ? "Der Block darunter wird dann immer ausgeführt. Nach if (…) steht kein Semikolon." :
      "Der Block darunter gehört nicht zur Schleife – das führt oft zu einer Endlosschleife.";
    if (nt && nt.t === "op" && nt.v === "{" || what === "if") this.warn(msg, t, hint);
  }
};

// ---------- Übersetzungseinheit ----------
PP.unit = function () {
  // Vorab: Funktionsdefinitionen finden (für Hinweis "Prototyp fehlt")
  this.laterFunctions = Object.create(null);
  var depth = 0;
  for (var i = 0; i < this.toks.length; i++) {
    var t = this.toks[i];
    if (t.t === "op" && t.v === "{") depth++;
    else if (t.t === "op" && t.v === "}") depth--;
    else if (depth === 0 && t.t === "id" && this.toks[i + 1] && this.toks[i + 1].v === "(") {
      // Funktionskopf auf oberster Ebene, gefolgt von {
      var d2 = 0, j = i + 1;
      for (; j < this.toks.length; j++) {
        if (this.toks[j].v === "(") d2++;
        else if (this.toks[j].v === ")") { d2--; if (d2 === 0) break; }
      }
      if (this.toks[j + 1] && this.toks[j + 1].v === "{" && !this.laterFunctions[t.v]) {
        var k0 = i; while (k0 > 0 && this.toks[k0 - 1].line === t.line && this.toks[k0 - 1].v !== ";" && this.toks[k0 - 1].v !== "}") k0--;
        this.laterFunctions[t.v] = { line: t.line, proto: this.src.slice(this.toks[k0].s, this.toks[j].e).replace(/\s+/g, " ") };
      }
    }
  }
  var fns = [];
  while (this.peek().t !== "eof") {
    var t0 = this.peek();
    if (t0.t === "op" && t0.v === ";") { this.next(); continue; }
    if (t0.t === "op" && t0.v === "}") throw cerr("Überzählige schließende Klammer '}'", t0, "Zu jeder { gehört genau eine }.");
    var ds = this.declSpecs();
    if (!ds) {
      if (t0.t === "id" && this.peek(1).v === "(") {
        throw cerr("Rückgabetyp fehlt vor '" + t0.v + "'", t0, "Eine Funktion beginnt mit ihrem Rückgabetyp, z. B. int " + t0.v + "(…) oder void " + t0.v + "(…).");
      }
      if (t0.t === "id" && this.peek(1).t === "id") {
        var sug = similar(t0.v, ["int", "double", "char", "float", "long", "short", "void"]);
        throw cerr("Unbekannter Datentyp '" + t0.v + "'", t0, sug ? "Meintest du '" + sug + "'?" :
          (t0.v === "string" || t0.v === "String" ? "C hat keinen Datentyp string. Texte speichert man in char-Arrays, z. B. char name[30];" :
            NAME_HEADER[t0.v] ? "#include <" + NAME_HEADER[t0.v] + "> fehlt." : null));
      }
      if (t0.t === "op" && t0.v === "{") throw cerr("Block ohne Funktionskopf", t0,
        this.prev() && this.prev().v === ";" ? "Steht hinter dem Funktionskopf ein Semikolon? Bei einer Definition gehört dort keins hin: int main(void) {" : null);
      throw cerr("Unerwartet: '" + this.tokText(t0) + "' – hier wird eine Deklaration oder Funktion erwartet", t0,
        t0.t === "id" || t0.t === "kw" ? "Anweisungen stehen nur innerhalb von Funktionen, z. B. in main." : null);
    }
    if (this.is(";")) { this.next(); continue; }
    var save = this.p;
    var d = this.declarator(false);
    var ty = d.name ? d.apply(ds.type) : null;
    if (ty && ty.k === "func" && this.is("{")) {
      fns.push(this.funcDef(ds, d, ty));
      continue;
    }
    if (ty && ty.k === "func" && this.is(";") && this.peek(1).t === "op" && this.peek(1).v === "{") {
      throw cerr("Nach dem Funktionskopf von '" + d.name + "' steht ein Semikolon", this.peek(),
        "Bei einer Funktionsdefinition steht hinter der Klammer kein Semikolon: " + typeStr(ty.ret) + " " + d.name + "(…) {");
    }
    this.p = save;
    this.declaration(ds, true);
  }
  // Prüfen: main vorhanden, alle aufgerufenen Funktionen definiert
  var main = this.global.syms.main;
  if (!main || main.kind !== "func" || !main.defined) {
    var cand = Object.keys(this.global.syms).filter(function (k) { return this.global.syms[k].kind === "func"; }, this);
    var sug2 = similar("main", cand);
    throw cerr("Das Programm hat keine Funktion main", { line: 1, col: 1 },
      sug2 ? "Gibt es einen Tippfehler? Gefunden wurde '" + sug2 + "'. Jedes C-Programm startet mit int main(void)." : "Jedes C-Programm braucht int main(void) { … } als Startpunkt.");
  }
  this.called.forEach(function (c) {
    if (!c.sym.defined) {
      throw cerr("Die Funktion '" + c.sym.name + "' wird aufgerufen, ist aber nirgends definiert", c.at,
        "Es gibt nur einen Prototyp (Zeile " + c.sym.line + "). Der Linker findet die Funktion nicht – stimmt der Name in der Definition?");
    }
  });
  return { fns: fns, main: main };
};
/* =====================================================================
   Teil 4: Laufzeit – Speicher, Ausführung mit Pausen für Eingaben
   ===================================================================== */

var BRK = { brk: 1 }, CNT = { cnt: 1 }, TICK = { tick: 1 }, NEEDIN = { needin: 1 };
function Ret(v) { this.v = v; }
var STDIN_ID = 0x10, STDOUT_ID = 0x20, STDERR_ID = 0x30;

function Machine(prog, host) {
  this.prog = prog; this.host = host || {};
  this.buf = new ArrayBuffer(MEM_SIZE);
  this.dv = new DataView(this.buf);
  this.u8 = new Uint8Array(this.buf);
  this.valid = new Uint8Array(MEM_SIZE);
  this.init = new Uint8Array(MEM_SIZE);
  this.fp = 0; this.sp = STACK_BASE; this.depth = 0;
  this.heapTop = HEAP_BASE; this.heap = new Map();
  this.tempTop = TEMP_BASE;
  this.out = ""; this.outTotal = 0;
  this.inBuf = []; this.inPos = 0; this.inEof = false;
  this.warned = Object.create(null); this.warnCount = 0;
  this.casg = [];
  this.garbage = 0x9e3779b9;
  this.steps = 0; this.tk = 0;
  this.strtokPos = 0;
  var r = new GlibcRand(); this.rand = r;
}
var MP = Machine.prototype;

// ---------- Speicher ----------
MP.markValid = function (a, n) { this.valid.fill(1, a, a + n); };
MP.fillGarbage = function (a, n) {
  var x = this.garbage, u8 = this.u8;
  for (var i = 0; i < n; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    u8[a + i] = (i & 3) === 3 ? (x & 0x7f) : x & 255;
  }
  this.garbage = x;
};
MP.badAddr = function (a, n, at, write) {
  if (a === 0) return rterr("Zugriff über einen NULL-Zeiger", at, "Der Zeiger zeigt auf nichts (NULL). Wurde er initialisiert?");
  if (a === STDIN_ID || a === STDOUT_ID || a === STDERR_ID) return rterr("Ungültiger Zugriff auf stdin/stdout", at);
  if (a < LIT_BASE || a >= MEM_SIZE) return rterr("Ungültige Speicheradresse (Programmabsturz)", at,
    "Typische Ursachen: ein Zeiger ohne Wert, ein vergessenes & bei scanf oder ein Index weit außerhalb eines Arrays.");
  if (write && a < GLOBAL_BASE) return rterr("Ein Text in Anführungszeichen (String-Literal) darf nicht verändert werden", at,
    "Für veränderbaren Text ein Array verwenden: char text[] = \"…\";");
  if (a >= this.sp && a < MEM_SIZE && a >= STACK_BASE) return rterr("Zugriff auf eine Variable, die nicht mehr existiert", at,
    "Lokale Variablen einer Funktion verschwinden, wenn die Funktion endet. Gib keine Adressen lokaler Variablen zurück.");
  return rterr("Speicherzugriff außerhalb des erlaubten Bereichs", at,
    "Meist wird über das Ende eines Arrays oder einer Zeichenkette hinaus gelesen oder geschrieben.");
};
MP.chk = function (a, n, at, write) {
  if (a < GLOBAL_BASE) { if (a < LIT_BASE || write || a + n > LIT_BASE + this.prog.litSize) throw this.badAddr(a, n, at, write); return; }
  var v = this.valid;
  if (a + n > MEM_SIZE) throw this.badAddr(a, n, at, write);
  if (n <= 16) { if (!v[a] || !v[a + n - 1]) throw this.badAddr(v[a] ? a + n - 1 : a, n, at, write); return; }
  for (var i = 0; i < n; i++) if (!v[a + i]) throw this.badAddr(a + i, n, at, write);
};
MP.isInit = function (a, n) {
  var v = this.init;
  for (var i = 0; i < n; i++) if (!v[a + i]) return false;
  return true;
};
MP.ld = function (a, t, at) {
  var dv = this.dv;
  switch (t.k) {
    case "int":
      this.chk(a, t.size, at);
      switch (t.size) {
        case 1: return t.isBool ? (dv.getUint8(a) ? 1 : 0) : t.signed ? dv.getInt8(a) : dv.getUint8(a);
        case 2: return t.signed ? dv.getInt16(a, true) : dv.getUint16(a, true);
        case 4: return t.signed ? dv.getInt32(a, true) : dv.getUint32(a, true);
        default: return t.signed ? dv.getBigInt64(a, true) : dv.getBigUint64(a, true);
      }
    case "float":
      this.chk(a, t.size, at);
      return t.size === 4 ? dv.getFloat32(a, true) : dv.getFloat64(a, true);
    case "ptr":
      this.chk(a, 8, at);
      return dv.getUint32(a, true) + dv.getUint32(a + 4, true) * 4294967296;
    case "struct":
      this.chk(a, t.size, at);
      return a;
  }
  throw rterr("Wert vom Typ " + typeStr(t) + " kann nicht gelesen werden", at);
};
MP.st = function (a, t, v, at) {
  var dv = this.dv;
  switch (t.k) {
    case "int":
      this.chk(a, t.size, at, true);
      switch (t.size) {
        case 1: dv.setUint8(a, v & 255); break;
        case 2: dv.setUint16(a, v & 65535, true); break;
        case 4: dv.setUint32(a, v >>> 0, true); break;
        default: dv.setBigUint64(a, BigInt.asUintN(64, v), true);
      }
      this.init.fill(1, a, a + t.size);
      return;
    case "float":
      this.chk(a, t.size, at, true);
      if (t.size === 4) dv.setFloat32(a, v, true); else dv.setFloat64(a, v, true);
      this.init.fill(1, a, a + t.size);
      return;
    case "ptr":
      this.chk(a, 8, at, true);
      dv.setUint32(a, v >>> 0, true); dv.setUint32(a + 4, Math.floor(v / 4294967296) >>> 0, true);
      this.init.fill(1, a, a + 8);
      return;
    case "struct":
      this.chk(a, t.size, at, true); this.chk(v, t.size, at);
      if (a !== v) { this.u8.copyWithin(a, v, v + t.size); this.init.copyWithin(a, v, v + t.size); }
      return;
  }
  throw rterr("Wert vom Typ " + typeStr(t) + " kann nicht gespeichert werden", at);
};
MP.allocTemp = function (n) {
  var a = alignUp(this.tempTop, 16);
  if (a + n + GAP > STACK_BASE) a = TEMP_BASE;
  this.tempTop = a + n + GAP;
  this.valid.fill(1, a, a + n);
  return a;
};
MP.cstr = function (a, at, max) {
  // Zeichenkette ab Adresse a lesen (bis '\0')
  var bytes = [], u8 = this.u8, lim = max == null ? 1e7 : max;
  for (var i = 0; i < lim; i++) {
    if (a + i >= MEM_SIZE || (a + i >= GLOBAL_BASE ? !this.valid[a + i] : (a + i < LIT_BASE || a + i >= LIT_BASE + this.prog.litSize))) {
      if (a === 0) throw rterr("Zeichenkette ist NULL", at);
      if (i === 0) throw this.badAddr(a, 1, at);
      throw rterr("Zeichenkette ohne Abschlusszeichen '\\0'", at,
        "Das Array ist voll belegt und es fehlt das '\\0' am Ende – oder die Variable hat nie einen Text bekommen.");
    }
    var b = u8[a + i];
    if (b === 0) break;
    bytes.push(b);
  }
  return bytes;
};

// ---------- Warnungen zur Laufzeit ----------
MP.rtWarn = function (key, msg, at, hint) {
  if (this.warned[key] || this.warnCount > 30) return;
  this.warned[key] = true; this.warnCount++;
  if (this.host.onWarn) this.host.onWarn({ sev: "warning", msg: msg, line: at ? at.line : 0, col: at ? at.col : 0, hint: hint || null, runtime: true });
};
MP.uninit = function (n) {
  var txt = this.prog.src.slice(n.s, n.e);
  this.rtWarn("u" + n.line + ":" + n.col, (n.x && n.x.k === "id" ? "Die Variable '" + txt + "'" : "'" + txt + "'") + " wird gelesen, bevor sie einen Wert bekommen hat", n,
    "Ihr Inhalt ist zufällig („Speichermüll“). Am besten bei der Deklaration einen Anfangswert geben, z. B. int summe = 0;");
};

// ---------- Ausgabe ----------
MP.write = function (s, err) {
  if (err) { this.flush(); if (this.host.onOutput) this.host.onOutput(s, "err"); return; }
  this.out += s; this.outTotal += s.length;
  if (this.out.length > 4096) this.flush();
  if (this.outTotal > 2000000) throw rterr("Programm abgebrochen: sehr viel Ausgabe (Endlosschleife?)", this.curAt);
};
MP.flush = function () {
  if (this.out && this.host.onOutput) this.host.onOutput(this.out, "out");
  this.out = "";
};
MP.writeBytes = function (bytes, err) { this.write(decodeUtf8(bytes), err); };
function decodeUtf8(bytes) {
  try { return new TextDecoder("utf-8").decode(new Uint8Array(bytes)); }
  catch (e) { return String.fromCharCode.apply(null, bytes); }
}

// ---------- Eingabe ----------
MP.giveInput = function (text) { Array.prototype.push.apply(this.inBuf, utf8(text)); };
MP.peekIn = function* () {
  while (this.inPos >= this.inBuf.length) {
    if (this.inEof) return -1;
    this.flush();
    yield NEEDIN;
  }
  return this.inBuf[this.inPos];
};
MP.getIn = function* () {
  var c = yield* this.peekIn();
  if (c >= 0) this.inPos++;
  return c;
};

// ---------- Konvertierungen ----------
function truthy(v) { return typeof v === "bigint" ? v !== 0n : v !== 0; }
function makeConv(f, t) {
  if (t.k === "void") return function () { return undefined; };
  if (t.k === "int") {
    if (t.isBool) return function (v) { return truthy(v) ? 1 : 0; };
    var bits = t.size * 8, signed = t.signed;
    if (f.k === "float") {
      return function (v) {
        if (v !== v || v === Infinity || v === -Infinity) v = -9223372036854775808;
        v = Math.trunc(v);
        if (t.size === 8) {
          var b = BigInt(v);
          if (!signed && v < 0) return BigInt.asUintN(64, b);
          return signed ? BigInt.asIntN(64, b) : BigInt.asUintN(64, b);
        }
        if (signed && t.size === 4 && (v >= 2147483648 || v < -2147483648)) return -2147483648;
        if (v >= -9007199254740991 && v <= 9007199254740991) return wrapInt(Number(BigInt.asIntN(64, BigInt(v)) & 0xffffffffn), t);
        return wrapInt(0, t);
      };
    }
    if (f.k === "int" && f.size === 8) {
      if (t.size === 8) return signed ? function (v) { return BigInt.asIntN(64, v); } : function (v) { return BigInt.asUintN(64, v); };
      return function (v) { return wrapInt(Number(BigInt.asUintN(32, v)), t); };
    }
    // Quelle: Zahl (int <= 4 Byte oder Zeiger)
    if (t.size === 8) return signed ? function (v) { return BigInt(v); } : function (v) { return BigInt.asUintN(64, BigInt(v)); };
    if (t.size === 4) return signed ? function (v) { return v | 0; } : function (v) { return v >>> 0; };
    return function (v) { return wrapInt(v, t); };
  }
  if (t.k === "float") {
    var big = f.k === "int" && f.size === 8;
    if (t.size === 4) return big ? function (v) { return Math.fround(Number(v)); } : function (v) { return Math.fround(v); };
    return big ? function (v) { return Number(v); } : function (v) { return v; };
  }
  if (t.k === "ptr") {
    if (f.k === "int" && f.size === 8) return function (v) { return Number(BigInt.asUintN(32, v)); };
    if (f.k === "int") return function (v) { return v >>> 0; };
    return function (v) { return v; };
  }
  return function (v) { return v; };
}

// Binäre Operation für einen bestimmten Typ erzeugen
function makeBin(op, t, at) {
  if (t.k === "float") {
    var fr = t.size === 4 ? Math.fround : function (x) { return x; };
    switch (op) {
      case "+": return function (a, b) { return fr(a + b); };
      case "-": return function (a, b) { return fr(a - b); };
      case "*": return function (a, b) { return fr(a * b); };
      case "/": return function (a, b) { return fr(a / b); };
    }
  } else if (t.k === "int" && t.size === 8) {
    var W = t.signed ? function (x) { return BigInt.asIntN(64, x); } : function (x) { return BigInt.asUintN(64, x); };
    switch (op) {
      case "+": return function (a, b) { return W(a + b); };
      case "-": return function (a, b) { return W(a - b); };
      case "*": return function (a, b) { return W(a * b); };
      case "/": return function (a, b) { if (b === 0n) throw rterr("Division durch 0", at, "Vor dem Teilen prüfen, ob der Nenner 0 ist."); return W(a / b); };
      case "%": return function (a, b) { if (b === 0n) throw rterr("Modulo durch 0 (Rest bei Division durch 0)", at); return W(a % b); };
      case "<<": return function (a, b) { return W(a << BigInt(b & 63)); };
      case ">>": return function (a, b) { return W(a >> BigInt(b & 63)); };
      case "&": return function (a, b) { return W(a & b); };
      case "|": return function (a, b) { return W(a | b); };
      case "^": return function (a, b) { return W(a ^ b); };
    }
  } else {
    var s = t.signed;
    switch (op) {
      case "+": return s ? function (a, b) { return (a + b) | 0; } : function (a, b) { return (a + b) >>> 0; };
      case "-": return s ? function (a, b) { return (a - b) | 0; } : function (a, b) { return (a - b) >>> 0; };
      case "*": return s ? function (a, b) { return Math.imul(a, b); } : function (a, b) { return Math.imul(a, b) >>> 0; };
      case "/": return function (a, b) {
        if (b === 0) throw rterr("Division durch 0", at, "Vor dem Teilen prüfen, ob der Nenner 0 ist.");
        if (s && a === -2147483648 && b === -1) throw rterr("Überlauf bei der Division", at);
        return s ? (a / b) | 0 : Math.floor(a / b) >>> 0;
      };
      case "%": return function (a, b) {
        if (b === 0) throw rterr("Modulo durch 0 (Rest bei Division durch 0)", at);
        if (s && b === -1) return 0;
        return s ? (a % b) | 0 : (a % b) >>> 0;
      };
      case "<<": return s ? function (a, b) { return a << b; } : function (a, b) { return (a << b) >>> 0; };
      case ">>": return s ? function (a, b) { return a >> b; } : function (a, b) { return a >>> b; };
      case "&": return s ? function (a, b) { return a & b; } : function (a, b) { return (a & b) >>> 0; };
      case "|": return s ? function (a, b) { return a | b; } : function (a, b) { return (a | b) >>> 0; };
      case "^": return s ? function (a, b) { return a ^ b; } : function (a, b) { return (a ^ b) >>> 0; };
    }
  }
  switch (op) {
    case "<": return function (a, b) { return a < b ? 1 : 0; };
    case ">": return function (a, b) { return a > b ? 1 : 0; };
    case "<=": return function (a, b) { return a <= b ? 1 : 0; };
    case ">=": return function (a, b) { return a >= b ? 1 : 0; };
    case "==": return function (a, b) { return a == b ? 1 : 0; };
    case "!=": return function (a, b) { return a != b ? 1 : 0; };
  }
  throw rterr("Interner Fehler: Operator " + op, at);
}

function incVal(v, t, step, dir) {
  if (t.k === "ptr") return v + dir * step;
  if (t.k === "float") return t.size === 4 ? Math.fround(v + dir) : v + dir;
  if (t.size === 8) return t.signed ? BigInt.asIntN(64, v + BigInt(dir)) : BigInt.asUintN(64, v + BigInt(dir));
  return wrapInt(v + dir, t);
}

// ---------- Lesen/Schreiben je Typ ----------
function reader(t) {
  if (t.k === "int") {
    switch (t.size) {
      case 4: return t.signed ? function (dv, a) { return dv.getInt32(a, true); } : function (dv, a) { return dv.getUint32(a, true); };
      case 1: return t.isBool ? function (dv, a) { return dv.getUint8(a) ? 1 : 0; } : t.signed ? function (dv, a) { return dv.getInt8(a); } : function (dv, a) { return dv.getUint8(a); };
      case 2: return t.signed ? function (dv, a) { return dv.getInt16(a, true); } : function (dv, a) { return dv.getUint16(a, true); };
      default: return t.signed ? function (dv, a) { return dv.getBigInt64(a, true); } : function (dv, a) { return dv.getBigUint64(a, true); };
    }
  }
  if (t.k === "float") return t.size === 4 ? function (dv, a) { return dv.getFloat32(a, true); } : function (dv, a) { return dv.getFloat64(a, true); };
  if (t.k === "ptr") return function (dv, a) { return dv.getUint32(a, true) + dv.getUint32(a + 4, true) * 4294967296; };
  return null;
}
function writer(t) {
  // schreibt ohne Bereichsprüfung (nur für sichere Adressen benannter Variablen)
  if (t.k === "int") {
    switch (t.size) {
      case 4: return function (m, a, v) { m.dv.setUint32(a, v >>> 0, true); var I = m.init; I[a] = I[a + 1] = I[a + 2] = I[a + 3] = 1; };
      case 1: return function (m, a, v) { m.dv.setUint8(a, v & 255); m.init[a] = 1; };
      case 2: return function (m, a, v) { m.dv.setUint16(a, v & 65535, true); m.init[a] = m.init[a + 1] = 1; };
      default: return function (m, a, v) { m.dv.setBigUint64(a, BigInt.asUintN(64, v), true); m.init.fill(1, a, a + 8); };
    }
  }
  if (t.k === "float") return t.size === 4 ? function (m, a, v) { m.dv.setFloat32(a, v, true); m.init.fill(1, a, a + 4); } : function (m, a, v) { m.dv.setFloat64(a, v, true); m.init.fill(1, a, a + 8); };
  return function (m, a, v) { m.st(a, t, v, null); };
}

// ---------- Ausdrücke in Funktionen übersetzen (schnell, ohne Unterbrechung) ----------
function cA(n) {
  switch (n.k) {
    case "id": {
      var sym = n.sym;
      if (sym.storage === "global") { var ga = sym.addr; return function () { return ga; }; }
      var off = sym.off;
      return function (m) { return m.fp + off; };
    }
    case "str": { var sa = n.addr; return function () { return sa; }; }
    case "deref": {
      var P = cE(n.x);
      return function (m) { var p = P(m); if (p === 0) throw rterr("Zugriff über einen NULL-Zeiger", n, "Der Zeiger zeigt auf nichts (NULL)."); return p; };
    }
    case "idx": {
      var B = cE(n.a), I = cE(n.i);
      if (n.len != null && !n.inAddr && n.i.ty.k === "int" && n.i.ty.size <= 4) {
        var len = n.len, el = n.elem;
        return function (m) {
          var b = B(m), i = I(m);
          if (i < 0 || i >= len) return m.idxAddr(n, b, i);
          return b + i * el;
        };
      }
      return function (m) { return m.idxAddr(n, B(m), I(m)); };
    }
    case "mem": {
      var o = n.off;
      if (n.arrow) { var X = cE(n.x); return function (m) { return m.ptrCheck(X(m), n) + o; }; }
      if (n.rvbase) { var X2 = cE(n.x); return function (m) { return X2(m) + o; }; }
      var A = cA(n.x);
      return function (m) { return A(m) + o; };
    }
  }
  return cE(n);
}
function cE(n) {
  switch (n.k) {
    case "num": case "sizeof": { var v = n.v; return function () { return v; }; }
    case "libvar": { var id = n.id; return function () { return id; }; }
    case "load": {
      var t = n.ty;
      if (n.x.k === "id" && t.k !== "struct") {
        var sym = n.x.sym, rd = reader(t);
        if (sym.storage === "global") { var ga = sym.addr; return function (m) { if (!m.init[ga]) m.uninit(n); return rd(m.dv, ga); }; }
        var off = sym.off;
        return function (m) { var a = m.fp + off; if (!m.init[a]) m.uninit(n); return rd(m.dv, a); };
      }
      var A = cA(n.x);
      if (t.k === "struct") { var ss = t.size; return function (m) { var a = A(m); m.chk(a, ss, n); return a; }; }
      var rd2 = reader(t), size = t.size;
      if (!rd2) return function (m) { return m.ld(A(m), t, n); };
      return function (m) { var a = A(m); m.chk(a, size, n); if (!m.isInit(a, size)) m.uninit(n); return rd2(m.dv, a); };
    }
    case "decay": return cA(n.x);
    case "conv": { var X = cE(n.x), f = makeConv(n.from || n.x.ty, n.ty); return function (m) { return f(X(m)); }; }
    case "bin": {
      var L = cE(n.l), R = cE(n.r), op = n.op, ot = n.ptrcmp ? TY.ulong : n.opt;
      if (ot.k === "int" && ot.size === 4 && ot.signed) {
        switch (op) {
          case "+": return function (m) { return (L(m) + R(m)) | 0; };
          case "-": return function (m) { return (L(m) - R(m)) | 0; };
          case "*": return function (m) { return Math.imul(L(m), R(m)); };
          case "<": return function (m) { return L(m) < R(m) ? 1 : 0; };
          case ">": return function (m) { return L(m) > R(m) ? 1 : 0; };
          case "<=": return function (m) { return L(m) <= R(m) ? 1 : 0; };
          case ">=": return function (m) { return L(m) >= R(m) ? 1 : 0; };
          case "==": return function (m) { return L(m) === R(m) ? 1 : 0; };
          case "!=": return function (m) { return L(m) !== R(m) ? 1 : 0; };
        }
      }
      if (ot.k === "float" && ot.size === 8) {
        switch (op) {
          case "+": return function (m) { return L(m) + R(m); };
          case "-": return function (m) { return L(m) - R(m); };
          case "*": return function (m) { return L(m) * R(m); };
          case "/": return function (m) { return L(m) / R(m); };
        }
      }
      var bf = makeBin(op, ot, n);
      return function (m) { var l = L(m); return bf(l, R(m)); };
    }
    case "log": {
      var L2 = cE(n.l), R2 = cE(n.r);
      if (n.op === "&&") return function (m) { return truthy(L2(m)) && truthy(R2(m)) ? 1 : 0; };
      return function (m) { return truthy(L2(m)) || truthy(R2(m)) ? 1 : 0; };
    }
    case "not": { var X3 = cE(n.x); return function (m) { return truthy(X3(m)) ? 0 : 1; }; }
    case "un": { var X4 = cE(n.x); return function (m) { return m.unop(n, X4(m)); }; }
    case "cond": { var Cc = cE(n.c), Ca = cE(n.a), Cb = cE(n.b); return function (m) { return truthy(Cc(m)) ? Ca(m) : Cb(m); }; }
    case "comma": { var Cl = cE(n.l), Cr = cE(n.r); return function (m) { Cl(m); return Cr(m); }; }
    case "padd": case "psub": {
      var Pp = cE(n.p), Pi = cE(n.i), el = n.k === "padd" ? n.elem : -n.elem;
      return function (m) { var p = Pp(m), i = Pi(m); if (typeof i === "bigint") i = Number(BigInt.asIntN(53, i)); return p + i * el; };
    }
    case "pdiff": { var Dl = cE(n.l), Dr = cE(n.r), de = n.elem; return function (m) { var l = Dl(m); return BigInt(Math.trunc((l - Dr(m)) / de)); }; }
    case "asg": {
      var t2 = n.ty, Rv = cE(n.r);
      if (n.l.k === "id" && t2.k !== "struct") {
        var s2 = n.l.sym, W = writer(t2);
        if (s2.storage === "global") { var ga2 = s2.addr; return function (m) { var v = Rv(m); W(m, ga2, v); return v; }; }
        var off2 = s2.off;
        return function (m) { var a = m.fp + off2, v = Rv(m); W(m, a, v); return v; };
      }
      var Al = cA(n.l), isS = t2.k === "struct";
      return function (m) { var a = Al(m), v = Rv(m); m.st(a, t2, v, n); return isS ? a : v; };
    }
    case "casg": {
      var Ac = cA(n.l), Vc = cE(n.val), t3 = n.ty;
      return function (m) { var a = Ac(m); m.casg.push(a); var v = Vc(m); m.casg.pop(); m.st(a, t3, v, n); return v; };
    }
    case "casgval": {
      var t4 = n.ty, sz4 = t4.size;
      return function (m) { var a = m.casg[m.casg.length - 1]; var v = m.ld(a, t4, n); if (!m.isInit(a, sz4)) m.uninit(n); return v; };
    }
    case "pre": case "post": {
      var t5 = n.ty, step = n.step, dir = n.op === "++" ? 1 : -1, pre = n.k === "pre";
      if (n.x.k === "id" && t5.k === "int" && t5.size === 4 && t5.signed) {
        var s5 = n.x.sym, A5 = cA(n.x);
        return function (m) {
          var a = A5(m), old = m.dv.getInt32(a, true);
          if (!m.init[a]) m.uninit(n);
          var nv = (old + dir) | 0;
          m.dv.setInt32(a, nv, true); var I = m.init; I[a] = I[a + 1] = I[a + 2] = I[a + 3] = 1;
          return pre ? nv : old;
        };
      }
      var A6 = cA(n.x);
      return function (m) {
        var a = A6(m), old = m.ld(a, t5, n);
        if (!m.isInit(a, t5.size)) m.uninit(n);
        var nv = incVal(old, t5, step, dir);
        m.st(a, t5, nv, n);
        return pre ? nv : old;
      };
    }
    case "addr": return cA(n.x);
    case "id": case "deref": case "idx": case "mem": case "str": return cA(n);
    case "call": {
      var F = n.args.map(cE), k = F.length, fn = n.lib && n.lib.fn;
      if (!fn) return function () { throw rterr("Interner Fehler: Aufruf ohne Bibliothek", n); };
      return function (m) {
        var args = new Array(k);
        for (var q = k - 1; q >= 0; q--) args[q] = F[q](m);
        m.curAt = n;
        return fn(m, args, n);
      };
    }
    case "fdesig": return function () { throw rterr("Funktionszeiger werden nicht unterstützt", n); };
  }
  return function () { throw rterr("Interner Fehler: Ausdruck '" + n.k + "'", n); };
}
MP.evf = function (n) { return (n.F || (n.F = cE(n)))(this); };
MP.addrF = function (n) { return (n.A || (n.A = cA(n)))(this); };
MP.ptrCheck = function (p, n) {
  if (p === 0) throw rterr("Zugriff über einen NULL-Zeiger (->)", n);
  return p;
};
MP.idxAddr = function (n, base, i) {
  if (typeof i === "bigint") i = Number(BigInt.asIntN(53, i));
  if (n.len != null && !n.inAddr && (i < 0 || i >= n.len)) {
    throw rterr("Index " + i + " liegt außerhalb des Arrays " + n.name + " (gültig: 0 bis " + (n.len - 1) + ")", n,
      i === n.len ? "Ein Array mit " + n.len + " Elementen hat die Indizes 0 bis " + (n.len - 1) + ". In Schleifen i < " + n.len + " statt i <= " + n.len + " verwenden." :
        i < 0 ? "Negative Indizes gibt es nicht." : null);
  }
  if (base === 0) throw rterr("Zugriff über einen NULL-Zeiger", n);
  return base + i * n.elem;
};
MP.unop = function (n, v) {
  var t = n.ty;
  switch (n.op) {
    case "+": return v;
    case "-":
      if (t.k === "float") return -v;
      if (t.size === 8) return t.signed ? BigInt.asIntN(64, -v) : BigInt.asUintN(64, -v);
      return t.signed ? (-v) | 0 : (-v) >>> 0;
    case "~":
      if (t.size === 8) return t.signed ? BigInt.asIntN(64, ~v) : BigInt.asUintN(64, ~v);
      return t.signed ? ~v : (~v) >>> 0;
  }
};

// ---------- Ausdrücke (unterbrechbar: Funktionsaufrufe, Eingaben) ----------
MP.ev = function* (n) {
  if (n.pure) return this.evf(n);
  switch (n.k) {
    case "load": {
      var a = yield* this.addrG(n.x), t = n.ty;
      var v = this.ld(a, t, n);
      if (t.k !== "struct" && !this.isInit(a, t.size)) this.uninit(n);
      return v;
    }
    case "decay": return yield* this.addrG(n.x);
    case "conv": { var x = yield* this.ev(n.x); return (n.cf || (n.cf = makeConv(n.from || n.x.ty, n.ty)))(x); }
    case "bin": {
      var l = yield* this.ev(n.l), r = yield* this.ev(n.r);
      return (n.bf || (n.bf = makeBin(n.op, n.ptrcmp ? TY.ulong : n.opt, n)))(l, r);
    }
    case "log": {
      var lv = truthy(yield* this.ev(n.l));
      if (n.op === "&&") return lv && truthy(yield* this.ev(n.r)) ? 1 : 0;
      return lv || truthy(yield* this.ev(n.r)) ? 1 : 0;
    }
    case "not": return truthy(yield* this.ev(n.x)) ? 0 : 1;
    case "un": return this.unop(n, yield* this.ev(n.x));
    case "cond": return truthy(yield* this.ev(n.c)) ? yield* this.ev(n.a) : yield* this.ev(n.b);
    case "comma": yield* this.ev(n.l); return yield* this.ev(n.r);
    case "padd": case "psub": {
      var p = yield* this.ev(n.p), i = yield* this.ev(n.i);
      if (typeof i === "bigint") i = Number(BigInt.asIntN(53, i));
      return n.k === "padd" ? p + i * n.elem : p - i * n.elem;
    }
    case "pdiff": { var pl = yield* this.ev(n.l), pr = yield* this.ev(n.r); return BigInt(Math.trunc((pl - pr) / n.elem)); }
    case "asg": {
      var a2 = yield* this.addrG(n.l), v2 = yield* this.ev(n.r);
      this.st(a2, n.ty, v2, n);
      return n.ty.k === "struct" ? a2 : v2;
    }
    case "casg": {
      var a3 = yield* this.addrG(n.l);
      this.casg.push(a3);
      var v3;
      try { v3 = yield* this.ev(n.val); } finally { this.casg.pop(); }
      this.st(a3, n.ty, v3, n);
      return v3;
    }
    case "pre": case "post": {
      var a5 = yield* this.addrG(n.x), old = this.ld(a5, n.ty, n);
      var nv = incVal(old, n.ty, n.step, n.op === "++" ? 1 : -1);
      this.st(a5, n.ty, nv, n);
      return n.k === "pre" ? nv : old;
    }
    case "addr": return yield* this.addrG(n.x);
    case "id": case "deref": case "idx": case "mem": case "str": return yield* this.addrG(n);
    case "call": return yield* this.callG(n);
  }
  return this.evf(n);
};
MP.addrG = function* (n) {
  if (n.pure) return this.addrF(n);
  switch (n.k) {
    case "deref": {
      var p = yield* this.ev(n.x);
      if (p === 0) throw rterr("Zugriff über einen NULL-Zeiger", n);
      return p;
    }
    case "idx": {
      var base = yield* this.ev(n.a), i = yield* this.ev(n.i);
      return this.idxAddr(n, base, i);
    }
    case "mem": return (n.arrow ? this.ptrCheck(yield* this.ev(n.x), n) : (n.rvbase ? yield* this.ev(n.x) : yield* this.addrG(n.x))) + n.off;
  }
  return yield* this.ev(n);
};

// ---------- Funktionsaufrufe ----------
MP.callG = function* (n) {
  var args = new Array(n.args.length);
  for (var k = n.args.length - 1; k >= 0; k--) args[k] = n.args[k].pure ? this.evf(n.args[k]) : yield* this.ev(n.args[k]);
  this.curAt = n;
  if (n.lib) {
    if (n.lib.gen) return yield* n.lib.gen(this, args, n);
    return n.lib.fn(this, args, n);
  }
  return yield* this.callUser(n.fsym.fn, args, n);
};
MP.callUser = function* (fn, args, at) {
  if (!fn) throw rterr("Funktion ohne Definition", at);
  if (++this.depth > 20000) throw rterr("Zu viele verschachtelte Funktionsaufrufe (Rekursion ohne Ende?)", at,
    "Jede rekursive Funktion braucht eine Abbruchbedingung.");
  var base = alignUp(this.sp, 16);
  if (base + fn.frameSize >= MEM_SIZE) throw rterr("Stapelüberlauf: zu viele Funktionsaufrufe oder zu große lokale Arrays", at,
    "Endet die Rekursion? Sehr große Arrays global anlegen.");
  var savedFp = this.fp, savedSp = this.sp;
  this.fillGarbage(base, fn.frameSize);
  this.init.fill(0, base, base + fn.frameSize);
  var slots = fn.slots;
  for (var s = 0; s < slots.length; s++) this.valid.fill(1, base + slots[s].off, base + slots[s].off + slots[s].size);
  this.fp = base; this.sp = base + fn.frameSize;
  for (var k = 0; k < fn.params.length && k < args.length; k++) this.st(base + fn.params[k].off, fn.params[k].type, args[k], at);
  if ((++this.tk & 1023) === 0) yield TICK;
  var r = yield* this.exec(fn.body);
  var v;
  if (r instanceof Ret) v = r.v;
  else if (fn.ret.k !== "void") {
    if (fn.name === "main") v = 0;
    else {
      this.rtWarn("noret" + fn.name, "Die Funktion '" + fn.name + "' endet ohne return – ihr Rückgabewert ist zufällig", at);
      v = fn.ret.k === "int" ? (fn.ret.size === 8 ? 0n : 0) : fn.ret.k === "float" ? 0 : fn.ret.k === "ptr" ? 0 : 0;
      if (fn.ret.k === "struct") { var tmp0 = this.allocTemp(fn.ret.size); v = tmp0; }
    }
  }
  if (fn.ret.k === "struct" && r instanceof Ret) {
    var tmp = this.allocTemp(fn.ret.size);
    this.u8.copyWithin(tmp, v, v + fn.ret.size); this.init.copyWithin(tmp, v, v + fn.ret.size);
    v = tmp;
  }
  this.valid.fill(0, base, base + fn.frameSize);
  this.fp = savedFp; this.sp = savedSp; this.depth--;
  return v;
};

// ---------- Anweisungen ----------
// Anweisungen ohne Schleifen, Funktionsaufrufe und Eingaben laufen ohne Generator (schneller)
MP.execF = function (s) {
  switch (s.k) {
    case "block": {
      var it = s.items;
      for (var i = 0; i < it.length; i++) { var r = this.execF(it[i]); if (r) return r; }
      return;
    }
    case "expr": this.evf(s.x); return;
    case "if":
      if (truthy(this.evf(s.c))) return this.execF(s.t);
      if (s.f) return this.execF(s.f);
      return;
    case "decl": {
      for (var d = 0; d < s.decls.length; d++) {
        var dc = s.decls[d], a = this.fp + dc.sym.off, ty = dc.sym.type;
        if (dc.init) {
          this.u8.fill(0, a, a + ty.size); this.init.fill(1, a, a + ty.size);
          var items = dc.init.items;
          for (var q = 0; q < items.length; q++) this.st(a + items[q].off, items[q].ty, this.evf(items[q].x), items[q].x);
        } else this.init.fill(0, a, a + ty.size);
      }
      return;
    }
    case "return": return new Ret(s.x ? this.evf(s.x) : undefined);
    case "break": return BRK;
    case "continue": return CNT;
    case "label": case "empty": return;
  }
  throw rterr("Interner Fehler: execF " + s.k, s);
};
function stmtPure(s) {
  if (!s) return true;
  if (s.pureS !== undefined) return s.pureS;
  var r;
  switch (s.k) {
    case "block": r = s.items.every(stmtPure); break;
    case "expr": r = s.x.pure; break;
    case "if": r = s.c.pure && stmtPure(s.t) && stmtPure(s.f); break;
    case "decl": r = s.decls.every(function (d) { return !d.init || d.init.pure; }); break;
    case "return": r = !s.x || s.x.pure; break;
    case "break": case "continue": case "label": case "empty": r = true; break;
    default: r = false;
  }
  s.pureS = r;
  return r;
}
MP.exec = function* (s) {
  if (s.pureS === undefined) stmtPure(s);
  if (s.pureS) return this.execF(s);
  switch (s.k) {
    case "block": {
      var it = s.items;
      for (var i = 0; i < it.length; i++) {
        var st = it[i];
        var r = st.pureS ? this.execF(st) : yield* this.exec(st);
        if (r) return r;
      }
      return;
    }
    case "expr":
      this.steps++;
      if (s.x.pure) this.evf(s.x); else yield* this.ev(s.x);
      return;
    case "decl": {
      for (var d = 0; d < s.decls.length; d++) {
        var dc = s.decls[d], a = this.fp + dc.sym.off, ty = dc.sym.type;
        if (dc.init) {
          this.u8.fill(0, a, a + ty.size); this.init.fill(1, a, a + ty.size);
          var items = dc.init.items;
          for (var q = 0; q < items.length; q++) {
            var v = items[q].x.pure ? this.evf(items[q].x) : yield* this.ev(items[q].x);
            this.st(a + items[q].off, items[q].ty, v, items[q].x);
          }
        } else this.init.fill(0, a, a + ty.size);
      }
      return;
    }
    case "if": {
      this.steps++;
      var c = s.c.pure ? this.evf(s.c) : yield* this.ev(s.c);
      if (truthy(c)) return yield* this.exec(s.t);
      if (s.f) return yield* this.exec(s.f);
      return;
    }
    case "while": {
      for (;;) {
        this.steps++;
        var c2 = s.c.pure ? this.evf(s.c) : yield* this.ev(s.c);
        if (!truthy(c2)) return;
        var r2 = s.body.pureS ? this.execF(s.body) : yield* this.exec(s.body);
        if (r2 === BRK) return;
        if (r2 && r2 !== CNT) return r2;
        if ((++this.tk & 2047) === 0) yield TICK;
      }
    }
    case "do": {
      for (;;) {
        var r3 = s.body.pureS ? this.execF(s.body) : yield* this.exec(s.body);
        if (r3 === BRK) return;
        if (r3 && r3 !== CNT) return r3;
        this.steps++;
        var c3 = s.c.pure ? this.evf(s.c) : yield* this.ev(s.c);
        if (!truthy(c3)) return;
        if ((++this.tk & 2047) === 0) yield TICK;
      }
    }
    case "for": {
      if (s.init) yield* this.exec(s.init);
      for (;;) {
        this.steps++;
        if (s.c) {
          var c4 = s.c.pure ? this.evf(s.c) : yield* this.ev(s.c);
          if (!truthy(c4)) return;
        }
        var r4 = s.body.pureS ? this.execF(s.body) : yield* this.exec(s.body);
        if (r4 === BRK) return;
        if (r4 && r4 !== CNT) return r4;
        if (s.step) { if (s.step.pure) this.evf(s.step); else yield* this.ev(s.step); }
        if ((++this.tk & 2047) === 0) yield TICK;
      }
    }
    case "switch": {
      this.steps++;
      var x = s.x.pure ? this.evf(s.x) : yield* this.ev(s.x);
      var map = s.map;
      if (!map) {
        map = s.map = new Map();
        s.body.items.forEach(function (item, idx) {
          if (item.k === "label") { if (item.isDefault) s.defIdx = idx; else map.set(String(item.v), idx); }
        });
      }
      var start = map.get(String(x));
      if (start === undefined) start = s.defIdx;
      if (start === undefined) return;
      var its = s.body.items;
      for (var j = start; j < its.length; j++) {
        if (its[j].k === "label") continue;
        var r5 = yield* this.exec(its[j]);
        if (r5 === BRK) return;
        if (r5) return r5;
      }
      return;
    }
    case "label": case "empty": return;
    case "break": return BRK;
    case "continue": return CNT;
    case "return": {
      this.steps++;
      if (!s.x) return new Ret(undefined);
      return new Ret(s.x.pure ? this.evf(s.x) : yield* this.ev(s.x));
    }
  }
  throw rterr("Interner Fehler: Anweisung '" + s.k + "'", s);
};

// ---------- Programmstart ----------
MP.setup = function () {
  var p = this.prog, u8 = this.u8;
  p.lits.forEach(function (l) {
    u8.set(l.bytes, l.addr); u8[l.addr + l.bytes.length] = 0;
  });
  this.init.fill(1, LIT_BASE, GLOBAL_BASE);
  // globale Variablen: mit 0 vorbelegt
  this.valid.fill(1, GLOBAL_BASE, GLOBAL_BASE + p.globalSize);
  this.init.fill(1, GLOBAL_BASE, GLOBAL_BASE + p.globalSize);
  for (var i = 0; i < p.globalInits.length; i++) {
    var gi = p.globalInits[i], a = gi.sym.addr;
    var items = gi.init.items;
    for (var q = 0; q < items.length; q++) this.st(a + items[q].off, items[q].ty, this.evf(items[q].x), items[q].x);
  }
};
MP.main = function* () {
  this.setup();
  var main = this.prog.main.fn;
  var args = [];
  if (main.params.length >= 1) {
    // argc/argv: Programmname als einziges Argument
    var name = this.prog.fileName.replace(/\.c$/, "");
    var sa = this.allocTemp(name.length + 1);
    this.u8.set(utf8(name), sa); this.u8[sa + name.length] = 0; this.init.fill(1, sa, sa + name.length + 1);
    var arr = this.allocTemp(16);
    this.st(arr, ptrTo(TY.char), sa); this.st(arr + 8, ptrTo(TY.char), 0);
    args = [1, arr];
  }
  var r = yield* this.callUser(main, args, this.prog.main);
  return r === undefined ? 0 : Number(r);
};
/* =====================================================================
   Teil 5: C-Bibliothek (stdio, stdlib, string, ctype, math, time)
   ===================================================================== */

// ---------- Typen der Bibliothek ----------
var FILE_T = { k: "struct", def: { tag: "_IO_FILE", dispName: "FILE", fields: [], complete: false, size: 0, align: 8 }, size: 0, align: 8 };
function td(t, name) { var c = Object.assign({}, t); c.tdname = name; return c; }
var LIB_TYPES = {
  size_t: td(TY.ulong, "size_t"), FILE: FILE_T, time_t: td(TY.long, "time_t"), clock_t: td(TY.long, "clock_t"),
  int8_t: td(TY.schar, "int8_t"), uint8_t: td(TY.uchar, "uint8_t"), int16_t: td(TY.short, "int16_t"), uint16_t: td(TY.ushort, "uint16_t"),
  int32_t: td(TY.int, "int32_t"), uint32_t: td(TY.uint, "uint32_t"), int64_t: td(TY.long, "int64_t"), uint64_t: td(TY.ulong, "uint64_t")
};
var LIB_VARS = {
  stdin: { type: ptrTo(FILE_T), id: STDIN_ID }, stdout: { type: ptrTo(FILE_T), id: STDOUT_ID }, stderr: { type: ptrTo(FILE_T), id: STDERR_ID }
};

var LT = {
  "int": TY.int, "unsigned": TY.uint, "long": TY.long, "ulong": TY.ulong, "llong": TY.llong, "double": TY.double, "void": TY.void,
  "char*": ptrTo(TY.char), "cchar*": ptrTo(withConst(TY.char)), "void*": ptrTo(TY.void), "cvoid*": ptrTo(withConst(TY.void)),
  "size_t": LIB_TYPES.size_t, "FILE*": ptrTo(FILE_T), "time_t": LIB_TYPES.time_t, "time_t*": ptrTo(LIB_TYPES.time_t),
  "clock_t": LIB_TYPES.clock_t, "char**": ptrTo(ptrTo(TY.char)), "double*": ptrTo(TY.double)
};
var LIB = Object.create(null);
function def(sig, impl) {
  // sig: "ret name(p1, p2, ...)"
  var m = /^(\S+) (\w+)\((.*)\)$/.exec(sig);
  var ps = m[3] ? m[3].split(",").map(function (s) { return s.trim(); }) : [];
  var variadic = ps[ps.length - 1] === "...";
  if (variadic) ps.pop();
  var params = ps.map(function (p) { if (!LT[p]) throw new Error("Typ " + p); return { name: null, type: LT[p] }; });
  var e = { name: m[2], type: funcT(LT[m[1]], params, variadic, false) };
  Object.assign(e, impl);
  LIB[m[2]] = e;
}

// ---------- Hilfen ----------
function num(v) { return typeof v === "bigint" ? Number(v) : v; }
function isSpace(c) { return c === 32 || (c >= 9 && c <= 13); }
function writeCStr(m, addr, bytes, at, max) {
  var n = bytes.length;
  m.chk(addr, n + 1, at, true);
  m.u8.set(bytes, addr); m.u8[addr + n] = 0;
  m.init.fill(1, addr, addr + n + 1);
}
function streamOf(v, at) {
  if (v === STDOUT_ID) return "out";
  if (v === STDERR_ID) return "err";
  if (v === STDIN_ID) return "in";
  throw rterr("Dateien werden in diesem Online-Editor nicht unterstützt", at);
}

// ---------- Zahlen exakt formatieren (wie glibc) ----------
var F64 = new DataView(new ArrayBuffer(8));
function decompose(x) {
  F64.setFloat64(0, x);
  var hi = F64.getUint32(0), lo = F64.getUint32(4);
  var ex = (hi >>> 20) & 0x7ff;
  var mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (ex === 0) return { m: mant, e: -1074 };
  return { m: mant | (1n << 52n), e: ex - 1075 };
}
function pow10(k) { return 10n ** BigInt(k); }
function roundDiv(num, den) {
  var q = num / den, r = num % den, tw = r * 2n;
  if (tw > den || (tw === den && (q & 1n) === 1n)) q += 1n;
  return q;
}
function fixedExact(x, prec) {
  var d = decompose(x), num, den;
  if (d.e >= 0) { num = d.m << BigInt(d.e); den = 1n; } else { num = d.m; den = 1n << BigInt(-d.e); }
  var q = roundDiv(num * pow10(prec), den);
  var s = q.toString();
  if (prec > 0) {
    while (s.length < prec + 1) s = "0" + s;
    s = s.slice(0, s.length - prec) + "." + s.slice(s.length - prec);
  }
  return s;
}
function expExact(x, prec) {
  if (x === 0) return { digits: "0".repeat(prec + 1), exp: 0 };
  var d = decompose(x);
  var E = Math.floor(Math.log10(x));
  for (var tries = 0; tries < 4; tries++) {
    var num = d.m, den = 1n;
    if (d.e >= 0) num = num << BigInt(d.e); else den = 1n << BigInt(-d.e);
    var k = prec - E;
    if (k >= 0) num *= pow10(k); else den *= pow10(-k);
    var q = roundDiv(num, den);
    if (q >= pow10(prec + 1)) { E++; continue; }
    if (q < pow10(prec)) { E--; continue; }
    return { digits: q.toString(), exp: E };
  }
  return { digits: q.toString().slice(0, prec + 1), exp: E };
}
function fmtFloat(x, conv, prec, fl) {
  var upper = conv === "F" || conv === "E" || conv === "G";
  var neg = x < 0 || (x === 0 && 1 / x < 0) || (x !== x && signBit(x));
  var ax = Math.abs(x), body;
  if (x !== x) body = "nan";
  else if (ax === Infinity) body = "inf";
  else {
    if (prec == null) prec = 6;
    var c = conv.toLowerCase();
    if (c === "f") { body = fixedExact(ax, prec); if (fl.alt && prec === 0) body += "."; }
    else if (c === "e") body = expStr(ax, prec, fl.alt);
    else if (c === "g") {
      var P = prec === 0 ? 1 : prec;
      var X = ax === 0 ? 0 : expExact(ax, P - 1).exp;
      if (P > X && X >= -4) body = fixedExact(ax, P - 1 - X);
      else body = expStr(ax, P - 1, fl.alt);
      if (!fl.alt) {
        var ePos = body.indexOf("e");
        var mant = ePos >= 0 ? body.slice(0, ePos) : body, rest = ePos >= 0 ? body.slice(ePos) : "";
        if (mant.indexOf(".") >= 0) mant = mant.replace(/0+$/, "").replace(/\.$/, "");
        body = mant + rest;
      }
    } else body = fixedExact(ax, prec);
  }
  if (upper) body = body.toUpperCase();
  var sign = neg ? "-" : fl.plus ? "+" : fl.space ? " " : "";
  return { sign: sign, body: body, special: !(ax === ax && ax !== Infinity) };
}
function signBit(x) { F64.setFloat64(0, x); return (F64.getUint32(0) >>> 31) === 1; }
function expStr(ax, prec, alt) {
  var r = expExact(ax, prec);
  var m = r.digits[0] + (prec > 0 || alt ? "." + r.digits.slice(1) : "");
  var e = Math.abs(r.exp);
  return m + "e" + (r.exp < 0 ? "-" : "+") + (e < 10 ? "0" + e : String(e));
}

// ---------- Formatangaben lesen ----------
function parseSpecs(bytes, isScanf) {
  var specs = [], i = 0;
  while (i < bytes.length) {
    if (bytes[i] !== 37) { i++; continue; }
    var start = i; i++;
    var sp = { start: start, flags: { minus: false, plus: false, space: false, alt: false, zero: false }, width: null, prec: null, len: "", conv: "", star: false, suppress: false };
    if (isScanf) {
      if (bytes[i] === 42) { sp.suppress = true; i++; }
    } else {
      for (;;) {
        var c = bytes[i];
        if (c === 45) sp.flags.minus = true; else if (c === 43) sp.flags.plus = true; else if (c === 32) sp.flags.space = true;
        else if (c === 35) sp.flags.alt = true; else if (c === 48) sp.flags.zero = true; else break;
        i++;
      }
    }
    if (bytes[i] === 42 && !isScanf) { sp.width = "*"; i++; }
    else { var w = ""; while (bytes[i] >= 48 && bytes[i] <= 57) w += String.fromCharCode(bytes[i++]); if (w) sp.width = parseInt(w, 10); }
    if (bytes[i] === 46 && !isScanf) {
      i++;
      if (bytes[i] === 42) { sp.prec = "*"; i++; }
      else { var pr = ""; while (bytes[i] >= 48 && bytes[i] <= 57) pr += String.fromCharCode(bytes[i++]); sp.prec = pr ? parseInt(pr, 10) : 0; }
    }
    var l2 = String.fromCharCode(bytes[i] || 0, bytes[i + 1] || 0);
    if (l2 === "hh" || l2 === "ll") { sp.len = l2; i += 2; }
    else if ("hlLzjt".indexOf(String.fromCharCode(bytes[i] || 0)) >= 0 && bytes[i]) { sp.len = String.fromCharCode(bytes[i]); i++; }
    if (i >= bytes.length) { sp.conv = ""; sp.end = i; specs.push(sp); break; }
    sp.conv = String.fromCharCode(bytes[i]);
    if (isScanf && sp.conv === "[") {
      var j = i + 1;
      if (bytes[j] === 94) j++;
      if (bytes[j] === 93) j++;
      while (j < bytes.length && bytes[j] !== 93) j++;
      sp.set = bytes.slice(i + 1, j);
      i = j;
    }
    i++;
    sp.end = i;
    specs.push(sp);
  }
  return specs;
}

// ---------- printf ----------
function formatBytes(m, fmt, args, types, at, fname) {
  var out = [], ai = 0, i = 0;
  function push(s) { for (var k = 0; k < s.length; k++) { var c = s.charCodeAt(k); if (c < 128) out.push(c); else Array.prototype.push.apply(out, utf8(s[k])); } }
  function pad(str, width, left, zero, prefixLen) {
    if (width == null || str.length >= width) return str;
    var n = width - str.length;
    if (left) return str + " ".repeat(n);
    if (zero) return str.slice(0, prefixLen) + "0".repeat(n) + str.slice(prefixLen);
    return " ".repeat(n) + str;
  }
  function nextArg() {
    if (ai >= args.length) { ai++; return { v: undefined, t: null }; }
    var r = { v: args[ai], t: types[ai] }; ai++; return r;
  }
  while (i < fmt.length) {
    var c = fmt[i];
    if (c !== 37) { out.push(c); i++; continue; }
    var sp = parseSpecs(fmt.slice(i, i + 40), false)[0];
    i += sp.end;
    var fl = sp.flags, width = sp.width, prec = sp.prec;
    if (width === "*") { var wa = nextArg(); width = num(wa.v || 0); if (width < 0) { fl.minus = true; width = -width; } }
    if (prec === "*") { var pa = nextArg(); prec = num(pa.v || 0); if (prec < 0) prec = null; }
    var conv = sp.conv;
    if (conv === "%") { out.push(37); continue; }
    if (conv === "") { push("%"); continue; }
    var a = nextArg(), v = a.v, t = a.t, s;
    switch (conv) {
      case "d": case "i": case "u": case "x": case "X": case "o": {
        var signed = conv === "d" || conv === "i";
        var bits = sp.len === "l" || sp.len === "ll" || sp.len === "z" || sp.len === "j" || sp.len === "t" ? 64 : sp.len === "h" ? 16 : sp.len === "hh" ? 8 : 32;
        var bv;
        if (v === undefined) bv = 0n;
        else if (typeof v === "bigint") bv = v;
        else if (t && t.k === "float") { F64.setFloat64(0, v); bv = BigInt(F64.getUint32(4)); }
        else bv = BigInt(Math.trunc(v));
        bv = signed ? BigInt.asIntN(bits, bv) : BigInt.asUintN(bits, bv);
        var neg = bv < 0n; if (neg) bv = -bv;
        var digits = conv === "x" ? bv.toString(16) : conv === "X" ? bv.toString(16).toUpperCase() : conv === "o" ? bv.toString(8) : bv.toString();
        if (prec != null) { if (prec === 0 && bv === 0n) digits = ""; while (digits.length < prec) digits = "0" + digits; }
        var prefix = "";
        if (fl.alt && bv !== 0n && (conv === "x" || conv === "X")) prefix = conv === "x" ? "0x" : "0X";
        if (fl.alt && conv === "o" && digits[0] !== "0") digits = "0" + digits;
        var sign = signed ? (neg ? "-" : fl.plus ? "+" : fl.space ? " " : "") : "";
        s = sign + prefix + digits;
        push(pad(s, width, fl.minus, fl.zero && prec == null, (sign + prefix).length));
        break;
      }
      case "c": {
        var ch = v === undefined ? 0 : num(v) & 255;
        var sb = [ch];
        if (width != null && width > 1) { var sp2 = []; for (var q = 1; q < width; q++) sp2.push(32); sb = fl.minus ? [ch].concat(sp2) : sp2.concat([ch]); }
        Array.prototype.push.apply(out, sb);
        break;
      }
      case "s": {
        var bytes;
        if (v === undefined || v === 0) bytes = utf8(prec != null && prec < 6 ? "" : "(null)");
        else {
          if (t && t.k !== "ptr") {
            throw rterr(fname + ": Zu %s passt nur ein Text (char-Array), nicht " + typeStr(t), at,
              t.k === "int" ? "Für ein einzelnes Zeichen %c verwenden, für Zahlen %d." : null);
          }
          bytes = m.cstr(v, at, prec != null ? prec : null);
        }
        if (width != null && bytes.length < width) {
          var spaces = []; for (var q2 = bytes.length; q2 < width; q2++) spaces.push(32);
          bytes = fl.minus ? bytes.concat(spaces) : spaces.concat(bytes);
        }
        Array.prototype.push.apply(out, bytes);
        break;
      }
      case "f": case "F": case "e": case "E": case "g": case "G": {
        var x = v === undefined ? 0 : (t && t.k === "float") ? v : 0;
        var r = fmtFloat(x, conv, prec, fl);
        s = r.sign + r.body;
        push(pad(s, width, fl.minus, fl.zero && !r.special, r.sign.length));
        break;
      }
      case "p": {
        s = v === undefined || v === 0 ? "(nil)" : "0x" + (num(v) + 0x7ffd00000000).toString(16);
        push(pad(s, width, fl.minus, false, 0));
        break;
      }
      case "n": throw rterr("%n wird nicht unterstützt", at);
      default:
        push(String.fromCharCode.apply(null, fmt.slice(sp.start, sp.start + sp.end)));
    }
  }
  return out;
}

// Prüfung der Formatangaben beim Übersetzen (this = Parser)
function checkFormat(n, raw, conv, fmtIdx, isScanf) {
  var fa = raw[fmtIdx];
  if (!fa) return;
  var f = fa; while (f.k === "conv") f = f.x;
  if (f.k === "decay") f = f.x;
  if (f.k !== "str") {
    if (f.ty && isCharPtrLike(f.ty)) return;
    return;
  }
  var specs = parseSpecs(f.bytes, isScanf);
  var ai = fmtIdx + 1, self = this, fname = n.name;
  var at = f;
  specs.forEach(function (sp) {
    if (sp.conv === "%") return;
    if (sp.conv === "") { self.warn(fname + ": Unvollständige Formatangabe am Ende ('%')", at, "Ein Prozentzeichen im Text schreibt man als %%."); return; }
    var valid = isScanf ? "diouxXfFeEgGaAcs[pn" : "diouxXfFeEgGaAcspn";
    if (valid.indexOf(sp.conv) < 0) {
      self.warn(fname + ": Unbekannte Formatangabe '%" + (sp.flags.space ? " " : "") + sp.len + sp.conv + "'", at, "Ein Prozentzeichen im Text schreibt man als %%.");
      return;
    }
    if (!isScanf && sp.width === "*") ai++;
    if (!isScanf && sp.prec === "*") ai++;
    if (isScanf && sp.suppress) return;
    var spec = "%" + (sp.width && sp.width !== "*" ? sp.width : "") + (sp.prec != null && sp.prec !== "*" ? "." + sp.prec : "") + sp.len + sp.conv;
    if (ai >= conv.length) {
      self.warn(fname + ": Zur Formatangabe " + spec + " fehlt ein Argument", at,
        sp.flags.space || /^[a-z]$/.test(sp.conv) && f.bytes[sp.start + 1] === 32 ? "Ein Prozentzeichen im Text schreibt man als %%." : "Für jede Formatangabe braucht es einen Wert hinter dem Text.");
      ai++;
      return;
    }
    var arg = conv[ai], rawArg = raw[ai], t = arg.ty;
    ai++;
    if (t.k === "err") return;
    var shown = rawArg.ty && rawArg.ty.k !== "err" ? (rawArg.ty.k === "arr" ? ptrTo(rawArg.ty.of) : rawArg.ty) : t;
    var argTxt = self.text(rawArg);
    if (!isScanf) checkPrintfArg.call(self, sp, spec, t, argTxt, rawArg, fname, shown);
    else checkScanfArg.call(self, sp, spec, t, argTxt, rawArg, fname, arg);
  });
  if (ai < conv.length) {
    var extra = conv.length - ai;
    this.warn(fname + ": " + (extra === 1 ? "Ein Argument mehr" : extra + " Argumente mehr") + " als Formatangaben", raw[ai],
      "Hat der Text für jeden Wert eine Formatangabe wie %d?");
  }
}
function lenType(len, conv) {
  var u = "uoxX".indexOf(conv) >= 0;
  switch (len) {
    case "hh": return u ? TY.uchar : TY.schar;
    case "h": return u ? TY.ushort : TY.short;
    case "l": return u ? TY.ulong : TY.long;
    case "ll": return u ? TY.ullong : TY.llong;
    case "z": return TY.ulong;
    case "j": return u ? TY.ulong : TY.long;
    case "t": return TY.long;
  }
  return u ? TY.uint : TY.int;
}
function checkPrintfArg(sp, spec, t, argTxt, rawArg, fname, shown) {
  var c = sp.conv;
  var ts = typeStr(shown || t);
  if ("diouxX".indexOf(c) >= 0) {
    var want = lenType(sp.len, c);
    if (t.k === "float") {
      this.warn(fname + ": " + spec + " erwartet eine Ganzzahl, aber " + argTxt + " ist " + ts, rawArg,
        "Für Kommazahlen %f verwenden (oder %.2f für zwei Nachkommastellen).");
    } else if (t.k === "ptr") {
      this.warn(fname + ": " + spec + " erwartet eine Ganzzahl, aber " + argTxt + " ist ein Zeiger (" + typeStr(t) + ")", rawArg,
        isCharPtrLike(t) ? "Für Texte %s verwenden." : null);
    } else if (t.k === "int" && promote(t).size !== want.size) {
      var sug = t.size === 8 ? (t.tdname === "size_t" ? "%zu" : t.rank === 5 ? "%lld" : "%ld") : "%d";
      this.warn(fname + ": " + spec + " erwartet " + typeStr(want) + ", aber " + argTxt + " ist " + ts, rawArg,
        "Passend wäre " + sug + (t.size === 8 && want.size === 4 ? " – oder (int) vor den Wert schreiben." : "."));
    } else if (t.k === "struct") {
      this.warn(fname + ": Eine Struktur kann nicht direkt ausgegeben werden", rawArg, "Komponenten einzeln ausgeben, z. B. " + argTxt + ".x");
    }
  } else if (c === "c") {
    if (t.k !== "int") this.warn(fname + ": %c erwartet ein Zeichen (char/int), aber " + argTxt + " ist " + ts, rawArg,
      isCharPtrLike(t) ? "Für Texte %s verwenden." : null);
  } else if (c === "s") {
    if (!(t.k === "ptr" && (t.to.isChar || t.to.k === "void"))) {
      this.warn(fname + ": %s erwartet einen Text (char *), aber " + argTxt + " ist " + ts, rawArg,
        t.k === "int" ? ((shown && shown.isChar) ? "Für ein einzelnes Zeichen %c verwenden." : "Für Zahlen %d verwenden.") : t.k === "float" ? "Für Kommazahlen %f verwenden." : null);
    }
  } else if ("fFeEgGaA".indexOf(c) >= 0) {
    if (t.k !== "float") {
      this.warn(fname + ": " + spec + " erwartet eine Kommazahl (double), aber " + argTxt + " ist " + ts, rawArg,
        t.k === "int" ? "Für Ganzzahlen %d verwenden – oder (double) " + argTxt + " schreiben." : null);
    }
  } else if (c === "p") {
    if (t.k !== "ptr") this.warn(fname + ": %p erwartet einen Zeiger", rawArg);
  }
}
function checkScanfArg(sp, spec, t, argTxt, rawArg, fname, arg) {
  var c = sp.conv;
  if (t.k !== "ptr") {
    this.warn(fname + ": Zu " + spec + " gehört eine Adresse, aber " + argTxt + " ist " + typeStr(t), rawArg,
      t.k === "int" || t.k === "float" ? "Das & fehlt: " + fname + "(…, &" + argTxt + ")" : null);
    return;
  }
  var to = t.to;
  if ("diouxXn".indexOf(c) >= 0) {
    var want = lenType(sp.len, c);
    if (to.k !== "int" || to.size !== want.size) {
      var hint = to.k === "float" ? (to.size === 8 ? "Für double: %lf" : "Für float: %f") : to.k === "int" && to.size === 1 ? "Für ein einzelnes Zeichen: \" %c\"" : null;
      this.warn(fname + ": " + spec + " erwartet einen Zeiger auf " + typeStr(want) + ", aber " + argTxt + " ist " + typeStr(t), rawArg, hint);
    }
  } else if ("fFeEgGaA".indexOf(c) >= 0) {
    var sz = sp.len === "l" ? 8 : sp.len === "L" ? 16 : 4;
    if (to.k !== "float" || to.size !== sz) {
      var h2 = to.k === "float" && to.size === 8 ? "Für double braucht scanf %lf (mit l) – %f ist nur für float." :
        to.k === "float" && to.size === 4 ? "Für float verwendet scanf %f." : to.k === "int" ? "Für Ganzzahlen %d verwenden." : null;
      this.warn(fname + ": " + spec + " passt nicht zu " + argTxt + " (" + typeStr(t) + ")", rawArg, h2);
    }
  } else if (c === "c" || c === "s" || c === "[") {
    if (to.k === "arr" && to.of.isChar) {
      this.warn(fname + ": Bei Texten (char-Arrays) steht kein & vor dem Namen", rawArg, "Richtig: " + fname + "(\"" + spec + "\", " + argTxt.replace(/^&\s*/, "") + ")", "hint");
      to = to.of;
    }
    if (!to.isChar) {
      this.warn(fname + ": " + spec + " erwartet ein char-Array bzw. char *, aber " + argTxt + " ist " + typeStr(t), rawArg,
        c === "c" && to.k === "int" ? "Für Zahlen %d verwenden." : null);
    } else if (c !== "c" && sp.width == null) {
      var src = arg; while (src.k === "conv") src = src.x;
      var len = src.k === "decay" && src.x.ty.k === "arr" ? src.x.ty.len : null;
      if (len) this.warn(fname + ": %" + c + " ohne Längenangabe kann über das Array-Ende hinaus schreiben", rawArg,
        "Sicherer: %" + (len - 1) + c + " (bei char " + argTxt + "[" + len + "]).", "hint");
    }
  }
}

// ---------- scanf ----------
// Quelle: stdin (wartet auf Eingabe) oder Text im Speicher (sscanf)
function stdinSrc(m) { return { peek: function () { return m.peekIn(); }, get: function () { return m.getIn(); } }; }
function strSrc(bytes) {
  var p = 0;
  return {
    peek: function* () { return p < bytes.length ? bytes[p] : -1; },
    get: function* () { return p < bytes.length ? bytes[p++] : -1; }
  };
}
function* scanCore(m, src, fmt, args, types, at, fname, argBase) {
  var ai = 0, assigned = 0, consumed = 0, i = 0, anyInput = false;
  function target(sp) {
    var k = ai++;
    if (k >= args.length) throw rterr(fname + ": Zur Formatangabe fehlt ein Argument (Adresse)", at);
    var t = types[k];
    if (!t || t.k !== "ptr") {
      throw rterr(fname + ": Das " + (k + argBase + 1) + ". Argument ist keine Adresse – fehlt das & vor der Variable?", at,
        "Richtig ist z. B. scanf(\"%d\", &zahl);");
    }
    var a = args[k];
    if (a < LIT_BASE) throw rterr(fname + ": Das " + (k + argBase + 1) + ". Argument ist keine gültige Adresse – fehlt das &?", at,
      "Richtig ist z. B. scanf(\"%d\", &zahl);");
    return a;
  }
  function* skipWs() {
    for (;;) { var ch = yield* src.peek(); if (ch >= 0 && isSpace(ch)) { yield* src.get(); consumed++; } else return ch; }
  }
  while (i < fmt.length) {
    var c = fmt[i];
    if (isSpace(c)) {
      while (i < fmt.length && isSpace(fmt[i])) i++;
      yield* skipWs();
      continue;
    }
    if (c !== 37) {
      var ch0 = yield* src.peek();
      if (ch0 < 0) return anyInput || assigned ? assigned : -1;
      if (ch0 !== c) return assigned;
      yield* src.get(); consumed++; anyInput = true; i++;
      continue;
    }
    var sp = parseSpecs(fmt.slice(i, i + 300), true)[0];
    i += sp.end;
    var conv = sp.conv;
    if (conv === "%") {
      var chp = yield* skipWs();
      if (chp !== 37) return chp < 0 && !anyInput && !assigned ? -1 : assigned;
      yield* src.get(); consumed++; continue;
    }
    if (conv === "n") { if (!sp.suppress) { var an = target(sp); m.st(an, lenType(sp.len, "d"), wrapInt(consumed, TY.int), at); } continue; }
    var first;
    if (conv !== "c" && conv !== "[") first = yield* skipWs(); else first = yield* src.peek();
    if (first < 0) return assigned || anyInput ? assigned : -1;
    var width = sp.width == null ? Infinity : sp.width;
    var got = [];
    if ("diouxX".indexOf(conv) >= 0) {
      var base = conv === "x" || conv === "X" ? 16 : conv === "o" ? 8 : conv === "i" ? 0 : 10;
      var chI = yield* src.peek();
      if ((chI === 43 || chI === 45) && got.length < width) { got.push(yield* src.get()); chI = yield* src.peek(); }
      if (base === 0 || base === 16) {
        if (chI === 48 && got.length < width) {
          got.push(yield* src.get()); chI = yield* src.peek();
          if ((chI === 120 || chI === 88) && got.length < width) { got.push(yield* src.get()); base = 16; chI = yield* src.peek(); }
          else if (base === 0) base = 8;
        } else if (base === 0) base = 10;
      }
      var digits = "";
      if (got.length && got[got.length - 1] === 48 && base !== 16) digits = "0";
      if (got.length >= 2 && (got[got.length - 1] === 120 || got[got.length - 1] === 88)) digits = "";
      for (;;) {
        if (got.length >= width) break;
        chI = yield* src.peek();
        var dv = chI >= 48 && chI <= 57 ? chI - 48 : chI >= 97 && chI <= 102 ? chI - 87 : chI >= 65 && chI <= 70 ? chI - 55 : 99;
        if (dv >= base) break;
        got.push(yield* src.get()); digits += String.fromCharCode(chI);
      }
      consumed += got.length; if (got.length) anyInput = true;
      if (!digits && !(got.length && got[got.length - 1] === 48)) return assigned;
      if (!digits) digits = "0";
      var bv = BigInt((base === 16 ? "0x" : base === 8 ? "0o" : "") + digits);
      if (got[0] === 45) bv = -bv;
      var LMAX = (1n << 63n) - 1n;
      if (bv > LMAX && "di".indexOf(conv) >= 0) bv = LMAX; else if (bv < -LMAX - 1n) bv = -LMAX - 1n;
      if (!sp.suppress) {
        var tt = lenType(sp.len, conv);
        var a1 = target(sp);
        m.st(a1, tt, tt.size === 8 ? (tt.signed ? BigInt.asIntN(64, bv) : BigInt.asUintN(64, bv)) : wrapInt(Number(BigInt.asIntN(32, bv)), tt), at);
        assigned++;
      }
    } else if ("fFeEgGaA".indexOf(conv) >= 0) {
      var txt = "";
      var chF = yield* src.peek();
      function okw() { return txt.length < width; }
      if ((chF === 43 || chF === 45) && okw()) { txt += String.fromCharCode(yield* src.get()); chF = yield* src.peek(); }
      var low = chF | 32;
      if ((low === 105 || low === 110) && okw()) {
        // inf / nan
        var word = low === 105 ? "inf" : "nan", k2 = 0;
        while (k2 < 3 && okw()) { var cw = yield* src.peek(); if ((cw | 32) !== word.charCodeAt(k2)) break; txt += String.fromCharCode(yield* src.get()); k2++; }
        if (k2 < 3) { consumed += txt.length; return assigned; }
        if (word === "inf") {
          var rest = "inity", k3 = 0;
          while (k3 < 5 && okw()) { var cw2 = yield* src.peek(); if ((cw2 | 32) !== rest.charCodeAt(k3)) break; txt += String.fromCharCode(yield* src.get()); k3++; }
        }
      } else {
        var nd = 0;
        while (okw()) { chF = yield* src.peek(); if (chF >= 48 && chF <= 57) { txt += String.fromCharCode(yield* src.get()); nd++; } else break; }
        if (okw() && (yield* src.peek()) === 46) {
          txt += String.fromCharCode(yield* src.get());
          while (okw()) { chF = yield* src.peek(); if (chF >= 48 && chF <= 57) { txt += String.fromCharCode(yield* src.get()); nd++; } else break; }
        }
        if (nd && okw() && ((yield* src.peek()) | 32) === 101) {
          txt += String.fromCharCode(yield* src.get());
          chF = yield* src.peek();
          if ((chF === 43 || chF === 45) && okw()) { txt += String.fromCharCode(yield* src.get()); }
          while (okw()) { chF = yield* src.peek(); if (chF >= 48 && chF <= 57) txt += String.fromCharCode(yield* src.get()); else break; }
        }
        consumed += txt.length; if (txt) anyInput = true;
        if (!nd) return assigned;
      }
      var fv = parseFloat(txt.replace(/e[+-]?$/i, ""));
      if (/^[+-]?inf/i.test(txt)) fv = txt[0] === "-" ? -Infinity : Infinity;
      if (/nan/i.test(txt)) fv = NaN;
      if (!sp.suppress) {
        var a2 = target(sp);
        if (sp.len === "l" || sp.len === "L") m.st(a2, TY.double, fv, at); else m.st(a2, TY.float, Math.fround(fv), at);
        assigned++;
      }
    } else if (conv === "c") {
      var wc = sp.width == null ? 1 : sp.width;
      for (var q = 0; q < wc; q++) { var cc = yield* src.get(); if (cc < 0) break; got.push(cc); }
      consumed += got.length; if (got.length) anyInput = true;
      if (got.length < wc && !got.length) return assigned || anyInput ? assigned : -1;
      if (!sp.suppress) {
        var a3 = target(sp);
        m.chk(a3, got.length, at, true); m.u8.set(got, a3); m.init.fill(1, a3, a3 + got.length);
        assigned++;
      }
    } else if (conv === "s" || conv === "[") {
      var neg = false, set = null;
      if (conv === "[") {
        var sb = sp.set.slice();
        if (sb[0] === 94) { neg = true; sb = sb.slice(1); }
        set = new Set();
        for (var z = 0; z < sb.length; z++) {
          if (sb[z + 1] === 45 && z + 2 < sb.length) { for (var y = sb[z]; y <= sb[z + 2]; y++) set.add(y); z += 2; }
          else set.add(sb[z]);
        }
      }
      while (got.length < width) {
        var cs = yield* src.peek();
        if (cs < 0) break;
        if (conv === "s" ? isSpace(cs) : (set.has(cs) === neg)) break;
        got.push(yield* src.get());
      }
      consumed += got.length; if (got.length) anyInput = true;
      if (!got.length) return assigned;
      if (!sp.suppress) {
        var a4 = target(sp);
        try { writeCStr(m, a4, got, at); }
        catch (e) {
          if (e.rterr) throw rterr(fname + ": Die Eingabe \"" + decodeUtf8(got).slice(0, 40) + "\" ist zu lang für das Array", at,
            "Mit einer Längenangabe wie %19s (bei char name[20]) lässt sich das verhindern.");
          throw e;
        }
        assigned++;
      }
    } else if (conv === "p") {
      var hx = "";
      while (got.length < width) { var cp = yield* src.peek(); if (/[0-9a-fA-Fx]/.test(String.fromCharCode(cp))) { got.push(yield* src.get()); hx += String.fromCharCode(cp); } else break; }
      if (!hx) return assigned;
      if (!sp.suppress) { m.st(target(sp), ptrTo(TY.void), parseInt(hx, 16) || 0, at); assigned++; }
    } else {
      return assigned;
    }
  }
  return assigned;
}
function runSync(gen, at) {
  var r = gen.next();
  while (!r.done) {
    if (r.value === NEEDIN) throw rterr("Interner Fehler: Eingabe in sscanf", at);
    r = gen.next();
  }
  return r.value;
}

// ---------- glibc-kompatibler Zufallsgenerator ----------
function GlibcRand() { this.seed(1); }
GlibcRand.prototype.seed = function (s) {
  s = s | 0; if (s === 0) s = 1;
  var r = new Int32Array(344);
  r[0] = s;
  for (var i = 1; i < 31; i++) {
    var hi = Math.trunc(r[i - 1] / 127773), lo = r[i - 1] % 127773;
    var w = 16807 * lo - 2836 * hi;
    if (w < 0) w += 2147483647;
    r[i] = w;
  }
  for (i = 31; i < 34; i++) r[i] = r[i - 31];
  for (i = 34; i < 344; i++) r[i] = (r[i - 31] + r[i - 3]) | 0;
  this.ring = Array.prototype.slice.call(r, 344 - 34);
};
GlibcRand.prototype.next = function () {
  var g = this.ring;
  var v = (g[g.length - 31] + g[g.length - 3]) | 0;
  g.push(v); g.shift();
  return (v >>> 1);
};

// ---------- Funktionen ----------
var cstrT = function (m, a, at) { return m.cstr(a, at); };
function fmtCheck(idx, isScanf) { return function (n, raw, conv) { checkFormat.call(this, n, raw, conv, idx, isScanf); }; }
function typesOf(n, from) { return n.args.slice(from).map(function (a) { return a.ty; }); }

// stdio
def("int printf(cchar*, ...)", {
  check: fmtCheck(0, false),
  fn: function (m, a, n) {
    var bytes = formatBytes(m, m.cstr(a[0], n), a.slice(1), typesOf(n, 1), n, "printf");
    m.writeBytes(bytes); return bytes.length;
  }
});
def("int fprintf(FILE*, cchar*, ...)", {
  check: fmtCheck(1, false),
  fn: function (m, a, n) {
    var st = streamOf(a[0], n);
    if (st === "in") throw rterr("fprintf: In stdin kann man nicht schreiben", n);
    var bytes = formatBytes(m, m.cstr(a[1], n), a.slice(2), typesOf(n, 2), n, "fprintf");
    m.writeBytes(bytes, st === "err"); return bytes.length;
  }
});
def("int sprintf(char*, cchar*, ...)", {
  check: fmtCheck(1, false),
  fn: function (m, a, n) {
    var bytes = formatBytes(m, m.cstr(a[1], n), a.slice(2), typesOf(n, 2), n, "sprintf");
    try { writeCStr(m, a[0], bytes, n); }
    catch (e) { if (e.rterr) throw rterr("sprintf: Der Text (" + bytes.length + " Zeichen) passt nicht in das Ziel-Array", n); throw e; }
    return bytes.length;
  }
});
def("int snprintf(char*, size_t, cchar*, ...)", {
  check: fmtCheck(2, false),
  fn: function (m, a, n) {
    var bytes = formatBytes(m, m.cstr(a[2], n), a.slice(3), typesOf(n, 3), n, "snprintf");
    var max = num(a[1]);
    if (max > 0) writeCStr(m, a[0], bytes.slice(0, max - 1), n);
    return bytes.length;
  }
});
def("int puts(cchar*)", { fn: function (m, a, n) { var b = m.cstr(a[0], n); b.push(10); m.writeBytes(b); return 1; } });
def("int putchar(int)", { fn: function (m, a) { m.writeBytes([a[0] & 255]); return a[0] & 255; } });
def("int fputs(cchar*, FILE*)", { fn: function (m, a, n) { var st = streamOf(a[1], n); m.writeBytes(m.cstr(a[0], n), st === "err"); return 1; } });
def("int fputc(int, FILE*)", { fn: function (m, a, n) { var st = streamOf(a[1], n); m.writeBytes([a[0] & 255], st === "err"); return a[0] & 255; } });
def("int putc(int, FILE*)", { fn: LIB.fputc.fn });
def("int scanf(cchar*, ...)", {
  check: fmtCheck(0, true),
  gen: function* (m, a, n) { return yield* scanCore(m, stdinSrc(m), m.cstr(a[0], n), a.slice(1), typesOf(n, 1), n, "scanf", 1); }
});
def("int fscanf(FILE*, cchar*, ...)", {
  check: fmtCheck(1, true),
  gen: function* (m, a, n) {
    if (streamOf(a[0], n) !== "in") throw rterr("fscanf: Nur stdin wird unterstützt", n);
    return yield* scanCore(m, stdinSrc(m), m.cstr(a[1], n), a.slice(2), typesOf(n, 2), n, "fscanf", 2);
  }
});
def("int sscanf(cchar*, cchar*, ...)", {
  check: fmtCheck(1, true),
  fn: function (m, a, n) { return runSync(scanCore(m, strSrc(m.cstr(a[0], n)), m.cstr(a[1], n), a.slice(2), typesOf(n, 2), n, "sscanf", 2), n); }
});
def("int getchar()", { gen: function* (m) { return yield* m.getIn(); } });
def("int getc(FILE*)", { gen: function* (m, a, n) { if (streamOf(a[0], n) !== "in") throw rterr("getc: Nur stdin wird unterstützt", n); return yield* m.getIn(); } });
def("int fgetc(FILE*)", { gen: LIB.getc.gen });
def("int ungetc(int, FILE*)", { fn: function (m, a) { if (a[0] < 0) return -1; if (m.inPos > 0) { m.inPos--; m.inBuf[m.inPos] = a[0] & 255; } else m.inBuf.unshift(a[0] & 255); return a[0] & 255; } });
def("char* fgets(char*, int, FILE*)", {
  gen: function* (m, a, n) {
    if (streamOf(a[2], n) !== "in") throw rterr("fgets: Nur stdin wird unterstützt", n);
    var max = a[1], got = [];
    if (max <= 0) return 0;
    while (got.length < max - 1) {
      var c = yield* m.getIn();
      if (c < 0) break;
      got.push(c);
      if (c === 10) break;
    }
    if (!got.length) return 0;
    try { writeCStr(m, a[0], got, n); }
    catch (e) { if (e.rterr) throw rterr("fgets: Das Ziel-Array ist kleiner als die angegebene Größe " + max, n, "Als Größe sizeof(text) übergeben."); throw e; }
    return a[0];
  }
});
def("char* gets(char*)", {
  check: function (n) { this.error("gets wurde aus dem C-Standard entfernt, weil es nicht sicher ist", n, "Verwende fgets(text, sizeof(text), stdin);"); }
});
def("int fflush(FILE*)", { fn: function (m, a) { if (a[0] === STDIN_ID) { m.inBuf = m.inBuf.slice(m.inPos); m.inPos = 0; var nl = m.inBuf.indexOf(10); if (nl >= 0) m.inBuf = m.inBuf.slice(nl + 1); else m.inBuf = []; } else m.flush(); return 0; } });
def("int setvbuf(FILE*, char*, int, size_t)", { fn: function () { return 0; } });
def("void setbuf(FILE*, char*)", { fn: function () { } });
def("void perror(cchar*)", { fn: function (m, a, n) { var b = a[0] ? m.cstr(a[0], n) : []; m.writeBytes(b.concat(utf8(": Fehler\n")), true); } });
def("FILE* fopen(cchar*, cchar*)", { check: function (n) { this.error("Dateien werden in diesem Online-Editor nicht unterstützt", n); } });
def("int fclose(FILE*)", { fn: function () { return 0; } });

// stdlib
def("int rand()", { fn: function (m) { return m.rand.next(); } });
def("void srand(unsigned)", { fn: function (m, a) { m.rand.seed(a[0]); } });
def("int abs(int)", { fn: function (m, a) { return a[0] < 0 ? (-a[0]) | 0 : a[0]; } });
def("long labs(long)", { fn: function (m, a) { return BigInt.asIntN(64, a[0] < 0n ? -a[0] : a[0]); } });
def("llong llabs(llong)", { fn: function (m, a) { return BigInt.asIntN(64, a[0] < 0n ? -a[0] : a[0]); } });
def("void exit(int)", { fn: function (m, a) { throw { exit: a[0] }; } });
def("void* malloc(size_t)", { fn: function (m, a, n) { return heapAlloc(m, num(a[0]), false, n); } });
def("void* calloc(size_t, size_t)", { fn: function (m, a, n) { return heapAlloc(m, num(a[0]) * num(a[1]), true, n); } });
def("void* realloc(void*, size_t)", {
  fn: function (m, a, n) {
    var old = a[0], size = num(a[1]);
    if (!old) return heapAlloc(m, size, false, n);
    var os = m.heap.get(old);
    if (os === undefined) throw rterr("realloc mit einer Adresse, die nicht von malloc stammt", n);
    var p = heapAlloc(m, size, false, n);
    if (!p) return 0;
    var k = Math.min(os, size);
    m.u8.copyWithin(p, old, old + k); m.init.copyWithin(p, old, old + k);
    heapFree(m, old, n);
    return p;
  }
});
def("void free(void*)", { fn: function (m, a, n) { if (a[0]) heapFree(m, a[0], n); } });
function heapAlloc(m, size, zero, at) {
  if (size < 0 || m.heapTop + size + GAP > TEMP_BASE) return 0;
  var p = alignUp(m.heapTop, 16);
  m.heapTop = p + Math.max(size, 1) + GAP;
  m.valid.fill(1, p, p + size);
  if (zero) { m.u8.fill(0, p, p + size); m.init.fill(1, p, p + size); }
  else { m.fillGarbage(p, size); m.init.fill(0, p, p + size); }
  m.heap.set(p, size);
  return p;
}
function heapFree(m, p, at) {
  var s = m.heap.get(p);
  if (s === undefined) throw rterr("free mit einer Adresse, die nicht von malloc stammt (oder doppeltes free)", at);
  m.valid.fill(0, p, p + s);
  m.heap.delete(p);
}
function parseLeadingNumber(bytes, isFloat) {
  var s = decodeUtf8(bytes).replace(/^\s+/, "");
  var mm = isFloat ? /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s) : /^[+-]?\d+/.exec(s);
  return mm ? mm[0] : "";
}
def("int atoi(cchar*)", { fn: function (m, a, n) { var t = parseLeadingNumber(m.cstr(a[0], n)); return t ? Number(BigInt.asIntN(32, BigInt(t))) : 0; } });
def("long atol(cchar*)", { fn: function (m, a, n) { var t = parseLeadingNumber(m.cstr(a[0], n)); return t ? BigInt.asIntN(64, BigInt(t)) : 0n; } });
def("llong atoll(cchar*)", { fn: function (m, a, n) { var t = parseLeadingNumber(m.cstr(a[0], n)); return t ? BigInt.asIntN(64, BigInt(t)) : 0n; } });
def("double atof(cchar*)", { fn: function (m, a, n) { var t = parseLeadingNumber(m.cstr(a[0], n), true); return t ? parseFloat(t) : 0; } });
def("long strtol(cchar*, char**, int)", {
  fn: function (m, a, n) {
    var b = m.cstr(a[0], n), base = a[2] || 10, i = 0;
    while (i < b.length && isSpace(b[i])) i++;
    var s = decodeUtf8(b.slice(i));
    var re = base === 16 ? /^[+-]?(0[xX])?[0-9a-fA-F]+/ : base === 8 ? /^[+-]?[0-7]+/ : base === 2 ? /^[+-]?[01]+/ : /^[+-]?\d+/;
    var mm = re.exec(s), v = 0n;
    if (mm) { var t = mm[0].replace(/^([+-]?)0[xX]/, "$1"); var neg = t[0] === "-"; t = t.replace(/^[+-]/, ""); v = BigInt((base === 16 ? "0x" : base === 8 ? "0o" : base === 2 ? "0b" : "") + t); if (neg) v = -v; }
    if (a[1]) m.st(a[1], ptrTo(TY.char), a[0] + (mm ? i + mm[0].length : 0), n);
    return BigInt.asIntN(64, v);
  }
});
def("double strtod(cchar*, char**)", {
  fn: function (m, a, n) {
    var b = m.cstr(a[0], n), i = 0;
    while (i < b.length && isSpace(b[i])) i++;
    var t = parseLeadingNumber(b.slice(i), true);
    if (a[1]) m.st(a[1], ptrTo(TY.char), a[0] + (t ? i + t.length : 0), n);
    return t ? parseFloat(t) : 0;
  }
});
def("int system(cchar*)", {
  fn: function (m, a, n) {
    var cmd = decodeUtf8(m.cstr(a[0], n)).trim().toLowerCase();
    if (cmd === "cls" || cmd === "clear") { m.flush(); if (m.host.onClear) m.host.onClear(); return 0; }
    if (cmd === "pause") return 0;
    m.rtWarn("sys" + cmd, "system(\"" + cmd + "\") wird im Browser nicht ausgeführt", n);
    return -1;
  }
});
def("void qsort(void*, size_t, size_t, void*)", { check: function (n) { this.error("qsort wird hier nicht unterstützt (Funktionszeiger)", n, "Verwende einen eigenen Sortieralgorithmus, z. B. Bubble Sort."); } });

// string.h
def("size_t strlen(cchar*)", { fn: function (m, a, n) { return BigInt(m.cstr(a[0], n).length); } });
def("char* strcpy(char*, cchar*)", {
  fn: function (m, a, n) {
    var b = m.cstr(a[1], n);
    try { writeCStr(m, a[0], b, n); }
    catch (e) { if (e.rterr) throw rterr("strcpy: Der Text (" + b.length + " Zeichen + '\\0') passt nicht in das Ziel-Array", n, "Das Ziel braucht Platz für alle Zeichen plus '\\0'."); throw e; }
    return a[0];
  }
});
def("char* strncpy(char*, cchar*, size_t)", {
  fn: function (m, a, n) {
    var b = m.cstr(a[1], n), k = num(a[2]);
    m.chk(a[0], k, n, true);
    for (var i = 0; i < k; i++) m.u8[a[0] + i] = i < b.length ? b[i] : 0;
    m.init.fill(1, a[0], a[0] + k);
    return a[0];
  }
});
def("char* strcat(char*, cchar*)", {
  fn: function (m, a, n) {
    var d = m.cstr(a[0], n), s = m.cstr(a[1], n);
    try { writeCStr(m, a[0] + d.length, s, n); }
    catch (e) { if (e.rterr) throw rterr("strcat: Das Ziel-Array ist zu klein für beide Texte zusammen (" + (d.length + s.length) + " Zeichen + '\\0')", n); throw e; }
    return a[0];
  }
});
def("char* strncat(char*, cchar*, size_t)", {
  fn: function (m, a, n) { var d = m.cstr(a[0], n), s = m.cstr(a[1], n).slice(0, num(a[2])); writeCStr(m, a[0] + d.length, s, n); return a[0]; }
});
function cmpBytes(x, y, lim) {
  var len = lim == null ? Math.max(x.length, y.length) + 1 : lim;
  for (var i = 0; i < len; i++) {
    var c1 = i < x.length ? x[i] : 0, c2 = i < y.length ? y[i] : 0;
    if (c1 !== c2) return c1 - c2;
    if (c1 === 0) return 0;
  }
  return 0;
}
def("int strcmp(cchar*, cchar*)", { fn: function (m, a, n) { return cmpBytes(m.cstr(a[0], n), m.cstr(a[1], n)); } });
def("int strncmp(cchar*, cchar*, size_t)", { fn: function (m, a, n) { return cmpBytes(m.cstr(a[0], n), m.cstr(a[1], n), num(a[2])); } });
def("char* strchr(cchar*, int)", { fn: function (m, a, n) { var b = m.cstr(a[0], n), c = a[1] & 255; if (c === 0) return a[0] + b.length; var i = b.indexOf(c); return i < 0 ? 0 : a[0] + i; } });
def("char* strrchr(cchar*, int)", { fn: function (m, a, n) { var b = m.cstr(a[0], n), c = a[1] & 255; if (c === 0) return a[0] + b.length; var i = b.lastIndexOf(c); return i < 0 ? 0 : a[0] + i; } });
def("char* strstr(cchar*, cchar*)", {
  fn: function (m, a, n) {
    var h = m.cstr(a[0], n), nd = m.cstr(a[1], n);
    outer: for (var i = 0; i + nd.length <= h.length; i++) { for (var j = 0; j < nd.length; j++) if (h[i + j] !== nd[j]) continue outer; return a[0] + i; }
    return 0;
  }
});
def("size_t strcspn(cchar*, cchar*)", { fn: function (m, a, n) { var s = m.cstr(a[0], n), r = m.cstr(a[1], n), i = 0; while (i < s.length && r.indexOf(s[i]) < 0) i++; return BigInt(i); } });
def("size_t strspn(cchar*, cchar*)", { fn: function (m, a, n) { var s = m.cstr(a[0], n), r = m.cstr(a[1], n), i = 0; while (i < s.length && r.indexOf(s[i]) >= 0) i++; return BigInt(i); } });
def("char* strpbrk(cchar*, cchar*)", { fn: function (m, a, n) { var s = m.cstr(a[0], n), r = m.cstr(a[1], n); for (var i = 0; i < s.length; i++) if (r.indexOf(s[i]) >= 0) return a[0] + i; return 0; } });
def("char* strtok(char*, cchar*)", {
  fn: function (m, a, n) {
    var p = a[0] ? a[0] : m.strtokPos;
    if (!p) return 0;
    var delim = m.cstr(a[1], n), s = m.cstr(p, n), i = 0;
    while (i < s.length && delim.indexOf(s[i]) >= 0) i++;
    if (i >= s.length) { m.strtokPos = 0; return 0; }
    var start = i;
    while (i < s.length && delim.indexOf(s[i]) < 0) i++;
    if (i < s.length) { m.st(p + i, TY.char, 0, n); m.strtokPos = p + i + 1; }
    else m.strtokPos = 0;
    return p + start;
  }
});
def("void* memset(void*, int, size_t)", { fn: function (m, a, n) { var k = num(a[2]); m.chk(a[0], k, n, true); m.u8.fill(a[1] & 255, a[0], a[0] + k); m.init.fill(1, a[0], a[0] + k); return a[0]; } });
def("void* memcpy(void*, cvoid*, size_t)", { fn: function (m, a, n) { var k = num(a[2]); m.chk(a[0], k, n, true); m.chk(a[1], k, n); m.u8.copyWithin(a[0], a[1], a[1] + k); m.init.copyWithin(a[0], a[1], a[1] + k); return a[0]; } });
def("void* memmove(void*, cvoid*, size_t)", { fn: LIB.memcpy.fn });
def("int memcmp(cvoid*, cvoid*, size_t)", { fn: function (m, a, n) { var k = num(a[2]); m.chk(a[0], k, n); m.chk(a[1], k, n); for (var i = 0; i < k; i++) { var d = m.u8[a[0] + i] - m.u8[a[1] + i]; if (d) return d; } return 0; } });

// ctype.h (Rückgabewerte wie glibc)
var CT = [
  ["isalpha", 1024, function (c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }],
  ["isdigit", 2048, function (c) { return c >= 48 && c <= 57; }],
  ["isalnum", 8, function (c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57); }],
  ["isspace", 8192, function (c) { return c === 32 || (c >= 9 && c <= 13); }],
  ["isupper", 256, function (c) { return c >= 65 && c <= 90; }],
  ["islower", 512, function (c) { return c >= 97 && c <= 122; }],
  ["ispunct", 4, function (c) { return c > 32 && c < 127 && !((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57)); }],
  ["isxdigit", 4096, function (c) { return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102); }],
  ["iscntrl", 2, function (c) { return c < 32 || c === 127; }],
  ["isprint", 16384, function (c) { return c >= 32 && c < 127; }],
  ["isgraph", 32768, function (c) { return c > 32 && c < 127; }]
];
CT.forEach(function (e) { def("int " + e[0] + "(int)", { fn: function (m, a) { return e[2](a[0]) ? e[1] : 0; } }); });
def("int toupper(int)", { fn: function (m, a) { var c = a[0]; return c >= 97 && c <= 122 ? c - 32 : c; } });
def("int tolower(int)", { fn: function (m, a) { var c = a[0]; return c >= 65 && c <= 90 ? c + 32 : c; } });

// math.h
[["sqrt", Math.sqrt], ["fabs", Math.abs], ["floor", Math.floor], ["ceil", Math.ceil], ["trunc", Math.trunc],
 ["sin", Math.sin], ["cos", Math.cos], ["tan", Math.tan], ["asin", Math.asin], ["acos", Math.acos], ["atan", Math.atan],
 ["exp", Math.exp], ["log", Math.log], ["log10", Math.log10], ["log2", Math.log2], ["cbrt", Math.cbrt],
 ["sinh", Math.sinh], ["cosh", Math.cosh], ["tanh", Math.tanh],
 ["round", function (x) { return x < 0 ? -Math.round(-x) : Math.round(x); }]
].forEach(function (e) { def("double " + e[0] + "(double)", { fn: function (m, a) { return e[1](a[0]); } }); });
def("double pow(double, double)", { fn: function (m, a) { return Math.pow(a[0], a[1]); } });
def("double atan2(double, double)", { fn: function (m, a) { return Math.atan2(a[0], a[1]); } });
def("double hypot(double, double)", { fn: function (m, a) { return Math.hypot(a[0], a[1]); } });
def("double fmod(double, double)", { fn: function (m, a) { return a[0] % a[1]; } });
def("double fmin(double, double)", { fn: function (m, a) { return Math.min(a[0], a[1]); } });
def("double fmax(double, double)", { fn: function (m, a) { return Math.max(a[0], a[1]); } });
def("long lround(double)", { fn: function (m, a) { var x = a[0]; return BigInt(x < 0 ? -Math.round(-x) : Math.round(x)); } });
def("int isnan(double)", { fn: function (m, a) { return a[0] !== a[0] ? 1 : 0; } });
def("int isinf(double)", { fn: function (m, a) { return a[0] === Infinity ? 1 : a[0] === -Infinity ? -1 : 0; } });

// time.h
def("time_t time(time_t*)", { fn: function (m, a, n) { var t = BigInt(Math.floor(Date.now() / 1000)); if (a[0]) m.st(a[0], TY.long, t, n); return t; } });
def("clock_t clock()", { fn: function (m) { return BigInt(Math.round((nowMs() - (m.t0 || 0)) * 1000)); } });
def("double difftime(time_t, time_t)", { fn: function (m, a) { return Number(a[0] - a[1]); } });
function nowMs() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

// locale.h, assert.h
def("char* setlocale(int, cchar*)", { fn: function () { return 0; } });
def("void assert(int)", {
  fn: function (m, a, n) {
    if (!a[0]) throw rterr("assert fehlgeschlagen: " + m.prog.src.slice(n.args[0].s, n.args[0].e), n);
  }
});
/* =====================================================================
   Teil 6: Schnittstelle – übersetzen, starten, steuern
   ===================================================================== */

function compile(src, opts) {
  opts = opts || {};
  var diags = [], res = { ok: false, diags: diags, program: null };
  try {
    var toks = new Lexer(src, diags).run();
    var pp = preprocess(toks, src, diags);
    var parser = new Parser(pp.toks, src, diags, pp);
    var u = parser.unit();
    if (!diags.some(function (d) { return d.sev === "error"; })) {
      res.program = {
        src: src, fileName: opts.fileName || "programm.c",
        lits: parser.lits, litSize: parser.litSize, globalSize: parser.globalSize, globalInits: parser.globalInits,
        main: u.main, fns: u.fns
      };
      res.ok = true;
    }
  } catch (e) {
    if (e && e.cerr) { if (!diags.some(function (d) { return d.sev === "error" && d.line === e.line && d.col === e.col; })) diags.push(e); }
    else diags.push({ sev: "error", msg: "Interner Fehler beim Übersetzen: " + (e && e.message ? e.message : e), line: 0, col: 0, internal: true, stack: e && e.stack });
  }
  // Fehler zuerst nach Zeile sortiert, danach Warnungen und Hinweise
  var rank = { error: 0, warning: 1, hint: 2 };
  diags.sort(function (a, b) { return (rank[a.sev] - rank[b.sev]) || (a.line - b.line) || (a.col - b.col); });
  return res;
}

function deepErr(m) {
  return rterr("Zu viele Funktionsaufrufe ineinander (Rekursion zu tief, über " + m.depth + " Ebenen)", m.curAt,
    "Endet die Rekursion? Jede rekursive Funktion braucht eine Abbruchbedingung, z. B. if (n <= 1) return 1;");
}

// Startet ein übersetztes Programm in Zeitscheiben, damit die Seite bedienbar bleibt.
// host: onOutput(text, stream), onInput(), onWarn(diag), onClear(), onExit(info)
function start(program, host) {
  var m = new Machine(program, host);
  m.t0 = nowMs();
  var gen = m.main(), state = "running", timer = null;
  var schedule = (function () {
    if (typeof MessageChannel !== "undefined") {
      var ch = new MessageChannel(), pending = false;
      ch.port1.onmessage = function () { pending = false; pump(); };
      return function () { if (!pending) { pending = true; ch.port2.postMessage(0); } };
    }
    return function () { timer = setTimeout(pump, 0); };
  })();
  function finish(info) {
    if (state === "done") return;
    state = "done";
    try { m.flush(); } catch (e) { /* ignorieren */ }
    info.ms = Math.round(nowMs() - m.t0);
    if (host.onExit) host.onExit(info);
  }
  function pump() {
    if (state !== "running") return;
    var t0 = nowMs(), n = 0;
    try {
      for (;;) {
        var r = gen.next();
        if (r.done) { finish({ code: r.value }); return; }
        if (r.value === NEEDIN) { m.flush(); state = "input"; if (host.onInput) host.onInput(); return; }
        if ((++n & 127) === 0 && nowMs() - t0 > 30) { m.flush(); schedule(); return; }
      }
    } catch (e) {
      if (e && e.exit !== undefined) { finish({ code: Number(e.exit) }); return; }
      if (e && e.rterr) { finish({ error: e }); return; }
      if (e instanceof RangeError) { finish({ error: deepErr(m) }); return; }
      finish({ error: { sev: "error", msg: "Interner Fehler: " + (e && e.message ? e.message : e), line: 0, col: 0, internal: true, stack: e && e.stack } });
    }
  }
  schedule();
  return {
    input: function (line) {
      m.giveInput(line + "\n");
      if (state === "input") { state = "running"; schedule(); }
    },
    eof: function () { m.inEof = true; if (state === "input") { state = "running"; schedule(); } },
    stop: function () { if (state !== "done") { if (timer) clearTimeout(timer); finish({ stopped: true }); } },
    state: function () { return state; },
    pendingInput: function () { return m.inBuf.length > m.inPos; }
  };
}

// Für Tests: komplette Eingabe vorab, synchrone Ausführung
function runText(src, input, opts) {
  opts = opts || {};
  var c = compile(src, opts);
  var res = { diags: c.diags, ok: c.ok, out: "", err: "", warnings: [], code: null, error: null };
  if (!c.ok) return res;
  var m = new Machine(c.program, {
    onOutput: function (s, st) { if (st === "err") res.err += s; else res.out += s; },
    onWarn: function (d) { res.warnings.push(d); }
  });
  m.giveInput(input || "");
  m.inEof = true;
  m.t0 = nowMs();
  if (opts.seed != null) m.rand.seed(opts.seed);
  var gen = m.main(), t0 = nowMs(), limit = opts.timeLimit || 10000;
  try {
    for (var n = 0; ; n++) {
      var r = gen.next();
      if (r.done) { res.code = r.value; break; }
      if ((n & 1023) === 0 && nowMs() - t0 > limit) { res.error = { msg: "Zeitlimit" }; break; }
    }
  } catch (e) {
    if (e && e.exit !== undefined) res.code = Number(e.exit);
    else if (e && e.rterr) res.error = e;
    else if (e instanceof RangeError) res.error = deepErr(m);
    else res.error = { msg: "Interner Fehler: " + (e && e.message), stack: e && e.stack, internal: true };
  }
  m.flush();
  return res;
}

// Für die Syntax-Hervorhebung im Editor
var HL_TYPES = {}; "void char short int long float double signed unsigned _Bool bool const static struct union enum typedef extern volatile register auto inline restrict size_t FILE time_t".split(" ").forEach(function (k) { HL_TYPES[k] = true; });
var HL_KW = {}; "if else while do for switch case default break continue return goto sizeof".split(" ").forEach(function (k) { HL_KW[k] = true; });

var API = { compile: compile, start: start, runText: runText, typeStr: typeStr, HL_TYPES: HL_TYPES, HL_KW: HL_KW, LIB_NAMES: Object.keys(LIB), version: "1.0" };
if (typeof module !== "undefined" && module.exports) module.exports = API;
root.CInterp = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
