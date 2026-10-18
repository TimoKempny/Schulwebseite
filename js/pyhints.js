/* ==========================================================
   pyhints.js – übersetzt Python-Fehlermeldungen in eine kurze
   deutsche Erklärung plus Tipp. Wird von python-editor.html
   genutzt. Neue Regeln einfach in REGELN ergänzen:
     re   : Muster, geprüft gegen "Fehlertyp: Meldung"
     de   : Erklärung (Text oder Funktion(match) -> Text)
     tipp : Tipp (Text oder Funktion(match) -> Text, optional)
   Die erste passende Regel gewinnt.
   ========================================================== */

var PyHints = (function () {
  "use strict";

  var INPUT_TIPP = "input() liefert immer Text. Für Zahlen umwandeln: zahl = int(input(\"Zahl: \")) bzw. float(...).";

  var REGELN = [
    /* ---------- Einrückung ---------- */
    { re: /^IndentationError: expected an indented block/,
      de: "Nach einer Zeile mit Doppelpunkt fehlt der eingerückte Block.",
      tipp: "Die Zeilen, die zu if, for, while oder def gehören, mit 4 Leerzeichen einrücken (Tab-Taste)." },
    { re: /^IndentationError: unexpected indent/,
      de: "Diese Zeile ist eingerückt, obwohl davor kein Block mit Doppelpunkt beginnt.",
      tipp: "Einrückung entfernen (Umschalt+Tab) oder prüfen, ob in der Zeile davor ein Doppelpunkt fehlt." },
    { re: /unindent does not match any outer indentation level/,
      de: "Die Einrückung passt zu keiner der äußeren Ebenen.",
      tipp: "Zeilen auf derselben Ebene brauchen genau gleich viele Leerzeichen – am besten immer Vielfache von 4." },
    { re: /^TabError/,
      de: "Tabs und Leerzeichen sind in der Einrückung gemischt.",
      tipp: "Einrückung der Zeile löschen und mit der Tab-Taste neu setzen (der Editor nutzt 4 Leerzeichen)." },

    /* ---------- Syntax ---------- */
    { re: /expected ':'/,
      de: "Hier fehlt ein Doppelpunkt.",
      tipp: "Zeilen mit if, elif, else, for, while, def, class, try und except enden mit einem Doppelpunkt." },
    { re: /unterminated (triple-quoted )?string literal/,
      de: "Ein Text (String) wird geöffnet, aber nicht geschlossen.",
      tipp: "Jedes Anführungszeichen braucht ein Gegenstück: \"Text\" oder 'Text'." },
    { re: /'([(\[{])' was never closed/,
      de: function (m) { return "Die Klammer " + m[1] + " wird geöffnet, aber nie geschlossen."; },
      tipp: "Zu jeder ( [ { gehört eine ) ] }. Zählen hilft – besonders bei print(int(input(...)))." },
    { re: /unmatched '([)\]}])'/,
      de: function (m) { return "Hier steht eine schließende Klammer " + m[1] + " zu viel."; },
      tipp: "Klammern paarweise prüfen: Wo wurde sie geöffnet?" },
    { re: /closing parenthesis '(.)' does not match opening parenthesis '(.)'/,
      de: function (m) { return "Die Klammern passen nicht zusammen: " + m[2] + " wird mit " + m[1] + " geschlossen."; },
      tipp: "( gehört zu ), [ zu ] und { zu }." },
    { re: /Missing parentheses in call to 'print'/,
      de: "print braucht Klammern.",
      tipp: "So geht's in Python 3: print(\"Hallo\")" },
    { re: /Maybe you meant '==' or ':=' instead of '='/,
      de: "Hier steht = (Zuweisung), gemeint ist wahrscheinlich ein Vergleich.",
      tipp: "Vergleichen mit ==, zuweisen mit =. Beispiel: if x == 5:" },
    { re: /cannot assign to (literal|expression|function call)/,
      de: "Links vom = muss ein Variablenname stehen.",
      tipp: "Richtig: ergebnis = a + b – nicht a + b = ergebnis. Für Vergleiche == verwenden." },
    { re: /Perhaps you forgot a comma/,
      de: "Zwischen zwei Werten fehlt vermutlich ein Komma.",
      tipp: "Beispiel: print(\"Summe:\", summe) – Text und Variable mit Komma trennen." },
    { re: /invalid character '(.)'/,
      de: function (m) { return "Das Zeichen " + m[1] + " ist im Code nicht erlaubt."; },
      tipp: "Oft sind es typografische Anführungszeichen („ “ ‚ ‘) aus Word oder dem Internet. Durch \" bzw. ' ersetzen." },
    { re: /invalid decimal literal/,
      de: "Ungültige Zahl – oder ein Name, der mit einer Ziffer beginnt.",
      tipp: "Variablennamen dürfen nicht mit einer Ziffer anfangen (zahl1 statt 1zahl). Kommazahlen mit Punkt: 3.5" },
    { re: /'return' outside function/,
      de: "return steht außerhalb einer Funktion.",
      tipp: "return gibt es nur innerhalb von def. Einrückung prüfen." },
    { re: /'break' outside loop|'continue' not properly in loop/,
      de: "break bzw. continue steht außerhalb einer Schleife.",
      tipp: "Beides geht nur innerhalb von for oder while. Einrückung prüfen." },
    { re: /expected 'except' or 'finally' block/,
      de: "Nach try: fehlt ein except- oder finally-Block.",
      tipp: "Aufbau: try: … except ValueError: …" },
    { re: /f-string/,
      de: "Im f-String stimmt etwas nicht.",
      tipp: "Ausdrücke stehen in geschweiften Klammern: f\"Hallo {name}\". Innen andere Anführungszeichen als außen verwenden." },
    { re: /^SyntaxError: invalid syntax/,
      de: "Python versteht diese Stelle nicht.",
      tipp: "Doppelpunkte, Klammern, Anführungszeichen und Schreibweise prüfen. Manchmal steckt der Fehler in der Zeile davor." },
    { re: /^SyntaxError/,
      de: "Syntaxfehler: So ist die Zeile in Python nicht erlaubt.",
      tipp: "Die englische Meldung oben zeigt mit ^ auf die Stelle." },

    /* ---------- Namen ---------- */
    { re: /^NameError: name '(true|false|none|null)' is not defined/,
      de: function (m) { return "„" + m[1] + "“ gibt es in Python nicht."; },
      tipp: function (m) { return "In Python schreibt man " + ({ "true": "True", "false": "False" }[m[1]] || "None") + " – mit großem Anfangsbuchstaben."; } },
    { re: /^NameError: name '(\w+)' is not defined(?:\. Did you mean: '(\w+)'\?)?/,
      de: function (m) { return "Den Namen „" + m[1] + "“ kennt Python an dieser Stelle (noch) nicht."; },
      tipp: function (m) {
        if (m[2]) return "Meintest du „" + m[2] + "“? Auf Tippfehler und Groß-/Kleinschreibung achten.";
        return "Tippfehler? Groß-/Kleinschreibung? Bekommt die Variable vorher einen Wert? Soll es Text sein, gehört er in Anführungszeichen.";
      } },
    { re: /^UnboundLocalError: cannot access local variable '(\w+)'/,
      de: function (m) { return "Die Variable „" + m[1] + "“ wird in der Funktion benutzt, bevor sie dort einen Wert bekommt."; },
      tipp: "Wert als Parameter an die Funktion übergeben – oder die Variable in der Funktion zuerst zuweisen." },

    /* ---------- Typen ---------- */
    { re: /can only concatenate str \(not "(\w+)"\) to str/,
      de: function (m) { return "Text und " + (m[1] === "int" ? "ganze Zahl" : m[1] === "float" ? "Kommazahl" : m[1]) + " lassen sich nicht mit + verbinden."; },
      tipp: "Rechnen? input() liefert Text – erst umwandeln: int(...) bzw. float(...). Text ausgeben? str(zahl), f\"Alter: {alter}\" oder print(\"Alter:\", alter)." },
    { re: /unsupported operand type\(s\) for (\S+): '(str|int|float)' and '(str|int|float)'/,
      de: function (m) { return "Mit " + m[1] + " kann man " + m[2] + " und " + m[3] + " nicht verrechnen."; },
      tipp: function (m) { return (m[2] === "str" || m[3] === "str") ? INPUT_TIPP : "Datentypen der beiden Werte prüfen."; } },
    { re: /unsupported operand type\(s\) for (\S+): 'NoneType'|'NoneType' object/,
      de: "Ein Wert ist None – also „nichts“.",
      tipp: "Häufig gibt eine Funktion nichts zurück, weil return fehlt. Oder: liste = liste.sort() – sort() gibt None zurück." },
    { re: /'(<|>|<=|>=)' not supported between instances of '(\w+)' and '(\w+)'/,
      de: function (m) { return "Werte vom Typ " + m[2] + " und " + m[3] + " lassen sich nicht mit " + m[1] + " vergleichen."; },
      tipp: INPUT_TIPP },
    { re: /'(\w+)' object is not callable/,
      de: function (m) { return "Hier wird ein Wert vom Typ " + m[1] + " wie eine Funktion aufgerufen."; },
      tipp: "Wurde ein Funktionsname (print, input, sum, max …) als Variable überschrieben? Oder fehlt ein Rechenzeichen: 2*(3+4) statt 2(3+4)?" },
    { re: /'(\w+)' object is not subscriptable/,
      de: function (m) { return "Auf einen Wert vom Typ " + m[1] + " kann man nicht mit [ ] zugreifen."; },
      tipp: "[ ] funktioniert bei Listen, Strings und Dictionaries. Funktionen ruft man mit ( ) auf." },
    { re: /'(int|float)' object is not iterable/,
      de: "Über eine Zahl kann man nicht mit for laufen.",
      tipp: "Zählschleife mit range: for i in range(n):" },
    { re: /'(\w+)' object is not iterable/,
      de: function (m) { return "Über einen Wert vom Typ " + m[1] + " kann man nicht mit for laufen."; } },
    { re: /takes (\d+) positional arguments? but (\d+) (?:were|was) given|missing (\d+) required positional argument/,
      de: "Die Funktion wird mit der falschen Anzahl von Argumenten aufgerufen.",
      tipp: "Aufruf mit der def-Zeile vergleichen. Bei Methoden in Klassen zählt self mit." },
    { re: /'str' object does not support item assignment/,
      de: "Einzelne Zeichen eines Strings kann man nicht ändern.",
      tipp: "Strings sind unveränderlich. Einen neuen String bauen, z. B. mit + oder .replace()." },
    { re: /indices must be integers or slices, not (\w+)/,
      de: function (m) { return "Ein Index muss eine ganze Zahl sein, nicht " + m[1] + "."; },
      tipp: "Mit int(...) umwandeln. Beim Teilen // statt / verwenden, dann bleibt es eine ganze Zahl." },
    { re: /'float' object cannot be interpreted as an integer/,
      de: "Hier wird eine ganze Zahl erwartet, aber eine Kommazahl übergeben.",
      tipp: "range() braucht ganze Zahlen: int(x) oder // statt / verwenden." },

    /* ---------- Werte ---------- */
    { re: /invalid literal for int\(\) with base 10: '(.*)'/,
      de: function (m) { return m[1] === "" ? "Die Eingabe war leer – daraus wird keine Zahl." : "Der Text „" + m[1] + "“ lässt sich nicht in eine ganze Zahl umwandeln."; },
      tipp: "Nur Ziffern eingeben. Für Kommazahlen float() verwenden – mit Punkt statt Komma (3.5)." },
    { re: /could not convert string to float: '(.*)'/,
      de: function (m) { return "Der Text „" + m[1] + "“ lässt sich nicht in eine Kommazahl umwandeln."; },
      tipp: "Dezimalpunkt statt Komma eingeben: 3.5 statt 3,5." },
    { re: /math domain error/,
      de: "Die mathematische Funktion ist für diesen Wert nicht definiert.",
      tipp: "Zum Beispiel math.sqrt() einer negativen Zahl oder math.log(0)." },
    { re: /too many values to unpack|not enough values to unpack/,
      de: "Die Anzahl der Variablen links passt nicht zur Anzahl der Werte rechts.",
      tipp: "Beispiel: a, b = 1, 2 – links und rechts gleich viele." },
    { re: /^ZeroDivisionError/,
      de: "Division durch 0.",
      tipp: "Vor dem Teilen prüfen: if teiler != 0:" },
    { re: /^IndexError: (list|string|tuple) index out of range/,
      de: function (m) { return "Der Index liegt außerhalb " + ({ list: "der Liste", string: "des Strings", tuple: "des Tupels" }[m[1]]) + "."; },
      tipp: "Gültig sind die Indizes 0 bis len(...)-1. Bei Schleifen: for i in range(len(liste))." },
    { re: /pop from empty list/,
      de: "pop() auf eine leere Liste.",
      tipp: "Vorher prüfen: if liste:" },
    { re: /^KeyError: (.*)/,
      de: function (m) { return "Den Schlüssel " + m[1] + " gibt es im Dictionary nicht."; },
      tipp: "Mit if schluessel in d: prüfen oder d.get(schluessel) verwenden." },
    { re: /^AttributeError: '(\w+)' object has no attribute '(\w+)'/,
      de: function (m) { return "Ein Wert vom Typ " + m[1] + " hat keine Methode oder Eigenschaft „" + m[2] + "“."; },
      tipp: "Tippfehler? Beispiele: liste.append(x), text.upper(), text.split()." },
    { re: /^RecursionError/,
      de: "Die Funktion ruft sich (fast) endlos selbst auf.",
      tipp: "Abbruchbedingung (Basisfall) prüfen: Wird sie irgendwann erreicht?" },
    { re: /^ModuleNotFoundError: No module named '(\w+)/,
      de: function (m) { return "Das Modul „" + m[1] + "“ gibt es in diesem Browser-Editor nicht."; },
      tipp: "Verfügbar ist die Standardbibliothek (math, random, time, datetime …). Grafik (turtle, tkinter) und Zusatzpakete (numpy, pygame) gehen hier nicht." },
    { re: /^ImportError/,
      de: "Der Import hat nicht geklappt.",
      tipp: "Schreibweise von Modul und Funktion prüfen, z. B. from math import sqrt." },
    { re: /input\(\) ist in diesem Browserfenster nicht verfügbar/,
      de: "Eingaben mit input() sind in diesem Fenster nicht möglich.",
      tipp: "Die Seite in einem normalen (nicht privaten) Fenster öffnen und einmal neu laden." },
    { re: /^EOFError/,
      de: "Es kam keine Eingabe mehr (Eingabe beendet).",
      tipp: "input() wartet auf eine Zeile. Mit try/except EOFError lässt sich das abfangen." },
    { re: /^AssertionError/,
      de: "Eine assert-Bedingung war falsch." },
    { re: /^OverflowError/,
      de: "Die Zahl ist zu groß für diese Rechnung." },
    { re: /^MemoryError/,
      de: "Der Speicher reicht nicht – vermutlich wächst eine Liste oder ein String endlos." },
    { re: /^ValueError/,
      de: "Der Wert passt nicht zu dieser Funktion." },
    { re: /^TypeError/,
      de: "Der Datentyp passt hier nicht." }
  ];

  function wert(x, m) { return typeof x === "function" ? x(m) : x; }

  function erklaere(typ, meldung) {
    var text = typ + ": " + meldung;
    for (var i = 0; i < REGELN.length; i++) {
      var m = REGELN[i].re.exec(text);
      if (m) return { de: wert(REGELN[i].de, m), tipp: REGELN[i].tipp ? wert(REGELN[i].tipp, m) : "" };
    }
    return { de: "Python meldet einen Fehler vom Typ " + typ + " (Details oben).", tipp: "" };
  }

  return { erklaere: erklaere };
})();
