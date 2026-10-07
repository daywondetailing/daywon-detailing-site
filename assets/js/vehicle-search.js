/* Daywon Detailing vehicle search for the quote form.
   The customer types "2019 civic" or "tahoe", picks from the list, and we fill year / make / model
   and pre-select the size. Data: assets/data/vehicles.json (us-car-models-data, CC BY 4.0), loaded on first focus.
   "Type it in yourself" shows the plain make / model fields instead.
   Exposes window.DDVehicle = { set({year, make, model, size}), manual(), clear() }. */
(function () {
  "use strict";

  var form = document.getElementById("quote-form");
  var wrap = document.getElementById("vsearch");
  if (!form || !wrap) return;

  var input = document.getElementById("f-vsearch");
  var list = document.getElementById("vsearch-list");
  var picked = document.getElementById("vsearch-picked");
  var manualBtn = document.getElementById("vsearch-manual");
  var manualBox = document.getElementById("vehicle-manual");
  var sizeHelp = document.getElementById("size-help");
  var yearEl = form.elements.vehicle_year, makeEl = form.elements.vehicle_make, modelEl = form.elements.vehicle_model;

  var DATA = null, SIZES = [], loading = null;
  var results = [], active = -1, isManual = false;
  var ALIAS = { chevy: "chevrolet", vw: "volkswagen", benz: "mercedes-benz", mercedes: "mercedes-benz", merc: "mercedes-benz",
    caddy: "cadillac", landrover: "land rover", range: "land rover", alfa: "alfa romeo", rolls: "rolls-royce" };

  function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function squash(t) { return norm(t).replace(/ /g, ""); }

  function load() {
    if (loading) return loading;
    loading = fetch("assets/data/vehicles.json").then(function (r) { return r.json(); }).then(function (j) {
      SIZES = j.sizes || [];
      DATA = (j.v || []).map(function (r) {
        var name = r[0] + " " + r[1];
        return { make: r[0], model: r[1], from: r[2], to: r[3], size: r[4], key: norm(name), flat: squash(name) };
      });
      if (document.activeElement === input && input.value) search();
    }).catch(function () { DATA = []; });
    return loading;
  }

  function search() {
    var q = norm(input.value);
    results = []; active = -1;
    if (!q || !DATA) { render(); return; }
    var year = null, words = [];
    q.split(" ").forEach(function (w) {
      if (/^(19[5-9]\d|20[0-3]\d)$/.test(w)) year = +w;
      else if (w) words.push(ALIAS[w] ? norm(ALIAS[w]) : w);
    });
    words = words.join(" ").split(" ").filter(Boolean);
    if (!words.length) { render(year); return; }
    var scored = [];
    DATA.forEach(function (v) {
      if (year && (year < v.from - 1 || year > v.to + 2)) return;
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var at = (" " + v.key).indexOf(" " + w);
        if (at >= 0) score += at === 0 ? 3 : 2;
        else if (v.flat.indexOf(w) >= 0) score += 1;
        else return;
      }
      if (squash(v.model) === words.join("")) score += 4;   // exact model name ("tahoe")
      score -= v.model.length / 100;
      scored.push({ v: v, s: score });
    });
    scored.sort(function (a, b) { return b.s - a.s || a.v.key.localeCompare(b.v.key); });
    results = scored.slice(0, 8).map(function (x) { return x.v; });
    render(year);
  }

  function render(year) {
    while (list.firstChild) list.removeChild(list.firstChild);
    var q = norm(input.value);
    if (year === undefined) { var ym = /\b(19[5-9]\d|20[0-3]\d)\b/.exec(q); year = ym ? +ym[1] : null; }
    if (!q) { close(); return; }
    if (!DATA) {
      var li0 = document.createElement("li");
      li0.className = "vsearch__empty"; li0.textContent = "Loading vehicles…";
      list.appendChild(li0);
    } else if (!results.length) {
      var li = document.createElement("li");
      li.className = "vsearch__empty";
      li.textContent = "No match. Check the spelling, or tap \"Type it in yourself\" below.";
      list.appendChild(li);
    }
    results.forEach(function (v, i) {
      var li = document.createElement("li");
      li.className = "vsearch__opt";
      li.id = "vsearch-opt-" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      var name = document.createElement("span");
      name.textContent = (year ? year + " " : "") + v.make + " " + v.model;
      var yrs = document.createElement("small");
      yrs.textContent = v.from === v.to ? String(v.from) : v.from + "–" + v.to;
      li.appendChild(name); li.appendChild(yrs);
      li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(v, year); });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", "vsearch-opt-" + active);
    else input.removeAttribute("aria-activedescendant");
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function fire(el) { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }

  function setSize(label) {
    if (!label) return false;
    var r = form.querySelector('input[name="vehicle_size"][value="' + label.replace(/"/g, "") + '"]');
    if (!r) return false;
    r.checked = true;
    fire(r);
    return true;
  }

  function showPicked() {
    var text = [yearEl.value, makeEl.value, modelEl.value].filter(Boolean).join(" ");
    picked.querySelector("[data-picked-name]").textContent = text;
    picked.hidden = false;
    input.hidden = true;
    manualBtn.hidden = true;
    close();
  }

  function choose(v, year) {
    makeEl.value = v.make;
    modelEl.value = v.model;
    if (year) yearEl.value = String(year);
    fire(makeEl); fire(modelEl); fire(yearEl);
    input.dispatchEvent(new Event("change", { bubbles: true }));   // clears a "pick your vehicle" error
    var sized = v.size < 4 && setSize(SIZES[v.size]);
    if (sizeHelp) sizeHelp.textContent = sized ? "We picked the size from your vehicle. Change it if it's not right." : "Choose the size that fits best.";
    showPicked();
    var y = yearEl;
    if (!year && y) y.focus();
  }

  function change() {
    picked.hidden = true;
    input.hidden = false;
    manualBtn.hidden = false;
    input.value = [makeEl.value, modelEl.value].filter(Boolean).join(" ");
    makeEl.value = ""; modelEl.value = "";
    fire(makeEl); fire(modelEl);
    input.focus();
    search();
  }

  function setManual(on) {
    isManual = !!on;
    manualBox.hidden = !on;
    wrap.hidden = on;
    if (on) {
      if (!makeEl.value && input.value) makeEl.value = input.value.split(" ")[0] || "";
      makeEl.focus();
    }
  }

  input.addEventListener("focus", load);
  input.addEventListener("input", function () { load(); search(); });
  input.addEventListener("keydown", function (e) {
    if (list.hidden && e.key !== "ArrowDown") return;
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) search(); active = Math.min(results.length - 1, active + 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (e.key === "Enter") {
      if (results.length) {
        e.preventDefault();
        var ym = /\b(19[5-9]\d|20[0-3]\d)\b/.exec(input.value);
        choose(results[active >= 0 ? active : 0], ym ? +ym[1] : null);
      }
    } else if (e.key === "Escape") { close(); }
  });
  input.addEventListener("blur", function () { setTimeout(close, 120); });
  picked.querySelector("[data-picked-change]").addEventListener("click", change);
  manualBtn.addEventListener("click", function () { setManual(true); });
  var back = document.getElementById("vsearch-back");
  if (back) back.addEventListener("click", function () { setManual(false); input.focus(); });

  window.DDVehicle = {
    manual: function () { return isManual; },
    set: function (v) {
      yearEl.value = v.year || ""; makeEl.value = v.make || ""; modelEl.value = v.model || "";
      if (v.size) setSize(v.size);
      if (makeEl.value && modelEl.value) { setManual(false); showPicked(); }
    }
  };
})();
