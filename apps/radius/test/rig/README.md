# Stage 1 verification — running the test

Two paths to verify PEAP works. **Start with Path A** (Node-based, no
external installs). Only fall back to Path B (`eapol_test`) if you need
a reference-implementation second opinion.

---

## Path A — Node-based PEAP test client (recommended)

This uses our own protocol code as a UDP supplicant. No `eapol_test`,
no WSL, nothing to install. Works on Windows, macOS, Linux.

### 1. Bring up Postgres + Redis

```powershell
pnpm docker:up
```

FreeRADIUS stays off (it's behind the `freeradius` compose profile now).
Only Postgres + Redis should be in the `docker ps` output.

### 2. Run migrations

```powershell
pnpm db:migrate
# When asked for a migration name, type: stage1_baseline
```

### 3. Seed the test rig data

```powershell
pnpm --filter @app/radius run rig:seed
```

This creates:
- User `wifitester` with password `TestPassw0rd!`
- NAS at `127.0.0.1` with shared secret `testing-secret-32chars-loremipsum`
- Mirrored row in the FreeRADIUS-compatible `nas` table

Re-running is safe (idempotent).

### 4. Start the radius server with PEAP enabled

In a dedicated shell:

```powershell
cd apps/radius
$env:PEAP_ENABLED='true'
pnpm dev
```

You should see lines like:

```
INFO: radius.boot
  env: development
  methods: ["PEAP-MSCHAPv2","PAP","MSCHAPv2 (direct)"]
  authPort: 1812
  acctPort: 1813
  coaPort: 3799
INFO: tls.dev_self_signed_fallback
INFO: radius.listening  { port: 1812, role: 'auth' }
INFO: radius.listening  { port: 1813, role: 'acct' }
INFO: radius.listening  { port: 3799, role: 'coa' }
```

### 5. In a second shell, run the test client

```powershell
pnpm --filter @app/radius run rig:test-peap
```

**Expected output (the happy path):**

```
═══ PEAP-MSCHAPv2 test supplicant ══════════════════════
[config      ] server=127.0.0.1:1812
[config      ] user=wifitester
[config      ] secret=test…psum (33 chars)

[round 1     ] sending EAP-Response/Identity
[round 1     ] received code=11 (Access-Challenge)
✓ server offered PEAP Start
[inner       ] tunnel established → sending inner Identity
[inner       ] received MSCHAPv2 Challenge → computing NT-Response
[inner       ] MSCHAPv2 Success received → acking
✓ PEAP conversation completed in N rounds
✓ Access-Accept received
✓ 2 Vendor-Specific attribute(s) present (MS-MPPE keys expected)
✓ outer EAP-Success enclosed

═══ SUCCESS ═══════════════════════════════════════════
```

**If you see `SUCCESS`, Stage 1 passes.** Move to Path C below to test
through your real router.

### 6. Verify the radpostauth row

```powershell
docker exec -it radius-postgres psql -U radius -d radius -c "SELECT username, reply, class, authdate FROM radpostauth ORDER BY authdate DESC LIMIT 1;"
```

Expected: `wifitester | Access-Accept | peap | <now>`

---

## Path B — `eapol_test` (reference implementation)

Optional. Only run this if Path A succeeds and you want a second
opinion from the upstream supplicant code.

Install `eapol_test`:

| Platform | Install |
|---|---|
| Ubuntu/Debian | `sudo apt install wpasupplicant` |
| macOS (Homebrew) | `brew install wpa_supplicant` |
| Windows | Use WSL2 + `apt install wpasupplicant`, or build from `hostap.git` |

Then run:

```bash
eapol_test \
  -c apps/radius/test/rig/peap-mschapv2.conf \
  -a 127.0.0.1 -p 1812 \
  -s testing-secret-32chars-loremipsum \
  -r 1
```

Expected: `SUCCESS` at the end, with a `MASTER_SESSION_KEY=…` line.

---

## Path C — real router + laptop (Stage 3 starts here)

Once Path A succeeds:

### 7. Update the NAS row to your router's LAN IP

The seed pinned the NAS at `127.0.0.1`. Real routers send RADIUS from
their own LAN IP. Update via the admin UI (`pnpm dev`, then
http://localhost:5173) or:

```sql
UPDATE nas_clients SET nasname = '192.168.1.1' WHERE shortname = 'test-rig';
```

(Substitute your router's actual IP.) The RadiusPolicyService will
keep the `nas` table mirror in sync.

### 8. Configure the router

Universal fields, however your brand presents them:

| Field | Value |
|---|---|
| Security mode | WPA2-Enterprise |
| EAP method | PEAP / MSCHAPv2 |
| RADIUS server | `<IP of the machine running apps/radius>` |
| Port | `1812` |
| Shared secret | `testing-secret-32chars-loremipsum` |
| Accounting server | same IP, port `1813` (optional) |

### 9. Connect from your laptop

Pick the SSID from your laptop's WiFi list. When prompted:
- **Username**: `wifitester`
- **Password**: `TestPassw0rd!`
- **Method**: PEAP (auto-detected on Windows/macOS)
- **Server cert**: "trust this connection" / "don't validate" (we're
  using the dev self-signed cert)

Expected: laptop joins, gets a DHCP lease. A row appears in `radacct`:

```sql
SELECT username, nasipaddress, acctstarttime, callingstationid
FROM radacct
ORDER BY acctstarttime DESC LIMIT 1;
```

---

## Common failure modes + what to send me

If anything fails, copy these into a reply:

1. **The last ~30 lines of the radius server's log output** (from the
   shell where you ran `pnpm dev`)
2. **The full output of `pnpm --filter @app/radius run rig:test-peap`**
3. **`SELECT * FROM radpostauth ORDER BY authdate DESC LIMIT 3;`**

That's enough to diagnose 90% of bugs without further back-and-forth.

### Quick lookup table

| Symptom | Most likely cause |
|---|---|
| `no reply from 127.0.0.1:1812 within 2000ms` | radius server not running, or PEAP_ENABLED not set |
| `server didn't offer PEAP; got EAP type=26` | PEAP_ENABLED not set when server started |
| `Access-Reject ... bad_password` | Seed script wasn't run, or password mismatch |
| `Access-Reject ... unknown_user` | Seed script wasn't run |
| `Access-Reject ... tls_error` | TLS handshake failed — paste the server log |
| `exhausted 40 rounds without Access-Accept` | TLS bridge stalled — paste the server log |
| `MD4 not available` at server startup | `--openssl-legacy-provider` flag missing |

---

## What "passed Stage 1" means

Three green checkmarks:

- [ ] `pnpm --filter @app/radius run rig:test-peap` → `SUCCESS`
- [ ] `radpostauth` has the corresponding Access-Accept row
- [ ] Laptop connects to the real router's WPA2-Enterprise SSID and
      browses the internet for ≥30 seconds

When you hit all three, Stage 1 is done and Stage 2 (EAP-TLS) starts.
