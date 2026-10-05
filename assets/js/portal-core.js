/* Daywon Detailing portal core. Exposes window.DD (auth, rpc, formatting, DOM helpers, realtime, code login).
   Loaded after config.js, data.js, site.js and the supabase-js CDN. Never uses innerHTML with data. Never logs sessions. */
(function () {
  "use strict";

  var CONFIG = window.SITE_CONFIG || {};
  var PORTAL = CONFIG.portal || {};
  var CONTACT = CONFIG.contact || {};
  var SCHED = CONFIG.schedule || {};
  var DATA = window.SITE_DATA || { services: [], addOns: [] };
  var PHONE = CONTACT.phoneDisplay || "240-579-5092";
  var TIMEOUT = PORTAL.timeoutMs || 10000;
  var SVGNS = "http://www.w3.org/2000/svg";

  var DD = { ok: false, sb: null };
  window.DD = DD;

  /* ---------- client ---------- */
  try {
    if (PORTAL.enabled && window.supabase && typeof window.supabase.createClient === "function" &&
        PORTAL.supabaseUrl && PORTAL.supabaseKey) {
      DD.sb = window.supabase.createClient(PORTAL.supabaseUrl, PORTAL.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      DD.ok = !!DD.sb;
    }
  } catch (e) {
    DD.sb = null;
    DD.ok = false;
  }

  /* ---------- error copy ---------- */
  var INVALID = {
    name: "Enter your name.",
    phone: "Enter a phone number with area code, like 240-555-0123.",
    email: "Enter an email like name@example.com.",
    contact_method: "Choose how we should reach you.",
    vehicle_year: "Enter a 4-digit year, or leave it blank.",
    vehicle_make: "Enter the make, like Toyota or Ford.",
    vehicle_model: "Enter the model.",
    vehicle_size: "Choose your vehicle's size. It's how we price the job.",
    vehicle_color: "Enter the vehicle's color.",
    service: "Choose a package.",
    addons: "One of those add-ons isn't available for this package. Remove it and try again.",
    address_street: "Enter the street address where we'll do the detail.",
    address_line2: "Keep the address line 2 under 200 characters.",
    address_city: "Enter the city.",
    address_state: "Choose a state.",
    address_zip: "Enter a 5-digit ZIP code.",
    in_area: "We only serve addresses within 15 miles of Silver Spring. Check the box to confirm, or call us to ask.",
    preferred_date: "Choose a preferred date and an arrival window we're open.",
    backup_date: "Choose a backup date and arrival window that is different from your first choice.",
    notes: "Keep notes under 1,000 characters.",
    note: "Keep the note under 500 characters.",
    reason: "Keep the reason under 500 characters.",
    body: "Write a message between 1 and 2,000 characters.",
    amount: "Enter an amount greater than $0 and under $10,000.",
    duration: "Enter a duration between 15 minutes and 12 hours.",
    method: "Choose how it was paid: Square, Cash or Other.",
    range: "Pick a valid date range."
  };
  var ERR = {
    REJECTED: "We couldn't send that.",
    INVALID: INVALID,
    RATE_LIMIT: "Too many tries. Wait a few minutes or call or text " + PHONE + ".",
    NOT_ALLOWED: "You don't have access to this.",
    NOT_FOUND: "We couldn't find that request.",
    BAD_STATUS: "This request changed. Refresh to see the latest.",
    SLOT_TAKEN: "That time was just taken. Pick another time.",
    SLOT_CLOSED: "We're not working at that time.",
    SLOT_OFF: "We're off that day.",
    SLOT_PAST: "Pick a time in the future.",
    SLOT_RANGE: "Pick a date within the next " + (SCHED.daysAhead || 60) + " days.",
    NETWORK: "We couldn't reach the server. Check your connection and try again.",
    BAD_CODE: "That code didn't work. Check the latest email or send a new code.",
    UNKNOWN: "Something went wrong. Try again, or call or text " + PHONE + "."
  };
  DD.ERR = ERR;

  function makeError(code, field) {
    var text;
    if (code === "INVALID") text = INVALID[field] || "Check that and try again.";
    else text = ERR[code] || ERR.UNKNOWN;
    var e = new Error(text);
    e.code = ERR[code] || code === "INVALID" ? code : "UNKNOWN";
    e.field = field || "";
    e.text = text;
    return e;
  }

  /* Turn a supabase-js / PostgREST / fetch error into a mapped Error. */
  function mapError(err) {
    if (!err) return makeError("UNKNOWN");
    if (err.isDD) return err;
    var msg = String(err.message || err.msg || "");
    var m = /^\s*([A-Z][A-Z_]+)(?::\s*(.*))?$/.exec(msg);
    if (m && ERR[m[1]] && m[1] !== "NETWORK") return makeError(m[1], (m[2] || "").trim());
    if (err.status === 429 || err.code === "over_email_send_rate_limit" || err.code === "over_request_rate_limit") return makeError("RATE_LIMIT");
    if (err.code === "42501" || err.status === 401 || err.status === 403) return makeError("NOT_ALLOWED");
    if (err.name === "TypeError" || err.name === "AbortError" || err.status === 0 || /fetch|network|timeout|timed out|load failed/i.test(msg)) return makeError("NETWORK");
    return makeError("UNKNOWN");
  }
  function fail(err) {
    var e = mapError(err);
    e.isDD = true;
    return Promise.reject(e);
  }
  function withTimeout(p) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        var e = new Error("timeout");
        e.name = "AbortError";
        reject(e);
      }, TIMEOUT);
      Promise.resolve(p).then(function (v) {
        if (done) return;
        done = true; clearTimeout(t); resolve(v);
      }, function (e) {
        if (done) return;
        done = true; clearTimeout(t); reject(e);
      });
    });
  }
  function unavailable() { return fail({ name: "TypeError", message: "network unavailable" }); }

  /* ---------- rpc ---------- */
  DD.rpc = function (name, args) {
    if (!DD.ok) return unavailable();
    return withTimeout(DD.sb.rpc(name, args || {})).then(function (res) {
      if (res && res.error) throw res.error;
      return res ? res.data : null;
    }).catch(fail);
  };

  /* ---------- auth ---------- */
  DD.auth = {
    session: function () {
      if (!DD.ok) return Promise.resolve(null);
      return withTimeout(DD.sb.auth.getSession()).then(function (res) {
        return (res && res.data && res.data.session) || null;
      }).catch(function () { return null; });
    },
    sendCode: function (email) {
      if (!DD.ok) return unavailable();
      return withTimeout(DD.sb.auth.signInWithOtp({ email: String(email || "").trim(), options: { shouldCreateUser: true } }))
        .then(function (res) { if (res && res.error) throw res.error; return true; })
        .catch(fail);
    },
    verify: function (email, code) {
      if (!DD.ok) return unavailable();
      return withTimeout(DD.sb.auth.verifyOtp({ email: String(email || "").trim(), token: String(code || "").trim(), type: "email" }))
        .then(function (res) {
          if (res && res.error) throw res.error;
          return (res && res.data && res.data.session) || null;
        })
        .catch(function (err) {
          var e = mapError(err);
          // A rejected code (400/401/422 from auth) is a bad code, not a missing permission.
          if (e.code === "UNKNOWN" || e.code === "NOT_ALLOWED") e = makeError("BAD_CODE");
          e.isDD = true;
          return Promise.reject(e);
        });
    },
    signOut: function () {
      if (!DD.ok) return Promise.resolve();
      return withTimeout(DD.sb.auth.signOut()).then(function () {}, function () {});
    },
    isStaff: function () {
      return DD.rpc("is_staff").then(function (v) { return v === true; }, function () { return false; });
    }
  };

  /* ---------- status labels ---------- */
  DD.STATUS = {
    new:         { customer: "Request sent",    staff: "New" },
    quoted:      { customer: "Quote ready",     staff: "Quoted" },
    approved:    { customer: "You accepted",    staff: "Accepted, confirm it" },
    scheduled:   { customer: "Booked",          staff: "Booked" },
    on_the_way:  { customer: "On the way",      staff: "On the way" },
    in_progress: { customer: "Detailing now",   staff: "In progress" },
    done:        { customer: "Done",            staff: "Done" },
    cancelled:   { customer: "Cancelled",       staff: "Cancelled" }
  };

  /* ---------- formatting ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parseYmd(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function clock(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return { text: (h % 12 === 0 ? 12 : h % 12) + ":" + pad(m), ap: h >= 12 ? "PM" : "AM" };
  }
  DD.ymd = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  DD.addDays = function (d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  DD.parseYmd = parseYmd;

  DD.fmt = {
    date: function (ymd) {
      var d = parseYmd(ymd);
      return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
    },
    window: function (hhmm, slot) {
      var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
      if (!m) return "";
      var a = +m[1] * 60 + +m[2];
      var b = a + (slot || SCHED.slotMinutes || 30);
      var x = clock(a), y = clock(b % 1440);
      return x.ap === y.ap ? x.text + " - " + y.text + " " + y.ap : x.text + " " + x.ap + " - " + y.text + " " + y.ap;
    },
    money: function (n) {
      var v = Number(n);
      if (!isFinite(v)) return "";
      var whole = Math.abs(v - Math.round(v)) < 0.005;
      return "$" + v.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
    },
    ago: function (ts) {
      var d = ts instanceof Date ? ts : new Date(ts);
      if (isNaN(d.getTime())) return "";
      var s = Math.round((Date.now() - d.getTime()) / 1000);
      if (s < 45) return "just now";
      var min = Math.round(s / 60);
      if (min < 60) return min + " min ago";
      var hr = Math.round(min / 60);
      if (hr < 24) return hr + (hr === 1 ? " hr ago" : " hr ago");
      var days = Math.round(hr / 24);
      if (days === 1) return "yesterday";
      if (days < 7) return days + " days ago";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
    }
  };

  /* ---------- site data ---------- */
  DD.service = function (id) {
    var l = DATA.services || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].name;
    return id || "";
  };
  DD.addon = function (id) {
    var l = DATA.addOns || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return { name: l[i].name, price: l[i].price };
    return { name: id || "", price: null };
  };

  /* ---------- DOM helpers (text only) ---------- */
  DD.el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") n.textContent = v;
      else if (typeof v === "function" && k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else if (k.slice(0, 2) === "on") return;           // never set inline handler attributes
      else n.setAttribute(k, v === true ? "" : v);
    });
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
    });
    return n;
  };
  DD.clear = function (n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; };
  DD.icon = function (id, cls) {
    var s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    s.setAttribute("aria-hidden", "true");
    var u = document.createElementNS(SVGNS, "use");
    u.setAttribute("href", "#" + id);
    s.appendChild(u);
    return s;
  };

  /* ---------- toast ---------- */
  var toastRegion = null;
  DD.toast = function (text, tone) {
    if (!toastRegion || !document.body.contains(toastRegion)) {
      toastRegion = DD.el("div", { "class": "toast-region", role: "status", "aria-live": "polite" });
      document.body.appendChild(toastRegion);
    }
    var t = DD.el("div", { "class": "toast", "data-tone": tone || "info" }, [
      tone === "danger" || tone === "warn" ? DD.icon("i-alert") : tone === "success" ? DD.icon("i-check") : null,
      DD.el("span", { text: String(text || "") })
    ]);
    toastRegion.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, tone === "danger" ? 8000 : 5000);
    return t;
  };

  /* ---------- realtime ---------- */
  DD.listen = function (channel, specs, cb) {
    if (!DD.ok) return function () {};
    var ch;
    try {
      ch = DD.sb.channel(channel);
      (specs || []).forEach(function (s) {
        var f = { event: "*", schema: "public", table: s.table };
        if (s.filter) f.filter = s.filter;
        ch.on("postgres_changes", f, function (payload) { try { cb(payload, s.table); } catch (e) { /* keep channel alive */ } });
      });
      ch.subscribe();
    } catch (e) { return function () {}; }
    return function () { try { DD.sb.removeChannel(ch); } catch (e) { /* ignore */ } };
  };

  /* ---------- availability (cached 60 s) ---------- */
  var availCache = {};
  DD.availability = function (from, to) {
    var key = from + "|" + to;
    var hit = availCache[key];
    if (hit && Date.now() - hit.at < 60000) return hit.p;
    var p = DD.rpc("get_availability", { p_from: from, p_to: to });
    availCache[key] = { at: Date.now(), p: p };
    p.catch(function () { if (availCache[key] && availCache[key].p === p) delete availCache[key]; });
    return p;
  };
  DD.availability.clear = function () { availCache = {}; };

  /* ---------- code login ---------- */
  function ssGet(k) { try { return window.sessionStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  DD.codeLogin = function (container, opts) {
    opts = opts || {};
    var openLabel = opts.buttonLabel || "Open my request";
    var onSignedIn = typeof opts.onSignedIn === "function" ? opts.onSignedIn : function () {};
    var uid = "dd" + Math.floor(Math.random() * 1e6);
    var email = "";
    var timer = null;
    var busy = false;

    DD.clear(container);
    var root = DD.el("div", { "class": "code-login" });
    container.appendChild(root);

    if (!DD.ok) {
      root.appendChild(DD.el("div", { "class": "error-summary", role: "alert" }, [
        DD.el("p", { text: "Sign-in isn't available right now. Call or text " + PHONE + "." })
      ]));
      return { focus: function () {}, reset: function () {} };
    }

    var alertBox = DD.el("div", { "aria-live": "assertive" });

    function showAlert(msg) {
      DD.clear(alertBox);
      if (!msg) return;
      alertBox.appendChild(DD.el("div", { "class": "error-summary", role: "alert" }, [
        DD.el("p", { "class": "error-summary__title" }, [DD.icon("i-alert"), DD.el("span", { text: msg })])
      ]));
    }
    function fieldError(wrap, input, msg) {
      var id = input.id + "-err";
      var old = document.getElementById(id);
      if (old) old.parentNode.removeChild(old);
      if (!msg) { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); wrap.classList.remove("is-invalid"); return; }
      wrap.appendChild(DD.el("p", { "class": "field__error", id: id }, [DD.icon("i-alert"), DD.el("span", { text: msg })]));
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", id);
      wrap.classList.add("is-invalid");
    }
    function setBusy(btn, on, label) {
      busy = on;
      DD.clear(btn);
      if (on) {
        btn.appendChild(DD.icon("i-spinner", "icon--spin"));
        btn.appendChild(document.createTextNode("Please wait…"));
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;
      } else {
        btn.appendChild(document.createTextNode(label));
        btn.removeAttribute("aria-busy");
        btn.disabled = false;
      }
    }

    /* step 1: email */
    var emailInput = DD.el("input", { id: uid + "-email", name: "email", type: "email", autocomplete: "email", inputmode: "email", required: "required", autocapitalize: "off", spellcheck: "false" });
    emailInput.value = ssGet("dd_email");
    var emailWrap = DD.el("div", { "class": "field" }, [
      DD.el("label", { "class": "field__label", "for": uid + "-email", text: opts.emailLabel || "Email you used for your request" }),
      emailInput
    ]);
    var sendBtn = DD.el("button", { type: "submit", "class": "btn btn--primary", text: "Email me a code" });
    var emailForm = DD.el("form", { novalidate: "novalidate", "class": "code-login__step" }, [
      emailWrap,
      DD.el("div", { "class": "code-login__actions" }, [sendBtn])
    ]);

    /* step 2: code */
    var codeInput = DD.el("input", { id: uid + "-code", name: "code", type: "text", inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]*", maxlength: "10", required: "required", autocapitalize: "off", spellcheck: "false" });
    var sentText = DD.el("p", { "class": "code-login__sent", tabindex: "-1" });
    var codeWrap = DD.el("div", { "class": "field" }, [
      DD.el("label", { "class": "field__label", "for": uid + "-code", text: "Code from the email" }),
      codeInput,
      DD.el("p", { "class": "field__help", text: "It's 6 to 10 digits. It can take a minute to arrive." })
    ]);
    var openBtn = DD.el("button", { type: "submit", "class": "btn btn--primary", text: openLabel });
    var resendBtn = DD.el("button", { type: "button", "class": "btn btn--ghost", text: "Send a new code" });
    var changeBtn = DD.el("button", { type: "button", "class": "btn btn--ghost", text: "Use a different email" });
    var codeForm = DD.el("form", { novalidate: "novalidate", "class": "code-login__step", hidden: "hidden" }, [
      sentText,
      codeWrap,
      DD.el("div", { "class": "code-login__actions" }, [openBtn]),
      DD.el("div", { "class": "code-login__actions" }, [resendBtn, changeBtn])
    ]);

    root.appendChild(alertBox);
    root.appendChild(emailForm);
    root.appendChild(codeForm);

    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    function startCountdown() {
      stopTimer();
      var left = 60;
      function paint() {
        resendBtn.disabled = left > 0;
        resendBtn.textContent = left > 0 ? "Send a new code (" + left + "s)" : "Send a new code";
      }
      paint();
      timer = setInterval(function () {
        left -= 1;
        paint();
        if (left <= 0) stopTimer();
      }, 1000);
    }
    function showStep(n) {
      emailForm.hidden = n !== 1;
      codeForm.hidden = n !== 2;
      showAlert("");
      if (n === 1) { stopTimer(); emailInput.focus(); }
      else { sentText.textContent = "We sent a code to " + email; codeInput.value = ""; fieldError(codeWrap, codeInput, ""); startCountdown(); sentText.focus(); }
    }

    function requestCode(fromResend) {
      var btn = fromResend ? resendBtn : sendBtn;
      var label = fromResend ? "Send a new code" : "Email me a code";
      if (busy) return;
      showAlert("");
      var v = emailInput.value.trim();
      if (!fromResend) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { fieldError(emailWrap, emailInput, INVALID.email); emailInput.focus(); return; }
        fieldError(emailWrap, emailInput, "");
        email = v;
      }
      setBusy(btn, true, label);
      DD.auth.sendCode(email).then(function () {
        ssSet("dd_email", email);
        setBusy(btn, false, label);
        if (fromResend) { startCountdown(); DD.toast("New code sent to " + email + ".", "success"); }
        else showStep(2);
      }, function (e) {
        setBusy(btn, false, label);
        if (fromResend) startCountdown();
        showAlert(e.text);
      });
    }

    emailForm.addEventListener("submit", function (ev) { ev.preventDefault(); requestCode(false); });
    resendBtn.addEventListener("click", function () { requestCode(true); });
    changeBtn.addEventListener("click", function () { showStep(1); });
    emailInput.addEventListener("input", function () { if (emailWrap.classList.contains("is-invalid")) fieldError(emailWrap, emailInput, ""); });
    codeInput.addEventListener("input", function () { if (codeWrap.classList.contains("is-invalid")) fieldError(codeWrap, codeInput, ""); });

    codeForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;
      showAlert("");
      var code = codeInput.value.replace(/\s+/g, "");
      if (!/^\d{6,10}$/.test(code)) { fieldError(codeWrap, codeInput, "Enter the 6 to 10 digit code from the email."); codeInput.focus(); return; }
      fieldError(codeWrap, codeInput, "");
      setBusy(openBtn, true, openLabel);
      DD.auth.verify(email, code).then(function (session) {
        setBusy(openBtn, false, openLabel);
        if (!session) { fieldError(codeWrap, codeInput, ERR.BAD_CODE); codeInput.focus(); return; }
        stopTimer();
        onSignedIn(session, email);
      }, function (e) {
        setBusy(openBtn, false, openLabel);
        if (e.code === "BAD_CODE") { fieldError(codeWrap, codeInput, ERR.BAD_CODE); codeInput.focus(); }
        else showAlert(e.text);
      });
    });

    return {
      focus: function () { (emailForm.hidden ? codeInput : emailInput).focus(); },
      reset: function () { showStep(1); }
    };
  };
})();
