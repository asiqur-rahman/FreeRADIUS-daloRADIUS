#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
#  FreeRADIUS container entrypoint.
#
#  Cert handling (runs every startup):
#
#  1. SOURCE certs from /etc/raddb/certs-src (bind-mounted from the host).
#     If the source directory is empty, missing, or the private key is
#     passphrase-encrypted, certs are AUTO-GENERATED instead — so
#     `docker compose up` works on a fresh Linux VPS with zero manual steps.
#
#  2. DEST certs land in /etc/raddb/certs (container overlay fs).
#     Ownership + permissions are fixed here because:
#       • Windows/WSL NTFS bind-mounts ignore chmod (always 777).
#       • FreeRADIUS refuses to start when private keys are world-readable.
#
#  CN for auto-generated certs: $RADIUS_CERT_CN (default: radius.local)
#  Override in .env or docker-compose environment to match your domain.
# ─────────────────────────────────────────────────────────────────────────────
set -e

SRC_DIR=/etc/raddb/certs-src
DEST_DIR=/etc/raddb/certs
CN="${RADIUS_CERT_CN:-radius.local}"

mkdir -p "$DEST_DIR"

# ── Helper: check whether a private key file is passphrase-encrypted ─────────
key_is_encrypted() {
    grep -q 'ENCRYPTED' "$1" 2>/dev/null
}

# ── Helper: check if all required cert files are present and usable ───────────
certs_ready() {
    [ -f "$SRC_DIR/ca.pem" ] &&
    [ -f "$SRC_DIR/server.pem" ] &&
    [ -f "$SRC_DIR/server.key" ] &&
    ! key_is_encrypted "$SRC_DIR/server.key" &&
    ! key_is_encrypted "$SRC_DIR/ca.key" 2>/dev/null
}

# ── 1. Decide: copy from source or auto-generate ─────────────────────────────
if [ -d "$SRC_DIR" ] && certs_ready; then
    echo "[entrypoint] Using certs from $SRC_DIR"
    find "$SRC_DIR" -maxdepth 1 -type f ! -name '.gitkeep' -exec cp {} "$DEST_DIR/" \;
else
    if [ -d "$SRC_DIR" ] && [ -f "$SRC_DIR/server.key" ] && key_is_encrypted "$SRC_DIR/server.key"; then
        echo "[entrypoint] WARNING: server.key is passphrase-encrypted — auto-generating unencrypted certs instead."
    else
        echo "[entrypoint] No certs found in $SRC_DIR — auto-generating self-signed certs."
    fi
    echo "[entrypoint] CN = $CN  (set RADIUS_CERT_CN env var to override)"

    # CA
    openssl genrsa -out "$DEST_DIR/ca.key" 4096 2>/dev/null
    openssl req -new -x509 -days 3650 \
        -key "$DEST_DIR/ca.key" \
        -out "$DEST_DIR/ca.pem" \
        -subj "/CN=RadiusOps CA/O=RadiusOps/OU=WiFi Auth" \
        2>/dev/null

    # Server key + CSR
    openssl genrsa -out "$DEST_DIR/server.key" 2048 2>/dev/null
    openssl req -new \
        -key "$DEST_DIR/server.key" \
        -out "$DEST_DIR/server.csr" \
        -subj "/CN=$CN/O=RadiusOps/OU=WiFi Auth" \
        2>/dev/null

    # Server cert (SAN required by modern supplicants)
    cat > "$DEST_DIR/server-ext.cnf" << EOF
[ext]
subjectAltName          = DNS:$CN
keyUsage                = critical,digitalSignature,keyEncipherment
extendedKeyUsage        = serverAuth
EOF
    openssl x509 -req -days 730 \
        -in      "$DEST_DIR/server.csr" \
        -CA      "$DEST_DIR/ca.pem" \
        -CAkey   "$DEST_DIR/ca.key" \
        -CAcreateserial \
        -extfile "$DEST_DIR/server-ext.cnf" \
        -extensions ext \
        -out     "$DEST_DIR/server.pem" \
        2>/dev/null

    rm -f "$DEST_DIR/server.csr" "$DEST_DIR/server-ext.cnf" "$DEST_DIR/ca.srl"
    echo "[entrypoint] Certs generated: $DEST_DIR"

    # Copy generated certs back to source dir so the host can retrieve them
    # (e.g. to distribute ca.pem to WiFi clients). Only if src is writable.
    if [ -d "$SRC_DIR" ] && [ -w "$SRC_DIR" ]; then
        cp "$DEST_DIR/ca.pem"     "$SRC_DIR/ca.pem"
        cp "$DEST_DIR/ca.key"     "$SRC_DIR/ca.key"
        cp "$DEST_DIR/server.pem" "$SRC_DIR/server.pem"
        cp "$DEST_DIR/server.key" "$SRC_DIR/server.key"
        echo "[entrypoint] Certs written back to $SRC_DIR for host access."
    fi
fi

# ── 2. Fix ownership + permissions ───────────────────────────────────────────
chown -R freerad:freerad "$DEST_DIR"
find "$DEST_DIR" -name "*.key" -exec chmod 600 {} \;
find "$DEST_DIR" -name "*.pem" -exec chmod 640 {} \;

# ── 3. Hand off to the upstream FreeRADIUS entrypoint ────────────────────────
exec /docker-entrypoint.sh "$@"
