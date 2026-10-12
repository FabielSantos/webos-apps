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
ares-package apps/hello-tv -o ipks          # bump "version" in appinfo.json first
python3 build_index.py https://fabielsantos.github.io/webos-apps
git add -A && git commit -m "hello-tv x.y.z" && git push
```

`build_index.py` reads every `ipks/*.ipk` and writes `api/apps.json` with versions and sha256 hashes. Icons go in `icons/<app-id>.png`. Delete an app's older ipk when publishing a new one.

## Install directly (without the repository)

```bash
ares-install -d tvsala ipks/com.fvsant.hellotv_1.0.2_all.ipk
```
