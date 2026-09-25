'use strict';

/* Classic skin: Winamp 2.x-style windows (main, playlist editor, video,
 * library) floating on a desktop, driven by the player in app.js through
 * window.Encore. Loaded before app.js so the YouTube player can be moved
 * into the video window before it is created. */

(() => {
  const SKIN_KEY = 'encore.skin';
  const UI_KEY = 'encore.classic';

  const readSkin = () => { try { return localStorage.getItem(SKIN_KEY) || 'classic'; } catch { return 'classic'; } };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-skin]');
    if (!b) return;
    try { localStorage.setItem(SKIN_KEY, b.dataset.skin); } catch { /* private mode */ }
    location.reload();
  });
  document.querySelectorAll('[data-skin]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.skin === readSkin())));
  if (readSkin() !== 'classic') return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const E = () => window.Encore;

  // ---------------------------------------------------------------- saved window layout

  const ui = (() => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { /* defaults */ }
    return {
      scale: [1.5, 2, 3].includes(s.scale) ? s.scale : 0, // 0 = pick for this screen
      pos: s.pos && typeof s.pos === 'object' ? s.pos : {},
      open: { pl: true, video: true, lib: true, ...(s.open || {}) },
      plH: Number(s.plH) || 232,
      libH: Number(s.libH) || 164,
      vis: ['spectrum', 'osc', 'off'].includes(s.vis) ? s.vis : 'spectrum',
      remaining: !!s.remaining,
      balance: 0,
    };
  })();
  const saveUi = () => {
    const { scale, pos, open, plH, libH, vis, remaining } = ui;
    try { localStorage.setItem(UI_KEY, JSON.stringify({ scale, pos, open, plH, libH, vis, remaining })); } catch { /* ignore */ }
  };

  // ---------------------------------------------------------------- glyphs

  const svg = (vb, body) => `<svg viewBox="0 0 ${vb}" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
  // Embossed transport glyphs: light line offset under a dark one, like the original bitmaps.
  const emboss = (d) => `<path d="${d}" fill="none" stroke="#efffff" stroke-width="1" transform="translate(1 1)"/><path d="${d}" fill="none" stroke="#4a5a6b" stroke-width="1"/>`;
  const G = {
    prev: svg('23 18', emboss('M7.5 4.5v9M16.5 4.5l-7 4.5 7 4.5z')),
    play: svg('23 18', emboss('M8.5 4.5l7 4.5-7 4.5z')),
    pause: svg('23 18', emboss('M7.5 4.5h3v9h-3zM12.5 4.5h3v9h-3z')),
    stop: svg('23 18', emboss('M7.5 4.5h8v9h-8z')),
    next: svg('22 18', emboss('M14.5 4.5v9M6.5 4.5l7 4.5-7 4.5z')),
    eject: svg('22 16', emboss('M6.5 8.5l4.5-4 4.5 4zM6.5 11.5h9')),
    repeat: svg('16 8', '<path d="M2.5 5.5v-3h11v3h-8M7.5 3.5l-2 2 2 2" fill="none" stroke="#2f374d"/>'),
    menu: svg('9 9', '<path d="M1 2h7v5H1z" fill="#1e1f25" stroke="#ecce7a"/><path d="M3 4.5h3" stroke="#ecce7a"/>'),
    min: svg('7 7', '<path d="M1 5.5h5" stroke="#1e1f25"/>'),
    shade: svg('7 7', '<path d="M1 1.5h5M1 5.5h5" stroke="#1e1f25"/>'),
    close: svg('7 7', '<path d="M1.5 1.5l4 4M5.5 1.5l-4 4" stroke="#1e1f25"/>'),
    logo: svg('14 15', '<circle cx="7" cy="7.5" r="6.5" fill="#1e1f25" stroke="#ecce7a"/><path d="M8 3.5v6.2a1.6 1.6 0 1 1-1-1.5V3.5h3v1.4H8z" fill="#ecce7a"/>'),
    sPlay: svg('9 9', '<path d="M2 1h1v7H2zM3 1.5l5 3-5 3z" fill="#00e800"/>'),
    sPause: svg('9 9', '<path d="M2 1h2v7H2zM5 1h2v7H5z" fill="#00e800"/>'),
    sStop: svg('9 9', '<path d="M1 1h7v7H1z" fill="#00e800"/>'),
    miniPrev: svg('8 9', '<path d="M1 2h1v5H1zM7 2L3 4.5 7 7z" fill="#ecce7a"/>'),
    miniPlay: svg('8 9', '<path d="M2 2l5 2.5L2 7z" fill="#ecce7a"/>'),
    miniPause: svg('8 9', '<path d="M2 2h1.5v5H2zM4.5 2H6v5H4.5z" fill="#ecce7a"/>'),
    miniStop: svg('8 9', '<path d="M2 2h5v5H2z" fill="#ecce7a"/>'),
    miniNext: svg('8 9', '<path d="M6 2h1v5H6zM1 2l4 2.5L1 7z" fill="#ecce7a"/>'),
    miniEject: svg('8 9', '<path d="M1 5l3-3 3 3zM1 6h6v1H1z" fill="#ecce7a"/>'),
  };

  // 7-segment digits in the 9x13 cell of the original time display.
  const SEG = { a: [2, 1, 5, 1], b: [6, 2, 2, 4], c: [6, 7, 2, 4], d: [2, 11, 5, 1], e: [1, 7, 2, 4], f: [1, 2, 2, 4], g: [2, 6, 5, 1] };
  const DIGITS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  const digitSvg = (ch) => {
    const on = ch === '-' ? 'g' : ch === ' ' ? '' : DIGITS[+ch] || '';
    return svg('9 13', [...on].map((k) => { const [x, y, w, h] = SEG[k]; return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#00f800"/>`; }).join(''));
  };

  // Visualizer colors from the original skin's viscolor.txt.
  const VIS = ['#000000', '#182129', '#ef3110', '#ce2910', '#d65a00', '#d66600', '#d67300', '#c67b08', '#dea518', '#d6b521', '#bdde29', '#94de21', '#29ce10', '#32be10', '#39b510', '#319c08', '#299400', '#188408', '#ffffff', '#d6d6de', '#b5bdbd', '#a0aaaf', '#949ca5', '#969696'];
  // Volume bar color at each of the original's 28 steps.
  const VOL = ['#15800a', '#2e9c12', '#4fa423', '#5cc02a', '#6bc02a', '#72c72a', '#81c72a', '#90c731', '#90c731', '#a6c731', '#aec02a', '#aec02a', '#aec02a', '#aec02a', '#c5c02a', '#c5b12a', '#c5b12a', '#c5b12a', '#c59c23', '#c58023', '#c58023', '#bf6d1b', '#ae6a0d', '#c5651b', '#c5511b', '#c5431b', '#c52712', '#c50c12'];

  // ---------------------------------------------------------------- build the windows

  const titleBar = (text, buttons) => `
    <div class="wa-title" data-drag>
      ${buttons.includes('menu') ? `<button class="wa-tbtn menu" data-act="menu" aria-label="Main menu">${G.menu}</button>` : ''}
      <div class="wa-stripe"></div><div class="wa-title-text wa-pix">${text}</div><div class="wa-stripe"></div>
      ${buttons.includes('min') ? `<button class="wa-tbtn" data-act="minimize" aria-label="Minimize">${G.min}</button>` : ''}
      ${buttons.includes('shade') ? `<button class="wa-tbtn" data-act="size" aria-label="Change size">${G.shade}</button>` : ''}
      <button class="wa-tbtn" data-act="close" aria-label="Close">${G.close}</button>
    </div>`;

  const desk = document.createElement('div');
  desk.className = 'wa-desktop';
  desk.innerHTML = `
    <button class="wa-icon" id="wa-icon" hidden title="Double-click to open"><img src="icons/icon.svg" alt=""><span>Encore</span></button>

    <div class="wa-win wa-main wa-active" data-win="main" role="region" aria-label="Encore player">
      ${titleBar('Encore', ['menu', 'min', 'shade'])}
      <div class="wa-lcd"></div>
      <div class="wa-clutter wa-pix">
        <button data-act="menu" title="Options">O</button>
        <button data-act="ontop" title="Always on top">A</button>
        <button data-act="info" title="Open on YouTube">I</button>
        <button data-act="size" title="Double size (Ctrl+D)" id="wa-c-d">D</button>
        <button data-act="vis" title="Visualization mode">V</button>
      </div>
      <div class="wa-status" id="wa-status"></div>
      <div class="wa-colon" id="wa-colon" hidden></div>
      <div class="wa-time" id="wa-time" title="Click: elapsed / remaining"></div>
      <canvas class="wa-vis" id="wa-vis" title="Click to change visualization"></canvas>
      <div class="wa-marquee wa-pix"><span id="wa-marquee"></span></div>
      <div class="wa-small wa-kbps wa-pix" id="wa-kbps"></div>
      <div class="wa-label kbps wa-pix">kbps</div>
      <div class="wa-small wa-khz wa-pix" id="wa-khz"></div>
      <div class="wa-label khz wa-pix">kHz</div>
      <div class="wa-ms wa-mono wa-pix" id="wa-mono">mono</div>
      <div class="wa-ms wa-stereo wa-pix" id="wa-stereo">stereo</div>
      <div class="wa-slider wa-volume" id="wa-volume" role="slider" aria-label="Volume"><div class="wa-bar"></div><div class="wa-thumb-small"></div></div>
      <div class="wa-slider wa-balance" id="wa-balance" role="slider" aria-label="Balance"><div class="wa-bar"></div><div class="wa-thumb-small"></div></div>
      <button class="wa-btn wa-eqbtn wa-pix" data-act="eq"><span class="wa-led"></span>EQ</button>
      <button class="wa-btn wa-plbtn wa-pix" data-act="pl" id="wa-plbtn"><span class="wa-led"></span>PL</button>
      <div class="wa-slider wa-position empty" id="wa-position" role="slider" aria-label="Seek"><div class="wa-thumb-pos"></div></div>
      <button class="wa-btn wa-tr wa-prev" data-act="prev" aria-label="Previous (Z)">${G.prev}</button>
      <button class="wa-btn wa-tr wa-play" data-act="play" aria-label="Play (X)">${G.play}</button>
      <button class="wa-btn wa-tr wa-pause" data-act="pause" aria-label="Pause (C)">${G.pause}</button>
      <button class="wa-btn wa-tr wa-stop" data-act="stop" aria-label="Stop (V)">${G.stop}</button>
      <button class="wa-btn wa-tr wa-next" data-act="next" aria-label="Next (B)">${G.next}</button>
      <button class="wa-btn wa-eject" data-act="eject" aria-label="Open (L)">${G.eject}</button>
      <button class="wa-btn wa-shuffle wa-pix" data-act="shuffle" id="wa-shuffle" aria-label="Shuffle (S)"><span class="wa-led"></span>shuffle</button>
      <button class="wa-btn wa-repeat" data-act="repeat" id="wa-repeat" aria-label="Repeat (R)"><span class="wa-led"></span>${G.repeat}<span class="one wa-pix">1</span></button>
      <button class="wa-logo" data-act="about" aria-label="About">${G.logo}</button>
    </div>

    <div class="wa-win wa-gen wa-pl" data-win="pl" role="region" aria-label="Playlist editor">
      ${titleBar('Encore Playlist', [])}
      <div class="wa-body">
        <div class="wa-list" id="wa-pl-list" tabindex="0"></div>
        <div class="wa-scroll" id="wa-pl-scroll"><div class="h"></div></div>
      </div>
      <div class="wa-bottom">
        <button class="wa-btn wa-pbtn wa-add wa-pix" data-act="pl-add">add</button>
        <button class="wa-btn wa-pbtn wa-rem wa-pix" data-act="pl-rem">rem</button>
        <button class="wa-btn wa-pbtn wa-sel wa-pix" data-act="pl-sel">sel</button>
        <button class="wa-btn wa-pbtn wa-misc wa-pix" data-act="pl-misc">misc</button>
        <div class="wa-info wa-pix" id="wa-pl-info"></div>
        <div class="wa-mini">
          <button data-act="prev" aria-label="Previous">${G.miniPrev}</button>
          <button data-act="play" aria-label="Play">${G.miniPlay}</button>
          <button data-act="pause" aria-label="Pause">${G.miniPause}</button>
          <button data-act="stop" aria-label="Stop">${G.miniStop}</button>
          <button data-act="next" aria-label="Next">${G.miniNext}</button>
          <button data-act="eject" aria-label="Open">${G.miniEject}</button>
        </div>
        <div class="wa-minitime wa-pix" id="wa-pl-time"></div>
        <button class="wa-btn wa-pbtn wa-opts wa-pix" data-act="pl-list">list<br>opts</button>
        <div class="wa-grip" data-resize="plH"></div>
      </div>
    </div>

    <div class="wa-win wa-gen wa-video" data-win="video" role="region" aria-label="Video">
      ${titleBar('Encore Video', [])}
      <div class="wa-body" id="wa-video-body"></div>
      <div class="wa-foot"><div class="wa-foot-text wa-pix" id="wa-video-foot"></div></div>
    </div>

    <div class="wa-win wa-gen wa-lib" data-win="lib" role="region" aria-label="Library">
      ${titleBar('Encore Library', [])}
      <div class="wa-body">
        <div class="wa-libbar">
          <button class="wa-tab wa-pix on" data-libtab="search">search</button>
          <button class="wa-tab wa-pix" data-libtab="lists">playlists</button>
        </div>
        <form class="wa-searchrow" id="wa-search" autocomplete="off">
          <input type="search" id="wa-search-input" placeholder="Search YouTube or paste a link" enterkeyhint="search" aria-label="Search YouTube">
          <button class="wa-tab wa-pix" type="submit">go</button>
        </form>
        <div class="wa-list" id="wa-lib-list" tabindex="0"></div>
        <div class="wa-scroll" id="wa-lib-scroll"><div class="h"></div></div>
      </div>
      <div class="wa-foot"><div class="wa-foot-text wa-pix" id="wa-lib-foot"></div><div class="wa-grip" data-resize="libH"></div></div>
    </div>

    <div class="wa-dialog" id="wa-prefs" role="dialog" aria-label="Preferences" hidden>
      <div class="wa-dialog-title"><span>Encore Preferences</span><button data-act="prefs-close" aria-label="Close">×</button></div>
      <div class="wa-dialog-body" id="wa-prefs-body"></div>
    </div>`;

  document.body.classList.add('skin-classic');
  document.body.prepend(desk);
  $('#wa-video-body').append($('.video-wrap'));            // the YouTube player lives here now
  const settingsPanel = $('#panel-settings');
  $('#wa-prefs-body').append(settingsPanel);
  settingsPanel.hidden = false;

  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap';
  document.head.append(font);

  const win = (name) => $(`[data-win="${name}"]`, desk);

  // ---------------------------------------------------------------- layout

  let stacked = false;
  let z = 10;

  function pickScale() {
    const w = innerWidth, h = innerHeight;
    if (w >= 3400 && h >= 1900) return 3;
    if (w >= 2400 && h >= 1300) return 2;
    return 1.5;
  }

  function layout() {
    stacked = innerWidth < 2 * 275 * 1.5 + 48 || innerHeight < 348 * 1.5 + 32;
    document.body.classList.toggle('wa-desk', !stacked);
    desk.classList.toggle('wa-stack', stacked);
    const s = stacked ? Math.min(innerWidth / 275, 3) : (ui.scale || pickScale());
    desk.style.setProperty('--s', s);
    win('pl').style.height = `${(stacked ? 200 : ui.plH) * s}px`;
    win('lib').style.height = `${(stacked ? 260 : ui.libH) * s}px`;
    for (const n of ['pl', 'video', 'lib']) win(n).hidden = !ui.open[n];
    $('#wa-plbtn').classList.toggle('on', ui.open.pl);
    $('#wa-c-d').classList.toggle('on', s >= 2);
    if (stacked) return;
    // Default: docked together in the bottom-right corner, like windows snapped on a PC desktop.
    const W = 275 * s, gap = 16;
    const colA = innerWidth - gap - W, colB = colA - W;
    const bottom = innerHeight - gap;
    const mainTop = bottom - (116 + ui.plH) * s;
    const defaults = {
      main: { x: colA, y: mainTop },
      pl: { x: colA, y: mainTop + 116 * s },
      video: { x: colB, y: mainTop },
      lib: { x: colB, y: mainTop + videoHeight() },
    };
    for (const n of ['main', 'pl', 'video', 'lib']) {
      const p = ui.pos[n] || defaults[n];
      place(win(n), p.x, p.y);
    }
  }

  function videoHeight() {
    const el = win('video');
    return el.hidden ? 0 : el.getBoundingClientRect().height;
  }

  function place(el, x, y) {
    const r = el.getBoundingClientRect();
    x = Math.max(0, Math.min(x, innerWidth - Math.min(r.width, 60)));
    y = Math.max(0, Math.min(y, innerHeight - 20));
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  function focusWin(el) {
    desk.querySelectorAll('.wa-win').forEach((w) => w.classList.toggle('wa-active', w === el));
    el.style.zIndex = ++z;
  }

  // Drag windows by their title bars; edges snap to the screen and to each other.
  desk.addEventListener('pointerdown', (e) => {
    const w = e.target.closest('.wa-win');
    if (w) focusWin(w);
    const bar = e.target.closest('[data-drag]');
    if (!bar || stacked || e.target.closest('button')) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, l: w.offsetLeft, t: w.offsetTop };
    bar.setPointerCapture(e.pointerId);
    const move = (ev) => {
      let x = start.l + ev.clientX - start.x, y = start.t + ev.clientY - start.y;
      const r = w.getBoundingClientRect();
      const snap = 10;
      const xs = [0, innerWidth], ys = [0, innerHeight];
      desk.querySelectorAll('.wa-win:not([hidden])').forEach((o) => {
        if (o === w) return;
        const q = o.getBoundingClientRect();
        xs.push(q.left, q.right); ys.push(q.top, q.bottom);
      });
      for (const v of xs) { if (Math.abs(x - v) < snap) x = v; else if (Math.abs(x + r.width - v) < snap) x = v - r.width; }
      for (const v of ys) { if (Math.abs(y - v) < snap) y = v; else if (Math.abs(y + r.height - v) < snap) y = v - r.height; }
      place(w, x, y);
    };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      ui.pos[w.dataset.win] = { x: w.offsetLeft, y: w.offsetTop };
      saveUi();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up, { once: true });
    bar.addEventListener('pointercancel', up, { once: true });
  });

  // Resize the playlist and library windows from their bottom-right grips.
  desk.querySelectorAll('[data-resize]').forEach((grip) => {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = grip.dataset.resize;
      const w = grip.closest('.wa-win');
      const s = parseFloat(desk.style.getPropertyValue('--s'));
      const startY = e.clientY, startH = ui[key];
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => {
        ui[key] = Math.max(116, Math.round(startH + (ev.clientY - startY) / s));
        w.style.height = `${ui[key] * s}px`;
        syncScroll();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', () => { grip.removeEventListener('pointermove', move); saveUi(); }, { once: true });
    });
  });

  addEventListener('resize', () => { layout(); syncScroll(); });

  // ---------------------------------------------------------------- marquee

  let marqueeText = '';
  let flashText = '';
  let flashUntil = 0;
  let marqueeX = 0;

  function flash(msg, ms = 1500) {
    flashText = msg;
    flashUntil = Date.now() + ms;
    drawMarquee();
  }

  function songLabel(t) {
    const hasArtist = / [-–—] /.test(t.title) || !t.channel;
    return hasArtist ? t.title : `${t.channel} - ${t.title}`;
  }

  function updateMarqueeText() {
    const { state, current, fmtTime } = E();
    const t = current();
    marqueeText = t ? `${state.qIndex + 1}. ${songLabel(t)}${t.dur ? ` (${fmtTime(t.dur)})` : ''}` : 'Encore - YouTube music player';
  }

  function drawMarquee() {
    const span = $('#wa-marquee');
    if (Date.now() < flashUntil) {
      span.textContent = flashText;
      span.style.transform = '';
      return;
    }
    const box = span.parentElement.clientWidth;
    span.textContent = marqueeText;
    const s = parseFloat(desk.style.getPropertyValue('--s'));
    if (span.scrollWidth <= box - 4 * s) { span.style.transform = ''; marqueeX = 0; return; }
    const loop = `${marqueeText}  ***  `;
    span.textContent = loop + loop;
    const loopW = span.scrollWidth / 2 / s;
    marqueeX = (marqueeX + 1) % Math.max(1, Math.round(loopW));
    span.style.transform = `translateX(${-marqueeX * s}px)`;
  }
  setInterval(drawMarquee, 55);

  // ---------------------------------------------------------------- player state + displays

  let stopped = true;
  const YTS = () => window.YT?.PlayerState || { PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, ENDED: 0 };

  function playerState() {
    const p = E()?.player;
    const st = p?.getPlayerState?.();
    const S = YTS();
    if (st === S.PLAYING || st === S.BUFFERING) return 'play';
    if (st === S.PAUSED && !stopped) return 'pause';
    return 'stop';
  }

  let lastTimeKey = '';
  function drawTime() {
    const { player, current, state } = E();
    const mode = playerState();
    const t = current();
    let key = 'stop';
    if (t && mode !== 'stop') {
      const cur = player?.getCurrentTime?.() || 0;
      const dur = player?.getDuration?.() || t.dur || 0;
      const secs = ui.remaining && dur ? Math.max(0, dur - cur) : cur;
      const m = Math.floor(secs / 60) % 100, sec = Math.floor(secs % 60);
      key = `${ui.remaining ? '-' : ' '}${String(m).padStart(2, '0')}${String(sec).padStart(2, '0')}`;
    } else if (t && state.pos && mode === 'stop' && !stopped) {
      key = 'stop';
    }
    const box = $('#wa-time');
    box.classList.toggle('blink', mode === 'pause');
    if (key === lastTimeKey) return;
    lastTimeKey = key;
    $('#wa-colon').hidden = key === 'stop';
    if (key === 'stop') { box.innerHTML = ''; return; }
    const [sign, m1, m2, s1, s2] = key;
    box.innerHTML = `<div class="wa-digit minus">${digitSvg(sign === '-' ? '-' : ' ')}</div>`
      + `<div class="wa-digit">${digitSvg(m1)}</div><div class="wa-digit gap">${digitSvg(m2)}</div>`
      + `<div class="wa-digit">${digitSvg(s1)}</div><div class="wa-digit">${digitSvg(s2)}</div>`;
  }

  let lastStatus = '';
  function drawStatus() {
    const mode = playerState();
    if (mode !== lastStatus) {
      lastStatus = mode;
      $('#wa-status').innerHTML = mode === 'play' ? G.sPlay : mode === 'pause' ? G.sPause : G.sStop;
      const on = mode !== 'stop';
      $('#wa-kbps').textContent = on ? '128' : '';
      $('#wa-khz').textContent = on ? '44' : '';
      $('#wa-stereo').classList.toggle('on', on);
    }
  }

  function drawPosition() {
    if (dragging === 'position') return;
    const { player, current } = E();
    const t = current();
    const el = $('#wa-position');
    const dur = player?.getDuration?.() || t?.dur || 0;
    const cur = playerState() === 'stop' ? 0 : player?.getCurrentTime?.() || 0;
    el.classList.toggle('empty', !t || !dur);
    const s = parseFloat(desk.style.getPropertyValue('--s'));
    $('.wa-thumb-pos', el).style.left = `${(dur ? Math.min(1, cur / dur) : 0) * (248 - 29) * s}px`;
  }

  function drawVolume() {
    const s = parseFloat(desk.style.getPropertyValue('--s'));
    const v = E().state.volume;
    const vol = $('#wa-volume');
    $('.wa-bar', vol).style.background = VOL[Math.min(27, Math.floor((v / 100) * 27.99))];
    $('.wa-thumb-small', vol).style.left = `${(v / 100) * (68 - 14) * s}px`;
    const bal = $('#wa-balance');
    $('.wa-bar', bal).style.background = VOL[Math.min(27, Math.floor((Math.abs(ui.balance) / 100) * 27.99))];
    $('.wa-thumb-small', bal).style.left = `${((ui.balance + 100) / 200) * (38 - 14) * s}px`;
  }

  // ---------------------------------------------------------------- visualizer
  // YouTube's player doesn't expose its audio, so the analyzer is simulated:
  // it moves while music plays and settles when it stops.

  const canvas = $('#wa-vis');
  const ctx = canvas.getContext('2d');
  const bars = new Array(19).fill(0), peaks = new Array(19).fill(0), peakHold = new Array(19).fill(0);
  let phase = 0;

  function drawVis() {
    const k = parseFloat(desk.style.getPropertyValue('--s')) * (devicePixelRatio || 1);
    const W = Math.round(76 * k), H = Math.round(16 * k);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * k), Math.round(y * k), Math.ceil(w * k), Math.ceil(h * k)); };
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (let y = 1; y < 16; y += 2) for (let x = 1; x < 76; x += 2) px(x, y, 1, 1, VIS[1]);
    const playing = playerState() === 'play';
    phase += 0.09;
    if (ui.vis === 'spectrum') {
      const beat = Math.max(0, Math.sin(phase * 2.2)) ** 6;
      for (let i = 0; i < 19; i++) {
        let target = 0;
        if (playing) {
          const tilt = 1 - (i / 19) * 0.55;
          const wob = 0.5 + 0.5 * Math.sin(phase * (1.3 + i * 0.37) + i * 1.7) * Math.sin(phase * 0.7 + i);
          target = Math.min(16, (4 + 10 * wob * tilt + 5 * beat * tilt + Math.random() * 3) * (i < 3 ? 1.1 : 1));
        }
        bars[i] = target > bars[i] ? target : Math.max(0, bars[i] - 0.9);
        if (bars[i] >= peaks[i]) { peaks[i] = bars[i]; peakHold[i] = 12; } else if (peakHold[i] > 0) peakHold[i]--; else peaks[i] = Math.max(0, peaks[i] - 0.35);
        const h = Math.round(bars[i]);
        for (let y = 16 - h; y < 16; y++) px(i * 4, y, 3, 1, VIS[2 + y]);
        const pk = Math.round(peaks[i]);
        if (pk > 0) px(i * 4, 16 - pk, 3, 1, VIS[23]);
      }
    } else if (ui.vis === 'osc') {
      for (let x = 0; x < 75; x++) {
        const amp = playing ? 5.5 * (Math.sin(x * 0.35 + phase * 6) * 0.6 + Math.sin(x * 0.9 - phase * 9) * 0.3 + (Math.random() - 0.5) * 0.3) : 0;
        const y = Math.max(0, Math.min(15, Math.round(8 + amp)));
        px(x, y, 1, 1, VIS[18 + Math.min(4, Math.abs(y - 8) >> 1)]);
      }
    }
  }

  // ---------------------------------------------------------------- sliders

  let dragging = null;
  function slider(el, name, onValue, onDone) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      focusWin(el.closest('.wa-win'));
      dragging = name;
      el.setPointerCapture(e.pointerId);
      const thumb = el.firstElementChild.nextElementSibling || el.firstElementChild;
      const valueAt = (ev) => {
        const r = el.getBoundingClientRect();
        const tw = thumb.getBoundingClientRect().width;
        return Math.min(1, Math.max(0, (ev.clientX - r.left - tw / 2) / (r.width - tw)));
      };
      onValue(valueAt(e));
      const move = (ev) => onValue(valueAt(ev));
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', (ev) => {
        el.removeEventListener('pointermove', move);
        dragging = null;
        onDone?.(valueAt(ev));
      }, { once: true });
    });
  }

  // ---------------------------------------------------------------- playlist editor

  const selected = new Set();
  let anchor = -1;
  const coarse = matchMedia('(pointer: coarse)').matches;

  function renderPlaylist() {
    const { state, fmtTime } = E();
    const list = $('#wa-pl-list');
    const keep = list.scrollTop;
    const valid = new Set(state.queue.map((t) => t.qid));
    for (const q of [...selected]) if (!valid.has(q)) selected.delete(q);
    list.replaceChildren(...state.queue.map((t, i) => {
      const row = document.createElement('div');
      row.className = 'wa-row' + (i === state.qIndex ? ' cur' : '') + (selected.has(t.qid) ? ' sel' : '');
      row.dataset.i = i;
      const a = document.createElement('span');
      a.className = 't';
      a.textContent = `${i + 1}. ${songLabel(t)}`;
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = t.dur ? fmtTime(t.dur) : '';
      row.append(a, d);
      return row;
    }));
    if (!state.queue.length) {
      const n = document.createElement('div');
      n.className = 'wa-row note';
      n.textContent = 'Playlist is empty. Press ADD or use the library to find songs.';
      list.append(n);
    }
    list.scrollTop = keep;
    markSelection();
    syncScroll();
  }

  function scrollToCurrent() {
    const row = $(`#wa-pl-list .wa-row[data-i="${E().state.qIndex}"]`);
    if (!row) return;
    const list = $('#wa-pl-list');
    if (row.offsetTop < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop - list.clientHeight / 3;
    }
  }

  function selectRow(i, e) {
    const q = E().state.queue;
    if (e?.shiftKey && anchor >= 0) {
      selected.clear();
      for (let j = Math.min(anchor, i); j <= Math.max(anchor, i); j++) selected.add(q[j].qid);
    } else if (e?.ctrlKey || e?.metaKey) {
      selected.has(q[i].qid) ? selected.delete(q[i].qid) : selected.add(q[i].qid);
      anchor = i;
    } else {
      selected.clear();
      selected.add(q[i].qid);
      anchor = i;
    }
    markSelection();
  }

  // Update highlight classes in place, so a double-click still lands on the same row.
  function markSelection() {
    const { state, fmtTime } = E();
    $('#wa-pl-list').querySelectorAll('.wa-row[data-i]').forEach((row) => {
      row.classList.toggle('sel', selected.has(state.queue[+row.dataset.i]?.qid));
    });
    const total = state.queue.reduce((s, t) => s + (t.dur || 0), 0);
    const selT = state.queue.filter((t) => selected.has(t.qid)).reduce((s, t) => s + (t.dur || 0), 0);
    $('#wa-pl-info').textContent = `${fmtTime(selT)}/${fmtTime(total)}`;
  }

  const plList = $('#wa-pl-list');
  plList.addEventListener('click', (e) => {
    const row = e.target.closest('.wa-row[data-i]');
    if (!row) return;
    const i = +row.dataset.i;
    selectRow(i, e);
    if (coarse) E().playIndex(i);
  });
  plList.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.wa-row[data-i]');
    if (row) { stopped = false; E().playIndex(+row.dataset.i); }
  });
  plList.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.wa-row[data-i]');
    if (!row) return;
    e.preventDefault();
    const i = +row.dataset.i;
    const t = E().state.queue[i];
    if (!selected.has(t.qid)) selectRow(i);
    E().trackMenu(t, [{ label: 'Remove from list', action: () => E().removeFromQueue(i) }]);
  });

  function removeSelected() {
    const { state, removeFromQueue } = E();
    const idx = state.queue.map((t, i) => (selected.has(t.qid) ? i : -1)).filter((i) => i >= 0).reverse();
    idx.forEach((i) => removeFromQueue(i));
    selected.clear();
  }

  // Custom gold scrollbar handles for the black lists.
  function wireScroll(list, bar) {
    const h = bar.firstElementChild;
    const sync = () => {
      const max = list.scrollHeight - list.clientHeight;
      const room = bar.clientHeight - h.offsetHeight;
      h.style.top = `${max > 0 ? (list.scrollTop / max) * room : 0}px`;
      h.style.visibility = max > 0 ? 'visible' : 'hidden';
    };
    list.addEventListener('scroll', sync, { passive: true });
    bar.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bar.setPointerCapture(e.pointerId);
      const go = (ev) => {
        const r = bar.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (ev.clientY - r.top - h.offsetHeight / 2) / (r.height - h.offsetHeight)));
        list.scrollTop = f * (list.scrollHeight - list.clientHeight);
      };
      go(e);
      bar.addEventListener('pointermove', go);
      bar.addEventListener('pointerup', () => bar.removeEventListener('pointermove', go), { once: true });
    });
    return sync;
  }
  const syncPl = wireScroll($('#wa-pl-list'), $('#wa-pl-scroll'));
  const syncLib = wireScroll($('#wa-lib-list'), $('#wa-lib-scroll'));
  function syncScroll() { syncPl(); syncLib(); }

  // ---------------------------------------------------------------- library window

  let libTab = 'search';
  let openList = null; // playlist id shown in the playlists tab

  function libRow(text, dur, cls = '') {
    const row = document.createElement('div');
    row.className = `wa-row ${cls}`;
    const a = document.createElement('span');
    a.className = 't';
    a.textContent = text;
    row.append(a);
    if (dur !== undefined) {
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = dur;
      row.append(d);
    }
    return row;
  }

  function renderLib() {
    const { state, search, fmtTime, current } = E();
    const list = $('#wa-lib-list');
    const rows = [];
    const cur = current();
    desk.querySelectorAll('[data-libtab]').forEach((b) => b.classList.toggle('on', b.dataset.libtab === libTab));
    $('#wa-search').hidden = libTab !== 'search';

    if (libTab === 'search') {
      if (!state.apiKey) {
        const r = libRow('No YouTube API key yet. Click here to add one in Preferences. You can still paste a YouTube link above.', undefined, 'note link');
        r.dataset.act = 'prefs';
        rows.push(r);
      }
      const status = $('#search-status')?.textContent;
      if (status) rows.push(libRow(status, undefined, 'note'));
      search.results.forEach((t, i) => {
        const r = libRow(`${i + 1}. ${songLabel(t)}`, t.dur ? fmtTime(t.dur) : '', cur?.id === t.id ? 'cur' : '');
        r.dataset.res = i;
        rows.push(r);
      });
      if (search.nextPage && !search.busy) {
        const r = libRow('Load more results…', undefined, 'link');
        r.dataset.act = 'more';
        rows.push(r);
      }
      if (!search.results.length && !status && state.recent.length) {
        rows.push(libRow('Recent searches:', undefined, 'note'));
        state.recent.forEach((q) => { const r = libRow(q, undefined, 'link'); r.dataset.recent = q; rows.push(r); });
      }
      $('#wa-lib-foot').textContent = search.results.length ? `${search.results.length} results` : 'search youtube';
    } else {
      const p = openList && state.playlists.find((x) => x.id === openList);
      if (!p) {
        openList = null;
        const nr = libRow('+ New playlist…', undefined, 'link');
        nr.dataset.act = 'newlist';
        rows.push(nr);
        state.playlists.forEach((pl) => {
          const r = libRow(pl.name, `${pl.tracks.length}`);
          r.dataset.list = pl.id;
          rows.push(r);
        });
        if (!state.playlists.length) rows.push(libRow('No playlists yet. Right-click (or long-press) a song to add it to one.', undefined, 'note'));
        $('#wa-lib-foot').textContent = `${state.playlists.length} playlists`;
      } else {
        const back = libRow('‹ All playlists', undefined, 'link');
        back.dataset.act = 'back';
        const play = libRow(`▶ Play "${p.name}"`, undefined, 'link');
        play.dataset.act = 'playlist-play';
        const shuf = libRow('⤮ Shuffle play', undefined, 'link');
        shuf.dataset.act = 'playlist-shuffle';
        rows.push(back, play, shuf);
        p.tracks.forEach((t, i) => {
          const r = libRow(`${i + 1}. ${songLabel(t)}`, t.dur ? fmtTime(t.dur) : '', cur?.id === t.id ? 'cur' : '');
          r.dataset.track = i;
          rows.push(r);
        });
        const total = p.tracks.reduce((s, t) => s + (t.dur || 0), 0);
        $('#wa-lib-foot').textContent = `${p.tracks.length} songs  ${fmtTime(total)}`;
      }
    }
    list.replaceChildren(...rows);
    syncLib();
  }

  const libList = $('#wa-lib-list');
  function libActivate(e, fromDbl) {
    const E_ = E();
    const row = e.target.closest('.wa-row');
    if (!row) return;
    const act = row.dataset.act;
    if (act === 'prefs') return openPrefs();
    if (act === 'more') return E_.runSearch(E_.search.query, true);
    if (act === 'newlist') return newList();
    if (act === 'back') { openList = null; return renderLib(); }
    if (row.dataset.recent) { $('#wa-search-input').value = row.dataset.recent; return E_.runSearch(row.dataset.recent); }
    const p = openList && E_.state.playlists.find((x) => x.id === openList);
    if (act === 'playlist-play' && p?.tracks.length) { stopped = false; return E_.playList(p.tracks, 0, { shuffle: false }); }
    if (act === 'playlist-shuffle' && p?.tracks.length) { stopped = false; return E_.playList(p.tracks, 0, { shuffle: true }); }
    if (row.dataset.list) { openList = row.dataset.list; return renderLib(); }
    // Songs play on double-click with a mouse, or a single tap on touch screens.
    if (!fromDbl && !coarse) {
      libList.querySelectorAll('.wa-row.sel').forEach((r) => r.classList.remove('sel'));
      row.classList.add('sel');
      return;
    }
    if (row.dataset.res !== undefined) { stopped = false; E_.playList(E_.search.results, +row.dataset.res); }
    if (row.dataset.track !== undefined && p) { stopped = false; E_.playList(p.tracks, +row.dataset.track); }
  }
  libList.addEventListener('click', (e) => libActivate(e, false));
  libList.addEventListener('dblclick', (e) => libActivate(e, true));
  libList.addEventListener('contextmenu', (e) => {
    const E_ = E();
    const row = e.target.closest('.wa-row');
    if (!row) return;
    const p = openList && E_.state.playlists.find((x) => x.id === openList);
    if (row.dataset.res !== undefined) { e.preventDefault(); E_.trackMenu(E_.search.results[+row.dataset.res]); }
    else if (row.dataset.track !== undefined && p) {
      e.preventDefault();
      const t = p.tracks[+row.dataset.track];
      E_.trackMenu(t, [{ label: 'Remove from playlist', action: () => { p.tracks.splice(p.tracks.indexOf(t), 1); E_.save(); renderLib(); } }]);
    } else if (row.dataset.list) {
      e.preventDefault();
      E_.playlistMenu(E_.state.playlists.find((x) => x.id === row.dataset.list));
    }
  });

  $('#wa-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#wa-search-input');
    input.blur();
    E().runSearch(input.value);
  });

  async function newList() {
    const name = await E().ask('New playlist', '', 'Playlist name');
    if (name) { openList = E().createPlaylist(name).id; libTab = 'lists'; renderLib(); }
  }

  function showLibrary(tab = 'search', focus = false) {
    ui.open.lib = true;
    saveUi();
    win('lib').hidden = false;
    libTab = tab;
    renderLib();
    focusWin(win('lib'));
    if (focus && tab === 'search') setTimeout(() => $('#wa-search-input').focus(), 30);
  }

  // ---------------------------------------------------------------- menus + actions

  const check = (on, label) => `${on ? '✓ ' : '    '}${label}`;

  function mainMenu() {
    const s = ui.scale || pickScale();
    E().menu('Encore', [
      { label: 'Play URL…', action: playUrl },
      { label: 'Search YouTube…  (J)', action: () => showLibrary('search', true) },
      { label: check(ui.open.pl, 'Playlist editor'), action: () => toggleWin('pl') },
      { label: check(ui.open.video, 'Video window'), action: () => toggleWin('video') },
      { label: check(ui.open.lib, 'Library'), action: () => toggleWin('lib') },
      ...(stacked ? [] : [
        { label: check(s === 1.5, 'Size 150%'), action: () => setScale(1.5) },
        { label: check(s === 2, 'Size 200%  (Ctrl+D)'), action: () => setScale(2) },
        { label: check(s === 3, 'Size 300%'), action: () => setScale(3) },
        { label: 'Reset window positions', action: () => { ui.pos = {}; saveUi(); layout(); } },
      ]),
      { label: 'Preferences…', action: openPrefs },
      { label: 'Switch to modern look', action: () => { try { localStorage.setItem(SKIN_KEY, 'modern'); } catch { /* ignore */ } location.reload(); } },
      { label: 'About Encore', action: about },
    ]);
  }

  function about() {
    E().toast('Encore: plays YouTube through its official player. Classic look inspired by Winamp 2.', 4500);
  }

  function setScale(s) {
    ui.scale = s;
    ui.pos = {};
    saveUi();
    layout();
    renderAll();
  }

  function toggleWin(n) {
    ui.open[n] = !ui.open[n];
    saveUi();
    layout();
    if (ui.open[n]) { focusWin(win(n)); renderAll(); }
  }

  async function playUrl() {
    const url = await E().ask('Play URL', '', 'YouTube link');
    if (!url) return;
    const id = E().parseVideoId(url), list = E().parsePlaylistId(url);
    if (id) { stopped = false; E().playList([await E().lookupVideo(id)], 0); }
    else if (list) E().importYouTubePlaylist(list);
    else E().toast("That doesn't look like a YouTube link.");
  }

  async function addUrl() {
    const url = await E().ask('Add URL', '', 'YouTube link');
    if (!url) return;
    const id = E().parseVideoId(url), list = E().parsePlaylistId(url);
    if (id) E().enqueue(await E().lookupVideo(id), false);
    else if (list) E().importYouTubePlaylist(list);
    else E().toast("That doesn't look like a YouTube link.");
  }

  function openPrefs() {
    const { state } = E();
    $('#key-input').value = state.apiKey;
    $('#opt-music').checked = state.musicOnly;
    $('#wa-prefs').hidden = false;

  }

  const actions = {
    menu: mainMenu,
    about,
    prefs: openPrefs,
    'prefs-close': () => { $('#wa-prefs').hidden = true; },
    play: () => {
      const E_ = E();
      stopped = false;
      const st = playerState();
      if (st === 'play') E_.player?.seekTo(0, true);          // Winamp restarts the song
      else E_.togglePlay();
    },
    pause: () => {
      const E_ = E();
      const st = playerState();
      if (st === 'play') E_.player?.pauseVideo();
      else if (st === 'pause') E_.player?.playVideo();
    },
    stop: () => { stopped = true; E().stop(); lastTimeKey = ''; },
    next: () => { stopped = false; E().next(); },
    prev: () => { stopped = false; E().prev(); },
    eject: () => showLibrary('search', true),
    shuffle: () => E().setShuffle(!E().state.shuffle),
    repeat: () => E().cycleRepeat(),
    pl: () => toggleWin('pl'),
    eq: () => flash('EQ: not available for YouTube audio', 2200),
    ontop: () => flash('Always on top: n/a in a browser', 1800),
    info: () => { const t = E().current(); if (t) window.open(`https://www.youtube.com/watch?v=${t.id}`, '_blank', 'noopener'); },
    size: () => { if (stacked) return; const s = ui.scale || pickScale(); setScale(s === 1.5 ? 2 : s === 2 ? 3 : 1.5); },
    vis: () => {
      ui.vis = { spectrum: 'osc', osc: 'off', off: 'spectrum' }[ui.vis];
      saveUi();
      flash(`Visualization: ${ui.vis === 'osc' ? 'oscilloscope' : ui.vis}`);
    },
    minimize: () => hideAll(false),
    close: (btn) => {
      const w = btn.closest('.wa-win').dataset.win;
      if (w === 'main') hideAll(true);
      else toggleWin(w);
    },
    'pl-add': () => E().menu('Add', [
      { label: 'Search YouTube…', action: () => showLibrary('search', true) },
      { label: 'Add URL…', action: addUrl },
      { label: 'Add a saved playlist…', action: () => E().menu('Add playlist', E().state.playlists.map((p) => ({
        label: `${p.name}  (${p.tracks.length})`, action: () => p.tracks.forEach((t) => E().enqueue(t, false)),
      }))) },
    ]),
    'pl-rem': () => E().menu('Remove', [
      { label: 'Remove selected', action: removeSelected },
      { label: 'Crop (keep selected)', action: () => {
        const { state } = E();
        if (!selected.size) return;
        E().reorderQueue(state.queue.filter((t) => selected.has(t.qid) || t.qid === E().current()?.qid));
      } },
      { label: 'Remove all', action: () => { E().clearQueue(); } },
    ]),
    'pl-sel': () => E().menu('Select', [
      { label: 'Select all', action: () => { E().state.queue.forEach((t) => selected.add(t.qid)); renderPlaylist(); } },
      { label: 'Select none', action: () => { selected.clear(); renderPlaylist(); } },
      { label: 'Invert selection', action: () => { E().state.queue.forEach((t) => (selected.has(t.qid) ? selected.delete(t.qid) : selected.add(t.qid))); renderPlaylist(); } },
    ]),
    'pl-misc': () => E().menu('Misc', [
      { label: 'Sort list by title', action: () => E().reorderQueue([...E().state.queue].sort((a, b) => songLabel(a).localeCompare(songLabel(b)))) },
      { label: 'Reverse list', action: () => E().reorderQueue([...E().state.queue].reverse()) },
      { label: 'Randomize list', action: () => E().reorderQueue([...E().state.queue].sort(() => Math.random() - 0.5)) },
      { label: 'File info…', action: actions.info },
    ]),
    'pl-list': () => E().menu('List', [
      { label: 'New list', action: () => E().clearQueue() },
      { label: 'Save list as playlist…', action: async () => {
        const { state } = E();
        if (!state.queue.length) return E().toast('The list is empty.');
        const name = await E().ask('Save list', '', 'Playlist name');
        if (name) { E().createPlaylist(name, state.queue); E().toast(`Saved "${name}"`); }
      } },
      { label: 'Load list…', action: () => E().menu('Load list', E().state.playlists.map((p) => ({
        label: `${p.name}  (${p.tracks.length})`, action: () => { stopped = false; E().playList(p.tracks, 0, { shuffle: false }); },
      }))) },
    ]),
  };

  function hideAll(stop) {
    if (stop) { stopped = true; E().stop(); }
    desk.querySelectorAll('.wa-win').forEach((w) => { w.dataset.wasHidden = w.hidden ? '1' : ''; w.hidden = true; });
    $('#wa-icon').hidden = false;
  }
  function showAll() {
    $('#wa-icon').hidden = true;
    layout();
    win('main').hidden = false;
    renderAll();
  }
  $('#wa-icon').addEventListener(coarse ? 'click' : 'dblclick', showAll);

  desk.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !desk.contains(b) || b.classList.contains('wa-row')) return;
    const fn = actions[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b); }
  });
  desk.querySelectorAll('[data-libtab]').forEach((b) => b.addEventListener('click', () => { libTab = b.dataset.libtab; renderLib(); }));
  $('#wa-time').addEventListener('click', () => { ui.remaining = !ui.remaining; saveUi(); lastTimeKey = ''; drawTime(); });
  canvas.addEventListener('click', actions.vis);

  // Winamp keyboard shortcuts.
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea') || !$('#sheet').hidden) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); actions.size(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const map = { z: 'prev', x: 'play', c: 'pause', v: 'stop', b: 'next', l: 'eject', s: 'shuffle', r: 'repeat' };
    if (map[k]) { e.preventDefault(); actions[map[k]](); return; }
    if (k === 'j') { e.preventDefault(); showLibrary('search', true); return; }
    const plActive = win('pl').classList.contains('wa-active');
    if (!plActive) return;
    const q = E().state.queue;
    if ((k === 'arrowdown' || k === 'arrowup') && q.length) {
      e.preventDefault();
      const i = Math.max(0, Math.min(q.length - 1, (anchor < 0 ? -1 : anchor) + (k === 'arrowdown' ? 1 : -1)));
      selectRow(i, e.shiftKey ? e : null);
      $(`#wa-pl-list .wa-row[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (k === 'enter' && anchor >= 0) { stopped = false; E().playIndex(anchor); }
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); removeSelected(); }
  });

  // Menus open next to the pointer on a desktop, like a right-click menu.
  let lastPointer = { x: innerWidth / 2, y: innerHeight / 2 };
  document.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('contextmenu', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, true);
  new MutationObserver(() => {
    const sheet = $('#sheet');
    if (sheet.hidden || stacked) { sheet.style.left = sheet.style.top = ''; return; }
    const r = sheet.getBoundingClientRect();
    sheet.style.left = `${Math.max(4, Math.min(lastPointer.x, innerWidth - r.width - 4))}px`;
    sheet.style.top = `${Math.max(4, Math.min(lastPointer.y, innerHeight - r.height - 4))}px`;
  }).observe($('#sheet'), { attributes: true, attributeFilter: ['hidden'] });

  // ---------------------------------------------------------------- render loop

  let lastQid = null;
  function renderAll() {
    const { state, current } = E();
    updateMarqueeText();
    $('#wa-shuffle').classList.toggle('on', state.shuffle);
    const rep = $('#wa-repeat');
    rep.classList.toggle('on', state.repeat !== 'off');
    rep.classList.toggle('one-mode', state.repeat === 'one');
    const t = current();
    $('#wa-video-foot').textContent = t ? t.channel : '';
    renderPlaylist();
    renderLib();
    drawVolume();
    if (t?.qid !== lastQid) { lastQid = t?.qid; scrollToCurrent(); marqueeX = 0; }
  }

  let lastSlow = 0;
  function frame(now) {
    if (E()) {
      drawVis();
      if (now - lastSlow > 200) {
        lastSlow = now;
        if (playerState() === 'play') stopped = false;
        drawStatus();
        drawTime();
        drawPosition();
        const cur = E().player?.getCurrentTime?.() || 0;
        $('#wa-pl-time').textContent = E().current() && playerState() !== 'stop' ? E().fmtTime(cur) : '';
      }
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener('encore:ready', () => {
    const E_ = E();
    stopped = !(E_.state.pos > 0);
    layout();
    slider($('#wa-volume'), 'volume', (f) => { E().setVolume(f * 100); drawVolume(); flash(`Volume: ${Math.round(f * 100)}%`); });
    slider($('#wa-balance'), 'balance', (f) => {
      ui.balance = Math.abs(f - 0.5) < 0.08 ? 0 : Math.round((f - 0.5) * 200);
      drawVolume();
      flash(ui.balance ? `Balance: ${Math.abs(ui.balance)}% ${ui.balance < 0 ? 'left' : 'right'}` : 'Balance: center');
    });
    slider($('#wa-position'), 'position', (f) => {
      const { player, current, fmtTime } = E();
      const dur = player?.getDuration?.() || current()?.dur || 0;
      if (!dur) return;
      const s = parseFloat(desk.style.getPropertyValue('--s'));
      $('#wa-position .wa-thumb-pos').style.left = `${f * (248 - 29) * s}px`;
      flash(`Seek to: ${fmtTime(f * dur)}/${fmtTime(dur)} (${Math.round(f * 100)}%)`);
    }, (f) => {
      const { player, current, state, save } = E();
      const dur = player?.getDuration?.() || current()?.dur || 0;
      if (dur && player) { player.seekTo(f * dur, true); state.pos = f * dur; save(); }
    });
    renderAll();
    requestAnimationFrame(frame);
  });
  document.addEventListener('encore:update', () => { if (E()) renderAll(); });
})();
