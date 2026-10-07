/* Daywon Detailing service-area map: Leaflet + OpenStreetMap, 15-mile circle around Silver Spring,
   everything outside the circle dimmed, plus an address check (OpenStreetMap Nominatim, one lookup per click).
   Center, radius and travel fee come from SITE_CONFIG.serviceArea. */
(function () {
  "use strict";

  var box = document.getElementById("area-map");
  if (!box) return;
  var area = (window.SITE_CONFIG && window.SITE_CONFIG.serviceArea) || {};
  var LAT = area.lat || 38.9907, LNG = area.lng || -77.0261;
  var MILES = area.radiusMiles || 15, FEE = area.outsideFee || 50;
  var METERS = MILES * 1609.344;

  function miles(lat, lng) {
    var R = 3958.8, toR = Math.PI / 180;
    var dLat = (lat - LAT) * toR, dLng = (lng - LNG) * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(LAT * toR) * Math.cos(lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  window.DDArea = { miles: miles, radius: MILES, fee: FEE };

  var map = null, pin = null;

  function circleRing(steps) {
    var pts = [], latR = METERS / 111320, lngR = METERS / (111320 * Math.cos(LAT * Math.PI / 180));
    for (var i = 0; i <= steps; i++) {
      var a = (i / steps) * 2 * Math.PI;
      pts.push([LAT + latR * Math.sin(a), LNG + lngR * Math.cos(a)]);
    }
    return pts;
  }

  function build() {
    if (map || !window.L) return;
    var L = window.L;
    box.classList.add("is-ready");
    map = L.map(box, {
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      tap: false,
      zoomSnap: 0.25,
      attributionControl: true
    }).setView([LAT, LNG], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    // Dim the world outside the circle so the service area stands out.
    var world = [[85, -180], [85, 180], [-85, 180], [-85, -180]];
    L.polygon([world, circleRing(128)], {
      stroke: false, fillColor: "#05070A", fillOpacity: 0.45, interactive: false
    }).addTo(map);
    L.circle([LAT, LNG], {
      radius: METERS, color: "#3B82F6", weight: 3, fillColor: "#3B82F6", fillOpacity: 0.08, interactive: false
    }).addTo(map);
    L.circleMarker([LAT, LNG], {
      radius: 7, color: "#fff", weight: 3, fillColor: "#1F63E0", fillOpacity: 1
    }).addTo(map).bindTooltip("Silver Spring, MD", { permanent: true, direction: "top", offset: [0, -8], className: "area-map__tip" });
    map.fitBounds(L.latLngBounds(circleRing(64)), { padding: [8, 8] });
    window.addEventListener("resize", function () { map.invalidateSize(); });
  }

  // Load Leaflet only when the map is about to scroll into view.
  function loadLeaflet() {
    if (window.L) { build(); return; }
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    var js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = build;
    js.onerror = function () { box.classList.add("is-failed"); };
    document.head.appendChild(js);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); loadLeaflet(); }
    }, { rootMargin: "400px" });
    io.observe(box);
  } else loadLeaflet();

  /* ---------- address check ---------- */
  var form = document.getElementById("area-check");
  if (!form) return;
  var input = form.querySelector("input");
  var out = document.getElementById("area-result");
  var btn = form.querySelector("button");
  var busy = false;

  function say(text, tone) {
    out.textContent = text;
    out.className = "area-check__result" + (tone ? " is-" + tone : "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = (input.value || "").trim();
    if (q.length < 3) { say("Type your street address, city or ZIP code.", "warn"); input.focus(); return; }
    if (busy) return;
    busy = true; btn.disabled = true;
    say("Checking…");
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=" + encodeURIComponent(q);
    fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) { return r.json(); }).then(function (list) {
      busy = false; btn.disabled = false;
      if (!list || !list.length) { say("We couldn't find that address. Try adding the city and state, or just the ZIP code.", "warn"); return; }
      var lat = +list[0].lat, lng = +list[0].lon, d = miles(lat, lng);
      var dist = d < 1 ? "less than a mile" : "about " + (Math.round(d * 10) / 10) + " miles";
      if (d <= MILES) say("Good news: that's " + dist + " from Silver Spring, inside our service area.", "ok");
      else say("That's " + dist + " from Silver Spring, outside our 15 miles. We can still come for an extra $" + FEE + " travel fee.", "warn");
      if (map && window.L) {
        if (pin) map.removeLayer(pin);
        pin = window.L.circleMarker([lat, lng], {
          radius: 9, color: "#fff", weight: 3, fillColor: d <= MILES ? "#16A34A" : "#F59E0B", fillOpacity: 1
        }).addTo(map).bindTooltip("Your address", { permanent: true, direction: "top", offset: [0, -10], className: "area-map__tip" });
        map.fitBounds(window.L.latLngBounds([[lat, lng], [LAT, LNG]]).pad(0.35), { maxZoom: 13 });
      }
    }).catch(function () {
      busy = false; btn.disabled = false;
      say("We couldn't check that right now. Call or text us and we'll tell you.", "warn");
    });
  });
})();
