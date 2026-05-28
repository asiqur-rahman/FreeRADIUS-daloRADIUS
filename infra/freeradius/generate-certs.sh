#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  Generate a self-signed CA + EAP server certificate for development.
#
#  Usage:
#    bash infra/freeradius/generate-certs.sh
#    # or via pnpm:
#    pnpm certs:generate
#
#  Output: infra/freeradius/raddb/certs/
#    ca.key      CA private key      (keep secret, never commit)
#    ca.pem      CA certificate      (distribute to test devices)
#    server.key  Server private key  (keep secret, never commit)
#    server.pem  Server certificate  (loaded by FreeRADIUS EAP)
#
#  Production: replace these files with your Let's Encrypt or
#  commercial cert, then restart: docker compose restart freeradius
#    ca.pem     → chain.pem / Let's Encrypt R3 chain
#    server.pem → fullchain.pem
#    server.key → privkey.pem
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/raddb/certs"
mkdir -p "$CERT_DIR"

# Allow overriding the CN via env for CI / production scripting.
SERVER_CN="${RADIUS_CERT_CN:-radius.local}"

echo ""
echo "════════════════════════════════════════════════"
echo "  RadiusNexus — EAP Certificate Generator"
echo "  Server CN: $SERVER_CN"
echo "  Output:    $CERT_DIR"
echo "════════════════════════════════════════════════"
echo ""

# ── 1. CA ─────────────────────────────────────────────────────────────
echo "[1/3] Generating CA key + self-signed certificate (10 years)..."
openssl genrsa -out "$CERT_DIR/ca.key" 4096 2>/dev/null
openssl req -new -x509 -days 3650 \
  -key "$CERT_DIR/ca.key" \
  -out "$CERT_DIR/ca.pem" \
  -subj "/CN=RadiusNexus CA/O=RadiusNexus/OU=WiFi Auth" \
  2>/dev/null
echo "    CA: $CERT_DIR/ca.pem"

# ── 2. Server cert ────────────────────────────────────────────────────
echo "[2/3] Generating server key + certificate (2 years, signed by CA)..."
openssl genrsa -out "$CERT_DIR/server.key" 2048 2>/dev/null

openssl req -new \
  -key "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.csr" \
  -subj "/CN=$SERVER_CN/O=RadiusNexus/OU=WiFi Auth" \
  2>/dev/null

# SAN extension — required by modern clients
cat > "$CERT_DIR/server-ext.cnf" << EOF
[ext]
subjectAltName          = DNS:$SERVER_CN
keyUsage                = critical,digitalSignature,keyEncipherment
extendedKeyUsage        = serverAuth
EOF

openssl x509 -req -days 730 \
  -in      "$CERT_DIR/server.csr" \
  -CA      "$CERT_DIR/ca.pem" \
  -CAkey   "$CERT_DIR/ca.key" \
  -CAcreateserial \
  -extfile "$CERT_DIR/server-ext.cnf" \
  -extensions ext \
  -out     "$CERT_DIR/server.pem" \
  2>/dev/null

# Clean up temp files
rm -f "$CERT_DIR/server.csr" "$CERT_DIR/server-ext.cnf" "$CERT_DIR/ca.srl"
echo "    Server cert: $CERT_DIR/server.pem"

# ── 3. Summary ────────────────────────────────────────────────────────
echo "[3/3] Done."
echo ""
echo "CA fingerprint (SHA-256):"
openssl x509 -in "$CERT_DIR/ca.pem" -fingerprint -sha256 -noout | sed 's/^/    /'
echo ""
echo "Server CN:"
openssl x509 -in "$CERT_DIR/server.pem" -noout -subject | sed 's/^/    /'
echo ""
echo "Next steps:"
echo "  1. Rebuild + restart FreeRADIUS:"
echo "       docker compose build freeradius && docker compose up -d freeradius"
echo ""
echo "  For devices that need the CA (self-signed setup):"
echo "       cat $CERT_DIR/ca.pem"
echo "  Install it on the device, then set Domain = $SERVER_CN in WiFi settings."
echo ""
echo "  For production — replace files with Let's Encrypt certs:"
echo "       RADIUS_CERT_CN=radius.yourdomain.com bash infra/freeradius/generate-certs.sh"
echo "  (then swap with certbot certs once DNS is pointing at the server)"
