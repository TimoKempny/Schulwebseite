/* ==========================================================
   links.js – HIER neue Kacheln eintragen.
   Nur diese Datei muss für neue Tools/Seiten geändert werden.

   Felder pro Eintrag:
     typ          "tool" | "skript" | "quiz" | "link"   (Pflicht)
     titel        Text auf der Kachel                   (Pflicht)
     url          Pfad zur Seite (z. B. "tools/timer.html")
                  oder volle Adresse ("https://...")    (Pflicht)
     beschreibung kurzer Satz                           (optional)
     fach         z. B. "Informatik" oder "Englisch"    (optional)
     klassen      Liste, z. B. ["2BKI1", "E1FI"]        (optional)
     neu          true = "neu"-Markierung               (optional)

   Hinweis: Nach jedem Eintrag ein Komma.
   ========================================================== */

const TYPEN = [
  { id: "tool",   titel: "Tools" },
  { id: "skript", titel: "Skripte" },
  { id: "quiz",   titel: "Quizze & Übungen" },
  { id: "materialien", titel: "Materialien" },
  { id: "link",   titel: "Links" }
];

const EINTRAEGE = [
  // ---------- Beispiele – ersetzen oder löschen ----------
  {
    typ: "tool",
    titel: "Struktogramme erstellen",
    beschreibung: "Tool um per Drap&Drop Struktogramme zu erstellen.",
    url: "struktogramm.html",
    fach: "Informatik"
  },
  {
    typ: "tool",
    titel: "RGB & Hex Colorpicker",
    beschreibung: "Farbe raussuchen und Hexcode und RGB bekommen",
    url: "farbwaehler.html",
    fach: "Informatik"
  },
  {
    typ: "tool",
    titel: "C-Compiler",
    beschreibung: "C Programme im Browser schreiben und compilieren",
    url: "c-editor.html",
    fach: "Prog"
  },
  {
    typ: "tool",
    titel: "Python-Editor",
    beschreibung: "Python-Programme im Browser schreiben und ausführen – mit input() und Fehlertipps",
    url: "python-editor.html",
    fach: "SAE",
    neu: true
  },
  {
    typ: "tool",
    titel: "Das Netz der Netze",
    beschreibung: "Vom weltweiten Internet bis ins Schulnetz hineinzoomen und den Weg eines Datenpakets verfolgen",
    url: "netzkarte.html",
    fach: "ITS",
    neu: true
  },
  {
    typ: "tool",
    titel: "Was passiert beim Aufruf einer Webseite?",
    beschreibung: "Schritt für Schritt vom Browser über Schulnetz und Internet bis zum Webserver – mit DNS, TCP, TLS und HTTP",
    url: "webseitenaufruf.html",
    fach: "ITS",
    neu: true
  },
  {
    typ: "tool",
    titel: "PDF-Editor",
    beschreibung: "PDFs zusammenfügen, teilen, ordnen, schützen, unterschreiben und schwärzen – alles im Browser",
    url: "pdf-editor.html",
    fach: "Allgemein",
    neu: true
  },
  {
    typ: "tool",
    titel: "Binär <-> Dezimal",
    beschreibung: "Umrechnung Binär <-> Dezimal lernen und üben",
    url: "binaer.html",
    fach: "Allgemein"
  },
  {
    typ: "tool",
    titel: "Hexadezimal & Oktal",
    beschreibung: "Hex und Oktal verstehen, umrechnen von/nach Dezimal und Binär, üben",
    url: "hexoktal.html",
    fach: "Allgemein",
    neu: true
  },
  {
    typ: "tool",
    titel: "IPv4 & Subnetze",
    beschreibung: "IP-Adressen, Subnetzmasken und Subnetting verstehen und üben",
    url: "ipv4.html",
    fach: "ITS",
    neu: true
  },
  {
    typ: "link",
    titel: "Moodle",
    beschreibung: "Kursräume, Aufgaben und Tests.",
    url: "https://moodle.steinbeis.schule/my/",
    fach: "Allgemein"
  },
	{
    typ: "link",
    titel: "Schul Webseite",
    beschreibung: "Allgemeine Informationen der Schule",
    url: "https://www.steinbeis.schule/de/home.html",
    fach: "Allgemein"
  }, 
	{
    typ: "link",
    titel: "CSS-Validator",
    beschreibung: "CSS Validation Service",
    url: "https://jigsaw.w3.org/css-validator/",
    fach: "Kom1"
  },
  {
    typ: "link",
    titel: "HTML-Validator",
    beschreibung: "Markup Validation Service",
    url: "https://validator.w3.org/",
    fach: "Kom1"
  },
  {
    typ: "materialien",
    titel: "CSS Merkhilfe",
    beschreibung: "Merkhilfe für CSS",
    url: "css.html",
    fach: "Kom1"
  },
  {
    typ: "materialien",
    titel: "HTML Merkhilfe",
    beschreibung: "Merkhilfe für HTML",
    url: "html.html",
    fach: "Kom1"
  }
];
