/* ==========================================================
   coi-sw.js – Service Worker NUR für python-editor.html.
   GitHub Pages kann keine eigenen HTTP-Header setzen. Dieser
   Service Worker ergänzt COOP/COEP, damit der Python-Editor
   "cross-origin isolated" läuft und input() funktioniert.
   Wird mit scope "./python-editor.html" registriert und betrifft
   keine anderen Seiten. Normalerweise nicht ändern.
   ========================================================== */

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;

  e.respondWith(fetch(req).then(function (res) {
    if (res.status === 0) return res;
    var h = new Headers(res.headers);
    h.set("Cross-Origin-Embedder-Policy", "require-corp");
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    h.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }));
});
