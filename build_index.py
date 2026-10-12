#!/usr/bin/env python3
"""Generate api/apps.json (Homebrew Channel repository index) from ipks/*.ipk.

Usage: python3 build_index.py <BASE_URL>
  BASE_URL = where this folder is served, e.g. http://192.168.0.186:8000
             or https://<user>.github.io/webos-apps
"""
import hashlib
import io
import json
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


def main() -> None:
    base = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8000"
    packages = []
    for ipk in sorted((ROOT / "ipks").glob("*.ipk")):
        control, appinfo = ipk_info(ipk)
        app_id = control["Package"]
        icon = ROOT / "icons" / f"{app_id}.png"
        icon_uri = f"{base}/icons/{icon.name}" if icon.exists() else ""
        manifest = {
            "id": app_id,
            "version": control["Version"],
            "type": appinfo.get("type", "web"),
            "title": appinfo.get("title", app_id),
            "appDescription": appinfo.get("appDescription", ""),
            "iconUri": icon_uri,
            "sourceUrl": "",
            "rootRequired": False,
            "ipkUrl": f"{base}/ipks/{ipk.name}",
            "ipkHash": {"sha256": hashlib.sha256(ipk.read_bytes()).hexdigest()},
        }
        packages.append({
            "id": app_id,
            "title": manifest["title"],
            "iconUri": icon_uri,
            "manifest": manifest,
            "shortDescription": manifest["appDescription"] or manifest["title"],
        })
        print(f"  {app_id} {manifest['version']}")

    index = {"paging": {"page": 1, "count": 1, "maxPage": 1, "itemsTotal": len(packages)}, "packages": packages}
    (ROOT / "api").mkdir(exist_ok=True)
    (ROOT / "api" / "apps.json").write_text(json.dumps(index, indent=1, ensure_ascii=False))
    print(f"wrote api/apps.json ({len(packages)} packages) for {base}")


if __name__ == "__main__":
    main()
