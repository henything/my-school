#!/usr/bin/env bash
set -Eeuo pipefail
SOURCE=/var/lib/azbuka-dvizheniya/fdoc-signed
TARGET=/var/backups/azbuka-dvizheniya
if [ ! -d "$SOURCE" ]; then exit 0; fi
install -d -m 0700 "$TARGET"
umask 077
BACKUP="$TARGET/fdoc-signed-$(date +%Y%m%d_%H%M%S).tar"
tar -C /var/lib/azbuka-dvizheniya -cf "$BACKUP" fdoc-signed
tar -tf "$BACKUP" >/dev/null
echo "[fdoc] PDF backup created and archive index verified."
