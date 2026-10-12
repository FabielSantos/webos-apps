#!/bin/sh
# Package apps/<name> into ipks/, leaving out dev-only files (*.py, description.html)
# and removing older ipks of the same app.
# Usage: ./build_app.sh hello-tv
set -eu
cd "$(dirname "$0")"
name="$1"
src="apps/$name"
id=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['id'])" "$src/appinfo.json")

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
rsync -a --exclude '*.py' --exclude 'description.html' --exclude '.DS_Store' "$src/" "$stage/$name/"

rm -f "ipks/${id}_"*.ipk
ares-package "$stage/$name" -o ipks
