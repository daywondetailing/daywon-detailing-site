/* Daywon Detailing dashboard: settings (#/settings). Hours, scheduling, job lengths, time off, staff, email.
   Each block saves on its own. Column names match supabase/schema.sql. No API key or secret is ever shown or asked for. */
(function () {
  "use strict";
  if (!window.DDM || !window.DD) return;

  var DD = window.DD, DDM = window.DDM;
  var DATA = window.SITE_DATA || { services: [] };
  var TIMEOUT = ((window.SITE_CONFIG || {}).portal || {}).timeoutMs || 10000;
  var SETTINGS_COLS = "hours,slot_minutes,days_ahead,buffer_minutes,service_minutes,site_url,email_provider,email_from,email_staff,email_customers";
  var DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];
  var seq = 0;

  function el(tag, attrs, kids) { return DD.el(tag, attrs, kids); }
  function clear(n) { return DD.clear(n); }

  /* ---------- db + shared bits ---------- */
  function mk(e) {
    var msg = String((e && e.message) || "");
    var out = new Error(msg);
    out.pgcode = e && e.code;
    if (e && (e.name === "TypeError" || e.name === "AbortError" || /fetch|network|timeout|load failed/i.test(msg))) out.text = DD.ERR.NETWORK;
    else if (e && (e.code === "42501" || e.code === "PGRST301" || e.status === 401 || e.status === 403)) out.text = DD.ERR.NOT_ALLOWED;
    else if (e && e.code === "23505") out.text = "That email is already on the staff list.";
    else if (e && e.code === "23514") out.text = "One of those values isn't allowed. Check the fields and try again.";
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
  function inlineErr(box, msg) {
    clear(box);
    if (msg) box.appendChild(el("p", { "class": "field__error", role: "alert" }, [DD.icon("i-alert"), el("span", { text: msg })]));
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
  var uidN = 0;
  function uid() { uidN += 1; return "ms" + uidN; }
  function field(label, input, help, errBox) {
    return el("div", { "class": "field" }, [
      el("label", { "class": "field__label", "for": input.id, text: label }), input,
      help ? el("p", { "class": "field__help", id: input.id + "-help", text: help }) : null, errBox || null
    ]);
  }
  function numInput(min, max, step, value) {
    var i = el("input", { id: uid(), type: "number", inputmode: "numeric", min: min, max: max, step: step });
    i.value = value == null ? "" : String(value);
    return i;
  }
  function check(label, checked, disabled) {
    var i = el("input", { id: uid(), type: "checkbox" });
    i.checked = !!checked;
    i.disabled = !!disabled;
    return { wrap: el("label", { "class": "check", "for": i.id }, [i, el("span", { text: label })]), input: i };
  }
  function bad(input, box, msg) {
    inlineErr(box, msg);
    if (msg) { input.setAttribute("aria-invalid", "true"); input.focus(); } else input.removeAttribute("aria-invalid");
    return !msg;
  }
  function section(id, title) {
    var sec = el("section", { "class": "mg-sec", id: id || null }, [el("h2", { "class": "portal-sec__title", text: title, tabindex: "-1" })]);
    return sec;
  }
  /* Load a block: spinner, error + Retry, then draw(data) into body. */
  function loadBlock(body, fetchFn, draw) {
    function run() {
      clear(body);
      body.appendChild(el("p", { "class": "muted mg-loading", role: "status" }, [DD.icon("i-spinner", "icon--spin"), " Loading…"]));
      if (!DD.ok) { clear(body); body.appendChild(errorNode(run, DD.ERR.NETWORK)); return; }
      fetchFn().then(function (data) { clear(body); draw(data); }, function (e) { clear(body); body.appendChild(errorNode(run, e && e.text)); });
    }
    run();
  }
  function saveSettings(patch, btn, errBox, done) {
    inlineErr(errBox, "");
    setBusy(btn, true);
    db(DD.sb.from("settings").update(patch).eq("id", 1).select("id")).then(function (rows) {
      setBusy(btn, false);
      if (!rows || !rows.length) { inlineErr(errBox, "That wasn't saved. " + DD.ERR.NOT_ALLOWED); return; }
      if (DD.availability && DD.availability.clear) DD.availability.clear();
      DD.toast("Saved", "success");
      if (done) done();
    }, function (e) { setBusy(btn, false); inlineErr(errBox, e.text); });
  }
  function hourLabel(v) {
    var h = Math.floor(v), m = Math.round((v - h) * 60);
    return (h % 12 === 0 ? 12 : h % 12) + (m ? ":" + (m < 10 ? "0" : "") + m : "") + " " + (h >= 12 ? "PM" : "AM");
  }
  function fetchSettings() { return db(DD.sb.from("settings").select(SETTINGS_COLS).eq("id", 1).maybeSingle()); }

  /* ---------- render ---------- */
  function render(main) {
    var my = ++seq;
    clear(main);
    main.appendChild(el("h1", { tabindex: "-1", text: "Settings" }));
    var panel = el("div", { "class": "panel mg-settings" });
    main.appendChild(panel);

    var hoursSec = section("hours", "Hours");
    var schedSec = section("scheduling", "Scheduling");
    var lenSec = section("job-length", "Job length per service");
    var offSec = section("time-off", "Time off");
    var staffSec = section("staff", "Staff");
    var emailSec = section("email", "Email");
    [hoursSec, schedSec, lenSec, offSec, staffSec, emailSec].forEach(function (s) { panel.appendChild(s); });

    /* shared settings fetch, one promise per load */
    var cache = null;
    function settings() {
      if (!cache) cache = fetchSettings().then(function (r) { if (!r) throw mk({ message: "empty" }); return r; }, function (e) { cache = null; throw e; });
      return cache;
    }
    function settingsBlock(sec, draw) {
      var body = el("div");
      sec.appendChild(body);
      loadBlock(body, function () { return settings(); }, function (s) { if (my === seq) draw(body, s); });
    }

    /* ----- hours ----- */
    settingsBlock(hoursSec, function (body, s) {
      var hours = s.hours || {};
      var rows = [], form = el("form", { novalidate: "novalidate", "class": "mg-form" });
      var errBox = el("div");
      DAYS.forEach(function (d) {
        var cur = hours[String(d[0])];
        var open = Array.isArray(cur);
        var startV = open ? Number(cur[0]) : 11, endV = open ? Number(cur[1]) : 17;
        var oc = check("Open", open);
        var sSel = hourSelect(d[1] + " opens at", startV), eSel = hourSelect(d[1] + " closes at", endV);
        function sync() { sSel.sel.disabled = eSel.sel.disabled = !oc.input.checked; }
        oc.input.addEventListener("change", sync);
        sync();
        rows.push({ key: d[0], name: d[1], oc: oc, s: sSel, e: eSel });
        form.appendChild(el("div", { "class": "hours-row" }, [
          el("span", { "class": "hours-row__day", text: d[1] }), oc.wrap,
          el("div", { "class": "field" }, [sSel.label, sSel.sel]), el("div", { "class": "field" }, [eSel.label, eSel.sel])
        ]));
      });
      function hourSelect(label, v) {
        var opts = [];
        for (var h = 6; h <= 21; h++) opts.push(h);
        if (opts.indexOf(v) < 0 && isFinite(v)) { opts.push(v); opts.sort(function (a, b) { return a - b; }); }
        var sel = el("select", { id: uid() }, opts.map(function (h) { return el("option", { value: String(h), text: hourLabel(h) }); }));
        sel.value = String(v);
        return { sel: sel, label: el("label", { "class": "set-sr", "for": sel.id, text: label }) };
      }
      var btn = el("button", { type: "submit", "class": "btn btn--primary" }, "Save hours");
      form.appendChild(errBox);
      form.appendChild(el("p", { "class": "field__help", text: "Customers can only pick arrival windows inside these hours. Staff can book outside them." }));
      form.appendChild(el("div", { "class": "actions" }, [btn]));
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var out = {};
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          if (!r.oc.input.checked) continue;
          var a = Number(r.s.sel.value), b = Number(r.e.sel.value);
          if (!(b > a)) { bad(r.e.sel, errBox, r.name + " must close after it opens. Choose a later closing time."); return; }
          out[String(r.key)] = [a, b];
        }
        bad(btn, errBox, "");
        saveSettings({ hours: out }, btn, errBox);
      });
      body.appendChild(form);
    });

    /* ----- scheduling ----- */
    settingsBlock(schedSec, function (body, s) {
      var buf = numInput(0, 180, 5, s.buffer_minutes), days = numInput(7, 180, 1, s.days_ahead);
      var bufErr = el("div"), dayErr = el("div"), errBox = el("div");
      var win = el("p", { "class": "mg-static", text: s.slot_minutes + " minutes" });
      var btn = el("button", { type: "submit", "class": "btn btn--primary" }, "Save scheduling");
      var form = el("form", { novalidate: "novalidate", "class": "mg-form" }, [
        el("div", { "class": "mg-form__grid" }, [
          el("div", { "class": "field" }, [el("span", { "class": "field__label", text: "Arrival window" }), win, el("p", { "class": "field__help", text: "Fixed. Customers pick a window, not an exact time." })]),
          field("Travel buffer between jobs (minutes)", buf, "0 to 180. Applies to new quotes. Jobs already quoted keep their buffer.", bufErr),
          field("Booking window (days ahead)", days, "7 to 180. How far ahead customers can pick a date.", dayErr)
        ]), errBox, el("div", { "class": "actions" }, [btn])
      ]);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var b = Number(buf.value), d = Number(days.value);
        inlineErr(bufErr, ""); inlineErr(dayErr, "");
        if (buf.value === "" || !Number.isInteger(b) || b < 0 || b > 180) { bad(buf, bufErr, "Travel buffer must be a whole number from 0 to 180 minutes."); return; }
        if (days.value === "" || !Number.isInteger(d) || d < 7 || d > 180) { bad(days, dayErr, "Booking window must be a whole number from 7 to 180 days."); return; }
        saveSettings({ buffer_minutes: b, days_ahead: d }, btn, errBox);
      });
      body.appendChild(form);
    });

    /* ----- job length ----- */
    settingsBlock(lenSec, function (body, s) {
      var mins = s.service_minutes || {};
      var items = (DATA.services || []).map(function (sv) {
        var inp = numInput(15, 720, 15, mins[sv.id]);
        var err = el("div");
        return { id: sv.id, input: inp, err: err, node: field(sv.name + " (minutes)", inp, null, err) };
      });
      var errBox = el("div");
      var btn = el("button", { type: "submit", "class": "btn btn--primary" }, "Save job lengths");
      var form = el("form", { novalidate: "novalidate", "class": "mg-form" }, [
        el("p", { "class": "field__help", text: "Used to size the time a job holds on the calendar. Add-on time is added on top." }),
        el("div", { "class": "mg-form__grid" }, items.map(function (i) { return i.node; })), errBox,
        el("div", { "class": "actions" }, [btn])
      ]);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var out = Object.assign({}, mins);
        for (var i = 0; i < items.length; i++) {
          var v = Number(items[i].input.value);
          inlineErr(items[i].err, "");
          if (items[i].input.value === "" || !Number.isInteger(v) || v < 15 || v > 720) {
            bad(items[i].input, items[i].err, "Enter whole minutes from 15 to 720 for this service.");
            return;
          }
          out[items[i].id] = v;
        }
        saveSettings({ service_minutes: out }, btn, errBox, function () { mins = out; });
      });
      body.appendChild(form);
    });

    /* ----- time off ----- */
    (function () {
      var body = el("div");
      offSec.appendChild(body);
      var todayStr = DD.ymd(new Date());
      loadBlock(body, function () {
        return db(DD.sb.from("time_off").select("id,start_date,end_date,start_time,end_time,reason").gte("end_date", todayStr).order("start_date", { ascending: true }).limit(200));
      }, function (items) {
        if (my !== seq) return;
        items = items || [];
        var state = { confirm: null };
        var listBox = el("div");
        var live = el("div", { role: "status", "class": "set-sr" });

        function when(o) {
          var days = o.start_date === o.end_date ? DD.fmt.date(o.start_date) : DD.fmt.date(o.start_date) + " to " + DD.fmt.date(o.end_date);
          var t = o.start_time ? ", " + DD.fmt.window(o.start_time, toMin(o.end_time) - toMin(o.start_time)) : ", all day";
          return days + t;
        }
        function toMin(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? +m[1] * 60 + +m[2] : 0; }
        function paintList() {
          clear(listBox);
          if (!items.length) { listBox.appendChild(el("p", { "class": "muted", text: "No time off scheduled. You're open on your normal hours." })); return; }
          var ul = el("ul", { "class": "list-rows mg-items" });
          items.forEach(function (o) {
            var del = el("button", { type: "button", "class": "btn btn--ghost btn--danger", "aria-label": "Delete time off " + when(o) }, [DD.icon("i-trash"), "Delete"]);
            del.addEventListener("click", function () { state.confirm = o.id; paintList(); });
            var li = el("li", { "class": "mg-item" }, [
              el("div", { "class": "mg-item__main" }, [
                el("span", { "class": "list-row__title mg-wrap", text: when(o) }),
                o.reason ? el("span", { "class": "list-row__meta mg-wrap", text: o.reason }) : null
              ]),
              el("div", { "class": "mg-item__actions" }, [del])
            ]);
            if (state.confirm === o.id) {
              var err = el("div");
              var yes = el("button", { type: "button", "class": "btn btn--danger" }, "Yes, delete");
              var no = el("button", { type: "button", "class": "btn btn--ghost" }, "Keep it");
              no.addEventListener("click", function () { state.confirm = null; paintList(); });
              yes.addEventListener("click", function () {
                setBusy(yes, true); no.disabled = true;
                db(DD.sb.from("time_off").delete().eq("id", o.id).select("id")).then(function (rows) {
                  if (!rows || !rows.length) { setBusy(yes, false); no.disabled = false; inlineErr(err, "That wasn't deleted. " + DD.ERR.NOT_ALLOWED); return; }
                  items.splice(items.indexOf(o), 1); state.confirm = null; paintList();
                  live.textContent = "Time off deleted";
                  if (DD.availability.clear) DD.availability.clear();
                  DD.toast("Saved", "success");
                }, function (e) { setBusy(yes, false); no.disabled = false; inlineErr(err, e.text); });
              });
              li.appendChild(el("div", { "class": "inline-confirm" }, [el("p", { text: "Delete this time off? Customers will see those times as open again." }), err, el("div", { "class": "actions" }, [yes, no])]));
            }
            ul.appendChild(li);
          });
          listBox.appendChild(ul);
        }

        var sd = el("input", { id: uid(), type: "date", min: todayStr }), ed = el("input", { id: uid(), type: "date", min: todayStr });
        sd.value = ed.value = todayStr;
        var allDay = check("All day", true);
        var st = el("input", { id: uid(), type: "time", step: "1800" }), et = el("input", { id: uid(), type: "time", step: "1800" });
        st.value = "11:00"; et.value = "17:00";
        var timesBox = el("div", { "class": "mg-form__grid", hidden: "hidden" }, [field("From", st), field("Until", et)]);
        allDay.input.addEventListener("change", function () { timesBox.hidden = allDay.input.checked; });
        var reason = el("input", { id: uid(), type: "text", maxlength: "200", autocomplete: "off" });
        var errBox = el("div");
        var add = el("button", { type: "submit", "class": "btn btn--primary" }, [DD.icon("i-plus"), "Add time off"]);
        var form = el("form", { novalidate: "novalidate", "class": "mg-form" }, [
          el("div", { "class": "mg-form__grid" }, [field("Start date", sd), field("End date", ed)]),
          allDay.wrap, timesBox,
          field("Reason (private, only staff see it)", reason, null), errBox,
          el("div", { "class": "actions" }, [add])
        ]);
        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          if (!sd.value) { bad(sd, errBox, "Pick a start date."); return; }
          if (!ed.value) { bad(ed, errBox, "Pick an end date."); return; }
          if (ed.value < sd.value) { bad(ed, errBox, "The end date can't be before the start date. Pick a later end date."); return; }
          var row = { start_date: sd.value, end_date: ed.value, start_time: null, end_time: null, reason: reason.value.trim() || null };
          if (!allDay.input.checked) {
            if (!st.value || !et.value) { bad(st, errBox, "Pick both a start and an end time, or choose All day."); return; }
            if (et.value <= st.value) { bad(et, errBox, "The end time must be after the start time. Pick a later end time."); return; }
            row.start_time = st.value; row.end_time = et.value;
          }
          if (reason.value.length > 200) { bad(reason, errBox, "Keep the reason under 200 characters."); return; }
          bad(add, errBox, "");
          setBusy(add, true);
          db(DD.sb.from("time_off").insert(row).select("id,start_date,end_date,start_time,end_time,reason")).then(function (rows) {
            setBusy(add, false);
            if (!rows || !rows.length) { inlineErr(errBox, "That wasn't saved. " + DD.ERR.NOT_ALLOWED); return; }
            items.push(rows[0]);
            items.sort(function (a, b) { return a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0; });
            reason.value = ""; paintList();
            if (DD.availability.clear) DD.availability.clear();
            DD.toast("Saved", "success");
          }, function (e) { setBusy(add, false); inlineErr(errBox, e.text); });
        });
        body.appendChild(live);
        body.appendChild(listBox);
        body.appendChild(el("h3", { "class": "mg-subtitle", text: "Add time off" }));
        body.appendChild(form);
        paintList();
        var want = "";
        try { want = sessionStorage.getItem("ddm_scroll") || ""; sessionStorage.removeItem("ddm_scroll"); } catch (e) { /* ignore */ }
        if (want === "time-off") setTimeout(function () { offSec.scrollIntoView(); var h = offSec.querySelector("h2"); if (h) h.focus({ preventScroll: true }); }, 80);
      });
    })();

    /* ----- staff ----- */
    (function () {
      var body = el("div");
      staffSec.appendChild(body);
      loadBlock(body, function () {
        return db(DD.sb.from("staff").select("email,name,active,notify").order("created_at", { ascending: true }).limit(200));
      }, function (items) {
        if (my !== seq) return;
        items = items || [];
        var listBox = el("div");
        function paintList() {
          clear(listBox);
          if (!items.length) { listBox.appendChild(el("p", { "class": "muted", text: "No staff yet." })); return; }
          var ul = el("ul", { "class": "list-rows mg-items" });
          items.forEach(function (p) {
            var err = el("div");
            var act = check("Active", p.active), nt = check("Email alerts", p.notify);
            function update(col, input, label) {
              var val = input.checked, patch = {};
              if (col === "active" && !val && DDM.staff && DDM.staff.email === p.email) {
                input.checked = true;
                inlineErr(err, "You can't turn off the account you're signed in with. Sign in as someone else to do that.");
                return;
              }
              patch[col] = val;
              inlineErr(err, ""); input.disabled = true;
              db(DD.sb.from("staff").update(patch).eq("email", p.email).select("email")).then(function (rows) {
                input.disabled = false;
                if (!rows || !rows.length) { input.checked = !val; inlineErr(err, "That wasn't saved. " + DD.ERR.NOT_ALLOWED); return; }
                p[col] = val; DD.toast("Saved", "success");
              }, function (e) { input.disabled = false; input.checked = !val; inlineErr(err, e.text); });
            }
            act.input.addEventListener("change", function () { update("active", act.input); });
            nt.input.addEventListener("change", function () { update("notify", nt.input); });
            ul.appendChild(el("li", { "class": "mg-item mg-item--staff" }, [
              el("div", { "class": "mg-item__main" }, [el("span", { "class": "list-row__title mg-wrap", text: p.name }), el("span", { "class": "list-row__meta mg-wrap", text: p.email })]),
              el("div", { "class": "mg-item__actions mg-item__actions--checks" }, [act.wrap, nt.wrap]), err
            ]));
          });
          listBox.appendChild(ul);
        }
        var nm = el("input", { id: uid(), type: "text", maxlength: "60", autocomplete: "off" });
        var em = el("input", { id: uid(), type: "email", inputmode: "email", maxlength: "254", autocomplete: "off", autocapitalize: "off" });
        var errBox = el("div");
        var add = el("button", { type: "submit", "class": "btn btn--primary" }, [DD.icon("i-plus"), "Add staff"]);
        var form = el("form", { novalidate: "novalidate", "class": "mg-form" }, [
          el("div", { "class": "mg-form__grid" }, [field("Name", nm), field("Email", em, "Create this login in Supabase first (Authentication, Users, Add user, Auto Confirm), then add it here.")]),
          errBox, el("div", { "class": "actions" }, [add])
        ]);
        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          var n = nm.value.trim(), e = em.value.trim().toLowerCase();
          if (!n || n.length > 60) { bad(nm, errBox, "Enter a name up to 60 characters."); return; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { bad(em, errBox, "Enter an email like name@example.com."); return; }
          bad(add, errBox, "");
          setBusy(add, true);
          db(DD.sb.from("staff").insert({ email: e, name: n }).select("email,name,active,notify")).then(function (rows) {
            setBusy(add, false);
            if (!rows || !rows.length) { inlineErr(errBox, "That wasn't saved. " + DD.ERR.NOT_ALLOWED); return; }
            items.push(rows[0]); nm.value = ""; em.value = ""; paintList();
            DD.toast("Saved", "success");
          }, function (er) { setBusy(add, false); inlineErr(errBox, er.text); });
        });
        body.appendChild(listBox);
        body.appendChild(el("h3", { "class": "mg-subtitle", text: "Add staff" }));
        body.appendChild(form);
        paintList();
      });
    })();

    /* ----- email ----- */
    settingsBlock(emailSec, function (body, s) {
      var es = check("Email staff when a request or message comes in", s.email_staff);
      var ec = check("Email customers about quotes, bookings and messages", s.email_customers);
      var url = el("input", { id: uid(), type: "url", inputmode: "url", maxlength: "200", autocomplete: "off", autocapitalize: "off", placeholder: "https://daywondetailing.com/" });
      url.value = s.site_url || "";
      var urlErr = el("div"), errBox = el("div");
      var btn = el("button", { type: "submit", "class": "btn btn--primary" }, "Save email settings");
      var form = el("form", { novalidate: "novalidate", "class": "mg-form" }, [
        el("dl", { "class": "summary-list mg-ro" }, [
          el("div", null, [el("dt", { text: "Provider" }), el("dd", { text: s.email_provider === "none" ? "None (emails are switched off)" : s.email_provider })]),
          el("div", null, [el("dt", { text: "Sent from" }), el("dd", { text: s.email_from })])
        ]),
        el("p", { "class": "field__help", text: "Provider and sender are set in the database, see SETUP-PORTAL.md. The email API key is stored safely in the vault and is never shown here." }),
        es.wrap, ec.wrap,
        field("Website address used in email links", url, "Start with https:// and end with a slash.", urlErr), errBox,
        el("div", { "class": "actions" }, [btn])
      ]);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var u = url.value.trim();
        inlineErr(urlErr, "");
        if (u && !/^https:\/\/.+\/$/.test(u)) { bad(url, urlErr, "Start with https:// and end with a slash, like https://daywondetailing.com/."); return; }
        saveSettings({ email_staff: es.input.checked, email_customers: ec.input.checked, site_url: u || null }, btn, errBox);
      });
      body.appendChild(form);

      /* recent emails */
      body.appendChild(el("h3", { "class": "mg-subtitle", text: "Recent emails" }));
      var recent = el("div");
      body.appendChild(recent);
      loadBlock(recent, function () {
        return db(DD.sb.from("notifications").select("id,recipient,template,status,error,channel,created_at").eq("channel", "email").order("created_at", { ascending: false }).limit(20));
      }, function (rows) {
        if (my !== seq) return;
        if (!rows || !rows.length) { recent.appendChild(el("p", { "class": "muted", text: "No emails yet. They appear here once the first request comes in." })); return; }
        var ul = el("ul", { "class": "list-rows mg-items" });
        rows.forEach(function (n) {
          ul.appendChild(el("li", { "class": "mg-item mg-item--mail" }, [
            el("div", { "class": "mg-item__main" }, [
              el("span", { "class": "list-row__title mg-wrap" }, [n.template + " ", el("span", { "class": "mini-status", "data-s": n.status, text: n.status })]),
              el("span", { "class": "list-row__meta mg-wrap", text: "To " + n.recipient }),
              el("span", { "class": "list-row__meta", text: DD.fmt.ago(n.created_at) }),
              n.error ? el("span", { "class": "mg-mail-error mg-wrap", text: n.error }) : null
            ])
          ]));
        });
        recent.appendChild(ul);
      });
    });
  }

  DDM.register(/^#\/settings$/, render);
})();
