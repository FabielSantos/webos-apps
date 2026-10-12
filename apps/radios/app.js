/* Rádios — internet radio from Radio Browser (https://www.radio-browser.info). Chromium 68: no ?. / ??. */
(function () {
  'use strict';

  var API = 'https://de1.api.radio-browser.info/json/';
  var SEARCH = 'stations/search?hidebroken=true&order=clickcount&reverse=true&limit=100&';
  var CATS = [
    { id: 'fav', name: '★ Favoritas' },
    { id: 'search', name: 'Buscar rádio…' },
    { id: 'br', name: 'Brasil', q: 'countrycode=BR' },
    { id: 'pt', name: 'Portugal', q: 'countrycode=PT' },
    { id: 'ca', name: 'Canadá', q: 'countrycode=CA' },
    { id: 'top', name: 'Mais ouvidas no mundo', q: '' },
    { id: 'news', name: 'Notícias (português)', q: 'tag=news&language=portuguese' },
    { id: 'mpb', name: 'MPB / Bossa nova', q: 'tag=mpb' },
    { id: 'sertanejo', name: 'Sertanejo', q: 'tag=sertanejo' },
    { id: 'samba', name: 'Samba e pagode', q: 'tag=samba' },
    { id: 'jazz', name: 'Jazz', q: 'tag=jazz' },
    { id: 'rock', name: 'Rock', q: 'tag=rock' },
    { id: 'classical', name: 'Clássica', q: 'tag=classical' }
  ];
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, ESC: 27, YELLOW: 405, PLAY: 415, PAUSE: 19, STOP: 413, PLAYPAUSE: 10252 };
  var VISIBLE = 12;

  var $ = function (id) { return document.getElementById(id); };
  var audio = $('audio');
  var state = {
    zone: 'cats', catIndex: load('radios.cat', 2), stIndex: 0,
    lists: {}, favs: load('radios.favs', []), searchResults: null, searchQuery: '',
    current: null, playState: 'idle', error: ''
  };

  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return ('0' + n).slice(-2); }

  function slim(s) {
    return { uuid: s.stationuuid, name: (s.name || '').trim(), url: s.url_resolved || s.url, logo: s.favicon || '',
      tags: (s.tags || '').split(',').slice(0, 4).join(' · '), codec: s.codec || '', bitrate: s.bitrate || 0, country: s.country || '' };
  }

  function cat() { return CATS[state.catIndex]; }
  function stationsOf(c) {
    if (c.id === 'fav') return state.favs;
    if (c.id === 'search') return state.searchResults || [];
    var l = state.lists[c.id];
    return l && l.stations ? l.stations : [];
  }
  function isFav(st) { return state.favs.some(function (f) { return f.uuid === st.uuid; }); }

  function fetchList(c) {
    if (c.id === 'fav' || c.id === 'search' || state.lists[c.id]) return;
    state.lists[c.id] = { loading: true };
    fetch(API + SEARCH + c.q).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { state.lists[c.id] = { stations: d.map(slim).filter(function (s) { return s.url; }) }; render(); })
      .catch(function (e) { state.lists[c.id] = { error: e.message || String(e) }; render(); });
  }

  // ---------- rendering ----------
  function initials(name) { return name.replace(/[^\wÀ-ú ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function logoHTML(st) {
    var ini = esc(initials(st.name));
    return st.logo ? '<img src="' + esc(st.logo) + '" onerror="this.outerHTML=\'' + ini + '\'">' : ini;
  }

  function renderCats() {
    $('cats').innerHTML = CATS.map(function (c, i) {
      var cls = 'cat' + (i === state.catIndex ? (state.zone === 'cats' ? ' focused' : ' active') : '');
      return '<div class="' + cls + '" data-c="' + i + '">' + esc(c.name) + '</div>';
    }).join('');
    var f = $('cats').querySelector('.focused, .active');
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  }

  function renderStations() {
    var c = cat(), l = state.lists[c.id], list = stationsOf(c), box = $('stations');
    $('list-title').textContent = c.id === 'search' && state.searchQuery ? 'Busca: ' + state.searchQuery + ' · ' + list.length
      : c.name + (list.length ? ' · ' + list.length + ' rádios' : '');
    box.className = 'stations' + (state.zone === 'stations' ? '' : ' dim');
    if (l && l.loading) { box.innerHTML = '<div class="msg">Carregando…</div>'; return; }
    if (l && l.error) { box.innerHTML = '<div class="msg">Falha ao carregar: ' + esc(l.error) + '<br>OK para tentar de novo.</div>'; return; }
    if (!list.length) {
      box.innerHTML = '<div class="msg">' + (c.id === 'fav' ? 'Sem favoritas ainda — botão <b>amarelo</b> numa rádio para favoritar.'
        : c.id === 'search' ? 'Pressione <b>OK</b> para buscar por nome ou estilo.' : 'Nada aqui.') + '</div>';
      return;
    }
    state.stIndex = Math.max(0, Math.min(list.length - 1, state.stIndex));
    var start = Math.max(0, Math.min(state.stIndex - 4, list.length - VISIBLE)), html = '';
    for (var i = start; i < Math.min(list.length, start + VISIBLE); i++) {
      var st = list[i], playing = state.current && state.current.uuid === st.uuid;
      html += '<div class="st' + (i === state.stIndex ? ' focused' : '') + (playing ? ' playing' : '') + '" data-s="' + i + '">' +
        '<div class="logo">' + logoHTML(st) + '</div><div class="info"><div class="name">' + (playing ? '♪ ' : '') + esc(st.name) + '</div>' +
        '<div class="tags">' + esc(st.tags || st.country) + '</div></div>' +
        '<div class="q">' + esc(st.codec) + (st.bitrate ? '<br>' + st.bitrate + ' kbps' : '') + '</div><div class="fav">' + (isFav(st) ? '★' : '') + '</div></div>';
    }
    box.innerHTML = html;
  }

  function renderNow() {
    var st = state.current, el = $('now');
    if (!st) { el.innerHTML = '<div class="big">♪</div><div class="state">Nada tocando</div><div class="meta">Escolha uma rádio e aperte OK</div>'; return; }
    var label = { loading: 'Conectando…', playing: 'Ao vivo', paused: 'Pausado', error: 'Sem sinal' }[state.playState] || '';
    el.innerHTML = '<div class="big">' + logoHTML(st) + '</div><div class="state">' + label + '</div>' +
      '<div class="eq' + (state.playState === 'playing' ? '' : ' paused') + '"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="title">' + esc(st.name) + '</div><div class="meta">' + esc([st.country, st.codec, st.bitrate ? st.bitrate + ' kbps' : ''].filter(Boolean).join(' · ')) +
      '<br>' + esc(st.tags) + '</div>' + (state.error ? '<div class="err">' + esc(state.error) + '</div>' : '');
  }

  function renderHints() {
    var h = '';
    if (state.zone === 'cats') h = '<span><span class="key">▲▼</span>categorias</span><span><span class="key">OK / ►</span>' + (cat().id === 'search' ? 'buscar' : 'rádios') + '</span>';
    else h = '<span><span class="key">▲▼</span>rádios</span><span><span class="key">OK</span>tocar</span><span><span class="key yellow">●</span>favorita</span><span><span class="key">◄</span>categorias</span>';
    if (state.current) h += '<span><span class="key">PLAY</span>pausar</span>';
    $('hints').innerHTML = h + '<span><span class="key">VOLTAR</span>sair</span>';
  }

  function render() { renderCats(); renderStations(); renderNow(); renderHints(); }

  // ---------- playback ----------
  function play(st) {
    state.current = st;
    state.playState = 'loading';
    state.error = '';
    audio.src = st.url;
    var p = audio.play();
    if (p && p.catch) p.catch(function () { /* reported by the error event */ });
    fetch(API + 'url/' + st.uuid).catch(function () {}); // count the click, as Radio Browser asks
    render();
  }
  function togglePause() {
    if (!state.current) return;
    if (audio.paused) { state.playState = 'loading'; audio.play(); } else { audio.pause(); state.playState = 'paused'; }
    render();
  }
  audio.addEventListener('playing', function () { state.playState = 'playing'; state.error = ''; renderNow(); });
  audio.addEventListener('waiting', function () { if (state.playState === 'playing') { state.playState = 'loading'; renderNow(); } });
  audio.addEventListener('error', function () {
    state.playState = 'error';
    state.error = 'Esta rádio não respondeu ou usa um formato que a TV não toca. Tente outra.';
    render();
  });

  // ---------- search ----------
  function openSearch() {
    $('search').className = 'overlay';
    $('query').value = state.searchQuery;
    $('search-status').textContent = '';
    state.zone = 'search';
    setTimeout(function () { $('query').focus(); }, 50); // focus opens the TV keyboard
  }
  function closeSearch() { $('query').blur(); $('search').className = 'overlay hidden'; state.zone = 'cats'; render(); }
  function runSearch() {
    var q = $('query').value.trim();
    if (q.length < 2) { $('search-status').textContent = 'Digite pelo menos 2 letras.'; return; }
    $('search-status').textContent = 'Buscando…';
    var byName = fetch(API + SEARCH + 'name=' + encodeURIComponent(q)).then(function (r) { return r.json(); });
    var byTag = fetch(API + SEARCH + 'tag=' + encodeURIComponent(q.toLowerCase())).then(function (r) { return r.json(); });
    Promise.all([byName, byTag]).then(function (rs) {
      var seen = {}, out = [];
      rs[0].concat(rs[1]).forEach(function (s) { if (!seen[s.stationuuid]) { seen[s.stationuuid] = true; out.push(slim(s)); } });
      state.searchResults = out.filter(function (s) { return s.url; });
      state.searchQuery = q;
      state.stIndex = 0;
      $('query').blur();
      $('search').className = 'overlay hidden';
      state.zone = state.searchResults.length ? 'stations' : 'cats';
      render();
    }).catch(function (e) { $('search-status').textContent = 'Falha na busca: ' + (e.message || e); });
  }

  function toggleFav(st) {
    if (!st) return;
    if (isFav(st)) state.favs = state.favs.filter(function (f) { return f.uuid !== st.uuid; });
    else state.favs.push(st);
    save('radios.favs', state.favs);
  }

  // ---------- keys ----------
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === KEY.PLAY || k === KEY.PAUSE || k === KEY.PLAYPAUSE) { togglePause(); e.preventDefault(); return; }
    if (k === KEY.STOP) { audio.pause(); audio.removeAttribute('src'); state.current = null; state.playState = 'idle'; render(); e.preventDefault(); return; }

    if (state.zone === 'search') {
      if (k === KEY.ENTER) { e.preventDefault(); runSearch(); }
      else if (k === KEY.BACK || k === KEY.ESC) { e.preventDefault(); closeSearch(); }
      return;
    }
    var handled = true;
    if (state.zone === 'cats') {
      if (k === KEY.UP) { state.catIndex = Math.max(0, state.catIndex - 1); state.stIndex = 0; }
      else if (k === KEY.DOWN) { state.catIndex = Math.min(CATS.length - 1, state.catIndex + 1); state.stIndex = 0; }
      else if (k === KEY.ENTER || k === KEY.RIGHT) {
        var l = state.lists[cat().id];
        if (cat().id === 'search' && (k === KEY.ENTER || !stationsOf(cat()).length)) { openSearch(); e.preventDefault(); return; }
        if (l && l.error) delete state.lists[cat().id];
        else if (stationsOf(cat()).length) state.zone = 'stations';
      }
      else if (k === KEY.BACK || k === KEY.ESC) { window.close(); }
      else handled = false;
      save('radios.cat', state.catIndex);
      fetchList(cat());
    } else {
      var list = stationsOf(cat());
      if (k === KEY.UP) state.stIndex = Math.max(0, state.stIndex - 1);
      else if (k === KEY.DOWN) state.stIndex = Math.min(list.length - 1, state.stIndex + 1);
      else if (k === KEY.ENTER) {
        var st = list[state.stIndex];
        if (state.current && state.current.uuid === st.uuid && state.playState !== 'error') togglePause(); else play(st);
      }
      else if (k === KEY.YELLOW) toggleFav(list[state.stIndex]);
      else if (k === KEY.LEFT) state.zone = 'cats';
      else if (k === KEY.BACK || k === KEY.ESC) { window.close(); }
      else handled = false;
    }
    if (handled) { e.preventDefault(); render(); }
  });

  $('cats').addEventListener('click', function (e) {
    var el = e.target.closest('[data-c]'); if (!el) return;
    state.catIndex = +el.getAttribute('data-c'); state.stIndex = 0; state.zone = 'cats';
    if (cat().id === 'search') { openSearch(); return; }
    fetchList(cat()); render();
  });
  $('stations').addEventListener('click', function (e) {
    var el = e.target.closest('[data-s]'); if (!el) return;
    state.stIndex = +el.getAttribute('data-s'); state.zone = 'stations';
    play(stationsOf(cat())[state.stIndex]);
  });

  function tick() { var d = new Date(); $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  tick();
  setInterval(tick, 15000);

  state.catIndex = Math.max(0, Math.min(CATS.length - 1, state.catIndex));
  fetchList(cat());
  render();
})();
