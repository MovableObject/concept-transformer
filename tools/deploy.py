"""Upload the built React page (version 3) to concepttransformer.site over Hostinger's TUS file API.

Single files only, never a full archive deploy (an archive can wipe ct_private/config.php, which holds the keys).

    1. npm --prefix web run build            (writes web/dist)
    2. python tools/export_moves.py          (writes moves.json and ct_private/prompts.json)
    3. get an upload address from the Hostinger API operation hosting_files_generate-upload-url, then
       set UP_URL, UP_AUTH and UP_REST in the environment
    4. python tools/deploy.py --to v3 --dry-run     look at the list first
       python tools/deploy.py --to v3               a test copy in public_html/v3, served only on the preview address
       python tools/deploy.py --to root             the real page, replacing version 2 at the site root
    5. clear the cache: Hostinger API operation hosting_cache_clear-website

What goes up:
  - the built page (web/dist: index.html and assets/*), relay.php and moves.json, into the target folder
  - ct_private/prompts.json, always into public_html/ct_private (the relay looks for it beside the keys); the
    private prompts file stays compatible with the version 2 page, so this never breaks the live page
  - for root only: .htaccess and fonts/*
  - for v3 only: a small .htaccess that hides the folder on the real domain (404 unless the host is the preview)
Old version 2 files (app.js, mindmap.js, styles.css) are left on the server; they are no longer referenced.
"""
import argparse
import os
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "web", "dist")

V3_HTACCESS = """# Test copy of version 3: only the Hostinger preview address may open it.
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTP_HOST} !hostingersite\\.com$ [NC]
  RewriteRule ^ - [R=404,L]
</IfModule>
<IfModule mod_headers.c>
  <FilesMatch "\\.(html|js|css|json)$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  Header set X-Robots-Tag "noindex, nofollow"
  {CSP}
</IfModule>
"""


def plan(target: str) -> list[tuple[str, str]]:
    """(local path, remote path under public_html) for every file to upload."""
    prefix = "" if target == "root" else target.strip("/") + "/"
    files = [(os.path.join(DIST, "index.html"), prefix + "index.html")]
    for name in sorted(os.listdir(os.path.join(DIST, "assets"))):
        files.append((os.path.join(DIST, "assets", name), f"{prefix}assets/{name}"))
    files += [(os.path.join(ROOT, "relay.php"), prefix + "relay.php"),
              (os.path.join(ROOT, "moves.json"), prefix + "moves.json"),
              (os.path.join(ROOT, "ct_private", "prompts.json"), "ct_private/prompts.json")]
    if target == "root":
        files.append((os.path.join(ROOT, ".htaccess"), ".htaccess"))
        for name in sorted(os.listdir(os.path.join(ROOT, "fonts"))):
            files.append((os.path.join(ROOT, "fonts", name), f"fonts/{name}"))
    else:
        # the test copy gets the same security policy the root .htaccess will give the real page
        csp = [ln.strip() for ln in open(os.path.join(ROOT, ".htaccess"), encoding="utf-8") if "Content-Security-Policy" in ln]
        tmp = os.path.join(tempfile.gettempdir(), "ct_v3_htaccess")
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            f.write(V3_HTACCESS.replace("{CSP}", csp[0] if csp else ""))
        files.append((tmp, prefix + ".htaccess"))
    return files


def tus_upload(local: str, remote: str, url: str, auth: str, rest: str) -> str:
    """One file: a TUS create, then the whole body in one PATCH. Returns the two status codes."""
    data = open(local, "rb").read()
    target = f"{url.rstrip('/')}/{remote}?override=true"
    common = {"X-Auth": auth, "X-Auth-Rest": rest, "Tus-Resumable": "1.0.0"}
    codes = []
    for method, extra, body in (("POST", {"Upload-Length": str(len(data)), "Upload-Offset": "0"}, None),
                                ("PATCH", {"Content-Type": "application/offset+octet-stream", "Upload-Offset": "0"}, data)):
        req = urllib.request.Request(target, data=body, method=method, headers={**common, **extra})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                codes.append(str(r.status))
        except urllib.error.HTTPError as e:
            codes.append(str(e.code))
        except urllib.error.URLError as e:
            codes.append(f"error {e.reason}")
    return f"create {codes[0]}, upload {codes[1]}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--to", required=True, help="'v3' (or another folder name) for a test copy, 'root' for the real page")
    ap.add_argument("--dry-run", action="store_true", help="list the files and stop")
    a = ap.parse_args()

    if not os.path.isfile(os.path.join(DIST, "index.html")):
        sys.exit("web/dist is missing: run  npm --prefix web run build  first")
    files = plan(a.to)
    missing = [l for l, _ in files if not os.path.isfile(l)]
    if missing:
        sys.exit("missing: " + ", ".join(missing))
    for local, remote in files:
        print(f"  {remote:<40} {os.path.getsize(local):>9} bytes")
    if a.dry_run:
        print(f"dry run: {len(files)} files, nothing uploaded")
        return
    url, auth, rest = (os.environ.get(k, "") for k in ("UP_URL", "UP_AUTH", "UP_REST"))
    if not (url and auth and rest):
        sys.exit("set UP_URL, UP_AUTH and UP_REST from hosting_files_generate-upload-url first")
    bad = 0
    for local, remote in files:
        result = tus_upload(local, remote, url, auth, rest)
        ok = result.endswith("upload 204") or result.endswith("upload 200")
        bad += not ok
        print(f"{remote}: {result}{'' if ok else '  <-- FAILED'}")
    print("done" if not bad else f"{bad} file(s) failed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
