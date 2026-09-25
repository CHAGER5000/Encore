# Encore: a YouTube music player (Musi replacement)

Encore is a web app you add to
your phone's home screen. It searches YouTube, plays songs through YouTube's
official embedded player, and keeps your playlists on your device.

## Features

- **Search** YouTube for songs, or paste any YouTube link to play it.
- **Playlists**: as many as you like. Add from any song's ••• menu. You can
  rename, reorder, delete, play or shuffle them.
- **Import a YouTube playlist** by pasting its link (Settings).
- **Up next** queue with *Play next* / *Add to queue*, plus shuffle and
  repeat (all / one).
- **Remembers everything**: playlists, the queue, the song you were on and
  the exact spot in it. Reopen the app and press play to carry on.
- **Backup**: export your library to a file and import it on another device.
- Skips videos whose owners don't allow playback outside YouTube.

## Classic look (Winamp style)

Encore opens in a **classic skin** modeled on Winamp 2.x, using colors
sampled from the original base skin. It's drawn in code rather than
bitmaps, so it stays sharp at any size. On a computer, four windows sit
docked in the bottom-right corner of a teal desktop: the main player,
the playlist editor, a video window (YouTube requires the video to stay
visible) and a library for searching and for your saved playlists.

- Drag windows by their title bars; they snap to the screen edges and to
  each other. Drag the playlist or library grip to resize.
- **Ctrl+D** (or the **D** button) switches between 150%, 200% and 300%.
- Keyboard: **Z X C V B** = previous / play / pause / stop / next,
  **L** = open search, **S** = shuffle, **R** = repeat, **J** = search.
- Double-click a song to play it (a single tap on a touch screen).
  Right-click for *Play next*, *Add to playlist* and so on.
- **ADD / REM / SEL / MISC / LIST OPTS** work like the original.
  *LIST OPTS > Save list* stores the current list as a playlist.
- The spectrum analyzer is simulated. YouTube doesn't let pages read its
  audio, so the analyzer and EQ can't respond to the actual sound.
- On a phone the windows stack full width. To switch to the simple
  layout, choose *Switch to modern look* in the main menu (top-left
  button). Switch back under *Settings > Look*.

## Setup

1. **Open it:** https://chager5000.github.io/encore/
2. **Add a YouTube API key** (free, needed for search and playlist import):
   in the [Google Cloud console](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
   create a project, enable **YouTube Data API v3**, then go to
   *Credentials > Create credentials > API key*. Under the key's
   *Application restrictions* choose *Websites* and add
   `https://<your-user>.github.io/*` so nobody else can use it. Paste the
   key in Encore's Settings. The free quota is about 100 searches a day.
3. **Install on iPhone:** open the link in Safari, tap *Share > Add to Home
   Screen*. On Android (Chrome): menu > *Install app*.

## Limits

- On iPhone, playback usually stops when the screen locks or you switch
  apps, because Safari pauses embedded videos in the background. Musi was a
  native app and could avoid this. A native iOS wrapper is a possible next
  step.
- Videos show YouTube's normal ads. Blocking them would break YouTube's
  terms.
- Your data lives in the browser on that device. Use *Export library* to
  back it up or move it.
