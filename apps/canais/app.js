/* Canais — live channels from M3U playlists, native HLS playback (Chromium 68: no ?. / ??).
 *
 * Extra playlists via launch params: {"m3u": "https://.../list.m3u", "name": "Minha lista"}  ({"m3u": null, "name": ...} removes it)
 */
(function () {
  'use strict';

  var IPTV = 'https://iptv-org.github.io/iptv/';
  var BUILTIN = [
    { id: 'br', name: 'Brasil', url: IPTV + 'countries/br.m3u' },
    { id: 'por', name: 'Em português', url: IPTV + 'languages/por.m3u' },
    { id: 'pt', name: 'Portugal', url: IPTV + 'countries/pt.m3u' },
    { id: 'ca', name: 'Canadá', url: IPTV + 'countries/ca.m3u' }
  ];
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, ESC: 27, YELLOW: 405, CH_UP: 33, CH_DOWN: 34,
              PLAY: 415, PAUSE: 19, STOP: 413, INFO: 457 };
  var VISIBLE = 12;           // channel rows rendered around the focus
  var LOAD_TIMEOUT_MS = 15000;
  // Stream health is checked on the TV itself (its own network/region): about half of the public
  // lists are geo-blocked (HTTP 403), offline or gone, and the player reports all of those as
  // "source not supported". Only channels whose HLS playlist answers are shown.
  var PROBE_TIMEOUT_MS = 7000, PROBE_WORKERS = 10;
  var GOOD_TTL = 12 * 3600 * 1000, BAD_TTL = 6 * 3600 * 1000;

  var $ = function (id) { return document.getElementById(id); };
  var video = $('video');

  var state = {
    zone: 'sources',                       // sources | channels | player
    srcIndex: 1,                           // 0 = favorites
    chIndex: 0,
    playing: null,                         // index in the playing list
    playingList: null,
    lists: {},                             // source id -> { channels, error, loading }
    favs: load('canais.favs', []),
    custom: load('canais.custom', []),
    health: load('canais.health', {}),     // url -> { ok, at }
    zapDir: 0                              // +1/-1 while zapping, 0 when opened from the list
  };
  var osdTimer = null, loadTimer = null, renderTimer = null, saveTimer = null;

  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return ('0' + n).slice(-2); }

  function sources() {
    return [{ id: 'fav', name: '★ Favoritos' }].concat(BUILTIN, state.custom.map(function (c, i) {
      return { id: 'custom' + i, name: c.name || 'Lista ' + (i + 1), url: c.url };
    }));
  }
  function currentSource() { return sources()[state.srcIndex]; }
  function channelsOf(src) {
    if (src.id === 'fav') return state.favs;
    var l = state.lists[src.id];
    return l && l.channels ? l.channels.filter(function (ch) { return verdict(ch.url) === true; }) : [];
  }
  function isFav(ch) { return state.favs.some(function (f) { return f.url === ch.url; }); }

  // ---------- M3U ----------
  function parseM3U(text) {
    var lines = text.split(/\r?\n/), out = [], seen = {}, meta = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXTINF') === 0) {
        var attrs = {}, re = /([\w-]+)="([^"]*)"/g, m;
        while ((m = re.exec(line))) attrs[m[1]] = m[2];
        var lastQuote = line.lastIndexOf('"');
        var comma = line.indexOf(',', lastQuote > 0 ? lastQuote : 0);
        var name = comma >= 0 ? line.slice(comma + 1).trim() : 'Canal';
        meta = { name: name, logo: attrs['tvg-logo'] || '', group: (attrs['group-title'] || '').split(';')[0] };
      } else if (line.charAt(0) !== '#' && meta) {
        if (!seen[line]) { seen[line] = true; meta.url = line; out.push(meta); }
        meta = null;
      }
    }
    return out;
  }

  function loadSource(src) {
    if (src.id === 'fav' || state.lists[src.id]) return;
    state.lists[src.id] = { loading: true };
    fetch(src.url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      state.lists[src.id] = { channels: parseM3U(t), checked: 0 };
      render();
      verifyList(src.id);
    }).catch(function (e) {
      state.lists[src.id] = { error: e.message || String(e) };
      render();
    });
  }

  // ---------- stream health ----------
  function verdict(url) {
    var h = state.health[url];
    if (!h) return undefined;
    return Date.now() - h.at < (h.ok ? GOOD_TTL : BAD_TTL) ? h.ok : undefined;
  }
  function setHealth(url, ok) {
    state.health[url] = { ok: ok, at: Date.now() };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      // drop stale entries so localStorage stays small
      var now = Date.now(), keep = {};
      Object.keys(state.health).forEach(function (u) { if (now - state.health[u].at < GOOD_TTL) keep[u] = state.health[u]; });
      state.health = keep;
      save('canais.health', keep);
    }, 2000);
  }
  function scheduleRender() { if (!renderTimer) renderTimer = setTimeout(function () { renderTimer = null; if (state.zone !== 'player') render(); }, 600); }

  // HLS playlists only: read the first bytes, then abort (never download a whole video file)
  function probe(url) {
    if (!/^https?:\/\//i.test(url) || /\.mpd(\?|$)/i.test(url)) return Promise.resolve(false);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, PROBE_TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal }).then(function (r) {
      if (!r.ok || !r.body) { ctrl.abort(); return false; }
      return r.body.getReader().read().then(function (chunk) {
        ctrl.abort();
        var head = chunk.value ? String.fromCharCode.apply(null, chunk.value.subarray(0, 16)) : '';
        return head.replace(/^\uFEFF/, '').indexOf('#EXTM3U') === 0;
      });
    }).catch(function () { return false; }).then(function (ok) { clearTimeout(timer); return ok; });
  }

  function verifyList(id) {
    var l = state.lists[id];
    var queue = l.channels.filter(function (ch) { return verdict(ch.url) === undefined; });
    l.checked = l.channels.length - queue.length;
    function worker() {
      var ch = queue.shift();
      if (!ch) return Promise.resolve();
      return probe(ch.url).then(function (ok) { setHealth(ch.url, ok); l.checked++; scheduleRender(); return worker(); });
    }
    var workers = [];
    for (var i = 0; i < PROBE_WORKERS; i++) workers.push(worker());
    Promise.all(workers).then(function () { l.checked = l.channels.length; scheduleRender(); });
  }

  // ---------- rendering ----------
  function logoHTML(ch) {
    var initials = ch.name.replace(/[^\wÀ-ú ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
    return ch.logo ? '<img src="' + esc(ch.logo) + '" onerror="this.outerHTML=\'<span class=ph>' + esc(initials) + '</span>\'">'
                   : '<span class="ph">' + esc(initials) + '</span>';
  }

  function renderSources() {
    $('sources').innerHTML = sources().map(function (s, i) {
      var list = s.id === 'fav' ? { channels: state.favs } : state.lists[s.id];
      var count = list && list.channels ? channelsOf(s).length + (list.checked !== undefined && list.checked < list.channels.length ? '…' : '') : '';
      var cls = 'src' + (i === state.srcIndex ? (state.zone === 'sources' ? ' focused' : ' active') : '');
      return '<div class="' + cls + '" data-s="' + i + '"><span>' + esc(s.name) + '</span><span class="count">' + count + '</span></div>';
    }).join('');
  }

  function renderChannels() {
    var src = currentSource(), list = src.id === 'fav' ? null : state.lists[src.id];
    var chans = channelsOf(src);
    var checking = list && list.channels && list.checked < list.channels.length;
    $('list-title').textContent = src.name + (list && list.channels
      ? ' · ' + chans.length + ' funcionando' + (checking ? ' · verificando ' + list.checked + '/' + list.channels.length
                                                          : ' de ' + list.channels.length + ' (os outros estão fora do ar ou bloqueados na sua região)')
      : (chans.length ? ' · ' + chans.length + ' canais' : ''));
    var box = $('channels');
    box.className = 'channels' + (state.zone === 'channels' ? '' : ' dim');
    if (list && list.loading) { box.innerHTML = '<div class="msg">Carregando lista…</div>'; return; }
    if (list && list.error) { box.innerHTML = '<div class="msg">Falha ao carregar a lista: ' + esc(list.error) + '<br>Pressione OK para tentar de novo.</div>'; return; }
    if (!chans.length) {
      box.innerHTML = '<div class="msg">' + (src.id === 'fav' ? 'Nenhum favorito ainda. Na lista ou assistindo, aperte o botão <b>amarelo</b> para favoritar.'
        : checking ? 'Verificando quais canais funcionam…' : 'Nenhum canal desta lista está funcionando agora.') + '</div>';
      return;
    }
    state.chIndex = Math.max(0, Math.min(chans.length - 1, state.chIndex));
    var start = Math.max(0, Math.min(state.chIndex - 4, chans.length - VISIBLE));
    var html = '';
    for (var i = start; i < Math.min(chans.length, start + VISIBLE); i++) {
      var ch = chans[i];
      html += '<div class="ch' + (i === state.chIndex ? ' focused' : '') + '" data-c="' + i + '"><div class="logo">' + logoHTML(ch) + '</div>' +
        '<div class="name">' + esc(ch.name) + '</div><div class="group">' + esc(ch.group) + '</div><div class="fav">' + (isFav(ch) ? '★' : '') + '</div></div>';
    }
    box.innerHTML = html;
  }

  function renderHints() {
    var h;
    if (state.zone === 'sources') h = '<span><span class="key">▲▼</span>listas</span><span><span class="key">OK / ►</span>canais</span><span><span class="key">VOLTAR</span>sair</span>';
    else if (state.zone === 'channels') h = '<span><span class="key">▲▼</span>canais</span><span><span class="key">OK</span>assistir</span>' +
      '<span><span class="key yellow">●</span>favorito</span><span><span class="key">◄</span>listas</span><span><span class="key">VOLTAR</span>sair</span>';
    else h = '';
    $('hints').innerHTML = h;
  }

  function render() { renderSources(); renderChannels(); renderHints(); }

  // ---------- player ----------
  function play(list, index, dir) {
    if (!list.length) return;
    state.zapDir = dir || 0;
    index = (index + list.length) % list.length;
    // while zapping, jump over channels already known to be down
    for (var hop = 0; dir && hop < list.length && verdict(list[index].url) === false; hop++) index = (index + dir + list.length) % list.length;
    state.playingList = list;
    state.playing = index;
    var ch = list[index];
    state.zone = 'player';
    $('browse').className = 'browse hidden';
    $('player').className = 'player';
    status('Carregando…', false);
    showOSD();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(function () { if (video.readyState < 2) unavailable('não respondeu em 15 s'); }, LOAD_TIMEOUT_MS);
    video.src = ch.url;
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* errors handled by the error event */ });
  }

  function stop() {
    clearTimeout(loadTimer);
    video.pause();
    video.removeAttribute('src');
    video.load();
    $('player').className = 'player hidden';
    $('browse').className = 'browse';
    state.zone = 'channels';
    // keep the list focus on the channel that was playing, if it is still in the list on screen
    var url = state.playingList[state.playing].url;
    channelsOf(currentSource()).forEach(function (ch, i) { if (ch.url === url) state.chIndex = i; });
    render();
  }

  function status(text, err) { $('pstatus').className = 'pstatus' + (err ? ' err' : ''); $('pstatus').innerHTML = text; }
  var skips = 0;
  function unavailable(why) {
    clearTimeout(loadTimer);
    var list = state.playingList, idx = state.playing, ch = list[idx];
    setHealth(ch.url, false);   // hidden from the list from now on (re-checked in a few hours)
    showOSD(true);
    if (state.zapDir && ++skips < list.length) {
      status('Canal indisponível (' + esc(why) + ') — pulando para o próximo…', true);
      setTimeout(function () { if (state.zone === 'player' && state.playing === idx) play(list, idx + state.zapDir, state.zapDir); }, 1200);
    } else {
      status('Canal indisponível agora (' + esc(why) + ').<br><small>Ele sai da lista. ▲▼ troca de canal · VOLTAR volta para a lista</small>', true);
    }
  }

  video.addEventListener('playing', function () {
    clearTimeout(loadTimer);
    skips = 0;
    status('', false);
    setHealth(state.playingList[state.playing].url, true);
  });
  video.addEventListener('waiting', function () { if (state.zone === 'player') status('Carregando…', false); });
  video.addEventListener('error', function () {
    var codes = { 1: 'cancelado', 2: 'erro de rede', 3: 'formato não suportado', 4: 'fonte não suportada' };
    unavailable(codes[video.error && video.error.code] || 'erro');
  });

  function showOSD(sticky) {
    var list = state.playingList, ch = list[state.playing];
    $('osd').innerHTML = '<div class="logo">' + logoHTML(ch) + '</div><div><div class="num">' + (state.playing + 1) + ' / ' + list.length + '</div>' +
      '<div class="name">' + esc(ch.name) + (isFav(ch) ? ' <span style="color:#facc15">★</span>' : '') + '</div><div class="meta">' + esc(ch.group || '') + '</div></div>' +
      '<div class="help">▲▼ / CH± trocar canal · <span class="key yellow">●</span> favorito<br>OK informações · VOLTAR lista</div>';
    $('osd').className = 'osd show';
    clearTimeout(osdTimer);
    if (!sticky) osdTimer = setTimeout(function () { $('osd').className = 'osd'; }, 4500);
  }

  function toggleFav(ch) {
    if (!ch) return;
    if (isFav(ch)) state.favs = state.favs.filter(function (f) { return f.url !== ch.url; });
    else state.favs.push({ name: ch.name, url: ch.url, logo: ch.logo, group: ch.group });
    save('canais.favs', state.favs);
  }

  // ---------- keys ----------
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode, handled = true;
    if (state.zone === 'player') {
      if (k === KEY.UP || k === KEY.CH_UP) play(state.playingList, state.playing + 1, 1);
      else if (k === KEY.DOWN || k === KEY.CH_DOWN) play(state.playingList, state.playing - 1, -1);
      else if (k === KEY.ENTER || k === KEY.INFO) showOSD();
      else if (k === KEY.YELLOW) { toggleFav(state.playingList[state.playing]); showOSD(); }
      else if (k === KEY.PAUSE) video.pause();
      else if (k === KEY.PLAY) video.play();
      else if (k === KEY.BACK || k === KEY.ESC || k === KEY.STOP) stop();
      else handled = false;
    } else if (state.zone === 'sources') {
      var n = sources().length;
      if (k === KEY.UP) { state.srcIndex = Math.max(0, state.srcIndex - 1); state.chIndex = 0; }
      else if (k === KEY.DOWN) { state.srcIndex = Math.min(n - 1, state.srcIndex + 1); state.chIndex = 0; }
      else if (k === KEY.ENTER || k === KEY.RIGHT) {
        var src = currentSource(), l = state.lists[src.id];
        if (l && l.error) { delete state.lists[src.id]; }
        else if (channelsOf(src).length) state.zone = 'channels';
      }
      else if (k === KEY.BACK || k === KEY.ESC) { window.close(); }
      else handled = false;
      loadSource(currentSource());
      save('canais.src', state.srcIndex);
      render();
    } else { // channels
      var chans = channelsOf(currentSource());
      if (k === KEY.UP) state.chIndex = Math.max(0, state.chIndex - 1);
      else if (k === KEY.DOWN) state.chIndex = Math.min(chans.length - 1, state.chIndex + 1);
      else if (k === KEY.CH_UP) state.chIndex = Math.max(0, state.chIndex - VISIBLE);
      else if (k === KEY.CH_DOWN) state.chIndex = Math.min(chans.length - 1, state.chIndex + VISIBLE);
      else if (k === KEY.ENTER) { play(chans, state.chIndex); e.preventDefault(); return; }
      else if (k === KEY.YELLOW) toggleFav(chans[state.chIndex]);
      else if (k === KEY.LEFT) state.zone = 'sources';
      else if (k === KEY.BACK || k === KEY.ESC) { window.close(); }
      else handled = false;
      render();
    }
    if (handled) e.preventDefault();
  });

  // Magic Remote / mouse
  $('sources').addEventListener('click', function (e) {
    var el = e.target.closest('[data-s]'); if (!el) return;
    state.srcIndex = +el.getAttribute('data-s'); state.chIndex = 0; state.zone = 'sources';
    loadSource(currentSource()); render();
  });
  $('channels').addEventListener('click', function (e) {
    var el = e.target.closest('[data-c]'); if (!el) return;
    state.chIndex = +el.getAttribute('data-c');
    play(channelsOf(currentSource()), state.chIndex);
  });

  // ---------- launch params: extra playlists ----------
  function applyParams(p) {
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = {}; } }
    if (!p || !('m3u' in p)) return;
    var name = p.name || 'Minha lista';
    state.custom = state.custom.filter(function (c) { return c.name !== name; });
    if (p.m3u) state.custom.push({ name: name, url: p.m3u });
    save('canais.custom', state.custom);
    Object.keys(state.lists).forEach(function (id) { if (id.indexOf('custom') === 0) delete state.lists[id]; });
    render();
  }
  document.addEventListener('webOSRelaunch', function (e) { applyParams(e.detail); });
  if (window.PalmSystem && PalmSystem.launchParams) applyParams(PalmSystem.launchParams);

  function tick() { var d = new Date(); $('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  tick();
  setInterval(tick, 15000);

  state.srcIndex = Math.min(load('canais.src', 1), sources().length - 1);
  loadSource(currentSource());
  render();
})();
