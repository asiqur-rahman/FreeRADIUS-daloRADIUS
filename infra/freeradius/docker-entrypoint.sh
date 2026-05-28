#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
#  FreeRADIUS container entrypoint.
#
#  Why this exists:
#    On Windows/WSL, Docker bind-mounted files always appear as 777
#    (world-writable) because NTFS has no Unix permission bits.
#    FreeRADIUS refuses to start when the private key is globally writable.
#
#  Fix:
#    Certs are mounted at /etc/raddb/certs-src (read-only staging area).
#    This script copies them into /etc/raddb/certs (container overlay fs),
#    sets ownership to freerad:freerad, and sets safe permissions before
#    the base-image entrypoint hands off to radiusd/freeradius.
#
#    On Linux VPS hosts this copy still runs; chmod/chown on ext4 work fine
#    and the result is the same.
# ─────────────────────────────────────────────────────────────────────────────
set -e

SRC_DIR=/etc/raddb/certs-src
DEST_DIR=/etc/raddb/certs

if [ -d "$SRC_DIR" ]; then
    mkdir -p "$DEST_DIR"
    # Copy all cert/key files (skip directories and .gitkeep)
    find "$SRC_DIR" -maxdepth 1 -type f ! -name '.gitkeep' -exec cp {} "$DEST_DIR/" \;
    # Give ownership to freerad so FreeRADIUS (running as freerad) can read them
    chown -R freerad:freerad "$DEST_DIR"
    # Private keys: owner-only read — FreeRADIUS checks for world-readable keys
    find "$DEST_DIR" -name "*.key" -exec chmod 600 {} \;
    # Certificates / CA: owner + group read
    find "$DEST_DIR" -name "*.pem" -exec chmod 640 {} \;
fi

# Hand off to the upstream base-image entrypoint which maps
# "radiusd" → "freeradius" and handles the -f / -X flags.
exec /docker-entrypoint.sh "$@"
