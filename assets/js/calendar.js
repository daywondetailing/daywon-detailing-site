/* Daywon Detailing "Add to calendar" page.
   Query: s=YYYYMMDDTHHMM (Eastern wall clock), m=job minutes, w=arrival window minutes (default 30),
          svc=service name, ref=DD-1234, loc=address, r=request id (for the My request link).
   Offers Google, Outlook.com, Office 365 and an .ics file (Apple Calendar and most phones). */
(function () {
  "use strict";

  var q = new URLSearchParams(window.location.search);
  var m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(q.get("s") || "");
  var mins = Math.min(720, Math.max(15, parseInt(q.get("m"), 10) || 120));
  var win = Math.min(120, Math.max(15, parseInt(q.get("w"), 10) || 30));
  var svc = (q.get("svc") || "Car detail").slice(0, 80);
  var ref = (q.get("ref") || "").slice(0, 20);
  var loc = (q.get("loc") || "").slice(0, 300);
  var rid = /^[0-9a-f-]{36}$/i.test(q.get("r") || "") ? q.get("r") : "";
  var phone = (window.SITE_CONFIG && window.SITE_CONFIG.contact && window.SITE_CONFIG.contact.phoneDisplay) || "240-813-0689";

  if (!m) {
    document.getElementById("cal-card").hidden = true;
    document.getElementById("cal-error").hidden = false;
    return;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  // Wall-clock arithmetic in UTC fields so the visitor's own time zone never shifts the time.
  var start = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  var end = new Date(start.getTime() + mins * 60000);
  var winEnd = new Date(start.getTime() + win * 60000);
  function stamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00";
  }
  function iso(d) {
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":00";
  }
  function clock(d) {
    var h = d.getUTCHours(), mm = d.getUTCMinutes();
    return (h % 12 === 0 ? 12 : h % 12) + ":" + pad(mm) + " " + (h >= 12 ? "PM" : "AM");
  }
  var dayText = start.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  var title = "Daywon Detailing: " + svc;
  var site = window.location.origin + window.location.pathname.replace(/calendar\.html$/, "");
  var link = site + "my-request.html" + (rid ? "?r=" + rid : "");
  var desc = svc + (ref ? " (" + ref + ")" : "") + ". We arrive between " + clock(start) + " and " + clock(winEnd) +
    ". You pay after the job is done. Questions? Call or text " + phone + ". Your request: " + link;

  /* ---------- details ---------- */
  var dl = document.getElementById("cal-details");
  [["Service", svc], ["Date", dayText], ["Arrival window", clock(start) + " to " + clock(winEnd) + " (Eastern)"],
   ["Address", loc], ["Reference", ref]].forEach(function (r) {
    if (!r[1]) return;
    var row = document.createElement("div");
    var dt = document.createElement("dt"); dt.textContent = r[0];
    var dd = document.createElement("dd"); dd.textContent = r[1];
    row.appendChild(dt); row.appendChild(dd); dl.appendChild(row);
  });

  /* ---------- links ---------- */
  var google = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent(title) +
    "&dates=" + stamp(start) + "/" + stamp(end) +
    "&ctz=America/New_York" +
    "&details=" + encodeURIComponent(desc) +
    "&location=" + encodeURIComponent(loc);
  function outlook(host) {
    return "https://" + host + "/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent" +
      "&subject=" + encodeURIComponent(title) +
      "&startdt=" + encodeURIComponent(iso(start)) + "&enddt=" + encodeURIComponent(iso(end)) +
      "&body=" + encodeURIComponent(desc) + "&location=" + encodeURIComponent(loc);
  }
  // Outlook web treats times without an offset as the user's own zone; most customers are in Eastern time too.

  function esc(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function fold(line) {
    var out = [], s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); }
    out.push(s);
    return out.join("\r\n");
  }
  var now = new Date();
  var dtstamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + "T" + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + "Z";
  var ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Daywon Detailing//Booking//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE", "TZID:America/New_York",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    "UID:" + (rid || stamp(start)) + "@daywondetailing.com",
    "DTSTAMP:" + dtstamp,
    "DTSTART;TZID=America/New_York:" + stamp(start),
    "DTEND;TZID=America/New_York:" + stamp(end),
    "SUMMARY:" + esc(title),
    "DESCRIPTION:" + esc(desc),
    "LOCATION:" + esc(loc),
    "URL:" + link,
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:" + esc(title), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"
  ].map(fold).join("\r\n") + "\r\n";
  var icsUrl;
  try { icsUrl = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" })); }
  catch (e) { icsUrl = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics); }

  var box = document.getElementById("cal-actions");
  function btn(text, href, primary, download) {
    var a = document.createElement("a");
    a.className = "btn " + (primary ? "btn--primary" : "btn--ghost");
    a.href = href;
    a.textContent = text;
    if (download) a.setAttribute("download", download);
    else { a.target = "_blank"; a.rel = "noopener"; }
    box.appendChild(a);
  }
  var apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
  btn("Google Calendar", google, !apple);
  btn("Apple Calendar", icsUrl, apple, "daywon-detailing" + (ref ? "-" + ref : "") + ".ics");
  btn("Outlook.com", outlook("outlook.live.com"), false);
  btn("Office 365", outlook("outlook.office.com"), false);
  btn("Download .ics file", icsUrl, false, "daywon-detailing" + (ref ? "-" + ref : "") + ".ics");
  document.getElementById("cal-sub").textContent = svc + " on " + dayText + ". Pick your calendar app.";
})();
