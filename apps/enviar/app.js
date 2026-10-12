/* Enviar pra TV — receives links/media/text through an ntfy.sh topic (Chromium 68: no ?. / ??).
 *
 * The topic is a random secret created on first run (or set with launch param {"topic": "..."}).
 * Senders: the phone page (repo /send/, opened from the QR code) or `send-to-tv` on the Mac.
 */
(function () {
  'use strict';

  var NTFY = 'https://ntfy.sh/';
  var SENDER_PAGE = 'https://fabielsantos.github.io/webos-apps/send/';
  var YOUTUBE_APP = 'youtube.leanback.v4';
  var BROWSER_APP = 'com.webos.app.browser';
  var KEY = { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, ENTER: 13, BACK: 461, ESC: 27, RED: 403, DELETE: 46,
              PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412 };
  var HISTORY_MAX = 20, HISTORY_SHOWN = 8;

  var $ = function (id) { return document.getElementById(id); };
  var topic = load('enviar.topic', null) || newTopic();
  var history = load('enviar.history', []);
  var focus = -1;           // -1 = nothing focused, else index into history
  var viewerOpen = false;
  var source = null;
  var regenArmedUntil = 0;

  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return ('0' + n).slice(-2); }

  function newTopic() {
    var bytes = new Uint8Array(15), s = '';
    crypto.getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] % 36).toString(36);
    var t = 'tv-' + s;
    save('enviar.topic', t);
    return t;
  }

  // ---------- luna ----------
  function luna(uri, params) {
    return new Promise(function (resolve, reject) {
      if (typeof PalmServiceBridge === 'undefined') { reject(new Error('fora da TV')); return; }
      var b = new PalmServiceBridge();
      b.onservicecallback = function (msg) {
        var m; try { m = JSON.parse(msg); } catch (e) { m = {}; }
        if (m.returnValue === false) reject(new Error(m.errorText || 'erro')); else resolve(m);
      };
      b.call(uri, JSON.stringify(params));
    });
  }
  function launch(id, params) { return luna('luna://com.webos.applicationManager/launch', { id: id, params: params || {} }); }

  // ---------- classify incoming messages ----------
  var YT = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/;
  function extKind(url, mime) {
    var m = (mime || '').toLowerCase(), path = url.toLowerCase().split(/[?#]/)[0];
    if (m.indexOf('image/') === 0 || /\.(jpe?g|png|gif|webp|bmp)$/.test(path)) return 'image';
    if (m.indexOf('video/') === 0 || m === 'application/x-mpegurl' || /\.(mp4|webm|mkv|mov|m4v|m3u8|ts)$/.test(path)) return 'video';
    if (m.indexOf('audio/') === 0 || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/.test(path)) return 'audio';
    return null;
  }

  function classify(d) {
    var text = (d.message || '').trim();
    if (d.attachment && d.attachment.url) {
      return { kind: extKind(d.attachment.url, d.attachment.type) || 'web', url: d.attachment.url, text: d.attachment.name || text };
    }
    var single = /^https?:\/\/\S+$/.test(text) ? text : null;
    if (single) {
      var yt = YT.exec(single);
      if (yt) return { kind: 'youtube', url: single, id: yt[1], text: single };
      return { kind: extKind(single) || 'web', url: single, text: single };
    }
    return { kind: 'text', text: text || '(mensagem vazia)', title: d.title || '' };
  }

  var KIND_LABEL = { youtube: 'YouTube', video: 'Vídeo', audio: 'Áudio', image: 'Foto', web: 'Link', text: 'Texto' };

  // ---------- handling ----------
  function handle(item) {
    if (item.kind === 'youtube') {
      launch(YOUTUBE_APP, { contentTarget: 'v=' + item.id }).catch(function () {
        return launch(BROWSER_APP, { target: item.url });
      }).catch(function (e) { showError('Não consegui abrir o YouTube: ' + e.message); });
    } else if (item.kind === 'web') {
      launch(BROWSER_APP, { target: item.url }).catch(function (e) { showError('Não consegui abrir o navegador: ' + e.message); });
    } else {
      openViewer(item);
    }
  }

  function openViewer(item) {
    var v = $('viewer'), bar = '<div class="bar">' + esc(item.text || item.url || '') + '</div>';
    if (item.kind === 'image') v.innerHTML = '<img src="' + esc(item.url) + '">' + bar;
    else if (item.kind === 'video') v.innerHTML = '<video src="' + esc(item.url) + '" autoplay></video>' + bar;
    else if (item.kind === 'audio') v.innerHTML = '<div class="audio">♪ ' + esc(item.text) + '<br><audio src="' + esc(item.url) + '" autoplay controls></audio></div>';
    else v.innerHTML = '<div class="note">' + (item.title ? '<div class="from">' + esc(item.title) + '</div>' : '') + esc(item.text) + '</div>';
    var media = v.querySelector('video, audio, img');
    if (media) media.onerror = function () { showError('Não foi possível abrir este ' + KIND_LABEL[item.kind].toLowerCase() + '.<br>' + esc(item.url)); };
    v.className = 'viewer';
    viewerOpen = true;
    renderHints();
  }
  function showError(html) {
    $('viewer').innerHTML = '<div class="err">' + html + '</div>';
    $('viewer').className = 'viewer';
    viewerOpen = true;
    renderHints();
  }
  function closeViewer() {
    var v = $('viewer');
    v.innerHTML = '';   // stops playback
    v.className = 'viewer hidden';
    viewerOpen = false;
    renderHints();
  }

  // ---------- ntfy subscription ----------
  function setStatus(ok, text) {
    $('status').className = 'status' + (ok ? ' ok' : '');
    $('status').innerHTML = '<span class="dot"></span>' + text;
  }

  function subscribe() {
    if (source) source.close();
    setStatus(false, 'Conectando…');
    source = new EventSource(NTFY + topic + '/sse');
    source.onopen = function () { setStatus(true, 'Pronto para receber'); };
    source.onerror = function () { setStatus(false, 'Sem conexão — tentando de novo…'); };
    source.onmessage = function (e) {
      var d; try { d = JSON.parse(e.data); } catch (err) { return; }
      if (d.event !== 'message') return;
      var item = classify(d);
      item.at = Date.now();
      history.unshift(item);
      history = history.slice(0, HISTORY_MAX);
      save('enviar.history', history);
      focus = -1;
      renderHistory();
      handle(item);
    };
  }

  // ---------- rendering ----------
  function renderQR() {
    var url = SENDER_PAGE + '#t=' + topic;  // in the fragment, so it never reaches GitHub's servers
    var qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
    $('channel').innerHTML = 'Canal secreto: <b>' + esc(topic) + '</b>';
  }

  function renderHistory() {
    var shown = history.slice(0, HISTORY_SHOWN);
    if (!shown.length) { $('history').innerHTML = '<div class="empty">Nada recebido ainda.</div>'; renderHints(); return; }
    $('history').innerHTML = shown.map(function (it, i) {
      var d = new Date(it.at);
      return '<div class="item' + (i === focus ? ' focused' : '') + '" data-i="' + i + '"><span class="kind">' + KIND_LABEL[it.kind] +
        '</span><span class="text">' + esc(it.text || it.url) + '</span><span class="time">' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</span></div>';
    }).join('');
    renderHints();
  }

  function renderHints() {
    var h;
    if (viewerOpen) h = '<span><span class="key">OK</span>pausar / continuar</span><span><span class="key">◄►</span>voltar / avançar 10 s</span><span><span class="key">VOLTAR</span>fechar</span>';
    else h = (history.length ? '<span><span class="key">▲▼</span>recebidos</span><span><span class="key">OK</span>abrir de novo</span>' : '') +
      '<span><span class="key red">●</span>' + (Date.now() < regenArmedUntil ? '<b>aperte de novo</b> para trocar o canal' : 'novo canal secreto') + '</span>' +
      '<span><span class="key">VOLTAR</span>sair</span>';
    $('hints').innerHTML = h;
  }

  // ---------- keys ----------
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (viewerOpen) {
      var media = $('viewer').querySelector('video, audio');
      if (k === KEY.BACK || k === KEY.ESC || k === KEY.STOP) closeViewer();
      else if (media && (k === KEY.ENTER || k === KEY.PLAY || k === KEY.PAUSE)) { if (media.paused) media.play(); else media.pause(); }
      else if (media && (k === KEY.RIGHT || k === KEY.FF)) media.currentTime += 10;
      else if (media && (k === KEY.LEFT || k === KEY.RW)) media.currentTime = Math.max(0, media.currentTime - 10);
      else return;
      e.preventDefault();
      return;
    }
    var n = Math.min(history.length, HISTORY_SHOWN);
    if (k === KEY.DOWN && n) focus = Math.min(n - 1, focus + 1);
    else if (k === KEY.UP && n) focus = Math.max(0, focus - 1);
    else if (k === KEY.ENTER && focus >= 0) { handle(history[focus]); e.preventDefault(); return; }
    else if (k === KEY.RED || k === KEY.DELETE) {
      if (Date.now() < regenArmedUntil) { regenArmedUntil = 0; topic = newTopic(); renderQR(); subscribe(); }
      else { regenArmedUntil = Date.now() + 4000; setTimeout(renderHints, 4100); }
      renderHints();
    }
    else if (k === KEY.BACK || k === KEY.ESC) { e.preventDefault(); window.close(); return; }
    else return;
    e.preventDefault();
    renderHistory();
  });

  $('history').addEventListener('click', function (e) {
    var el = e.target.closest('[data-i]');
    if (el) handle(history[+el.getAttribute('data-i')]);
  });

  // ---------- launch params: {"topic": "..."} lets the Mac set up a shared channel ----------
  function applyParams(p) {
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = {}; } }
    if (p && typeof p.topic === 'string' && /^[\w-]{8,64}$/.test(p.topic) && p.topic !== topic) {
      topic = p.topic;
      save('enviar.topic', topic);
      renderQR();
      subscribe();
    }
  }
  document.addEventListener('webOSRelaunch', function (e) { applyParams(e.detail); });

  renderQR();
  renderHistory();
  if (window.PalmSystem && PalmSystem.launchParams) applyParams(PalmSystem.launchParams);
  subscribe();
})();
