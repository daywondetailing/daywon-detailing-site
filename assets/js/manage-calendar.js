/* Daywon Detailing dashboard: calendar (#/calendar). Day, week and month views of booked jobs and time off.
   Registered through DDM.register. All data is rendered with textContent via DD.el. Dates YYYY-MM-DD, times HH:MM (wall clock). */
(function () {
  "use strict";
  if (!window.DDM || !window.DD) return;

  var DD = window.DD, DDM = window.DDM;
  var TIMEOUT = ((window.SITE_CONFIG || {}).portal || {}).timeoutMs || 10000;
  var STATUSES = ["quoted", "approved", "scheduled", "on_the_way", "in_progress", "done"];
  var ROW_MIN = 30;
  var mql = window.matchMedia ? window.matchMedia("(min-width: 960px)") : { matches: true };
  var seq = 0, current = null, nowTimer = null;

  function el(tag, attrs, kids) { return DD.el(tag, attrs, kids); }

  /* ---------- db ---------- */
  function mk(e) {
    var msg = String((e && e.message) || "");
    var out = new Error(msg);
    out.pgcode = e && e.code;
    if (e && (e.name === "TypeError" || e.name === "AbortError" || /fetch|network|timeout|load failed/i.test(msg))) out.text = DD.ERR.NETWORK;
    else if ((e && (e.code === "42501" || e.code === "PGRST301" || e.status === 401 || e.status === 403))) out.text = DD.ERR.NOT_ALLOWED;
    else out.text = DD.ERR.UNKNOWN;
    return out;
  }
  function db(builder) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (done) return; done = true; reject(mk({ name: "AbortError", message: "timeout" })); }, TIMEOUT);
      Promise.resolve(builder).then(function (res) {
        if (done) return;
        done = true; clearTimeout(t);
        if (res && res.error) reject(mk(res.error)); else resolve(res ? res.data : null);
      }, function (e) { if (done) return; done = true; clearTimeout(t); reject(mk(e)); });
    });
  }
  function loadingNode() {
    return el("p", { "class": "muted mg-loading", role: "status" }, [DD.icon("i-spinner", "icon--spin"), " Loading calendar…"]);
  }
  function errorNode(retry, text) {
    var btn = el("button", { type: "button", "class": "btn btn--ghost" }, "Retry");
    btn.addEventListener("click", retry);
    return el("div", { "class": "error-summary", role: "alert" }, [
      el("p", { "class": "error-summary__title" }, [DD.icon("i-alert"), el("span", { text: "We couldn't load this. Check your connection and try again." })]),
      text ? el("p", { "class": "muted", text: text }) : null,
      el("div", { "class": "actions" }, [btn])
    ]);
  }

  /* ---------- time helpers ---------- */
  function toMin(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
    return m ? +m[1] * 60 + +m[2] : 0;
  }
  function hourText(min) {
    var h = Math.floor(min / 60);
    return (h % 12 === 0 ? 12 : h % 12) + " " + (h >= 12 && h < 24 ? "PM" : "AM");
  }
  function shortTime(t) {
    var a = toMin(t), h = Math.floor(a / 60), m = a % 60;
    return (h % 12 === 0 ? 12 : h % 12) + (m ? ":" + (m < 10 ? "0" : "") + m : "") + (h >= 12 ? "p" : "a");
  }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function custName(j) {
    var c = j.customers;
    if (Array.isArray(c)) c = c[0];
    return (c && c.name) || "Customer";
  }
  function jobLabel(j) {
    var st = DD.STATUS[j.status] ? DD.STATUS[j.status].staff : j.status;
    return DD.fmt.window(j.scheduled_start) + " " + custName(j) + ", " + DD.service(j.service_id) + ", " + st;
  }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  function rangeFor(v, d) {
    if (v === "day") return { from: d, to: d };
    if (v === "week") { var s = DD.addDays(d, -d.getDay()); return { from: s, to: DD.addDays(s, 6) }; }
    var first = new Date(d.getFullYear(), d.getMonth(), 1);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: DD.addDays(first, -first.getDay()), to: DD.addDays(last, 6 - last.getDay()) };
  }
  function titleFor(v, d, r) {
    if (v === "day") return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (v === "week") return DD.fmt.date(DD.ymd(r.from)) + " to " + DD.fmt.date(DD.ymd(r.to));
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  function stepDate(v, d, dir) {
    if (v === "day") return DD.addDays(d, dir);
    if (v === "week") return DD.addDays(d, 7 * dir);
    return new Date(d.getFullYear(), d.getMonth() + dir, 1);
  }
  function go(v, d) { DDM.go("#/calendar?v=" + v + "&d=" + DD.ymd(d)); }

  /* ---------- grid ---------- */
  function bounds(jobs, hours) {
    var s = 7 * 60, e = 20 * 60;
    Object.keys(hours || {}).forEach(function (k) {
      var h = hours[k];
      if (Array.isArray(h) && isFinite(h[0])) s = Math.min(s, Math.floor(h[0]) * 60);
    });
    jobs.forEach(function (j) {
      var a = toMin(j.scheduled_start);
      s = Math.min(s, Math.floor(a / 60) * 60);
      e = Math.max(e, Math.ceil((a + j.duration_min + j.buffer_min) / 60) * 60);
    });
    return { start: s, end: Math.min(e, 24 * 60) };
  }
  function place(node, startMin, endMin, b) {
    var s = Math.max(startMin, b.start), e = Math.min(endMin, b.end);
    if (e <= s) return false;
    node.style.setProperty("--top", String((s - b.start) / ROW_MIN));
    node.style.setProperty("--h", String((e - s) / ROW_MIN));
    return true;
  }
  function offFor(off, ymd) {
    return off.filter(function (o) { return o.start_date <= ymd && ymd <= o.end_date; });
  }
  function laneFor(ymd, jobs, off, b, isToday) {
    var rows = (b.end - b.start) / ROW_MIN;
    var lane = el("div", { "class": "cal__lane" });
    lane.style.setProperty("--hours", String(rows));
    offFor(off, ymd).forEach(function (o) {
      var n = el("div", { "class": "cal__event cal__event--off" }, [o.start_time ? "Time off" : "Time off, all day", o.reason ? ": " + o.reason : ""]);
      if (place(n, o.start_time ? toMin(o.start_time) : b.start, o.end_time ? toMin(o.end_time) : b.end, b)) lane.appendChild(n);
    });
    jobs.forEach(function (j) {
      var a = toMin(j.scheduled_start);
      var n = el("a", { "class": "cal__event", href: "#/r/" + j.id, "data-status": j.status, text: jobLabel(j) });
      if (place(n, a, a + j.duration_min, b)) lane.appendChild(n);
      if (j.buffer_min > 0 && j.status !== "done") {
        var bf = el("div", { "class": "cal__event cal__event--buffer", "aria-hidden": "true" });
        if (place(bf, a + j.duration_min, a + j.duration_min + j.buffer_min, b)) lane.appendChild(bf);
      }
    });
    if (isToday) {
      var now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
      if (nm >= b.start && nm <= b.end) {
        var line = el("div", { "class": "cal__now", "aria-hidden": "true" });
        line.style.setProperty("--top", String((nm - b.start) / ROW_MIN));
        lane.appendChild(line);
      }
    }
    return lane;
  }
  function gridTable(days, byDay, off, b, label) {
    var rows = (b.end - b.start) / ROW_MIN, tStr = DD.ymd(today());
    var head = el("tr", null, [el("th", { scope: "col", "class": "cal-table__corner" }, [el("span", { "class": "set-sr", text: "Time" })])]);
    days.forEach(function (d) {
      var y = DD.ymd(d);
      head.appendChild(el("th", { scope: "col", "class": "cal__col-head", "aria-current": y === tStr ? "date" : null, text: DD.fmt.date(y) }));
    });
    var hours = el("div", { "class": "cal__hours" });
    for (var i = 0; i < rows; i++) {
      var m = b.start + i * ROW_MIN;
      hours.appendChild(el("div", { "class": "cal__hour", text: m % 60 === 0 ? hourText(m) : "" }));
    }
    var body = el("tr", null, [el("td", { "class": "cal-table__hours", "aria-hidden": "true" }, [hours])]);
    days.forEach(function (d) {
      var y = DD.ymd(d);
      body.appendChild(el("td", { "class": "cal-table__day" }, [laneFor(y, byDay[y] || [], off, b, y === tStr)]));
    });
    return el("table", { "class": "cal-table" }, [
      el("caption", { "class": "set-sr", text: label }), el("thead", null, [head]), el("tbody", null, [body])
    ]);
  }
  function agenda(days, byDay, off) {
    var tStr = DD.ymd(today());
    var wrap = el("div", { "class": "cal__agenda" });
    days.forEach(function (d) {
      var y = DD.ymd(d), jobs = byDay[y] || [], offs = offFor(off, y);
      var sec = el("section", null, [el("h2", { "class": "cal__agenda-day", "aria-current": y === tStr ? "date" : null, text: DD.fmt.date(y) })]);
      if (!jobs.length && !offs.length) sec.appendChild(el("p", { "class": "muted", text: "No jobs." }));
      else {
        var ul = el("ul", { "class": "list-rows" });
        offs.forEach(function (o) {
          ul.appendChild(el("li", null, [el("div", { "class": "list-row cal__agenda-off" }, [
            el("div", { "class": "list-row__main" }, [el("span", { "class": "list-row__title", text: "Time off" + (o.start_time ? ", " + DD.fmt.window(o.start_time, toMin(o.end_time) - toMin(o.start_time)) : ", all day") }),
              o.reason ? el("span", { "class": "list-row__meta", text: o.reason }) : null])
          ])]));
        });
        jobs.forEach(function (j) {
          ul.appendChild(el("li", null, [el("a", { "class": "list-row", href: "#/r/" + j.id }, [
            el("div", { "class": "list-row__main" }, [el("span", { "class": "list-row__title", text: jobLabel(j) })]),
            el("span", { "class": "list-row__end", "aria-hidden": "true" }, [el("span", { "class": "chip-status", "data-status": j.status, text: DD.STATUS[j.status].staff })])
          ])]));
        });
        sec.appendChild(ul);
      }
      wrap.appendChild(sec);
    });
    return wrap;
  }
  function monthGrid(r, d, byDay, off) {
    var tStr = DD.ymd(today());
    var grid = el("div", { "class": "cal__month" });
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (n) { grid.appendChild(el("div", { "class": "cal__dow", text: n })); });
    for (var c = r.from; c <= r.to; c = DD.addDays(c, 1)) {
      (function (day) {
        var y = DD.ymd(day), jobs = byDay[y] || [];
        var allOff = offFor(off, y).some(function (o) { return !o.start_time; });
        var cls = "cal__cell" + (day.getMonth() !== d.getMonth() ? " is-outside" : "") + (allOff ? " cal__cell--off" : "");
        var label = DD.fmt.date(y) + ", " + (jobs.length ? plural(jobs.length, "job") : "no jobs") + (allOff ? ", time off" : "") + ". Open day view.";
        var kids = [
          el("span", { text: String(day.getDate()) }),
          jobs.length ? el("span", { "class": "cal__cell-count", text: plural(jobs.length, "job") }) : null
        ].concat(jobs.slice(0, 2).map(function (j) { return el("span", { "class": "cal__cell-time", text: shortTime(j.scheduled_start) }); }));
        var cell = el("button", { type: "button", "class": cls, "aria-current": y === tStr ? "date" : null, "aria-label": label }, kids);
        cell.addEventListener("click", function () { go("day", day); });
        grid.appendChild(cell);
      })(c);
    }
    return grid;
  }

  /* ---------- route ---------- */
  function render(main, match, query) {
    var my = ++seq;
    current = { main: main, match: match, query: query };
    if (nowTimer) { clearInterval(nowTimer); nowTimer = null; }

    var v = query.get("v");
    if (v !== "day" && v !== "week" && v !== "month") v = mql.matches ? "week" : "day";
    var d = DD.parseYmd(query.get("d")) || today();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var r = rangeFor(v, d);
    var unit = v;

    DD.clear(main);
    main.appendChild(el("h1", { tabindex: "-1", text: "Calendar" }));

    var prev = el("button", { type: "button", "class": "cal__nav", "aria-label": "Previous " + unit }, [DD.icon("i-chevron-left")]);
    var next = el("button", { type: "button", "class": "cal__nav", "aria-label": "Next " + unit }, [DD.icon("i-chevron-right")]);
    var todayBtn = el("button", { type: "button", "class": "btn btn--ghost" }, "Today");
    prev.addEventListener("click", function () { go(v, stepDate(v, d, -1)); });
    next.addEventListener("click", function () { go(v, stepDate(v, d, 1)); });
    todayBtn.addEventListener("click", function () { go(v, today()); });

    var seg = el("div", { "class": "segmented", role: "group", "aria-label": "Calendar view" });
    [["day", "Day"], ["week", "Week"], ["month", "Month"]].forEach(function (p) {
      var b = el("button", { type: "button", "aria-pressed": v === p[0] ? "true" : "false", text: p[1] });
      b.addEventListener("click", function () { go(p[0], d); });
      seg.appendChild(b);
    });
    var offLink = el("a", { "class": "btn btn--ghost", href: "#/settings" }, [DD.icon("i-plus"), "Add time off"]);
    offLink.addEventListener("click", function () { try { sessionStorage.setItem("ddm_scroll", "time-off"); } catch (e) { /* ignore */ } });

    var titleEl = el("p", { "class": "toolbar__title", "aria-live": "polite", text: titleFor(v, d, r) });
    main.appendChild(el("div", { "class": "toolbar" }, [
      el("div", { "class": "toolbar__group" }, [prev, todayBtn, next]),
      el("div", { "class": "toolbar__group" }, [seg, offLink])
    ]));
    main.appendChild(titleEl);
    var body = el("div", { "class": "cal cal--" + v });
    main.appendChild(body);

    function load() {
      DD.clear(body);
      body.appendChild(loadingNode());
      if (!DD.ok) { DD.clear(body); body.appendChild(errorNode(load, DD.ERR.NETWORK)); return; }
      var from = DD.ymd(r.from), to = DD.ymd(r.to);
      Promise.all([
        db(DD.sb.from("requests").select("id,ref,status,service_id,scheduled_date,scheduled_start,duration_min,buffer_min,customers(name)")
          .in("status", STATUSES).gte("scheduled_date", from).lte("scheduled_date", to).order("scheduled_start", { ascending: true }).limit(200)),
        db(DD.sb.from("time_off").select("id,start_date,end_date,start_time,end_time,reason").lte("start_date", to).gte("end_date", from).limit(200)),
        db(DD.sb.from("settings").select("hours,buffer_minutes").eq("id", 1).maybeSingle())
      ]).then(function (res) {
        if (my !== seq) return;
        draw(res[0] || [], res[1] || [], res[2] || {});
      }, function (e) {
        if (my !== seq) return;
        DD.clear(body);
        body.appendChild(errorNode(load, e && e.text));
      });
    }

    function draw(jobs, off, settings) {
      if (nowTimer) { clearInterval(nowTimer); nowTimer = null; }
      DD.clear(body);
      var byDay = {};
      jobs.forEach(function (j) { if (j.scheduled_date) (byDay[j.scheduled_date] = byDay[j.scheduled_date] || []).push(j); });
      var rangeJobs = jobs.length;
      var legend = el("p", { "class": "muted cal__legend" }, "Hatched areas are travel buffer and time off.");
      if (!rangeJobs) body.appendChild(el("p", { "class": "muted", role: "status", text: v === "day" ? "No jobs this day." : v === "week" ? "No jobs this week." : "No jobs this month." }));
      if (v === "month") {
        body.appendChild(monthGrid(r, d, byDay, off));
        return;
      }
      var days = [];
      for (var c = r.from; c <= r.to; c = DD.addDays(c, 1)) days.push(c);
      if (v === "week" && !mql.matches) { body.appendChild(agenda(days, byDay, off)); return; }
      var b = bounds(jobs, settings.hours);
      body.appendChild(gridTable(days, byDay, off, b, v === "day" ? "Schedule for " + titleFor(v, d, r) : "Schedule for the week of " + DD.fmt.date(DD.ymd(r.from))));
      body.appendChild(legend);
      if (days.some(function (x) { return DD.ymd(x) === DD.ymd(today()); })) {
        nowTimer = setInterval(function () {
          if (my !== seq || !document.body.contains(body)) { clearInterval(nowTimer); nowTimer = null; return; }
          draw(jobs, off, settings);
        }, 60000);
      }
    }

    load();
  }

  if (mql.addEventListener) {
    mql.addEventListener("change", function () {
      if (current && document.body.contains(current.main) && /^#\/calendar/.test(window.location.hash)) render(current.main, current.match, current.query);
    });
  }

  DDM.register(/^\/calendar$/, render);
})();
