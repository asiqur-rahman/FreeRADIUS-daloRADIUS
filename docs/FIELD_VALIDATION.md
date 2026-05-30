# Field Validation Guide

This guide is the fastest path from "the repo builds" to "the router and laptop prove the workflow."

## Lab Topology

Use this layout for the first real test:

```text
Server machine
  - Runs Docker, Postgres, FreeRADIUS, and the API
  - Connected to the router by Ethernet if possible

Router / AP
  - Configured for WPA2-Enterprise or WPA3-Enterprise
  - Points at the server machine as its RADIUS server

Supplicant
  - Phone, laptop, or test client joining the Wi-Fi
  - For EAP-TLS, install the client cert and trust the client CA as needed
```

Avoid hosting the RADIUS server on the same Wi-Fi link that is being authenticated. If the server laptop uses the same SSID it is trying to validate, you can lock yourself out mid-test.

## Before Touching the AP

1. Start infrastructure:

```powershell
pnpm docker:prod:up
```

2. Apply and verify schema:

```powershell
pnpm db:migrate
pnpm db:generate
pnpm db:status
```

3. Seed a bootstrap admin and test user:

```powershell
pnpm db:seed
```

By default, seed now creates:

- admin user: `admin` / `admin1234!`
- PEAP lab user: `wifi-test` / `wifi12345!`

You can override those with `SEED_ADMIN_PASSWORD`, `SEED_TEST_USERNAME`, and `SEED_TEST_USER_PASSWORD`.

If you already know your AP IP and shared secret, you can also seed the NAS row in the same step:

```powershell
$env:SEED_LAB_NAS_IP="192.168.1.2"
$env:SEED_LAB_NAS_SECRET="replace-with-your-radius-secret"
pnpm db:seed
```

4. Run the readiness check:

```powershell
pnpm lab:check
```

The script checks:

- root `.env` and `apps/api/.env`
- required secrets and VLAN IDs
- Docker services, including stacks started from WSL Docker
- API and web health endpoints
- Prisma migration status, with a container fallback when host Prisma cannot talk to Docker Desktop directly
- presence of `device_approvals` and `user_devices.status`
- at least one NAS row and one user with an `ntHash`

5. Print the lab values you will copy into the AP:

```powershell
pnpm lab:config
```

If your server has multiple NICs, pass the reachable LAN IP explicitly:

```powershell
pnpm lab:config -- -ServerIp 192.168.1.50 -NasIp 192.168.1.2 -NasSecret replace-with-your-radius-secret
```

## Local EAP-TLS Lab Assets

If you do not already have a client-certificate authority for lab work, generate one locally:

```powershell
pnpm lab:device-ca
```

That command creates a local CA under `ops/dev-ca/` and prints the `apps/api/.env` lines needed for local dashboard-issued client certs.

To generate a client certificate for the current import-based EAP-TLS workflow:

```powershell
pnpm lab:client-cert -- -CommonName wifi-test-laptop -Email wifi-test@example.local
```

The script writes:

- a PEM certificate you can import into the device approval workspace
- a `.pfx` bundle you can install on the supplicant
- the CA certificate you may need to trust on the supplicant or controller

## AP Configuration

Use your server machine's reachable LAN IP.

```text
RADIUS authentication server: <server-ip>
Authentication port:          1812
RADIUS accounting server:     <server-ip>
Accounting port:              1813
Shared secret:                <same value stored in nas_clients>
CoA / Disconnect port:        3799
```

`pnpm lab:config` prints the server IP, NAS settings, and bootstrap credentials.

For the first pass, use one SSID and one test user. VLAN assignment is done through group reply attributes — add `Tunnel-Type`, `Tunnel-Medium-Type`, and `Tunnel-Private-Group-ID` reply attributes to a group in Admin → Groups to steer members onto a specific VLAN.

## PEAP Acceptance Flow

Use a normal username/password client first because it proves the full onboarding workflow.

### Expected setup

- AP supports WPA2-Enterprise or WPA3-Enterprise with PEAP-MSCHAPv2
- test user exists and has a valid `user_secrets.ntHash`
- AP IP exists in `nas_clients`

### Test

1. Join the SSID with the test user and password.
2. Confirm the device appears in the admin dashboard as `pending`.
3. Confirm the client lands on the quarantine VLAN.
4. Approve the device from Telegram or the dashboard.
5. Confirm the session is disconnected or forced to reauthenticate.
6. Reconnect the device.
7. Confirm the client now lands on the normal VLAN from group policy.

### Evidence to check

- `apps/web` device approvals view shows a new pending device
- `radacct` receives a session row
- the live sessions page shows the client
- audit history records the approval
- the second auth lands on the non-quarantine VLAN

## EAP-TLS Acceptance Flow

After PEAP works, validate managed devices with client certificates.

### Option A: bind an existing client certificate

1. Open the device in the admin approvals workspace.
2. Import the client cert PEM.
3. If needed, generate one first with `pnpm lab:client-cert`.
4. Optionally approve the device in the same step.
5. Configure the supplicant to use that certificate for the enterprise SSID.

### Option B: issue a managed certificate from the dashboard

This path requires:

- device CA paths configured in `apps/api/.env`
- the `openssl` CLI available on the API host

1. Open the device in the admin approvals workspace.
2. Choose `Issue cert`.
3. Save the returned PEM or PKCS#12 bundle.
4. Install the bundle on the supplicant.
5. Configure the supplicant for `EAP-TLS`.

### Expected result

- FreeRADIUS calls `check-eap-tls`
- `/api/v1/radius/authorize` matches the certificate digest in `UserDevice.certFingerprint`
- approved devices get group VLAN policy
- pending devices still quarantine
- rejected devices fail authentication

## Useful Checks During Testing

Tail the stack logs:

```powershell
pnpm docker:logs
```

Watch API readiness from inside the API container:

```powershell
wsl.exe bash -lc "docker exec freeradius-api-1 wget -q -O - http://127.0.0.1:4000/health/ready"
```

Check web proxy health:

```powershell
Invoke-WebRequest http://localhost:8123/web-health
```

## TP-Link-Specific Things To Confirm

- The AP sends accounting to UDP `1813`
- Disconnect-Request on UDP `3799` is enabled and acknowledged
- PEAP-MSCHAPv2 is explicitly enabled for the SSID
- If testing `EAP-TLS`, the AP or controller trusts the relevant CA chain

## Pass Criteria

You can call the workflow proven in the field when all of these are true:

- PEAP onboarding creates a pending approval request
- approval moves the device from quarantine policy to normal policy
- live sessions and accounting reflect the user
- Disconnect-Request completes within your operational target
- EAP-TLS succeeds with a bound or issued cert
- EAP-TLS rejects an unknown or mismatched cert
