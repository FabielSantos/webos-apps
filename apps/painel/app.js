/* Painel — living-room dashboard for webOS TV (Chromium 68: no ?. / ?? / Array.flat).
 *
 * Configuration arrives as launch parameters and is saved in localStorage:
 *   ares-launch -d tvsala com.fvsant.painel -p '{"ical":"https://calendar.google.com/calendar/ical/.../basic.ics"}'
 *   {"ical": "url" | ["url", ...]}   Google Calendar secret iCal address(es)
 *   {"holidays": false}               hide the Brazilian holidays calendar
 *   {"city": "Toronto", "lat": 43.7, "lon": -79.4}   fixed weather location (default: by IP)
 *   {"reset": true}                   forget everything
 */
(function () {
  'use strict';

  var STORE = 'painel.config.v1';
  var HOLIDAYS_ICS = 'https://calendar.google.com/calendar/ical/pt-br.brazilian%23holiday%40group.v.calendar.google.com/public/basic.ics';
  var PHOTO_MS = 60 * 1000;
  var WEATHER_MS = 15 * 60 * 1000;
  var CALENDAR_MS = 15 * 60 * 1000;
  var PHOTOS_MS = 6 * 60 * 60 * 1000;
  var AGENDA_DAYS = 7;
  var AGENDA_MAX = 9;
  var WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var KEY = { LEFT: 37, RIGHT: 39, ENTER: 13, BACK: 461, ESC: 27 };

  var $ = function (id) { return document.getElementById(id); };
  var config = loadConfig();
  var photos = [], photoIndex = -1, photoLayer = 0, photoTimer = null;
  var agendaVisible = true;

  // ---------- config ----------
  function loadConfig() {
    try { var c = JSON.parse(localStorage.getItem(STORE)); if (c) return c; } catch (e) { /* ignore */ }
    return { icals: [], holidays: true, place: null };
  }
  function saveConfig() { try { localStorage.setItem(STORE, JSON.stringify(config)); } catch (e) { /* ignore */ } }

  function applyParams(p) {
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = {}; } }
    if (!p || typeof p !== 'object') return;
    var changed = [];
    if (p.reset) { config = { icals: [], holidays: true, place: null }; changed.push('configuração apagada'); }
    if (p.ical) { config.icals = [].concat(p.ical).filter(function (u) { return /^https?:\/\//.test(u); }); changed.push('agenda: ' + config.icals.length + ' calendário(s)'); }
    if (p.holidays !== undefined) { config.holidays = !!p.holidays; changed.push('feriados ' + (config.holidays ? 'ligados' : 'desligados')); }
    if (p.lat !== undefined && p.lon !== undefined) {
      config.place = { name: p.city || '', lat: +p.lat, lon: +p.lon };
      changed.push('clima: ' + (p.city || p.lat + ',' + p.lon));
    }
    if (changed.length) { saveConfig(); toast('Configuração salva — ' + changed.join(' · ')); refreshAll(); }
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.className = 'toast hidden'; }, 6000);
  }

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return ('0' + n).slice(-2); }
  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  function get(url, asText) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asText ? r.text() : r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }

  // ---------- clock ----------
  function tick() {
    var d = new Date();
    $('time').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('date').textContent = WEEKDAYS_LONG[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
  }

  // ---------- photos (Bing photo of the day archive) ----------
  function loadPhotos() {
    var base = 'https://www.bing.com/HPImageArchive.aspx?format=js&mkt=pt-BR&n=8&idx=';
    return Promise.all([get(base + '0'), get(base + '7')]).then(function (rs) {
      var seen = {}, list = [];
      rs.forEach(function (r) {
        (r.images || []).forEach(function (im) {
          if (seen[im.url]) return;
          seen[im.url] = true;
          list.push({ url: 'https://www.bing.com' + im.url, title: im.title || '', credit: im.copyright || '' });
        });
      });
      if (list.length) { photos = list; if (photoIndex < 0) showPhoto(0); }
    }).catch(function (e) { console.warn('photos', e); });
  }

  function showPhoto(i) {
    if (!photos.length) return;
    photoIndex = (i + photos.length) % photos.length;
    var p = photos[photoIndex];
    var img = new Image();
    img.onload = function () {
      var next = photoLayer === 0 ? $('bg-b') : $('bg-a');
      var prev = photoLayer === 0 ? $('bg-a') : $('bg-b');
      next.style.backgroundImage = 'url("' + p.url + '")';
      next.className = 'bg show';
      prev.className = 'bg';
      photoLayer = 1 - photoLayer;
      $('caption').innerHTML = (p.title ? '<b>' + esc(p.title) + '</b>' : '') + esc(p.credit);
    };
    img.src = p.url;
    clearTimeout(photoTimer);
    photoTimer = setTimeout(function () { showPhoto(photoIndex + 1); }, PHOTO_MS);
  }

  // ---------- weather (Open-Meteo) ----------
  function describe(code) {
    if (code === 0) return ['Céu limpo', 'clear'];
    if (code === 1) return ['Predominantemente limpo', 'partly'];
    if (code === 2) return ['Parcialmente nublado', 'partly'];
    if (code === 3) return ['Nublado', 'cloud'];
    if (code === 45 || code === 48) return ['Nevoeiro', 'fog'];
    if (code >= 51 && code <= 57) return ['Garoa', 'rain'];
    if (code >= 61 && code <= 67) return [code === 65 ? 'Chuva forte' : code === 61 ? 'Chuva fraca' : 'Chuva', 'rain'];
    if (code >= 71 && code <= 77) return ['Neve', 'snow'];
    if (code >= 80 && code <= 82) return ['Pancadas de chuva', 'rain'];
    if (code === 85 || code === 86) return ['Pancadas de neve', 'snow'];
    if (code >= 95) return [code === 95 ? 'Trovoada' : 'Trovoada com granizo', 'storm'];
    return ['—', 'cloud'];
  }
  var SUN = '<circle cx="26" cy="26" r="10" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round">' +
    '<path d="M26 6v5M26 41v5M6 26h5M41 26h5M12 12l3.5 3.5M36.5 36.5L40 40M12 40l3.5-3.5M36.5 15.5L40 12"/></g>';
  var MOON = '<path d="M34 10a16 16 0 1 0 12 26A13 13 0 0 1 34 10z" fill="#e2e8f0"/>';
  function CLOUD(fill) { return '<path d="M20 52h26a11 11 0 0 0 0-22 15 15 0 0 0-29-2A12 12 0 0 0 20 52z" fill="' + fill + '"/>'; }
  function icon(kind, isDay) {
    var sky = isDay === 0 ? MOON : SUN, body;
    switch (kind) {
      case 'clear': body = '<g transform="translate(6 6)">' + sky + '</g>'; break;
      case 'partly': body = sky + '<g transform="translate(6 4)">' + CLOUD('#f1f5f9') + '</g>'; break;
      case 'cloud': body = '<g transform="translate(2 -4)">' + CLOUD('#94a3b8') + '</g><g transform="translate(6 2)">' + CLOUD('#f1f5f9') + '</g>'; break;
      case 'fog': body = '<g transform="translate(2 -8)">' + CLOUD('#cbd5e1') + '</g><g stroke="#cbd5e1" stroke-width="3.5" stroke-linecap="round"><path d="M12 50h40M18 57h30"/></g>'; break;
      case 'rain': body = '<g transform="translate(2 -10)">' + CLOUD('#e2e8f0') + '</g><g stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round"><path d="M22 48l-3 8M33 48l-3 8M44 48l-3 8"/></g>'; break;
      case 'snow': body = '<g transform="translate(2 -10)">' + CLOUD('#f1f5f9') + '</g><g fill="#fff"><circle cx="21" cy="52" r="3"/><circle cx="32" cy="57" r="3"/><circle cx="43" cy="52" r="3"/></g>'; break;
      case 'storm': body = '<g transform="translate(2 -10)">' + CLOUD('#94a3b8') + '</g><path d="M33 44l-8 11h7l-4 9 11-13h-7l4-7z" fill="#fbbf24"/>'; break;
      default: body = CLOUD('#94a3b8');
    }
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
  }

  function resolvePlace() {
    if (config.place) return Promise.resolve(config.place);
    return get('https://get.geojs.io/v1/ip/geo.json').then(function (d) {
      return { name: d.city || '', lat: parseFloat(d.latitude), lon: parseFloat(d.longitude) };
    });
  }

  function loadWeather() {
    return resolvePlace().then(function (p) {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon +
        '&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4';
      return get(url).then(function (d) { renderWeather(p, d); });
    }).catch(function (e) { console.warn('weather', e); });
  }

  function renderWeather(p, d) {
    var now = describe(d.current.weather_code);
    var html = '<div class="row"><div class="big-icon">' + icon(now[1], d.current.is_day) + '</div>' +
      '<div class="temp">' + Math.round(d.current.temperature_2m) + '°</div></div>' +
      '<div class="cond">' + now[0] + ' · ' + Math.round(d.daily.temperature_2m_max[0]) + '° / ' + Math.round(d.daily.temperature_2m_min[0]) + '°</div>' +
      (p.name ? '<div class="city">' + esc(p.name) + '</div>' : '') + '<div class="days">';
    for (var i = 1; i < d.daily.time.length; i++) {
      var dt = d.daily.time[i].split('-');
      var wd = WEEKDAYS[new Date(+dt[0], +dt[1] - 1, +dt[2]).getDay()];
      html += '<div class="day"><div class="d">' + (i === 1 ? 'Amanhã' : wd) + '</div>' + icon(describe(d.daily.weather_code[i])[1], 1) +
        '<div class="t">' + Math.round(d.daily.temperature_2m_max[i]) + '°<span>' + Math.round(d.daily.temperature_2m_min[i]) + '°</span></div></div>';
    }
    $('weather').innerHTML = html + '</div>';
  }

  // ---------- calendar (iCal via ical.js, with recurrence expansion) ----------
  var calendarEvents = [], calendarErrors = [];

  function expandIcs(text, from, to, holiday) {
    var comp = new ICAL.Component(ICAL.parse(text));
    comp.getAllSubcomponents('vtimezone').forEach(function (tz) {
      try { ICAL.TimezoneService.register(tz); } catch (e) { /* already registered */ }
    });
    var masters = {}, exceptions = [], out = [];
    comp.getAllSubcomponents('vevent').forEach(function (ve) {
      var ev = new ICAL.Event(ve);
      if (ev.isRecurrenceException()) exceptions.push(ev);
      else masters[ev.uid] = ev;
    });
    exceptions.forEach(function (ex) { if (masters[ex.uid]) { try { masters[ex.uid].relateException(ex); } catch (e) { /* ignore */ } } });

    function push(summary, s, e, allDay) {
      if (e > from && s < to) out.push({ title: summary || '(sem título)', start: s, end: e, allDay: allDay, holiday: holiday });
    }
    Object.keys(masters).forEach(function (uid) {
      var ev = masters[uid];
      try {
        if (ev.isRecurring()) {
          var it = ev.iterator(), next, guard = 0;
          while ((next = it.next()) && guard++ < 20000) {
            if (next.toJSDate() >= to) break;
            var det = ev.getOccurrenceDetails(next);
            push(det.item.summary, det.startDate.toJSDate(), det.endDate.toJSDate(), det.startDate.isDate);
          }
        } else {
          var s = ev.startDate.toJSDate();
          var e = ev.endDate ? ev.endDate.toJSDate() : s;
          push(ev.summary, s, e, ev.startDate.isDate);
        }
      } catch (err) { console.warn('event', uid, err); }
    });
    return out;
  }

  function loadCalendar() {
    var now = new Date(), from = dayStart(now), to = addDays(from, AGENDA_DAYS);
    var sources = config.icals.map(function (u) { return { url: u, holiday: false }; });
    if (config.holidays) sources.push({ url: HOLIDAYS_ICS, holiday: true });
    return Promise.all(sources.map(function (src) {
      return get(src.url, true).then(function (text) {
        return { events: expandIcs(text, from, to, src.holiday) };
      }).catch(function (e) { return { error: (src.holiday ? 'feriados' : 'agenda') + ': ' + (e.message || e) }; });
    })).then(function (results) {
      calendarEvents = [];
      calendarErrors = [];
      results.forEach(function (r) { if (r.error) calendarErrors.push(r.error); else calendarEvents = calendarEvents.concat(r.events); });
      calendarEvents.sort(function (a, b) { return a.start - b.start || (b.allDay - a.allDay); });
      renderAgenda();
    });
  }

  function groupLabel(d, today) {
    var diff = Math.round((dayStart(d) - today) / 86400000);
    if (diff <= 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    return WEEKDAYS[d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  }

  function renderAgenda() {
    var now = new Date(), today = dayStart(now);
    var upcoming = calendarEvents.filter(function (e) { return e.end > now; }).slice(0, AGENDA_MAX);
    var html = '<div class="title">Agenda</div>', lastGroup = null;
    if (!config.icals.length) {
      html += '<div class="note">Agenda do Google não configurada — mostrando só feriados. ' +
        'Envie o endereço secreto iCal pelo Mac (veja o README do repositório).</div>';
    }
    if (!upcoming.length) html += '<div class="note">Nada nos próximos ' + AGENDA_DAYS + ' dias.</div>';
    upcoming.forEach(function (e) {
      var start = e.start < today ? today : e.start;
      var g = groupLabel(start, today);
      if (g !== lastGroup) { html += '<div class="group">' + g + '</div>'; lastGroup = g; }
      var happening = !e.allDay && e.start <= now && e.end > now;
      var when = e.allDay ? 'dia todo' : happening ? 'agora' : pad(e.start.getHours()) + ':' + pad(e.start.getMinutes());
      html += '<div class="ev' + (e.holiday ? ' holiday' : '') + (happening ? ' now' : '') + '"><span class="when">' + when +
        '</span><span class="what">' + esc(e.title) + '</span></div>';
    });
    calendarErrors.forEach(function (m) { html += '<div class="note">⚠ ' + esc(m) + '</div>'; });
    $('agenda').innerHTML = html;
  }

  // ---------- keep the TV screensaver away while the dashboard is open ----------
  function blockScreensaver() {
    if (typeof PalmServiceBridge === 'undefined') return;
    var client = 'com.fvsant.painel';
    var bridge = new PalmServiceBridge();
    bridge.onservicecallback = function (msg) {
      var m; try { m = JSON.parse(msg); } catch (e) { return; }
      if (m.timestamp === undefined) return;
      var reply = new PalmServiceBridge();
      reply.call('luna://com.webos.service.tvpower/power/responseScreenSaverRequest',
        JSON.stringify({ clientName: client, ack: false, timestamp: m.timestamp }));
    };
    bridge.call('luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
      JSON.stringify({ subscribe: true, clientName: client }));
    blockScreensaver.bridge = bridge; // keep the subscription alive
  }

  // ---------- keys ----------
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === KEY.RIGHT) showPhoto(photoIndex + 1);
    else if (k === KEY.LEFT) showPhoto(photoIndex - 1);
    else if (k === KEY.ENTER) { agendaVisible = !agendaVisible; $('agenda').className = 'agenda' + (agendaVisible ? '' : ' hidden'); }
    else if (k === KEY.BACK || k === KEY.ESC) { e.preventDefault(); window.close(); return; }
    else return;
    e.preventDefault();
  });

  // ---------- startup ----------
  function refreshAll() { loadWeather(); loadCalendar(); }

  document.addEventListener('webOSRelaunch', function (e) { applyParams(e.detail); });
  if (window.PalmSystem && PalmSystem.launchParams) applyParams(PalmSystem.launchParams);
  if (/[?&]params=/.test(location.search)) applyParams(decodeURIComponent(location.search.split('params=')[1])); // browser testing

  tick();
  setInterval(tick, 5000);
  setInterval(renderAgenda, 60000); // roll "now" / past events without refetching
  setInterval(loadWeather, WEATHER_MS);
  setInterval(loadCalendar, CALENDAR_MS);
  setInterval(loadPhotos, PHOTOS_MS);
  loadPhotos();
  refreshAll();
  blockScreensaver();
})();
