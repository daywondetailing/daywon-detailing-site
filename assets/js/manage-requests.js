/* Daywon Detailing staff dashboard: requests inbox (#/requests) and request detail (#/r/<id>).
   Uses the DDM contract from manage.js. All data is rendered with textContent via DD.el.
   Writes go through RPCs, except the direct writes the grants allow (requests.assigned, customer_notes insert).
   Dates are YYYY-MM-DD and times HH:MM, wall-clock. Add-on prices come from SITE_DATA only. */
(function () {
  "use strict";

  var DD = window.DD || { ok: false };
  var DDM = window.DDM;
  if (!DDM) return;
  var CFG = window.SITE_CONFIG || {};
  var TIMEOUT = (CFG.portal && CFG.portal.timeoutMs) || 10000;
  var DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function el(tag, attrs, kids) { return DD.el(tag, attrs, kids); }
  function clear(n) { return DD.clear(n); }

  /* ---------- small helpers ---------- */
  function setBusy(btn, on) {
    if (!btn) return;
    if (on) {
      if (!btn._kids) btn._kids = Array.prototype.slice.call(btn.childNodes);
      clear(btn);
      btn.appendChild(DD.icon("i-spinner", "icon--spin"));
      btn.appendChild(document.createTextNode("Please wait…"));
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
    } else {
      if (btn._kids) { clear(btn); btn._kids.forEach(function (k) { btn.appendChild(k); }); btn._kids = null; }
      btn.removeAttribute("aria-busy");
      btn.disabled = false;
    }
  }
  function showErr(box, msg) {
    clear(box);
    if (!msg) return;
    box.appendChild(el("p", { "class": "field__error", role: "alert" }, [DD.icon("i-alert"), el("span", { text: msg })]));
  }
  function errText(e) {
    if (e && e.code === "SLOT_TAKEN") return "That time overlaps another job. Pick another time.";
    return (e && e.text) || DD.ERR.UNKNOWN;
  }
  function mkErr(e) {
    var msg = String((e && e.message) || "");
    var out = new Error(msg);
    if (e && (e.name === "TypeError" || e.name === "AbortError" || /fetch|network|timeout|load failed/i.test(msg))) out.text = DD.ERR.NETWORK;
    else if (e && (e.code === "42501" || e.status === 401 || e.status === 403 || e.code === "PGRST301")) out.text = DD.ERR.NOT_ALLOWED;
    else out.text = DD.ERR.UNKNOWN;
    return out;
  }
  function db(builder) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (done) return; done = true; reject(mkErr({ name: "AbortError", message: "timeout" })); }, TIMEOUT);
      Promise.resolve(builder).then(function (res) {
        if (done) return;
        done = true; clearTimeout(t);
        if (res && res.error) reject(mkErr(res.error)); else resolve(res ? res.data : null);
      }, function (e) { if (done) return; done = true; clearTimeout(t); reject(mkErr(e)); });
    });
  }
  function stLabel(s) { return (DD.STATUS[s] && DD.STATUS[s].staff) || s || ""; }
  function chip(status) { return el("span", { "class": "chip-status", "data-status": status, text: stLabel(status) }); }
  function whenText(d, t) { return d && t ? DD.fmt.date(d) + ", " + DD.fmt.window(t) : ""; }
  function hhmm(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? (m[1].length < 2 ? "0" : "") + m[1] + ":" + m[2] : ""; }
  function one(x) { return Array.isArray(x) ? x[0] || null : x || null; }
  function vehicleText(v) { return v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : ""; }
  function digits(s) { return String(s || "").replace(/[^\d+]/g, ""); }
  function btn(label, cls, icon, type) {
    return el("button", { type: type || "button", "class": "btn " + (cls || "btn--ghost") }, [icon ? DD.icon(icon) : null, label]);
  }
  function field(id, label, input, help, optional) {
    return el("div", { "class": "field" }, [
      el("label", { "class": "field__label", "for": id }, [label, optional ? el("span", { "class": "field__optional", text: " (optional)" }) : null]),
      input,
      help ? el("p", { "class": "field__help", text: help }) : null
    ]);
  }
  function loadingView(main, title) {
    main.appendChild(el("h1", { tabindex: "-1", text: title }));
    var p = el("p", { "class": "muted", text: "One moment." });
    main.appendChild(p);
    return p;
  }
  function errorView(main, h1, msg, retry) {
    var box = el("div", { "class": "error-summary", role: "alert" }, [el("p", { text: msg })]);
    var kids = [box];
    if (retry) {
      var b = btn("Try again", "btn--primary");
      b.addEventListener("click", retry);
      kids.push(el("div", { "class": "actions" }, [b]));
    }
    return kids;
  }

  /* =====================================================================
     LIST  #/requests
     ===================================================================== */
  var FILTERS = [
    { id: "needs", label: "Needs action" },
    { id: "upcoming", label: "Upcoming" },
    { id: "done", label: "Done" },
    { id: "cancelled", label: "Cancelled" },
    { id: "all", label: "All" }
  ];
  var EMPTY = {
    needs: "Nothing needs action. Nice.",
    upcoming: "No upcoming jobs right now.",
    done: "No finished jobs yet.",
    cancelled: "No cancelled requests.",
    all: "No requests yet. New requests show up here."
  };
  var listState = { filter: "needs", q: "" };
  var LIST_COLS = "id,ref,status,service_id,customer_id,preferred_date,preferred_start,scheduled_date,scheduled_start,created_at,source," +
    "customers(name,phone,email),vehicles(year,make,model)";

  function renderList(main, m, query) {
    var alive = true;
    var seen = null;
    var data = { reqs: [], props: {}, unread: {} };
    if (query && query.f && FILTERS.some(function (f) { return f.id === query.f; })) listState.filter = query.f;

    var h1 = el("h1", { tabindex: "-1", text: "Requests" });
    var newBtn = el("a", { "class": "btn btn--primary", href: "quote.html?staff=1" }, [DD.icon("i-plus"), "New booking"]);
    main.appendChild(el("div", { "class": "toolbar" }, [h1, newBtn]));

    var chips = el("div", { "class": "manage-filters", role: "group", "aria-label": "Filter requests" });
    var searchInput = el("input", { id: "req-search", type: "search", autocomplete: "off", placeholder: "Name, phone, email or ref" });
    searchInput.value = listState.q;
    var searchWrap = el("div", { "class": "field manage-search" }, [
      el("label", { "class": "field__label visually-hidden", "for": "req-search", text: "Search requests" }),
      searchInput
    ]);
    var body = el("div", { "aria-live": "polite" });
    main.appendChild(chips);
    main.appendChild(searchWrap);
    main.appendChild(body);

    function needs(r) { return r.status === "new" || r.status === "approved" || !!data.props[r.id] || !!data.unread[r.id]; }
    var tests = {
      needs: needs,
      upcoming: function (r) { return ["quoted", "scheduled", "on_the_way", "in_progress"].indexOf(r.status) >= 0; },
      done: function (r) { return r.status === "done"; },
      cancelled: function (r) { return r.status === "cancelled"; },
      all: function () { return true; }
    };
    function ts(r) { return (r.scheduled_date || "9999-12-31") + " " + (r.scheduled_start || "00:00"); }
    function sorted(list, f) {
      var out = list.slice();
      if (f === "needs") out.sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
      else if (f === "upcoming") out.sort(function (a, b) { var x = ts(a), y = ts(b); return x < y ? -1 : x > y ? 1 : 0; });
      else out.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
      return out;
    }
    function matches(r, q) {
      if (!q) return true;
      var c = one(r.customers) || {};
      var low = q.toLowerCase();
      if (String(c.name || "").toLowerCase().indexOf(low) >= 0) return true;
      if (String(c.email || "").toLowerCase().indexOf(low) >= 0) return true;
      if (String(r.ref || "").toLowerCase().indexOf(low) >= 0) return true;
      var qd = low.replace(/\D/g, "");
      return qd.length >= 3 && digits(c.phone).replace(/\D/g, "").indexOf(qd) >= 0;
    }

    function paintChips() {
      clear(chips);
      FILTERS.forEach(function (f) {
        var n = data.reqs.filter(tests[f.id]).length;
        var label = f.id === "needs" && n ? f.label + " (" + n + ")" : f.label;
        var c = el("button", { type: "button", "class": "chip", "aria-current": listState.filter === f.id ? "true" : null, text: label });
        c.addEventListener("click", function () { listState.filter = f.id; paintChips(); paintRows(); });
        chips.appendChild(c);
      });
    }
    function paintRows() {
      clear(body);
      var list = sorted(data.reqs.filter(tests[listState.filter]).filter(function (r) { return matches(r, listState.q.trim()); }), listState.filter);
      if (!list.length) {
        body.appendChild(el("p", { "class": "list-rows__empty", text: listState.q.trim() ? "No requests match \"" + listState.q.trim() + "\"." : EMPTY[listState.filter] }));
        return;
      }
      var ul = el("ul", { "class": "list-rows" });
      list.forEach(function (r) {
        var c = one(r.customers) || {};
        var v = vehicleText(one(r.vehicles));
        var when = r.scheduled_date && r.scheduled_start ? whenText(r.scheduled_date, r.scheduled_start)
          : (r.preferred_date && r.preferred_start ? "Wants " + whenText(r.preferred_date, r.preferred_start) : "No time chosen");
        var unread = !!data.unread[r.id];
        var isNew = seen && !seen[r.id];
        var meta = [
          el("span", { "class": "list-row__meta", text: DD.service(r.service_id) + (v ? " · " + v : "") }),
          el("span", { "class": "list-row__meta", text: when + (data.props[r.id] ? " · Asked for a new time" : "") })
        ];
        var end = [];
        if (unread) end.push(el("span", { "class": "unread-dot", "aria-label": "unread messages", role: "img" }));
        end.push(chip(r.status));
        ul.appendChild(el("li", null, [
          el("a", { "class": "list-row" + (unread ? " is-unread" : "") + (isNew ? " is-new" : ""), href: "#/r/" + r.id }, [
            el("span", { "class": "list-row__main" }, [el("span", { "class": "list-row__title", text: c.name || "Customer" })].concat(meta)),
            el("span", { "class": "list-row__end" }, end)
          ])
        ]));
      });
      body.appendChild(ul);
    }

    function load(silent) {
      if (!silent) { clear(body); body.appendChild(el("p", { "class": "muted", text: "Loading requests…" })); }
      Promise.all([
        db(DD.sb.from("requests").select(LIST_COLS).order("created_at", { ascending: false }).limit(200)),
        db(DD.sb.from("time_proposals").select("request_id").eq("status", "pending").eq("proposed_by", "customer").limit(200)),
        db(DD.sb.from("messages").select("request_id").eq("sender", "customer").is("read_by_staff_at", null).limit(200))
      ]).then(function (r) {
        if (!alive) return;
        var firstLoad = !seen;
        data.reqs = r[0] || [];
        data.props = {}; (r[1] || []).forEach(function (x) { data.props[x.request_id] = 1; });
        data.unread = {}; (r[2] || []).forEach(function (x) { data.unread[x.request_id] = 1; });
        paintChips(); paintRows();
        if (firstLoad || true) { seen = seen || {}; data.reqs.forEach(function (x) { seen[x.id] = 1; }); }
      }, function (e) {
        if (!alive) return;
        if (silent) return;
        clear(body);
        errorView(main, h1, (e && e.text) || DD.ERR.UNKNOWN, function () { load(false); }).forEach(function (k) { body.appendChild(k); });
      });
    }

    var timer = null;
    searchInput.addEventListener("input", function () {
      listState.q = searchInput.value;
      clearTimeout(timer);
      timer = setTimeout(paintRows, 120);
    });
    function onChange(ev) {
      if (!alive) return;
      ev.preventDefault();
      load(true);
    }
    document.addEventListener("ddm:change", onChange);
    paintChips();
    load(false);
    return function () { alive = false; clearTimeout(timer); document.removeEventListener("ddm:change", onChange); };
  }

  /* =====================================================================
     DETAIL  #/r/<id>
     ===================================================================== */
  var REQ_COLS = "id,ref,customer_id,vehicle_id,address_id,service_id,addon_ids,preferred_date,preferred_start,backup_date,backup_start," +
    "notes,status,quote_amount,quote_note,quoted_at,scheduled_date,scheduled_start,duration_min,buffer_min,assigned,paid,paid_amount," +
    "paid_method,paid_at,cancelled_by,cancel_reason,source,created_at,started_at,finished_at,work_started_at,work_seconds," +
    "customers(id,name,phone,email,contact_method),vehicles(year,make,model,size,color),addresses(street,line2,city,state,zip)";

  function pickSlot(root, ymd, time) {
    var d = DD.parseYmd(ymd);
    if (!d) return false;
    var titleEl = root.querySelector(".sched__title");
    var navs = root.querySelectorAll(".sched__nav");
    if (!titleEl || navs.length < 2) return false;
    var want = d.getFullYear() * 12 + d.getMonth();
    for (var i = 0; i < 14; i++) {
      var mm = /^(\w+) (\d{4})$/.exec(titleEl.textContent.trim());
      var cur = mm ? new Date(Date.parse(mm[1] + " 1, " + mm[2])) : null;
      if (!cur || isNaN(cur.getTime())) break;
      var have = cur.getFullYear() * 12 + cur.getMonth();
      if (have === want) break;
      var nav = navs[have < want ? 1 : 0];
      if (nav.disabled) return false;
      nav.click();
    }
    var label = DOW_FULL[d.getDay()] + ", " + d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    var days = root.querySelectorAll(".sched__day"), day = null;
    for (var j = 0; j < days.length; j++) if (days[j].getAttribute("aria-label") === label) day = days[j];
    if (!day || day.disabled) return false;
    day.click();
    var wl = DD.fmt.window(hhmm(time), 30);
    var slots = root.querySelectorAll(".sched__slot"), slot = null;
    for (var k = 0; k < slots.length; k++) if (slots[k].textContent === wl) slot = slots[k];
    if (!slot || slot.disabled) return false;
    slot.click();
    return true;
  }

  function renderDetail(main, m) {
    var id = m[1];
    var alive = true;
    var D = null;
    var ui = { panel: null };
    var built = false;
    var refs = {};
    var h1 = el("h1", { tabindex: "-1", text: "Loading request" });
    main.appendChild(h1);
    var holder = el("div");
    main.appendChild(holder);
    holder.appendChild(el("p", { "class": "muted", text: "One moment." }));

    /* ---------- data ---------- */
    function fetchAll() {
      return Promise.all([
        db(DD.sb.from("requests").select(REQ_COLS).eq("id", id).maybeSingle()),
        db(DD.sb.from("time_proposals").select("id,proposed_by,proposed_date,proposed_start,note,created_at").eq("request_id", id).eq("status", "pending").limit(5)),
        db(DD.sb.from("messages").select("id,sender,author_name,body,created_at,read_by_staff_at").eq("request_id", id).order("created_at", { ascending: true }).limit(200)),
        db(DD.sb.from("request_events").select("id,kind,from_status,to_status,actor,actor_name,created_at").eq("request_id", id).order("created_at", { ascending: true }).limit(200)),
        db(DD.sb.from("customer_notes").select("id,body,author_name,created_at").eq("request_id", id).order("created_at", { ascending: true }).limit(200)),
        db(DD.sb.from("staff").select("name,active").order("name", { ascending: true }).limit(50)).catch(function () { return []; }),
        db(DD.sb.from("settings").select("service_minutes,addon_minutes,buffer_minutes").eq("id", 1).maybeSingle()).catch(function () { return null; })
      ]).then(function (r) {
        return { r: r[0], props: r[1] || [], msgs: r[2] || [], events: r[3] || [], notes: r[4] || [], staff: r[5] || [], settings: r[6] || {} };
      });
    }
    function reload(closePanel) {
      return fetchAll().then(function (d) {
        if (!alive) return;
        if (!d.r) { showNotFound(); return; }
        var before = D && D.r.status;
        D = d;
        if (closePanel || (before && before !== D.r.status)) ui.panel = null;
        paint();
      }, function (e) {
        if (!alive) return;
        if (!D) showLoadError(e);
        else DD.toast((e && e.text) || DD.ERR.UNKNOWN, "danger");
      });
    }
    function showNotFound() {
      h1.textContent = "We couldn't find that request.";
      document.title = "Not found | Manage | Daywon Detailing";
      clear(holder);
      holder.appendChild(el("p", null, [el("a", { "class": "btn btn--primary", href: "#/requests" }, ["Back to Requests"])]));
    }
    function showLoadError(e) {
      h1.textContent = "We couldn't load this request";
      clear(holder);
      errorView(main, h1, (e && e.text) || DD.ERR.UNKNOWN, function () { clear(holder); holder.appendChild(el("p", { "class": "muted", text: "One moment." })); reload(true); })
        .forEach(function (k) { holder.appendChild(k); });
      holder.appendChild(el("p", null, [el("a", { "class": "link-btn", href: "#/requests" }, ["Back to Requests"])]));
    }

    /* ---------- actions ---------- */
    function run(button, fn, errBox, okMsg, closePanel) {
      showErr(errBox, "");
      setBusy(button, true);
      return fn().then(function () {
        setBusy(button, false);
        if (okMsg) DD.toast(okMsg, "success");
        DDM.refreshCounts();
        return reload(closePanel !== false);
      }, function (e) {
        setBusy(button, false);
        showErr(errBox, errText(e));
        if (e && e.code === "BAD_STATUS") reload(false);
      });
    }
    function setStatus(to, note) {
      return function () { return DD.rpc("set_status", { p_request: id, p_status: to, p_note: note || null }); };
    }

    /* ---------- build skeleton once ---------- */
    function build() {
      clear(holder);
      built = true;
      refs.head = el("div");
      refs.contact = el("div", { "class": "actions manage-contact" });
      refs.bar = el("div", { "class": "manage-bar" });
      refs.barErr = el("div", { "aria-live": "polite" });
      refs.panel = el("div");
      refs.pending = el("div");
      refs.sJob = el("section", { "class": "portal-sec portal-sec--first", "aria-labelledby": "h-job" });
      refs.sAssign = el("section", { "class": "portal-sec", "aria-labelledby": "h-assign" });
      refs.sMsg = el("section", { "class": "portal-sec", "aria-labelledby": "h-msgs" });
      refs.sNotes = el("section", { "class": "portal-sec", "aria-labelledby": "h-notes" });
      refs.sTime = el("section", { "class": "portal-sec", "aria-labelledby": "h-tl" });
      holder.appendChild(el("p", null, [el("a", { "class": "link-btn", href: "#/requests" }, [DD.icon("i-chevron-left"), "Requests"])]));
      holder.appendChild(refs.head);
      holder.appendChild(refs.contact);
      holder.appendChild(refs.bar);
      holder.appendChild(refs.barErr);
      holder.appendChild(refs.panel);
      holder.appendChild(refs.pending);
      holder.appendChild(el("div", { "class": "panel manage-detail" }, [refs.sJob, refs.sAssign, refs.sMsg, refs.sNotes, refs.sTime]));
      // message composer is built once so a draft survives refreshes
      buildMessages();
      buildNotes();
    }

    function paint() {
      if (!built) build();
      var r = D.r, c = one(r.customers) || {};
      h1.textContent = c.name || "Customer";
      document.title = (c.name || "Request") + " | Manage | Daywon Detailing";
      paintHead(); paintContact(); paintBar(); paintPanel(); paintPending();
      paintJob(); paintAssigned(); paintThread(); paintNotes(); paintTimeline();
    }

    function paintHead() {
      var r = D.r;
      clear(refs.head);
      refs.head.appendChild(el("p", { "class": "portal-meta" }, [
        el("span", { text: "Ref " + r.ref }),
        chip(r.status),
        r.source === "staff" ? el("span", { text: "Phone booking" }) : null,
        el("span", { text: "Sent " + DD.fmt.ago(r.created_at) })
      ]));
      if (r.status === "in_progress" || (r.status === "done" && (Number(r.work_seconds) || 0) > 0)) {
        var running = r.status === "in_progress";
        refs.timerText = el("span", { "class": "job-timer__time", text: running ? DDM.clockText(DDM.elapsedSec(r)) : DDM.durationText(Number(r.work_seconds) || 0) });
        refs.head.appendChild(el("div", { "class": "job-timer" + (running ? " is-running" : "") }, [
          DD.icon("i-clock"),
          el("span", { "class": "job-timer__label", text: running ? "Job timer" : "Time on the job" }),
          refs.timerText
        ]));
      } else { refs.timerText = null; }
      if (r.status === "cancelled" && (r.cancel_reason || r.cancelled_by)) {
        refs.head.appendChild(el("p", { "class": "muted portal-note", text: "Cancelled by " + (r.cancelled_by || "someone") + (r.cancel_reason ? ": " + r.cancel_reason : "") }));
      }
    }

    function addressText(a) {
      if (!a) return "";
      return (a.line2 ? a.street + ", " + a.line2 : a.street) + ", " + a.city + ", " + a.state + " " + a.zip;
    }
    function paintContact() {
      var r = D.r, c = one(r.customers) || {}, a = one(r.addresses);
      clear(refs.contact);
      var ph = digits(c.phone);
      if (ph) {
        refs.contact.appendChild(el("a", { "class": "btn btn--ghost", href: "tel:" + ph }, [DD.icon("i-phone"), "Call"]));
        refs.contact.appendChild(el("a", { "class": "btn btn--ghost", href: "sms:" + ph }, [DD.icon("i-message"), "Text"]));
      }
      if (c.email) refs.contact.appendChild(el("a", { "class": "btn btn--ghost", href: "mailto:" + c.email }, [DD.icon("i-mail"), "Email"]));
      if (a) refs.contact.appendChild(el("a", {
        "class": "btn btn--ghost", target: "_blank", rel: "noopener",
        href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addressText(a))
      }, [DD.icon("i-map"), "Open in Maps"]));
    }

    function togglePanel(name) {
      ui.panel = ui.panel === name ? null : name;
      paintBar();
      paintPanel(true);
      if (ui.panel) {
        var f = refs.panel.querySelector("input:not([type=hidden]), textarea");
        var target = refs.panel.firstChild;
        if (target && target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
        if (f && name !== "quote" && name !== "suggest") f.focus();
        else if (f && name === "quote") f.focus();
      }
    }

    function paintBar() {
      var r = D.r, st = r.status;
      clear(refs.bar);
      showErr(refs.barErr, "");
      var primary = null, secondary = [];
      function toggler(name, label, icon, cls) {
        var b = btn(label, cls, icon);
        b.setAttribute("aria-expanded", ui.panel === name ? "true" : "false");
        b.addEventListener("click", function () { togglePanel(name); });
        return b;
      }
      function statusBtn(label, to, cls, icon) {
        var b = btn(label, cls, icon);
        b.addEventListener("click", function () { run(b, setStatus(to), refs.barErr, null); });
        return b;
      }
      if (st === "new") primary = toggler("quote", "Send quote", "i-send", "btn--primary");
      else if (st === "quoted") {
        refs.bar.appendChild(el("p", { "class": "manage-bar__wait" }, [DD.icon("i-clock"), "Waiting for customer"]));
        secondary.push(statusBtn("Customer accepted by phone", "approved", "btn--ghost"));
      } else if (st === "approved") primary = statusBtn("Confirm booking", "scheduled", "btn--primary", "i-check");
      else if (st === "scheduled") primary = statusBtn("On the way", "on_the_way", "btn--primary", "i-car");
      else if (st === "on_the_way") { primary = statusBtn("Start job", "in_progress", "btn--primary"); secondary.push(statusBtn("Undo on the way", "scheduled", "btn--ghost")); }
      else if (st === "in_progress") primary = statusBtn("Mark done", "done", "btn--primary", "i-check");
      else if (st === "done" && !r.paid) primary = toggler("paid", "Mark paid", "i-check", "btn--primary");
      if (primary) refs.bar.appendChild(primary);
      if (["new", "quoted", "approved", "scheduled", "on_the_way"].indexOf(st) >= 0) secondary.push(toggler("suggest", "Suggest a different time", "i-clock", "btn--ghost"));
      if (st === "quoted" || st === "approved") secondary.push(toggler("quote", "Edit quote", "i-edit", "btn--ghost"));
      if (["new", "quoted", "approved", "scheduled", "on_the_way"].indexOf(st) >= 0) secondary.push(toggler("cancel", "Cancel request", null, "btn--ghost btn--danger"));
      if (st === "cancelled") secondary.push(statusBtn("Reopen", "new", "btn--ghost"));
      if (secondary.length) refs.bar.appendChild(el("div", { "class": "actions manage-bar__more" }, secondary));
    }

    /* ---------- inline panels ---------- */
    /* A background refresh (tab switch, live update) must not wipe a form someone is typing in. */
    function paintPanel(force) {
      if (!force && ui.panel && ui.shown === ui.panel && refs.panel.firstChild) return;
      ui.shown = ui.panel;
      clear(refs.panel);
      if (!ui.panel) return;
      var p = ui.panel === "quote" ? quotePanel() : ui.panel === "suggest" ? suggestPanel() : ui.panel === "cancel" ? cancelPanel() : ui.panel === "paid" ? paidPanel() : null;
      if (p) refs.panel.appendChild(p);
    }
    function closePanel() { ui.panel = null; paintBar(); paintPanel(true); }

    function initPicker(root, form, opts, pre) {
      root.appendChild(el("p", { "class": "muted", text: "Loading open times…" }));
      var from = DD.addDays(new Date(), -1), to = DD.addDays(from, 181);
      DD.availability(DD.ymd(from), DD.ymd(to)).then(function (av) { return av; }, function () { return null; }).then(function (av) {
        if (!alive || !root.isConnected) return;
        clear(root);
        var own = D.r.scheduled_date && D.r.scheduled_start ? { date: D.r.scheduled_date, start: hhmm(D.r.scheduled_start) } : null;
        var A = null;
        if (av && av.hours) {
          A = JSON.parse(JSON.stringify(av));
          if (own && Array.isArray(A.busy)) {
            var dropped = false;
            A.busy = A.busy.filter(function (b) { if (!dropped && b.date === own.date && b.start === own.start) { dropped = true; return false; } return true; });
          }
        }
        if (!window.DDSched) { root.appendChild(el("p", { "class": "muted", text: "The time picker isn't available. Reload the page." })); return; }
        var o = { staff: true, getMinutes: opts.getMinutes };
        if (A) o.availability = A;
        window.DDSched.init(root, o);
        if (pre) pre();
      });
    }
    function quickPicks(root, errBox, picks) {
      var row = el("div", { "class": "manage-quick" });
      picks.forEach(function (p) {
        if (!p.date || !p.start) return;
        var b = btn(p.label + ": " + whenText(p.date, p.start), "btn--ghost");
        b.addEventListener("click", function () {
          showErr(errBox, "");
          if (!pickSlot(root, p.date, p.start)) showErr(errBox, "That window isn't open or is taken. Pick another below.");
        });
        row.appendChild(b);
      });
      return row.firstChild ? row : null;
    }
    function hiddenInputs(prefix) {
      return [el("input", { type: "hidden", name: prefix + "_date" }), el("input", { type: "hidden", name: prefix + "_time" }), el("input", { type: "hidden", name: prefix + "_start" })];
    }

    function quotePanel() {
      var r = D.r;
      var editing = r.quote_amount != null && (r.status === "quoted" || r.status === "approved");
      var sm = D.settings.service_minutes || {}, am = D.settings.addon_minutes || {};
      var base = Number(sm[r.service_id]) || 120;
      (r.addon_ids || []).forEach(function (a) { base += Number(am[a]) || 0; });
      var form = el("form", { "class": "inline-confirm manage-form", novalidate: "novalidate", "aria-labelledby": "qp-title" });
      hiddenInputs("q").forEach(function (h) { form.appendChild(h); });
      form.appendChild(el("p", { id: "qp-title" }, [el("strong", { text: editing ? "Edit quote" : "Send quote" })]));
      if (r.status === "approved") form.appendChild(el("p", { "class": "muted", text: "Sending a new quote asks the customer to accept again." }));

      var amount = el("input", { id: "qp-amount", name: "amount", inputmode: "decimal", autocomplete: "off", required: "required" });
      if (r.quote_amount != null) amount.value = String(Number(r.quote_amount));
      form.appendChild(field("qp-amount", "Total price ($)", amount));

      var addIds = r.addon_ids || [];
      var help = el("p", { "class": "field__help" });
      if (addIds.length) {
        help.appendChild(document.createTextNode("Add-ons chosen: "));
        addIds.forEach(function (a, i) {
          var ad = DD.addon(a);
          help.appendChild(document.createTextNode(ad.name + " "));
          if (ad.price != null) help.appendChild(el("span", { "data-addon-price": "", text: DD.fmt.money(ad.price) }));
          help.appendChild(document.createTextNode(i < addIds.length - 1 ? ", " : ". "));
        });
        help.appendChild(document.createTextNode("Include them in the total."));
      } else help.appendChild(document.createTextNode("No add-ons chosen."));
      form.appendChild(help);

      var errBox = el("div", { "aria-live": "polite" });
      var schedErr = el("div", { "aria-live": "polite" });
      var root = el("div", { "class": "sched", "data-prefix": "q", id: "qp-sched" });
      var qp = quickPicks(root, schedErr, [
        { label: "First choice", date: r.preferred_date, start: r.preferred_start },
        { label: "Backup", date: r.backup_date, start: r.backup_start }
      ]);
      form.appendChild(el("p", { "class": "field__label", text: "Arrival window" }));
      if (qp) form.appendChild(qp);
      form.appendChild(schedErr);
      form.appendChild(root);

      var dur = el("input", { id: "qp-dur", name: "duration", type: "number", min: "15", max: "720", step: "15", inputmode: "numeric", required: "required" });
      dur.value = String(editing ? r.duration_min : base);
      form.appendChild(field("qp-dur", "Job length (minutes)", dur, "Starts as the usual time for this package and add-ons."));
      var note = el("textarea", { id: "qp-note", name: "note", rows: "3", maxlength: "500" });
      note.value = r.quote_note || "";
      form.appendChild(field("qp-note", "Note to customer", note, null, true));
      form.appendChild(errBox);
      var send = btn(editing ? "Update quote" : "Send quote", "btn--primary", "i-send", "submit");
      var cancel = btn("Never mind", "btn--ghost");
      cancel.addEventListener("click", closePanel);
      form.appendChild(el("div", { "class": "actions" }, [send, cancel]));

      dur.addEventListener("input", function () { if (window.DDSched) window.DDSched.refreshAll(); });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (send.disabled) return;
        var amt = Number(String(amount.value).replace(/[$,\s]/g, ""));
        var d = form.elements.q_date.value, s = form.elements.q_start.value;
        var dm = parseInt(dur.value, 10);
        var nt = note.value.trim();
        amount.removeAttribute("aria-invalid"); dur.removeAttribute("aria-invalid");
        if (!amount.value.trim() || !isFinite(amt) || !(amt > 0 && amt < 10000)) { amount.setAttribute("aria-invalid", "true"); showErr(errBox, DD.ERR.INVALID.amount); amount.focus(); return; }
        if (!d || !s) { showErr(errBox, "Pick a day and an arrival window for the job."); return; }
        if (!(dm >= 15 && dm <= 720)) { dur.setAttribute("aria-invalid", "true"); showErr(errBox, DD.ERR.INVALID.duration); dur.focus(); return; }
        if (nt.length > 500) { showErr(errBox, DD.ERR.INVALID.note); return; }
        run(send, function () {
          return DD.rpc("send_quote", { p_request: id, p_amount: amt, p_date: d, p_start: s, p_duration: dm, p_note: nt || null });
        }, errBox, "Quote sent.").then(function () {
          if (window.DDSched) window.DDSched.refreshAll();
        });
      });

      initPicker(root, form, { getMinutes: function () { return Number(dur.value) || 0; } }, function () {
        if (editing && r.scheduled_date && r.scheduled_start) pickSlot(root, r.scheduled_date, r.scheduled_start);
      });
      return form;
    }

    function suggestPanel() {
      var r = D.r;
      var form = el("form", { "class": "inline-confirm manage-form", novalidate: "novalidate", "aria-labelledby": "sp-title" });
      hiddenInputs("s").forEach(function (h) { form.appendChild(h); });
      form.appendChild(el("p", { id: "sp-title" }, [el("strong", { text: "Suggest a different time" })]));
      var root = el("div", { "class": "sched", "data-prefix": "s", id: "sp-sched" });
      form.appendChild(root);
      var note = el("textarea", { id: "sp-note", name: "note", rows: "2", maxlength: "500" });
      form.appendChild(field("sp-note", "Note to customer", note, null, true));
      var errBox = el("div", { "aria-live": "polite" });
      form.appendChild(errBox);
      var send = btn("Send suggestion", "btn--primary", "i-send", "submit");
      var cancel = btn("Never mind", "btn--ghost");
      cancel.addEventListener("click", closePanel);
      form.appendChild(el("div", { "class": "actions" }, [send, cancel]));
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (send.disabled) return;
        var d = form.elements.s_date.value, s = form.elements.s_start.value, nt = note.value.trim();
        if (!d || !s) { showErr(errBox, "Pick a day and an arrival window."); return; }
        if (nt.length > 500) { showErr(errBox, DD.ERR.INVALID.note); return; }
        run(send, function () { return DD.rpc("propose_time", { p_request: id, p_date: d, p_start: s, p_note: nt || null }); }, errBox, "Suggestion sent.");
      });
      initPicker(root, form, { getMinutes: function () { return r.duration_min || 120; } }, null);
      return form;
    }

    function cancelPanel() {
      var form = el("form", { "class": "inline-confirm manage-form", novalidate: "novalidate" });
      form.appendChild(el("p", null, [el("strong", { text: "Cancel this request?" })]));
      var reason = el("textarea", { id: "cp-reason", name: "reason", rows: "2", maxlength: "500" });
      form.appendChild(field("cp-reason", "Reason (the customer will see this)", reason, null, true));
      var errBox = el("div", { "aria-live": "polite" });
      form.appendChild(errBox);
      var yes = btn("Yes, cancel request", "btn--ghost btn--danger", null, "submit");
      var no = btn("Keep it", "btn--ghost");
      no.addEventListener("click", closePanel);
      form.appendChild(el("div", { "class": "actions" }, [yes, no]));
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (yes.disabled) return;
        var t = reason.value.trim();
        if (t.length > 500) { showErr(errBox, DD.ERR.INVALID.reason); return; }
        run(yes, setStatus("cancelled", t), errBox, "Request cancelled.");
      });
      return form;
    }

    function paidPanel() {
      var r = D.r;
      var form = el("form", { "class": "inline-confirm manage-form", novalidate: "novalidate", "aria-labelledby": "pp-title" });
      form.appendChild(el("p", { id: "pp-title" }, [el("strong", { text: "Mark paid" })]));
      var amount = el("input", { id: "pp-amount", name: "amount", inputmode: "decimal", autocomplete: "off", required: "required" });
      amount.value = r.quote_amount != null ? String(Number(r.quote_amount)) : "";
      form.appendChild(field("pp-amount", "Amount received ($)", amount));
      var methods = el("fieldset", { "class": "manage-methods" }, [el("legend", { "class": "field__label", text: "Paid by" })]);
      ["Tap to Pay", "Cash", "Zelle", "Cash App", "Other"].forEach(function (mth, i) {
        var inp = el("input", { type: "radio", name: "method", value: mth });
        if (i === 0) inp.checked = true;
        methods.appendChild(el("label", { "class": "choice" }, [inp, el("span", { "class": "choice__body" }, [el("span", { "class": "choice__title", text: mth })])]));
      });
      var wrap = el("div", { "class": "choice-grid choice-grid--inline" });
      while (methods.childNodes.length > 1) wrap.appendChild(methods.childNodes[1]);
      methods.appendChild(wrap);
      form.appendChild(methods);
      var errBox = el("div", { "aria-live": "polite" });
      form.appendChild(errBox);
      var save = btn("Save", "btn--primary", "i-check", "submit");
      var cancel = btn("Never mind", "btn--ghost");
      cancel.addEventListener("click", closePanel);
      form.appendChild(el("div", { "class": "actions" }, [save, cancel]));
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (save.disabled) return;
        var amt = Number(String(amount.value).replace(/[$,\s]/g, ""));
        var mth = form.elements.method.value;
        if (!amount.value.trim() || !isFinite(amt) || amt < 0 || amt >= 10000) { amount.setAttribute("aria-invalid", "true"); showErr(errBox, "Enter the amount received, under $10,000."); amount.focus(); return; }
        run(save, function () { return DD.rpc("mark_paid", { p_request: id, p_paid: true, p_amount: amt, p_method: mth }); }, errBox, "Marked paid.");
      });
      return form;
    }

    /* ---------- pending suggestion + paid line ---------- */
    function paintPending() {
      var r = D.r;
      clear(refs.pending);
      if (r.paid) {
        var undo = btn("Undo", "btn--ghost");
        var perr = el("div", { "aria-live": "polite" });
        undo.addEventListener("click", function () {
          run(undo, function () { return DD.rpc("mark_paid", { p_request: id, p_paid: false, p_amount: null, p_method: null }); }, perr, "Payment undone.");
        });
        var pd = r.paid_at ? new Date(r.paid_at) : null;
        var when = pd && !isNaN(pd.getTime()) ? " on " + pd.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
        refs.pending.appendChild(el("div", { "class": "inline-confirm manage-paid" }, [
          el("p", null, [DD.icon("i-check"), " Paid " + DD.fmt.money(r.paid_amount) + " by " + (r.paid_method || "Other") + when]),
          el("div", { "class": "actions" }, [undo]), perr
        ]));
      }
      if (["in_progress", "done", "cancelled"].indexOf(r.status) >= 0) return;
      var p = D.props[0];
      if (!p) return;
      var c = one(r.customers) || {};
      var box = el("section", { "class": "inline-confirm manage-pending", "aria-labelledby": "h-pend" });
      var errBox = el("div", { "aria-live": "polite" });
      if (p.proposed_by === "customer") {
        box.appendChild(el("p", { id: "h-pend" }, [el("strong", { text: (c.name || "The customer") + " asked for " + whenText(p.proposed_date, p.proposed_start) })]));
        if (p.note) box.appendChild(el("p", { "class": "portal-note", text: p.note }));
        var yes = btn("Accept", "btn--primary", "i-check");
        var no = btn("Decline", "btn--ghost");
        yes.addEventListener("click", function () { run(yes, function () { return DD.rpc("respond_proposal", { p_proposal: p.id, p_accept: true }); }, errBox, "Time accepted."); });
        no.addEventListener("click", function () { run(no, function () { return DD.rpc("respond_proposal", { p_proposal: p.id, p_accept: false }); }, errBox, "Suggestion declined."); });
        box.appendChild(el("div", { "class": "actions" }, [yes, no]));
      } else {
        box.appendChild(el("p", { id: "h-pend" }, [DD.icon("i-clock"), " Waiting for the customer to answer your suggestion (" + whenText(p.proposed_date, p.proposed_start) + ")"]));
      }
      box.appendChild(errBox);
      refs.pending.appendChild(box);
    }

    /* ---------- sections ---------- */
    function paintJob() {
      var r = D.r, c = one(r.customers) || {}, v = one(r.vehicles), a = one(r.addresses);
      clear(refs.sJob);
      refs.sJob.appendChild(el("h2", { "class": "portal-sec__title", id: "h-job", text: "Job" }));
      var dl = el("dl", { "class": "summary-list" });
      function row(term, lines) {
        var dd = el("dd", { "class": "portal-lines" });
        lines.forEach(function (l) { dd.appendChild(el("div", null, Array.isArray(l) ? l : [l])); });
        dl.appendChild(el("dt", { text: term }));
        dl.appendChild(dd);
      }
      row("Service", [DD.service(r.service_id)]);
      var adds = (r.addon_ids || []).map(function (aid) {
        var ad = DD.addon(aid);
        return ad.price != null ? [ad.name + " ", el("span", { "data-addon-price": "", text: DD.fmt.money(ad.price) })] : [ad.name];
      });
      row("Add-ons", adds.length ? adds : ["None"]);
      row("Vehicle", [vehicleText(v) || "Not available"]);
      row("Size", [(v && v.size) || "Not given"]);
      row("Color", [(v && v.color) || "Not given"]);
      row("Address", a ? [a.line2 ? a.street + ", " + a.line2 : a.street, a.city + ", " + a.state + " " + a.zip] : ["Not available"]);
      var tl = [];
      if (r.scheduled_date && r.scheduled_start) tl.push("Booked: " + whenText(r.scheduled_date, r.scheduled_start) + " (" + r.duration_min + " min + " + r.buffer_min + " min travel)");
      if (r.preferred_date && r.preferred_start) tl.push("Preferred: " + whenText(r.preferred_date, r.preferred_start));
      if (r.backup_date && r.backup_start) tl.push("Backup: " + whenText(r.backup_date, r.backup_start));
      row("Time", tl.length ? tl : ["Not set yet"]);
      if (r.quote_amount != null) row("Quote", [DD.fmt.money(r.quote_amount) + (r.quote_note ? " · " + r.quote_note : "")]);
      row("Prefers", [c.contact_method || "Not given"]);
      row("Customer notes", [r.notes ? r.notes : "None"]);
      refs.sJob.appendChild(dl);
    }

    function paintAssigned() {
      var r = D.r, names = [];
      (D.staff || []).forEach(function (s) { if (s.active && names.indexOf(s.name) < 0) names.push(s.name); });
      (r.assigned || []).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
      clear(refs.sAssign);
      refs.sAssign.appendChild(el("h2", { "class": "portal-sec__title", id: "h-assign", text: "Assigned" }));
      if (!names.length) { refs.sAssign.appendChild(el("p", { "class": "muted", text: "No staff to assign yet." })); return; }
      var errBox = el("div", { "aria-live": "polite" });
      var group = el("div", { "class": "manage-assign", role: "group", "aria-labelledby": "h-assign" });
      var boxes = [];
      names.forEach(function (n) {
        var cb = el("input", { type: "checkbox", value: n });
        cb.checked = (r.assigned || []).indexOf(n) >= 0;
        boxes.push(cb);
        cb.addEventListener("change", function () {
          var pick = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
          boxes.forEach(function (b) { b.disabled = true; });
          showErr(errBox, "");
          db(DD.sb.from("requests").update({ assigned: pick }).eq("id", id).select("id")).then(function (rows) {
            boxes.forEach(function (b) { b.disabled = false; });
            if (!rows || !rows.length) { cb.checked = !cb.checked; showErr(errBox, DD.ERR.NOT_ALLOWED); return; }
            D.r.assigned = pick;
            DD.toast("Saved", "success");
          }, function (e) {
            boxes.forEach(function (b) { b.disabled = false; });
            cb.checked = !cb.checked;
            showErr(errBox, errText(e));
          });
        });
        group.appendChild(el("label", { "class": "check" }, [cb, el("span", { text: n })]));
      });
      refs.sAssign.appendChild(group);
      refs.sAssign.appendChild(errBox);
    }

    /* messages: thread repainted on data change, composer built once */
    function buildMessages() {
      refs.sMsg.appendChild(el("h2", { "class": "portal-sec__title", id: "h-msgs", text: "Messages" }));
      refs.thread = el("div", { "class": "thread thread--staff", id: "m-thread", tabindex: "0", "aria-label": "Message history", "aria-live": "polite" });
      refs.sMsg.appendChild(refs.thread);
      var ta = el("textarea", { id: "m-body", name: "body", rows: "3", maxlength: "2000" });
      var count = el("span", { "class": "field__help", text: "0 / 2000" });
      var send = btn("Send", "btn--primary", "i-send", "submit");
      var errBox = el("div", { "aria-live": "polite" });
      var form = el("form", { "class": "field portal-composer", novalidate: "novalidate" }, [
        el("label", { "class": "field__label", "for": "m-body", text: "Message the customer" }),
        ta,
        el("div", { "class": "portal-composer__row" }, [count, send]),
        errBox
      ]);
      ta.addEventListener("input", function () { count.textContent = ta.value.length + " / 2000"; ta.removeAttribute("aria-invalid"); });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (send.disabled) return;
        var body = ta.value.trim();
        if (!body || body.length > 2000) { ta.setAttribute("aria-invalid", "true"); showErr(errBox, DD.ERR.INVALID.body); ta.focus(); return; }
        showErr(errBox, "");
        setBusy(send, true);
        DD.rpc("send_message", { p_request: id, p_body: body }).then(function () {
          setBusy(send, false);
          ta.value = ""; count.textContent = "0 / 2000";
          return reloadMessages(true);
        }, function (e) { setBusy(send, false); ta.setAttribute("aria-invalid", "true"); showErr(errBox, errText(e)); });
      });
      refs.sMsg.appendChild(form);
    }
    var shown = {}, firstThread = true;
    function paintThread() {
      var t = refs.thread;
      var stick = firstThread || (t.scrollHeight - t.scrollTop - t.clientHeight < 80);
      clear(t);
      if (!D.msgs.length) t.appendChild(el("p", { "class": "thread__empty", text: "No messages yet." }));
      D.msgs.forEach(function (mm) {
        var isNew = !firstThread && !shown[mm.id];
        shown[mm.id] = true;
        var who = mm.sender === "staff" ? (mm.author_name || "Daywon Detailing") : (mm.author_name || "Customer");
        t.appendChild(el("div", { "class": "bubble bubble--" + (mm.sender === "staff" ? "staff" : "customer") + (isNew ? " is-new" : "") }, [
          document.createTextNode(mm.body),
          el("span", { "class": "bubble__meta", text: who + " · " + DD.fmt.ago(mm.created_at) })
        ]));
      });
      firstThread = false;
      if (stick) t.scrollTop = t.scrollHeight;
      markRead();
    }
    function markRead() {
      var unread = D.msgs.some(function (x) { return x.sender === "customer" && !x.read_by_staff_at; });
      if (!unread || document.hidden) return;
      DD.rpc("mark_read", { p_request: id }).then(function () {
        D.msgs.forEach(function (x) { if (x.sender === "customer" && !x.read_by_staff_at) x.read_by_staff_at = new Date().toISOString(); });
        DDM.refreshCounts();
      }, function () { /* ignore */ });
    }
    function reloadMessages() {
      return db(DD.sb.from("messages").select("id,sender,author_name,body,created_at,read_by_staff_at").eq("request_id", id).order("created_at", { ascending: true }).limit(200))
        .then(function (rows) { if (!alive) return; D.msgs = rows || []; paintThread(); }, function () { /* keep last */ });
    }

    /* staff notes */
    function buildNotes() {
      refs.sNotes.appendChild(el("h2", { "class": "portal-sec__title", id: "h-notes", text: "Staff notes" }));
      refs.noteList = el("ul", { "class": "manage-notes" });
      refs.sNotes.appendChild(refs.noteList);
      var ta = el("textarea", { id: "n-body", name: "body", rows: "2", maxlength: "2000" });
      var add = btn("Add note", "btn--ghost", "i-plus", "submit");
      var errBox = el("div", { "aria-live": "polite" });
      var form = el("form", { "class": "field", novalidate: "novalidate" }, [
        el("label", { "class": "field__label", "for": "n-body", text: "Add a note. Only staff see these." }),
        ta,
        el("div", { "class": "actions" }, [add]),
        errBox
      ]);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (add.disabled) return;
        var body = ta.value.trim();
        if (!body || body.length > 2000) { ta.setAttribute("aria-invalid", "true"); showErr(errBox, "Write a note between 1 and 2,000 characters."); ta.focus(); return; }
        ta.removeAttribute("aria-invalid");
        showErr(errBox, "");
        setBusy(add, true);
        var c = one(D.r.customers) || {};
        db(DD.sb.from("customer_notes").insert({ customer_id: D.r.customer_id, request_id: id, body: body, author_name: DDM.staff.name || null }).select("id,body,author_name,created_at")).then(function (rows) {
          setBusy(add, false);
          ta.value = "";
          if (rows && rows[0]) D.notes.push(rows[0]);
          paintNotes();
          DD.toast("Note added", "success");
        }, function (e) { setBusy(add, false); showErr(errBox, errText(e)); });
      });
      refs.sNotes.appendChild(form);
    }
    function paintNotes() {
      clear(refs.noteList);
      if (!D.notes.length) { refs.noteList.appendChild(el("li", { "class": "muted", text: "No notes yet." })); return; }
      D.notes.forEach(function (n) {
        refs.noteList.appendChild(el("li", null, [
          el("span", { "class": "portal-note", text: n.body }),
          el("span", { "class": "timeline__time", text: (n.author_name || "Staff") + " · " + DD.fmt.ago(n.created_at) })
        ]));
      });
    }

    function paintTimeline() {
      clear(refs.sTime);
      refs.sTime.appendChild(el("h2", { "class": "portal-sec__title", id: "h-tl", text: "Timeline" }));
      var ol = el("ol", { "class": "timeline" });
      D.events.forEach(function (ev) {
        var who = ev.actor_name || ev.actor;
        var label = "";
        switch (ev.kind) {
          case "created": label = "Request created"; break;
          case "status": label = ev.to_status ? "Status: " + stLabel(ev.to_status) : ""; break;
          case "time_proposed": label = (ev.actor === "staff" ? "Staff" : "Customer") + " suggested a new time"; break;
          case "time_accepted": label = "New time accepted"; break;
          case "time_declined": label = "Time suggestion declined"; break;
          case "time_withdrawn": label = "Time suggestion withdrawn"; break;
          case "time_changed": label = "Time updated"; break;
          case "paid": label = "Payment recorded"; break;
          default: label = "";
        }
        if (!label) return;
        var d = new Date(ev.created_at);
        var full = isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        ol.appendChild(el("li", null, [
          el("span", { "class": "timeline__label", text: label }),
          el("time", { "class": "timeline__time", datetime: ev.created_at, title: full, text: (who ? who + " · " : "") + DD.fmt.ago(ev.created_at) })
        ]));
      });
      if (!ol.firstChild) ol.appendChild(el("li", null, [el("span", { "class": "timeline__label", text: "Request created" })]));
      refs.sTime.appendChild(ol);
    }

    /* ---------- live updates ---------- */
    var timer = null;
    function onChange(ev) {
      if (!alive || !D) return;
      var d = ev.detail || {}, row = d.row || {};
      if (d.table === "messages" && row.request_id === id) {
        ev.preventDefault();
        reloadMessages();
      } else if (d.table === "requests" && row.id === id) {
        ev.preventDefault();
        clearTimeout(timer);
        timer = setTimeout(function () { reload(false); }, 250);
      }
    }
    function onVisible() { if (!document.hidden && D && alive) reload(false); }
    document.addEventListener("ddm:change", onChange);
    document.addEventListener("visibilitychange", onVisible);

    reload(true);
    var jobTickDetail = setInterval(function () {
      if (!alive || !D || !refs.timerText || D.r.status !== "in_progress") return;
      refs.timerText.textContent = DDM.clockText(DDM.elapsedSec(D.r));
    }, 1000);
    return function () {
      alive = false;
      clearInterval(jobTickDetail);
      clearTimeout(timer);
      document.removeEventListener("ddm:change", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }

  DDM.register(/^\/requests$/, renderList);
  DDM.register(/^\/r\/([0-9a-fA-F-]{36})$/, renderDetail);
})();
