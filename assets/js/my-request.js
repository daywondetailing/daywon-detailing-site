/* Daywon Detailing customer portal (my-request.html).
   Sign in with an emailed code, follow one request, accept the quote, ask for a time change, cancel, message us.
   All user data is rendered with textContent via DD.el. Times are wall-clock; dates go to the server as YYYY-MM-DD, times as HH:MM. */
(function () {
  "use strict";

  var DD = window.DD || { ok: false };
  var CFG = window.SITE_CONFIG || {};
  var PHONE = (CFG.contact && CFG.contact.phoneDisplay) || "240-813-0689";
  var TIMEOUT = (CFG.portal && CFG.portal.timeoutMs) || 10000;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var CHANGEABLE = ["new", "quoted", "approved", "scheduled"];
  var SUGGEST_OK = ["new", "quoted", "approved", "scheduled", "on_the_way"];

  var REQ_COLS = "id,ref,customer_id,vehicle_id,address_id,service_id,addon_ids,status,created_at," +
    "preferred_date,preferred_start,backup_date,backup_start,notes,quote_amount,quote_note," +
    "scheduled_date,scheduled_start,duration_min,paid,cancel_reason";
  var PROP_COLS = "id,request_id,proposed_by,proposed_date,proposed_start,note,status,created_at";
  var EVENT_COLS = "id,request_id,kind,from_status,to_status,actor,actor_name,created_at";
  var MSG_COLS = "id,request_id,sender,author_name,body,created_at,read_by_customer_at";

  var VIEWS = ["loading", "nodb", "signin", "none", "notfound", "request"];
  var S = {
    email: "", req: null, veh: null, addr: null, list: [], proposals: [], events: [], messages: [],
    unsub: null, loadSeq: 0, refreshTimer: null, shown: {}, firstThread: true, schedFor: "", markTimer: null
  };

  function $(id) { return document.getElementById(id); }
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
  function announce(text) {
    var n = $("msg-live");
    if (!n) return;
    n.textContent = "";
    setTimeout(function () { n.textContent = text; }, 50);
  }
  function editHref(id) { return "quote.html?edit=" + encodeURIComponent(id); }
  /* Link to calendar.html, which offers Google, Apple and Outlook. */
  function calendarHref(r) {
    if (!r.scheduled_date || !r.scheduled_start) return "";
    var a = S.addr;
    var loc = a ? [a.line2 ? a.street + ", " + a.line2 : a.street, a.city + ", " + a.state + " " + a.zip].join(", ") : "";
    var t = String(r.scheduled_start).slice(0, 5).replace(":", "");
    return "calendar.html?s=" + String(r.scheduled_date).replace(/-/g, "") + "T" + t +
      "&m=" + (r.duration_min || 120) + "&svc=" + encodeURIComponent(DD.service(r.service_id)) +
      "&ref=" + encodeURIComponent(r.ref || "") + "&loc=" + encodeURIComponent(loc) + "&r=" + encodeURIComponent(r.id);
  }
  function whenText(d, t) { return d && t ? DD.fmt.date(d) + ", arrival " + DD.fmt.window(t) : ""; }
  function stLabel(st) { return (DD.STATUS[st] && DD.STATUS[st].customer) || st; }
  function sentDate(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    var o = { month: "short", day: "numeric" };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
    return d.toLocaleDateString("en-US", o);
  }
  function phoneLink(text) {
    return el("a", { href: "tel:+12408130689" }, [text || PHONE]);
  }

  /* ---------- db (explicit columns, timeout, friendly errors) ---------- */
  function mkErr(e) {
    var msg = String((e && e.message) || "");
    var code = e && e.code;
    var out = new Error(msg);
    out.pgcode = code;
    if (e && (e.name === "TypeError" || e.name === "AbortError" || /fetch|network|timeout|load failed/i.test(msg))) {
      out.text = DD.ERR.NETWORK;
    } else if (code === "PGRST301" || (e && e.status === 401) || /jwt/i.test(msg)) {
      out.auth = true; out.text = DD.ERR.NOT_ALLOWED;
    } else if (code === "42501" || (e && e.status === 403)) {
      out.text = DD.ERR.NOT_ALLOWED;
    } else {
      out.text = DD.ERR.UNKNOWN;
    }
    return out;
  }
  function db(builder) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(mkErr({ name: "AbortError", message: "timeout" }));
      }, TIMEOUT);
      Promise.resolve(builder).then(function (res) {
        if (done) return;
        done = true; clearTimeout(t);
        if (res && res.error) reject(mkErr(res.error)); else resolve(res ? res.data : null);
      }, function (e) {
        if (done) return;
        done = true; clearTimeout(t);
        reject(mkErr(e));
      });
    });
  }

  /* ---------- views ---------- */
  function showView(name, focus) {
    VIEWS.forEach(function (v) { $("view-" + v).hidden = v !== name; });
    var banner = $("new-banner");
    if (name !== "signin") banner.hidden = true;
    $("signed-line").hidden = !(S.email && (name === "request" || name === "none" || name === "notfound"));
    if (focus) {
      var h = $("view-" + name).querySelector("h1");
      if (h) h.focus();
    }
  }
  function renderLoading(errText) {
    var v = $("view-loading");
    clear(v);
    if (!errText) {
      v.appendChild(el("h1", { id: "h-loading", tabindex: "-1", text: "Loading your request" }));
      v.appendChild(el("p", { "class": "muted", text: "One moment." }));
      return;
    }
    var retry = el("button", { type: "button", "class": "btn btn--primary", text: "Try again" });
    retry.addEventListener("click", function () { renderLoading(""); enter(); });
    v.appendChild(el("h1", { id: "h-loading", tabindex: "-1", text: "We couldn't load your request" }));
    v.appendChild(el("div", { "class": "error-summary", role: "alert" }, [el("p", { text: errText })]));
    v.appendChild(el("div", { "class": "actions" }, [retry, el("a", { "class": "btn btn--ghost", href: "tel:+12408130689" }, ["Call or text " + PHONE])]));
  }
  function showNotFound() {
    unsubscribe();
    S.req = null;
    showView("notfound", true);
  }
  function showNone() {
    unsubscribe();
    S.req = null;
    $("none-email").textContent = S.email;
    showView("none", true);
  }
  function renderSignedLine() {
    var line = $("signed-line");
    clear(line);
    var out = el("button", { type: "button", "class": "link-btn", text: "Sign out" });
    out.addEventListener("click", signOut);
    line.appendChild(document.createTextNode("Signed in as " + S.email + " · "));
    line.appendChild(out);
  }

  /* ---------- sign in ---------- */
  function showSignin() {
    unsubscribe();
    S.req = null; S.email = "";
    var banner = $("new-banner");
    var isNew = /(?:^|[?&])new=1(?:&|$)/.test(window.location.search);
    clear(banner);
    if (isNew) {
      var ref = "";
      try { ref = window.sessionStorage.getItem("dd_ref") || ""; } catch (e) { ref = ""; }
      banner.appendChild(DD.icon("i-check"));
      var rid = (/(?:^|[?&])r=([^&]+)/.exec(window.location.search) || [])[1] || "";
      var tok = "";
      try { tok = rid ? window.localStorage.getItem("dd_edit_" + decodeURIComponent(rid)) || "" : ""; } catch (e) { tok = ""; }
      var bp = el("p", {
        text: (/(?:^|[?&])updated=1(?:&|$)/.test(window.location.search)
          ? (ref ? "Request " + ref + " updated." : "Your changes were saved.")
          : (ref ? "Request " + ref + " sent." : "Your request was sent.")) +
          " We reply during our office hours. To follow it here, enter your email below and tap \"Email me a code\"."
      });
      if (tok) {
        bp.appendChild(document.createTextNode(" Made a mistake or want a different package? "));
        bp.appendChild(el("a", { href: editHref(decodeURIComponent(rid)), text: "Edit your request" }));
        bp.appendChild(document.createTextNode("."));
      }
      banner.appendChild(bp);
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
    DD.codeLogin($("signin-box"), {
      onSignedIn: function (session, email) {
        S.email = (session && session.user && session.user.email) || email || "";
        renderSignedLine();
        showView("loading", false);
        renderLoading("");
        enter();
      }
    });
    showView("signin", true);
    if (isNew) $("new-banner").hidden = false;
  }
  function signOut() {
    unsubscribe();
    DD.auth.signOut().then(function () {
      try { window.history.replaceState(null, "", "my-request.html"); } catch (e) { /* ignore */ }
      showSignin();
    });
  }

  /* ---------- loading data ---------- */
  function loadList(customerId) {
    return db(DD.sb.from("requests").select("id,ref,service_id,status,created_at")
      .eq("customer_id", customerId).order("created_at", { ascending: false }).limit(200)).then(function (rows) { return rows || []; });
  }
  function loadVehicle(row) {
    if (!row.vehicle_id) return Promise.resolve(null);
    return db(DD.sb.from("vehicles").select("id,year,make,model,size,color").eq("id", row.vehicle_id).maybeSingle())
      .catch(function () { return null; });
  }
  function loadAddress(row) {
    if (!row.address_id) return Promise.resolve(null);
    return db(DD.sb.from("addresses").select("id,street,line2,city,state,zip").eq("id", row.address_id).maybeSingle())
      .catch(function () { return null; });
  }
  function loadProposals(id) {
    return db(DD.sb.from("time_proposals").select(PROP_COLS).eq("request_id", id)
      .order("created_at", { ascending: false }).limit(20)).then(function (r) { return r || []; });
  }
  function loadEvents(id) {
    return db(DD.sb.from("request_events").select(EVENT_COLS).eq("request_id", id)
      .order("created_at", { ascending: true }).limit(200)).then(function (r) { return r || []; });
  }
  function loadMessages(id) {
    return db(DD.sb.from("messages").select(MSG_COLS).eq("request_id", id)
      .order("created_at", { ascending: true }).limit(500)).then(function (r) { return r || []; });
  }

  function enter() {
    var params = new URLSearchParams(window.location.search);
    var r = params.get("r");
    renderSignedLine();
    if (r) {
      if (!UUID.test(r)) { showNotFound(); return; }
      openById(r).catch(handleLoadError);
      return;
    }
    db(DD.sb.from("requests").select("id,status,created_at").order("created_at", { ascending: false }).limit(200))
      .then(function (rows) {
        if (!rows || !rows.length) { showNone(); return null; }
        var pick = rows[0];
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].status !== "done" && rows[i].status !== "cancelled") { pick = rows[i]; break; }
        }
        return openById(pick.id);
      }).catch(handleLoadError);
  }
  function handleLoadError(e) {
    if (e && e.auth) { showSignin(); return; }
    renderLoading((e && e.text) || DD.ERR.UNKNOWN);
    showView("loading", true);
  }

  function openById(id) {
    var seq = ++S.loadSeq;
    unsubscribe();
    return db(DD.sb.from("requests").select(REQ_COLS).eq("id", id).maybeSingle()).then(function (row) {
      if (seq !== S.loadSeq) return null;
      if (!row) { showNotFound(); return null; }
      return Promise.all([
        loadList(row.customer_id), loadVehicle(row), loadAddress(row),
        loadProposals(id), loadEvents(id), loadMessages(id)
      ]).then(function (r) {
        if (seq !== S.loadSeq) return;
        S.req = row; S.list = r[0]; S.veh = r[1]; S.addr = r[2];
        S.proposals = r[3]; S.events = r[4]; S.messages = r[5];
        S.shown = {}; S.firstThread = true; S.schedFor = "";
        closeForms();
        $("msg-body").value = ""; updateCount();
        showErr($("msg-error"), "");
        try { window.history.replaceState(null, "", "my-request.html?r=" + encodeURIComponent(id)); } catch (e) { /* ignore */ }
        renderAll();
        showView("request", true);
        $("thread").scrollTop = $("thread").scrollHeight;
        subscribe(id);
        markRead();
      });
    });
  }

  /* refetch the request-level data (not vehicle/address) */
  function refresh() {
    if (!S.req) return Promise.resolve();
    var id = S.req.id, seq = S.loadSeq, before = S.req.status;
    return Promise.all([
      db(DD.sb.from("requests").select(REQ_COLS).eq("id", id).maybeSingle()),
      loadProposals(id), loadEvents(id), loadMessages(id)
    ]).then(function (r) {
      if (seq !== S.loadSeq) return;
      if (!r[0]) { showNotFound(); return; }
      S.req = r[0]; S.proposals = r[1]; S.events = r[2]; S.messages = r[3];
      renderAll();
      if (before !== S.req.status) announce("Status updated: " + stLabel(S.req.status));
      markRead();
    }).catch(function (e) {
      if (e && e.auth) showSignin();
      /* other errors: keep showing the last good data */
    });
  }
  function refreshMessages() {
    if (!S.req) return Promise.resolve();
    var id = S.req.id, seq = S.loadSeq;
    return loadMessages(id).then(function (m) {
      if (seq !== S.loadSeq) return;
      S.messages = m;
      renderThread();
    }).catch(function () { /* keep last */ });
  }
  function scheduleRefresh() {
    clearTimeout(S.refreshTimer);
    S.refreshTimer = setTimeout(refresh, 250);
  }
  function markRead() {
    if (!S.req) return;
    var unread = S.messages.some(function (m) { return m.sender === "staff" && !m.read_by_customer_at; });
    if (!unread || document.hidden) return;
    DD.rpc("mark_read", { p_request: S.req.id }).then(function () {
      S.messages.forEach(function (m) { if (m.sender === "staff" && !m.read_by_customer_at) m.read_by_customer_at = new Date().toISOString(); });
    }, function () { /* ignore */ });
  }

  /* ---------- realtime (one channel) ---------- */
  function subscribe(id) {
    unsubscribe();
    S.unsub = DD.listen("my-request-" + id, [
      { table: "requests", filter: "id=eq." + id },
      { table: "time_proposals", filter: "request_id=eq." + id },
      { table: "messages", filter: "request_id=eq." + id },
      { table: "request_events", filter: "request_id=eq." + id }
    ], function (payload, table) {
      if (table === "messages") onMessage(payload);
      else scheduleRefresh();
    });
  }
  function unsubscribe() {
    if (S.unsub) { try { S.unsub(); } catch (e) { /* ignore */ } S.unsub = null; }
    clearTimeout(S.refreshTimer);
  }
  function onMessage(payload) {
    var m = payload && payload.new;
    if (!payload || payload.eventType !== "INSERT" || !m || !m.id) return;
    for (var i = 0; i < S.messages.length; i++) if (S.messages[i].id === m.id) return;
    S.messages.push({
      id: m.id, request_id: m.request_id, sender: m.sender, author_name: m.author_name, body: m.body,
      created_at: m.created_at, read_by_customer_at: m.read_by_customer_at || null
    });
    renderThread();
    if (m.sender === "staff") {
      announce("New message from " + (m.author_name || "our team") + ".");
      clearTimeout(S.markTimer);
      S.markTimer = setTimeout(markRead, 400);
    }
  }

  /* ---------- running an action ---------- */
  function run(btn, fn, errBox, okMsg) {
    showErr(errBox, "");
    setBusy(btn, true);
    return fn().then(function () {
      setBusy(btn, false);
      if (okMsg) DD.toast(okMsg, "success");
      return refresh();
    }, function (e) {
      setBusy(btn, false);
      showErr(errBox, (e && e.text) || DD.ERR.UNKNOWN);
      if (e && e.code === "BAD_STATUS") refresh();
    });
  }

  /* ---------- render ---------- */
  function savedToast() {
    var t = "";
    try { t = window.sessionStorage.getItem("dd_toast") || ""; window.sessionStorage.removeItem("dd_toast"); } catch (e) { t = ""; }
    if (t) DD.toast(t, "success");
  }
  function renderAll() {
    savedToast();
    renderHead();
    renderSwitcher();
    renderNext();
    renderSuggest();
    renderThread();
    renderActions();
    renderTimeline();
    renderDetails();
  }

  function renderHead() {
    var r = S.req;
    $("req-title").textContent = DD.service(r.service_id);
    document.title = DD.service(r.service_id) + " | Daywon Detailing";
    var meta = $("req-meta");
    clear(meta);
    meta.appendChild(el("span", { text: "Ref " + r.ref }));
    meta.appendChild(el("span", { "class": "chip-status", "data-status": r.status, text: stLabel(r.status) }));
    meta.appendChild(el("span", { text: "Sent " + sentDate(r.created_at) }));
  }

  function renderSwitcher() {
    var wrap = $("switcher-wrap"), sel = $("switcher");
    clear(sel);
    if (S.list.length < 2) { wrap.hidden = true; return; }
    S.list.forEach(function (x) {
      var o = el("option", { value: x.id, text: x.ref + " · " + DD.service(x.service_id) + " · " + stLabel(x.status) });
      if (x.id === S.req.id) o.selected = true;
      sel.appendChild(o);
    });
    wrap.hidden = false;
  }

  function pendingProposal() {
    for (var i = 0; i < S.proposals.length; i++) if (S.proposals[i].status === "pending") return S.proposals[i];
    return null;
  }

  function renderNext() {
    var r = S.req, st = r.status, box = $("sec-next");
    clear(box);
    var errBox = el("div", { "aria-live": "polite" });
    var kids = [];
    var actions = null;
    var sec = el("section", { "class": "next-step", "aria-labelledby": "h-next" });

    function title(text) { return el("h2", { "class": "next-step__title", id: "h-next", text: text }); }
    function text(t) { return el("p", { "class": "next-step__text", text: t }); }

    if (st === "new") {
      kids.push(title("We're preparing your quote."));
      kids.push(text("We reply during our office hours. Need to fix something or change your package? You can edit your request until we send the quote."));
      actions = [el("a", { "class": "btn btn--ghost", href: editHref(r.id) }, [DD.icon("i-edit"), document.createTextNode("Edit request")])];
    } else if (st === "quoted") {
      var amt = r.quote_amount != null ? DD.fmt.money(r.quote_amount) : "";
      kids.push(el("h2", { "class": "next-step__title", id: "h-next" }, [
        amt ? el("span", { "class": "next-step__price", text: amt }) : "Your quote is ready"
      ]));
      var when = whenText(r.scheduled_date, r.scheduled_start);
      if (when) kids.push(el("p", { "class": "next-step__text", text: "for " + when }));
      if (r.quote_note) kids.push(el("p", { "class": "next-step__text portal-note", text: r.quote_note }));
      kids.push(text("You pay after the job is done: tap to pay, cash, Zelle or Cash App."));
      var acc = el("button", { type: "button", "class": "btn btn--primary", text: "Accept quote" });
      acc.addEventListener("click", function () {
        run(acc, function () { return DD.rpc("accept_quote", { p_request: r.id }); }, errBox, "Quote accepted. Thank you!");
      });
      var ask = el("button", { type: "button", "class": "btn btn--ghost", text: "Ask for a different time" });
      ask.addEventListener("click", openChange);
      var chg = el("a", { "class": "btn btn--ghost", href: editHref(r.id) }, [DD.icon("i-edit"), document.createTextNode("Change package or details")]);
      actions = [acc, ask, chg];
      kids.push(el("p", { "class": "next-step__text muted", text: "Changing your package or details sends the request back to us for a new quote." }));
    } else if (st === "approved") {
      kids.push(title("Thanks. We're confirming your booking."));
    } else if (st === "scheduled") {
      kids.push(title("You're booked for " + whenText(r.scheduled_date, r.scheduled_start) + "."));
      kids.push(text("You pay after the job is done: tap to pay, cash, Zelle or Cash App."));
      var cal = calendarHref(r);
      if (cal) actions = [el("a", { "class": "btn btn--primary", href: cal }, [DD.icon("i-calendar"), document.createTextNode("Add to calendar")])];
    } else if (st === "on_the_way") {
      kids.push(title("We're on the way."));
    } else if (st === "in_progress") {
      kids.push(title("We're detailing your vehicle now."));
    } else if (st === "done") {
      kids.push(title("All done. Thank you!"));
      kids.push(text(r.paid ? "Payment received." : "Pay after the job: tap to pay, cash, Zelle or Cash App."));
    } else if (st === "cancelled") {
      kids.push(title("This request was cancelled."));
      if (r.cancel_reason) kids.push(el("p", { "class": "next-step__text portal-note", text: "Reason: " + r.cancel_reason }));
      actions = [el("a", { "class": "btn btn--primary", "data-cta": "", href: "quote.html", text: "Request a new quote" })];
    }

    kids.forEach(function (k) { sec.appendChild(k); });
    if (actions) sec.appendChild(el("div", { "class": "next-step__actions" }, actions));
    sec.appendChild(errBox);
    box.appendChild(sec);
  }

  function renderSuggest() {
    var box = $("sec-suggest"), p = pendingProposal(), r = S.req;
    clear(box);
    if (!p || SUGGEST_OK.indexOf(r.status) < 0) return;
    var sec = el("section", { "class": "portal-sec portal-suggest", "aria-labelledby": "h-sug" });
    var errBox = el("div", { "aria-live": "polite" });
    if (p.proposed_by === "staff") {
      sec.appendChild(el("h2", { "class": "portal-sec__title", id: "h-sug",
        text: "Is this a better time? " + whenText(p.proposed_date, p.proposed_start) }));
      if (p.note) sec.appendChild(el("p", { "class": "portal-note", text: p.note }));
      var yes = el("button", { type: "button", "class": "btn btn--primary", text: "Accept this time" });
      yes.addEventListener("click", function () {
        run(yes, function () { return DD.rpc("respond_proposal", { p_proposal: p.id, p_accept: true }); }, errBox, "Time confirmed.");
      });
      var btns = [yes];
      if (CHANGEABLE.indexOf(r.status) >= 0) {
        var other = el("button", { type: "button", "class": "btn btn--ghost", text: "Suggest another time" });
        other.addEventListener("click", openChange);
        btns.push(other);
      }
      sec.appendChild(el("div", { "class": "actions" }, btns));
      sec.appendChild(errBox);
    } else {
      sec.appendChild(el("h2", { "class": "portal-sec__title", id: "h-sug",
        text: "You asked for " + DD.fmt.date(p.proposed_date) + ", " + DD.fmt.window(p.proposed_start) + ". Waiting for us to confirm." }));
      if (p.note) sec.appendChild(el("p", { "class": "portal-note", text: p.note }));
    }
    box.appendChild(sec);
  }

  function renderThread() {
    var t = $("thread");
    var stick = S.firstThread || (t.scrollHeight - t.scrollTop - t.clientHeight < 80);
    clear(t);
    if (!S.messages.length) {
      t.appendChild(el("p", { "class": "thread__empty", text: "No messages yet. Write to us below and we'll reply here." }));
    }
    S.messages.forEach(function (m) {
      var isNew = !S.firstThread && !S.shown[m.id];
      S.shown[m.id] = true;
      var who = m.sender === "staff" ? (m.author_name || "Daywon Detailing") : "You";
      t.appendChild(el("div", { "class": "bubble bubble--" + (m.sender === "staff" ? "staff" : "customer") + (isNew ? " is-new" : "") }, [
        document.createTextNode(m.body),
        el("span", { "class": "bubble__meta", text: who + " · " + DD.fmt.ago(m.created_at) })
      ]));
    });
    S.firstThread = false;
    if (stick) t.scrollTop = t.scrollHeight;
  }

  function renderActions() {
    var r = S.req, row = $("act-row");
    clear(row);
    var ok = CHANGEABLE.indexOf(r.status) >= 0;
    row.hidden = !ok;
    $("act-locked").hidden = ok;
    if (!ok) { closeForms(); return; }
    var chg = el("button", { type: "button", "class": "btn btn--ghost", "aria-controls": "change-form",
      "aria-expanded": $("change-form").hidden ? "false" : "true" }, [DD.icon("i-clock"), "Ask for a different time"]);
    chg.addEventListener("click", openChange);
    var can = el("button", { type: "button", "class": "btn btn--ghost btn--danger", "aria-controls": "cancel-form",
      "aria-expanded": $("cancel-form").hidden ? "false" : "true" }, ["Cancel request"]);
    can.addEventListener("click", openCancel);
    row.appendChild(chg);
    row.appendChild(can);
  }

  function renderTimeline() {
    var ol = $("timeline");
    clear(ol);
    S.events.forEach(function (ev) {
      var label = "";
      switch (ev.kind) {
        case "created": label = "Request sent"; break;
        case "status": label = ev.to_status ? stLabel(ev.to_status) : ""; break;
        case "time_proposed": label = ev.actor === "staff" ? "We suggested a new time" : "You asked for a new time"; break;
        case "time_accepted": label = "New time confirmed"; break;
        case "time_declined": label = "Time suggestion declined"; break;
        case "time_changed": label = "Time updated"; break;
        case "edited": label = "You changed your request"; break;
        case "paid": label = "Payment received"; break;
        default: label = "";
      }
      if (!label) return;
      var d = new Date(ev.created_at);
      var full = isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      ol.appendChild(el("li", null, [
        el("span", { "class": "timeline__label", text: label }),
        el("time", { "class": "timeline__time", datetime: ev.created_at, title: full, text: DD.fmt.ago(ev.created_at) })
      ]));
    });
    if (!ol.firstChild) ol.appendChild(el("li", null, [el("span", { "class": "timeline__label", text: "Request sent" })]));
  }

  function renderDetails() {
    var r = S.req, dl = $("details");
    clear(dl);
    function row(term, lines) {
      var dd = el("dd", { "class": "portal-lines" });
      lines.forEach(function (l) { dd.appendChild(el("div", null, Array.isArray(l) ? l : [l])); });
      dl.appendChild(el("dt", { text: term }));
      dl.appendChild(dd);
    }
    row("Service", [DD.service(r.service_id)]);

    var addLines = [];
    (r.addon_ids || []).forEach(function (id) {
      var a = DD.addon(id);
      var kids = [a.name];
      if (a.price != null && isFinite(Number(a.price))) {
        kids.push(" ");
        kids.push(el("span", { "data-addon-price": "", text: DD.fmt.money(a.price) }));
      }
      addLines.push(kids);
    });
    row("Add-ons", addLines.length ? addLines : ["None"]);

    var v = S.veh;
    if (v) {
      var name = [v.year, v.make, v.model].filter(Boolean).join(" ");
      var extra = [];
      if (v.size) extra.push(v.size);
      if (v.color) extra.push(v.color);
      row("Vehicle", extra.length ? [name, extra.join(" · ")] : [name]);
    } else {
      row("Vehicle", ["Not available"]);
    }

    var a2 = S.addr;
    if (a2) {
      var l1 = a2.line2 ? a2.street + ", " + a2.line2 : a2.street;
      row("Address", [l1, a2.city + ", " + a2.state + " " + a2.zip]);
    } else {
      row("Address", ["Not available"]);
    }

    var tl = [];
    if (r.scheduled_date && r.scheduled_start) {
      tl.push("Booked: " + DD.fmt.date(r.scheduled_date) + ", " + DD.fmt.window(r.scheduled_start));
    } else {
      if (r.preferred_date && r.preferred_start) tl.push("Preferred: " + DD.fmt.date(r.preferred_date) + ", " + DD.fmt.window(r.preferred_start));
      if (r.backup_date && r.backup_start) tl.push("Backup: " + DD.fmt.date(r.backup_date) + ", " + DD.fmt.window(r.backup_start));
    }
    row("Time", tl.length ? tl : ["Not set yet"]);
    row("Your notes", [r.notes ? r.notes : "None"]);
  }

  /* ---------- inline panels ---------- */
  function closeForms() {
    $("change-form").hidden = true;
    $("cancel-form").hidden = true;
  }
  function syncExpanded() {
    var c = document.querySelector('#act-row [aria-controls="change-form"]');
    var x = document.querySelector('#act-row [aria-controls="cancel-form"]');
    if (c) c.setAttribute("aria-expanded", $("change-form").hidden ? "false" : "true");
    if (x) x.setAttribute("aria-expanded", $("cancel-form").hidden ? "false" : "true");
  }

  function initPicker() {
    var form = $("change-form");
    var root = $("change-sched");
    if (S.schedFor === S.req.id) return;
    S.schedFor = S.req.id;
    clear(root);
    form.elements.change_date.value = "";
    form.elements.change_time.value = "";
    form.elements.change_start.value = "";
    if (window.DDSched && typeof window.DDSched.init === "function") {
      window.DDSched.init(root, {
        staff: false,
        getMinutes: function () { return (S.req && S.req.duration_min) || 120; }
      });
    } else {
      root.appendChild(el("p", { "class": "muted" }, ["The time picker isn't available. Call or text ", phoneLink(), " to change your time."]));
      $("change-send").disabled = true;
    }
  }
  function openChange() {
    if (!S.req || CHANGEABLE.indexOf(S.req.status) < 0) return;
    $("cancel-form").hidden = true;
    var form = $("change-form");
    form.hidden = false;
    initPicker();
    syncExpanded();
    form.setAttribute("tabindex", "-1");
    form.focus();
    if (form.scrollIntoView) form.scrollIntoView({ block: "nearest" });
  }
  function openCancel() {
    $("change-form").hidden = true;
    var form = $("cancel-form");
    form.hidden = false;
    syncExpanded();
    $("cancel-reason").focus();
  }

  function startFromLabel(label) {
    var m = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)$/i.exec(String(label || "").trim());
    if (!m) return "";
    var h = +m[1], ap = (m[3] || m[4]).toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return (h < 10 ? "0" : "") + h + ":" + m[2];
  }

  /* ---------- wiring (once) ---------- */
  function updateCount() {
    var n = $("msg-body").value.length;
    $("msg-count").textContent = n + " / 2000";
  }

  function wire() {
    $("switcher").addEventListener("change", function () {
      var id = this.value;
      if (!id || (S.req && id === S.req.id)) return;
      showErr($("msg-error"), "");
      openById(id).catch(handleLoadError);
    });

    var ta = $("msg-body");
    ta.addEventListener("input", function () { updateCount(); if (ta.hasAttribute("aria-invalid")) { ta.removeAttribute("aria-invalid"); showErr($("msg-error"), ""); } });
    ta.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); $("msg-form").requestSubmit ? $("msg-form").requestSubmit() : $("msg-send").click(); }
    });
    $("msg-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!S.req) return;
      var btn = $("msg-send"), errBox = $("msg-error");
      if (btn.disabled) return;
      var body = ta.value.trim();
      if (!body || body.length > 2000) {
        ta.setAttribute("aria-invalid", "true");
        showErr(errBox, DD.ERR.INVALID.body);
        ta.focus();
        return;
      }
      showErr(errBox, "");
      setBusy(btn, true);
      DD.rpc("send_message", { p_request: S.req.id, p_body: body }).then(function () {
        setBusy(btn, false);
        ta.value = "";
        updateCount();
        S.firstThread = false;
        return refreshMessages();
      }, function (e) {
        setBusy(btn, false);
        ta.setAttribute("aria-invalid", "true");
        showErr(errBox, (e && e.text) || DD.ERR.UNKNOWN);
      });
    });

    $("change-close").addEventListener("click", function () {
      $("change-form").hidden = true;
      showErr($("change-error"), "");
      syncExpanded();
      var b = document.querySelector('#act-row [aria-controls="change-form"]');
      if (b) b.focus();
    });
    $("change-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!S.req) return;
      var form = $("change-form"), errBox = $("change-error"), btn = $("change-send");
      var d = form.elements.change_date.value;
      var s = form.elements.change_start.value || startFromLabel(form.elements.change_time.value);
      if (!d || !s) { showErr(errBox, "Choose a date and an arrival window we're open."); return; }
      var note = form.elements.note.value.trim();
      if (note.length > 500) { showErr(errBox, DD.ERR.INVALID.note); return; }
      showErr(errBox, "");
      setBusy(btn, true);
      DD.rpc("propose_time", { p_request: S.req.id, p_date: d, p_start: s, p_note: note || null }).then(function () {
        setBusy(btn, false);
        form.elements.note.value = "";
        form.hidden = true;
        S.schedFor = "";
        syncExpanded();
        DD.toast("Time request sent. We'll confirm soon.", "success");
        return refresh();
      }, function (e) {
        setBusy(btn, false);
        showErr(errBox, (e && e.text) || DD.ERR.UNKNOWN);
        if (e && e.code === "BAD_STATUS") refresh();
        if (e && e.code === "SLOT_TAKEN" && window.DDSched && window.DDSched.refreshAll) window.DDSched.refreshAll();
      });
    });

    $("cancel-no").addEventListener("click", function () {
      $("cancel-form").hidden = true;
      showErr($("cancel-error"), "");
      syncExpanded();
      var b = document.querySelector('#act-row [aria-controls="cancel-form"]');
      if (b) b.focus();
    });
    $("cancel-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!S.req) return;
      var errBox = $("cancel-error"), btn = $("cancel-yes");
      var reason = $("cancel-reason").value.trim();
      if (reason.length > 500) { showErr(errBox, DD.ERR.INVALID.reason); return; }
      showErr(errBox, "");
      setBusy(btn, true);
      DD.rpc("cancel_request", { p_request: S.req.id, p_reason: reason || null }).then(function () {
        setBusy(btn, false);
        $("cancel-reason").value = "";
        $("cancel-form").hidden = true;
        DD.toast("Request cancelled.", "success");
        return refresh();
      }, function (e) {
        setBusy(btn, false);
        showErr(errBox, (e && e.text) || DD.ERR.UNKNOWN);
        if (e && e.code === "BAD_STATUS") refresh();
      });
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && S.req) refresh();
    });
  }

  /* ---------- start ---------- */
  function start() {
    if (!DD.ok) { showView("nodb", false); return; }
    wire();
    renderLoading("");
    showView("loading", false);
    DD.auth.session().then(function (sess) {
      if (!sess) { showSignin(); return; }
      S.email = (sess.user && sess.user.email) || "";
      enter();
    });
  }
  start();
})();
