/* ==========================================================
   netzkarte.js – Logik für netzkarte.html
   Inhalte (Knoten, Leitungen, Texte) stehen in STUFEN und TOUR.
   Kartenumrisse kommen aus netzkarte-daten.js (KARTEN).
   Alles ist eine vereinfachte Veranschaulichung, kein echtes Abbild.
   ========================================================== */

(function () {
  "use strict";

  /* ==========================================================
     Inhalte
     Knoten: Karten-Stufen mit lon/lat, Schema-Stufen mit x/y (Bild 1000 × 600)
       art   ixp | knoten | lande | rz | extern (Karte)
             oder ein Symbol aus ICONS (Schema)
       lp    Lage der Beschriftung: r (Standard) | l | t | b
       zoom  true = Klick zoomt in die nächste Stufe
       mini  true = kleines Symbol ohne Beschriftung (Geräte im Gebäudenetz)
     Leitungen: [von, nach, typ, { kurve, knick }]
       typ   see | backbone | glas | kupfer | lan | wlan | funk
     ========================================================== */

  const STUFEN = {
    welt: {
      titel: "Die Welt",
      kurz: "welt",
      karte: "welt",
      weiter: "europa",
      zielLabel: { text: "Europa ▸", lon: 14, lat: 63 },
      hint: "Klicke auf Europa, um hineinzuzoomen.",
      text: "Die Kontinente sind über <b>Seekabel</b> verbunden – Glasfaserkabel, die auf dem Meeresboden liegen. Über sie läuft fast der gesamte Datenverkehr zwischen den Kontinenten, Satelliten spielen nur eine kleine Rolle. An Land verbinden <b>Backbone-Leitungen</b> die großen Internetknoten.",
      beschriftungen: [
        { text: "ATLANTIK", lon: -38, lat: 28, meer: true },
        { text: "PAZIFIK", lon: -140, lat: 5, meer: true },
        { text: "INDISCHER OZEAN", lon: 78, lat: -22, meer: true },
        { text: "Nordamerika", lon: -108, lat: 56 },
        { text: "Südamerika", lon: -60, lat: -14 },
        { text: "Afrika", lon: 20, lat: 8 },
        { text: "Asien", lon: 95, lat: 50 },
        { text: "Australien", lon: 134, lat: -25 }
      ],
      knoten: {
        newyork: { name: "New York", art: "ixp", lon: -74, lat: 40.7, lp: "t", info: "Großer Internetknoten an der Ostküste der USA. Hier kommen viele Seekabel aus Europa an." },
        ashburn: { name: "Ashburn", art: "rz", lon: -77.5, lat: 39, lp: "b", info: "In Ashburn (Virginia) stehen so viele Rechenzentren wie kaum irgendwo sonst. Viele Webseiten und Cloud-Dienste laufen hier." },
        siliconvalley: { name: "Silicon Valley", art: "ixp", lon: -122, lat: 37.4, lp: "b", info: "Sitz vieler großer Tech-Firmen und Rechenzentren an der Westküste der USA. Von hier führen Seekabel über den Pazifik." },
        miami: { name: "Miami", art: "lande", lon: -80.2, lat: 25.8, lp: "l", info: "Landestation für Seekabel nach Südamerika und in die Karibik." },
        fortaleza: { name: "Fortaleza", art: "lande", lon: -38.5, lat: -3.7, info: "An der Nordostspitze Brasiliens landen Seekabel aus Nordamerika, Europa und Afrika." },
        saopaulo: { name: "São Paulo", art: "ixp", lon: -46.6, lat: -23.5, lp: "l", info: "Der größte Internetknoten Südamerikas." },
        lissabon: { name: "Lissabon", art: "lande", lon: -9.1, lat: 38.7, lp: "l", info: "Landestation für Seekabel nach Südamerika und Afrika." },
        london: { name: "London", art: "ixp", lon: -0.1, lat: 51.5, lp: "l", info: "Großer Internetknoten in Europa und Endpunkt vieler Seekabel aus Amerika." },
        frankfurt: { name: "Frankfurt", art: "ixp", lon: 8.7, lat: 50.1, info: "Am DE-CIX in Frankfurt tauschen hunderte Netzbetreiber Daten aus – einer der größten Internetknoten der Welt." },
        marseille: { name: "Marseille", art: "lande", lon: 5.4, lat: 43.3, lp: "b", info: "Drehkreuz für Seekabel durchs Mittelmeer nach Afrika, Asien und in den Nahen Osten." },
        lagos: { name: "Lagos", art: "knoten", lon: 3.4, lat: 6.5, lp: "b", info: "Wichtiger Internetknoten in Westafrika." },
        kapstadt: { name: "Kapstadt", art: "lande", lon: 18.4, lat: -33.9, lp: "b", info: "Landestation an der Südspitze Afrikas – Seekabel führen von hier entlang beider Küsten." },
        kairo: { name: "Kairo", art: "knoten", lon: 31.2, lat: 30, lp: "b", info: "Fast alle Kabel zwischen Europa und Asien führen durch Ägypten: vom Mittelmeer über Land zum Roten Meer." },
        dubai: { name: "Dubai", art: "knoten", lon: 55.3, lat: 25.2, lp: "t", info: "Knoten am Persischen Golf zwischen Europa, Afrika und Asien." },
        mumbai: { name: "Mumbai", art: "lande", lon: 72.9, lat: 19.1, lp: "l", info: "Wichtigste Landestation Indiens für Seekabel." },
        singapur: { name: "Singapur", art: "ixp", lon: 103.8, lat: 1.35, lp: "b", info: "Drehkreuz Südostasiens: Hier treffen sich Dutzende Seekabel." },
        hongkong: { name: "Hongkong", art: "ixp", lon: 114.2, lat: 22.3, lp: "l", info: "Großer Internetknoten in Ostasien." },
        tokio: { name: "Tokio", art: "ixp", lon: 139.7, lat: 35.7, lp: "t", info: "Internetknoten in Japan. Seekabel führen von hier über den Pazifik in die USA." },
        sydney: { name: "Sydney", art: "lande", lon: 151.2, lat: -33.9, lp: "l", info: "Australien ist fast nur über Seekabel mit dem Rest der Welt verbunden." },
        chicago: { name: "Chicago", art: "knoten", lon: -87.6, lat: 41.9, lp: "l", info: "Knoten im Mittleren Westen der USA. Hier kreuzen sich die Fernleitungen zwischen Ost- und Westküste." },
        seattle: { name: "Seattle", art: "lande", lon: -122.3, lat: 47.6, lp: "l", info: "Landestation an der Nordwestküste der USA für Seekabel nach Japan und Asien." },
        hawaii: { name: "Hawaii", art: "lande", lon: -158, lat: 21.3, lp: "t", info: "Zwischenstation mitten im Pazifik: Viele Seekabel zwischen Amerika, Asien und Australien legen hier einen Halt ein." },
        guam: { name: "Guam", art: "lande", lon: 144.8, lat: 13.4, lp: "r", info: "Kleine Insel im Westpazifik – ein wichtiges Drehkreuz für Seekabel nach Asien und Australien." },
        shanghai: { name: "Shanghai", art: "ixp", lon: 121.5, lat: 31.2, lp: "t", info: "Großer Internetknoten in China. Von hier führen Seekabel nach Japan, in die USA und nach Südostasien." },
        moskau: { name: "Moskau", art: "knoten", lon: 37.6, lat: 55.8, info: "Knoten in Russland. Über Landleitungen geht es quer durch Asien bis nach China." },
        dschibuti: { name: "Dschibuti", art: "lande", lon: 43.1, lat: 11.6, info: "Am Ausgang des Roten Meeres: Hier landen viele Seekabel zwischen Europa, Afrika und Asien." },
        mombasa: { name: "Mombasa", art: "lande", lon: 39.7, lat: -4, info: "Wichtigste Landestation Ostafrikas in Kenia." },
        chennai: { name: "Chennai", art: "lande", lon: 80.3, lat: 13.1, info: "Landestation an der Ostküste Indiens für Seekabel nach Südostasien." },
        perth: { name: "Perth", art: "lande", lon: 115.9, lat: -32, lp: "l", info: "Landestation an der Westküste Australiens mit Seekabeln nach Singapur." },
        auckland: { name: "Auckland", art: "lande", lon: 174.8, lat: -36.8, lp: "b", info: "Neuseeland ist über Seekabel mit Australien und Amerika verbunden." },
        buenosaires: { name: "Buenos Aires", art: "knoten", lon: -58.4, lat: -34.6, lp: "b", info: "Internetknoten in Argentinien, über Land und Seekabel mit Brasilien verbunden." }
      },
      links: [
        ["newyork", "london", "see", { kurve: -0.12 }],
        ["newyork", "ashburn", "backbone"],
        ["ashburn", "siliconvalley", "backbone"],
        ["ashburn", "miami", "backbone"],
        ["miami", "fortaleza", "see", { kurve: -0.1 }],
        ["fortaleza", "saopaulo", "backbone"],
        ["fortaleza", "lissabon", "see"],
        ["lissabon", "frankfurt", "backbone"],
        ["london", "frankfurt", "backbone"],
        ["frankfurt", "marseille", "backbone"],
        ["marseille", "kairo", "see", { kurve: -0.08 }],
        ["kairo", "dubai", "see", { kurve: 0.2 }],
        ["dubai", "mumbai", "see"],
        ["mumbai", "singapur", "see", { kurve: 0.1 }],
        ["singapur", "hongkong", "see"],
        ["hongkong", "tokio", "see"],
        ["tokio", "siliconvalley", "see"],
        ["siliconvalley", "sydney", "see"],
        ["singapur", "sydney", "see"],
        ["london", "lagos", "see", { kurve: 0.2 }],
        ["lagos", "kapstadt", "see", { kurve: 0.15 }],
        ["kapstadt", "mumbai", "see", { kurve: 0.1 }],
        ["newyork", "chicago", "backbone"],
        ["chicago", "siliconvalley", "backbone"],
        ["seattle", "siliconvalley", "backbone"],
        ["seattle", "tokio", "see"],
        ["siliconvalley", "hawaii", "see"],
        ["hawaii", "guam", "see"],
        ["guam", "hongkong", "see"],
        ["hawaii", "auckland", "see"],
        ["auckland", "sydney", "see"],
        ["tokio", "shanghai", "see"],
        ["shanghai", "hongkong", "backbone"],
        ["frankfurt", "moskau", "backbone"],
        ["moskau", "shanghai", "backbone"],
        ["kairo", "dschibuti", "see"],
        ["dschibuti", "mumbai", "see"],
        ["dschibuti", "mombasa", "see"],
        ["mombasa", "kapstadt", "see", { kurve: 0.1 }],
        ["mumbai", "chennai", "backbone"],
        ["chennai", "singapur", "see"],
        ["singapur", "perth", "see"],
        ["perth", "sydney", "backbone"],
        ["saopaulo", "buenosaires", "backbone"],
        ["fortaleza", "lagos", "see"]
      ]
    },

    europa: {
      titel: "Europa",
      kurz: "europa",
      karte: "europa",
      weiter: "deutschland",
      zielLabel: { text: "Deutschland ▸", lon: 10.4, lat: 51.6 },
      hint: "Klicke auf Deutschland, um hineinzuzoomen.",
      text: "In Europa treffen sich die Netze vieler Anbieter an großen <b>Internetknoten</b> (IXP, Internet Exchange Point) wie Frankfurt, Amsterdam und London. Dort tauschen sie Daten direkt untereinander aus. Die Seekabel nach Amerika, Afrika und Asien landen an der Küste.",
      beschriftungen: [
        { text: "ATLANTIK", lon: -17, lat: 45, meer: true },
        { text: "NORDSEE", lon: 3.5, lat: 56, meer: true },
        { text: "OSTSEE", lon: 19.5, lat: 57, meer: true },
        { text: "MITTELMEER", lon: 17, lat: 36.3, meer: true }
      ],
      knoten: {
        frankfurt: { name: "Frankfurt", art: "ixp", lon: 8.7, lat: 50.1, lp: "l", info: "Am DE-CIX in Frankfurt sind über tausend Netze angeschlossen. Wer hier Daten austauscht, spart Umwege." },
        amsterdam: { name: "Amsterdam", art: "ixp", lon: 4.9, lat: 52.4, lp: "t", info: "Am AMS-IX in Amsterdam tauschen Netzbetreiber aus ganz Europa Daten aus." },
        london: { name: "London", art: "ixp", lon: -0.1, lat: 51.5, lp: "l", info: "Am LINX in London beginnen viele Seekabel nach Nordamerika." },
        dublin: { name: "Dublin", art: "rz", lon: -6.3, lat: 53.35, lp: "l", info: "Viele große Cloud-Anbieter betreiben in Irland Rechenzentren." },
        paris: { name: "Paris", art: "knoten", lon: 2.35, lat: 48.86, lp: "l", info: "Wichtiger Knoten in Frankreich." },
        marseille: { name: "Marseille", art: "lande", lon: 5.4, lat: 43.3, lp: "b", info: "Hier landen die Seekabel aus Afrika, Asien und dem Nahen Osten." },
        madrid: { name: "Madrid", art: "knoten", lon: -3.7, lat: 40.4, lp: "b", info: "Knoten auf der Iberischen Halbinsel." },
        lissabon: { name: "Lissabon", art: "lande", lon: -9.1, lat: 38.7, lp: "b", info: "Landestation für Seekabel nach Südamerika und Afrika." },
        mailand: { name: "Mailand", art: "knoten", lon: 9.2, lat: 45.5, lp: "b", info: "Wichtigster Internetknoten Italiens." },
        zuerich: { name: "Zürich", art: "knoten", lon: 8.5, lat: 47.4, lp: "l", info: "Knoten in der Schweiz." },
        wien: { name: "Wien", art: "knoten", lon: 16.4, lat: 48.2, lp: "b", info: "Knoten in Österreich, Verbindung nach Südosteuropa." },
        prag: { name: "Prag", art: "knoten", lon: 14.4, lat: 50.1, info: "Knoten in Tschechien." },
        warschau: { name: "Warschau", art: "knoten", lon: 21, lat: 52.2, lp: "b", info: "Knoten in Polen, Verbindung nach Osteuropa." },
        kopenhagen: { name: "Kopenhagen", art: "knoten", lon: 12.6, lat: 55.7, info: "Knoten in Dänemark, Verbindung nach Skandinavien." },
        stockholm: { name: "Stockholm", art: "ixp", lon: 18.1, lat: 59.3, info: "Internetknoten in Skandinavien." },
        ex_amerika: { name: "→ Nordamerika", art: "extern", lon: -19, lat: 51.5, lp: "b", info: "Seekabel durch den Atlantik nach New York und Virginia." },
        ex_suedamerika: { name: "→ Südamerika", art: "extern", lon: -19, lat: 37.5, lp: "b", info: "Seekabel nach Brasilien." },
        ex_asien_see: { name: "→ Afrika & Asien", art: "extern", lon: 28, lat: 35.3, lp: "l", info: "Seekabel durch das Mittelmeer nach Ägypten und weiter nach Asien." },
        ex_asien: { name: "→ Osteuropa & Asien", art: "extern", lon: 40, lat: 56.5, lp: "b", info: "Landleitungen nach Osten." },
        berlin: { name: "Berlin", art: "knoten", lon: 13.4, lat: 52.5, info: "Knoten in Ostdeutschland, Verbindung nach Polen." },
        oslo: { name: "Oslo", art: "knoten", lon: 10.75, lat: 59.9, lp: "l", info: "Knoten in Norwegen." },
        helsinki: { name: "Helsinki", art: "knoten", lon: 24.9, lat: 60.2, info: "Knoten in Finnland. Ein Seekabel durch die Ostsee führt direkt nach Deutschland." },
        budapest: { name: "Budapest", art: "knoten", lon: 19, lat: 47.5, info: "Knoten in Ungarn." },
        bukarest: { name: "Bukarest", art: "knoten", lon: 26.1, lat: 44.4, info: "Knoten in Rumänien, Verbindung Richtung Türkei." },
        athen: { name: "Athen", art: "lande", lon: 23.7, lat: 38, lp: "b", info: "Landestation für Seekabel im östlichen Mittelmeer." },
        palermo: { name: "Palermo", art: "lande", lon: 13.4, lat: 38.1, lp: "l", info: "Sizilien liegt mitten im Mittelmeer – viele Seekabel zwischen Europa, Afrika und Asien landen hier." },
        barcelona: { name: "Barcelona", art: "knoten", lon: 2.2, lat: 41.4, lp: "b", info: "Knoten in Spanien am Mittelmeer." },
        bilbao: { name: "Bilbao", art: "lande", lon: -2.9, lat: 43.3, lp: "t", info: "Hier landet ein modernes Seekabel aus den USA (Virginia)." },
        ex_tuerkei: { name: "→ Türkei & Nahost", art: "extern", lon: 34, lat: 41, lp: "b", info: "Landleitungen über die Türkei in den Nahen Osten." }
      },
      links: [
        ["london", "amsterdam", "backbone"],
        ["london", "paris", "backbone"],
        ["london", "dublin", "backbone"],
        ["amsterdam", "frankfurt", "backbone"],
        ["frankfurt", "paris", "backbone"],
        ["paris", "marseille", "backbone"],
        ["paris", "madrid", "backbone"],
        ["madrid", "lissabon", "backbone"],
        ["madrid", "marseille", "backbone"],
        ["marseille", "mailand", "backbone"],
        ["frankfurt", "zuerich", "backbone"],
        ["zuerich", "mailand", "backbone"],
        ["frankfurt", "prag", "backbone"],
        ["prag", "wien", "backbone"],
        ["mailand", "wien", "backbone"],
        ["prag", "warschau", "backbone"],
        ["amsterdam", "kopenhagen", "backbone"],
        ["frankfurt", "kopenhagen", "backbone"],
        ["kopenhagen", "stockholm", "backbone"],
        ["london", "ex_amerika", "see"],
        ["dublin", "ex_amerika", "see"],
        ["lissabon", "ex_suedamerika", "see"],
        ["marseille", "ex_asien_see", "see", { kurve: 0.06 }],
        ["warschau", "ex_asien", "backbone"],
        ["stockholm", "ex_asien", "backbone"],
        ["frankfurt", "berlin", "backbone"],
        ["berlin", "warschau", "backbone"],
        ["kopenhagen", "oslo", "backbone"],
        ["oslo", "stockholm", "backbone"],
        ["stockholm", "helsinki", "see"],
        ["helsinki", "ex_asien", "backbone"],
        ["wien", "budapest", "backbone"],
        ["budapest", "bukarest", "backbone"],
        ["bukarest", "ex_tuerkei", "backbone"],
        ["bukarest", "athen", "backbone"],
        ["athen", "ex_asien_see", "see"],
        ["mailand", "palermo", "backbone"],
        ["marseille", "palermo", "see"],
        ["palermo", "ex_asien_see", "see"],
        ["madrid", "barcelona", "backbone"],
        ["barcelona", "marseille", "backbone"],
        ["madrid", "bilbao", "backbone"],
        ["bilbao", "ex_amerika", "see"]
      ]
    },

    deutschland: {
      titel: "Deutschland",
      kurz: "deutschland",
      karte: "deutschland",
      weiter: "bw",
      zielLabel: { text: "Baden-Württemberg ▸", lon: 9.0, lat: 48.1 },
      hint: "Klicke auf Baden-Württemberg, um hineinzuzoomen.",
      text: "Zwischen den großen Städten liegen <b>Glasfaser-Fernleitungen</b> verschiedener Anbieter. Frankfurt ist der zentrale Knoten: Über den DE-CIX fließen zu Spitzenzeiten mehr als 10 Terabit pro Sekunde. Von den Grenzstädten geht es weiter in die Nachbarländer.",
      beschriftungen: [
        { text: "NORDSEE", lon: 7, lat: 54.4, meer: true },
        { text: "OSTSEE", lon: 12.2, lat: 54.75, meer: true }
      ],
      knoten: {
        frankfurt: { name: "Frankfurt (DE-CIX)", art: "ixp", lon: 8.7, lat: 50.1, lp: "l", info: "Der wichtigste Internetknoten Deutschlands. Hier sind über tausend Netze von Providern, Firmen und Hochschulen angeschlossen." },
        berlin: { name: "Berlin", art: "ixp", lon: 13.4, lat: 52.5, info: "Knoten für Ostdeutschland mit eigenem Austauschpunkt." },
        hamburg: { name: "Hamburg", art: "ixp", lon: 10, lat: 53.55, lp: "t", info: "Knoten für Norddeutschland, Verbindung nach Skandinavien." },
        hannover: { name: "Hannover", art: "knoten", lon: 9.7, lat: 52.4, info: "Knoten zwischen Nord, Süd und West." },
        duesseldorf: { name: "Düsseldorf", art: "ixp", lon: 6.8, lat: 51.2, lp: "l", info: "Knoten im Rheinland mit vielen Rechenzentren." },
        koeln: { name: "Köln", art: "knoten", lon: 7, lat: 50.9, lp: "b", info: "Knoten im Rheinland." },
        leipzig: { name: "Leipzig", art: "knoten", lon: 12.4, lat: 51.3, info: "Knoten in Mitteldeutschland." },
        nuernberg: { name: "Nürnberg", art: "rz", lon: 11.1, lat: 49.45, info: "Hier stehen große Rechenzentren von Hosting-Anbietern." },
        muenchen: { name: "München", art: "ixp", lon: 11.6, lat: 48.1, info: "Knoten für Süddeutschland, Verbindung nach Österreich." },
        stuttgart: { name: "Stuttgart", art: "knoten", lon: 9.2, lat: 48.8, info: "Wichtigster Knoten in Baden-Württemberg." },
        amsterdam: { name: "→ Amsterdam", art: "extern", lon: 4.9, lat: 52.4, lp: "t", info: "Verbindung zum Internetknoten in Amsterdam." },
        paris: { name: "→ Paris", art: "extern", lon: 2.35, lat: 48.86, lp: "b", info: "Verbindung nach Frankreich." },
        zuerich: { name: "→ Zürich", art: "extern", lon: 8.5, lat: 47.4, lp: "l", info: "Verbindung in die Schweiz." },
        wien: { name: "→ Wien", art: "extern", lon: 16.4, lat: 48.2, lp: "b", info: "Verbindung nach Österreich." },
        prag: { name: "→ Prag", art: "extern", lon: 14.4, lat: 50.1, info: "Verbindung nach Tschechien." },
        warschau: { name: "→ Warschau", art: "extern", lon: 20.9, lat: 52.2, lp: "l", info: "Verbindung nach Polen." },
        kopenhagen: { name: "→ Kopenhagen", art: "extern", lon: 12.6, lat: 55.15, info: "Verbindung nach Dänemark und Skandinavien." },
        bremen: { name: "Bremen", art: "knoten", lon: 8.8, lat: 53.1, lp: "l", info: "Knoten im Nordwesten." },
        rostock: { name: "Rostock", art: "lande", lon: 12.1, lat: 54.1, lp: "t", info: "Hier landet ein Seekabel, das durch die Ostsee direkt nach Finnland führt." },
        kassel: { name: "Kassel", art: "knoten", lon: 9.5, lat: 51.3, info: "Knoten in der Mitte Deutschlands zwischen Hannover und Frankfurt." },
        erfurt: { name: "Erfurt", art: "knoten", lon: 11.03, lat: 50.98, lp: "b", info: "Knoten in Thüringen." },
        dresden: { name: "Dresden", art: "knoten", lon: 13.74, lat: 51.05, info: "Knoten in Sachsen, Verbindung nach Tschechien." },
        karlsruhe: { name: "Karlsruhe", art: "knoten", lon: 8.4, lat: 49, lp: "l", info: "Knoten am Oberrhein, Verbindung nach Frankreich." },
        bruessel: { name: "→ Brüssel", art: "extern", lon: 4.35, lat: 50.85, lp: "b", info: "Verbindung nach Belgien." },
        helsinki: { name: "→ Helsinki", art: "extern", lon: 15.5, lat: 54.75, info: "Seekabel durch die Ostsee nach Finnland." }
      },
      links: [
        ["hamburg", "berlin", "backbone"],
        ["hamburg", "hannover", "backbone"],
        ["hannover", "berlin", "backbone"],
        ["hannover", "duesseldorf", "backbone"],
        ["hannover", "kassel", "backbone"],
        ["kassel", "frankfurt", "backbone"],
        ["duesseldorf", "koeln", "backbone"],
        ["duesseldorf", "frankfurt", "backbone"],
        ["koeln", "frankfurt", "backbone"],
        ["berlin", "leipzig", "backbone"],
        ["kassel", "erfurt", "backbone"],
        ["erfurt", "frankfurt", "backbone"],
        ["erfurt", "leipzig", "backbone"],
        ["erfurt", "nuernberg", "backbone"],
        ["leipzig", "nuernberg", "backbone"],
        ["frankfurt", "nuernberg", "backbone"],
        ["nuernberg", "muenchen", "backbone"],
        ["frankfurt", "stuttgart", "backbone"],
        ["stuttgart", "muenchen", "backbone"],
        ["duesseldorf", "amsterdam", "backbone"],
        ["frankfurt", "paris", "backbone"],
        ["stuttgart", "zuerich", "backbone"],
        ["muenchen", "wien", "backbone"],
        ["nuernberg", "prag", "backbone"],
        ["berlin", "warschau", "backbone"],
        ["hamburg", "kopenhagen", "backbone"],
        ["hamburg", "bremen", "backbone"],
        ["bremen", "hannover", "backbone"],
        ["bremen", "duesseldorf", "backbone"],
        ["hamburg", "rostock", "backbone"],
        ["rostock", "berlin", "backbone"],
        ["rostock", "helsinki", "see"],
        ["leipzig", "dresden", "backbone"],
        ["dresden", "berlin", "backbone"],
        ["dresden", "prag", "backbone"],
        ["frankfurt", "karlsruhe", "backbone"],
        ["karlsruhe", "stuttgart", "backbone"],
        ["karlsruhe", "paris", "backbone"],
        ["koeln", "bruessel", "backbone"]
      ]
    },

    bw: {
      titel: "Baden-Württemberg",
      kurz: "baden-württemberg",
      karte: "bw",
      weiter: "reutlingen",
      zielLabel: { text: "Landkreis Reutlingen ▸", lon: 9.38, lat: 48.3 },
      hint: "Klicke auf den Landkreis Reutlingen, um hineinzuzoomen.",
      text: "Auch innerhalb des Landes sind die Städte über Glasfaser verbunden. Wichtigster Knoten ist Stuttgart, von dort geht es weiter nach Frankfurt. Viele Hochschulen und Schulen in Baden-Württemberg sind über das Landesnetz <b>BelWü</b> angeschlossen.",
      beschriftungen: [
        { text: "Schwarzwald", lon: 8.2, lat: 48.25 },
        { text: "Schwäbische Alb", lon: 9.95, lat: 48.18 },
        { text: "Bodensee", lon: 9.5, lat: 47.56 },
        { text: "Frankreich", lon: 7.65, lat: 48.75 },
        { text: "Schweiz", lon: 7.85, lat: 47.53 },
        { text: "Bayern", lon: 10.7, lat: 48.7 },
        { text: "Hessen", lon: 9.65, lat: 49.72 }
      ],
      knoten: {
        stuttgart: { name: "Stuttgart", art: "ixp", lon: 9.18, lat: 48.78, info: "Wichtigster Netzknoten des Landes mit vielen Rechenzentren. Hier sitzt auch die Zentrale des Landesnetzes BelWü, das Hochschulen und Schulen verbindet." },
        karlsruhe: { name: "Karlsruhe", art: "knoten", lon: 8.4, lat: 49.01, lp: "l", info: "Knoten mit dem Karlsruher Institut für Technologie (KIT)." },
        mannheim: { name: "Mannheim", art: "knoten", lon: 8.47, lat: 49.49, lp: "l", info: "Knoten im Rhein-Neckar-Raum." },
        heidelberg: { name: "Heidelberg", art: "knoten", lon: 8.69, lat: 49.4, info: "Universitätsstadt am Neckar." },
        heilbronn: { name: "Heilbronn", art: "knoten", lon: 9.22, lat: 49.14, info: "Knoten im Norden des Landes." },
        pforzheim: { name: "Pforzheim", art: "knoten", lon: 8.7, lat: 48.89, lp: "b", info: "Knoten zwischen Karlsruhe und Stuttgart." },
        freiburg: { name: "Freiburg", art: "knoten", lon: 7.85, lat: 47.99, lp: "l", info: "Knoten im Südwesten." },
        konstanz: { name: "Konstanz", art: "knoten", lon: 9.17, lat: 47.68, lp: "l", info: "Knoten am Bodensee." },
        ravensburg: { name: "Ravensburg", art: "knoten", lon: 9.61, lat: 47.78, info: "Knoten in Oberschwaben." },
        ulm: { name: "Ulm", art: "knoten", lon: 9.99, lat: 48.4, info: "Knoten an der Grenze zu Bayern." },
        tuebingen: { name: "Tübingen", art: "knoten", lon: 9.06, lat: 48.52, lp: "l", info: "Universitätsstadt, direkt neben Reutlingen." },
        reutlingen: { name: "Reutlingen", art: "knoten", lon: 9.21, lat: 48.49, lp: "r", zoom: true, info: "Hier liegt die Steinbeisschule." },
        ex_frankfurt: { name: "→ Frankfurt", art: "extern", lon: 8.65, lat: 49.78, info: "Fernleitung zum DE-CIX nach Frankfurt." },
        muenchen: { name: "→ München", art: "extern", lon: 11.58, lat: 48.14, lp: "l", info: "Fernleitung nach Bayern." },
        zuerich: { name: "→ Zürich", art: "extern", lon: 8.54, lat: 47.5, lp: "r", info: "Verbindung in die Schweiz." },
        offenburg: { name: "Offenburg", art: "knoten", lon: 7.94, lat: 48.47, lp: "l", info: "Knoten in der Ortenau, Verbindung nach Straßburg." },
        villingen: { name: "Villingen-Schwenningen", art: "knoten", lon: 8.46, lat: 48.06, info: "Knoten im Schwarzwald-Baar-Kreis." },
        goeppingen: { name: "Göppingen", art: "knoten", lon: 9.65, lat: 48.7, info: "Knoten im Filstal zwischen Stuttgart und Ulm." },
        schwaebischhall: { name: "Schwäbisch Hall", art: "knoten", lon: 9.74, lat: 49.11, lp: "b", info: "Knoten im Nordosten des Landes." },
        aalen: { name: "Aalen", art: "knoten", lon: 10.09, lat: 48.84, info: "Knoten auf der Ostalb." },
        ex_strassburg: { name: "→ Straßburg", art: "extern", lon: 7.75, lat: 48.58, lp: "l", info: "Verbindung nach Frankreich." },
        ex_basel: { name: "→ Basel", art: "extern", lon: 7.59, lat: 47.56, lp: "l", info: "Verbindung in die Schweiz." },
        ex_wuerzburg: { name: "→ Würzburg", art: "extern", lon: 9.93, lat: 49.79, info: "Verbindung nach Nordbayern." },
        ex_nuernberg: { name: "→ Nürnberg", art: "extern", lon: 11.08, lat: 49.45, lp: "b", info: "Verbindung zu den Rechenzentren in Nürnberg." }
      },
      links: [
        ["stuttgart", "karlsruhe", "backbone"],
        ["karlsruhe", "mannheim", "backbone"],
        ["mannheim", "heidelberg", "backbone"],
        ["heidelberg", "heilbronn", "backbone"],
        ["heilbronn", "stuttgart", "backbone"],
        ["karlsruhe", "pforzheim", "backbone"],
        ["pforzheim", "stuttgart", "backbone"],
        ["karlsruhe", "offenburg", "backbone"],
        ["offenburg", "freiburg", "backbone"],
        ["freiburg", "konstanz", "backbone"],
        ["konstanz", "ravensburg", "backbone"],
        ["ravensburg", "ulm", "backbone"],
        ["ulm", "stuttgart", "backbone"],
        ["stuttgart", "tuebingen", "backbone"],
        ["tuebingen", "reutlingen", "glas"],
        ["stuttgart", "reutlingen", "backbone"],
        ["stuttgart", "ex_frankfurt", "backbone"],
        ["mannheim", "ex_frankfurt", "backbone"],
        ["ulm", "muenchen", "backbone"],
        ["konstanz", "zuerich", "backbone"],
        ["offenburg", "ex_strassburg", "backbone"],
        ["freiburg", "ex_basel", "backbone"],
        ["freiburg", "villingen", "backbone"],
        ["villingen", "konstanz", "backbone"],
        ["villingen", "tuebingen", "backbone"],
        ["stuttgart", "goeppingen", "backbone"],
        ["goeppingen", "ulm", "backbone"],
        ["heilbronn", "schwaebischhall", "backbone"],
        ["schwaebischhall", "aalen", "backbone"],
        ["aalen", "ulm", "backbone"],
        ["aalen", "ex_nuernberg", "backbone"],
        ["heilbronn", "ex_wuerzburg", "backbone"],
        ["reutlingen", "ulm", "glas"]
      ]
    },

    reutlingen: {
      titel: "Reutlingen",
      kurz: "reutlingen",
      weiter: "lan",
      hint: "Klicke auf die Steinbeisschule, um hineinzuzoomen.",
      text: "In der Stadt verteilt der <b>Netzknoten des Providers</b> (PoP, Point of Presence) das Internet. Firmen, Schulen und die Hochschule bekommen meist eine eigene Glasfaser. Wohnhäuser hängen über einen <b>Kabelverzweiger</b> am Straßenrand am Netz – per Kupferkabel (DSL) oder Glasfaser bis ins Haus. Handys nutzen Mobilfunkmasten, die selbst per Glasfaser angebunden sind. In Hochschule, Klinikum und Schule hängen alle Geräte an einem zentralen <b>Switch</b> – eine <b>Stern-Topologie</b>.",
      hintergrund: "stadt",
      knoten: {
        pop: { name: "Netzknoten (PoP)", art: "rz", x: 500, y: 290, lp: "r", info: "Point of Presence: Hier kommen die Leitungen aus der Stadt zusammen und gehen ins Netz des Providers über – Richtung Stuttgart und Tübingen." },
        ex_stuttgart: { name: "→ Stuttgart", art: "extern", x: 920, y: 70, lp: "l", info: "Backbone-Leitung zum großen Knoten nach Stuttgart." },
        ex_tuebingen: { name: "→ Tübingen", art: "extern", x: 80, y: 70, lp: "r", info: "Zweite Leitung nach Tübingen. Fällt eine Leitung aus, läuft der Verkehr über die andere (Redundanz)." },
        hochschule: { name: "Hochschule", art: "schule", x: 250, y: 180, lp: "b", info: "Die Hochschule Reutlingen ist mit eigener Glasfaser angeschlossen. Innen verteilt ein Switch die Daten sternförmig an die Geräte." },
        rathaus: { name: "Rathaus", art: "gebaeude", x: 540, y: 120, lp: "r", info: "Die Stadtverwaltung betreibt ein eigenes Netz für ihre Gebäude." },
        klinik: { name: "Klinikum", art: "klinik", x: 790, y: 210, lp: "b", info: "Krankenhäuser brauchen besonders ausfallsichere Leitungen. Innen verteilt ein Switch die Daten sternförmig an die Geräte." },
        firma: { name: "Gewerbegebiet", art: "firma", x: 810, y: 390, lp: "r", info: "Firmen haben oft Glasfaser mit garantierter Bandbreite." },
        mast: { name: "Mobilfunkmast", art: "mast", x: 640, y: 440, lp: "r", info: "Funkt per 4G/5G zu den Handys. Der Mast selbst ist per Glasfaser am Netzknoten angeschlossen." },
        handy: { name: "Smartphone", art: "handy", x: 760, y: 510, lp: "r", klein: true, info: "Verbindet sich per Funk mit dem nächsten Mobilfunkmast." },
        kvz: { name: "Kabelverzweiger", art: "kvz", x: 420, y: 440, lp: "b", info: "Der graue Kasten am Straßenrand: Hier werden die Leitungen zu den einzelnen Häusern verteilt." },
        haus1: { name: "Wohnhaus (DSL)", art: "haus", x: 310, y: 530, lp: "b", klein: true, info: "Altes Kupfer-Telefonkabel bis ins Haus (DSL). Je länger die Leitung, desto langsamer." },
        haus2: { name: "Wohnhaus (Glasfaser)", art: "haus", x: 530, y: 530, lp: "r", klein: true, info: "Glasfaser bis ins Haus (FTTH, Fiber to the Home) – deutlich schneller als DSL." },
        schule: { name: "Steinbeisschule", art: "schule", x: 200, y: 390, lp: "l", zoom: true, info: "Die Schule ist per Glasfaser am Netzknoten angeschlossen. Klicke, um ins Schulnetz zu zoomen." },
        // Lokale Netze als Stern: Gebäude → Switch → Geräte
        hs_sw: { name: "Switch (Hochschule)", art: "switch", x: 150, y: 205, mini: true, info: "Zentraler Switch im Netz der Hochschule. Alle Geräte hängen mit einem eigenen Kabel an ihm – eine Stern-Topologie. Fällt ein Kabel aus, ist nur ein Gerät betroffen." },
        hs_pc1: { name: "PC im Labor", art: "pc", x: 150, y: 150, mini: true, info: "Ein PC im Rechnerlabor der Hochschule." },
        hs_pc2: { name: "PC in der Bibliothek", art: "pc", x: 98, y: 180, mini: true, info: "Ein Recherche-PC in der Bibliothek." },
        hs_server: { name: "Server (Hochschule)", art: "server", x: 98, y: 232, mini: true, info: "Server der Hochschule, z. B. für die Lernplattform und E-Mail." },
        hs_ap: { name: "Access Point (Hochschule)", art: "ap", x: 150, y: 260, mini: true, info: "WLAN für Studierende im Hörsaal." },
        kl_sw: { name: "Switch (Klinikum)", art: "switch", x: 885, y: 180, mini: true, info: "Zentraler Switch im Netz des Klinikums. Alle Geräte hängen sternförmig an ihm (Stern-Topologie)." },
        kl_pc1: { name: "PC auf Station", art: "pc", x: 842, y: 138, mini: true, info: "PC im Stationszimmer für Patientenakten." },
        kl_server: { name: "Server (Klinikum)", art: "server", x: 922, y: 135, mini: true, info: "Hier liegen die Patientendaten – besonders gut geschützt." },
        kl_pc2: { name: "PC in der Aufnahme", art: "pc", x: 938, y: 195, mini: true, info: "PC an der Patientenaufnahme." },
        kl_drucker: { name: "Drucker (Klinikum)", art: "drucker", x: 895, y: 235, mini: true, info: "Netzwerkdrucker im Klinikum." },
        sb_sw: { name: "Switch (Steinbeisschule)", art: "switch", x: 200, y: 480, mini: true, info: "Im Schulnetz laufen alle Leitungen sternförmig an Switches zusammen (Stern-Topologie). Wie das genau aussieht, siehst du, wenn du auf die Steinbeisschule klickst." },
        sb_pc1: { name: "PC (Steinbeisschule)", art: "pc", x: 145, y: 455, mini: true, info: "Ein PC im Computerraum." },
        sb_pc2: { name: "Lehrer-PC (Steinbeisschule)", art: "pc", x: 140, y: 512, mini: true, info: "Der PC am Lehrerpult." },
        sb_drucker: { name: "Drucker (Steinbeisschule)", art: "drucker", x: 182, y: 540, mini: true, info: "Netzwerkdrucker der Schule." },
        sb_ap: { name: "Access Point (Steinbeisschule)", art: "ap", x: 242, y: 532, mini: true, info: "WLAN im Klassenzimmer." }
      },
      links: [
        ["pop", "ex_stuttgart", "backbone"],
        ["pop", "ex_tuebingen", "backbone", { kurve: 0.12 }],
        ["pop", "hochschule", "glas"],
        ["pop", "rathaus", "glas"],
        ["pop", "klinik", "glas"],
        ["pop", "firma", "glas"],
        ["pop", "mast", "glas"],
        ["pop", "kvz", "glas"],
        ["pop", "schule", "glas"],
        ["kvz", "haus1", "kupfer"],
        ["kvz", "haus2", "glas"],
        ["mast", "handy", "funk"],
        ["hochschule", "hs_sw", "lan"],
        ["hs_sw", "hs_pc1", "lan"],
        ["hs_sw", "hs_pc2", "lan"],
        ["hs_sw", "hs_server", "lan"],
        ["hs_sw", "hs_ap", "lan"],
        ["klinik", "kl_sw", "lan"],
        ["kl_sw", "kl_pc1", "lan"],
        ["kl_sw", "kl_server", "lan"],
        ["kl_sw", "kl_pc2", "lan"],
        ["kl_sw", "kl_drucker", "lan"],
        ["schule", "sb_sw", "lan"],
        ["sb_sw", "sb_pc1", "lan"],
        ["sb_sw", "sb_pc2", "lan"],
        ["sb_sw", "sb_drucker", "lan"],
        ["sb_sw", "sb_ap", "lan"]
      ]
    },

    lan: {
      titel: "Netz der Steinbeisschule",
      kurz: "steinbeisschule",
      hint: "Klicke auf ein Gerät, um mehr zu erfahren.",
      text: "Das <b>lokale Netz</b> (LAN) der Schule – als Beispiel. Der <b>Router</b> verbindet es mit dem Internet, die <b>Firewall</b> filtert unerwünschten Verkehr. <b>Switches</b> verteilen die Daten per Kabel in die Stockwerke, <b>Access Points</b> per WLAN. Jedes Gerät bekommt vom Schulserver (DHCP) eine private IP-Adresse. Mehr dazu: <a href=\"ipv4.html\">IPv4 &amp; Subnetze</a>.",
      hintergrund: "gebaeude",
      knoten: {
        inet: { name: "Internet", art: "wolke", x: 95, y: 52, lp: "r", info: "Über die Glasfaser des Providers ist die Schule mit dem Rest der Welt verbunden." },
        router: { name: "Router", art: "router", x: 95, y: 190, lp: "r", ip: "203.0.113.10 / 10.0.0.1", info: "Verbindet das Schulnetz mit dem Internet. Nach außen hat die Schule eine einzige öffentliche IP-Adresse, innen viele private (NAT)." },
        fw: { name: "Firewall", art: "firewall", x: 95, y: 320, lp: "b", ip: "10.0.0.2", info: "Prüft jedes Paket und blockt unerwünschten Verkehr, z. B. Angriffe von außen oder gesperrte Seiten." },
        core: { name: "Core-Switch", art: "switch", x: 250, y: 320, lp: "t", info: "Das Herz des Schulnetzes: Hier laufen alle Etagen zusammen. Er trennt das Netz außerdem in mehrere VLANs (Verwaltung, Unterricht, WLAN)." },
        server: { name: "Schulserver", art: "server", x: 250, y: 465, lp: "b", ip: "10.0.10.5", info: "Verteilt IP-Adressen (DHCP), übersetzt Namen in Adressen (DNS) und speichert Dateien der Schülerinnen und Schüler." },
        sw2: { name: "Switch 2. OG", art: "switch", x: 470, y: 215, lp: "t", info: "Etagen-Switch: verteilt die Daten an die Geräte im 2. Stock." },
        pc21: { name: "PC 1", art: "pc", x: 590, y: 168, lp: "t", ip: "10.20.12.21", hop: "PC im Computerraum", info: "Ein PC im Computerraum. Seine IP-Adresse hat er automatisch vom DHCP-Server bekommen." },
        pc22: { name: "PC 2", art: "pc", x: 690, y: 168, lp: "t", ip: "10.20.12.22", info: "Ein PC im Computerraum." },
        pc23: { name: "PC 3", art: "pc", x: 790, y: 168, lp: "t", ip: "10.20.12.23", info: "Ein PC im Computerraum." },
        drucker2: { name: "Drucker", art: "drucker", x: 895, y: 168, lp: "t", ip: "10.20.12.50", info: "Netzwerkdrucker: Alle PCs im Raum können darauf drucken." },
        sw1: { name: "Switch 1. OG", art: "switch", x: 470, y: 365, lp: "t", info: "Etagen-Switch: verteilt die Daten an die Geräte im 1. Stock." },
        ap1: { name: "Access Point", art: "ap", x: 610, y: 318, lp: "t", ip: "10.0.30.11", info: "WLAN-Zugangspunkt: wandelt Kabel-Netzwerk in Funk um. Laptops und Handys verbinden sich hier." },
        laptop1: { name: "Laptop", art: "laptop", x: 720, y: 398, lp: "r", ip: "10.30.4.17", info: "Ein Schüler-Laptop im WLAN." },
        handy1: { name: "Smartphone", art: "handy", x: 850, y: 398, lp: "r", ip: "10.30.4.88", info: "Ein Smartphone im WLAN. Es bekommt eine Adresse aus dem WLAN-Bereich 10.30.x.x." },
        lehrerpc: { name: "Lehrer-PC", art: "pc", x: 900, y: 318, lp: "t", ip: "10.20.1.15", info: "Der PC am Lehrerpult mit Beamer." },
        sw0: { name: "Switch EG", art: "switch", x: 470, y: 515, lp: "t", info: "Etagen-Switch: verteilt die Daten an die Geräte im Erdgeschoss." },
        sekretariat: { name: "Verwaltung", art: "pc", x: 600, y: 470, lp: "t", ip: "10.10.0.21", info: "PC im Sekretariat. Das Verwaltungsnetz (10.10.x.x) ist vom Unterrichtsnetz getrennt (eigenes VLAN) – so kommt niemand von einem Schüler-PC an Noten oder Personaldaten." },
        drucker0: { name: "Drucker", art: "drucker", x: 720, y: 470, lp: "t", ip: "10.10.0.50", info: "Drucker im Verwaltungsnetz." },
        ap0: { name: "Access Point", art: "ap", x: 840, y: 470, lp: "t", ip: "10.0.30.10", info: "WLAN im Lehrerzimmer." },
        tablet: { name: "Tablet", art: "tablet", x: 930, y: 540, lp: "t", ip: "10.30.2.7", info: "Ein Tablet im WLAN des Lehrerzimmers." }
      },
      links: [
        ["inet", "router", "glas"],
        ["router", "fw", "lan"],
        ["fw", "core", "lan"],
        ["core", "server", "lan"],
        ["core", "sw2", "lan", { knick: 430 }],
        ["core", "sw1", "lan", { knick: 430 }],
        ["core", "sw0", "lan", { knick: 430 }],
        ["sw2", "pc21", "lan", { knick: true }],
        ["sw2", "pc22", "lan", { knick: true }],
        ["sw2", "pc23", "lan", { knick: true }],
        ["sw2", "drucker2", "lan", { knick: true }],
        ["sw1", "ap1", "lan", { knick: true }],
        ["sw1", "lehrerpc", "lan", { knick: true }],
        ["ap1", "laptop1", "wlan"],
        ["ap1", "handy1", "wlan"],
        ["sw0", "sekretariat", "lan", { knick: true }],
        ["sw0", "drucker0", "lan", { knick: true }],
        ["sw0", "ap0", "lan", { knick: true }],
        ["ap0", "tablet", "wlan"]
      ]
    }
  };

  const REIHE = ["welt", "europa", "deutschland", "bw", "reutlingen", "lan"];

  // Weg eines Datenpakets: vom Schul-PC bis zum Webserver in den USA
  const TOUR = [
    { stufe: "lan", weg: ["pc21", "sw2", "core", "fw", "router"],
      text: "Ein Schüler ruft im Computerraum eine Webseite auf, deren Server in den USA steht. Das Paket läuft vom PC über den Etagen-Switch und den Core-Switch zur Firewall und zum Router. Bis hier ist es im lokalen Netz (LAN) unterwegs." },
    { stufe: "reutlingen", weg: ["schule", "pop", "ex_stuttgart"],
      text: "Der Router schickt das Paket über die Glasfaser der Schule zum Netzknoten des Providers in Reutlingen. Von dort geht es über eine Backbone-Leitung Richtung Stuttgart." },
    { stufe: "bw", weg: ["reutlingen", "stuttgart", "ex_frankfurt"],
      text: "Im Landesnetz geht es zum großen Knoten nach Stuttgart und von dort weiter Richtung Frankfurt." },
    { stufe: "deutschland", weg: ["stuttgart", "frankfurt"],
      text: "Über eine Glasfaser-Fernleitung erreicht das Paket Frankfurt, den wichtigsten Internetknoten Deutschlands." },
    { stufe: "europa", weg: ["frankfurt", "amsterdam", "london", "ex_amerika"],
      text: "Von Frankfurt geht es über Amsterdam nach London. Dort beginnen die Seekabel nach Amerika." },
    { stufe: "welt", weg: ["london", "newyork", "ashburn"],
      text: "Durch ein Seekabel im Atlantik reist das Paket nach New York und weiter zum Rechenzentrum in Ashburn, wo der Webserver steht. Für die rund 7 000 km braucht es nur etwa 40 Millisekunden. Die Antwort nimmt einen ähnlichen Weg zurück.",
      ende: "Ein echter <code>traceroute</code> zeigt übrigens nur die Router auf dem Weg – Switches bleiben unsichtbar, weil sie Pakete nur innerhalb eines Netzes weiterreichen." }
  ];

  const LINKTYPEN = {
    see: "Seekabel (Glasfaser im Meer)",
    backbone: "Backbone (Glasfaser-Fernleitung)",
    glas: "Glasfaser",
    kupfer: "Kupferkabel (DSL)",
    lan: "Netzwerkkabel (Ethernet)",
    wlan: "WLAN (Funk)",
    funk: "Mobilfunk (4G/5G)"
  };

  const KNOTENTYPEN = {
    ixp: "Internetknoten (IXP)", knoten: "Netzknoten", lande: "Seekabel-Landestation", rz: "Rechenzentrum",
    extern: "Verbindung nach außen", schule: "Schule / Hochschule", gebaeude: "Gebäude", klinik: "Krankenhaus",
    firma: "Firma", mast: "Mobilfunkmast", handy: "Endgerät", kvz: "Kabelverzweiger", haus: "Hausanschluss",
    wolke: "Internet", router: "Router", firewall: "Firewall", switch: "Switch", server: "Server", pc: "Endgerät",
    drucker: "Drucker", ap: "WLAN Access Point", laptop: "Endgerät", tablet: "Endgerät"
  };

  // Symbole (24 × 24, Linien)
  const ICONS = {
    rz: "M5 3h14v6H5zM5 11h14v6H5zM8 6h.01M8 14h.01M5 20h14",
    server: "M5 3h14v6H5zM5 11h14v6H5zM8 6h.01M8 14h.01M5 20h14",
    schule: "M4 21V10l8-5 8 5v11M9 21v-5h6v5M12 5V2h3M8 12h.01M16 12h.01",
    gebaeude: "M4 21V5h16v16M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4",
    klinik: "M4 21V6h16v15M12 9v6M9 12h6M10 21v-3h4v3",
    firma: "M3 21V9l6 4V9l6 4V4h6v17z",
    mast: "M12 8v13M8 21h8M9.5 13L12 8l2.5 5M7 4.5a6.5 6.5 0 0 0 0 7M17 4.5a6.5 6.5 0 0 1 0 7",
    handy: "M8 2h8v20H8zM11 18h2",
    tablet: "M5 3h14v18H5zM11 18h2",
    kvz: "M7 3h10v18H7zM10 7h4M10 11h4M7 15h10",
    haus: "M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5",
    wolke: "M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11.5 3.3 3.3 0 0 0 7 18z",
    router: "M3 13h18v7H3zM7 13V8M17 13V8M7 16.5h.01M11 16.5h.01M5 6a3 3 0 0 1 4 0M15 6a3 3 0 0 1 4 0",
    firewall: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v5M15 10v5M9 15v4",
    switch: "M2 8h20v8H2zM5 12h1.5M8.5 12H10M12 12h1.5M15.5 12H17M19 12h.01",
    pc: "M3 4h18v12H3zM8 20h8M12 16v4",
    drucker: "M6 9V3h12v6M6 17H4v-8h16v8h-2M6 14h12v7H6z",
    ap: "M4 9a11 11 0 0 1 16 0M7 12a7 7 0 0 1 10 0M10 15a3 3 0 0 1 4 0M12 18h.01",
    laptop: "M4 5h16v10H4zM2 19h20",
    extern: "M5 12h14M13 6l6 6-6 6"
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
  const r1 = n => Math.round(n * 10) / 10;

  // Gleiche Projektion wie beim Vorbereiten der Kartendaten
  function projiziere(karte, lon, lat) {
    const p = KARTEN[karte].proj;
    let x, y;
    if (p.typ === "ne") {
      const l = lon * Math.PI / 180, f = lat * Math.PI / 180, f2 = f * f, f4 = f2 * f2;
      x = l * (0.8707 - 0.131979 * f2 + f4 * (-0.013791 + f4 * (0.003971 * f2 - 0.001529 * f4)));
      y = -f * (1.007226 + f2 * (0.015085 + f4 * (-0.044475 + 0.028874 * f2 - 0.005916 * f4)));
    } else {
      x = lon * p.k;
      y = -lat;
    }
    return [p.s * x + p.tx, p.s * y + p.ty];
  }

  function position(st, k) {
    return k.x != null ? [k.x, k.y] : projiziere(st.karte, k.lon, k.lat);
  }

  // Leitung als SVG-Pfad. Auf Karten entlang lon/lat (über die Datumsgrenze in zwei Teilen)
  function leitungsPfad(st, a, b, opt) {
    if (st.karte) {
      let l1 = a.lon, l2 = b.lon;
      if (l2 - l1 > 180) l2 -= 360;
      else if (l1 - l2 > 180) l2 += 360;
      const n = 40, teile = [[]];
      let vorher = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const lon = ((l1 + (l2 - l1) * t + 540) % 360) - 180;
        if (vorher != null && Math.abs(lon - vorher) > 180) teile.push([]);
        vorher = lon;
        teile[teile.length - 1].push(projiziere(st.karte, lon, a.lat + (b.lat - a.lat) * t));
      }
      if (opt.kurve && teile.length === 1) biege(teile[0], opt.kurve);
      return teile.map(t => "M" + t.map(p => r1(p[0]) + "," + r1(p[1])).join("L")).join("");
    }
    const [x1, y1] = position(st, a), [x2, y2] = position(st, b);
    if (opt.knick === true) return `M${x1},${y1}H${x2}V${y2}`;
    if (typeof opt.knick === "number") return `M${x1},${y1}H${opt.knick}V${y2}H${x2}`;
    if (opt.kurve) {
      const mx = (x1 + x2) / 2 - (y2 - y1) * opt.kurve, my = (y1 + y2) / 2 + (x2 - x1) * opt.kurve;
      return `M${x1},${y1}Q${r1(mx)},${r1(my)} ${x2},${y2}`;
    }
    return `M${x1},${y1}L${x2},${y2}`;
  }

  function biege(punkte, kurve) {
    const [ax, ay] = punkte[0], [bx, by] = punkte[punkte.length - 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    punkte.forEach((p, i) => {
      const o = kurve * len * Math.sin(Math.PI * i / (punkte.length - 1));
      p[0] += nx * o;
      p[1] += ny * o;
    });
  }

  /* ---------- Eine Stufe zeichnen ---------- */
  const karteEl = document.getElementById("karte");
  let k = 1;   // Nutzereinheiten pro Bildschirmpixel – Schrift und Symbole bleiben gleich groß

  function hintergrund(art) {
    if (art === "stadt") {
      return s("g", {},
        s("rect", { class: "flaeche", x: 40, y: 30, width: 920, height: 545, rx: 60 }),
        s("ellipse", { class: "huegel", cx: 885, cy: 290, rx: 60, ry: 34 }),
        s("text", { class: "raum-label", x: 885, y: 295, "text-anchor": "middle", text: "Achalm" }),
        s("path", { class: "fluss", d: "M360,575 C400,470 330,360 430,250 S610,90 650,30" }),
        s("text", { class: "raum-label", x: 372, y: 300, "text-anchor": "end", text: "Echaz" }),
        s("text", { class: "raum-label", x: 935, y: 558, "text-anchor": "end", text: "Stadtgebiet Reutlingen (schematisch)" }));
    }
    if (art === "gebaeude") {
      const raum = (x, y, w, hh, text) => [
        s("rect", { class: "flaeche raum", x, y, width: w, height: hh, rx: 8 }),
        s("text", { class: "raum-label", x: x + 10, y: y + hh - 10, text })];
      return s("g", {},
        s("rect", { class: "flaeche", x: 20, y: 105, width: 960, height: 482, rx: 14 }),
        s("text", { class: "raum-label", x: 190, y: 130, text: "Steinbeisschule (Beispiel)" }),
        raum(35, 140, 375, 432, "Technikraum"),
        raum(425, 140, 540, 135, "2. OG · Computerraum"),
        raum(425, 285, 540, 140, "1. OG · Klassenzimmer"),
        raum(425, 435, 540, 137, "EG · Verwaltung & Lehrerzimmer"));
    }
    return null;
  }

  function baueStufe(id) {
    const st = STUFEN[id];
    const svg = s("svg", { viewBox: "0 0 1000 600", "aria-hidden": "false" });
    const linkEls = [];
    const knotenEls = {};
    let zielGruppe = null;

    // Untergrund
    if (st.karte) {
      const land = s("g", {}), ziel = s("g", { class: "ziel-gruppe", tabindex: 0, role: "button",
        "aria-label": st.zielLabel.text.replace(" ▸", "") + " – hineinzoomen" });
      for (const f of KARTEN[st.karte].flaechen) {
        const p = s("path", { class: "land" + (f.g === "nachbar" ? " nachbar" : ""), d: f.d }, s("title", { text: f.n }));
        (f.g === "ziel" ? ziel : land).append(p);
      }
      const [lx, ly] = projiziere(st.karte, st.zielLabel.lon, st.zielLabel.lat);
      ziel.append(s("text", { class: "ziel-label", x: r1(lx), y: r1(ly), "text-anchor": "middle", text: st.zielLabel.text }));
      ziel.addEventListener("click", () => zoomeHinein(st.weiter));
      ziel.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoomeHinein(st.weiter); } });
      svg.append(land, ziel);
      zielGruppe = ziel;
      for (const b of st.beschriftungen || []) {
        const [x, y] = projiziere(st.karte, b.lon, b.lat);
        svg.append(s("text", { class: "beschr" + (b.meer ? " meer" : ""), x: r1(x), y: r1(y), text: b.text }));
      }
    } else {
      svg.append(hintergrund(st.hintergrund));
    }

    // Leitungen
    const linkGruppe = s("g", {});
    for (const [a, b, typ, opt = {}] of st.links) {
      const ka = st.knoten[a], kb = st.knoten[b];
      const extern = ka.art === "extern" || kb.art === "extern";
      const el = s("path", { class: `link ${typ}${extern ? " extern" : ""}`, d: leitungsPfad(st, ka, kb, opt) });
      linkGruppe.append(el);
      linkEls.push({ el, a, b, typ });
    }
    svg.append(linkGruppe, s("g", { class: "pakete" }));

    // Knoten
    const knotenGruppe = s("g", {});
    for (const [kid, kn] of Object.entries(st.knoten)) {
      const [x, y] = position(st, kn);
      const schema = !st.karte;
      const groesse = schema ? (kn.zoom ? 22 : kn.mini ? 11 : 17) : (kn.art === "ixp" ? 7 : 5);
      let symbol;
      if (schema) {
        symbol = [s("circle", { class: "ico-bg", r: groesse }),
          s("path", { class: "ico", d: ICONS[kn.art] || ICONS.extern, transform: kn.mini ? "scale(0.62) translate(-12,-12)" : "translate(-12,-12)" })];
      } else if (kn.art === "rz") {
        symbol = s("rect", { class: "punkt", x: -5.5, y: -5.5, width: 11, height: 11, rx: 2 });
      } else {
        symbol = s("circle", { class: "punkt", r: groesse });
      }
      const lp = kn.lp || "r", abstand = groesse + 5;
      const text = kn.mini ? null : s("text", {
        class: "name",
        x: lp === "r" ? abstand : lp === "l" ? -abstand : 0,
        y: lp === "t" ? -abstand - 1 : lp === "b" ? abstand + 11 : 4,
        "text-anchor": lp === "r" ? "start" : lp === "l" ? "end" : "middle",
        text: kn.name
      });
      const kl = ["knoten", kn.art, kn.art === "ixp" ? "gross" : "", kn.zoom ? "ziel" : "", kn.klein ? "klein" : ""].filter(Boolean).join(" ");
      const g = s("g", { class: kl, transform: `translate(${r1(x)},${r1(y)})`, tabindex: 0, role: "button",
        "aria-label": kn.name + (kn.zoom ? " – hineinzoomen" : "") },
        s("g", { class: "sk" }, s("circle", { r: groesse + 8, fill: "transparent" }), symbol, text));
      const aktion = () => { if (kn.zoom) zoomeHinein(st.weiter, kid); else waehleKnoten(kid); };
      g.addEventListener("click", aktion);
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aktion(); } });
      knotenGruppe.append(g);
      knotenEls[kid] = g;
    }
    svg.append(knotenGruppe);

    return {
      id, st, svg, linkEls, knotenEls,
      // Ausschnitt, in den hineingezoomt wird. exakt = deckt sich mit dem Bild der nächsten Stufe
      zielBox(knotenId) {
        if (!st.karte || knotenId) {
          const kn = st.knoten[knotenId || Object.keys(st.knoten).find(x => st.knoten[x].zoom)];
          const [x, y] = position(st, kn);
          return { box: [x - 30, y - 18, 60, 36], exakt: false };
        }
        const naechste = STUFEN[st.weiter].karte;
        if (!naechste) {
          const b = zielGruppe.getBBox();
          return { box: [b.x, b.y, b.width, b.height], exakt: false };
        }
        // Ränder der nächsten Karte zurückrechnen (lon/lat) und in diese Karte projizieren
        const p = KARTEN[naechste].proj;
        const pts = [[0, 0], [500, 0], [1000, 0], [1000, 300], [1000, 600], [500, 600], [0, 600], [0, 300]]
          .map(([x, y]) => projiziere(st.karte, (x - p.tx) / p.s / p.k, -(y - p.ty) / p.s));
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        return { box: [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0], exakt: true };
      }
    };
  }

  /* ---------- Zoomen ---------- */
  const VOLL = [0, 0, 1000, 600];
  const WEIT = [-350, -210, 1700, 1020];
  let aktiv = null, beschaeftigt = false;

  function setzeViewBox(svg, vb) { svg.setAttribute("viewBox", vb.map(r1).join(" ")); }

  // Ausschnitt auf das Seitenverhältnis 5:3 bringen
  function passend({ box: [x, y, w, hh], exakt }) {
    const cx = x + w / 2, cy = y + hh / 2;
    const breite = Math.max(w, hh * 5 / 3, 60) * (exakt ? 1 : 1.25);
    return [cx - breite / 2, cy - breite * 0.3, breite, breite * 0.6];
  }

  function animiere(svg, von, nach, ms) {
    return new Promise(fertig => {
      if (reduziert) { setzeViewBox(svg, nach); return fertig(); }
      const t0 = performance.now();
      function schritt(t) {
        const p = Math.min(1, (t - t0) / ms);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        setzeViewBox(svg, von.map((v, i) => v + (nach[i] - v) * e));
        if (p < 1) requestAnimationFrame(schritt); else fertig();
      }
      requestAnimationFrame(schritt);
    });
  }

  async function wechsle(id, art, knotenId) {
    if (beschaeftigt || (aktiv && aktiv.id === id)) return;
    beschaeftigt = true;
    pakete.stop();
    const alt = aktiv;
    const neu = baueStufe(id);
    neu.svg.style.opacity = 0;
    karteEl.append(neu.svg);

    const warte = ms => new Promise(r => setTimeout(r, reduziert ? 0 : ms));
    if (alt && art === "rein") {
      const ziel = alt.zielBox(knotenId), box = passend(ziel);
      if (ziel.exakt) {
        // Karte -> Karte: hineinzoomen, die genauere Karte blendet sich passend darüber
        warte(500).then(() => { karteEl.classList.toggle("schema", !neu.st.karte); neu.svg.style.opacity = 1; });
        await animiere(alt.svg, VOLL, box, 950);
        await warte(150);
      } else {
        warte(320).then(() => { alt.svg.style.opacity = 0; });
        await animiere(alt.svg, VOLL, box, 750);
        karteEl.classList.toggle("schema", !neu.st.karte);
        setzeViewBox(neu.svg, WEIT);
        neu.svg.style.opacity = 1;
        await animiere(neu.svg, WEIT, VOLL, 650);
      }
    } else if (alt && art === "raus") {
      // Die gröbere Stufe liegt unter der alten und zoomt aus deren Ausschnitt heraus
      const box = passend(neu.zielBox());
      karteEl.insertBefore(neu.svg, alt.svg);
      karteEl.classList.toggle("schema", !neu.st.karte);
      setzeViewBox(neu.svg, box);
      neu.svg.style.opacity = 1;
      alt.svg.style.opacity = 0;
      await animiere(neu.svg, box, VOLL, 950);
    } else {
      karteEl.classList.toggle("schema", !neu.st.karte);
      neu.svg.style.opacity = 1;
    }
    if (alt) alt.svg.remove();
    aktiv = neu;
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* egal */ }
    zeigeStufe();
    if (!tour) pakete.start();
    beschaeftigt = false;
  }

  function zoomeHinein(id, knotenId) {
    if (!id || beschaeftigt) return;
    beendeTour();
    wechsle(id, "rein", knotenId);
  }

  function springeZu(id) {
    if (beschaeftigt || !aktiv || id === aktiv.id) return;
    beendeTour();
    wechsle(id, REIHE.indexOf(id) < REIHE.indexOf(aktiv.id) ? "raus" : "rein");
  }

  /* ---------- Datenpakete ---------- */
  const pakete = (() => {
    let an = !reduziert, liste = [], raf = 0, letzte = 0, naechstes = 0;
    function tick(t) {
      raf = 0;
      if (!aktiv || !an) return;
      const dt = letzte ? Math.min(100, t - letzte) : 16;
      letzte = t;
      const max = Math.min(26, Math.round(aktiv.linkEls.length * 1.3));
      if (t > naechstes && liste.length < max) {
        const l = aktiv.linkEls[Math.floor(Math.random() * aktiv.linkEls.length)];
        const len = l.el.getTotalLength();
        const el = s("circle", { class: "paket", r: r1(3.2 * k), style: `fill: var(--l-${l.typ})` });
        aktiv.svg.querySelector(".pakete").append(el);
        liste.push({ el, l, len, t: 0, dauer: Math.max(700, len / 0.16), rueck: Math.random() < 0.5 });
        naechstes = t + 90 + Math.random() * 260;
      }
      liste = liste.filter(p => {
        p.t += dt / p.dauer;
        if (p.t >= 1) { p.el.remove(); return false; }
        const pt = p.l.el.getPointAtLength(p.len * (p.rueck ? 1 - p.t : p.t));
        p.el.setAttribute("cx", r1(pt.x));
        p.el.setAttribute("cy", r1(pt.y));
        return true;
      });
      raf = requestAnimationFrame(tick);
    }
    return {
      get an() { return an; },
      start() { if (an && !raf) { letzte = 0; raf = requestAnimationFrame(tick); } },
      stop() {
        cancelAnimationFrame(raf);
        raf = 0;
        liste.forEach(p => p.el.remove());
        liste = [];
      },
      umschalten() { an = !an; if (an) this.start(); else this.stop(); return an; }
    };
  })();

  // Ein einzelnes Paket entlang einer Leitung bewegen
  function fahre(el, link, rueck, ms) {
    return new Promise(fertig => {
      const len = link.el.getTotalLength();
      if (reduziert) ms = 1;
      const t0 = performance.now();
      function schritt(t) {
        const p = Math.min(1, (t - t0) / ms);
        const pt = link.el.getPointAtLength(len * (rueck ? 1 - p : p));
        el.setAttribute("cx", r1(pt.x));
        el.setAttribute("cy", r1(pt.y));
        if (p < 1 && el.isConnected) requestAnimationFrame(schritt); else fertig();
      }
      requestAnimationFrame(schritt);
    });
  }

  /* ---------- Infoleiste ---------- */
  const crumbs = document.getElementById("crumbs");
  const infoStufe = document.getElementById("infoStufe");
  const infoTitel = document.getElementById("infoTitel");
  const infoText = document.getElementById("infoText");
  const legende = document.getElementById("legende");
  const knotenInfo = document.getElementById("knotenInfo");
  const hint = document.getElementById("hint");
  const btnZurueck = document.getElementById("btnZurueck");

  function zeigeStufe() {
    const st = aktiv.st, nr = REIHE.indexOf(aktiv.id);
    crumbs.replaceChildren(...REIHE.flatMap((id, i) => [
      i ? h("span", { class: "sep", text: "›" }) : null,
      h("button", { class: "chip", type: "button", "aria-pressed": String(id === aktiv.id), text: STUFEN[id].kurz,
        onclick: () => springeZu(id) })
    ]).filter(Boolean));
    infoStufe.textContent = `zoomstufe ${nr + 1} / ${REIHE.length}`;
    infoTitel.textContent = st.titel;
    infoText.innerHTML = st.text;
    hint.textContent = st.hint;
    btnZurueck.disabled = nr === 0;

    const typen = [...new Set(st.links.map(l => l[2]))];
    const linie = typ => h("span", { html: `<svg width="34" height="10" aria-hidden="true"><path class="link ${typ}" d="M2 5H32"/></svg>` });
    const punkt = (klasse, form) => h("span", { html: `<svg width="34" height="14" aria-hidden="true"><g class="knoten ${klasse}" transform="translate(17,7)">${form}</g></svg>` });
    legende.replaceChildren(...[
      ...typen.map(t => h("div", { class: "z" }, linie(t), h("span", { text: LINKTYPEN[t] }))),
      ...(st.karte ? [
        h("div", { class: "z" }, punkt("ixp gross", '<circle class="punkt" r="6"/>'), h("span", { text: "großer Internetknoten" })),
        h("div", { class: "z" }, punkt("knoten", '<circle class="punkt" r="4.5"/>'), h("span", { text: "Netzknoten" })),
        h("div", { class: "z" }, punkt("lande", '<circle class="punkt" r="4.5"/>'), h("span", { text: "Seekabel-Landestation" })),
        h("div", { class: "z" }, punkt("rz", '<rect class="punkt" x="-5" y="-5" width="10" height="10" rx="2"/>'), h("span", { text: "Rechenzentren" }))
      ] : []),
      st.links.some(l => st.knoten[l[0]].art === "extern" || st.knoten[l[1]].art === "extern")
        ? h("div", { class: "z" }, linie("backbone extern"), h("span", { text: "weiter in andere Netze" })) : null
    ].filter(Boolean));
    knotenInfo.hidden = true;
  }

  function waehleKnoten(id) {
    const st = aktiv.st, kn = st.knoten[id];
    Object.entries(aktiv.knotenEls).forEach(([x, el]) => el.classList.toggle("aktiv", x === id));
    const nachbarn = [];
    aktiv.linkEls.forEach(l => {
      const dran = l.a === id || l.b === id;
      l.el.classList.toggle("hell", dran);
      l.el.classList.toggle("dim", !dran);
      if (dran) nachbarn.push(st.knoten[l.a === id ? l.b : l.a].name.replace("→ ", ""));
    });
    knotenInfo.replaceChildren(...[
      h("span", { class: "typ", text: KNOTENTYPEN[kn.art] || "" }),
      h("h3", { text: kn.name }),
      kn.ip ? h("span", { class: "ip", text: "IP: " + kn.ip }) : null,
      h("p", { text: kn.info }),
      nachbarn.length ? h("p", { class: "small muted", text: "Verbunden mit: " + nachbarn.join(", ") }) : null,
      h("button", { class: "btn btn-ghost", type: "button", text: "auswahl aufheben", onclick: hebeAuswahlAuf })
    ].filter(Boolean));
    knotenInfo.hidden = false;
  }

  function hebeAuswahlAuf() {
    if (!aktiv) return;
    Object.values(aktiv.knotenEls).forEach(el => el.classList.remove("aktiv"));
    aktiv.linkEls.forEach(l => l.el.classList.remove("hell", "dim"));
    knotenInfo.hidden = true;
  }

  /* ---------- Weg eines Datenpakets ---------- */
  const tourBox = document.getElementById("tourBox");
  const btnTour = document.getElementById("btnTour");
  let tour = null;

  // Wartet, bis eine laufende Zoom-Animation fertig ist
  async function bereit() {
    while (beschaeftigt) await new Promise(r => setTimeout(r, 50));
  }

  async function starteTour() {
    hebeAuswahlAuf();
    tour = { schritt: 0, hops: h("ol", { class: "hops" }), text: h("p", { class: "tour-text" }),
      weiter: h("button", { class: "btn", type: "button", text: "weiter ›", disabled: true }) };
    tour.weiter.addEventListener("click", naechsterSchritt);
    tourBox.replaceChildren(h("span", { class: "flabel", text: "weg eines datenpakets" }), tour.text, tour.hops,
      h("div", { class: "row" }, tour.weiter));
    tourBox.hidden = false;
    btnTour.textContent = "■ Weg beenden";
    pakete.stop();
    const t = tour;
    await bereit();
    if (tour !== t) return;
    if (!aktiv || aktiv.id !== "lan") {
      await wechsle("lan", "direkt");
    }
    if (aktiv.id === "lan") spieleSchritt();
  }

  async function spieleSchritt() {
    const t = tour, schritt = TOUR[t.schritt];
    t.text.textContent = schritt.text;
    t.weiter.disabled = true;
    t.weiter.textContent = t.schritt === TOUR.length - 1 ? "fertig ✓" : "weiter ›";
    const st = aktiv.st;
    const route = [];
    for (let i = 0; i + 1 < schritt.weg.length; i++) {
      const a = schritt.weg[i], b = schritt.weg[i + 1];
      const link = aktiv.linkEls.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
      route.push({ link, rueck: link.a !== a, ziel: b });
    }
    aktiv.linkEls.forEach(l => l.el.classList.toggle("dim", !route.some(r => r.link === l)));
    route.forEach(r => r.link.el.classList.add("route"));

    const fuegeHop = id => {
      const kn = st.knoten[id];
      if (kn.art === "extern") return;
      t.hops.append(h("li", {}, kn.hop || kn.name, h("span", { text: kn.ip ? kn.ip.split(" / ")[0] : "" })));
      t.hops.scrollTop = t.hops.scrollHeight;
      aktiv.knotenEls[id].classList.add("aktiv");
    };
    if (t.schritt === 0) fuegeHop(schritt.weg[0]);
    else aktiv.knotenEls[schritt.weg[0]].classList.add("aktiv");

    const el = s("circle", { class: "paket tour", r: r1(7 * k) });
    aktiv.svg.querySelector(".pakete").append(el);
    for (const r of route) {
      if (tour !== t) return;
      await fahre(el, r.link, r.rueck, Math.max(900, r.link.el.getTotalLength() * 4));
      if (tour !== t) return;
      fuegeHop(r.ziel);
    }
    if (schritt.ende) t.text.innerHTML = schritt.text + "<br><br>" + schritt.ende;
    t.weiter.disabled = false;
  }

  async function naechsterSchritt() {
    if (!tour) return;
    if (tour.schritt === TOUR.length - 1) return beendeTour();
    tour.schritt++;
    tour.weiter.disabled = true;
    const t = tour;
    await bereit();
    await wechsle(TOUR[tour.schritt].stufe, "raus");
    if (tour === t && aktiv.id === TOUR[t.schritt].stufe) spieleSchritt();
  }

  function beendeTour() {
    if (!tour) return;
    tour = null;
    tourBox.hidden = true;
    btnTour.textContent = "▶ Weg eines Datenpakets";
    if (aktiv) {
      aktiv.svg.querySelectorAll(".paket.tour").forEach(e => e.remove());
      aktiv.linkEls.forEach(l => l.el.classList.remove("route", "dim", "hell"));
      Object.values(aktiv.knotenEls).forEach(el => el.classList.remove("aktiv"));
      if (!beschaeftigt) pakete.start();
    }
  }

  /* ---------- Bedienung ---------- */
  btnTour.addEventListener("click", () => { if (tour) beendeTour(); else starteTour(); });
  btnZurueck.addEventListener("click", () => {
    const nr = aktiv ? REIHE.indexOf(aktiv.id) : 0;
    if (nr > 0) springeZu(REIHE[nr - 1]);
  });
  const btnPakete = document.getElementById("btnPakete");
  function zeigePaketKnopf() {
    btnPakete.textContent = "pakete: " + (pakete.an ? "an" : "aus");
    btnPakete.setAttribute("aria-pressed", String(pakete.an));
  }
  btnPakete.addEventListener("click", () => {
    pakete.umschalten();
    if (tour) pakete.stop();
    zeigePaketKnopf();
  });
  zeigePaketKnopf();

  // Escape hebt Auswahl auf; Klick ins Leere ebenso
  document.addEventListener("keydown", e => { if (e.key === "Escape") hebeAuswahlAuf(); });
  karteEl.addEventListener("click", e => {
    if (!tour && !e.target.closest(".knoten, .ziel-gruppe")) hebeAuswahlAuf();
  });

  // Auf schmalen Bildschirmen dürfen Symbole und Schrift etwas kleiner werden
  function messe() {
    const breite = karteEl.clientWidth || 1000;
    k = 1000 / breite * Math.min(1, Math.max(0.68, breite / 700));
    karteEl.style.setProperty("--k", k.toFixed(3));
  }
  messe();
  new ResizeObserver(messe).observe(karteEl);

  const start = location.hash.slice(1);
  wechsle(STUFEN[start] ? start : "welt", "direkt");
})();
