#!/usr/bin/env bash
# Upload single files to concepttransformer.site's public_html over Hostinger's TUS file API.
# Safer than a full archive deploy, which can wipe ct_private/config.php (the keys).
# Get UP_URL, UP_AUTH, UP_REST from the Hostinger API operation hosting_files_generate-upload-url.
#   UP_URL=... UP_AUTH=... UP_REST=... bash tools/upload_files.sh index.html app.js styles.css moves.json relay.php
set -u
cd "$(dirname "$0")/.."
for f in "$@"; do
  size=$(wc -c < "$f" | tr -d ' ')
  u="$UP_URL/$f?override=true"
  c=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$u" -H "X-Auth: $UP_AUTH" -H "X-Auth-Rest: $UP_REST" \
      -H "Tus-Resumable: 1.0.0" -H "Upload-Length: $size" -H "Upload-Offset: 0")
  p=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$u" -H "X-Auth: $UP_AUTH" -H "X-Auth-Rest: $UP_REST" \
      -H "Tus-Resumable: 1.0.0" -H "Content-Type: application/offset+octet-stream" -H "Upload-Offset: 0" --data-binary "@$f")
  echo "$f: create $c, upload $p"
done
