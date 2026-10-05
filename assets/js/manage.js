/* Daywon Detailing staff dashboard shell (manage.html).
   Owns sign-in (email code or magic link), the hash router, the tabbar/rail and one realtime channel.
   Exposes window.DDM = { register(pattern, render(main, match, query)), go(hash), staff:{email,name}, refreshCounts() }.
   The is_staff() RPC is the only staff gate. Tokens and sessions are never logged and never stay in the URL.
   Everything is rendered with textContent via DD.el. */
(function () {
  "use strict";

  var DD = window.DD || { ok: false };
  var CFG = window.SITE_CONFIG || {};
  var TIMEOUT = (CFG.portal && CFG.portal.timeoutMs) || 10000;

  var routes = [];
  var state = { ready: false, leaving: null, current: "", unlisten: null, counts: 0, signingOut: false, rerender: null };

  var DDM = window.DDM = {
    staff: { email: "", name: "" },
    register: function (pattern, render) {
      routes.push({ re: pattern, render: render });
      if (state.ready && matchRoute(parseHash().path)) route(true);
    },
    go: function (hash) {
      var h = String(hash || "#/requests");
      if (h.charAt(0) !== "#") h = "#" + (h.charAt(0) === "/" ? "" : "/") + h;
      if (window.location.hash === h) route(); else window.location.hash = h;
    },
    refreshCounts: function () { return refreshCounts(); }
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) { return DD.el(tag, attrs, kids); }

  var TABS = [
    { label: "Requests", href: "#/requests", icon: "i-inbox", match: /^\/(requests|r\/)/ },
    { label: "Calendar", href: "#/calendar", icon: "i-calendar", match: /^\/calendar/ },
    { label: "Customers", href: "#/customers", icon: "i-users", match: /^\/(customers|c\/)/ },
    { label: "Settings", href: "#/settings", icon: "i-settings", match: /^\/settings/ }
  ];

  /* ---------- helpers ---------- */
  function withTimeout(p) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        var e = new Error("timeout"); e.name = "AbortError"; reject(e);
      }, TIMEOUT);
      Promise.resolve(p).then(function (v) { if (done) return; done = true; clearTimeout(t); resolve(v); },
        function (e) { if (done) return; done = true; clearTimeout(t); reject(e); });
    });
  }
  function rows(builder) {
    return withTimeout(builder).then(function (res) { return (res && !res.error && res.data) || []; }, function () { return []; });
  }
  function ddError(code) {
    var e = new Error((DD.ERR && DD.ERR[code]) || "");
    e.code = code; e.text = e.message; e.isDD = true;
    return e;
  }
  function mapAuthError(err) {
    var msg = String((err && (err.message || err.msg)) || "");
    if (err && (err.status === 429 || err.code === "over_email_send_rate_limit" || err.code === "over_request_rate_limit")) return ddError("RATE_LIMIT");
    if (err && (err.name === "TypeError" || err.name === "AbortError" || err.status === 0 || /fetch|network|timeout|timed out|load failed/i.test(msg))) return ddError("NETWORK");
    return ddError("UNKNOWN");
  }

  /* Staff codes: allow the sign-in link to return to this page. */
  if (DD.ok && DD.auth) {
    DD.auth.sendCode = function (email) {
      return withTimeout(DD.sb.auth.signInWithOtp({
        email: String(email || "").trim(),
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname }
      })).then(function (res) { if (res && res.error) throw res.error; return true; })
        .catch(function (err) { return Promise.reject(mapAuthError(err)); });
    };
  }

  /* ---------- views ---------- */
  function showOnly(name) {
    $("view-login").hidden = name !== "login";
    $("view-boot").hidden = name !== "boot";
    $("route-root").hidden = name !== "app";
    var inApp = name === "app";
    $("tabbar").hidden = !inApp;
    $("signout-btn").hidden = !inApp;
    if (!inApp) $("topbar-title").textContent = "Manage";
  }

  var loginMsg = null, loginUI = null;
  function setLoginMsg(text) {
    if (!loginMsg) {
      loginMsg = el("div", { "aria-live": "assertive" });
      $("login-box").parentNode.insertBefore(loginMsg, $("login-box"));
    }
    DD.clear(loginMsg);
    if (text) loginMsg.appendChild(el("div", { "class": "error-summary", role: "alert" }, [
      el("p", { "class": "error-summary__title" }, [DD.icon("i-alert"), el("span", { text: text })])
    ]));
  }

  function showLogin(msg) {
    state.ready = false;
    teardownApp();
    showOnly("login");
    var h = $("h-login");
    if (!DD.ok) {
      $("login-lede").hidden = true;
      DD.clear($("login-box"));
      setLoginMsg("Sign-in isn't available right now.");
      if (h) h.focus();
      return;
    }
    $("login-lede").hidden = false;
    setLoginMsg(msg || "");
    loginUI = DD.codeLogin($("login-box"), { buttonLabel: "Sign in", emailLabel: "Staff email", onSignedIn: function () { gate(); } });
    buildLinkPaste();
    if (h) h.focus();
  }

  /* "Got a link instead of a code?" disclosure */
  function buildLinkPaste() {
    var old = $("link-paste");
    if (old) old.parentNode.removeChild(old);
    var wrap = el("div", { id: "link-paste", "class": "manage-linkpaste" });
    var toggle = el("button", { type: "button", "class": "link-btn", "aria-expanded": "false", "aria-controls": "link-paste-form", text: "Got a link instead of a code?" });
    var input = el("input", { id: "link-paste-input", type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    var errBox = el("div", { "aria-live": "polite" });
    var go = el("button", { type: "submit", "class": "btn btn--primary" }, ["Sign in"]);
    var form = el("form", { id: "link-paste-form", novalidate: "novalidate", hidden: "hidden", "class": "code-login__step" }, [
      el("div", { "class": "field" }, [
        el("label", { "class": "field__label", "for": "link-paste-input", text: "Paste the sign-in link from the email" }),
        input
      ]),
      el("div", { "class": "code-login__actions" }, [go]),
      errBox
    ]);
    toggle.addEventListener("click", function () {
      var open = form.hidden;
      form.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) input.focus();
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      DD.clear(errBox);
      var raw = input.value.trim();
      function bad() {
        errBox.appendChild(el("p", { "class": "field__error", role: "alert" }, [DD.icon("i-alert"), el("span", { text: "That link didn't work. Use the newest email or send a new code." })]));
      }
      if (!raw) { bad(); input.focus(); return; }
      setBusy(go, true);
      useLink(raw).then(function (ok) {
        setBusy(go, false);
        if (!ok) { bad(); return; }
        input.value = "";
        stripUrl();
        gate();
      }, function () { setBusy(go, false); bad(); });
    });
    wrap.appendChild(toggle);
    wrap.appendChild(form);
    $("login-box").parentNode.insertBefore(wrap, $("login-box").nextSibling);
  }

  function setBusy(btn, on) {
    if (on) {
      if (!btn._kids) btn._kids = Array.prototype.slice.call(btn.childNodes);
      DD.clear(btn);
      btn.appendChild(DD.icon("i-spinner", "icon--spin"));
      btn.appendChild(document.createTextNode("Please wait…"));
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
    } else {
      if (btn._kids) { DD.clear(btn); btn._kids.forEach(function (k) { btn.appendChild(k); }); btn._kids = null; }
      btn.removeAttribute("aria-busy");
      btn.disabled = false;
    }
  }

  /* ---------- magic link handling ---------- */
  function stripUrl() {
    try { window.history.replaceState(null, "", window.location.pathname + "#/requests"); } catch (e) { /* ignore */ }
  }
  function hashParams(s) {
    try { return new URLSearchParams(String(s || "").replace(/^[#?]/, "")); } catch (e) { return new URLSearchParams(""); }
  }
  /* Returns a promise of true when a session was set. Never logs tokens. */
  function sessionFromParams(p, pathname) {
    var at = p.get("access_token"), rt = p.get("refresh_token");
    if (at && rt) {
      return withTimeout(DD.sb.auth.setSession({ access_token: at, refresh_token: rt }))
        .then(function (res) { return !!(res && !res.error && res.data && res.data.session); }, function () { return false; });
    }
    var th = p.get("token_hash"), type = p.get("type");
    if (!th && p.get("token") && /\/auth\/v1\/verify/.test(pathname || "")) th = p.get("token");
    if (th) {
      return withTimeout(DD.sb.auth.verifyOtp({ token_hash: th, type: type || "magiclink" }))
        .then(function (res) { return !!(res && !res.error && res.data && res.data.session); }, function () { return false; });
    }
    return Promise.resolve(false);
  }
  function useLink(raw) {
    var u;
    try { u = new URL(raw); } catch (e) { return Promise.resolve(false); }
    var p = new URLSearchParams(u.search);
    hashParams(u.hash).forEach(function (v, k) { if (!p.has(k)) p.set(k, v); });
    return sessionFromParams(p, u.pathname);
  }
  /* Runs before routing. Resolves to an error message string or "". */
  function handleLinkParams() {
    var hash = window.location.hash || "";
    var search = window.location.search || "";
    var hp = /access_token=|error_description=|token_hash=/.test(hash) ? hashParams(hash) : null;
    var qp = /token_hash=|error_description=|access_token=/.test(search) ? hashParams(search) : null;
    if (!hp && !qp) return Promise.resolve("");
    var errDesc = (hp && hp.get("error_description")) || (qp && qp.get("error_description"));
    var p = new URLSearchParams("");
    [hp, qp].forEach(function (x) { if (x) x.forEach(function (v, k) { if (!p.has(k)) p.set(k, v); }); });
    var job = errDesc ? Promise.resolve(false) : sessionFromParams(p, "");
    return job.then(function (ok) {
      stripUrl();
      return ok ? "" : "That sign-in link didn't work or expired. Email yourself a new code.";
    });
  }

  /* ---------- staff gate ---------- */
  function gate() {
    showOnly("boot");
    return DD.auth.session().then(function (sess) {
      if (!sess) { showLogin(""); return; }
      return DD.auth.isStaff().then(function (ok) {
        if (!ok) {
          state.signingOut = true;
          return DD.auth.signOut().then(function () {
            state.signingOut = false;
            showLogin("This email isn't on the staff list. Ask the owner to add it.");
          });
        }
        var email = String((sess.user && sess.user.email) || "").toLowerCase();
        return withTimeout(DD.sb.from("staff").select("email,name").eq("email", email).maybeSingle())
          .then(function (res) { return (res && res.data) || null; }, function () { return null; })
          .then(function (row) {
            DDM.staff.email = email;
            DDM.staff.name = (row && row.name) || "";
            startApp();
          });
      });
    });
  }

  /* ---------- shell ---------- */
  function buildTabbar() {
    var nav = $("tabbar");
    DD.clear(nav);
    TABS.forEach(function (t) {
      var kids = [DD.icon(t.icon), el("span", { text: t.label })];
      if (t.label === "Requests") kids.push(el("span", { "class": "badge-count", id: "badge-requests", hidden: "hidden" }));
      nav.appendChild(el("a", { href: t.href, "data-tab": t.label }, kids));
    });
  }
  function paintTabs(path) {
    var current = "";
    TABS.forEach(function (t) {
      var a = document.querySelector('#tabbar [data-tab="' + t.label + '"]');
      if (!a) return;
      if (t.match.test(path)) { a.setAttribute("aria-current", "page"); current = t.label; }
      else a.removeAttribute("aria-current");
    });
    $("topbar-title").textContent = current || "Manage";
  }
  function paintBadge() {
    var b = $("badge-requests");
    if (!b) return;
    b.hidden = state.counts < 1;
    b.textContent = state.counts > 99 ? "99+" : String(state.counts);
    b.setAttribute("aria-label", state.counts + " need action");
  }

  function refreshCounts() {
    if (!DD.ok || !DDM.staff.email) return Promise.resolve(0);
    return Promise.all([
      rows(DD.sb.from("requests").select("id").in("status", ["new", "approved"]).limit(200)),
      rows(DD.sb.from("time_proposals").select("request_id").eq("status", "pending").eq("proposed_by", "customer").limit(200)),
      rows(DD.sb.from("messages").select("request_id").eq("sender", "customer").is("read_by_staff_at", null).limit(200))
    ]).then(function (r) {
      var set = {};
      r[0].forEach(function (x) { set[x.id] = 1; });
      r[1].forEach(function (x) { set[x.request_id] = 1; });
      r[2].forEach(function (x) { set[x.request_id] = 1; });
      state.counts = Object.keys(set).length;
      paintBadge();
      return state.counts;
    });
  }

  function startApp() {
    state.ready = true;
    buildTabbar();
    showOnly("app");
    paintBadge();
    refreshCounts();
    subscribe();
    route();
  }
  function teardownApp() {
    if (state.leaving) { try { state.leaving(); } catch (e) { /* ignore */ } state.leaving = null; }
    if (state.unlisten) { try { state.unlisten(); } catch (e) { /* ignore */ } state.unlisten = null; }
    clearTimeout(state.rerender);
    state.current = "";
    DDM.staff.email = ""; DDM.staff.name = "";
    state.counts = 0;
  }

  /* ---------- realtime (one channel) ---------- */
  function personName(requestId) {
    return withTimeout(DD.sb.from("requests").select("id,customers(name)").eq("id", requestId).maybeSingle())
      .then(function (res) {
        var c = res && res.data && res.data.customers;
        if (Array.isArray(c)) c = c[0];
        return (c && c.name) || "a customer";
      }, function () { return "a customer"; });
  }
  function subscribe() {
    if (state.unlisten) state.unlisten();
    state.unlisten = DD.listen("manage", [{ table: "requests" }, { table: "messages" }], function (payload, table) {
      var n = payload && payload.new;
      if (table === "requests" && payload.eventType === "INSERT" && n && n.source !== "staff") {
        personName(n.id).then(function (name) { DD.toast("New request from " + name, "info"); });
      } else if (table === "messages" && payload.eventType === "INSERT" && n && n.sender === "customer") {
        personName(n.request_id).then(function (name) { DD.toast("New message from " + name, "info"); });
      }
      refreshCounts();
      var ev = new CustomEvent("ddm:change", { cancelable: true, detail: { table: table, eventType: payload && payload.eventType, row: n || null } });
      var handled = !document.dispatchEvent(ev);
      if (!handled && /^\/(calendar|customers)/.test(state.current)) {
        clearTimeout(state.rerender);
        state.rerender = setTimeout(function () { route(true); }, 400);
      }
    });
  }

  /* ---------- router ---------- */
  function parseHash() {
    var h = String(window.location.hash || "").replace(/^#/, "");
    var frag = "", q = "";
    var i = h.indexOf("#");
    if (i >= 0) { frag = h.slice(i + 1); h = h.slice(0, i); }
    var j = h.indexOf("?");
    if (j >= 0) { q = h.slice(j + 1); h = h.slice(0, j); }
    var query = {};
    try { new URLSearchParams(q).forEach(function (v, k) { query[k] = v; }); } catch (e) { /* ignore */ }
    return { path: h || "/requests", query: query, frag: frag };
  }
  function matchRoute(path) {
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(path);
      if (m) return { route: routes[i], match: m };
    }
    return null;
  }

  function route(quiet) {
    if (!state.ready) return;
    var h = parseHash();
    var hit = matchRoute(h.path);
    if (!hit) {
      try { window.history.replaceState(null, "", window.location.pathname + "#/requests"); } catch (e) { /* ignore */ }
      h = parseHash();
      hit = matchRoute(h.path);
      if (!hit) return;
    }
    if (state.leaving) { try { state.leaving(); } catch (e) { /* ignore */ } state.leaving = null; }
    var main = $("route-root");
    DD.clear(main);
    state.current = h.path;
    paintTabs(h.path);
    try {
      var out = hit.route.render(main, hit.match, h.query);
      if (typeof out === "function") state.leaving = out;
    } catch (e) {
      DD.clear(main);
      main.appendChild(el("h1", { tabindex: "-1", text: "Something went wrong" }));
      main.appendChild(el("div", { "class": "error-summary", role: "alert" }, [el("p", { text: "This page couldn't load. Go back to Requests and try again." })]));
    }
    var h1 = main.querySelector("h1");
    var label = (h1 && h1.textContent) || "Manage";
    document.title = label + " | Manage | Daywon Detailing";
    if (!quiet) {
      if (h1) { if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
      var live = $("route-live");
      live.textContent = "";
      setTimeout(function () { live.textContent = label; }, 50);
      var target = h.frag && document.getElementById(h.frag);
      if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
    }
  }

  /* ---------- sign out ---------- */
  function signOut() {
    var btn = $("signout-btn");
    state.signingOut = true;
    setBusy(btn, true);
    DD.auth.signOut().then(function () {
      state.signingOut = false;
      setBusy(btn, false);
      try { window.history.replaceState(null, "", window.location.pathname); } catch (e) { /* ignore */ }
      showLogin("");
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    $("signout-btn").addEventListener("click", signOut);
    window.addEventListener("hashchange", function () { route(); });
    if (!DD.ok) { showLogin(""); return; }
    DD.sb.auth.onAuthStateChange(function (ev) {
      if (ev === "SIGNED_OUT" && state.ready && !state.signingOut) showLogin("Your session ended. Sign in again.");
    });
    handleLinkParams().then(function (linkErr) {
      return DD.auth.session().then(function (sess) {
        if (!sess) { showLogin(linkErr); return; }
        return gate();
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
