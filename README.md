# Somnia — sleep diary, insights & sound room

Saved checkpoint: **progress** (2 November 2026)

A local-first sleep tracking web app. Log a night, see your weekly rhythm and sleep score, get guidance tied to your own entries, and wind down with generated soundscapes or a hand-off to your music platform.

No build step, no npm dependencies and no backend. Everything runs in the browser.

## Run it

Requires Python 3.9+.

```bash
python serve.py
```

It prints the two addresses that matter:

```
  On this computer : http://127.0.0.1:4173/
  On your phone    : http://192.168.1.68:4173/
```

Open the first on this computer, the second on a phone sharing the same Wi-Fi.
The server listens on `0.0.0.0`, so the phone reaches it over the local network.
Add `--local` to keep it to this computer only, or `--port 4174` to move it.

Use `127.0.0.1`, not `localhost`, for the Spotify redirect URI, because Spotify no longer accepts `localhost`.

`serve.py` serves HTML fresh on every load and lets the service worker cache the rest. Any other static server works too, as long as the Spotify redirect URI matches exactly.

## Use it on your phone

1. Put the phone on the same Wi-Fi as this computer.
2. Run `python serve.py` and copy the **On your phone** address it prints.
3. Open that address in the phone's browser.

Then install it, so it opens full screen with its own icon and no browser chrome:

- **iPhone / iPad (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app** (or **Add to Home screen**).

Sleep entries are stored per browser. They do not sync between this computer and
the phone, and clearing the browser's site data erases them — export a JSON
backup from **Settings → Data** first.

What works depends on the address you use:

| Feature | Plain Wi-Fi `http://192.168…` | `https://` or `localhost` |
| --- | --- | --- |
| Diary, dashboard, insights, journal | yes | yes |
| Soundscapes and sleep timer | yes | yes |
| Opens without a network (offline cache) | no | yes |
| Spotify sign-in | no | yes |

Browsers only allow service workers and `crypto.subtle` — which Spotify's PKCE
challenge relies on — in a secure context. Over plain Wi-Fi the app runs fine
and the generated soundscapes still work; for the last two rows, serve it over
HTTPS (a tunnel or a static host) and add that exact URL as a Spotify redirect URI.

## What works

- Onboarding: name, sleep goal, target bedtime/wake time, preferred music platform.
- Sleep diary: wake date, bedtime, wake time, sleep latency, wake-ups, 1–5 quality, tags, notes.
- Dashboard: last night’s score, six-part breakdown, seven-night average, consistency, sleep debt, logging streak, tonight’s wind-down plan.
- Insights: duration bars against goal, a sleep-window chart, evidence-style factor comparisons (with vs without a tag), personalized advice.
- Journal: grouped entries, edit, delete, JSON export/import.
- Sound room: four soundscapes synthesized with Web Audio (rain, ocean, brown noise, fan), volume, sleep timer, persistent mini-player.
- Music: Spotify PKCE account connection with playlist library, device picker, playback hand-off; Apple Music, YouTube Music, Amazon Music, SoundCloud and Spotify deep-link search.
- Settings: schedule, goal, data export/import, sample data, clear journal, Spotify Client ID.
- Phone use: responsive layout with a bottom tab bar, installable to the home screen, offline shell where the browser allows it.

## Spotify setup (optional)

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Add this exact redirect URI:

   ```
   http://127.0.0.1:4173/
   ```

3. Under **User Management**, add the Spotify account you will use. Development mode is currently limited to five users and requires the app owner to have Spotify Premium.
4. Copy the app’s **Client ID** (no client secret is needed).
5. In Somnia: **Settings → Music & streaming**, paste the Client ID, save, then **Connect Spotify**.

Somnia uses Authorization Code with PKCE and the scopes:

```
user-read-private playlist-read-private playlist-read-collaborative
user-read-playback-state user-modify-playback-state
```

Tokens are stored in this browser’s local storage. Nothing is sent to a Somnia server because there isn’t one. Playback starts on an already-open Spotify device and requires Premium.

If you host the app on HTTPS later, add that exact URL as an additional redirect URI in the Spotify app.

## Data & privacy

- Sleep entries and settings live in `localStorage` under `somnia.data.v1`.
- Export a JSON backup from the Journal or Settings before clearing browser data.
- Soundscapes are generated locally; no audio files are downloaded.
- External music links only open when chosen.
- Spotify requests happen only after you connect your own Client ID/account.

## Project layout

```
index.html          app shell, favicon and install metadata
manifest.webmanifest  app name, colours and home-screen icons
sw.js               offline shell cache (https or localhost only)
serve.py            static server for this computer and the local network
icons/              home-screen, maskable and Apple touch icons
css/
  styles.css        imports the layers
  base.css          tokens, reset, sidebar, shared controls
  components.css    dashboard, charts, journal, sound room, Spotify
  overlays.css      modals, drawer, onboarding
  responsive.css    mobile layouts + reduced motion
js/
  app.js            shell, routing, actions, Spotify controller
  views.js          all render functions
  store.js          localStorage state, tags, providers, sample data
  sleep.js          score, stats, advice engine, tonight plan
  spotify.js        PKCE auth + Web API client
  sounds.js         Web Audio soundscapes + timer
  icons.js          inline SVG icons
  utils.js          dates, formatting, math helpers
```

## Checkpoint notes

Verified in Chromium during this session:

- First-run onboarding and settings persistence.
- Sample-data dashboard, generated advice, weekly stats, sleep-debt calculation.
- Log modal defaults and live duration preview.
- Saving, editing and deleting a night end-to-end, including Enter-to-save.
- Settings save without a page navigation.
- Responsive layout down to a narrow mobile viewport.

Worth re-checking on your own machine:

- Insights and Sound-room layouts at your preferred window size.
- Spotify sign-in (needs your own Client ID and an allowlisted Premium account).
- Generated audio playback and the sleep timer.

The save flow was verified with a temporary entry that was deleted afterwards. The archive contains source and setup files only — no sleep entries or Spotify tokens.

The app is a general wellbeing tool, not a medical device. It does not diagnose or treat insomnia or any health condition.
