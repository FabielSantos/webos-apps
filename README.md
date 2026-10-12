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
