/* ==========================================================
   webseitenaufruf.js – Logik für webseitenaufruf.html
   Inhalte stehen in KNOTEN, LINKS und ABLAUF (je Detailstufe).
   Alles ist eine vereinfachte Veranschaulichung mit Beispieladressen.
   ========================================================== */

(function () {
  "use strict";

  /* ==========================================================
     Netz
     Knoten mit x/y im Bild 1000 × 460
       ab    nur ab dieser Detailstufe sichtbar
       lp    l = Beschriftung links statt unter dem Symbol
     Leitungen: [von, nach, typ, Laufzeit in ms]
       typ   lan | glas | inet (über das Internet, vereinfacht)
     ========================================================== */

  const ADR = {
    pcIp: "10.20.12.21", pcMac: "3c:52:82:4f:1a:07",
    gwIp: "10.20.0.1", gwMac: "00:1f:3a:00:00:01", wanIp: "203.0.113.10",
    dnsIp: "198.51.100.53", webIp: "192.0.2.80",
    host: "www.beispiel-schule.de"
  };

  const KNOTEN = {
    pc: { name: "Dein PC", sub: ADR.pcIp, x: 70, y: 330, icon: "pc",
      info: "Dein Computer. Der Browser schickt die Anfragen los und baut aus den Antworten die Webseite zusammen." },
    switch: { name: "Switch", sub: "Schulnetz", x: 178, y: 330, icon: "switch",
      info: "Verbindet die Geräte im Schulnetz. Er liest die MAC-Adresse im Paket und gibt es nur an dem Anschluss aus, an dem das Zielgerät hängt." },
    router: { name: "Router", sub: ADR.gwIp, x: 288, y: 330, icon: "router",
      info: "Das Tor zum Internet (Gateway). Er verteilt per DHCP IP-Adressen, tauscht private gegen die öffentliche Adresse " + ADR.wanIp + " (NAT) und filtert als Firewall." },
    isp: { name: "Provider", sub: "Zugangsnetz", x: 428, y: 330, icon: "router",
      info: "Router des Internetanbieters. Hier kommen die Leitungen vieler Kunden an und gehen ins Netz des Providers über." },
    ixp: { name: "Internetknoten", sub: "z. B. DE-CIX", x: 588, y: 330, icon: "ixp",
      info: "Hier tauschen viele Netze Daten aus. Unterwegs passiert ein Paket meist 10 bis 20 solcher Router und Knoten – hier vereinfacht nur einer." },
    rz: { name: "Router", sub: "Rechenzentrum", x: 750, y: 330, icon: "router",
      info: "Router am Eingang des Rechenzentrums, in dem der Webserver steht." },
    web: { name: "Webserver", sub: ADR.webIp, x: 910, y: 330, icon: "server",
      info: "Auf diesem Server liegt " + ADR.host + ": die HTML-Datei, das Stylesheet style.css und das Logo logo.svg." },
    dns: { name: "DNS-Server", sub: ADR.dnsIp, x: 428, y: 150, icon: "buch", lp: "l",
      info: "Das „Telefonbuch“ des Internets: Er übersetzt Namen wie " + ADR.host + " in IP-Adressen. Meist betreibt ihn der Provider." },
    root: { name: "Root-DNS", sub: "198.41.0.4", x: 588, y: 62, icon: "server", ab: "ausfuehrlich",
      info: "Einer der 13 Root-Nameserver (mit vielen Kopien weltweit). Er kennt keine Webseiten, aber er weiß, wer für .de, .com, .org usw. zuständig ist." },
    tld: { name: ".de-DNS", sub: "194.0.0.53", x: 750, y: 62, icon: "server", ab: "ausfuehrlich",
      info: "Nameserver der DENIC für alle .de-Adressen. Er weiß, welcher Nameserver für beispiel-schule.de zuständig ist." },
    auth: { name: "Nameserver", sub: "beispiel-schule.de", x: 910, y: 175, icon: "server", ab: "ausfuehrlich",
      info: "Der zuständige Nameserver für beispiel-schule.de (beim Hoster im Rechenzentrum). Nur er kennt die IP-Adresse von www.beispiel-schule.de verbindlich." }
  };

  const LINKS = [
    ["pc", "switch", "lan", 0.1],
    ["switch", "router", "lan", 0.1],
    ["router", "isp", "glas", 1.5],
    ["isp", "dns", "glas", 1],
    ["isp", "ixp", "glas", 3],
    ["ixp", "rz", "glas", 4.5],
    ["rz", "web", "lan", 0.2],
    ["dns", "root", "inet", 7],
    ["dns", "tld", "inet", 6],
    ["dns", "auth", "inet", 9]
  ];

  const ZONEN = [
    { text: "Schulnetz (LAN)", x: 15, y: 245, w: 330, h: 195 },
    { text: "Internet", x: 358, y: 18, w: 466, h: 422 },
    { text: "Rechenzentrum", x: 836, y: 100, w: 150, h: 340, ab: "ausfuehrlich" },
    { text: "Rechenzentrum", x: 836, y: 245, w: 150, h: 195, bis: "mittel" }
  ];

  const ICONS = {
    pc: "M3 4h18v12H3zM8 20h8M12 16v4",
    switch: "M2 8h20v8H2zM5 12h1.5M8.5 12H10M12 12h1.5M15.5 12H17M19 12h.01",
    router: "M3 13h18v7H3zM7 13V8M17 13V8M7 16.5h.01M11 16.5h.01M5 6a3 3 0 0 1 4 0M15 6a3 3 0 0 1 4 0",
    server: "M5 3h14v6H5zM5 11h14v6H5zM8 6h.01M8 14h.01M5 20h14",
    ixp: "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v7M12 15v7M2 12h7M15 12h7",
    buch: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6"
  };

  const STUFEN = [
    { id: "einfach", titel: "einfach" },
    { id: "mittel", titel: "mittel" },
    { id: "ausfuehrlich", titel: "ausführlich" }
  ];
  const STUFEN_NR = { einfach: 0, mittel: 1, ausfuehrlich: 2 };

  const PROTO_TEXT = {
    DHCP: "DHCP – Adressvergabe", ARP: "ARP – MAC-Adresse suchen", DNS: "DNS – Namensauflösung",
    TCP: "TCP – Verbindung", TLS: "TLS – Verschlüsselung", HTTP: "HTTP – Webseite"
  };

  /* ==========================================================
     Pakete
     von, nach   Knoten (Weg wird automatisch gesucht)
     proto       DHCP | ARP | DNS | TCP | TLS | HTTP
     label       kurze Aufschrift im Netzbild
     info        Zeile in der Paketliste
     inhalt      Text in der aufgeklappten Ansicht
     transport   { p: "UDP"|"TCP", sp, dp, flags, seq, ack }
     krypto      true = Inhalt ist mit TLS verschlüsselt
     nat         Sprechblase am Router, wenn das Paket ihn passiert
     notiz       Sprechblase am Ziel bei Ankunft
     warte       ms Bearbeitungszeit vor dem Absenden
     browser     neuer Zustand des Browsers bei Ankunft
     sicher      true = ab jetzt Schloss in der Adressleiste
     datei       Eintrag in den Entwicklertools bei Ankunft
     ========================================================== */

  const HTML_TEXT = `<!doctype html>
<html lang="de">
<head>
  <title>Beispiel-Schule</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <img src="logo.svg" alt="Logo">
    <p>Beispiel-Schule</p>
    <nav>…</nav>
  </header>
  <main>
    <h1>Willkommen an der Beispiel-Schule</h1>
    …
  </main>
</body>
</html>`;

  const tcp = (sp, dp, flags, seq, ack) => ({ p: "TCP", sp, dp, flags, seq, ack });
  const udp = (sp, dp) => ({ p: "UDP", sp, dp });
  const zumWeb = (flags, seq, ack) => tcp(51234, 443, flags, seq, ack);
  const vomWeb = (flags, seq, ack) => tcp(443, 51234, flags, seq, ack);
  // Sequenznummern (relativ) für die HTTP-Pakete: [PC→Server, Server→PC]
  const SEQ = { "/": [[600, 2890], [2890, 1000]], "/style.css": [[1000, 4420], [4420, 1400]], "/logo.svg": [[1400, 6630], [6630, 1800]] };

  const P = {
    dnsFrage: (extra) => ({ von: "pc", nach: "dns", proto: "DNS", label: "DNS ?",
      info: "Welche IP hat " + ADR.host + "?", transport: udp(50123, 53),
      inhalt: "Frage (Query), ID 0x3f2a\nName: " + ADR.host + "\nTyp:  A (IPv4-Adresse)", ...extra }),
    dnsAntwort: (extra) => ({ von: "dns", nach: "pc", proto: "DNS", label: "DNS ✓",
      info: ADR.host + " → " + ADR.webIp, transport: udp(53, 50123), warte: 0.5,
      inhalt: "Antwort (Response), ID 0x3f2a\nName: " + ADR.host + "\nTyp:  A\nIP:   " + ADR.webIp + "\nTTL:  3600 s (so lange darf sich der PC die Antwort merken)", ...extra }),
    get: (pfad, extra) => ({ von: "pc", nach: "web", proto: "HTTP", label: "GET " + (pfad === "/" ? "/" : pfad.replace("/", "")),
      info: "GET " + pfad + " HTTP/1.1", krypto: true, transport: zumWeb("PSH, ACK", ...SEQ[pfad][0]),
      inhalt: "GET " + pfad + " HTTP/1.1\nHost: " + ADR.host + "\nUser-Agent: Mozilla/5.0 (Windows NT 10.0) Firefox/131.0\nAccept: " +
        (pfad === "/" ? "text/html" : pfad.endsWith(".css") ? "text/css" : "image/svg+xml") + "\nAccept-Language: de-DE", ...extra }),
    antwort: (datei, typ, groesse, inhalt, extra) => ({ von: "web", nach: "pc", proto: "HTTP", label: datei === "index.html" ? "200 OK" : datei.split(".")[1].toUpperCase(),
      info: "HTTP/1.1 200 OK (" + typ + ")", krypto: true, warte: datei === "index.html" ? 4 : 1,
      transport: vomWeb("PSH, ACK", ...SEQ[datei === "index.html" ? "/" : "/" + datei][1]),
      inhalt: "HTTP/1.1 200 OK\nContent-Type: " + typ + "\nContent-Length: " + groesse + "\n\n" + inhalt, ...extra })
  };

  const CSS_TEXT = "body { font-family: system-ui, sans-serif; background: #f8fafc; }\nheader { display: flex; background: #1d4ed8; color: white; }\nh1 { font-size: 1.35rem; }\n…";
  const SVG_TEXT = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\">\n  <path d=\"M4 26V12l12-8 12 8v14…\"/>\n</svg>";

  /* ---------- Ablauf je Detailstufe ---------- */
  // Schritt: titel, text (HTML oder Funktion(zustand)), tippen, start, browserStart, browser (Ende), pakete
  const ABLAUF = {
    einfach: [
      { titel: "Adresse eingeben", tippen: true, start: true, browser: "eingegeben",
        text: `<p>Du tippst <code>${ADR.host}</code> in die Adressleiste und drückst Enter.</p>
<p>Im Internet findet man Computer aber nicht über Namen, sondern über <b>IP-Adressen</b> – so wie man einen Brief nur mit Anschrift verschicken kann. Dein Computer muss also zuerst herausfinden, welche IP-Adresse der Server mit diesem Namen hat.</p>` },
      { titel: "Nach der IP-Adresse fragen (DNS)", browserStart: "dns", browser: "dns",
        text: `<p>Dein Computer fragt den <b>DNS-Server</b>: „Welche IP-Adresse hat ${ADR.host}?“ Der DNS-Server ist wie ein Telefonbuch des Internets. Er antwortet: <code>${ADR.webIp}</code>.</p>
<p>Schau rechts: Die Frage läuft vom PC über den <b>Switch</b> im Schulnetz zum <b>Router</b>, der das Schulnetz mit dem Internet verbindet, und von dort zum DNS-Server beim Internetanbieter.</p>`,
        pakete: [P.dnsFrage(), P.dnsAntwort()] },
      { titel: "Die Webseite anfordern", browserStart: "warte", browser: "warte",
        text: `<p>Jetzt kennt dein Computer die Adresse und schickt eine <b>Anfrage</b> an den Webserver: „Bitte schick mir die Startseite!“</p>
<p>Das Paket reist über Switch und Router ins Internet, über einen großen <b>Internetknoten</b> bis ins <b>Rechenzentrum</b>, in dem der Webserver steht. Jeder Router unterwegs schaut auf die Ziel-IP-Adresse und schickt das Paket in die richtige Richtung weiter.</p>`,
        pakete: [P.get("/")] },
      { titel: "Der Server schickt die Seite", browser: "fertig",
        text: `<p>Der Webserver findet die Seite und schickt sie als <b>Antwort</b> zurück: den Text der Seite (HTML), die Gestaltung (CSS) und die Bilder. Der Browser setzt alles zusammen und zeigt die fertige Seite an.</p>
<p>In Wirklichkeit sind das mehrere Dateien und viele kleine Pakete – hier vereinfacht als ein Paket. Mehr Details siehst du in der Stufe <b>mittel</b>.</p>`,
        pakete: [P.antwort("index.html", "text/html", 1532, "<!doctype html> … die ganze Seite mit Text, Gestaltung und Bildern …", { browser: "fertig", fertig: true })] },
      { titel: "Fertig!", browser: "fertig",
        text: z => `<p>Vom Enter-Drücken bis zur fertigen Seite vergingen in diesem Beispiel etwa <b>${ms(z.tFertig - z.t0)}</b>. Zusammengefasst:</p>
<ul>
  <li><b>DNS:</b> Namen in IP-Adresse übersetzen.</li>
  <li><b>Anfrage:</b> Der Browser bittet den Webserver um die Seite.</li>
  <li><b>Antwort:</b> Der Server schickt die Seite, der Browser zeigt sie an.</li>
</ul>
<p>Unterwegs helfen Switch (im Schulnetz), Router (zwischen den Netzen) und viele weitere Router im Internet.</p>` }
    ],

    mittel: [
      { titel: "Adresse eingeben", tippen: true, start: true, browser: "eingegeben",
        text: `<p>Du tippst <code>${ADR.host}</code> ein und drückst Enter. Der Browser ergänzt <code>https://</code> – er will also eine <b>verschlüsselte</b> Verbindung.</p>
<p>Bevor er loslegen kann, braucht er die <b>IP-Adresse</b> des Servers. Seine eigene Adresse (<code>${ADR.pcIp}</code>), den Router und den DNS-Server kennt der PC schon – das hat er beim Einschalten automatisch per <b>DHCP</b> bekommen.</p>` },
      { titel: "DNS: Name → IP-Adresse", browserStart: "dns", browser: "dns",
        text: `<p>Der PC schickt eine <b>DNS-Anfrage</b> an den DNS-Server: „Welche IP-Adresse (Typ A) hat ${ADR.host}?“ Die Antwort: <code>${ADR.webIp}</code>.</p>
<p>DNS nutzt <b>UDP</b> und den <b>Port 53</b>. UDP ist schnell, weil vorher keine Verbindung aufgebaut wird – für eine kurze Frage reicht das. Geht ein Paket verloren, fragt der PC einfach noch einmal.</p>
<p>Beim Router fällt etwas auf: Im Schulnetz hat der PC eine <b>private</b> Adresse (10.x.x.x). Der Router tauscht sie gegen die <b>öffentliche</b> Adresse der Schule aus (<b>NAT</b>). Klicke unten in der Paketliste auf ein Paket, um das zu sehen.</p>`,
        pakete: [P.dnsFrage({ nat: "NAT: Absender " + ADR.pcIp + " wird zu " + ADR.wanIp }), P.dnsAntwort()] },
      { titel: "TCP-Verbindung aufbauen", browserStart: "verbinde", browser: "verbinde",
        text: `<p>Für die Webseite braucht der Browser eine <b>zuverlässige</b> Verbindung. Dafür gibt es <b>TCP</b>: Es nummeriert die Pakete, prüft, ob alles angekommen ist, und schickt Verlorenes neu.</p>
<p>Zuerst wird die Verbindung mit dem <b>Drei-Wege-Handschlag</b> aufgebaut:</p>
<ul>
  <li><b>SYN</b> – PC: „Ich möchte eine Verbindung.“</li>
  <li><b>SYN-ACK</b> – Server: „In Ordnung, ich auch.“</li>
  <li><b>ACK</b> – PC: „Bestätigt, los geht's.“</li>
</ul>
<p>Ziel ist <b>Port 443</b> – dort wartet der Webserver auf HTTPS-Verbindungen.</p>`,
        pakete: [
          { von: "pc", nach: "web", proto: "TCP", label: "SYN", info: "SYN – Verbindungswunsch", transport: zumWeb("SYN", 0) },
          { von: "web", nach: "pc", proto: "TCP", label: "SYN-ACK", info: "SYN, ACK – Zustimmung", transport: vomWeb("SYN, ACK", 0, 1), warte: 0.2 },
          { von: "pc", nach: "web", proto: "TCP", label: "ACK", info: "ACK – Verbindung steht", transport: zumWeb("ACK", 1, 1) }
        ] },
      { titel: "Sichere Verbindung (TLS)", browserStart: "tls", browser: "tls",
        text: `<p>Jetzt wird die Verbindung <b>verschlüsselt</b> – das „S“ in HTTPS. Dafür sorgt <b>TLS</b>:</p>
<ul>
  <li>Der Browser sagt Hallo und nennt die Verschlüsselungsverfahren, die er kann.</li>
  <li>Der Server antwortet mit seinem <b>Zertifikat</b> – einer Art digitalem Ausweis. Der Browser prüft, ob es zu ${ADR.host} passt und von einer vertrauenswürdigen Stelle unterschrieben ist.</li>
  <li>Beide berechnen einen gemeinsamen geheimen <b>Schlüssel</b>, ohne ihn je zu verschicken.</li>
</ul>
<p>Ab jetzt kann niemand unterwegs mitlesen – weder im Schulnetz noch beim Provider. Im Browser erscheint das <b>Schloss</b>.</p>`,
        pakete: [
          { von: "pc", nach: "web", proto: "TLS", label: "Hello", info: "Client Hello", transport: zumWeb("PSH, ACK", 1, 1),
            inhalt: "Client Hello\nTLS-Version: 1.3\nServername: " + ADR.host + "\nVerfahren: AES-256-GCM, ChaCha20 …\nSchlüsselteil des Browsers: 9f2c…" },
          { von: "web", nach: "pc", proto: "TLS", label: "Zertifikat", info: "Server Hello, Zertifikat", transport: vomWeb("PSH, ACK", 1, 518), warte: 1,
            inhalt: "Server Hello – Verfahren: AES-256-GCM\nSchlüsselteil des Servers: 41d7…\nZertifikat für: " + ADR.host + "\n  ausgestellt von: Beispiel-CA\n  gültig bis: 31.12.2027\nFinished" },
          { von: "pc", nach: "web", proto: "TLS", label: "Finished", info: "Finished – Schlüssel steht", transport: zumWeb("PSH, ACK", 518, 2890),
            inhalt: "Finished\nZertifikat geprüft ✓ – beide haben jetzt denselben geheimen Schlüssel.", sicher: true }
        ] },
      { titel: "HTTP-Anfrage: GET /", browserStart: "warte", browser: "warte",
        text: `<p>Jetzt fragt der Browser nach der eigentlichen Seite – mit dem Protokoll <b>HTTP</b>. Die Anfrage ist reiner Text:</p>
<p><code>GET / HTTP/1.1</code> bedeutet „Gib mir die Startseite“. In weiteren Zeilen (Header) stehen z. B. der Name der Seite (<code>Host</code>), welcher Browser fragt und welche Sprache gewünscht ist.</p>
<p>Unterwegs sieht man davon nichts: Der Text steckt verschlüsselt im TLS-Paket.</p>`,
        pakete: [P.get("/")] },
      { titel: "HTTP-Antwort: die HTML-Datei", browser: "html",
        text: `<p>Der Server antwortet mit <code>200 OK</code> – „alles gut, hier ist die Seite“ – und schickt die <b>HTML-Datei</b>. (Gäbe es die Seite nicht, käme <code>404 Not Found</code>.)</p>
<p>Links siehst du, was der Browser mit dem HTML allein anzeigen kann: Text und Überschriften, aber noch <b>ohne Gestaltung</b> – so sieht eine Seite ohne CSS aus.</p>
<p>Beim Lesen des HTML entdeckt der Browser, dass er noch mehr braucht: <code>style.css</code> und <code>logo.svg</code>.</p>`,
        pakete: [P.antwort("index.html", "text/html; charset=utf-8", 1532, HTML_TEXT, { browser: "html", datei: ["index.html", "document", "1,5 kB"] })] },
      { titel: "Weitere Dateien nachladen", browser: "fertig",
        text: `<p>Für jede weitere Datei schickt der Browser eine eigene Anfrage – über dieselbe, schon bestehende Verbindung:</p>
<ul>
  <li><code>GET /style.css</code> → Jetzt weiß der Browser, wie die Seite aussehen soll: Farben, Schriften, Abstände.</li>
  <li><code>GET /logo.svg</code> → Das Logo erscheint.</li>
</ul>
<p>Unten im Browser siehst du die <b>Entwicklertools</b> (in echten Browsern mit F12). Echte Seiten laden oft 50 bis 100 Dateien!</p>`,
        pakete: [
          P.get("/style.css"),
          P.antwort("style.css", "text/css", 2210, CSS_TEXT, { browser: "css", datei: ["style.css", "stylesheet", "2,2 kB"] }),
          P.get("/logo.svg"),
          P.antwort("logo.svg", "image/svg+xml", 640, SVG_TEXT, { browser: "fertig", datei: ["logo.svg", "svg+xml", "0,6 kB"], fertig: true })
        ] },
      { titel: "Fertig!", browser: "fertig",
        text: z => `<p>Vom Enter-Drücken bis zur fertigen Seite: etwa <b>${ms(z.tFertig - z.t0)}</b> und <b>${z.log.length} Pakete</b>.</p>
<ul>
  <li><b>DNS</b> (UDP, Port 53): Name → IP-Adresse</li>
  <li><b>TCP</b>: zuverlässige Verbindung mit Drei-Wege-Handschlag</li>
  <li><b>TLS</b>: Verschlüsselung und Zertifikat – das Schloss</li>
  <li><b>HTTP</b>: Anfrage (GET) und Antwort (200 OK) für jede Datei</li>
</ul>
<p>Die Protokolle stecken ineinander wie Briefumschläge: HTTP in TLS, TLS in TCP, TCP in IP. Klicke in der Paketliste auf ein Paket, um die Umschläge zu sehen. Noch genauer wird es in der Stufe <b>ausführlich</b>.</p>` }
    ],

    ausfuehrlich: [
      { titel: "Vorher: eine IP-Adresse bekommen (DHCP)", browser: "leer",
        text: `<p>Schon beim Einschalten passiert etwas: Der PC hat noch keine IP-Adresse. Er ruft per <b>Broadcast</b> (an alle) ins Netz: „Gibt es hier einen DHCP-Server?“ – meist ist das der Router.</p>
<ul>
  <li><b>Discover</b> – PC: „Ich brauche eine Adresse!“</li>
  <li><b>Offer</b> – Router: „Du kannst ${ADR.pcIp} haben.“</li>
  <li><b>Request</b> – PC: „Die nehme ich.“</li>
  <li><b>ACK</b> – Router: „Gebucht. Router ist ${ADR.gwIp}, DNS-Server ist ${ADR.dnsIp}.“</li>
</ul>
<p>Unter dem Browser siehst du, dass der PC jetzt seine Netzwerkdaten kennt.</p>`,
        pakete: [
          { von: "pc", nach: "router", proto: "DHCP", label: "Discover", info: "DHCP Discover (an alle)", broadcast: true, ip: ["0.0.0.0", "255.255.255.255"], transport: udp(68, 67),
            inhalt: "DHCP Discover\nMeine MAC-Adresse: " + ADR.pcMac + "\nIch brauche eine IP-Adresse!" },
          { von: "router", nach: "pc", proto: "DHCP", label: "Offer", info: "DHCP Offer: " + ADR.pcIp, ip: [ADR.gwIp, ADR.pcIp], transport: udp(67, 68), warte: 1,
            inhalt: "DHCP Offer\nAngebot: " + ADR.pcIp + " / 255.255.0.0\nGültig: 8 Stunden" },
          { von: "pc", nach: "router", proto: "DHCP", label: "Request", info: "DHCP Request: " + ADR.pcIp, broadcast: true, ip: ["0.0.0.0", "255.255.255.255"], transport: udp(68, 67),
            inhalt: "DHCP Request\nIch nehme " + ADR.pcIp + "." },
          { von: "router", nach: "pc", proto: "DHCP", label: "ACK", info: "DHCP ACK", ip: [ADR.gwIp, ADR.pcIp], transport: udp(67, 68), dhcp: true,
            inhalt: "DHCP ACK\nIP-Adresse: " + ADR.pcIp + " / 255.255.0.0\nRouter (Gateway): " + ADR.gwIp + "\nDNS-Server: " + ADR.dnsIp + "\nGültig: 8 Stunden" }
        ] },
      { titel: "Adresse eingeben", tippen: true, start: true, browser: "eingegeben",
        text: `<p>Du tippst <code>${ADR.host}</code> ein und drückst Enter. Der Browser macht daraus <code>https://${ADR.host}/</code>.</p>
<p>Zuerst schaut er in seinen <b>Zwischenspeicher</b> (Cache): Hat er die IP-Adresse vor Kurzem schon einmal nachgeschlagen? Hier nicht – also muss er den DNS-Server fragen.</p>` },
      { titel: "ARP: Wer ist der Router?", browser: "eingegeben",
        text: `<p>Der DNS-Server liegt außerhalb des Schulnetzes. Also muss das Paket zuerst zum <b>Router</b> (${ADR.gwIp}). Im lokalen Netz werden Pakete aber nicht per IP-, sondern per <b>MAC-Adresse</b> zugestellt – die fest eingebaute Adresse jeder Netzwerkkarte.</p>
<p>Mit <b>ARP</b> fragt der PC per Broadcast: „Wer hat ${ADR.gwIp}? Sag mir deine MAC-Adresse!“ Der Router antwortet. Die Antwort merkt sich der PC in seiner ARP-Tabelle.</p>
<p>Der <b>Switch</b> lernt dabei ganz nebenbei, an welchem Anschluss welche MAC-Adresse hängt.</p>`,
        pakete: [
          { von: "pc", nach: "router", proto: "ARP", label: "ARP ?", info: "Wer hat " + ADR.gwIp + "?", broadcast: true, arp: true,
            inhalt: "ARP-Anfrage (an alle)\nWer hat " + ADR.gwIp + "? Bitte an " + ADR.pcIp + " melden." },
          { von: "router", nach: "pc", proto: "ARP", label: "ARP ✓", info: ADR.gwIp + " ist " + ADR.gwMac, arp: true, warte: 0.1,
            inhalt: "ARP-Antwort\n" + ADR.gwIp + " hat die MAC-Adresse " + ADR.gwMac }
        ] },
      { titel: "DNS-Anfrage an den Resolver", browserStart: "dns", browser: "dns",
        text: `<p>Jetzt geht die <b>DNS-Anfrage</b> los (UDP, Port 53): „Welche IPv4-Adresse (Typ A) hat ${ADR.host}?“</p>
<p>Achte auf den <b>Router</b>: Er ersetzt die private Absenderadresse <code>${ADR.pcIp}</code> durch die öffentliche Adresse der Schule <code>${ADR.wanIp}</code> und merkt sich das in einer Tabelle (<b>NAT</b>, Network Address Translation). So können sich hunderte Geräte eine öffentliche Adresse teilen.</p>
<p>Außerdem wechselt die <b>MAC-Adresse</b> bei jedem Router: Sie gilt immer nur bis zum nächsten Gerät. Die IP-Adressen bleiben (abgesehen von NAT) von Anfang bis Ende gleich.</p>`,
        pakete: [P.dnsFrage({ nat: "NAT: " + ADR.pcIp + ":50123 → " + ADR.wanIp + ":40002", notiz: { bei: "dns", text: "Kenne ich nicht – ich frage mich durch." } })] },
      { titel: "Der DNS-Server fragt sich durch", browser: "dns",
        text: `<p>Der DNS-Server des Providers (<b>Resolver</b>) kennt die Antwort nicht aus dem Gedächtnis. Also fragt er sich von oben nach unten durch die DNS-Hierarchie:</p>
<ul>
  <li><b>Root-Server:</b> „Für .de frag die DENIC.“</li>
  <li><b>.de-Server:</b> „Für beispiel-schule.de frag ns1.beispiel-hosting.de.“</li>
  <li><b>Nameserver von beispiel-schule.de:</b> „${ADR.host} hat die IP ${ADR.webIp}.“</li>
</ul>
<p>Dann schickt er die Antwort an den PC und merkt sich das Ergebnis eine Stunde lang (TTL). Der nächste, der fragt, bekommt die Antwort sofort.</p>`,
        pakete: [
          { von: "dns", nach: "root", proto: "DNS", label: "DNS ?", info: "Wer ist zuständig für " + ADR.host + "?", ip: [ADR.dnsIp, "198.41.0.4"], transport: udp(41007, 53),
            inhalt: "Frage: " + ADR.host + ", Typ A" },
          { von: "root", nach: "dns", proto: "DNS", label: "→ .de", info: "Verweis: .de → a.nic.de", ip: ["198.41.0.4", ADR.dnsIp], transport: udp(53, 41007), warte: 0.3,
            inhalt: "Kenne ich nicht, aber für .de ist zuständig:\na.nic.de (194.0.0.53)" },
          { von: "dns", nach: "tld", proto: "DNS", label: "DNS ?", info: "Wer ist zuständig für " + ADR.host + "?", ip: [ADR.dnsIp, "194.0.0.53"], transport: udp(41008, 53),
            inhalt: "Frage: " + ADR.host + ", Typ A" },
          { von: "tld", nach: "dns", proto: "DNS", label: "→ ns1", info: "Verweis: beispiel-schule.de → ns1.beispiel-hosting.de", ip: ["194.0.0.53", ADR.dnsIp], transport: udp(53, 41008), warte: 0.3,
            inhalt: "Für beispiel-schule.de ist zuständig:\nns1.beispiel-hosting.de (192.0.2.53)" },
          { von: "dns", nach: "auth", proto: "DNS", label: "DNS ?", info: "Welche IP hat " + ADR.host + "?", ip: [ADR.dnsIp, "192.0.2.53"], transport: udp(41009, 53),
            inhalt: "Frage: " + ADR.host + ", Typ A" },
          { von: "auth", nach: "dns", proto: "DNS", label: "DNS ✓", info: ADR.host + " → " + ADR.webIp, ip: ["192.0.2.53", ADR.dnsIp], transport: udp(53, 41009), warte: 0.3,
            inhalt: "Antwort (verbindlich):\n" + ADR.host + " → " + ADR.webIp + "\nTTL: 3600 s" },
          P.dnsAntwort({ warte: 0.2 })
        ] },
      { titel: "TCP: Drei-Wege-Handschlag", browserStart: "verbinde", browser: "verbinde",
        text: `<p>Der Browser baut eine <b>TCP-Verbindung</b> zu <code>${ADR.webIp}</code>, <b>Port 443</b> (HTTPS) auf. Als eigenen Port wählt er zufällig <code>51234</code> – so kann der PC viele Verbindungen gleichzeitig auseinanderhalten.</p>
<ul>
  <li><b>SYN</b> (Seq = 0): „Ich möchte eine Verbindung, ich beginne bei Nummer 0.“</li>
  <li><b>SYN-ACK</b> (Seq = 0, Ack = 1): „Einverstanden, ich beginne auch bei 0 – und erwarte von dir als Nächstes Nummer 1.“</li>
  <li><b>ACK</b> (Ack = 1): „Bestätigt.“</li>
</ul>
<p>Mit den <b>Sequenznummern</b> zählt TCP jedes Byte. So merkt der Empfänger, wenn etwas fehlt oder in falscher Reihenfolge ankommt. (Echte Startnummern sind zufällig und groß – hier relativ gezählt wie in Wireshark.)</p>`,
        pakete: [
          { von: "pc", nach: "web", proto: "TCP", label: "SYN", info: "SYN Seq=0", transport: zumWeb("SYN", 0), nat: "NAT: " + ADR.pcIp + ":51234 → " + ADR.wanIp + ":40001" },
          { von: "web", nach: "pc", proto: "TCP", label: "SYN-ACK", info: "SYN, ACK Seq=0 Ack=1", transport: vomWeb("SYN, ACK", 0, 1), warte: 0.2 },
          { von: "pc", nach: "web", proto: "TCP", label: "ACK", info: "ACK Seq=1 Ack=1", transport: zumWeb("ACK", 1, 1) }
        ] },
      { titel: "TLS-Handschlag", browserStart: "tls", browser: "tls",
        text: `<p>Mit <b>TLS 1.3</b> wird die Verbindung verschlüsselt:</p>
<ul>
  <li><b>Client Hello</b>: unterstützte Verfahren, ein Schlüsselteil des Browsers und der gewünschte Servername (SNI). Dieses Paket ist noch unverschlüsselt.</li>
  <li><b>Server Hello</b>: gewähltes Verfahren und Schlüsselteil des Servers. Ab hier ist alles verschlüsselt – auch das <b>Zertifikat</b> und die Bestätigung <b>Finished</b>.</li>
  <li><b>Finished</b> vom Browser: Handschlag abgeschlossen.</li>
</ul>
<p>Aus den beiden Schlüsselteilen berechnen beide denselben geheimen Schlüssel (Diffie-Hellman), der selbst nie übertragen wird. Der Browser prüft das Zertifikat: Passt der Name? Ist es noch gültig? Hat es eine vertrauenswürdige Zertifizierungsstelle (CA) unterschrieben? Erst dann erscheint das <b>Schloss</b>.</p>`,
        pakete: [
          { von: "pc", nach: "web", proto: "TLS", label: "Hello", info: "Client Hello (SNI: " + ADR.host + ")", transport: zumWeb("PSH, ACK", 1, 1),
            inhalt: "Client Hello\nTLS-Version: 1.3\nServername (SNI): " + ADR.host + "\nVerfahren: TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256 …\nSchlüsselteil (x25519): 9f2c41…" },
          { von: "web", nach: "pc", proto: "TLS", label: "Zertifikat", info: "Server Hello, Zertifikat, Finished", transport: vomWeb("PSH, ACK", 1, 518), warte: 1,
            inhalt: "Server Hello\nVerfahren: TLS_AES_256_GCM_SHA384\nSchlüsselteil (x25519): 41d7a0…\n— ab hier verschlüsselt —\nZertifikat: " + ADR.host + "\n  ausgestellt von: Beispiel-CA\n  gültig bis: 31.12.2027\nCertificate Verify (Unterschrift)\nFinished" },
          { von: "pc", nach: "web", proto: "TLS", label: "Finished", info: "Finished", transport: zumWeb("PSH, ACK", 518, 2890),
            inhalt: "Finished\nZertifikat geprüft ✓ – gemeinsamer Schlüssel steht.", sicher: true }
        ] },
      { titel: "HTTP-Anfrage: GET /", browserStart: "warte", browser: "warte",
        text: `<p>Jetzt endlich die eigentliche Anfrage: <code>GET / HTTP/1.1</code> mit Headern wie <code>Host</code>, <code>User-Agent</code> und <code>Accept-Language</code>.</p>
<p>Der Text wird mit dem TLS-Schlüssel verschlüsselt, in ein TCP-Segment verpackt, das in ein IP-Paket, das in einen Ethernet-Rahmen – wie Briefumschläge ineinander (<b>Kapselung</b>). Klicke in der Paketliste auf das Paket, um alle Schichten zu sehen.</p>
<p>Moderne Browser nutzen oft HTTP/2 oder HTTP/3 – das Prinzip „Anfrage und Antwort“ bleibt gleich.</p>`,
        pakete: [P.get("/")] },
      { titel: "HTTP-Antwort: die HTML-Datei", browser: "html",
        text: `<p>Der Webserver antwortet mit <code>HTTP/1.1 200 OK</code>, dem Typ <code>text/html</code> und der Länge der Datei – und dann dem HTML selbst.</p>
<p>Der Browser zerlegt das HTML in einen Baum aus Elementen (DOM) und zeigt schon einmal an, was er hat: Text <b>ohne Gestaltung</b>. Dabei findet er <code>&lt;link href="style.css"&gt;</code> und <code>&lt;img src="logo.svg"&gt;</code>.</p>
<p>Größere Dateien passen nicht in ein Paket (max. ca. 1 500 Byte) und werden auf viele TCP-Segmente verteilt – hier vereinfacht als eines.</p>`,
        pakete: [P.antwort("index.html", "text/html; charset=utf-8", 1532, HTML_TEXT, { browser: "html", datei: ["index.html", "document", "1,5 kB"] })] },
      { titel: "CSS und Bild nachladen", browser: "fertig",
        text: `<p>Für <code>style.css</code> und <code>logo.svg</code> schickt der Browser weitere GET-Anfragen über dieselbe Verbindung (<b>Keep-Alive</b>) – ein neuer Handschlag ist nicht nötig.</p>
<p>Sobald das Stylesheet da ist, berechnet der Browser das Layout und zeichnet die Seite neu. Mit dem Logo ist die Seite komplett. In den <b>Entwicklertools</b> (F12, Reiter „Netzwerk“) kannst du das bei jeder echten Seite nachverfolgen.</p>`,
        pakete: [
          P.get("/style.css"),
          P.antwort("style.css", "text/css", 2210, CSS_TEXT, { browser: "css", datei: ["style.css", "stylesheet", "2,2 kB"] }),
          P.get("/logo.svg"),
          P.antwort("logo.svg", "image/svg+xml", 640, SVG_TEXT, { browser: "fertig", datei: ["logo.svg", "svg+xml", "0,6 kB"], fertig: true })
        ] },
      { titel: "Verbindung abbauen", browser: "fertig",
        text: `<p>Der Browser hält die Verbindung noch eine Weile offen, falls du weiterklickst. Passiert nichts mehr, wird sie geordnet abgebaut:</p>
<ul>
  <li><b>FIN</b> – PC: „Ich bin fertig.“</li>
  <li><b>FIN-ACK</b> – Server: „Verstanden, ich auch.“</li>
  <li><b>ACK</b> – PC: „Tschüss.“</li>
</ul>
<p>Auch der Router löscht dann seinen NAT-Eintrag für diese Verbindung.</p>`,
        pakete: [
          { von: "pc", nach: "web", proto: "TCP", label: "FIN", info: "FIN, ACK – Verbindung beenden", transport: zumWeb("FIN, ACK", 1800, 7270), warte: 500 },
          { von: "web", nach: "pc", proto: "TCP", label: "FIN-ACK", info: "FIN, ACK", transport: vomWeb("FIN, ACK", 7270, 1801), warte: 0.2 },
          { von: "pc", nach: "web", proto: "TCP", label: "ACK", info: "ACK – Verbindung geschlossen", transport: zumWeb("ACK", 1801, 7271) }
        ] },
      { titel: "Fertig!", browser: "fertig",
        text: z => `<p>Vom Enter-Drücken bis zur fertigen Seite: etwa <b>${ms(z.tFertig - z.t0)}</b>. Insgesamt waren <b>${z.log.length} Pakete</b> unterwegs.</p>
<ul>
  <li><b>DHCP</b>: eigene IP-Adresse, Router und DNS-Server bekommen</li>
  <li><b>ARP</b>: MAC-Adresse des Routers herausfinden</li>
  <li><b>DNS</b>: Resolver fragt Root → .de → zuständigen Nameserver</li>
  <li><b>NAT</b>: Router tauscht private gegen öffentliche Adresse</li>
  <li><b>TCP</b>: Handschlag, Sequenznummern, Verbindungsabbau</li>
  <li><b>TLS</b>: Schlüsselaustausch und Zertifikatsprüfung</li>
  <li><b>HTTP</b>: GET und 200 OK für HTML, CSS und Bild</li>
</ul>
<p>Im TCP/IP-Modell: Ethernet (Netzzugang) → IP (Internet) → TCP/UDP (Transport) → DNS, TLS, HTTP (Anwendung).</p>` }
    ]
  };

  /* ---------- Hilfsfunktionen ---------- */
  const NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...kinder) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const k of kinder.flat()) if (k) e.append(k);
    return e;
  }
  function h(tag, attrs, ...kinder) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const k of kinder.flat()) if (k) e.append(k);
    return e;
  }

  const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ms = n => (n < 10 ? n.toFixed(1) : String(Math.round(n))).replace(".", ",") + " ms";
  const sichtbar = kn => !kn.ab || STUFEN_NR[stufe] >= STUFEN_NR[kn.ab];

  // Weg zwischen zwei Knoten (Breitensuche)
  function weg(von, nach) {
    const vor = { [von]: null }, schlange = [von];
    while (schlange.length) {
      const a = schlange.shift();
      if (a === nach) break;
      for (const [x, y] of LINKS) {
        const b = x === a ? y : y === a ? x : null;
        if (b && !(b in vor)) { vor[b] = a; schlange.push(b); }
      }
    }
    const w = [nach];
    while (vor[w[0]] != null) w.unshift(vor[w[0]]);
    return w;
  }
  const linkZwischen = (a, b) => LINKS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const laufzeit = p => weg(p.von, p.nach).reduce((summe, id, i, w) => i ? summe + linkZwischen(w[i - 1], id)[3] : summe, 0);
  const ueberRouter = p => { const w = weg(p.von, p.nach); return w.includes("router") && w.includes("isp"); };

  // Pseudo-zufällige, aber feste "verschlüsselte" Bytes
  function bytes(saat, n) {
    let x = saat * 9301 + 49297, out = ["17", "03", "03"];
    for (let i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; out.push((x % 256).toString(16).padStart(2, "0")); }
    return out.join(" ") + " …";
  }

  /* ---------- Zustand ---------- */
  let stufe = "mittel", schritt = 0, lauf = 0, auto = false, autoTimer = 0, tempo = 1;
  let z = null;          // aktueller Zustand (Browser, Paketliste, Uhr)
  let offen = -1;        // aufgeklappte Zeile in der Paketliste

  function neuerZustand() {
    return { browser: "leer", url: "", ip: stufe !== "ausfuehrlich", sicher: false, log: [], dateien: [], zeit: 0, t0: 0, tFertig: 0 };
  }

  function schrittBeginn(st) {
    if (st.start) { z.zeit += z.log.length ? 1500 : 0; z.t0 = z.zeit; }
    if (st.browserStart) z.browser = st.browserStart;
  }
  function schrittEnde(st) {
    if (st.tippen) z.url = ADR.host;
    if (st.browser) z.browser = st.browser;
  }
  function paketAngekommen(p) {
    z.zeit += (p.warte || 0) + laufzeit(p);
    z.log.push({ p, zeit: z.zeit });
    if (p.browser) z.browser = p.browser;
    if (p.dhcp) z.ip = true;
    if (p.sicher) z.sicher = true;
    if (p.datei) z.dateien.push([...p.datei, z.zeit - z.t0]);
    if (p.fertig) z.tFertig = z.zeit;
  }

  /* ---------- Browser zeichnen ---------- */
  const browserEl = document.getElementById("browser");
  const pcInfo = document.getElementById("pcInfo");
  const ZUSTAENDE = ["leer", "eingegeben", "dns", "verbinde", "tls", "warte", "html", "css", "fertig"];
  const STATUS = {
    dns: "Suche " + ADR.host + " …",
    verbinde: "Verbindung zu " + ADR.webIp + " wird hergestellt …",
    tls: "Sichere Verbindung wird aufgebaut …",
    warte: "Warte auf " + ADR.host + " …",
    html: "Übertrage Daten von " + ADR.host + " …",
    css: "Übertrage Daten von " + ADR.host + " …"
  };
  const logo = farbe => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="${farbe}" stroke-width="2.4" stroke-linejoin="round"><path d="M4 27V13l12-8 12 8v14z"/><path d="M12 27v-7h8v7"/></svg>`);
  const LOGO = logo("#fff"), FAVICON = logo("#1d4ed8");
  const SCHLOSS = '<svg class="schloss" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  function seiteHtml(gestylt, mitLogo) {
    return `<div class="seite ${gestylt ? "styled" : "roh"}">
  <header class="s-kopf">
    <div class="s-logo"><img class="s-logo-img" src="${LOGO}" alt="Logo" ${mitLogo ? "" : "hidden"}><span class="s-logo-alt">[Logo]</span></div>
    <p class="s-name">Beispiel-Schule</p>
    <nav><ul><li><a href="#" tabindex="-1">Start</a></li><li><a href="#" tabindex="-1">Termine</a></li><li><a href="#" tabindex="-1">Kontakt</a></li></ul></nav>
  </header>
  <main>
    <h1>Willkommen an der Beispiel-Schule</h1>
    <p>Schön, dass du da bist! Hier findest du aktuelle Termine, Infos zu unseren Bildungsgängen und alle Ansprechpartner.</p>
    <h2>Aktuelles</h2>
    <ul class="s-news">
      <li><b>Projekttag</b> <span>Am Freitag zeigen alle Klassen ihre Projekte.</span></li>
      <li><b>Neue Computerräume</b> <span>Raum 204 und 205 sind fertig eingerichtet.</span></li>
      <li><b>Infoabend</b> <span>Am 12. März um 18 Uhr in der Aula.</span></li>
    </ul>
  </main>
</div>`;
  }

  function zeichneBrowser(tippText) {
    const zi = ZUSTAENDE.indexOf(z.browser);
    const laedt = zi >= 2 && zi <= 7;
    const url = tippText != null ? tippText : z.url;
    const schloss = stufe === "einfach" ? z.browser === "fertig" : z.sicher;
    const tabTitel = zi >= 6 ? "Beispiel-Schule" : url && zi >= 2 ? ADR.host : "Neuer Tab";

    let adresse;
    if (!url && tippText == null) adresse = '<span class="platzhalter">Suchen oder Adresse eingeben</span><span class="cursor"></span>';
    else if (tippText != null) adresse = esc(url) + '<span class="cursor"></span>';
    else adresse = (schloss ? SCHLOSS : "") + (zi >= 2 && stufe !== "einfach" ? '<span class="https">https://</span>' : "") + esc(url);

    let inhalt;
    if (zi >= 6) inhalt = seiteHtml(zi >= 7, zi >= 8);
    else inhalt = `<div class="b-leer">${zi >= 2 ? "" : "Neuer Tab"}</div>`;

    const devtools = stufe === "einfach" ? "" : `<div class="devtools">
  <div class="dt-kopf"><span>Elemente</span><span>Konsole</span><b>Netzwerk</b></div>
  <div class="dt-scroll"><table><thead><tr><th>Name</th><th>Status</th><th>Typ</th><th>Größe</th><th>Zeit</th></tr></thead><tbody>
  ${z.dateien.length ? z.dateien.map(d => `<tr><td>${d[0]}</td><td class="ok">200</td><td>${d[1]}</td><td>${d[2]}</td><td>${ms(d[3])}</td></tr>`).join("")
    : '<tr class="dt-leer"><td colspan="5">noch keine Anfragen</td></tr>'}
  </tbody></table></div>
</div>`;

    browserEl.innerHTML = `<div class="b-tabs"><div class="b-punkte"><i></i><i></i><i></i></div>
  <div class="b-tab">${laedt ? '<span class="spinner"></span>' : zi >= 8 ? `<img class="fav" src="${FAVICON}" alt="">` : ""}<span>${tabTitel}</span></div></div>
<div class="b-leiste"><span class="b-nav" aria-hidden="true">‹ › ↻</span><div class="b-adresse">${adresse}</div></div>
<div class="b-inhalt">${inhalt}${STATUS[z.browser] ? `<div class="b-status">${STATUS[z.browser]}</div>` : ""}</div>
${devtools}`;

    pcInfo.innerHTML = z.ip
      ? `<span>IP-Adresse: <b>${ADR.pcIp}</b></span><span>Router: <b>${ADR.gwIp}</b></span><span>DNS-Server: <b>${ADR.dnsIp}</b></span>`
      : `<span>IP-Adresse: <b>noch keine</b></span><span>MAC-Adresse: <b>${ADR.pcMac}</b></span>`;
  }
  const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- Netz zeichnen ---------- */
  const netzEl = document.getElementById("netz");
  const legendeEl = document.getElementById("legende");
  const knotenInfo = document.getElementById("knotenInfo");
  let svg, paketGruppe, linkEls = {}, knotenEls = {};
  let k = 1;

  function zeichneNetz() {
    svg = s("svg", { viewBox: "0 0 1000 460" });
    linkEls = {};
    knotenEls = {};
    for (const zo of ZONEN) {
      if (zo.ab && STUFEN_NR[stufe] < STUFEN_NR[zo.ab]) continue;
      if (zo.bis && STUFEN_NR[stufe] > STUFEN_NR[zo.bis]) continue;
      svg.append(s("rect", { class: "zone", x: zo.x, y: zo.y, width: zo.w, height: zo.h, rx: 14 }),
        s("text", { class: "zone-label", x: zo.x + 12, y: zo.y + 20, text: zo.text }));
    }
    for (const [a, b, typ] of LINKS) {
      if (!sichtbar(KNOTEN[a]) || !sichtbar(KNOTEN[b])) continue;
      const el = s("line", { class: "link " + typ, x1: KNOTEN[a].x, y1: KNOTEN[a].y, x2: KNOTEN[b].x, y2: KNOTEN[b].y });
      svg.append(el);
      linkEls[a + "-" + b] = linkEls[b + "-" + a] = el;
    }
    paketGruppe = s("g", {});
    const knotenGruppe = s("g", {});
    for (const [id, kn] of Object.entries(KNOTEN)) {
      if (!sichtbar(kn)) continue;
      const g = s("g", { class: "knoten " + id, transform: `translate(${kn.x},${kn.y})`, tabindex: 0, role: "button", "aria-label": kn.name },
        s("g", { class: "sk" },
          s("circle", { r: 26, fill: "transparent" }),
          s("circle", { class: "ico-bg", r: 19 }),
          s("path", { class: "ico", d: ICONS[kn.icon], transform: "translate(-12,-12)" }),
          kn.lp === "l"
            ? [s("text", { class: "name links", x: -27, y: -1, text: kn.name }),
              s("text", { class: "sub links", x: -27, y: 12, text: kn.sub })]
            : [s("text", { class: "name", y: 35, text: kn.name }),
              s("text", { class: "sub", y: 48, text: kn.sub })]));
      const waehle = () => zeigeKnoten(id);
      g.addEventListener("click", waehle);
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); waehle(); } });
      knotenGruppe.append(g);
      knotenEls[id] = g;
    }
    svg.append(knotenGruppe, paketGruppe);
    netzEl.replaceChildren(svg);

    const protos = [...new Set(ABLAUF[stufe].flatMap(st => (st.pakete || []).map(p => p.proto)))];
    legendeEl.replaceChildren(...[
      ...protos.map(pr => h("span", {}, h("i", { class: "z-" + pr }), pr)),
      h("span", {}, h("i", { class: "l-lan" }), "Netzwerkkabel"),
      h("span", {}, h("i", { class: "l-glas" }), "Glasfaser"),
      STUFEN_NR[stufe] >= 2 ? h("span", {}, h("i", { class: "l-inet" }), "über das Internet") : null
    ].filter(Boolean));
    knotenInfo.innerHTML = "";
  }

  function zeigeKnoten(id) {
    const kn = KNOTEN[id];
    Object.entries(knotenEls).forEach(([x, el]) => el.classList.toggle("gewaehlt", x === id));
    knotenInfo.innerHTML = `<b>${kn.name}</b>${kn.sub && /\d/.test(kn.sub) ? ` · <span class="mono">${kn.sub}</span>` : ""} – ${kn.info}`;
  }

  // Sprechblasen als HTML über dem Bild
  function blase(id, text) {
    const kn = KNOTEN[id];
    const seite = kn.x > 800 ? " links" : kn.x < 150 ? " rechts" : "";
    const el = h("div", { class: "blase" + seite, text });
    el.style.left = (kn.x / 10) + "%";
    el.style.top = (kn.y / 460 * 100) + "%";
    netzEl.append(el);
    return el;
  }
  const entferneBlasen = () => netzEl.querySelectorAll(".blase").forEach(e => e.remove());

  /* ---------- Animation ---------- */
  const warte = (msZeit, token) => new Promise(r => setTimeout(r, reduziert ? 0 : msZeit / tempo)).then(() => token === lauf);

  function bewege(el, a, b, dauer, token) {
    return new Promise(fertig => {
      if (reduziert) return fertig(token === lauf);
      const t0 = performance.now();
      function schritt(t) {
        if (token !== lauf) return fertig(false);
        const p = Math.min(1, (t - t0) / dauer);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        el.setAttribute("transform", `translate(${a.x + (b.x - a.x) * e},${a.y + (b.y - a.y) * e})`);
        if (p < 1) requestAnimationFrame(schritt); else fertig(true);
      }
      requestAnimationFrame(schritt);
    });
  }

  async function fahre(p, token) {
    entferneBlasen();
    const w = weg(p.von, p.nach);
    const breite = p.label.length * 7 + 16;
    const el = s("g", { class: "paket p-" + p.proto },
      s("g", { class: "sk" },
        s("rect", { x: -breite / 2, y: -11, width: breite, height: 22, rx: 6 }),
        s("text", { y: 4, text: p.label })));
    paketGruppe.append(el);
    if (p.warte > 100) if (!await warte(600, token)) return false;
    for (let i = 1; i < w.length; i++) {
      const a = KNOTEN[w[i - 1]], b = KNOTEN[w[i]];
      const link = linkEls[w[i - 1] + "-" + w[i]];
      link && link.classList.add("aktiv");
      const dauer = Math.max(280, Math.hypot(b.x - a.x, b.y - a.y) * 2.6) / tempo;
      const ok = await bewege(el, a, b, dauer, token);
      link && link.classList.remove("aktiv");
      if (!ok) { el.remove(); return false; }
      pulse(w[i]);
      if (w[i] === "router" && p.nat && ueberRouter(p) && STUFEN_NR[stufe] >= 1) {
        const bl = blase("router", p.nat);
        if (!await warte(1800, token)) { el.remove(); return false; }
        bl.remove();
      }
    }
    el.remove();
    if (p.notiz) blase(p.notiz.bei, p.notiz.text);
    return true;
  }

  function pulse(id) {
    const el = knotenEls[id];
    if (!el) return;
    el.classList.remove("puls");
    void el.getBBox();
    el.classList.add("puls");
  }

  async function tippe(token) {
    const text = ADR.host;
    for (let i = 0; i <= text.length; i++) {
      zeichneBrowser(text.slice(0, i));
      if (!await warte(i === 0 ? 400 : 55, token)) return false;
    }
    return warte(450, token);
  }

  /* ---------- Paketliste ---------- */
  const logEl = document.getElementById("log");
  const logWrap = document.getElementById("logWrap");

  function name(id) { return KNOTEN[id].name; }
  function ipVon(p, seite) {
    if (p.ip) return p.ip[seite === "von" ? 0 : 1];
    const id = p[seite];
    return { pc: ADR.pcIp, router: ADR.gwIp, dns: ADR.dnsIp, web: ADR.webIp }[id] || KNOTEN[id].sub;
  }

  const aktuellEl = document.getElementById("paketAktuell");

  function zeichneLog(neuIndex) {
    zeichneAktuell();
    if (!z.log.length) {
      logEl.replaceChildren(h("tr", { class: "leer" }, h("td", { colspan: 6, text: "Noch keine Pakete – klicke auf „weiter“." })));
      return;
    }
    const zeilen = [];
    z.log.forEach((eintrag, i) => {
      const p = eintrag.p;
      const tr = h("tr", { class: "zeile" + (i === offen ? " offen" : "") + (i === neuIndex ? " neu" : ""), tabindex: 0, "aria-expanded": String(i === offen) },
        h("td", { class: "nr", text: String(i + 1) }),
        h("td", { class: "zeit", text: ms(eintrag.zeit) }),
        h("td", {}, name(p.von), h("small", { text: p.arp ? "" : ipVon(p, "von") })),
        h("td", {}, name(p.nach), h("small", { text: p.arp ? (p.broadcast ? "an alle" : "") : ipVon(p, "nach") })),
        h("td", {}, h("span", { class: "proto z-" + p.proto, text: p.proto })),
        h("td", { text: p.info }));
      const umschalten = () => { offen = offen === i ? -1 : i; zeichneLog(); };
      tr.addEventListener("click", umschalten);
      tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); umschalten(); } });
      zeilen.push(tr);
      if (i === offen) zeilen.push(h("tr", { class: "details" }, h("td", { colspan: 6 }, details(p, i))));
    });
    logEl.replaceChildren(...zeilen);
    if (neuIndex != null) logWrap.scrollTop = logWrap.scrollHeight;
  }

  // Das zuletzt angekommene Paket rechts unter dem Netzbild
  function zeichneAktuell() {
    const nr = z.log.length - 1;
    if (nr < 0) {
      aktuellEl.replaceChildren(h("p", { class: "small muted", text: "Hier siehst du gleich, was im zuletzt angekommenen Paket steckt." }));
      return;
    }
    const p = z.log[nr].p;
    aktuellEl.replaceChildren(
      h("div", { class: "aktuell-kopf" }, h("span", { class: "proto z-" + p.proto, text: p.proto }),
        h("span", { text: `Nr. ${nr + 1} · ${name(p.von)} → ${name(p.nach)}` })),
      h("p", { class: "aktuell-info", text: p.info }),
      details(p, nr));
  }

  // Aufgeklappte Ansicht: Schichten von außen nach innen
  function details(p, nr) {
    const n = STUFEN_NR[stufe];
    const schichten = [];
    const schicht = (klasse, titel, zusatz, zeilen, extra) => schichten.push(h("div", { class: "schicht " + klasse },
      h("h4", {}, titel, zusatz ? h("span", { text: " – " + zusatz }) : null),
      zeilen.length ? h("dl", {}, zeilen.flatMap(([a, b]) => [h("dt", { text: a }), h("dd", { text: b })])) : null,
      extra));

    // Ethernet nur im Schulnetz und nur in „ausführlich“
    const imLan = p.von === "pc" || p.nach === "pc";
    if (n >= 2 && imLan) {
      const vomPc = p.von === "pc";
      schicht("s-l2", "Ethernet", "Netzzugang, gilt nur bis zum nächsten Gerät", [
        ["Quell-MAC", vomPc ? ADR.pcMac + " (PC)" : ADR.gwMac + " (Router)"],
        ["Ziel-MAC", p.broadcast ? "ff:ff:ff:ff:ff:ff (an alle)" : vomPc ? ADR.gwMac + " (Router)" : ADR.pcMac + " (PC)"]
      ]);
    }

    if (p.arp) {
      schicht("s-l7", "ARP", "", [], h("pre", { text: p.inhalt }));
      return h("div", { class: "schichten" }, schichten);
    }

    // IP
    const nat = ueberRouter(p) && (p.von === "pc" || p.nach === "pc");
    if (n === 0) {
      schicht("s-l3", "Adressen", "", [
        ["Von", name(p.von) + " (" + ipVon(p, "von") + ")"],
        ["Nach", name(p.nach) + " (" + ipVon(p, "nach") + ")"]
      ]);
    } else {
      const zeilen = [["Quell-IP", ipVon(p, "von")], ["Ziel-IP", ipVon(p, "nach")]];
      if (nat) {
        const i = p.von === "pc" ? 0 : 1;
        zeilen[i][1] += " (im Schulnetz)";
        zeilen.splice(i + 1, 0, ["", ADR.wanIp + " (im Internet, nach NAT)"]);
      }
      if (n >= 2) zeilen.push(["Protokoll", p.transport ? p.transport.p : "–"], ["TTL", p.von === "pc" ? "64 (sinkt an jedem Router um 1)" : "–"]);
      schicht("s-l3", "IP", "Internet: Wer ist Absender, wer Empfänger?", zeilen);
    }

    // Transport
    if (n >= 1 && p.transport) {
      const t = p.transport;
      const portName = port => ({ 53: " (DNS)", 443: " (HTTPS)", 67: " (DHCP-Server)", 68: " (DHCP-Client)" }[port] || " (zufällig gewählt)");
      const zeilen = [["Quellport", t.sp + portName(t.sp)], ["Zielport", t.dp + portName(t.dp)]];
      if (t.p === "TCP") {
        zeilen.push(["Flags", t.flags]);
        if (n >= 2) { zeilen.push(["Seq", String(t.seq)]); if (t.ack != null) zeilen.push(["Ack", String(t.ack)]); }
      }
      schicht("s-l4", t.p, t.p === "UDP" ? "Transport ohne Verbindung" : "Transport mit Verbindung", zeilen);
    }

    // TLS und Inhalt
    if (p.proto === "TLS" && n >= 1) {
      schicht("s-tls", "TLS", "Handschlag", [], h("pre", { text: p.inhalt }));
    } else if (p.proto === "HTTP") {
      if (n >= 1) {
        schicht("s-tls", "TLS", "verschlüsselt", [], [
          h("p", { class: "hinweis", text: "So sieht der Inhalt unterwegs aus – nur Browser und Server können ihn entschlüsseln:" }),
          h("pre", { text: bytes(nr + 7, 18) })]);
      }
      schicht("s-l7", "HTTP", n >= 1 ? "entschlüsselt" : "", [], h("pre", { text: p.inhalt }));
    } else if (p.inhalt) {
      schicht("s-l7", p.proto, "", [], h("pre", { text: p.inhalt }));
    } else if (p.proto === "TCP") {
      schichten.push(h("p", { class: "hinweis small muted", text: "Dieses TCP-Paket hat keinen Inhalt – es dient nur der Verbindungssteuerung." }));
    }
    return h("div", { class: "schichten" }, schichten);
  }

  /* ---------- Schritt-Anzeige ---------- */
  const schritteEl = document.getElementById("schritte");
  const schrittNr = document.getElementById("schrittNr");
  const schrittTitel = document.getElementById("schrittTitel");
  const schrittText = document.getElementById("schrittText");
  const btnZurueck = document.getElementById("btnZurueck");
  const btnWeiter = document.getElementById("btnWeiter");
  const btnAuto = document.getElementById("btnAuto");

  function zeichneSchritt() {
    const liste = ABLAUF[stufe], st = liste[schritt];
    schritteEl.replaceChildren(...liste.map((x, i) => h("button", {
      type: "button", text: String(i + 1), title: x.titel,
      class: i < schritt ? "erledigt" : null,
      "aria-current": i === schritt ? "step" : null,
      onclick: () => { stoppeAuto(); gehe(i); }
    })));
    schrittNr.textContent = `schritt ${schritt + 1} / ${liste.length}`;
    schrittTitel.textContent = st.titel;
    schrittText.innerHTML = typeof st.text === "function" ? st.text(z) : st.text;
    btnZurueck.disabled = schritt === 0;
    btnWeiter.disabled = schritt === liste.length - 1;
  }

  /* ---------- Ablauf steuern ---------- */
  // Baut den Zustand bis vor Schritt i sofort auf und spielt dann Schritt i ab
  async function gehe(i) {
    const token = ++lauf;
    clearTimeout(autoTimer);
    paketGruppe.replaceChildren();
    entferneBlasen();
    Object.values(linkEls).forEach(l => l.classList.remove("aktiv"));
    const liste = ABLAUF[stufe];
    schritt = Math.max(0, Math.min(liste.length - 1, i));
    z = neuerZustand();
    for (const st of liste.slice(0, schritt)) {
      schrittBeginn(st);
      (st.pakete || []).forEach(paketAngekommen);
      schrittEnde(st);
    }
    if (offen >= z.log.length) offen = -1;
    const st = liste[schritt];
    schrittBeginn(st);
    zeichneSchritt();
    zeichneLog();
    zeichneBrowser();

    if (st.tippen && !await tippe(token)) return;
    for (const p of st.pakete || []) {
      if (!await fahre(p, token)) return;
      paketAngekommen(p);
      zeichneBrowser();
      zeichneLog(z.log.length - 1);
      if (!await warte(250, token)) return;
    }
    schrittEnde(st);
    zeichneBrowser();
    if (typeof st.text === "function") schrittText.innerHTML = st.text(z);
    if (auto) {
      if (schritt < liste.length - 1) autoTimer = setTimeout(() => { if (token === lauf) gehe(schritt + 1); }, (reduziert ? 6000 : 3500) / tempo);
      else stoppeAuto();
    }
  }

  function stoppeAuto() {
    auto = false;
    clearTimeout(autoTimer);
    btnAuto.textContent = "▶ automatisch";
    btnAuto.setAttribute("aria-pressed", "false");
  }

  function setzeStufe(id) {
    stufe = id;
    offen = -1;
    stoppeAuto();
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* egal */ }
    document.querySelectorAll("#stufen .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.id === id)));
    zeichneNetz();
    lauf++;
    schritt = 0;
    z = neuerZustand();
    zeichneSchritt();
    zeichneLog();
    zeichneBrowser();
  }

  /* ---------- Bedienung ---------- */
  const stufenEl = document.getElementById("stufen");
  stufenEl.replaceChildren(...STUFEN.map(st => h("button", {
    class: "chip", type: "button", "data-id": st.id, text: st.titel, "aria-pressed": "false",
    onclick: () => { if (st.id !== stufe) { setzeStufe(st.id); gehe(0); } }
  })));

  btnWeiter.addEventListener("click", () => { stoppeAuto(); gehe(schritt + 1); });
  btnZurueck.addEventListener("click", () => { stoppeAuto(); gehe(schritt - 1); });
  document.getElementById("btnNochmal").addEventListener("click", () => { stoppeAuto(); gehe(schritt); });
  btnAuto.addEventListener("click", () => {
    if (auto) return stoppeAuto();
    auto = true;
    btnAuto.textContent = "❚❚ pause";
    btnAuto.setAttribute("aria-pressed", "true");
    gehe(schritt === ABLAUF[stufe].length - 1 ? 0 : schritt + 1);
  });
  const btnTempo = document.getElementById("btnTempo");
  btnTempo.addEventListener("click", () => {
    tempo = tempo === 1 ? 0.5 : 1;
    btnTempo.textContent = "tempo: " + (tempo === 1 ? "normal" : "langsam");
  });
  document.addEventListener("keydown", e => {
    if (e.target.closest("input, textarea, [contenteditable]")) return;
    if (e.key === "ArrowRight" && !btnWeiter.disabled) { stoppeAuto(); gehe(schritt + 1); }
    if (e.key === "ArrowLeft" && !btnZurueck.disabled) { stoppeAuto(); gehe(schritt - 1); }
  });

  // Symbole und Schrift im Netzbild bleiben auf jedem Bildschirm etwa gleich groß
  function messe() {
    const breite = netzEl.clientWidth || 1000;
    k = 1000 / breite * Math.min(1, Math.max(0.62, breite / 640));
    netzEl.style.setProperty("--k", k.toFixed(3));
  }
  messe();
  new ResizeObserver(messe).observe(netzEl);

  const start = location.hash.slice(1);
  setzeStufe(ABLAUF[start] ? start : "mittel");
  gehe(0);
})();
