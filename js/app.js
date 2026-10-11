import { Engine3D } from './engine3d.js';

// tells the failsafe in <head> that the script booted (otherwise it un-hides the content after a few seconds)
window.__mlinskiReady = true;

gsap.registerPlugin(ScrollTrigger);

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'power3.out';

let lenis = null;
const navEl = document.getElementById('nav');
const navHeight = () => (navEl ? navEl.offsetHeight : 76);

/* ============ 01 · LENIS SMOOTH SCROLL ============ */
function initLenis() {
  if (REDUCED) return;
  lenis = new Lenis({ duration: 1.15, wheelMultiplier: 0.95, smoothWheel: true });
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.on('scroll', ScrollTrigger.update);

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      // re-read at click time, not bind time — some links (WhatsApp buttons) start as "#"
      // placeholders and get their real href swapped in later by initQuickContact()
      const href = a.getAttribute('href');
      if (!href || href.length < 2 || !href.startsWith('#')) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -(navHeight() + 6) });
    });
  });
}

/* ============ 02 · NAVIGATION (hairline on scroll, mobile menu, current section) ============ */
function initNavigation() {
  const burger = document.getElementById('navBurger');
  const menu = document.getElementById('navMenu');

  const onScroll = () => navEl.classList.toggle('nav--scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const setOpen = (open) => {
    navEl.classList.toggle('nav--open', open);
    burger?.setAttribute('aria-expanded', String(open));
    burger?.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
  };
  burger?.addEventListener('click', () => setOpen(!navEl.classList.contains('nav--open')));
  menu?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  // underline the menu entry of the section currently in view (several sections can belong to one entry)
  const links = new Map();
  menu?.querySelectorAll('a[href^="#"]').forEach((a) => links.set(a.getAttribute('href').slice(1), a));
  const owner = { hero: 'hero', services: 'services', diagnostics: 'diagnostics', ablauf: 'warum', warum: 'warum', testimonials: 'warum', faq: 'warum', termin: 'termin' };
  const active = new Map();
  const apply = () => links.forEach((el, id) => el.classList.toggle('is-current', (active.get(id) || 0) > 0));
  Object.entries(owner).forEach(([sectionId, linkId]) => {
    const section = document.getElementById(sectionId);
    if (!section || !links.has(linkId)) return;
    ScrollTrigger.create({
      trigger: section, start: 'top 55%', end: 'bottom 55%', refreshPriority: -1,
      onToggle: (self) => { active.set(linkId, (active.get(linkId) || 0) + (self.isActive ? 1 : -1)); apply(); },
    });
  });

  magnetize(document.querySelectorAll('.nav__cta, .hero__actions .btn--dark'));
}

function magnetize(elements) {
  if (REDUCED || !window.matchMedia('(hover:hover)').matches) return;
  elements.forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.12;
      const y = (e.clientY - r.top - r.height / 2) * 0.25;
      gsap.to(el, { x, y, duration: 0.3, ease: 'power2.out' });
    });
    el.addEventListener('mouseleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' }));
  });
}

/* ============ 03 · HERO (intro) ============ */
function initHero() {
  const intro = gsap.utils.toArray('[data-intro]');

  if (REDUCED) { gsap.set(intro, { clearProps: 'all' }); return; }

  gsap.fromTo(intro, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9, ease: EASE, stagger: 0.1, delay: 0.1 });

}

// "Jetzt geöffnet / Aktuell geschlossen" in the contact card — computed in Berlin time from the real opening hours
function initOpenStatus() {
  const box = document.getElementById('openStatus');
  const main = document.getElementById('openStatusMain');
  const sub = document.getElementById('openStatusSub');
  if (!box || !main || !sub) return;

  // Mon–Thu 08:00–17:00, Fri 08:00–13:00 (same as the contact card + JSON-LD)
  const HOURS = { 1: [8, 17], 2: [8, 17], 3: [8, 17], 4: [8, 17], 5: [8, 13] };
  const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const pad = (n) => String(n).padStart(2, '0');

  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
    const minutes = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
    if (day === undefined || Number.isNaN(minutes)) return;

    const today = HOURS[day];
    if (today && minutes >= today[0] * 60 && minutes < today[1] * 60) {
      box.classList.add('is-open');
      main.textContent = 'Jetzt geöffnet';
      sub.textContent = `· bis ${pad(today[1])}:00 Uhr`;
      return;
    }

    let label = null;
    let opens = null;
    if (today && minutes < today[0] * 60) { label = 'heute'; opens = today[0]; }
    else {
      for (let i = 1; i <= 7; i += 1) {
        const d = (day + i) % 7;
        if (HOURS[d]) { label = i === 1 ? 'morgen' : DAY_NAMES[d]; opens = HOURS[d][0]; break; }
      }
    }
    main.textContent = 'Aktuell geschlossen';
    if (label) sub.textContent = `· ${label} ab ${pad(opens)}:00 Uhr`;
  } catch { /* keep the static opening-hours text */ }
}

/* ============ 04 · COUNTERS ============ */
function initCounters() {
  const fmt = (n, f) => (f === 'de' ? Math.round(n).toLocaleString('de-DE') : String(Math.round(n)));
  gsap.utils.toArray('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const format = el.dataset.format;
    if (REDUCED) { el.textContent = fmt(target, format) + suffix; return; }
    el.textContent = '0' + suffix;
    ScrollTrigger.create({
      trigger: el, start: 'top 92%', once: true,
      onEnter: () => {
        const c = { v: 0 };
        gsap.to(c, { v: target, duration: 1.6, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(c.v, format) + suffix; } });
      },
    });
  });
}

/* ============ 05 · SCROLL REVEALS ============ */
function initReveals() {
  const items = gsap.utils.toArray('.reveal');
  if (!items.length) return;
  if (REDUCED) { gsap.set(items, { clearProps: 'all' }); return; }
  ScrollTrigger.batch(items, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => gsap.fromTo(batch, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.85, ease: EASE, stagger: 0.09, overwrite: true }),
  });
}

/* ============ 06 · SERVICES RAIL + "preselect service" links ============ */
function initRail() {
  const section = document.getElementById('services');
  const viewport = document.getElementById('railViewport');
  const track = document.getElementById('railTrack');
  const arrow = document.getElementById('railNext');
  const allBtn = document.getElementById('railAll');
  if (!viewport || !track) return;

  const step = () => {
    const card = track.querySelector('.svc');
    const gap = parseFloat(getComputedStyle(track).columnGap) || 20;
    return (card ? card.getBoundingClientRect().width : 320) + gap;
  };
  const atEnd = () => viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 4;
  const update = () => {
    if (!arrow) return;
    const flip = atEnd() && viewport.scrollWidth > viewport.clientWidth + 4;
    arrow.classList.toggle('is-prev', flip);
    arrow.setAttribute('aria-label', flip ? 'Zurück zu den ersten Leistungen' : 'Weitere Leistungen');
  };

  arrow?.addEventListener('click', () => {
    if (atEnd()) viewport.scrollTo({ left: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    else viewport.scrollBy({ left: step(), behavior: REDUCED ? 'auto' : 'smooth' });
  });
  viewport.addEventListener('scroll', update, { passive: true });
  viewport.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); viewport.scrollBy({ left: step(), behavior: 'smooth' }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); viewport.scrollBy({ left: -step(), behavior: 'smooth' }); }
  });
  window.addEventListener('resize', update);
  update();

  // "Alle ansehen" opens the rail into a grid of all services (and back)
  allBtn?.addEventListener('click', () => {
    const open = section.classList.toggle('is-all');
    allBtn.setAttribute('aria-expanded', String(open));
    allBtn.firstChild.textContent = open ? 'Weniger anzeigen ' : 'Alle ansehen ';
    viewport.scrollLeft = 0;
    // new height → every ScrollTrigger below has to be measured again
    requestAnimationFrame(() => ScrollTrigger.refresh());
  });

  // a click on a service card jumps to the form with that service already selected
  const select = document.getElementById('tfService');
  document.querySelectorAll('[data-service]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!select) return;
      const wanted = el.dataset.service;
      const opt = [...select.options].find((o) => o.textContent.trim() === wanted);
      if (opt) select.value = opt.value || opt.textContent;
    });
  });
}

/* ============ 07 · DIAGNOSTICS (dark card pinned while the 3D engine tours its 17 assemblies) ============ */
function initDiagnostics() {
  const card = document.getElementById('engineCard');
  const dark = document.querySelector('.diagnostics__dark');
  const info = document.querySelector('.engine-card__info');
  const stageEl = document.getElementById('engine3d');
  const leaders = gsap.utils.toArray('.leader');
  const stageCurrentEl = document.getElementById('stageCurrent');
  const stageNameEl = document.getElementById('stageName');
  const stageDots = gsap.utils.toArray('.diag__stage-dot');
  const stageLines = gsap.utils.toArray('.diag__stage-line i');

  const stages = [
    { name: 'MOTOR', copy: 'LEISTUNG — LEISTUNGSKONTROLLE' },
    { name: 'DIAGNOSE', copy: 'SENSORIK — ECHTZEITDATEN' },
    { name: 'SYSTEM', copy: 'SYSTEME — FEHLERSPEICHER' },
  ];

  const leaderEls = { leistung: leaders[0], sensorik: leaders[1], systeme: leaders[2] };

  /* ---- the "Bauteil" card: shows whichever assembly is active (scroll tour, click, ←/→, dots) ---- */
  const partInfo = document.getElementById('partInfo');
  const partIdx = document.getElementById('partInfoIdx');
  const partName = document.getElementById('partInfoName');
  const partDesc = document.getElementById('partInfoDesc');
  const partDots = document.getElementById('partInfoDots');
  const partPrev = document.getElementById('partPrev');
  const partNext = document.getElementById('partNext');
  const pad2 = (n) => String(n).padStart(2, '0');
  let dotEls = [];

  const onEnginePartSelect = (info2) => {
    partIdx.textContent = `Bauteil ${pad2(info2.index)} / ${info2.total}`;
    partName.textContent = info2.de;
    partDesc.textContent = info2.desc;
    partInfo.classList.add('is-active');
    dotEls.forEach((d, i) => {
      const on = i === info2.index - 1;
      d.classList.toggle('is-active', on);
      if (on) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
    if (!REDUCED) gsap.fromTo([partName, partDesc], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.07, overwrite: true });
  };

  const onEngineReady = (groups) => {
    partDots.textContent = '';
    dotEls = groups.map((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'part-dot';
      b.title = g.de;
      b.setAttribute('aria-label', `Bauteil ${g.index} von ${g.total}: ${g.de}`);
      b.addEventListener('click', () => engine3D?.selectIndex(i));
      partDots.appendChild(b);
      return b;
    });
    partInfo.classList.add('is-ready');
    if (!partInfo.classList.contains('is-active')) partIdx.textContent = `${groups.length} Bauteile`;
  };

  const engine3D = stageEl
    ? new Engine3D(stageEl, { reducedMotion: REDUCED, leaderEls, onSelect: onEnginePartSelect, onReady: onEngineReady })
    : null;
  partPrev?.addEventListener('click', () => engine3D?.selectRelative(-1));
  partNext?.addEventListener('click', () => engine3D?.selectRelative(1));

  // the container can still report zero size at construction time (fonts/layout not
  // settled yet), which would otherwise leave the camera stuck with a broken aspect ratio
  if (engine3D) {
    requestAnimationFrame(() => engine3D.resize());
    window.addEventListener('load', () => engine3D.resize());
  }

  // On the stacked (phone) layout the info card would sit a full screen above the engine,
  // out of sight while tapping parts — keep it directly underneath the engine there.
  const stacked = window.matchMedia('(max-width: 899px)');
  const placePartInfo = () => {
    if (!partInfo) return;
    if (stacked.matches) { dark.appendChild(partInfo); partInfo.classList.add('part-info--on-dark'); }
    else { info.appendChild(partInfo); partInfo.classList.remove('part-info--on-dark'); }
  };
  placePartInfo();
  // the pinned (desktop) vs stacked (phone) behaviour is decided once at load — if the window
  // crosses the breakpoint (rotated tablet, resized browser), start over in the right mode
  stacked.addEventListener?.('change', () => window.location.reload());

  function typeWriter(el, text, charDelay) {
    el.textContent = '';
    const tl = gsap.timeline();
    text.split('').forEach((ch) => tl.call(() => { el.textContent += ch; }, null, `+=${charDelay}`));
    return tl;
  }

  function setStage(i) {
    stageCurrentEl.textContent = String(i + 1).padStart(2, '0');
    stageNameEl.textContent = stages[i].name;
    stageDots.forEach((d, di) => d.classList.toggle('is-active', di <= i));
  }

  if (REDUCED) {
    leaders.forEach((leader) => {
      gsap.set(leader, { opacity: 1 });
      gsap.set(leader.querySelector('.leader__line'), { width: 42 });
    });
    setStage(2);
    stageLines.forEach((l) => gsap.set(l, { width: '100%' }));
    return;
  }

  const leaderTimelines = [];
  function revealLeader(leader, i) {
    const line = leader.querySelector('.leader__line');
    const label = leader.querySelector('.leader__label em');
    const originalCopy = stages[i].copy.split(' — ')[1];
    leaderTimelines[i]?.kill();
    leaderTimelines[i] = gsap.timeline()
      .to(leader, { opacity: 1, duration: 0.3 })
      .fromTo(line, { width: 0 }, { width: 42, duration: 0.35, ease: 'power2.out' }, '<')
      .add(typeWriter(label, originalCopy, 0.03));
  }
  function hideLeader(leader, i) {
    leaderTimelines[i]?.kill();
    gsap.set(leader, { opacity: 0 });
    gsap.set(leader.querySelector('.leader__line'), { width: 0 });
    leader.querySelector('.leader__label em').textContent = '';
  }

  // Below the tablet breakpoint the card stacks (see CSS) and its height is no longer tied to the viewport —
  // pinning it would hold it far longer than useful. Per the brief's own mobile guidance (drop long pinned
  // sequences), skip the pin there: the three stage callouts appear as plain scroll-ins and the parts are
  // browsed with the ←/→ buttons, the dots or by tapping.
  const isCompact = stacked.matches;

  if (isCompact) {
    leaders.forEach((leader, i) => {
      ScrollTrigger.create({
        trigger: leader, start: 'top 80%', once: true,
        onEnter: () => { setStage(i); revealLeader(leader, i); },
      });
    });
    return;
  }

  // callouts appear one third of the way apart and retract again when scrolling back
  const leaderShown = leaders.map(() => false);
  ScrollTrigger.create({
    trigger: card,
    start: () => `top ${navHeight() + 12}px`,
    end: '+=520%',
    pin: true,
    scrub: 0.6,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      const p = self.progress;
      engine3D?.setProgress(p);

      const stageIdx = Math.min(2, Math.floor(p * 3));
      if (dark.dataset.stage !== String(stageIdx)) {
        dark.dataset.stage = String(stageIdx);
        setStage(stageIdx);
      }
      gsap.set(stageLines[0], { width: `${gsap.utils.clamp(0, 100, (p * 3 - 0) * 100)}%` });
      gsap.set(stageLines[1], { width: `${gsap.utils.clamp(0, 100, (p * 3 - 1) * 100)}%` });

      leaders.forEach((leader, i) => {
        const shouldShow = p >= 0.03 + i * 0.32;
        if (shouldShow === leaderShown[i]) return;
        leaderShown[i] = shouldShow;
        if (shouldShow) revealLeader(leader, i); else hideLeader(leader, i);
      });
    },
  });
}

/* ============ 08 · WHATSAPP (hidden until a real number is set) ============ */
// WhatsApp is OFF until a real number is entered here: the workshop's landline (0431-678578) cannot receive
// WhatsApp messages, so a button pointing at it would be a dead end for visitors.
// Format: country code + number, digits only, no leading 0 or + (e.g. '491701234567').
const WHATSAPP_NUMBER = '';

function initQuickContact() {
  if (!WHATSAPP_NUMBER) { document.documentElement.classList.add('no-whatsapp'); return; }
  const waText = encodeURIComponent('Hallo, ich möchte gerne einen Termin bei Autodienst Mlinski anfragen.');
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`;
  document.getElementById('waFloatBtn')?.setAttribute('href', waUrl);
  document.getElementById('waMobileBtn')?.setAttribute('href', waUrl);
}

/* ============ 09 · TERMIN-ANFRAGE (no backend: opens the visitor's mail app / WhatsApp, prefilled) ============ */
const REQUEST_EMAIL = 'autodienst-kiel@t-online.de';

function initTerminForm() {
  const form = document.getElementById('terminForm');
  if (!form) return;
  const note = document.getElementById('tfNote');
  if (WHATSAPP_NUMBER) note.textContent = 'Beim Absenden öffnet sich Ihr E-Mail-Programm (bzw. WhatsApp) mit der vorbereiteten Anfrage.';
  const defaultNote = note.textContent;

  const value = (id) => (document.getElementById(id)?.value || '').trim();

  function buildMessage() {
    return [
      'Hallo Autodienst Mlinski,',
      '',
      'ich möchte gerne einen Termin anfragen.',
      '',
      `Anliegen: ${value('tfService')}`,
      value('tfMsg') ? `Nachricht: ${value('tfMsg')}` : null,
      '',
      `Name: ${value('tfName')}`,
      `Telefon: ${value('tfPhone')}`,
    ].filter((line) => line !== null).join('\n');
  }

  function validate() {
    form.classList.add('was-validated');
    if (form.checkValidity()) { note.textContent = defaultNote; note.className = 'contact__note'; return true; }
    form.reportValidity();
    note.textContent = 'Bitte füllen Sie Name und Telefon aus und bestätigen Sie die Datenschutzerklärung.';
    note.className = 'contact__note is-error';
    return false;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) return;
    const subject = `Terminanfrage: ${value('tfService')}`;
    window.location.href = `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildMessage())}`;
    note.textContent = 'Ihr E-Mail-Programm wurde geöffnet – bitte dort noch auf „Senden“ klicken. Falls sich nichts öffnet, rufen Sie uns einfach an: 0431 – 678578.';
    note.className = 'contact__note is-ok';
  });

  document.getElementById('tfWhatsApp').addEventListener('click', () => {
    if (!validate()) return;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildMessage())}`, '_blank', 'noopener');
    note.textContent = 'WhatsApp wurde geöffnet – bitte dort noch auf „Senden“ tippen.';
    note.className = 'contact__note is-ok';
  });
}

/* ============ 10 · MISC ============ */
function initMisc() {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => ScrollTrigger.refresh(), 200);
  });
  window.addEventListener('load', () => ScrollTrigger.refresh());
}

/* ============ BOOT ============ */
// order matters: the pin of the engine card adds scroll length, so every trigger below it is created afterwards
initLenis();
initHero();
initOpenStatus();
initCounters();
initRail();
initDiagnostics();
initNavigation();
initReveals();
initQuickContact();
initTerminForm();
initMisc();
