#!/usr/bin/env python3
"""Generate api/apps.json (Homebrew Channel repository index) from ipks/*.ipk.

Usage: python3 build_index.py <BASE_URL>
  BASE_URL = where this folder is served, e.g. https://<user>.github.io/webos-apps

Per-app metadata comes from the source folder apps/<name>/ whose appinfo.json has
the same id as the ipk:
  - largeIcon / icon     -> repository icon
  - appDescription       -> short description
  - description.html     -> full description (Details screen)
  - the folder on GitHub -> "Project page" button (sourceUrl)
"""
import hashlib
import io
import json
import re
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read_member(ipk: Path, member: str) -> bytes:
    return subprocess.run(["ar", "p", str(ipk), member], check=True, capture_output=True).stdout


def ipk_info(ipk: Path) -> tuple[dict, dict]:
    """Return (control fields, appinfo.json) from an ipk."""
    with tarfile.open(fileobj=io.BytesIO(read_member(ipk, "control.tar.gz"))) as t:
        f = next(m for m in t.getmembers() if m.name.lstrip("./") == "control")
        control = dict(
            line.split(": ", 1) for line in t.extractfile(f).read().decode().splitlines() if ": " in line
        )
    with tarfile.open(fileobj=io.BytesIO(read_member(ipk, "data.tar.gz"))) as t:
        f = next(m for m in t.getmembers() if m.name.endswith("/appinfo.json") and "/applications/" in m.name)
        appinfo = json.loads(t.extractfile(f).read())
    return control, appinfo


def source_dirs() -> dict[str, Path]:
    """Map app id -> apps/<name>/ source folder."""
    dirs = {}
    for info in (ROOT / "apps").glob("*/appinfo.json"):
        dirs[json.loads(info.read_text())["id"]] = info.parent
    return dirs


def github_tree_url() -> str:
    """https://github.com/<owner>/<repo>/tree/main, from the origin remote (empty if unknown)."""
    try:
        url = subprocess.run(["git", "-C", str(ROOT), "remote", "get-url", "origin"],
                             check=True, capture_output=True, text=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""
    m = re.search(r"github\.com[:/](.+?)(?:\.git)?$", url)
    return f"https://github.com/{m.group(1)}/tree/main" if m else ""


def main() -> None:
    base = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8000"
    sources = source_dirs()
    tree = github_tree_url()
    packages = []
    for ipk in sorted((ROOT / "ipks").glob("*.ipk")):
        control, appinfo = ipk_info(ipk)
        app_id = control["Package"]
        src = sources.get(app_id)
        rel = src.relative_to(ROOT).as_posix() if src else ""

        icon_uri = ""
        if src:
            icon = next((src / appinfo[k] for k in ("largeIcon", "icon") if appinfo.get(k) and (src / appinfo[k]).exists()), None)
            if icon:
                icon_uri = f"{base}/{rel}/{icon.name}"

        manifest = {
            "id": app_id,
            "version": control["Version"],
            "type": appinfo.get("type", "web"),
            "title": appinfo.get("title", app_id),
            "appDescription": appinfo.get("appDescription", ""),
            "iconUri": icon_uri,
            "sourceUrl": f"{tree}/{rel}" if tree and rel else "",
            "rootRequired": False,
            "ipkUrl": f"{base}/ipks/{ipk.name}",
            "ipkHash": {"sha256": hashlib.sha256(ipk.read_bytes()).hexdigest()},
        }
        package = {
            "id": app_id,
            "title": manifest["title"],
            "iconUri": icon_uri,
            "manifest": manifest,
            "shortDescription": manifest["appDescription"] or manifest["title"],
        }
        if src and (src / "description.html").exists():
            package["fullDescriptionUrl"] = f"{base}/{rel}/description.html"
        packages.append(package)
        print(f"  {app_id} {manifest['version']}  icon={'yes' if icon_uri else 'no'}"
              f"  desc={'yes' if 'fullDescriptionUrl' in package else 'no'}  source={manifest['sourceUrl'] or '-'}")

    index = {"paging": {"page": 1, "count": 1, "maxPage": 1, "itemsTotal": len(packages)}, "packages": packages}
    (ROOT / "api").mkdir(exist_ok=True)
    (ROOT / "api" / "apps.json").write_text(json.dumps(index, indent=1, ensure_ascii=False))
    print(f"wrote api/apps.json ({len(packages)} packages) for {base}")


if __name__ == "__main__":
    main()
