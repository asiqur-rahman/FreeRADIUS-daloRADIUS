# FreeRADIUS configuration

This directory is mounted into the FreeRADIUS 3.2 container at
`/etc/raddb`. Only the files that diverge from the upstream stock
config are checked in here:

- `clients.conf` — bootstrap NAS clients (localhost + docker bridge).
  Production NAS entries live in the `nas` table, written by the
  platform UI and read by FreeRADIUS via the SQL module.
- `mods-available/sql` — PostgreSQL backend config, all secrets via env.
- `sites-available/default` — outer auth + accounting + post-auth.
- `sites-available/inner-tunnel` — PEAP inner method + MAC-binding
  policy from the architecture doc appendix.

On first run, the container generates dev certs under `certs/` (ignored
by git). For production, install a real EAP server certificate and add
it to the `EapCertificate` inventory table — the platform alerts on
expiry at 60/30/7 days.

## Activating sites/mods

The upstream entrypoint expects `sites-enabled/` and `mods-enabled/` to
contain symlinks into `sites-available/` and `mods-available/`. The
container creates the canonical symlinks (`default`, `inner-tunnel`,
`sql`, `eap`, etc.) on first boot. If you add a new site or mod,
create the symlink manually:

```bash
docker compose exec freeradius \
  ln -s ../sites-available/<name> /etc/raddb/sites-enabled/<name>
```
