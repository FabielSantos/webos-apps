/* Clima — weather app for webOS TV (Chromium 68: no ?. / ?? / Array.flat / Object.fromEntries). */
(function () {
  'use strict';

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, ESC: 27, RED: 403, DELETE: 46 };
  var STORE = 'clima.cities.v1';
  var DEFAULT_CITIES = [
    { name: 'Toronto', sub: 'Ontário, Canadá', lat: 43.7064, lon: -79.3986 },
    { name: 'São Paulo', sub: 'São Paulo, Brasil', lat: -23.5475, lon: -46.6361 },
    { name: 'Rio de Janeiro', sub: 'Rio de Janeiro, Brasil', lat: -22.9064, lon: -43.1822 },
    { name: 'Lisboa', sub: 'Portugal', lat: 38.7167, lon: -9.1333 }
  ];
  var WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var FIXED = 2; // list items before the saved cities: [search, my location]
  var REFRESH_MS = 15 * 60 * 1000;

  var $ = function (id) { return document.getElementById(id); };
  var listEl = $('list'), panelEl = $('panel'), hintsEl = $('hints');
  var searchEl = $('search'), queryEl = $('query'), statusEl = $('search-status'), resultsEl = $('results');

  var state = {
    cities: loadCities(),
    zone: 'list',        // list | days | search | results
    listIndex: FIXED,    // first saved city
    dayIndex: 0,
    results: [],
    resultIndex: 0,
    myPlace: null,       // resolved IP location
    myPlaceError: null,
    forecast: null,      // { key, data } for the place shown in the panel
    loadingKey: null,
    error: null
  };
  var cache = {};        // key -> { data, at }
  var focusTimer = null;

  // ---------- storage ----------
  function loadCities() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE));
      if (saved && saved.length !== undefined) return saved;
    } catch (e) { /* ignore */ }
    return DEFAULT_CITIES.slice();
  }
  function saveCities() {
    try { localStorage.setItem(STORE, JSON.stringify(state.cities)); } catch (e) { /* ignore */ }
  }
  function placeKey(p) { return p.lat.toFixed(2) + ',' + p.lon.toFixed(2); }

  // ---------- network ----------
  function getJSON(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function fetchForecast(p) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&timezone=auto&forecast_days=7';
    return getJSON(url);
  }

  function searchCities(q) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?count=8&language=pt&format=json&name=' + encodeURIComponent(q);
    return getJSON(url).then(function (d) {
      return (d.results || []).map(function (r) {
        return { name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude };
      });
    });
  }

  function locateMe() {
    return getJSON('https://get.geojs.io/v1/ip/geo.json').then(function (d) {
      var lat = parseFloat(d.latitude), lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon)) throw new Error('sem coordenadas');
      return { name: d.city || 'Minha localização', sub: [d.region, d.country].filter(Boolean).join(', '), lat: lat, lon: lon };
    });
  }

  // ---------- weather codes & icons ----------
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

  var SUN = '<circle cx="26" cy="26" r="10" fill="#fbbf24"/>' +
    '<g stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round">' +
    '<path d="M26 6v5M26 41v5M6 26h5M41 26h5M12 12l3.5 3.5M36.5 36.5L40 40M12 40l3.5-3.5M36.5 15.5L40 12"/></g>';
  var MOON = '<path d="M34 10a16 16 0 1 0 12 26A13 13 0 0 1 34 10z" fill="#cbd5e1"/>';
  var CLOUD = function (fill) {
    return '<path d="M20 52h26a11 11 0 0 0 0-22 15 15 0 0 0-29-2A12 12 0 0 0 20 52z" fill="' + fill + '"/>';
  };
  function icon(kind, isDay) {
    var sky = isDay === 0 ? MOON : SUN;
    var body;
    switch (kind) {
      case 'clear': body = isDay === 0 ? '<g transform="translate(6 6)">' + MOON + '</g>' : '<g transform="translate(6 6)">' + SUN + '</g>'; break;
      case 'partly': body = sky + '<g transform="translate(6 4)">' + CLOUD('#e2e8f0') + '</g>'; break;
      case 'cloud': body = '<g transform="translate(2 -4)">' + CLOUD('#94a3b8') + '</g>' + '<g transform="translate(6 2)">' + CLOUD('#e2e8f0') + '</g>'; break;
      case 'fog': body = '<g transform="translate(2 -8)">' + CLOUD('#cbd5e1') + '</g>' +
        '<g stroke="#94a3b8" stroke-width="3.5" stroke-linecap="round"><path d="M12 50h40M18 57h30"/></g>'; break;
      case 'rain': body = '<g transform="translate(2 -10)">' + CLOUD('#cbd5e1') + '</g>' +
        '<g stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round"><path d="M22 48l-3 8M33 48l-3 8M44 48l-3 8"/></g>'; break;
      case 'snow': body = '<g transform="translate(2 -10)">' + CLOUD('#e2e8f0') + '</g>' +
        '<g fill="#f8fafc"><circle cx="21" cy="52" r="3"/><circle cx="32" cy="57" r="3"/><circle cx="43" cy="52" r="3"/></g>'; break;
      case 'storm': body = '<g transform="translate(2 -10)">' + CLOUD('#94a3b8') + '</g>' +
        '<path d="M33 44l-8 11h7l-4 9 11-13h-7l4-7z" fill="#fbbf24"/>'; break;
      default: body = CLOUD('#94a3b8');
    }
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
  }
  var ICON_SEARCH = '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5" fill="none" stroke="#7dd3fc" stroke-width="2.4"/><path d="M15 15l6 6" stroke="#7dd3fc" stroke-width="2.4" stroke-linecap="round"/></svg>';
  var ICON_PIN = '<svg viewBox="0 0 24 24"><path d="M12 22s7-7.2 7-12.5A7 7 0 0 0 5 9.5C5 14.8 12 22 12 22z" fill="#f472b6"/><circle cx="12" cy="9.5" r="2.6" fill="#0b1324"/></svg>';
  var ICON_CITY = '<svg viewBox="0 0 24 24"><path d="M3 21V10l5-3v14M8 21V4h8v17M16 21v-9h5v9" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function round(n) { return Math.round(n) + '°'; }
  function hhmm(iso) { return iso.slice(11, 16); }
  function weekday(dateStr, i) {
    if (i === 0) return 'Hoje';
    if (i === 1) return 'Amanhã';
    var p = dateStr.split('-');
    return WEEKDAYS[new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
  }
  function shortDate(dateStr) { var p = dateStr.split('-'); return p[2] + '/' + p[1]; }

  function listLength() { return FIXED + state.cities.length; }
  function placeAt(i) {
    if (i === 1) return state.myPlace;
    if (i >= FIXED) return state.cities[i - FIXED];
    return null;
  }

  // ---------- time zones ----------
  function pad(n) { return ('0' + n).slice(-2); }
  function gmt(offsetSec) {
    if (!offsetSec) return 'GMT';
    var mins = Math.abs(offsetSec) / 60;
    return 'GMT' + (offsetSec < 0 ? '−' : '+') + Math.floor(mins / 60) + (mins % 60 ? ':' + pad(mins % 60) : '');
  }
  // "Wall clock" of a place as a Date whose UTC fields hold the local time there
  function cityNow(d) { return new Date(Date.now() + d.utc_offset_seconds * 1000); }
  function cityClock(d) { var t = cityNow(d); return pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()); }
  function hourOf(iso) { return +iso.slice(11, 13) + (+iso.slice(14, 16)) / 60; }
  function duration(h) { var m = Math.round(h * 60); return Math.floor(m / 60) + 'h' + pad(m % 60); }

  // ---------- moon phase (synodic month from a known new moon) ----------
  var MOON_NAMES = ['Lua nova', 'Lua crescente', 'Quarto crescente', 'Crescente gibosa', 'Lua cheia', 'Minguante gibosa', 'Quarto minguante', 'Lua minguante'];
  function moonPhase(date) {
    var days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
    var phase = ((days / 29.530588853) % 1 + 1) % 1;           // 0 new, 0.5 full
    return { phase: phase, lit: (1 - Math.cos(2 * Math.PI * phase)) / 2, name: MOON_NAMES[Math.round(phase * 8) % 8] };
  }
  function moonSVG(cx, cy, r, m) {
    // lit disc, then a shadow disc slid sideways: waxing lights the right side, waning the left
    var dx = 2 * r * m.lit * (m.phase < 0.5 ? -1 : 1);
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#f1f5f9"/>' +
      '<clipPath id="mc"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/></clipPath>' +
      '<circle clip-path="url(#mc)" cx="' + (cx + dx) + '" cy="' + cy + '" r="' + r + '" fill="#334155" opacity="0.92"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#e2e8f0" stroke-width="1.5"/>';
  }

  // ---------- day arc: sun above the horizon by day, below it at night ----------
  var ARC = { W: 480, H: 150, Y0: 92, UP: 64, DOWN: 34 };
  function arcY(t, rise, set) {
    if (t >= rise && t <= set) return ARC.Y0 - ARC.UP * Math.sin(Math.PI * (t - rise) / (set - rise));
    var night = 24 - (set - rise), since = t > set ? t - set : t + 24 - set;
    return ARC.Y0 + ARC.DOWN * Math.sin(Math.PI * since / night);
  }
  function arcX(t) { return 12 + (ARC.W - 24) * t / 24; }

  function dayArcSVG(d, di) {
    var rise = hourOf(d.daily.sunrise[di]), set = hourOf(d.daily.sunset[di]);
    if (!(set > rise)) return '';
    var dayPts = [], nightA = [], nightB = [];
    for (var q = 0; q <= 96; q++) {
      var t = q / 4, pt = arcX(t).toFixed(1) + ',' + arcY(t, rise, set).toFixed(1);
      if (t < rise) nightA.push(pt); else if (t > set) nightB.push(pt); else dayPts.push(pt);
    }
    dayPts.unshift(arcX(rise).toFixed(1) + ',' + ARC.Y0);
    dayPts.push(arcX(set).toFixed(1) + ',' + ARC.Y0);
    nightA.push(arcX(rise).toFixed(1) + ',' + ARC.Y0);
    nightB.unshift(arcX(set).toFixed(1) + ',' + ARC.Y0);

    var s = '<svg viewBox="0 0 ' + ARC.W + ' ' + ARC.H + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24" stop-opacity="0.45"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0.05"/></linearGradient></defs>' +
      '<polygon points="' + dayPts.join(' ') + '" fill="url(#dg)"/>' +
      '<polyline points="' + dayPts.join(' ') + '" fill="none" stroke="#fbbf24" stroke-width="3"/>' +
      '<polyline points="' + nightA.join(' ') + '" fill="none" stroke="#64748b" stroke-width="2.5" stroke-dasharray="5 5"/>' +
      '<polyline points="' + nightB.join(' ') + '" fill="none" stroke="#64748b" stroke-width="2.5" stroke-dasharray="5 5"/>' +
      '<line x1="12" y1="' + ARC.Y0 + '" x2="' + (ARC.W - 12) + '" y2="' + ARC.Y0 + '" stroke="#94a3b8" stroke-width="1.5"/>';
    [0, 6, 12, 18, 24].forEach(function (h) {
      s += '<text x="' + arcX(h) + '" y="146" fill="#94a3b8" font-size="15" text-anchor="' + (h === 0 ? 'start' : h === 24 ? 'end' : 'middle') + '">' + h + 'h</text>';
    });
    s += '<text x="' + arcX(rise) + '" y="' + (ARC.Y0 + 20) + '" fill="#fcd34d" font-size="16" text-anchor="middle">↑ ' + hhmm(d.daily.sunrise[di]) + '</text>' +
      '<text x="' + arcX(set) + '" y="' + (ARC.Y0 + 20) + '" fill="#fdba74" font-size="16" text-anchor="middle">↓ ' + hhmm(d.daily.sunset[di]) + '</text>';

    if (di === 0) {
      var t = cityNow(d), nowH = t.getUTCHours() + t.getUTCMinutes() / 60;
      var x = arcX(nowH), y = arcY(nowH, rise, set), isDay = nowH >= rise && nowH <= set;
      s += '<line x1="' + x + '" y1="8" x2="' + x + '" y2="132" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.6"/>';
      s += isDay ? '<circle cx="' + x + '" cy="' + y + '" r="16" fill="#fbbf24" opacity="0.25"/><circle cx="' + x + '" cy="' + y + '" r="10" fill="#fde047"/>'
                 : moonSVG(x, y, 11, moonPhase(new Date()));
    }
    return s + '</svg>';
  }

  function dayArcCaption(d, di) {
    var rise = hourOf(d.daily.sunrise[di]), set = hourOf(d.daily.sunset[di]);
    if (di > 0) return 'Duração do dia: <b>' + duration(set - rise) + '</b>';
    var t = cityNow(d), nowH = t.getUTCHours() + t.getUTCMinutes() / 60;
    if (nowH < rise) return 'Sol nasce em <b>' + duration(rise - nowH) + '</b> · ' + moonPhase(new Date()).name;
    if (nowH <= set) return 'Sol se põe em <b>' + duration(set - nowH) + '</b> · dia de ' + duration(set - rise);
    var nextRise = d.daily.sunrise[1] ? hourOf(d.daily.sunrise[1]) + 24 : rise + 24;
    return 'Sol nasce em <b>' + duration(nextRise - nowH) + '</b> · ' + moonPhase(new Date()).name;
  }

  // ---------- animated background scene that follows the shown city's weather ----------
  var sceneKey = null;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function setScene(kind, isDay) {
    var key = kind + (isDay === 0 ? '-night' : '-day');
    if (key === sceneKey) return;
    sceneKey = key;
    var layers = document.querySelectorAll('.scene');
    var next = layers[0].className.indexOf('show') >= 0 ? layers[1] : layers[0];
    var prev = next === layers[0] ? layers[1] : layers[0];
    var html = '', i;
    if (isDay === 0 && (kind === 'clear' || kind === 'partly')) {
      for (i = 0; i < 60; i++) {
        html += '<i class="star" style="left:' + rand(0, 100).toFixed(1) + '%;top:' + rand(0, 70).toFixed(1) + '%;animation-delay:' + rand(0, 4).toFixed(1) + 's;opacity:' + rand(0.3, 1).toFixed(2) + '"></i>';
      }
    }
    if (isDay !== 0 && (kind === 'clear' || kind === 'partly')) html += '<i class="sun-glow"></i>';
    var clouds = { partly: 3, cloud: 6, rain: 5, storm: 5, snow: 4, fog: 0 }[kind] || 0;
    for (i = 0; i < clouds; i++) {
      html += '<i class="cloud" style="top:' + rand(-6, 38).toFixed(1) + '%;width:' + rand(30, 55).toFixed(0) + 'rem;animation-duration:' + rand(90, 170).toFixed(0) + 's;animation-delay:-' + rand(0, 170).toFixed(0) + 's"></i>';
    }
    if (kind === 'rain' || kind === 'storm') {
      for (i = 0; i < 40; i++) { // 40 keeps ~50 fps on the TV (80 drops ran at ~35)
        html += '<i class="drop" style="left:' + rand(-5, 105).toFixed(1) + '%;animation-duration:' + rand(0.6, 1.1).toFixed(2) + 's;animation-delay:-' + rand(0, 1.2).toFixed(2) + 's"></i>';
      }
    }
    if (kind === 'snow') {
      for (i = 0; i < 40; i++) {
        var size = rand(0.3, 0.8).toFixed(2);
        html += '<i class="flake" style="left:' + rand(0, 100).toFixed(1) + '%;width:' + size + 'rem;height:' + size + 'rem;animation-duration:' + rand(7, 14).toFixed(1) + 's;animation-delay:-' + rand(0, 14).toFixed(1) + 's"></i>';
      }
    }
    if (kind === 'fog') {
      for (i = 0; i < 4; i++) html += '<i class="mist" style="top:' + (15 + i * 20) + '%;animation-duration:' + (60 + i * 15) + 's;animation-delay:-' + (i * 12) + 's"></i>';
    }
    if (kind === 'storm') html += '<i class="flash"></i>';
    next.innerHTML = html;
    next.className = 'scene sky-' + key + ' show';
    prev.className = prev.className.replace(' show', '');
    setTimeout(function () { if (prev.className.indexOf('show') < 0) prev.innerHTML = ''; }, 2600);
  }

  // ---------- rendering ----------
  function renderList() {
    var html = '';
    var items = [{ icon: ICON_SEARCH, name: 'Buscar cidade', sub: '' },
                 { icon: ICON_PIN, name: 'Minha localização', sub: state.myPlace ? state.myPlace.name : '' }];
    state.cities.forEach(function (c) { items.push({ icon: ICON_CITY, name: c.name, sub: c.sub }); });
    items.forEach(function (it, i) {
      var cls = 'item' + (i === state.listIndex ? (state.zone === 'list' ? ' focused' : ' focused active') : '');
      html += '<div class="' + cls + '" data-i="' + i + '">' + it.icon +
        '<span class="name">' + esc(it.name) + '</span>' +
        (it.sub ? '<span class="sub">' + esc(it.sub) + '</span>' : '') + '</div>';
    });
    listEl.innerHTML = html;
    listEl.className = 'list' + (state.zone === 'list' ? '' : ' dim');
    var f = listEl.querySelector('.focused');
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  }

  function renderPanel() {
    var i = state.listIndex;
    if (i === 0) {
      panelEl.innerHTML = '<div class="message">Pressione <b>OK</b> para buscar qualquer cidade do mundo.<br>' +
        'A cidade escolhida fica salva na lista.</div>';
      return;
    }
    var place = placeAt(i);
    if (!place) {
      panelEl.innerHTML = '<div class="message">' + (state.myPlaceError
        ? 'Não foi possível detectar sua localização.<br><b>' + esc(state.myPlaceError) + '</b>'
        : 'Detectando sua localização…') + '</div>';
      return;
    }
    var key = placeKey(place);
    if (!state.forecast || state.forecast.key !== key) {
      panelEl.innerHTML = '<div class="message">' + (state.error && state.loadingKey === null
        ? 'Falha ao carregar a previsão.<br><b>' + esc(state.error) + '</b><br>Pressione OK para tentar de novo.'
        : 'Carregando previsão de <b>' + esc(place.name) + '</b>…') + '</div>';
      return;
    }
    panelEl.innerHTML = forecastHTML(place, state.forecast.data);
    setScene(describe(state.forecast.data.current.weather_code)[1], state.forecast.data.current.is_day);
  }

  function forecastHTML(place, d) {
    var c = d.current, day = d.daily, h = d.hourly;
    var now = describe(c.weather_code);
    var di = state.dayIndex;
    var html = '<div class="place">' + esc(place.name) + '<span class="sub">' + esc(place.sub || '') + '</span>' +
      '<span class="city-time"><span id="city-clock">' + cityClock(d) + '</span> · ' + gmt(d.utc_offset_seconds) + '</span></div>';

    html += '<div class="now">' + '<div class="big-icon">' + icon(now[1], c.is_day) + '</div>' +
      '<div><div class="temp">' + round(c.temperature_2m) + '</div><div class="cond">' + now[0] + '</div></div>' +
      '<div class="arc">' + dayArcSVG(d, di) + '<div class="arc-caption">' + dayArcCaption(d, di) + '</div></div>' +
      '<div class="facts">' +
      'Máx <b>' + round(day.temperature_2m_max[0]) + '</b> · Mín <b>' + round(day.temperature_2m_min[0]) + '</b><br>' +
      'Sensação <b>' + round(c.apparent_temperature) + '</b><br>' +
      'Umidade <b>' + c.relative_humidity_2m + '%</b><br>' +
      'Vento <b>' + Math.round(c.wind_speed_10m) + ' km/h</b></div></div>';

    // hours: today = next 8 hours from now; other days = every 3 hours
    var slots = [];
    if (di === 0) {
      var start = 0, nowHour = c.time.slice(0, 13);
      while (start < h.time.length && h.time[start].slice(0, 13) < nowHour) start++;
      for (var k = start; k < start + 8 && k < h.time.length; k++) slots.push(k);
    } else {
      for (var j = 0; j < h.time.length; j++) {
        if (h.time[j].slice(0, 10) === day.time[di] && (+h.time[j].slice(11, 13)) % 3 === 0) slots.push(j);
      }
    }
    html += '<div class="section-title">' + (di === 0 ? 'Próximas horas' : weekday(day.time[di], di) + ', ' + shortDate(day.time[di]) + ' — a cada 3 horas') + '</div>';
    html += '<div class="hours">' + slots.map(function (k) {
      var p = h.precipitation_probability[k];
      return '<div class="hour"><div class="t">' + hhmm(h.time[k]) + '</div>' + icon(describe(h.weather_code[k])[1], h.is_day[k]) +
        '<div class="v">' + round(h.temperature_2m[k]) + '</div><div class="p">' + (p >= 20 ? p + '%' : '') + '</div></div>';
    }).join('') + '</div>';

    html += '<div class="section-title">7 dias</div><div class="days">' + day.time.map(function (t, i) {
      var cls = 'day' + (i === di ? ' selected' : '') + (state.zone === 'days' && i === di ? ' focused' : '');
      var p = day.precipitation_probability_max[i];
      return '<div class="' + cls + '" data-d="' + i + '"><div class="d">' + weekday(t, i) + '</div><div class="dt">' + shortDate(t) + '</div>' +
        icon(describe(day.weather_code[i])[1], 1) +
        '<div><span class="mx">' + round(day.temperature_2m_max[i]) + '</span><span class="mn">' + round(day.temperature_2m_min[i]) + '</span></div>' +
        '<div class="p">' + (p >= 20 ? p + '%' : '') + '</div></div>';
    }).join('') + '</div>';
    return html;
  }

  function renderHints() {
    var h;
    if (state.zone === 'list') {
      var onCity = state.listIndex >= FIXED;
      h = '<span><span class="key">▲▼</span>trocar cidade</span>' +
        (state.listIndex === 0 ? '<span><span class="key">OK</span>buscar</span>'
          : state.listIndex === 1 ? '<span><span class="key">OK</span>salvar na lista</span>'
          : '<span><span class="key">OK / ►</span>ver os dias</span>') +
        (onCity ? '<span><span class="key red">●</span>remover cidade</span>' : '') +
        '<span><span class="key">VOLTAR</span>sair</span>';
    } else if (state.zone === 'days') {
      h = '<span><span class="key">◄►</span>escolher o dia</span><span><span class="key">VOLTAR</span>lista de cidades</span>';
    } else if (state.zone === 'search') {
      h = '<span><span class="key">OK</span>buscar</span><span><span class="key">▼</span>resultados</span><span><span class="key">VOLTAR</span>cancelar</span>';
    } else {
      h = '<span><span class="key">▲▼</span>escolher</span><span><span class="key">OK</span>adicionar à lista</span><span><span class="key">VOLTAR</span>cancelar</span>';
    }
    hintsEl.innerHTML = h;
  }

  function renderResults() {
    resultsEl.innerHTML = state.results.map(function (r, i) {
      var cls = 'item' + (state.zone === 'results' && i === state.resultIndex ? ' focused' : '');
      return '<div class="' + cls + '" data-r="' + i + '">' + ICON_CITY + '<span class="name">' + esc(r.name) +
        '</span><span class="sub">' + esc(r.sub) + '</span></div>';
    }).join('');
    queryEl.className = state.zone === 'search' ? 'focused' : '';
    var f = resultsEl.querySelector('.focused');
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    renderList();
    renderPanel();
    renderHints();
    if (state.zone === 'search' || state.zone === 'results') renderResults();
  }

  // ---------- data flow ----------
  function loadPanel(force) {
    var place = placeAt(state.listIndex);
    if (state.listIndex === 1 && !state.myPlace && !state.myPlaceError) { resolveMyPlace(); return; }
    if (!place) { render(); return; }
    var key = placeKey(place);
    var hit = cache[key];
    if (hit && !force && Date.now() - hit.at < REFRESH_MS) {
      state.forecast = { key: key, data: hit.data };
      state.error = null;
      render();
      return;
    }
    state.loadingKey = key;
    state.error = null;
    render();
    fetchForecast(place).then(function (data) {
      cache[key] = { data: data, at: Date.now() };
      if (state.loadingKey !== key) return; // user moved on
      state.loadingKey = null;
      state.forecast = { key: key, data: data };
      render();
    }, function (err) {
      if (state.loadingKey !== key) return;
      state.loadingKey = null;
      state.error = err.name === 'AbortError' ? 'tempo esgotado' : (err.message || String(err));
      render();
    });
  }

  function resolveMyPlace() {
    state.myPlaceError = null;
    render();
    locateMe().then(function (p) {
      state.myPlace = p;
      if (state.listIndex === 1) loadPanel(); else render();
    }, function (err) {
      state.myPlaceError = err.message || String(err);
      render();
    });
  }

  // panel follows the focused city, debounced so fast scrolling doesn't spam the API
  function focusList(i) {
    state.listIndex = Math.max(0, Math.min(listLength() - 1, i));
    state.dayIndex = 0;
    state.error = null;
    renderList();
    renderHints();
    clearTimeout(focusTimer);
    focusTimer = setTimeout(loadPanel, 300);
    var place = placeAt(state.listIndex);
    var hit = place && cache[placeKey(place)];
    if (hit) { state.forecast = { key: placeKey(place), data: hit.data }; }
    renderPanel();
  }

  function addCity(p) {
    var key = placeKey(p);
    var idx = -1;
    state.cities.forEach(function (c, i) { if (placeKey(c) === key) idx = i; });
    if (idx < 0) { state.cities.push(p); idx = state.cities.length - 1; saveCities(); }
    closeSearch();
    focusList(FIXED + idx);
  }

  function removeCity() {
    if (state.listIndex < FIXED) return;
    state.cities.splice(state.listIndex - FIXED, 1);
    saveCities();
    focusList(Math.min(state.listIndex, listLength() - 1));
  }

  // ---------- search overlay ----------
  function openSearch() {
    state.zone = 'search';
    state.results = [];
    statusEl.textContent = '';
    queryEl.value = '';
    searchEl.className = 'overlay';
    renderResults();
    renderHints();
    setTimeout(function () { queryEl.focus(); }, 50); // focus opens the webOS virtual keyboard
  }

  function closeSearch() {
    queryEl.blur();
    searchEl.className = 'overlay hidden';
    state.zone = 'list';
    render();
  }

  function runSearch() {
    var q = queryEl.value.trim();
    if (q.length < 2) { statusEl.textContent = 'Digite pelo menos 2 letras.'; return; }
    statusEl.textContent = 'Buscando "' + q + '"…';
    searchCities(q).then(function (list) {
      state.results = list;
      state.resultIndex = 0;
      if (!list.length) { statusEl.textContent = 'Nenhuma cidade encontrada para "' + q + '".'; renderResults(); return; }
      statusEl.textContent = list.length + ' resultado(s) — escolha com ▲▼ e OK';
      queryEl.blur();
      state.zone = 'results';
      renderResults();
      renderHints();
    }, function (err) {
      statusEl.textContent = 'Falha na busca: ' + (err.message || err);
    });
  }

  // ---------- keys ----------
  function onKey(e) {
    var k = e.keyCode;
    var back = k === KEY.BACK || k === KEY.ESC;

    if (state.zone === 'search') {
      if (k === KEY.ENTER) { e.preventDefault(); runSearch(); }
      else if (k === KEY.DOWN && state.results.length) { e.preventDefault(); queryEl.blur(); state.zone = 'results'; renderResults(); renderHints(); }
      else if (back) { e.preventDefault(); closeSearch(); }
      return; // let other keys type into the input
    }

    if (state.zone === 'results') {
      e.preventDefault();
      if (k === KEY.DOWN) state.resultIndex = Math.min(state.results.length - 1, state.resultIndex + 1);
      else if (k === KEY.UP) {
        if (state.resultIndex === 0) { state.zone = 'search'; queryEl.focus(); }
        else state.resultIndex--;
      }
      else if (k === KEY.ENTER) { addCity(state.results[state.resultIndex]); return; }
      else if (back) { closeSearch(); return; }
      renderResults();
      renderHints();
      return;
    }

    if (state.zone === 'days') {
      e.preventDefault();
      var n = state.forecast ? state.forecast.data.daily.time.length : 0;
      if (k === KEY.RIGHT) state.dayIndex = Math.min(n - 1, state.dayIndex + 1);
      else if (k === KEY.LEFT) {
        if (state.dayIndex === 0) { state.zone = 'list'; }
        else state.dayIndex--;
      }
      else if (back || k === KEY.UP || k === KEY.DOWN) { state.zone = 'list'; state.dayIndex = 0; }
      render();
      return;
    }

    // zone: list
    if (k === KEY.UP) { e.preventDefault(); focusList(state.listIndex - 1); }
    else if (k === KEY.DOWN) { e.preventDefault(); focusList(state.listIndex + 1); }
    else if (k === KEY.ENTER || k === KEY.RIGHT) {
      e.preventDefault();
      if (state.listIndex === 0) { if (k === KEY.ENTER) openSearch(); return; }
      if (state.listIndex === 1 && k === KEY.ENTER && state.myPlace) { addCity(state.myPlace); return; }
      if (state.error) { loadPanel(true); return; }
      if (state.forecast && state.forecast.key === placeKey(placeAt(state.listIndex) || { lat: 0, lon: 0 })) {
        state.zone = 'days';
        render();
      }
    }
    else if (k === KEY.RED || k === KEY.DELETE) { e.preventDefault(); removeCity(); }
    else if (back) { e.preventDefault(); window.close(); }
  }

  // Magic Remote / mouse pointer support
  listEl.addEventListener('click', function (e) {
    var el = e.target.closest('[data-i]');
    if (!el) return;
    var i = +el.getAttribute('data-i');
    state.zone = 'list';
    if (i === 0) { focusList(0); openSearch(); } else focusList(i);
  });
  panelEl.addEventListener('click', function (e) {
    var el = e.target.closest('[data-d]');
    if (!el) return;
    state.zone = 'days';
    state.dayIndex = +el.getAttribute('data-d');
    render();
  });
  resultsEl.addEventListener('click', function (e) {
    var el = e.target.closest('[data-r]');
    if (el) addCity(state.results[+el.getAttribute('data-r')]);
  });

  document.addEventListener('keydown', onKey);

  // ---------- clock & refresh ----------
  function tick() {
    var d = new Date();
    $('clock').textContent = WEEKDAYS[d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) +
      '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '  (TV ' + gmt(-d.getTimezoneOffset() * 60) + ')';
    var cc = $('city-clock');
    if (cc && state.forecast) cc.textContent = cityClock(state.forecast.data);
  }
  tick();
  setInterval(tick, 15000);
  // move the "now" marker on the day arc
  setInterval(function () { if (state.zone === 'list' || state.zone === 'days') renderPanel(); }, 60000);
  setInterval(function () { loadPanel(true); }, REFRESH_MS);

  if (!state.cities.length) state.listIndex = 1;
  render();
  loadPanel();
})();
