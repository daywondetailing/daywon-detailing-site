/* Daywon Detailing: renders packages and add-ons from window.SITE_DATA.
   Every render function does nothing when its container is missing. */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var PHONE_HREF = 'tel:+12408130689';

  function data() {
    var d = window.SITE_DATA || {};
    return { services: d.services || [], addOns: d.addOns || [] };
  }

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(id, cls) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function applyMode(root) {
    if (window.SITE && typeof window.SITE.applyBookingMode === 'function') {
      window.SITE.applyBookingMode(root);
    }
  }

  function quoteHref(id) { return 'quote.html?service=' + encodeURIComponent(id); }

  function getService(id) {
    var list = data().services;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function addOnsFor(id) {
    var s = getService(id);
    if (!s) return [];
    var ids = s.addOnIds || [];
    return data().addOns.filter(function (a) { return ids.indexOf(a.id) !== -1; });
  }

  function serviceOptions() {
    return data().services.map(function (s) {
      return { id: s.id, name: s.name, duration: s.duration || null, summary: s.summary || '', addOnIds: (s.addOnIds || []).slice(), startingAt: s.startingAt || null };
    });
  }

  /* Returns a Node: a text node with the duration, or the inline placeholder span. */
  function renderDuration(service) {
    if (service && service.duration) return document.createTextNode(service.duration);
    var p = el('span', 'placeholder placeholder--inline', 'Time confirmed with your quote');
    p.setAttribute('data-placeholder', 'duration-' + (service ? service.id : ''));
    return p;
  }

  function names(list) { return list.map(function (a) { return a.name; }); }

  /* "Starting at $75" (long) or "From $75" (short); empty when no price is set. */
  function priceText(service, short) {
    if (!service || !service.startingAt) return '';
    return (short ? 'From $' : 'Starting at $') + service.startingAt;
  }

  /* ---------- home: quote starter ---------- */
  function renderQuoteStarter(container) {
    if (!container) return;
    clear(container);
    var isList = /^(UL|OL)$/.test(container.tagName);
    var services = data().services;
    var root = document.getElementById('quote-starter') || container;
    var cta = root.querySelector('[data-cta-service]');

    function sync(id) {
      if (!cta) return;
      cta.setAttribute('data-cta-service', id);
      cta.setAttribute('href', quoteHref(id));
      applyMode(root);
    }

    services.forEach(function (s, i) {
      var label = el('label', 'quote-starter__option');
      var input = el('input');
      input.type = 'radio';
      input.name = 'starter-service';
      input.value = s.id;
      if (i === 0) input.checked = true;
      input.addEventListener('change', function () { if (input.checked) sync(s.id); });
      var name = el('span', 'quote-starter__name', s.name);
      var dur = el('span', 'quote-starter__duration', priceText(s));
      if (!s.startingAt) dur.appendChild(renderDuration(s));
      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(dur);
      if (isList) {
        var li = el('li');
        li.appendChild(label);
        container.appendChild(li);
      } else {
        container.appendChild(label);
      }
    });
    if (services.length) sync(services[0].id);
  }

  /* ---------- home: service rows ---------- */
  function renderServiceRows(container) {
    if (!container) return;
    clear(container);
    var isList = container.tagName === 'UL';
    data().services.forEach(function (s) {
      var row = el(isList ? 'li' : 'div', 'service-rows__row');
      var head = el('div', 'service-rows__head');
      head.appendChild(el('h3', 'service-rows__name', s.name));
      var dur = el('span', 'service-rows__duration');
      dur.appendChild(renderDuration(s));
      head.appendChild(dur);
      row.appendChild(head);
      row.appendChild(el('p', 'service-rows__summary', s.summary));
      var actions = el('div', 'service-rows__actions');
      var inc = el('a', 'link-arrow', "What's included");
      inc.href = 'services.html#' + s.id;
      inc.appendChild(icon('i-arrow-right'));
      actions.appendChild(inc);
      var cta = el('a', 'btn btn--primary', 'Get a quote');
      cta.href = quoteHref(s.id);
      cta.setAttribute('data-cta-service', s.id);
      actions.appendChild(cta);
      row.appendChild(actions);
      container.appendChild(row);
    });

    /* add-on line + links */
    var target = document.getElementById('service-addons');
    if (!target) {
      var parent = container.parentNode;
      if (!parent) return;
      var old = parent.querySelector('.service-rows__addons[data-generated]');
      if (old) old.parentNode.removeChild(old);
      target = el('div', 'service-rows__addons');
      target.setAttribute('data-generated', '');
      parent.insertBefore(target, container.nextSibling);
    } else {
      clear(target);
    }
    var addOns = data().addOns;
    if (addOns.length) {
      var line = el('p', null, 'Add-ons: ');
      addOns.forEach(function (a, i) {
        line.appendChild(document.createTextNode(a.name + ' '));
        var price = el('span', null, '$' + a.price);
        price.setAttribute('data-addon-price', '');
        line.appendChild(price);
        line.appendChild(document.createTextNode(i < addOns.length - 1 ? ', ' : '.'));
      });
      target.appendChild(line);
    }
    var links = el('p', 'actions');
    var see = el('a', 'link-arrow', 'See add-ons');
    see.href = 'services.html#add-ons';
    see.appendChild(icon('i-arrow-right'));
    var cmp = el('a', 'link-arrow', 'Compare every package');
    cmp.href = 'services.html';
    cmp.appendChild(icon('i-arrow-right'));
    links.appendChild(see);
    links.appendChild(cmp);
    target.appendChild(links);
    applyMode(container.parentNode || container);
  }

  /* ---------- home: compare chart ---------- */
  function renderCompare(container) {
    if (!container) return;
    var d = window.SITE_DATA || {};
    var rows = d.compare || [];
    var services = data().services;
    if (!rows.length || !services.length) return;
    clear(container);
    var addOnPrice = {};
    data().addOns.forEach(function (a) { addOnPrice[a.id] = a.price; });
    var featured = 'deep-restoration';

    var table = el('table', 'compare__table');
    var cap = el('caption', 'visually-hidden', 'What each package includes, with starting prices');
    table.appendChild(cap);

    var thead = el('thead');
    var hr = el('tr');
    var corner = el('th', 'compare__corner');
    corner.scope = 'col';
    corner.appendChild(el('span', 'caps', 'Package'));
    hr.appendChild(corner);
    services.forEach(function (s) {
      var th = el('th', 'compare__pkg' + (s.id === featured ? ' is-featured' : ''));
      th.scope = 'col';
      if (s.id === featured) th.appendChild(el('span', 'compare__badge', 'Most complete'));
      th.appendChild(el('span', 'compare__name', s.name));
      if (s.startingAt) {
        var pr = el('span', 'compare__price');
        pr.appendChild(el('span', 'compare__price-label', 'Starting at'));
        pr.appendChild(el('span', 'compare__price-value', '$' + s.startingAt));
        th.appendChild(pr);
      }
      if (s.duration) th.appendChild(el('span', 'compare__time', 'About ' + s.duration));
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      if (r.group) {
        tr.className = 'compare__group';
        var g = el('th', null, r.group);
        g.scope = 'colgroup';
        g.colSpan = services.length + 1;
        tr.appendChild(g);
        tbody.appendChild(tr);
        return;
      }
      var label = el('th', 'compare__label', r.label);
      label.scope = 'row';
      tr.appendChild(label);
      services.forEach(function (s) {
        var v = r[s.id];
        var td = el('td', s.id === featured ? 'is-featured' : null);
        if (v === 'addon') {
          td.className += ' compare__addon';
          var price = r.addOn && addOnPrice[r.addOn] != null ? '+$' + addOnPrice[r.addOn] : '';
          var span = el('span', null, price ? price + ' add-on' : 'Add-on');
          if (price) span.setAttribute('data-addon-price', '');
          td.appendChild(span);
        } else if (v) {
          td.appendChild(icon('i-check', 'compare__yes'));
          td.appendChild(el('span', 'visually-hidden', 'Included'));
          if (typeof v === 'string') td.appendChild(el('span', 'compare__note', v));
        } else {
          td.appendChild(el('span', 'compare__no', '–'));
          td.lastChild.setAttribute('aria-hidden', 'true');
          td.appendChild(el('span', 'visually-hidden', 'Not included'));
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var tfoot = el('tfoot');
    var fr = el('tr');
    var fh = el('th');
    fh.scope = 'row';
    var more = el('a', 'link-arrow', 'Full details');
    more.href = 'services.html';
    more.appendChild(icon('i-arrow-right'));
    fh.appendChild(more);
    fr.appendChild(fh);
    services.forEach(function (s) {
      var td = el('td', s.id === featured ? 'is-featured' : null);
      var cta = el('a', 'btn ' + (s.id === featured ? 'btn--primary' : 'btn--ghost') + ' compare__cta', 'Get a quote');
      cta.href = quoteHref(s.id);
      cta.setAttribute('data-cta-service', s.id);
      cta.setAttribute('aria-label', 'Get a quote for ' + s.name);
      td.appendChild(cta);
      fr.appendChild(td);
    });
    tfoot.appendChild(fr);
    table.appendChild(tfoot);

    container.appendChild(table);
    applyMode(container);
  }

  /* ---------- home: FAQ durations ---------- */
  function minutesOf(str) {
    var m = /(\d+)/.exec(str || '');
    return m ? parseInt(m[1], 10) : null;
  }

  function renderFaqDurations(container) {
    if (!container) return;
    clear(container);
    var isList = /^(UL|OL)$/.test(container.tagName);
    function add(text) {
      var n = el(isList ? 'li' : 'p', null, text);
      container.appendChild(n);
    }
    data().services.forEach(function (s) {
      add(s.name + ': ' + (s.duration ? 'about ' + s.duration : 'time confirmed with your quote'));
    });
    var mins = data().addOns.map(function (a) { return minutesOf(a.extraTime); })
      .filter(function (m) { return m != null; });
    if (mins.length) {
      var lo = Math.min.apply(null, mins), hi = Math.max.apply(null, mins);
      add('Extraction add-ons add ' + (lo === hi ? lo : lo + ' to ' + hi) + ' minutes.');
    }
  }

  /* ---------- services: package nav ---------- */
  function renderPackageNav(container) {
    if (!container) return;
    var list = container;
    if (container.tagName !== 'UL' && container.tagName !== 'OL') {
      list = container.querySelector('ul');
      if (!list) {
        list = el('ul', 'package-nav__list');
        container.appendChild(list);
      }
    }
    clear(list);
    function chip(id, text) {
      var li = el('li');
      var a = el('a', 'chip', text);
      a.href = '#' + id;
      a.addEventListener('click', function () { setCurrent(list, id); });
      li.appendChild(a);
      list.appendChild(li);
    }
    data().services.forEach(function (s) { chip(s.id, s.name); });
    chip('add-ons', 'Add-ons');
    list.setAttribute('data-spy', '');
  }

  function setCurrent(list, id) {
    var links = list.querySelectorAll('a.chip');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute('href') === '#' + id) {
        a.setAttribute('aria-current', 'true');
        /* keep the chip visible in the horizontal scroller without moving the page */
        var r = a.getBoundingClientRect(), lr = list.getBoundingClientRect();
        if (r.left < lr.left) list.scrollLeft -= (lr.left - r.left + 16);
        else if (r.right > lr.right) list.scrollLeft += (r.right - lr.right + 16);
      } else {
        a.removeAttribute('aria-current');
      }
    }
  }

  function initScrollSpy() {
    var list = document.querySelector('#package-nav[data-spy], #package-nav [data-spy]');
    if (!list || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setCurrent(list, e.target.id);
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
    var links = list.querySelectorAll('a.chip');
    for (var i = 0; i < links.length; i++) {
      var t = document.getElementById(links[i].getAttribute('href').slice(1));
      if (t) io.observe(t);
    }
  }

  /* ---------- services: job sheets ---------- */
  function checklist(items, counter) {
    var ul = el('ul', 'checklist');
    items.forEach(function (text) {
      var li = el('li');
      li.style.setProperty('--i', String(counter.n++));
      li.appendChild(icon('i-check'));
      li.appendChild(el('span', null, text));
      ul.appendChild(li);
    });
    return ul;
  }

  function renderJobSheets(container) {
    if (!container) return;
    clear(container);
    var addOns = data().addOns;
    data().services.forEach(function (s, idx) {
      var sec = el('section', 'job-sheet ' + (idx % 2 === 0 ? 'band--dark' : 'band--raised'));
      sec.id = s.id;
      sec.setAttribute('aria-labelledby', s.id + '-title');
      var wrap = el('div', 'container');

      var head = el('header', 'job-sheet__head');
      var h2 = el('h2', 'job-sheet__title', s.name);
      h2.id = s.id + '-title';
      head.appendChild(h2);
      var dur = el('p', 'job-sheet__duration caps');
      dur.appendChild(icon('i-clock'));
      var durText = el('span');
      durText.appendChild(renderDuration(s));
      dur.appendChild(durText);
      head.appendChild(dur);
      if (s.startingAt) {
        var price = el('p', 'job-sheet__price');
        price.appendChild(el('span', 'job-sheet__price-label', 'Starting at'));
        price.appendChild(el('span', 'job-sheet__price-value', '$' + s.startingAt));
        head.appendChild(price);
      }
      head.appendChild(el('p', 'job-sheet__summary', s.summary));
      wrap.appendChild(head);

      var inter = s.interior || [], exter = s.exterior || [];
      var cols = [];
      if (inter.length) cols.push({ title: 'Interior', items: inter });
      if (exter.length) cols.push({ title: 'Exterior', items: exter });
      if (cols.length) {
        var grid = el('div', 'job-sheet__cols');
        var counter = { n: 0 };
        cols.forEach(function (c) {
          var col = el('div', 'job-sheet__col' + (cols.length === 1 ? ' job-sheet__col--wide' : ''));
          col.appendChild(el('h3', 'job-sheet__heading', c.title));
          col.appendChild(checklist(c.items, counter));
          grid.appendChild(col);
        });
        wrap.appendChild(grid);
      }

      if (s.bestFor && s.bestFor.length) {
        var bf = el('div');
        bf.appendChild(el('h3', 'job-sheet__heading', 'Best for'));
        var ul = el('ul', 'job-sheet__bestfor');
        s.bestFor.forEach(function (t) { ul.appendChild(el('li', null, t)); });
        bf.appendChild(ul);
        wrap.appendChild(bf);
      }

      if (s.note) wrap.appendChild(el('p', 'job-sheet__note', s.note));

      if (s.importantNote) {
        var good = el('div', 'panel job-sheet__good');
        good.appendChild(el('h3', null, 'Good to know'));
        good.appendChild(el('p', null, s.importantNote));
        wrap.appendChild(good);
      }

      var ids = s.addOnIds || [];
      if (ids.length) {
        var avail = addOns.filter(function (a) { return ids.indexOf(a.id) !== -1; });
        wrap.appendChild(el('p', 'job-sheet__addons', 'Available add-ons: ' + names(avail).join(', ') + '.'));
      } else if (s.id === 'deep-restoration') {
        wrap.appendChild(el('p', 'job-sheet__addons', 'Extraction, tire shine and spray wax are already included.'));
      }

      var actions = el('div', 'job-sheet__actions');
      var cta = el('a', 'btn btn--primary', 'Get a quote for this package');
      cta.href = quoteHref(s.id);
      cta.setAttribute('data-cta-service', s.id);
      actions.appendChild(cta);
      var tel = el('a', 'btn btn--ghost');
      tel.href = PHONE_HREF;
      tel.setAttribute('data-contact-href', 'tel');
      tel.appendChild(icon('i-phone'));
      tel.appendChild(document.createTextNode('Questions? Call or text'));
      actions.appendChild(tel);
      wrap.appendChild(actions);

      sec.appendChild(wrap);
      container.appendChild(sec);
    });
    applyMode(container);
    initDrawIn(container);
  }

  /* Draw-in: animate each job sheet's check marks the first time it enters view. */
  function initDrawIn(container) {
    if (!document.documentElement.classList.contains('js-motion') || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-animating');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    var sheets = container.querySelectorAll('.job-sheet');
    for (var i = 0; i < sheets.length; i++) io.observe(sheets[i]);
  }

  /* ---------- services: add-on table ---------- */
  function renderAddOnTable(container) {
    if (!container) return;
    var table;
    if (container.tagName === 'TABLE') {
      table = container;
      clear(table);
      table.classList.add('addon-table');
    } else {
      clear(container);
      table = el('table', 'addon-table');
      container.appendChild(table);
    }
    table.appendChild(el('caption', null, 'Add-ons and extra time'));
    var thead = el('thead');
    var hr = el('tr');
    ['Add-on', 'Price', 'Extra time', 'Available with'].forEach(function (t) {
      var th = el('th', null, t);
      th.scope = 'col';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el('tbody');
    var services = data().services;
    data().addOns.forEach(function (a) {
      var tr = el('tr');
      var th = el('th', null, a.name);
      th.scope = 'row';
      tr.appendChild(th);

      var tdPrice = el('td', 'addon-table__price', '$' + a.price);
      tdPrice.setAttribute('data-label', 'Price');
      tdPrice.setAttribute('data-addon-price', '');
      tr.appendChild(tdPrice);

      var tdTime = el('td');
      tdTime.setAttribute('data-label', 'Extra time');
      if (a.extraTime) {
        tdTime.textContent = a.extraTime;
      } else {
        tdTime.textContent = 'None';
      }
      tr.appendChild(tdTime);

      var tdWith = el('td');
      tdWith.setAttribute('data-label', 'Available with');
      var withNames = services.filter(function (s) { return (s.addOnIds || []).indexOf(a.id) !== -1; })
        .map(function (s) { return s.name; });
      tdWith.textContent = withNames.join(', ');
      tr.appendChild(tdWith);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  /* ---------- wiring ---------- */
  window.SITE_SERVICES = {
    serviceOptions: serviceOptions,
    getService: getService,
    addOnsFor: addOnsFor,
    renderDuration: renderDuration,
    priceText: priceText
  };

  window.SITE_RENDER = {
    renderQuoteStarter: renderQuoteStarter,
    renderServiceRows: renderServiceRows,
    renderFaqDurations: renderFaqDurations,
    renderPackageNav: renderPackageNav,
    renderJobSheets: renderJobSheets,
    renderAddOnTable: renderAddOnTable
  };

  function init() {
    var $ = function (id) { return document.getElementById(id); };
    renderQuoteStarter($('quote-starter-list'));
    renderServiceRows($('service-list'));
    renderCompare($('compare-table'));
    renderFaqDurations($('faq-durations'));
    renderPackageNav($('package-nav'));
    renderJobSheets($('packages'));
    renderAddOnTable($('add-on-table'));
    initScrollSpy();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
