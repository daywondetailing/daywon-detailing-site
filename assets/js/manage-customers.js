/* Daywon Detailing dashboard: customers list (#/customers) and profile (#/c/<id>).
   Direct table writes only where the grants allow (customers, vehicles, addresses, customer_notes). Text only via DD.el. */
(function () {
  "use strict";
  if (!window.DDM || !window.DD) return;

  var DD = window.DD, DDM = window.DDM;
  var TIMEOUT = ((window.SITE_CONFIG || {}).portal || {}).timeoutMs || 10000;
  var SIZES = ["Car (sedan, coupe, hatchback)", "Small SUV or crossover", "Large SUV or minivan", "Pickup truck", "Other / not sure"];
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
    else if (e && e.code === "23505") out.text = "Another customer already uses that email. Use a different email.";
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
  function loadingNode(text) {
    return el("p", { "class": "muted mg-loading", role: "status" }, [DD.icon("i-spinner", "icon--spin"), " " + (text || "Loading…")]);
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
  function inlineErr(box, msg) {
    clear(box);
    if (msg) box.appendChild(el("p", { "class": "field__error", role: "alert" }, [DD.icon("i-alert"), el("span", { text: msg })]));
  }
  var uidN = 0;
  function uid() { uidN += 1; return "mc" + uidN; }
  function fieldNode(f, value) {
    var id = uid(), input;
    if (f.type === "select") {
      var opts = f.options.slice();
      if (value && opts.indexOf(value) < 0) opts.push(value);
      input = el("select", { id: id, name: f.key }, [el("option", { value: "", text: "Choose…" })].concat(opts.map(function (o) { return el("option", { value: o, text: o }); })));
      input.value = value || "";
    } else if (f.type === "textarea") {
      input = el("textarea", { id: id, name: f.key, maxlength: f.max });
      input.value = value || "";
    } else {
      input = el("input", { id: id, name: f.key, type: f.type || "text", maxlength: f.max, inputmode: f.inputmode, autocomplete: "off" });
      input.value = value || "";
    }
    var err = el("div", { id: id + "-err" });
    var wrap = el("div", { "class": "field" }, [
      el("label", { "class": "field__label", "for": id }, [f.label, f.required ? null : el("span", { "class": "field__optional", text: " (optional)" })]),
      input, err
    ]);
    return { wrap: wrap, input: input, err: err, key: f.key, def: f };
  }
  function checkField(n) {
    var f = n.def, v = n.input.value.trim(), msg = "";
    if (!v && f.required) msg = f.label + " is required. Fill it in.";
    else if (v && f.max && v.length > f.max) msg = f.label + " is too long. Keep it under " + (f.max + 1) + " characters.";
    else if (v && f.pattern && !f.pattern.test(v)) msg = f.hint;
    inlineErr(n.err, msg);
    if (msg) { n.input.setAttribute("aria-invalid", "true"); n.input.setAttribute("aria-describedby", n.input.id + "-err"); }
    else { n.input.removeAttribute("aria-invalid"); n.input.removeAttribute("aria-describedby"); }
    return !msg;
  }
  function validateAll(nodes) {
    var first = null;
    nodes.forEach(function (n) { if (!checkField(n) && !first) first = n; });
    if (first) first.input.focus();
    return !first;
  }
  function money(n) { return DD.fmt.money(n); }
  function dateOnly(ts) { return ts ? DD.fmt.date(String(ts).slice(0, 10)) : ""; }

  /* =================== #/customers =================== */
  function renderList(main) {
    var my = ++seq, timer = null, reqSeq = 0;
    clear(main);
    main.appendChild(el("h1", { tabindex: "-1", text: "Customers" }));

    var searchId = uid();
    var search = el("input", { id: searchId, type: "search", name: "q", autocomplete: "off", placeholder: "Name, phone or email" });
    main.appendChild(el("div", { "class": "field mg-search" }, [el("label", { "class": "field__label", "for": searchId, text: "Search customers" }), search]));
    var out = el("div", { "aria-live": "polite" });
    main.appendChild(out);

    function load() {
      var my2 = ++reqSeq;
      clear(out);
      out.appendChild(loadingNode("Loading customers…"));
      if (!DD.ok) { clear(out); out.appendChild(errorNode(load, DD.ERR.NETWORK)); return; }
      var q = search.value.trim().replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim();
      var qb = DD.sb.from("customers").select("id,name,phone,email,created_at,requests(id,status,paid,paid_amount,scheduled_date,created_at)");
      if (q) qb = qb.or("name.ilike.%" + q + "%,phone.ilike.%" + q + "%,email.ilike.%" + q + "%");
      db(qb.order("created_at", { ascending: false }).limit(200)).then(function (rows) {
        if (my !== seq || my2 !== reqSeq) return;
        draw(rows || [], !!q);
      }, function (e) {
        if (my !== seq || my2 !== reqSeq) return;
        clear(out); out.appendChild(errorNode(load, e && e.text));
      });
    }
    function stats(c) {
      var jobs = 0, spent = 0, last = "";
      (c.requests || []).forEach(function (r) {
        if (r.status !== "cancelled") {
          jobs += 1;
          var d = r.scheduled_date || String(r.created_at || "").slice(0, 10);
          if (d > last) last = d;
        }
        if (r.paid && r.paid_amount != null) spent += Number(r.paid_amount);
      });
      return { jobs: jobs, spent: spent, last: last };
    }
    function draw(rows, searched) {
      clear(out);
      var list = rows.map(function (c) { return { c: c, s: stats(c) }; });
      list.sort(function (a, b) { return a.s.last < b.s.last ? 1 : a.s.last > b.s.last ? -1 : 0; });
      if (!list.length) {
        out.appendChild(el("p", { "class": "list-rows__empty", text: searched ? "No customers match that search. Try a different name, phone or email." : "No customers yet. They appear here when a quote request comes in." }));
        return;
      }
      var ul = el("ul", { "class": "list-rows" });
      list.forEach(function (x) {
        var meta2 = plural(x.s.jobs, "job") + " · " + (x.s.last ? "Last " + DD.fmt.date(x.s.last) : "No jobs yet") + " · Spent " + money(x.s.spent);
        ul.appendChild(el("li", null, [el("a", { "class": "list-row", href: "#/c/" + x.c.id }, [
          el("div", { "class": "list-row__main" }, [
            el("span", { "class": "list-row__title", text: x.c.name }),
            el("span", { "class": "list-row__meta", text: x.c.phone || x.c.email }),
            el("span", { "class": "list-row__meta", text: meta2 })
          ]),
          el("span", { "class": "list-row__end" }, [DD.icon("i-chevron-right")])
        ])]));
      });
      out.appendChild(ul);
      if (rows.length >= 200) out.appendChild(el("p", { "class": "muted mg-note", text: "Showing the newest 200. Use search to find anyone else." }));
    }
    function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

    search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 300); });
    load();
  }

  /* =================== #/c/<id> =================== */
  var VEH = [
    { key: "year", label: "Year", max: 4, inputmode: "numeric", pattern: /^\d{4}$/, hint: "Enter a 4-digit year, or leave it blank." },
    { key: "make", label: "Make", required: true, max: 60 },
    { key: "model", label: "Model", required: true, max: 60 },
    { key: "size", label: "Size", required: true, type: "select", options: SIZES },
    { key: "color", label: "Color", max: 40 }
  ];
  var ADDR = [
    { key: "street", label: "Street", required: true, max: 200 },
    { key: "line2", label: "Address line 2", max: 200 },
    { key: "city", label: "City", required: true, max: 80 },
    { key: "state", label: "State", required: true, type: "select", options: ["MD", "DC", "VA"] },
    { key: "zip", label: "ZIP", required: true, max: 5, inputmode: "numeric", pattern: /^\d{5}$/, hint: "Enter a 5-digit ZIP code." }
  ];

  function renderProfile(main, match) {
    var my = ++seq, id = match[1];
    clear(main);
    main.appendChild(el("a", { "class": "link-btn mg-back", href: "#/customers" }, [DD.icon("i-chevron-left"), "Customers"]));
    var body = el("div");
    main.appendChild(body);

    function load() {
      clear(body);
      body.appendChild(el("h1", { tabindex: "-1", text: "Customer" }));
      body.appendChild(loadingNode("Loading customer…"));
      if (!DD.ok) { clear(body); body.appendChild(el("h1", { tabindex: "-1", text: "Customer" })); body.appendChild(errorNode(load, DD.ERR.NETWORK)); return; }
      Promise.all([
        db(DD.sb.from("customers").select("id,email,name,phone,contact_method,created_at").eq("id", id).maybeSingle()),
        db(DD.sb.from("vehicles").select("id,year,make,model,size,color").eq("customer_id", id).order("created_at", { ascending: true }).limit(200)),
        db(DD.sb.from("addresses").select("id,street,line2,city,state,zip").eq("customer_id", id).order("created_at", { ascending: true }).limit(200)),
        db(DD.sb.from("requests").select("id,ref,status,service_id,scheduled_date,scheduled_start,created_at,paid,paid_amount").eq("customer_id", id).order("created_at", { ascending: false }).limit(200)),
        db(DD.sb.from("customer_notes").select("id,request_id,body,author_name,created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(200))
      ]).then(function (r) {
        if (my !== seq) return;
        if (!r[0]) {
          clear(body);
          body.appendChild(el("h1", { tabindex: "-1", text: "Customer not found" }));
          body.appendChild(el("p", { "class": "muted", text: "We couldn't find that customer. Go back to the list and pick again." }));
          return;
        }
        draw({ c: r[0], vehicles: r[1] || [], addresses: r[2] || [], jobs: r[3] || [], notes: r[4] || [] });
      }, function (e) {
        if (my !== seq) return;
        clear(body);
        body.appendChild(el("h1", { tabindex: "-1", text: "Customer" }));
        body.appendChild(errorNode(load, e && e.text));
      });
    }

    function draw(s) {
      clear(body);
      var h1 = el("h1", { tabindex: "-1", text: s.c.name });
      body.appendChild(h1);
      var spent = 0;
      s.jobs.forEach(function (j) { if (j.paid && j.paid_amount != null) spent += Number(j.paid_amount); });
      body.appendChild(el("p", { "class": "mg-total" }, [el("span", { "class": "muted", text: "Total spent " }), el("strong", { text: money(spent) })]));

      var panel = el("div", { "class": "panel" });
      body.appendChild(panel);
      panel.appendChild(contactSection(s));
      panel.appendChild(listSection("Vehicles", "vehicles", VEH, s.vehicles, "Add vehicle", "No vehicles saved yet.", function (v) {
        return { title: [v.year, v.make, v.model].filter(Boolean).join(" "), meta: [v.size, v.color].filter(Boolean).join(", ") };
      }));
      panel.appendChild(listSection("Addresses", "addresses", ADDR, s.addresses, "Add address", "No addresses saved yet.", function (a) {
        return { title: a.street + (a.line2 ? ", " + a.line2 : ""), meta: a.city + ", " + a.state + " " + a.zip };
      }));
      panel.appendChild(historySection(s.jobs));
      panel.appendChild(notesSection(s));
    }

    /* contact */
    function contactSection(s) {
      var sec = el("section", { "class": "mg-sec" });
      sec.appendChild(el("h2", { "class": "portal-sec__title", text: "Contact" }));
      var nodes = [
        fieldNode({ key: "name", label: "Name", required: true, max: 100 }, s.c.name),
        fieldNode({ key: "phone", label: "Phone", max: 30, type: "tel", inputmode: "tel" }, s.c.phone),
        fieldNode({ key: "email", label: "Email", required: true, max: 254, type: "email", inputmode: "email", pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, hint: "Enter an email like name@example.com." }, s.c.email),
        fieldNode({ key: "contact_method", label: "Prefers", required: true, type: "select", options: ["Text", "Call", "Email"] }, s.c.contact_method)
      ];
      var warn = el("div", { role: "status" });
      var errBox = el("div");
      var btn = el("button", { type: "submit", "class": "btn btn--primary" }, "Save contact");
      nodes[2].input.addEventListener("input", function () {
        clear(warn);
        if (nodes[2].input.value.trim().toLowerCase() !== s.c.email) {
          warn.appendChild(el("p", { "class": "field__help mg-warn", text: "They will sign in with the new email." }));
        }
      });
      var form = el("form", { novalidate: "novalidate", "class": "mg-form" }, [
        el("div", { "class": "mg-form__grid" }, nodes.map(function (n) { return n.wrap; })), warn, errBox,
        el("div", { "class": "actions" }, [btn])
      ]);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        inlineErr(errBox, "");
        if (!validateAll(nodes)) return;
        var patch = {
          name: nodes[0].input.value.trim(),
          phone: nodes[1].input.value.trim() || null,
          email: nodes[2].input.value.trim().toLowerCase(),
          contact_method: nodes[3].input.value
        };
        setBusy(btn, true);
        db(DD.sb.from("customers").update(patch).eq("id", id).select("id,email,name")).then(function (rows) {
          setBusy(btn, false);
          if (!rows || !rows.length) { inlineErr(errBox, "That wasn't saved. " + DD.ERR.NOT_ALLOWED); return; }
          s.c.email = rows[0].email; s.c.name = rows[0].name;
          h1.textContent = rows[0].name;
          nodes[2].input.value = rows[0].email;
          clear(warn);
          DD.toast("Saved", "success");
        }, function (e) { setBusy(btn, false); inlineErr(errBox, e.text); });
      });
      sec.appendChild(form);
      return sec;
    }

    /* vehicles / addresses editor */
    function listSection(title, table, fields, items, addLabel, emptyText, summary) {
      var sec = el("section", { "class": "mg-sec" });
      var state = { editing: null, confirm: null };
      var live = el("div", { role: "status", "class": "set-sr" });

      function paint() {
        clear(sec);
        sec.appendChild(el("h2", { "class": "portal-sec__title", text: title }));
        sec.appendChild(live);
        if (!items.length && state.editing !== "new") sec.appendChild(el("p", { "class": "muted", text: emptyText }));
        var ul = el("ul", { "class": "list-rows mg-items" });
        items.forEach(function (it) {
          if (state.editing === it.id) { ul.appendChild(el("li", null, [editor(it)])); return; }
          var sm = summary(it);
          var edit = el("button", { type: "button", "class": "btn btn--ghost", "aria-label": "Edit " + sm.title }, [DD.icon("i-edit"), "Edit"]);
          var del = el("button", { type: "button", "class": "btn btn--ghost btn--danger", "aria-label": "Delete " + sm.title }, [DD.icon("i-trash"), "Delete"]);
          edit.addEventListener("click", function () { state.editing = it.id; state.confirm = null; paint(); });
          del.addEventListener("click", function () { state.confirm = it.id; paint(); });
          var li = el("li", { "class": "mg-item" }, [
            el("div", { "class": "mg-item__main" }, [el("span", { "class": "list-row__title mg-wrap", text: sm.title }), el("span", { "class": "list-row__meta mg-wrap", text: sm.meta })]),
            el("div", { "class": "mg-item__actions" }, [edit, del])
          ]);
          if (state.confirm === it.id) li.appendChild(confirmBox(it, sm));
          ul.appendChild(li);
        });
        if (items.length || state.editing === "new") sec.appendChild(ul);
        if (state.editing === "new") ul.appendChild(el("li", null, [editor(null)]));
        if (state.editing !== "new") {
          var add = el("button", { type: "button", "class": "btn btn--ghost" }, [DD.icon("i-plus"), addLabel]);
          add.addEventListener("click", function () { state.editing = "new"; state.confirm = null; paint(); });
          sec.appendChild(el("div", { "class": "actions mg-add" }, [add]));
        }
      }
      function confirmBox(it, sm) {
        var err = el("div");
        var yes = el("button", { type: "button", "class": "btn btn--danger" }, "Yes, delete");
        var no = el("button", { type: "button", "class": "btn btn--ghost" }, "Keep it");
        yes.addEventListener("click", function () {
          setBusy(yes, true); no.disabled = true;
          db(DD.sb.from(table).delete().eq("id", it.id).select("id")).then(function (rows) {
            if (!rows || !rows.length) { setBusy(yes, false); no.disabled = false; inlineErr(err, "That wasn't deleted. " + DD.ERR.NOT_ALLOWED); return; }
            items.splice(items.indexOf(it), 1);
            state.confirm = null; paint();
            live.textContent = "Deleted " + sm.title;
            DD.toast("Saved", "success");
          }, function (e) { setBusy(yes, false); no.disabled = false; inlineErr(err, e.text); });
        });
        no.addEventListener("click", function () { state.confirm = null; paint(); });
        return el("div", { "class": "inline-confirm" }, [
          el("p", { text: "Delete " + sm.title + "? Past jobs keep their record." }), err,
          el("div", { "class": "actions" }, [yes, no])
        ]);
      }
      function editor(it) {
        var nodes = fields.map(function (f) { return fieldNode(f, it ? it[f.key] : ""); });
        var err = el("div");
        var save = el("button", { type: "submit", "class": "btn btn--primary" }, it ? "Save" : addLabel);
        var cancel = el("button", { type: "button", "class": "btn btn--ghost" }, "Cancel");
        cancel.addEventListener("click", function () { state.editing = null; paint(); });
        var form = el("form", { novalidate: "novalidate", "class": "mg-form" }, [
          el("div", { "class": "mg-form__grid" }, nodes.map(function (n) { return n.wrap; })), err,
          el("div", { "class": "actions" }, [save, cancel])
        ]);
        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          inlineErr(err, "");
          if (!validateAll(nodes)) return;
          var vals = {};
          nodes.forEach(function (n) { vals[n.key] = n.input.value.trim() || null; });
          setBusy(save, true); cancel.disabled = true;
          var cols = ["id"].concat(fields.map(function (f) { return f.key; })).join(",");
          var q = it ? DD.sb.from(table).update(vals).eq("id", it.id).select(cols)
                     : DD.sb.from(table).insert(Object.assign({ customer_id: id }, vals)).select(cols);
          db(q).then(function (rows) {
            if (!rows || !rows.length) { setBusy(save, false); cancel.disabled = false; inlineErr(err, "That wasn't saved. " + DD.ERR.NOT_ALLOWED); return; }
            if (it) Object.assign(it, rows[0]); else items.push(rows[0]);
            state.editing = null; paint();
            DD.toast("Saved", "success");
          }, function (e) { setBusy(save, false); cancel.disabled = false; inlineErr(err, e.text); });
        });
        var wrap = el("div", { "class": "mg-edit" }, [el("p", { "class": "field__label", text: it ? "Edit" : addLabel }), form]);
        setTimeout(function () { if (nodes[0] && document.body.contains(wrap)) nodes[0].input.focus(); }, 0);
        return wrap;
      }
      paint();
      return sec;
    }

    /* history */
    function historySection(jobs) {
      var sec = el("section", { "class": "mg-sec" });
      sec.appendChild(el("h2", { "class": "portal-sec__title", text: "Job history" }));
      if (!jobs.length) { sec.appendChild(el("p", { "class": "muted", text: "No jobs yet." })); return sec; }
      var ul = el("ul", { "class": "list-rows" });
      jobs.forEach(function (j) {
        var when = j.scheduled_date ? DD.fmt.date(j.scheduled_date) + ", " + DD.fmt.window(j.scheduled_start) : "Sent " + dateOnly(j.created_at);
        ul.appendChild(el("li", null, [el("a", { "class": "list-row", href: "#/r/" + j.id }, [
          el("div", { "class": "list-row__main" }, [
            el("span", { "class": "list-row__title", text: DD.service(j.service_id) + " · " + j.ref }),
            el("span", { "class": "list-row__meta", text: when + (j.paid && j.paid_amount != null ? " · Paid " + money(j.paid_amount) : "") })
          ]),
          el("span", { "class": "list-row__end" }, [el("span", { "class": "chip-status", "data-status": j.status, text: DD.STATUS[j.status] ? DD.STATUS[j.status].staff : j.status })])
        ])]));
      });
      sec.appendChild(ul);
      return sec;
    }

    /* notes */
    function notesSection(s) {
      var sec = el("section", { "class": "mg-sec" });
      var listBox = el("div");
      function paintList() {
        clear(listBox);
        if (!s.notes.length) { listBox.appendChild(el("p", { "class": "muted", text: "No notes yet." })); return; }
        var ul = el("ul", { "class": "mg-notes" });
        s.notes.forEach(function (n) {
          ul.appendChild(el("li", null, [
            el("p", { "class": "portal-note", text: n.body }),
            el("p", { "class": "muted mg-note-meta" }, [
              (n.author_name || "Staff") + " · " + DD.fmt.ago(n.created_at),
              n.request_id ? el("span", null, [" · ", el("a", { href: "#/r/" + n.request_id }, "On a job")]) : null
            ])
          ]));
        });
        listBox.appendChild(ul);
      }
      var id2 = uid();
      var ta = el("textarea", { id: id2, name: "note", maxlength: "2000", rows: "3" });
      var err = el("div");
      var btn = el("button", { type: "submit", "class": "btn btn--primary" }, "Add note");
      var form = el("form", { novalidate: "novalidate", "class": "mg-form" }, [
        el("div", { "class": "field" }, [el("label", { "class": "field__label", "for": id2, text: "New note. Only staff see these." }), ta]), err,
        el("div", { "class": "actions" }, [btn])
      ]);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        inlineErr(err, "");
        var body = ta.value.trim();
        if (!body) { inlineErr(err, "Write a note first, up to 2,000 characters."); ta.focus(); return; }
        setBusy(btn, true);
        db(DD.sb.from("customer_notes").insert({ customer_id: id, body: body, author_name: DDM.staff && DDM.staff.name || null }).select("id,request_id,body,author_name,created_at")).then(function (rows) {
          setBusy(btn, false);
          if (!rows || !rows.length) { inlineErr(err, "That wasn't saved. " + DD.ERR.NOT_ALLOWED); return; }
          s.notes.unshift(rows[0]); ta.value = ""; paintList();
          DD.toast("Saved", "success");
        }, function (e) { setBusy(btn, false); inlineErr(err, e.text); });
      });
      sec.appendChild(el("h2", { "class": "portal-sec__title", text: "Notes" }));
      sec.appendChild(form);
      paintList();
      sec.appendChild(listBox);
      return sec;
    }

    load();
  }

  DDM.register(/^#\/customers$/, renderList);
  DDM.register(/^#\/c\/([0-9a-fA-F-]{36})$/, renderProfile);
})();
