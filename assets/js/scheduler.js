/* Daywon Detailing date and arrival-window picker.
   Fills hidden inputs named <prefix>_date (YYYY-MM-DD), <prefix>_time (e.g. "11:00 - 11:30 AM")
   and, when present, <prefix>_start (HH:MM, wall-clock America/New_York).
   Working hours come from SITE_CONFIG.schedule in config.js (offline fallback). When the portal is reachable,
   hours, days ahead, slot length, taken jobs and time off come from get_availability instead.
   Exposes window.DDSched = { init(root, opts), refreshAll(), availability(), getMinutes }. */
(function () {
  "use strict";

  var cfg = (window.SITE_CONFIG && window.SITE_CONFIG.schedule) || {
    slotMinutes: 30,
    daysAhead: 60,
    hours: { 0: [11, 17], 1: [11, 17], 2: [11, 17], 3: [14, 17], 4: [11, 17], 5: [14, 17], 6: [11, 17] }
  };
  var DOW = ["S", "M", "T", "W", "T", "F", "S"];
  var DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var STAFF_HOURS = [7, 20];
  var TAKEN_MSG = "That window was just taken. Pick another.";

  var instances = [];
  var shared = null;      // availability JSON from get_availability, once loaded
  var fetching = false;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function parseHm(s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(s || ""));
    return m ? +m[1] * 60 + +m[2] : null;
  }
  function hm(mins) { return pad(Math.floor(mins / 60)) + ":" + pad(mins % 60); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clock(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    var ap = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return { text: h12 + ":" + pad(m), ap: ap };
  }
  function windowLabel(a, b) {
    var x = clock(a), y = clock(b);
    return x.ap === y.ap ? x.text + " - " + y.text + " " + y.ap : x.text + " " + x.ap + " - " + y.text + " " + y.ap;
  }

  function fetchShared() {
    if (fetching || shared || !window.DD || !window.DD.ok || !window.DD.availability) return;
    fetching = true;
    var from = addDays(startOfDay(new Date()), -1);
    var to = addDays(from, 181);
    window.DD.availability(iso(from), iso(to)).then(function (a) {
      fetching = false;
      if (a && typeof a === "object" && a.hours) {
        shared = a;
        instances.forEach(function (i) { i.setAvail(); });
      }
    }, function () { fetching = false; /* keep config fallback */ });
  }

  function init(root, opts) {
    opts = opts || {};
    var staff = !!opts.staff;
    var form = root.closest("form");
    var prefix = root.getAttribute("data-prefix");
    var dateInput = form.elements[prefix + "_date"];
    var timeInput = form.elements[prefix + "_time"];
    var startInput = form.elements[prefix + "_start"] || null;
    var uid = prefix + "-sched";

    var A = opts.availability || null;   // per-instance override; otherwise the shared one
    var SLOT = cfg.slotMinutes || 30;
    var hoursMap = cfg.hours;
    var daysAhead = cfg.daysAhead || 60;
    var today, first, last, view;
    var selectedDate = null;
    var notice = "";

    function jobMinutes() {
      var fn = opts.getMinutes || (window.DDSched && window.DDSched.getMinutes);
      var v = 0;
      try { v = fn ? Number(fn()) : 0; } catch (e) { v = 0; }
      return v > 0 ? v : 30;
    }
    function hoursFor(date) {
      var h = hoursMap && hoursMap[date.getDay()];
      if (staff && !hoursMap) return STAFF_HOURS;   // settings not loaded: wide fallback; the server still enforces the real hours
      return h && h.length >= 2 ? h : null;
    }
    function offFor(date) {
      var out = [];
      var key = iso(date);
      var list = (A && A.off) || [];
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o && o.start_date <= key && o.end_date >= key) out.push(o);
      }
      return out;
    }
    function fullyOff(date) {
      if (staff) return false;
      return offFor(date).some(function (o) { return o.start_time == null || o.end_time == null; });
    }
    function isOpen(date) { return !!hoursFor(date) && !fullyOff(date); }
    function isTaken(date, t) {
      if (!A) return false;
      var m = jobMinutes();
      var key = iso(date);
      var busy = A.busy || [];
      for (var i = 0; i < busy.length; i++) {
        var b = busy[i];
        if (!b || b.date !== key) continue;
        var bs = parseHm(b.start);
        if (bs == null) continue;
        var bm = Number(b.minutes) || 0;
        if (t < bs + bm && t + m > bs) return true;
      }
      if (!staff) {
        var offs = offFor(date);
        for (var j = 0; j < offs.length; j++) {
          var o = offs[j];
          if (o.start_time == null || o.end_time == null) return true;
          var os = parseHm(o.start_time), oe = parseHm(o.end_time);
          if (os == null || oe == null) continue;
          if (t < oe && t + m > os) return true;
        }
      }
      return false;
    }
    function isOffSlot(date, t) {
      if (!staff || !A) return false;
      var m = jobMinutes();
      var offs = offFor(date);
      for (var j = 0; j < offs.length; j++) {
        var o = offs[j];
        if (o.start_time == null || o.end_time == null) return true;
        var os = parseHm(o.start_time), oe = parseHm(o.end_time);
        if (os == null || oe == null) continue;
        if (t < oe && t + m > os) return true;
      }
      return false;
    }
    function slotsFor(date) {
      var h = hoursFor(date);
      if (!h) return [];
      var out = [];
      var s = Math.round(h[0] * 60), e = Math.round(h[1] * 60);
      for (var t = s; t + SLOT <= e; t += SLOT) {
        out.push({ t: t, label: windowLabel(t, t + SLOT), taken: isTaken(date, t), off: isOffSlot(date, t) });
      }
      return out;
    }

    function compute() {
      var a = A || shared;
      if (a) {
        if (a.hours) hoursMap = a.hours;
        if (a.slot_minutes) SLOT = Number(a.slot_minutes) || SLOT;
        if (a.days_ahead) daysAhead = Number(a.days_ahead) || daysAhead;
      }
      var td = a && a.today ? parseYmd(a.today) : null;
      today = td || startOfDay(new Date());
      first = staff ? today : addDays(today, 1);
      last = addDays(staff ? today : first, staff ? daysAhead : daysAhead - 1);
      if (!view) view = new Date(first.getFullYear(), first.getMonth(), 1);
    }

    var head = el("div", "sched__head");
    var prev = el("button", "sched__nav");
    prev.type = "button"; prev.setAttribute("aria-label", "Previous month"); prev.textContent = "‹";
    var next = el("button", "sched__nav");
    next.type = "button"; next.setAttribute("aria-label", "Next month"); next.textContent = "›";
    var title = el("div", "sched__title");
    title.setAttribute("aria-live", "polite");
    head.appendChild(prev); head.appendChild(title); head.appendChild(next);

    var grid = el("div", "sched__grid");
    var slotsBox = el("div", "sched__slots");
    var summary = el("p", "sched__summary");
    summary.setAttribute("aria-live", "polite");
    root.appendChild(head); root.appendChild(grid); root.appendChild(slotsBox); root.appendChild(summary);

    function notify() {
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    function setStart(label, t) {
      timeInput.value = label;
      if (startInput) startInput.value = label ? hm(t) : "";
    }

    function setSummary() {
      if (selectedDate && timeInput.value) {
        summary.textContent = "Selected: " + DOW_FULL[selectedDate.getDay()] + ", " +
          selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + ", " + timeInput.value;
      } else if (notice) {
        summary.textContent = notice;
      } else if (selectedDate) {
        summary.textContent = "Now choose an arrival window.";
      } else {
        summary.textContent = "Choose a day to see arrival windows.";
      }
    }

    function renderSlots() {
      while (slotsBox.firstChild) slotsBox.removeChild(slotsBox.firstChild);
      if (!selectedDate) return;
      var h = hoursFor(selectedDate);
      if (!h) return;
      var s0 = Math.round(h[0] * 60), e0 = Math.round(h[1] * 60);
      var label = el("p", "sched__slots-label",
        DOW_FULL[selectedDate.getDay()] + " arrival windows (we work " + clock(s0).text + " " + clock(s0).ap + " to " + clock(e0).text + " " + clock(e0).ap + ")");
      slotsBox.appendChild(label);
      var list = el("div", "sched__slot-list");
      list.setAttribute("role", "group");
      list.setAttribute("aria-label", "Arrival windows");
      slotsFor(selectedDate).forEach(function (s) {
        var b = el("button", "sched__slot", s.label);
        b.type = "button";
        var sel = timeInput.value === s.label;
        b.setAttribute("aria-pressed", sel ? "true" : "false");
        if (sel) b.classList.add("is-selected");
        if (s.taken || s.off) {
          b.disabled = true;
          b.setAttribute("aria-label", s.label + (s.taken ? ", taken" : ", time off"));
        } else {
          b.addEventListener("click", function () {
            notice = "";
            setStart(s.label, s.t);
            renderSlots(); setSummary(); notify();
          });
        }
        list.appendChild(b);
      });
      slotsBox.appendChild(list);
    }

    function renderMonth() {
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      title.textContent = view.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      prev.disabled = view <= new Date(first.getFullYear(), first.getMonth(), 1);
      next.disabled = view >= new Date(last.getFullYear(), last.getMonth(), 1);
      DOW.forEach(function (d) {
        var c = el("span", "sched__dow", d);
        c.setAttribute("aria-hidden", "true");
        grid.appendChild(c);
      });
      var lead = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
      for (var i = 0; i < lead; i++) grid.appendChild(el("span", "sched__blank"));
      var days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (var d = 1; d <= days; d++) {
        var date = new Date(view.getFullYear(), view.getMonth(), d);
        var b = el("button", "sched__day", String(d));
        b.type = "button";
        b.setAttribute("aria-label", DOW_FULL[date.getDay()] + ", " + date.toLocaleDateString("en-US", { month: "long", day: "numeric" }));
        var ok = date >= first && date <= last && isOpen(date);
        b.disabled = !ok;
        if (selectedDate && iso(date) === iso(selectedDate)) { b.classList.add("is-selected"); b.setAttribute("aria-pressed", "true"); }
        else b.setAttribute("aria-pressed", "false");
        if (iso(date) === iso(today)) b.classList.add("is-today");
        (function (dt) {
          b.addEventListener("click", function () {
            selectedDate = dt;
            notice = "";
            dateInput.value = iso(dt);
            setStart("", 0);
            renderMonth(); renderSlots(); setSummary(); notify();
          });
        })(date);
        grid.appendChild(b);
      }
    }

    /* Re-render after availability or job length changes; clear a selection that is no longer valid. */
    function refresh() {
      compute();
      if (selectedDate) {
        var gone = false;
        if (selectedDate < first || selectedDate > last || !isOpen(selectedDate)) gone = true;
        else if (timeInput.value) {
          var still = false;
          slotsFor(selectedDate).forEach(function (s) { if (s.label === timeInput.value && !s.taken && !s.off) still = true; });
          if (!still) gone = true;
        }
        if (gone) {
          var hadTime = !!timeInput.value;
          if (!isOpen(selectedDate) || selectedDate < first || selectedDate > last) {
            selectedDate = null;
            dateInput.value = "";
          }
          setStart("", 0);
          if (hadTime) { notice = TAKEN_MSG; notify(); }
        }
      }
      renderMonth(); renderSlots(); setSummary();
    }

    prev.addEventListener("click", function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderMonth(); });
    next.addEventListener("click", function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderMonth(); });

    root.id = root.id || uid;
    compute();
    renderMonth(); renderSlots(); setSummary();

    instances.push({ setAvail: refresh, refresh: refresh });
    if (!opts.availability) fetchShared();
    if (shared && !opts.availability) refresh();
  }

  window.DDSched = {
    init: init,
    refreshAll: function () { instances.forEach(function (i) { i.refresh(); }); },
    availability: function () { return shared; },
    getMinutes: null
  };

  document.querySelectorAll("[data-sched]").forEach(function (r) { init(r); });
})();
