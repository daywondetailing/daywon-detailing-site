/* Daywon Detailing quote form: rendering of packages/add-ons, validation, submit paths. */
(function () {
  "use strict";

  var SITE = window.SITE || {};
  var config = window.SITE_CONFIG || SITE.config || {};
  var contact = config.contact || {};
  var formCfg = config.form || {};
  var DATA = window.SITE_DATA || { services: [], addOns: [] };
  var SVC = window.SITE_SERVICES || null;
  var PHONE = contact.phoneDisplay || "240-813-0689";
  var EMAIL = contact.email || "daywondetailing@gmail.com";
  var PHONE_E164 = contact.phoneE164 || "+12408130689";

  var wrap = document.getElementById("quote-form-wrap");
  var form = document.getElementById("quote-form");
  if (!wrap || !form) return;

  /* ---------- helpers ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function icon(id, cls) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    s.setAttribute("aria-hidden", "true");
    var u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    u.setAttribute("href", "#" + id);
    s.appendChild(u);
    return s;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoLocal(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function tomorrowISO() { var d = new Date(); d.setDate(d.getDate() + 1); return isoLocal(d); }
  function validISODate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  }
  function formatDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return v;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  /* ---------- data access ---------- */
  function services() {
    if (SVC && SVC.serviceOptions) {
      try { var o = SVC.serviceOptions(); if (o && o.length) return o; } catch (e) { /* fall through */ }
    }
    return (DATA.services || []).map(function (s) {
      return { id: s.id, name: s.name, duration: s.duration, summary: s.summary, addOnIds: s.addOnIds || [] };
    });
  }
  function serviceById(id) {
    var list = services();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function fullService(id) {
    if (SVC && SVC.getService) { try { var s = SVC.getService(id); if (s) return s; } catch (e) { /* ignore */ } }
    var l = DATA.services || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function addOnsForService(id) {
    var s = serviceById(id);
    var ids = (s && s.addOnIds) || [];
    return (DATA.addOns || []).filter(function (a) { return ids.indexOf(a.id) !== -1; });
  }
  function durationNode(s) {
    if (SVC && SVC.renderDuration) {
      try { var n = SVC.renderDuration(fullService(s.id) || s); if (n) return n; } catch (e) { /* fall through */ }
    }
    if (s.duration) return document.createTextNode(s.duration);
    return el("span", { "class": "placeholder placeholder--inline", "data-placeholder": "duration-" + s.id, text: "Time confirmed with your quote" });
  }

  /* ---------- render service cards + add-ons ---------- */
  var serviceBox = document.getElementById("service-options");
  var addonBox = document.getElementById("addons-options");

  function renderServices(preselect) {
    var list = services();
    if (!list.length) return;
    clear(serviceBox);
    list.forEach(function (s) {
      var input = el("input", { type: "radio", name: "service", value: s.id });
      if (s.id === preselect) input.checked = true;
      var meta = el("span", { "class": "choice__meta" });
      var full = fullService(s.id) || s;
      if (full.startingAt) {
        meta.appendChild(el("span", { "class": "choice__price", text: "Starting at $" + full.startingAt }));
        meta.appendChild(document.createTextNode(" · "));
      }
      meta.appendChild(durationNode(s));
      var body = el("span", { "class": "choice__body" }, [
        el("span", { "class": "choice__title", text: s.name }),
        meta,
        el("span", { "class": "choice__text", text: s.summary || "" })
      ]);
      serviceBox.appendChild(el("label", { "class": "choice" }, [input, body]));
    });
  }

  function currentService() {
    var c = form.querySelector('input[name="service"]:checked');
    return c ? c.value : "";
  }

  function renderAddOns() {
    var keep = {};
    addonBox.querySelectorAll('input[name="addons"]:checked').forEach(function (i) { keep[i.value] = true; });
    clear(addonBox);
    var id = currentService();
    if (!id) {
      addonBox.appendChild(el("p", { "class": "field__help", text: "Choose a package to see its add-ons." }));
      return;
    }
    var s = serviceById(id);
    var items = addOnsForService(id);
    if (!items.length) {
      if (s && (!s.addOnIds || !s.addOnIds.length)) {
        addonBox.appendChild(el("p", { "class": "field__help", text: "Extraction, tire shine and spray wax are already included in this package." }));
      }
      return;
    }
    items.forEach(function (a) {
      var input = el("input", { type: "checkbox", name: "addons", value: a.id });
      input.setAttribute("data-name", a.name + " ($" + a.price + ")");
      if (keep[a.id]) input.checked = true;
      var label = el("span", null, [
        document.createTextNode(a.name + " "),
        el("span", { "class": "check__price", "data-addon-price": "", text: "$" + a.price }),
        document.createTextNode(a.extraTime ? " (adds about " + a.extraTime + ")" : "")
      ]);
      addonBox.appendChild(el("label", { "class": "check" }, [input, label]));
    });
  }

  var qs = new URLSearchParams(window.location.search);
  var pre = qs.get("service");
  if (pre && !serviceById(pre)) pre = null;
  renderServices(pre);
  renderAddOns();

  /* ---------- date mins ---------- */
  var minDate = tomorrowISO();
  ["preferred_date", "backup_date"].forEach(function (n) {
    var i = form.elements[n];
    if (i) i.setAttribute("min", minDate);
  });

  /* ---------- validation ---------- */
  function val(n) {
    var e = form.elements[n];
    return e && e.value != null ? String(e.value).trim() : "";
  }
  function radioVal(n) {
    var c = form.querySelector('input[name="' + n + '"]:checked');
    return c ? c.value : "";
  }
  function dateOk(v) { return validISODate(v) && v >= minDate; }

  var RULES = [
    { n: "name", ok: function () { return val("name").length >= 2; }, msg: "Enter your name." },
    { n: "phone", ok: function () { return val("phone").replace(/\D/g, "").length >= 10; }, msg: "Enter a phone number with area code, like 240-555-0123." },
    { n: "email", ok: function () { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("email")); }, msg: "Enter an email like name@example.com." },
    { n: "contact_method", ok: function () { return !!radioVal("contact_method"); }, msg: "Choose how we should reach you." },
    { n: "vehicle_year", ok: function () {
        var v = val("vehicle_year"); if (!v) return true;
        if (!/^\d{4}$/.test(v)) return false;
        return +v >= 1950 && +v <= new Date().getFullYear() + 1;
      }, msg: "Enter a 4-digit year, or leave it blank." },
    { n: "vehicle_search", ok: function () { return manualVehicle() || (val("vehicle_make").length >= 2 && val("vehicle_model").length >= 1); }, msg: "Pick your vehicle from the list, or tap \"Type it in yourself\"." },
    { n: "vehicle_make", ok: function () { return !manualVehicle() || val("vehicle_make").length >= 2; }, msg: "Enter the make, like Toyota or Ford." },
    { n: "vehicle_model", ok: function () { return !manualVehicle() || val("vehicle_model").length >= 1; }, msg: "Enter the model." },
    { n: "vehicle_size", ok: function () { return !!radioVal("vehicle_size"); }, msg: "Choose your vehicle's size. It's how we price the job." },
    { n: "vehicle_color", ok: function () { return val("vehicle_color").length >= 2; }, msg: "Tap your vehicle's color, or choose Other and type it." },
    { n: "service", ok: function () { return !!serviceById(radioVal("service")); }, msg: "Choose a package." },
    { n: "address_street", ok: function () { return val("address_street").length >= 5; }, msg: "Enter the street address where we'll do the detail." },
    { n: "address_city", ok: function () { return val("address_city").length >= 2; }, msg: "Enter the city." },
    { n: "address_state", ok: function () { return ["MD", "DC", "VA"].indexOf(val("address_state")) !== -1; }, msg: "Choose a state." },
    { n: "address_zip", ok: function () { return /^\d{5}$/.test(val("address_zip")); }, msg: "Enter a 5-digit ZIP code." },
    { n: "in_area", ok: function () { return !!radioVal("area"); }, msg: "Tell us if the address is within 15 miles of Silver Spring. Farther is fine, with a $50 travel fee." },
    { n: "preferred_date", ok: function () { return dateOk(val("preferred_date")) && val("preferred_time") !== ""; }, msg: "Choose a preferred date and an arrival window." },
    { n: "backup_date", ok: function () {
        if (!val("backup_date") && !val("backup_time")) return true;   // optional
        if (!dateOk(val("backup_date")) || val("backup_time") === "") return false;
        return !(val("backup_date") === val("preferred_date") && val("backup_time") === val("preferred_time"));
      }, msg: "Choose an arrival window for your backup date (different from your first choice), or clear it." },
    { n: "notes", ok: function () { return form.elements.notes.value.length <= 1000; }, msg: "Keep notes under 1,000 characters." }
  ];
  function manualVehicle() { return !!(window.DDVehicle && window.DDVehicle.manual()); }
  var RULE = {};
  RULES.forEach(function (r) { RULE[r.n] = r; });

  function fieldWrap(n) { return form.querySelector('[data-field="' + n + '"]'); }
  function controlOf(n) {
    var w = fieldWrap(n);
    if (!w) return null;
    if (w.getAttribute("role") === "radiogroup" || w.hasAttribute("data-widget")) return w;
    return w.querySelector('[name="' + n + '"]');
  }
  function focusTarget(n) {
    var w = fieldWrap(n);
    if (!w) return null;
    if (w.hasAttribute("data-widget")) {
      return w.querySelector(".sched__day.is-selected") || w.querySelector(".sched__day:not([disabled])") || w.querySelector("button");
    }
    if (w.getAttribute("role") === "radiogroup") {
      return w.querySelector("input:checked") || w.querySelector("input");
    }
    return w.querySelector('[name="' + n + '"]');
  }

  var errors = {};   // name -> message
  var touched = {};

  function setError(n, msg) {
    var w = fieldWrap(n), c = controlOf(n);
    if (!w || !c) return;
    var id = "err-" + n;
    var box = document.getElementById(id);
    if (!msg) {
      if (box) box.parentNode.removeChild(box);
      c.removeAttribute("aria-invalid");
      var base = c.getAttribute("data-base-describedby");
      if (base) c.setAttribute("aria-describedby", base); else c.removeAttribute("aria-describedby");
      w.classList.remove("is-invalid");
      delete errors[n];
      return;
    }
    if (!c.hasAttribute("data-base-describedby")) c.setAttribute("data-base-describedby", c.getAttribute("aria-describedby") || "");
    if (!box) {
      box = el("p", { "class": "field__error", id: id }, [icon("i-alert"), el("span")]);
      w.appendChild(box);
    }
    box.lastChild.textContent = msg;
    c.setAttribute("aria-invalid", "true");
    c.setAttribute("aria-describedby", ((c.getAttribute("data-base-describedby") || "") + " " + id).trim());
    w.classList.add("is-invalid");
    errors[n] = msg;
  }

  function validateField(n) {
    var r = RULE[n];
    if (!r) return true;
    var ok = r.ok();
    setError(n, ok ? "" : r.msg);
    return ok;
  }

  function onInteract(e) {
    var w = e.target.closest && e.target.closest("[data-field]");
    if (!w) return;
    var n = w.getAttribute("data-field");
    if (!RULE[n]) return;
    if (e.type === "focusout") {
      if (e.relatedTarget && w.contains(e.relatedTarget)) return;
      touched[n] = true;
      validateField(n);
    } else if (errors[n] || (e.type === "change" && touched[n])) {
      validateField(n);
    }
  }
  form.addEventListener("focusout", onInteract);
  form.addEventListener("input", onInteract);
  function refreshSched() {
    if (window.DDSched && window.DDSched.refreshAll) window.DDSched.refreshAll();
  }
  form.addEventListener("change", function (e) {
    onInteract(e);
    if (e.target && e.target.name === "service") {
      renderAddOns();
      refreshSched();
    } else if (e.target && e.target.name === "addons") {
      refreshSched();
    }
  });

  /* ---------- color buttons fill vehicle_color; "Other" shows a text box ---------- */
  var colorText = form.elements.vehicle_color;
  function syncColor(focus) {
    var pick = radioVal("color_pick");
    var other = pick === "Other";
    colorText.hidden = !other;
    if (!other) colorText.value = pick;
    else {
      if (["Black", "White", "Silver", "Gray", "Blue", "Red", "Green", "Brown or beige", "Gold or yellow", "Orange"].indexOf(colorText.value) >= 0) colorText.value = "";
      if (focus) colorText.focus();
    }
  }
  form.addEventListener("change", function (e) { if (e.target && e.target.name === "color_pick") { syncColor(true); validateField("vehicle_color"); } });
  function setColor(c) {
    var known = form.querySelector('input[name="color_pick"][value="' + String(c || "").replace(/"/g, "") + '"]');
    if (known) { known.checked = true; syncColor(false); }
    else if (c) { setRadio("color_pick", "Other"); colorText.hidden = false; colorText.value = c; }
  }

  /* ---------- job length for the date picker (taken windows) ---------- */
  function jobMinutes() {
    var a = window.DDSched && window.DDSched.availability ? window.DDSched.availability() : null;
    var id = currentService();
    if (!a || !id || !a.service_minutes || !(Number(a.service_minutes[id]) > 0)) return 30;
    var total = Number(a.service_minutes[id]);
    var am = a.addon_minutes || {};
    addonBox.querySelectorAll('input[name="addons"]:checked').forEach(function (i) {
      total += Number(am[i.value]) || 0;
    });
    return total;
  }
  if (window.DDSched) window.DDSched.getMinutes = jobMinutes;

  /* ---------- alerts ---------- */
  var alerts = document.getElementById("form-alerts");
  function clearAlerts() { clear(alerts); }

  function renderSummary(keys) {
    clearAlerts();
    var n = keys.length;
    var title = el("h2", { "class": "error-summary__title" }, [icon("i-alert"), el("span", { text: "Please fix " + n + (n === 1 ? " thing" : " things") })]);
    var ul = el("ul", { "class": "error-summary__list" });
    keys.forEach(function (k) {
      var t = focusTarget(k);
      var a = el("a", { href: "#" + (t && t.id ? t.id : ""), text: errors[k] });
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (t) t.focus();
      });
      ul.appendChild(el("li", null, [a]));
    });
    var box = el("div", { "class": "error-summary", role: "alert", tabindex: "-1" }, [title, ul]);
    alerts.appendChild(box);
    box.focus();
  }

  /* ---------- summary / payload ---------- */
  function checkedAddOns() {
    var out = [];
    addonBox.querySelectorAll('input[name="addons"]:checked').forEach(function (i) { out.push(i.getAttribute("data-name") || i.value); });
    return out;
  }
  function vehicleText() {
    return [val("vehicle_year"), val("vehicle_make"), val("vehicle_model")].filter(Boolean).join(" ");
  }
  function addressText() {
    var parts = [val("address_street")];
    if (val("address_line2")) parts.push(val("address_line2"));
    parts.push(val("address_city"));
    parts.push(val("address_state") + " " + val("address_zip"));
    return parts.join(", ");
  }
  function details() {
    var s = serviceById(radioVal("service"));
    var add = checkedAddOns();
    return [
      ["Name", val("name")],
      ["Phone", val("phone")],
      ["Email", val("email")],
      ["Contact by", radioVal("contact_method")],
      ["Vehicle", vehicleText()],
      ["Size", radioVal("vehicle_size")],
      ["Color", val("vehicle_color")],
      ["Service", s ? s.name : ""],
      ["Add-ons", add.length ? add.join(", ") : "None"],
      ["Address", addressText()],
      ["Service area", radioVal("area") === "outside" ? "Outside 15 miles ($50 travel fee)" : "Within 15 miles"],
      ["Preferred date", formatDate(val("preferred_date"))],
      ["Preferred time", val("preferred_time")],
      ["Backup date", val("backup_date") ? formatDate(val("backup_date")) : "None"],
      ["Backup time", val("backup_time") || "None"],
      ["Notes", val("notes") || "None"]
    ];
  }
  function subject() {
    var s = serviceById(radioVal("service"));
    return (formCfg.subjectPrefix || "New quote request") + ": " + (s ? s.name : "") + " – " + val("name");
  }
  function plainSummary(rows) {
    return rows.map(function (r) { return r[0] + ": " + r[1]; }).join("\n");
  }
  function mailtoHref() {
    return "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject()) + "&body=" + encodeURIComponent(plainSummary(details()));
  }
  function smsHref() {
    var s = serviceById(radioVal("service"));
    var body = "Quote request: " + (s ? s.name : "") + " for " + vehicleText() + ". " + val("name") + ", " + formatDate(val("preferred_date")) + ", " + val("preferred_time") + ".";
    return "sms:" + PHONE_E164 + "?body=" + encodeURIComponent(body);
  }
  function buildPayload() {
    var p = {
      access_key: formCfg.accessKey,
      subject: subject(),
      from_name: "Daywon Detailing website",
      replyto: val("email"),
      botcheck: false
    };
    details().forEach(function (r) { p[r[0]] = r[1]; });
    p["Booking mode"] = "quote";
    return p;
  }

  /* ---------- result states ---------- */
  function showSuccess() {
    var first = val("name").split(/\s+/)[0] || "there";
    var method = radioVal("contact_method");
    var way = method === "Call" ? "phone" : method === "Email" ? "email" : "text";
    var s = serviceById(radioVal("service"));
    var h = el("h2", { text: "Request sent", tabindex: "-1" });
    var dl = el("dl", { "class": "summary-list" });
    [["Service", s ? s.name : ""], ["Vehicle", vehicleText()], ["Date and time", formatDate(val("preferred_date")) + ", " + val("preferred_time")]].forEach(function (r) {
      dl.appendChild(el("div", null, [el("dt", { text: r[0] }), el("dd", { text: r[1] })]));
    });
    var panel = el("div", { "class": "panel success-panel" }, [
      icon("i-check", "icon--xl"),
      h,
      el("p", { text: "Thanks, " + first + ". We'll reply during our office hours with your quote by " + way + " and confirm your time. You pay after the job is done." }),
      dl,
      el("a", { "class": "btn btn--ghost", href: "index.html", text: "Back to home" })
    ]);
    clear(wrap);
    wrap.appendChild(panel);
    h.focus();
  }

  function mailBtn() {
    return el("a", { "class": "btn btn--primary", href: mailtoHref(), text: "Email this request" });
  }

  function showFallback() {
    clearAlerts();
    var sms = el("a", { "class": "btn btn--ghost", href: smsHref(), text: "Text " + PHONE });
    var panel = el("div", { "class": "panel fallback-panel", role: "status", tabindex: "-1" }, [
      el("p", { text: "Online requests aren't switched on yet. Send your request by email or text instead." }),
      el("div", { "class": "actions" }, [mailBtn(), sms])
    ]);
    alerts.appendChild(panel);
    panel.focus();
  }

  function showSendError(customText) {
    clearAlerts();
    var box = el("div", { "class": "error-summary", role: "alert", tabindex: "-1" }, [
      el("p", { text: customText || ("Your request didn't go through. Please try again, or call or text " + PHONE + ".") }),
      el("div", { "class": "actions", style: "margin-top: var(--s-4)" }, [mailBtn()])
    ]);
    alerts.appendChild(box);
    box.focus();
  }

  var btn = document.getElementById("submit-btn");
  var btnKids = null;
  function setLoading(on) {
    if (on) {
      btnKids = Array.prototype.slice.call(btn.childNodes);
      clear(btn);
      btn.appendChild(icon("i-spinner", "icon--spin"));
      btn.appendChild(document.createTextNode("Sending…"));
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    } else {
      clear(btn);
      (btnKids || [document.createTextNode("Send quote request")]).forEach(function (n) { btn.appendChild(n); });
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }

  /* ---------- submit ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var bad = [];
    RULES.forEach(function (r) { touched[r.n] = true; if (!validateField(r.n)) bad.push(r.n); });
    if (bad.length) { renderSummary(bad); return; }
    clearAlerts();

    if (form.elements.botcheck && form.elements.botcheck.checked) { showSuccess(); return; }

    if (editId) { editSubmit(); return; }
    if (window.DD && window.DD.ok) portalSubmit();
    else webSubmit();
  });

  /* Existing Web3Forms path (and mailto/SMS fallback). Also the fallback when the portal can't be reached. */
  function webSubmit() {
    var key = formCfg.accessKey;
    if (!key || key === "YOUR_WEB3FORMS_ACCESS_KEY") { showFallback(); return; }

    setLoading(true);
    fetch(formCfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(buildPayload())
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.success === true) showSuccess();
      else { setLoading(false); showSendError(); }
    }).catch(function () {
      setLoading(false);
      showSendError();
    });
  }

  /* ---------- portal submit (Supabase submit_request) ---------- */
  function portalPayload() {
    var ids = [];
    addonBox.querySelectorAll('input[name="addons"]:checked').forEach(function (i) { ids.push(i.value); });
    return {
      name: val("name"),
      email: val("email"),
      phone: val("phone"),
      contact_method: radioVal("contact_method"),
      vehicle_year: val("vehicle_year"),
      vehicle_make: val("vehicle_make"),
      vehicle_model: val("vehicle_model"),
      vehicle_size: radioVal("vehicle_size"),   // form option values already equal the schema's exact strings
      vehicle_color: val("vehicle_color"),
      service_id: radioVal("service"),
      addon_ids: ids,
      address_street: val("address_street"),
      address_line2: val("address_line2"),
      address_city: val("address_city"),
      address_state: val("address_state"),
      address_zip: val("address_zip"),
      area: radioVal("area"),
      in_area: radioVal("area") === "inside" ? true : "outside",
      preferred_date: val("preferred_date"),
      preferred_start: val("preferred_start"),
      backup_date: val("backup_date"),
      backup_start: val("backup_start"),
      notes: val("notes"),
      botcheck: false
    };
  }

  function go(url) { window.location.href = url; }

  function portalDone(res) {
    var id = res && res.id ? String(res.id) : "";
    if (!/^[0-9a-fA-F-]{32,40}$/.test(id)) { setLoading(false); showSuccess(); return; }
    if (res.edit_token) {
      try { window.localStorage.setItem("dd_edit_" + id, String(res.edit_token)); } catch (e) { /* storage blocked: edit after signing in */ }
    }
    var email = val("email").toLowerCase();
    var wantsStaff = qs.get("staff") === "1";
    var staffCheck = wantsStaff ? window.DD.auth.isStaff() : Promise.resolve(false);
    function nonStaffPath() {
      try {
        window.sessionStorage.setItem("dd_email", val("email"));
        window.sessionStorage.setItem("dd_ref", res.ref ? String(res.ref) : "");
      } catch (e) { /* storage blocked: the portal asks for the email instead */ }
      var target = "my-request.html?r=" + encodeURIComponent(id) + "&new=1";
      go(target);   // the customer asks for a login code themselves on the next page
    }
    staffCheck.then(function (isStaff) {
      if (isStaff) { go("manage.html#/r/" + encodeURIComponent(id)); return; }
      return window.DD.auth.session().then(function (s) {
        var se = s && s.user && s.user.email ? String(s.user.email).toLowerCase() : "";
        if (se && se === email) { go("my-request.html?r=" + encodeURIComponent(id)); return; }
        nonStaffPath();
      });
    }).catch(nonStaffPath);
  }

  function portalSubmit() {
    setLoading(true);
    window.DD.rpc("submit_request", { p: portalPayload() }).then(portalDone, function (err) {
      var code = err && err.code ? err.code : "UNKNOWN";
      var text = (err && err.text) || (window.DD.ERR && window.DD.ERR.UNKNOWN) || "";
      if (code === "NETWORK" || code === "UNKNOWN") {
        // Never lose a request: use the Web3Forms / mailto path.
        setLoading(false);
        webSubmit();
        return;
      }
      setLoading(false);
      if (code === "SLOT_TAKEN") { slotTaken(text); return; }
      if (code === "INVALID") {
        var map = { addons: "service", service: "service", range: "preferred_date" };
        var field = map[err.field] || err.field;
        if (field && fieldWrap(field) && controlOf(field)) {
          setError(field, text);
          renderSummary([field]);
          return;
        }
      }
      showSendError(text);
    });
  }

  function slotTaken(text) {
    if (window.DD && window.DD.availability && window.DD.availability.clear) window.DD.availability.clear();
    if (window.DDSched && window.DDSched.setExclude) window.DDSched.setExclude(editId);
    setError("preferred_date", text || "That time was just taken. Pick another time.");
    renderSummary(["preferred_date"]);
  }

  /* ---------- service area: check the address once it's typed ---------- */
  var AREA = (config.serviceArea || {});
  var areaPicked = false, lastAreaKey = "";
  form.addEventListener("change", function (e) { if (e.target && e.target.name === "area" && e.isTrusted) areaPicked = true; });
  function milesFrom(lat, lng) {
    var R = 3958.8, k = Math.PI / 180, la = AREA.lat || 38.9907, lo = AREA.lng || -77.0261;
    var a = Math.sin((lat - la) * k / 2), b = Math.sin((lng - lo) * k / 2);
    return 2 * R * Math.asin(Math.sqrt(a * a + Math.cos(la * k) * Math.cos(lat * k) * b * b));
  }
  function checkArea() {
    if (areaPicked || !window.fetch) return;
    var street = val("address_street"), city = val("address_city"), zip = val("address_zip");
    if (street.length < 5 || !/^\d{5}$/.test(zip)) return;
    var key = [street, city, val("address_state"), zip].join("|").toLowerCase();
    if (key === lastAreaKey) return;
    lastAreaKey = key;
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us" +
      "&street=" + encodeURIComponent(street) + "&city=" + encodeURIComponent(city) +
      "&state=" + encodeURIComponent(val("address_state")) + "&postalcode=" + encodeURIComponent(zip);
    fetch(url, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (list) {
      if (areaPicked || key !== lastAreaKey) return;
      if (!list || !list.length) {
        // Street not found: fall back to the ZIP code's center.
        return fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&postalcode=" + encodeURIComponent(zip))
          .then(function (r) { return r.json(); });
      }
      return list;
    }).then(function (list) {
      if (areaPicked || key !== lastAreaKey || !list || !list.length) return;
      var d = milesFrom(+list[0].lat, +list[0].lon), lim = AREA.radiusMiles || 15;
      var r = form.querySelector('input[name="area"][value="' + (d <= lim ? "inside" : "outside") + '"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
      var help = document.getElementById("area-help");
      if (help) help.textContent = "We checked: that's about " + Math.round(d) + " miles from Silver Spring" +
        (d <= lim ? ", inside our area." : ". We can still come, with a $" + (AREA.outsideFee || 50) + " travel fee.") + " Change it if that's wrong.";
    }).catch(function () { /* the customer answers the question themselves */ });
  }
  ["address_street", "address_city", "address_zip", "address_state"].forEach(function (n) {
    var i = form.elements[n];
    if (i) i.addEventListener("change", checkArea);
  });

  /* ---------- edit an existing request (quote.html?edit=<id>) ---------- */
  var editId = qs.get("edit");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editId || "")) editId = null;
  var editToken = null;

  function setRadio(name, value) {
    var r = value != null && form.querySelector('input[name="' + name + '"][value="' + String(value).replace(/"/g, "") + '"]');
    if (r) r.checked = true;
  }
  function setVal(name, value) { var i = form.elements[name]; if (i) i.value = value == null ? "" : value; }

  function editBanner(d) {
    var txt = el("div", null, [
      el("p", null, [el("strong", { text: "Editing request " + d.ref + "." }), document.createTextNode(" Change anything below, then tap Save changes.")])
    ]);
    if (d.status === "quoted") txt.appendChild(el("p", { text: "We already sent a quote. Saving sends your request back to us and we'll send a new quote." }));
    if (!d.contact_editable) txt.appendChild(el("p", { text: "To change your name or phone number, message us from your request page." }));
    var b = el("div", { "class": "edit-banner", role: "status" }, [icon("i-edit"), txt]);
    form.insertBefore(b, form.firstChild);
  }

  function fillForm(d) {
    setVal("name", d.name); setVal("phone", d.phone); setVal("email", d.email);
    setRadio("contact_method", d.contact_method);
    form.elements.email.readOnly = true;
    form.elements.email.setAttribute("aria-describedby", "email-locked");
    var ef = fieldWrap("email");
    if (ef && !document.getElementById("email-locked")) ef.appendChild(el("p", { "class": "field__help", id: "email-locked", text: "Your email is how you sign in, so it can't be changed here." }));
    if (!d.contact_editable) {
      ["name", "phone"].forEach(function (n) { form.elements[n].readOnly = true; });
      form.querySelectorAll('input[name="contact_method"]').forEach(function (i) { i.disabled = !i.checked; });
    }
    if (window.DDVehicle) window.DDVehicle.set({ year: d.vehicle_year, make: d.vehicle_make, model: d.vehicle_model, size: d.vehicle_size });
    else { setVal("vehicle_year", d.vehicle_year); setVal("vehicle_make", d.vehicle_make); setVal("vehicle_model", d.vehicle_model); }
    setRadio("vehicle_size", d.vehicle_size);
    setColor(d.vehicle_color);
    renderServices(d.service_id);
    renderAddOns();
    (d.addon_ids || []).forEach(function (a) { var c = addonBox.querySelector('input[name="addons"][value="' + a + '"]'); if (c) c.checked = true; });
    setVal("address_street", d.address_street); setVal("address_line2", d.address_line2);
    setVal("address_city", d.address_city); setVal("address_state", d.address_state); setVal("address_zip", d.address_zip);
    setRadio("area", d.area);
    areaPicked = true;
    setVal("notes", d.notes);
    if (window.DDSched && window.DDSched.setValue) {
      window.DDSched.setValue("preferred", d.preferred_date, d.preferred_start);
      if (d.backup_date && d.backup_start) window.DDSched.setValue("backup", d.backup_date, d.backup_start);
    }
    refreshSched();
  }

  function editFail(err) {
    var code = err && err.code;
    var msg, link = el("a", { "class": "btn btn--primary", href: "my-request.html?r=" + encodeURIComponent(editId), text: "Open my request" });
    if (code === "NOT_ALLOWED") msg = "To change this request, open it and sign in with the code we email you. Then tap Edit request.";
    else if (code === "BAD_STATUS") msg = "This request can't be changed online anymore. Message us from your request page and we'll update it for you.";
    else if (code === "NOT_FOUND") msg = "We couldn't find that request.";
    else msg = (err && err.text) || ("We couldn't load your request. Try again, or call or text " + PHONE + ".");
    clear(wrap);
    wrap.appendChild(el("div", { "class": "panel fallback-panel", role: "alert" }, [el("p", { text: msg }), el("div", { "class": "actions", style: "margin-top: var(--s-4)" }, [link])]));
  }

  function startEdit() {
    try { editToken = window.localStorage.getItem("dd_edit_" + editId) || null; } catch (e) { editToken = null; }
    if (window.DDSched && window.DDSched.setExclude) window.DDSched.setExclude(editId);
    var h1 = document.querySelector(".page-header h1");
    if (h1) h1.textContent = "Change your request";
    var sub = document.querySelector(".page-header__sub");
    if (sub) sub.textContent = "Fix anything you got wrong, pick a different package, or move your time. We'll see the changes right away.";
    btn.lastChild.textContent = "Save changes";
    btnKids = null;
    if (!window.DD || !window.DD.ok) { editFail({ code: "NETWORK", text: (window.DD && window.DD.ERR && window.DD.ERR.NETWORK) || "" }); return; }
    form.setAttribute("aria-busy", "true");
    window.DD.rpc("get_request_edit", { p_request: editId, p_token: editToken }).then(function (d) {
      form.removeAttribute("aria-busy");
      editBanner(d);
      fillForm(d);
    }, editFail);
  }

  function editSubmit() {
    setLoading(true);
    window.DD.rpc("update_request", { p_request: editId, p: portalPayload(), p_token: editToken }).then(function (res) {
      try {
        window.sessionStorage.setItem("dd_ref", res && res.ref ? String(res.ref) : "");
        window.sessionStorage.setItem("dd_toast", "Your changes were saved. We'll send your quote during office hours.");
      } catch (e) { /* ignore */ }
      window.DD.auth.session().then(function (s) {
        go("my-request.html?r=" + encodeURIComponent(editId) + (s ? "" : "&new=1&updated=1"));
      }, function () { go("my-request.html?r=" + encodeURIComponent(editId) + "&new=1&updated=1"); });
    }, function (err) {
      setLoading(false);
      var code = err && err.code, text = (err && err.text) || "";
      if (code === "SLOT_TAKEN") { slotTaken(text); return; }
      if (code === "INVALID") {
        var map = { addons: "service", service: "service", range: "preferred_date" };
        var field = map[err.field] || err.field;
        if (field && fieldWrap(field) && controlOf(field)) { setError(field, text); renderSummary([field]); return; }
      }
      if (code === "BAD_STATUS" || code === "NOT_ALLOWED") { editFail(err); return; }
      showSendError(text);
    });
  }

  if (editId) startEdit();

  /* ---------- square / external mode ---------- */
  var mode = SITE.getBookingMode ? SITE.getBookingMode() : { mode: "quote" };
  if (mode.mode !== "quote") {
    var sq = document.getElementById("square-wrap");
    var list = document.getElementById("square-list");
    wrap.hidden = true;
    sq.hidden = false;
    clear(list);
    services().forEach(function (s) {
      var full = fullService(s.id) || {};
      var url = (full.bookingUrls && full.bookingUrls[mode.mode]) || mode.url;
      list.appendChild(el("a", { "class": "btn btn--ghost", href: url, target: "_blank", rel: "noopener", text: s.name }));
    });
    var main = document.getElementById("square-main");
    main.setAttribute("href", mode.url);
  }
})();
