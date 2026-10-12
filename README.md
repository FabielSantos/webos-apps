# webos-apps

Personal [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) repository for webOS TV.

## Add to the TV

Homebrew Channel → Settings → Add repository:

```
https://fabielsantos.github.io/webos-apps/api/apps.json
```

## Apps

| App | ID | Source |
|---|---|---|
| Hello TV | `com.fvsant.hellotv` | [apps/hello-tv](apps/hello-tv) |
| Clima | `com.fvsant.clima` | [apps/clima](apps/clima) — weather via Open-Meteo, remote-navigable |
| Painel | `com.fvsant.painel` | [apps/painel](apps/painel) — living-room dashboard: clock, weather, Google Calendar, Bing photos |
| Enviar pra TV | `com.fvsant.enviar` | [apps/enviar](apps/enviar) — receive links, media and notes from the phone ([send/](send)) or the Mac ([tools/send-to-tv](tools/send-to-tv)) via ntfy.sh |
| Canais | `com.fvsant.canais` | [apps/canais](apps/canais) — free live channels from [iptv-org](https://github.com/iptv-org/iptv) M3U lists, native HLS |
| Rádios | `com.fvsant.radios` | [apps/radios](apps/radios) — internet radio from [Radio Browser](https://www.radio-browser.info): countries, genres, search, favorites |

### Canais: add your own M3U playlist

```bash
ares-launch -d tvsala com.fvsant.canais -p '{"m3u":"https://example.com/list.m3u","name":"Minha lista"}'
ares-launch -d tvsala com.fvsant.canais -p '{"m3u":null,"name":"Minha lista"}'   # remove it
```

### Enviar pra TV: setup

Messages travel through a secret [ntfy.sh](https://ntfy.sh) channel (public service, no account). Anyone who knows the
channel name can send to the TV, so it is random and lives only on the TV, the phone and `~/.config/send-to-tv/`.

- **Mac:** `tools/send-to-tv --setup` creates a channel and sets it on the TV (same network). Then
  `tools/send-to-tv https://youtu.be/…`, `tools/send-to-tv "texto"` or `tools/send-to-tv -f foto.jpg`.
- **Phone:** scan the QR code on the TV. On Android, *Add to home screen* makes it appear in the *Share* menu.
- **On the TV:** YouTube → YouTube app · video/photo/audio → plays in the app · other links → TV browser · text → note on screen.
  The app must be open to receive. Red button (twice) creates a new channel.

### Painel: connect your Google Calendar

The calendar address is secret, so it never goes in this repository — it is sent straight to the TV, which stores it.

1. Google Calendar (web) → Settings → your calendar → *Integrate calendar* → copy **Secret address in iCal format**.
2. From the Mac, on the same network as the TV:

```bash
ares-launch -d tvsala com.fvsant.painel -p '{"ical":"PASTE_THE_SECRET_ADDRESS_HERE"}'
```

Other options (same command, different JSON): several calendars `{"ical":["url1","url2"]}`, hide holidays `{"holidays":false}`,
fixed weather location `{"city":"Toronto","lat":43.70,"lon":-79.40}` (default: by IP), start over `{"reset":true}`.

## Publish a new version

Requires the webOS TV CLI (`npm install -g @webos-tools/cli`; **not** `@webosose/ares-cli`, whose packages are rejected by the TV with `-5: ipk verified failed`).

```bash
./build_app.sh hello-tv                      # bump "version" in appinfo.json first
python3 build_index.py https://fabielsantos.github.io/webos-apps
git add -A && git commit -m "hello-tv x.y.z" && git push
```

`build_app.sh` packages `apps/<name>/` without dev-only files (`*.py`, `description.html`) and replaces the app's older ipk.
`build_index.py` reads every `ipks/*.ipk` and writes `api/apps.json` with versions and sha256 hashes. For each app it takes from `apps/<name>/`:

| Shown in Homebrew Channel | Source |
|---|---|
| Icon | `largeIcon` (or `icon`) from `appinfo.json` |
| Short description | `appDescription` from `appinfo.json` |
| Full description | `description.html` |
| "Project page" button | the app's folder on GitHub |

## Install directly (without the repository)

```bash
ares-install -d tvsala ipks/com.fvsant.hellotv_1.0.3_all.ipk
```
