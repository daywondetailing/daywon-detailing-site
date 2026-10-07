/* Daywon Detailing office hours. Fills:
     [data-hours-list]  a week list (today highlighted)
     [data-hours-text]  one sentence, e.g. "Mon, Tue, Thu, Sat and Sun 11 AM to 5 PM; Wed and Fri 2 PM to 5 PM"
     [data-hours-now]   "Open now until 5 PM" / "Closed now. Next open Wed at 2 PM"
   Uses SITE_CONFIG.schedule first, then the live hours from the owner portal settings (get_availability). */
(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var portal = cfg.portal || {};
  var hours = (cfg.schedule && cfg.schedule.hours) || {};
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var ORDER = [1, 2, 3, 4, 5, 6, 0];   // Monday first

  function h12(x) {
    var h = Math.floor(x), m = Math.round((x - h) * 60);
    var ap = h >= 12 && h < 24 ? "PM" : "AM", hh = h % 12 === 0 ? 12 : h % 12;
    return hh + (m ? ":" + (m < 10 ? "0" : "") + m : "") + " " + ap;
  }
  function span(d) {
    var v = hours[d] || hours[String(d)];
    return v && v.length >= 2 ? v : null;
  }
  function rangeText(v) { return h12(v[0]) + " to " + h12(v[1]); }
  function joinList(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }

  /* Eastern time "now" (the business clock), whatever the visitor's time zone. */
  function nowEastern() {
    try {
      var p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false })
        .formatToParts(new Date());
      var o = {};
      p.forEach(function (x) { o[x.type] = x.value; });
      return { day: SHORT.indexOf(o.weekday), hour: (+o.hour % 24) + (+o.minute) / 60 };
    } catch (e) {
      var d = new Date();
      return { day: d.getDay(), hour: d.getHours() + d.getMinutes() / 60 };
    }
  }

  function sentence() {
    var groups = [];
    ORDER.forEach(function (d) {
      var v = span(d);
      if (!v) return;
      var key = v[0] + "-" + v[1];
      var g = groups.filter(function (x) { return x.key === key; })[0];
      if (!g) { g = { key: key, v: v, days: [] }; groups.push(g); }
      g.days.push(SHORT[d]);
    });
    return groups.map(function (g) { return joinList(g.days) + " " + rangeText(g.v); }).join("; ");
  }

  function status() {
    var n = nowEastern(), v = span(n.day);
    if (v && n.hour >= v[0] && n.hour < v[1]) return { open: true, text: "Open now until " + h12(v[1]) };
    for (var i = 0; i < 8; i++) {
      var d = (n.day + i) % 7, w = span(d);
      if (!w) continue;
      if (i === 0 && n.hour >= w[0]) continue;
      return { open: false, text: "Closed now. Back " + (i === 0 ? "today" : i === 1 ? "tomorrow" : DAYS[d]) + " at " + h12(w[0]) };
    }
    return { open: false, text: "Closed now" };
  }

  function render() {
    var today = nowEastern().day;
    document.querySelectorAll("[data-hours-list]").forEach(function (ul) {
      while (ul.firstChild) ul.removeChild(ul.firstChild);
      ORDER.forEach(function (d) {
        var v = span(d);
        var li = document.createElement("li");
        li.className = "hours__row" + (d === today ? " is-today" : "") + (v ? "" : " is-closed");
        var name = document.createElement("span");
        name.className = "hours__day";
        name.textContent = DAYS[d];
        if (d === today) {
          var t = document.createElement("span");
          t.className = "hours__today";
          t.textContent = "Today";
          name.appendChild(t);
        }
        var time = document.createElement("span");
        time.className = "hours__time";
        time.textContent = v ? h12(v[0]) + " – " + h12(v[1]) : "Closed";
        li.appendChild(name);
        li.appendChild(time);
        ul.appendChild(li);
      });
    });
    var s = sentence();
    document.querySelectorAll("[data-hours-text]").forEach(function (n) { n.textContent = s; });
    var st = status();
    document.querySelectorAll("[data-hours-now]").forEach(function (n) {
      n.textContent = st.text;
      n.classList.toggle("is-open", st.open);
    });
  }

  render();

  // Live hours from the owner portal settings (same source the booking calendar uses).
  if (portal.enabled && portal.supabaseUrl && portal.supabaseKey && window.fetch) {
    var d = new Date(), from = d.toISOString().slice(0, 10);
    fetch(portal.supabaseUrl + "/rest/v1/rpc/get_availability", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: portal.supabaseKey, Authorization: "Bearer " + portal.supabaseKey },
      body: JSON.stringify({ p_from: from, p_to: from })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) {
      if (a && a.hours && typeof a.hours === "object") { hours = a.hours; render(); }
    }).catch(function () { /* keep config hours */ });
  }
})();
