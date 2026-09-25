'use strict';

/* Encore: a YouTube music player with local playlists.
 *
 * Playback goes through YouTube's official IFrame Player API; search and
 * playlist import use the YouTube Data API v3 with the user's own key.
 * Everything the user creates is kept in localStorage on their device. */

const $ = (sel) => document.querySelector(sel);
const STORE_KEY = 'encore.v1';
const API = 'https://www.googleapis.com/youtube/v3/';
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// ---------------------------------------------------------------- state

const state = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { /* fresh start */ }
  return {
    apiKey: typeof s.apiKey === 'string' ? s.apiKey : '',
    musicOnly: s.musicOnly !== false,
    playlists: Array.isArray(s.playlists) ? s.playlists : [],
    recent: Array.isArray(s.recent) ? s.recent : [],
    shuffle: !!s.shuffle,
    repeat: ['off', 'all', 'one'].includes(s.repeat) ? s.repeat : 'off',
    baseQueue: Array.isArray(s.baseQueue) ? s.baseQueue : [], // original order
    queue: Array.isArray(s.queue) ? s.queue : [],             // play order
    qIndex: Number.isInteger(s.qIndex) ? s.qIndex : -1,
    pos: Number(s.pos) > 0 ? Number(s.pos) : 0,             // seconds into the current song
    volume: Number.isFinite(s.volume) ? Math.min(100, Math.max(0, s.volume)) : 100,
  };
})();

function save() {
  const { apiKey, musicOnly, playlists, recent, shuffle, repeat, baseQueue, queue, qIndex, pos, volume } = state;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ apiKey, musicOnly, playlists, recent, shuffle, repeat, baseQueue, queue, qIndex, pos, volume }));
  } catch {
    toast('Could not save. Storage may be full.');
  }
}

// Lets an alternative skin (classic.js) redraw when anything changes.
let notifyQueued = false;
function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => { notifyQueued = false; document.dispatchEvent(new Event('encore:update')); });
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const current = () => state.queue[state.qIndex] || null;
const thumbUrl = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
// Tracks are stored as {id, title, channel, dur}; queue entries also get a qid.
const cleanTrack = (t) => ({ id: t.id, title: String(t.title || 'Untitled'), channel: String(t.channel || ''), dur: Number(t.dur) || 0 });

// ---------------------------------------------------------------- helpers

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ISO 8601 duration from the Data API, e.g. PT1H2M3S
function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

// The Data API returns titles with HTML entities (&amp; &#39;).
// A detached <textarea> decodes entities but keeps anything tag-like as text.
function decodeEntities(s) {
  const ta = document.createElement('textarea');
  ta.innerHTML = String(s || '');
  return ta.value;
}

function parseVideoId(text) {
  let url;
  try { url = new URL(text.trim()); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(url.hostname)) return null;
  let id = url.searchParams.get('v');
  if (!id && url.hostname.endsWith('youtu.be')) id = url.pathname.slice(1).split('/')[0];
  if (!id) {
    const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
    if (m) id = m[1];
  }
  return id && ID_RE.test(id) ? id : null;
}

function parsePlaylistId(text) {
  let url;
  try { url = new URL(text.trim()); } catch { return null; }
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  const list = url.searchParams.get('list');
  return list && /^[A-Za-z0-9_-]{10,}$/.test(list) ? list : null;
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function svgIcon(path) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}
const ICON_MORE = 'M5 12h.01M12 12h.01M19 12h.01';
const ICON_UP = 'm18 15-6-6-6 6';
const ICON_DOWN = 'm6 9 6 6 6-6';

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------------------------------------------------------- YouTube Data API

class ApiError extends Error {}

async function ytApi(path, params) {
  if (!state.apiKey) throw new ApiError('Add a YouTube API key in Settings first.');
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  url.searchParams.set('key', state.apiKey);
  let res;
  try { res = await fetch(url); } catch { throw new ApiError('No connection to YouTube. Check your internet.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason || '';
    const msg = data?.error?.message || '';
    if (/quota/i.test(reason)) throw new ApiError("Today's YouTube search quota is used up. It resets at midnight Pacific time.");
    if (/keyInvalid|API_KEY_INVALID/i.test(reason + msg) || /API key not valid/i.test(msg)) throw new ApiError("That API key isn't valid. Check it in Settings.");
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + msg)) throw new ApiError('Enable "YouTube Data API v3" for your key in the Google Cloud console.');
    if (/playlistNotFound/i.test(reason)) throw new ApiError("That playlist wasn't found. It may be private.");
    throw new ApiError(msg ? `YouTube error: ${decodeEntities(msg)}` : `YouTube error (${res.status}).`);
  }
  return data;
}

// Fill in durations (and optionally snippets) for up to 50 ids per call; 1 quota unit each.
async function fetchVideoDetails(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const data = await ytApi('videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(','), maxResults: 50 });
    for (const v of data.items || []) out.set(v.id, v);
  }
  return out;
}

function trackFromVideo(v) {
  return {
    id: v.id,
    title: decodeEntities(v.snippet?.title),
    channel: decodeEntities(v.snippet?.channelTitle).replace(/ - Topic$/, ''),
    dur: parseDuration(v.contentDetails?.duration),
  };
}

// ---------------------------------------------------------------- player

let player = null;
let playerReady = false;
let pendingCue = null;       // {id, autoplay, start} requested before the player was ready
let errorStreak = 0;
let wantPlay = false;        // false while a restored song is only cued
let autoplayCheck;
let seeking = false;

function loadYouTubeApi() {
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('yt-player', {
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin },
      events: {
        onReady: () => {
          playerReady = true;
          player.setVolume(state.volume);
          if (pendingCue) { loadVideo(pendingCue.id, pendingCue.autoplay, pendingCue.start); pendingCue = null; }
        },
        onStateChange: onPlayerState,
        onError: onPlayerError,
      },
    });
  };
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => toast("Couldn't reach YouTube. Check your connection.");
  document.head.append(s);
}

function loadVideo(id, autoplay, start = 0) {
  $('#video-empty').hidden = true;
  start = Math.floor(start);
  if (!playerReady) { pendingCue = { id, autoplay, start }; return; }
  clearTimeout(autoplayCheck);
  wantPlay = autoplay;
  if (autoplay) {
    player.loadVideoById({ videoId: id, startSeconds: start });
    // Some browsers (mostly iPhone) block starting playback from outside the
    // video frame the first time. If it didn't start, tell the user what to do.
    autoplayCheck = setTimeout(() => {
      const st = player.getPlayerState?.();
      if (st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING && st !== YT.PlayerState.ENDED) {
        toast('Tap the video to start playing.', 4000);
      }
    }, 3000);
  } else {
    player.cueVideoById({ videoId: id, startSeconds: start });
  }
}

function onPlayerState(e) {
  const S = YT.PlayerState;
  document.body.classList.toggle('playing', e.data === S.PLAYING || e.data === S.BUFFERING);
  $('#btn-play').setAttribute('aria-label', e.data === S.PLAYING ? 'Pause' : 'Play');
  if (e.data === S.PLAYING) {
    errorStreak = 0;
    clearTimeout(autoplayCheck);
    const t = current();
    const d = player.getDuration?.();
    if (t && d && !t.dur) { t.dur = Math.round(d); save(); }
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = e.data === S.PLAYING ? 'playing' : e.data === S.PAUSED ? 'paused' : 'none';
  }
  if (e.data === S.PAUSED) rememberPosition(true);
  notify();
  if (e.data === S.ENDED) { state.pos = 0; save(); next(true); }
}

function onPlayerError(e) {
  const t = current();
  const why = e.data === 101 || e.data === 150 ? "can't be played outside YouTube" : "isn't available";
  errorStreak++;
  if (errorStreak >= Math.max(1, state.queue.length)) {
    toast(`"${t?.title || 'This video'}" ${why}.`, 4000);
    return;
  }
  toast(`"${t?.title || 'This video'}" ${why}. Skipping.`);
  setTimeout(() => {
    if (wantPlay) next(true, true);
    else if (state.qIndex + 1 < state.queue.length) playIndex(state.qIndex + 1, false);
  }, 800);
}

function playIndex(i, autoplay = true) {
  if (i < 0 || i >= state.queue.length) return;
  state.qIndex = i;
  state.pos = 0;
  save();
  const t = current();
  loadVideo(t.id, autoplay);
  renderNowPlaying();
}

function togglePlay() {
  const t = current();
  if (!t) {
    switchTab('search');
    $('#search-input').focus();
    return;
  }
  if (!playerReady) { loadVideo(t.id, true, state.pos); return; }
  const st = player.getPlayerState();
  if (st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING) player.pauseVideo();
  else if (st === YT.PlayerState.UNSTARTED && !player.getVideoData?.()?.video_id) loadVideo(t.id, true, state.pos);
  else { wantPlay = true; player.playVideo(); }
}

// auto: called because the song ended (or failed), so repeat-one applies.
function next(auto = false, skipError = false) {
  if (!state.queue.length) return;
  if (auto && !skipError && state.repeat === 'one') { player.seekTo(0, true); player.playVideo(); return; }
  if (state.qIndex + 1 < state.queue.length) return playIndex(state.qIndex + 1);
  if (state.repeat === 'off') {
    if (!auto) toast('End of queue', 1200);
    return;
  }
  // Repeat all: start over, with a fresh shuffle if shuffle is on.
  if (state.shuffle) {
    const cur = current();
    state.queue = shuffled(state.baseQueue);
    if (state.queue.length > 1 && state.queue[0].qid === cur?.qid) state.queue.push(state.queue.shift());
    renderQueue();
  }
  playIndex(0);
}

function prev() {
  if (!state.queue.length) return;
  if (playerReady && player.getCurrentTime?.() > 3) { player.seekTo(0, true); return; }
  if (state.qIndex > 0) playIndex(state.qIndex - 1);
  else if (playerReady) player.seekTo(0, true);
}

// Replace the queue with a list of tracks and start playing one of them.
function playList(tracks, start = 0, opts = {}) {
  if (!tracks.length) return;
  if (opts.shuffle !== undefined) state.shuffle = opts.shuffle;
  state.baseQueue = tracks.map((t) => ({ ...cleanTrack(t), qid: uid() }));
  if (state.shuffle) {
    const first = opts.shuffle ? Math.floor(Math.random() * tracks.length) : start;
    const head = state.baseQueue[first];
    state.queue = [head, ...shuffled(state.baseQueue.filter((t) => t !== head))];
    playIndex(0);
  } else {
    state.queue = state.baseQueue.slice();
    playIndex(start);
  }
  renderModes();
  renderQueue();
}

function setShuffle(on) {
  state.shuffle = on;
  const cur = current();
  if (on) {
    const rest = state.baseQueue.filter((t) => t.qid !== cur?.qid);
    state.queue = cur ? [cur, ...shuffled(rest)] : shuffled(rest);
    state.qIndex = cur ? 0 : -1;
  } else {
    state.queue = state.baseQueue.slice();
    state.qIndex = cur ? state.queue.findIndex((t) => t.qid === cur.qid) : -1;
  }
  save();
  renderModes();
  renderQueue();
  toast(on ? 'Shuffle on' : 'Shuffle off', 1200);
}

function cycleRepeat() {
  state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
  save();
  renderModes();
  toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat this song' }[state.repeat], 1200);
}

function enqueue(track, playNext) {
  const entry = { ...cleanTrack(track), qid: uid() };
  if (!state.queue.length) {
    state.baseQueue = [entry];
    state.queue = [entry];
    playIndex(0);
  } else if (playNext) {
    state.queue.splice(state.qIndex + 1, 0, entry);
    const bi = state.baseQueue.findIndex((t) => t.qid === current()?.qid);
    state.baseQueue.splice(bi + 1, 0, entry);
  } else {
    state.queue.push(entry);
    state.baseQueue.push(entry);
  }
  save();
  renderQueue();
  toast(playNext ? 'Playing next' : 'Added to queue', 1400);
}

function removeFromQueue(i) {
  const [gone] = state.queue.splice(i, 1);
  state.baseQueue = state.baseQueue.filter((t) => t.qid !== gone.qid);
  if (i < state.qIndex) state.qIndex--;
  else if (i === state.qIndex) {
    if (state.qIndex >= state.queue.length) state.qIndex = state.queue.length - 1;
    if (state.qIndex >= 0) playIndex(state.qIndex);
    else {
      if (playerReady) player.stopVideo();
      $('#video-empty').hidden = false;
      document.body.classList.remove('playing');
    }
  }
  save();
  renderQueue();
  renderNowPlaying();
}

function clearQueue() {
  const cur = current();
  state.queue = cur ? [cur] : [];
  state.baseQueue = state.queue.slice();
  state.qIndex = cur ? 0 : -1;
  save();
  renderQueue();
}

function stop() {
  if (playerReady && current()) { player.pauseVideo(); player.seekTo(0, true); }
  state.pos = 0;
  save();
}

function setVolume(v) {
  state.volume = Math.round(Math.min(100, Math.max(0, v)));
  if (playerReady) player.setVolume(state.volume);
  save();
}

// Replace the queue's order (sort, reverse, randomize) while keeping the current song.
function reorderQueue(tracks) {
  const cur = current();
  state.queue = tracks.slice();
  state.baseQueue = tracks.slice();
  state.qIndex = cur ? state.queue.findIndex((t) => t.qid === cur.qid) : -1;
  save();
  renderQueue();
}

function setupMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.channel,
    album: 'Encore',
    artwork: [{ src: thumbUrl(t.id), sizes: '320x180', type: 'image/jpeg' }],
  });
}

let lastPosSave = 0;
function rememberPosition(force) {
  if (!playerReady || !current() || !player.getVideoData?.()?.video_id) return;
  const cur = player.getCurrentTime?.() || 0;
  if (!cur && !force) return;
  state.pos = cur;
  if (force || Date.now() - lastPosSave > 5000) { lastPosSave = Date.now(); save(); }
}

function tickProgress() {
  if (!playerReady || seeking || !current()) return;
  const st = player.getPlayerState?.();
  // A cued song hasn't started yet, so show the spot it will resume from.
  const cur = st === YT.PlayerState.CUED ? state.pos : player.getCurrentTime?.() || 0;
  if (st === YT.PlayerState.PLAYING) rememberPosition(false);
  const dur = player.getDuration?.() || current().dur || 0;
  $('#time-cur').textContent = fmtTime(cur);
  $('#time-dur').textContent = fmtTime(dur);
  $('#seek').value = dur ? Math.round((cur / dur) * 1000) : 0;
}

// ---------------------------------------------------------------- rendering

function renderNowPlaying() {
  notify();
  const t = current();
  $('#now-title').textContent = t ? t.title : 'Nothing playing';
  $('#now-sub').textContent = t ? t.channel : '';
  $('#btn-now-add').hidden = !t;
  $('#mini-title').textContent = t ? t.title : '';
  $('#mini-sub').textContent = t ? t.channel : '';
  if (t) $('#mini-thumb').src = thumbUrl(t.id);
  $('#time-dur').textContent = fmtTime(t?.dur);
  if (!t) { $('#time-cur').textContent = '0:00'; $('#seek').value = 0; }
  document.title = t ? `${t.title} · Encore` : 'Encore';
  if (t) setupMediaSession(t);
  updateMini();
  markCurrent();
}

function markCurrent() {
  const t = current();
  document.querySelectorAll('.track[data-id]').forEach((row) => {
    const isCur = row.dataset.qid ? row.dataset.qid === t?.qid : row.dataset.id === t?.id;
    row.classList.toggle('current', !!t && isCur);
  });
}

function renderModes() {
  notify();
  $('#btn-shuffle').setAttribute('aria-pressed', String(state.shuffle));
  const r = $('#btn-repeat');
  r.dataset.mode = state.repeat;
  r.title = `Repeat: ${state.repeat}`;
}

function trackRow(t, { onPlay, onMenu, qid, edit }) {
  const sub = [t.channel, t.dur ? fmtTime(t.dur) : ''].filter(Boolean).join(' · ');
  const row = el('li', { class: 'track', 'data-id': t.id, 'data-qid': qid },
    el('img', { class: 'thumb', src: thumbUrl(t.id), alt: '', loading: 'lazy' }),
    el('div', { class: 't-text' },
      el('div', { class: 't-title', text: t.title }),
      el('div', { class: 't-sub', text: sub })));
  if (edit) {
    const up = el('button', { class: 'icon-btn', 'aria-label': 'Move up', onclick: (e) => { e.stopPropagation(); edit.up(); } });
    up.append(svgIcon(ICON_UP));
    const down = el('button', { class: 'icon-btn', 'aria-label': 'Move down', onclick: (e) => { e.stopPropagation(); edit.down(); } });
    down.append(svgIcon(ICON_DOWN));
    row.append(up, down);
  } else {
    const more = el('button', { class: 'icon-btn', 'aria-label': 'More options', onclick: (e) => { e.stopPropagation(); onMenu(); } });
    more.append(svgIcon(ICON_MORE));
    row.append(more);
    row.addEventListener('click', onPlay);
  }
  return row;
}

function trackMenu(t, extra = []) {
  menu(t.title, [
    { label: 'Play next', action: () => enqueue(t, true) },
    { label: 'Add to queue', action: () => enqueue(t, false) },
    { label: 'Add to playlist…', action: () => pickPlaylist(t) },
    ...extra,
    { label: 'Open on YouTube', action: () => window.open(`https://www.youtube.com/watch?v=${t.id}`, '_blank', 'noopener') },
  ]);
}

// ---------------------------------------------------------------- search

const search = { query: '', results: [], nextPage: '', busy: false };

function renderSearch() {
  notify();
  $('#key-notice').hidden = !!state.apiKey;
  const list = $('#search-results');
  list.replaceChildren(...search.results.map((t, i) => trackRow(t, {
    onPlay: () => playList(search.results, i),
    onMenu: () => trackMenu(t),
  })));
  $('#search-more').hidden = !search.nextPage || search.busy;
  const recent = $('#recent');
  recent.replaceChildren(...(search.results.length || search.busy ? [] : state.recent.map((q) =>
    el('button', { class: 'chip', text: q, onclick: () => { $('#search-input').value = q; runSearch(q); } }))));
  markCurrent();
}

function remember(q) {
  state.recent = [q, ...state.recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  save();
}

async function runSearch(q, more = false) {
  q = q.trim();
  if (!q || search.busy) return;

  const listId = parsePlaylistId(q);
  const videoId = parseVideoId(q);
  if (videoId) return addFromLink(videoId);
  if (listId) return importYouTubePlaylist(listId);

  if (!state.apiKey) {
    $('#key-notice').hidden = false;
    toast('Add a YouTube API key in Settings to search.');
    return;
  }
  const status = $('#search-status');
  if (!more) { search.query = q; search.results = []; search.nextPage = ''; remember(q); }
  search.busy = true;
  status.textContent = 'Searching…';
  renderSearch();
  try {
    const data = await ytApi('search', {
      part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: 25,
      q: search.query, pageToken: more ? search.nextPage : '',
      videoCategoryId: state.musicOnly ? '10' : '',
    });
    const ids = (data.items || []).map((it) => it.id?.videoId).filter(Boolean);
    const details = ids.length ? await fetchVideoDetails(ids) : new Map();
    const seen = new Set(search.results.map((t) => t.id));
    for (const id of ids) {
      const v = details.get(id);
      if (!v || seen.has(id)) continue;
      seen.add(id);
      search.results.push(trackFromVideo(v));
    }
    search.nextPage = data.nextPageToken || '';
    status.textContent = search.results.length ? '' : 'No results.';
  } catch (err) {
    status.textContent = err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
    if (!(err instanceof ApiError)) console.error(err);
  } finally {
    search.busy = false;
    renderSearch();
  }
}

async function lookupVideo(id) {
  let track = null;
  try {
    if (state.apiKey) {
      const v = (await fetchVideoDetails([id])).get(id);
      if (v) track = trackFromVideo(v);
    } else {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
      if (res.ok) {
        const d = await res.json();
        track = { id, title: d.title, channel: d.author_name, dur: 0 };
      }
    }
  } catch { /* fall through to a bare track */ }
  return track || { id, title: 'YouTube video', channel: id, dur: 0 };
}

async function addFromLink(id) {
  const status = $('#search-status');
  status.textContent = 'Looking up video…';
  const track = await lookupVideo(id);
  status.textContent = '';
  search.results = [track];
  search.nextPage = '';
  renderSearch();
  playList([track], 0);
}

// ---------------------------------------------------------------- library

let openPlaylistId = null;
let editOrder = false;

const findPlaylist = (id) => state.playlists.find((p) => p.id === id);

function createPlaylist(name, tracks = []) {
  const p = { id: uid(), name: name.trim() || 'Untitled playlist', tracks: tracks.map(cleanTrack), created: Date.now() };
  state.playlists.push(p);
  save();
  renderLibrary();
  return p;
}

function addToPlaylist(p, t) {
  if (p.tracks.some((x) => x.id === t.id)) { toast(`Already in "${p.name}"`); return; }
  p.tracks.push(cleanTrack(t));
  save();
  renderLibrary();
  toast(`Added to "${p.name}"`, 1500);
}

function pickPlaylist(t) {
  menu('Add to playlist', [
    { label: '+ New playlist…', action: async () => {
      const name = await ask('New playlist', '', 'Playlist name');
      if (name) addToPlaylist(createPlaylist(name), t);
    } },
    ...state.playlists.map((p) => ({ label: `${p.name}  (${p.tracks.length})`, action: () => addToPlaylist(p, t) })),
  ]);
}

function renderLibrary() {
  notify();
  const p = openPlaylistId && findPlaylist(openPlaylistId);
  $('#lib-list-view').hidden = !!p;
  $('#lib-detail-view').hidden = !p;

  if (!p) {
    openPlaylistId = null;
    const list = $('#playlists');
    if (!state.playlists.length) {
      list.replaceChildren(el('li', { class: 'empty', text: 'No playlists yet. Make one here, or tap ••• on any song.' }));
      return;
    }
    list.replaceChildren(...state.playlists.map((pl) => {
      const first = pl.tracks[0];
      return el('li', { class: 'pl-row', onclick: () => { openPlaylistId = pl.id; editOrder = false; renderLibrary(); window.scrollTo({ top: $('.content').offsetTop }); } },
        first ? el('img', { class: 'thumb', src: thumbUrl(first.id), alt: '', loading: 'lazy' }) : el('div', { class: 'thumb' }),
        el('div', { class: 't-text' },
          el('div', { class: 't-title', text: pl.name }),
          el('div', { class: 't-sub', text: `${pl.tracks.length} song${pl.tracks.length === 1 ? '' : 's'}` })));
    }));
    return;
  }

  $('#pl-name').textContent = p.name;
  $('#btn-pl-edit').setAttribute('aria-pressed', String(editOrder));
  $('#btn-pl-edit').textContent = editOrder ? 'Done' : 'Edit order';
  const total = p.tracks.reduce((s, t) => s + (t.dur || 0), 0);
  $('#pl-status').textContent = p.tracks.length
    ? `${p.tracks.length} song${p.tracks.length === 1 ? '' : 's'}${total ? ' · ' + fmtTime(total) : ''}`
    : 'This playlist is empty. Search for songs and tap ••• to add them.';
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= p.tracks.length) return;
    [p.tracks[i], p.tracks[j]] = [p.tracks[j], p.tracks[i]];
    save();
    renderLibrary();
  };
  $('#pl-tracks').replaceChildren(...p.tracks.map((t, i) => trackRow(t, {
    onPlay: () => playList(p.tracks, i),
    onMenu: () => trackMenu(t, [{ label: 'Remove from playlist', danger: true, action: () => {
      p.tracks.splice(p.tracks.indexOf(t), 1);
      save();
      renderLibrary();
    } }]),
    edit: editOrder && { up: () => move(i, -1), down: () => move(i, 1) },
  })));
  markCurrent();
}

function playlistMenu(p) {
  menu(p.name, [
    { label: 'Add all to queue', action: () => { p.tracks.forEach((t) => enqueue(t, false)); } },
    { label: 'Rename…', action: async () => {
      const name = await ask('Rename playlist', p.name, 'Playlist name');
      if (name) { p.name = name.trim(); save(); renderLibrary(); }
    } },
    { label: 'Delete playlist', danger: true, action: () => menu(`Delete "${p.name}"?`, [
      { label: 'Delete', danger: true, action: () => {
        state.playlists = state.playlists.filter((x) => x !== p);
        openPlaylistId = null;
        save();
        renderLibrary();
        toast('Playlist deleted');
      } },
    ]) },
  ]);
}

async function importYouTubePlaylist(listId) {
  if (!state.apiKey) { toast('Importing a playlist needs a YouTube API key (see Settings).', 3500); return; }
  toast('Importing playlist…', 60000);
  try {
    const meta = await ytApi('playlists', { part: 'snippet', id: listId });
    const title = decodeEntities(meta.items?.[0]?.snippet?.title) || 'Imported playlist';
    const ids = [];
    let page = '';
    for (let n = 0; n < 40; n++) { // up to 2000 songs
      const data = await ytApi('playlistItems', { part: 'contentDetails', playlistId: listId, maxResults: 50, pageToken: page });
      for (const it of data.items || []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      page = data.nextPageToken;
      if (!page) break;
    }
    // Deleted or private videos don't come back from videos.list, so this drops them.
    const details = await fetchVideoDetails([...new Set(ids)]);
    const tracks = ids.filter((id, i) => ids.indexOf(id) === i && details.has(id)).map((id) => trackFromVideo(details.get(id)));
    const p = createPlaylist(title, tracks);
    openPlaylistId = p.id;
    switchTab('library');
    toast(`Imported ${tracks.length} songs into "${p.name}"`);
  } catch (err) {
    toast(err instanceof ApiError ? err.message : 'Import failed. Try again.', 4000);
    if (!(err instanceof ApiError)) console.error(err);
  }
}

function exportLibrary() {
  const data = { app: 'encore', version: 1, exported: new Date().toISOString(), playlists: state.playlists };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `encore-library-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data?.playlists)) throw new Error('bad file');
    let added = 0;
    for (const p of data.playlists) {
      if (!p || !Array.isArray(p.tracks)) continue;
      const tracks = p.tracks.filter((t) => t && ID_RE.test(t.id)).map(cleanTrack);
      const existing = state.playlists.find((x) => x.id === p.id);
      if (existing) { existing.name = String(p.name || existing.name); existing.tracks = tracks; }
      else state.playlists.push({ id: typeof p.id === 'string' ? p.id : uid(), name: String(p.name || 'Imported playlist'), tracks, created: Date.now() });
      added++;
    }
    save();
    renderLibrary();
    toast(`Restored ${added} playlist${added === 1 ? '' : 's'}`);
  } catch {
    toast("That file isn't an Encore backup.", 3500);
  }
}

// ---------------------------------------------------------------- queue view

function renderQueue() {
  notify();
  const list = $('#queue');
  const cur = state.qIndex;
  $('#queue-status').textContent = state.queue.length
    ? `${state.queue.length} song${state.queue.length === 1 ? '' : 's'}${state.shuffle ? ' · shuffled' : ''}`
    : 'Nothing queued. Play a song or playlist to fill this up.';
  list.replaceChildren(...state.queue.map((t, i) => {
    const row = trackRow(t, {
      qid: t.qid,
      onPlay: () => playIndex(i),
      onMenu: () => trackMenu(t, [{ label: 'Remove from queue', danger: true, action: () => removeFromQueue(i) }]),
    });
    if (i < cur) row.style.opacity = '.5';
    return row;
  }));
  markCurrent();
}

// ---------------------------------------------------------------- sheet (menus + prompts)

let sheetResolve = null;

function openSheet(title, body) {
  $('#sheet-title').textContent = title;
  $('#sheet-body').replaceChildren(...body);
  $('#sheet').hidden = false;
  $('#sheet-backdrop').hidden = false;
}

function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  if (sheetResolve) { sheetResolve(null); sheetResolve = null; }
}

function menu(title, items) {
  openSheet(title, items.map((it) => el('button', {
    class: 'sheet-item' + (it.danger ? ' danger' : ''), text: it.label,
    onclick: () => { closeSheet(); it.action(); },
  })));
}

function ask(title, value, placeholder) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', value, placeholder, 'aria-label': placeholder, maxlength: 100 });
    const form = el('form', { onsubmit: (e) => {
      e.preventDefault();
      const v = input.value.trim();
      sheetResolve = null;
      closeSheet();
      resolve(v || null);
    } }, input, el('button', { type: 'submit', class: 'btn primary', text: 'OK' }));
    openSheet(title, [form]);
    sheetResolve = resolve;
    setTimeout(() => { input.focus(); input.select(); }, 50);
  });
}

// ---------------------------------------------------------------- tabs + mini player

function switchTab(name) {
  document.querySelectorAll('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== `panel-${name}`; });
  if (name === 'library') renderLibrary();
  if (name === 'queue') renderQueue();
  if (name === 'search') renderSearch();
  if (name === 'settings') { $('#key-input').value = state.apiKey; $('#opt-music').checked = state.musicOnly; }
}

let playerVisible = true;
function updateMini() {
  $('#mini').hidden = playerVisible || !current() || matchMedia('(min-width: 900px)').matches;
}

// ---------------------------------------------------------------- wiring

function init() {
  $('#btn-play').onclick = togglePlay;
  $('#mini-play').onclick = (e) => { e.stopPropagation(); togglePlay(); };
  $('#btn-next').onclick = () => next();
  $('#mini-next').onclick = (e) => { e.stopPropagation(); next(); };
  $('#btn-prev').onclick = prev;
  $('#btn-shuffle').onclick = () => setShuffle(!state.shuffle);
  $('#btn-repeat').onclick = cycleRepeat;
  $('#btn-now-add').onclick = () => current() && pickPlaylist(current());
  $('#mini').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const seek = $('#seek');
  seek.addEventListener('input', () => {
    seeking = true;
    const dur = (playerReady && player.getDuration?.()) || current()?.dur || 0;
    $('#time-cur').textContent = fmtTime((seek.value / 1000) * dur);
  });
  seek.addEventListener('change', () => {
    const dur = (playerReady && player.getDuration?.()) || 0;
    if (dur) { player.seekTo((seek.value / 1000) * dur, true); state.pos = (seek.value / 1000) * dur; save(); }
    seeking = false;
  });

  document.querySelectorAll('.tabs [role=tab]').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { e.preventDefault(); switchTab(go.dataset.goto); }
  });

  $('#search-form').onsubmit = (e) => {
    e.preventDefault();
    const input = $('#search-input');
    input.blur(); // closes the phone keyboard
    runSearch(input.value);
  };
  $('#search-more').onclick = () => runSearch(search.query, true);

  $('#btn-new-playlist').onclick = async () => {
    const name = await ask('New playlist', '', 'Playlist name');
    if (name) { openPlaylistId = createPlaylist(name).id; renderLibrary(); }
  };
  $('#btn-back').onclick = () => { openPlaylistId = null; renderLibrary(); };
  $('#btn-pl-menu').onclick = () => playlistMenu(findPlaylist(openPlaylistId));
  $('#btn-pl-play').onclick = () => { const p = findPlaylist(openPlaylistId); if (p?.tracks.length) playList(p.tracks, 0, { shuffle: false }); };
  $('#btn-pl-shuffle').onclick = () => { const p = findPlaylist(openPlaylistId); if (p?.tracks.length) playList(p.tracks, 0, { shuffle: true }); };
  $('#btn-pl-edit').onclick = () => { editOrder = !editOrder; renderLibrary(); };
  $('#btn-clear-queue').onclick = clearQueue;

  $('#key-form').onsubmit = (e) => {
    e.preventDefault();
    state.apiKey = $('#key-input').value.trim();
    save();
    renderSearch();
    toast(state.apiKey ? 'API key saved' : 'API key removed');
  };
  $('#opt-music').onchange = (e) => { state.musicOnly = e.target.checked; save(); };
  $('#import-yt-form').onsubmit = (e) => {
    e.preventDefault();
    const id = parsePlaylistId($('#import-yt-input').value);
    if (!id) { toast("That doesn't look like a YouTube playlist link."); return; }
    $('#import-yt-input').value = '';
    importYouTubePlaylist(id);
  };
  $('#btn-export').onclick = exportLibrary;
  $('#import-file').onchange = (e) => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ''; };

  $('#sheet-cancel').onclick = closeSheet;
  $('#sheet-backdrop').onclick = closeSheet;

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') closeSheet();
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' && e.shiftKey) next();
    else if (e.key === 'ArrowLeft' && e.shiftKey) prev();
  });

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const safe = (a, fn) => { try { ms.setActionHandler(a, fn); } catch { /* unsupported action */ } };
    safe('play', () => player?.playVideo());
    safe('pause', () => player?.pauseVideo());
    safe('nexttrack', () => next());
    safe('previoustrack', prev);
  }

  new IntersectionObserver(([entry]) => { playerVisible = entry.isIntersecting; updateMini(); }, { threshold: 0.15 })
    .observe($('.player'));
  matchMedia('(min-width: 900px)').addEventListener?.('change', updateMini);

  // Restore the last session without autoplaying.
  if (state.qIndex >= state.queue.length) state.qIndex = state.queue.length - 1;
  renderModes();
  renderSearch();
  renderNowPlaying();
  // Pick up where the last session left off: same song, same spot.
  if (current()) {
    loadVideo(current().id, false, state.pos);
    $('#time-cur').textContent = fmtTime(state.pos);
    if (current().dur) $('#seek').value = Math.round((state.pos / current().dur) * 1000);
  }
  const flush = () => rememberPosition(true);
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  setInterval(tickProgress, 500);
  loadYouTubeApi();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// Used by classic.js (the Winamp-style skin).
window.Encore = {
  state, search, current, notify, toast, fmtTime, save,
  get player() { return playerReady ? player : null; },
  togglePlay, next, prev, stop, playIndex, playList, setShuffle, cycleRepeat, setVolume,
  enqueue, removeFromQueue, clearQueue, reorderQueue,
  runSearch, lookupVideo, parseVideoId, parsePlaylistId, importYouTubePlaylist,
  createPlaylist, trackMenu, playlistMenu, pickPlaylist, menu, ask, closeSheet,
};

init();
document.dispatchEvent(new Event('encore:ready'));
