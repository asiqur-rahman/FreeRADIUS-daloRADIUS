# ─────────────────────────────────────────────────────────────────────
#  FreeRADIUS image used by docker-compose. Overlays only the files
#  the platform owns; everything else (radiusd.conf, eap mod, mschap
#  mod, dh + bootstrap certs) stays at the upstream defaults.
#
#  Pinning to a specific patch tag is important — the platform's
#  policy snippets (inner-tunnel MAC binding) rely on the v3 unlang
#  syntax which is not guaranteed stable across major versions.
# ─────────────────────────────────────────────────────────────────────
FROM freeradius/freeradius-server:3.2.5

# Overlay the platform-owned config files. Order matters only if the
# upstream package re-creates a symlink: copy after, then re-link.
COPY raddb/clients.conf                          /etc/raddb/clients.conf
COPY raddb/mods-available/sql                    /etc/raddb/mods-available/sql
COPY raddb/mods-available/rest                   /etc/raddb/mods-available/rest
COPY raddb/sites-available/default               /etc/raddb/sites-available/default
COPY raddb/sites-available/check-eap-tls         /etc/raddb/sites-available/check-eap-tls
COPY raddb/sites-available/inner-tunnel          /etc/raddb/sites-available/inner-tunnel

# Enable modules and link sites. -f makes the RUN layer idempotent.
RUN awk ' \
BEGIN { in_tls = 0; inserted = 0 } \
/^[[:space:]]*tls[[:space:]]*{/ { in_tls = 1; inserted = 0 } \
in_tls && /^[[:space:]]*virtual_server[[:space:]]*=/ { inserted = 1 } \
in_tls && /^[[:space:]]*}/ { if (!inserted) print "\tvirtual_server = \"check-eap-tls\""; in_tls = 0 } \
{ print }' /etc/raddb/mods-available/eap > /tmp/eap \
 && mv /tmp/eap /etc/raddb/mods-available/eap \
 && chmod -R go-w /etc/raddb \
 && ln -sf /etc/raddb/mods-available/sql           /etc/raddb/mods-enabled/sql \
 && ln -sf /etc/raddb/mods-available/rest          /etc/raddb/mods-enabled/rest \
 && ln -sf /etc/raddb/sites-available/default      /etc/raddb/sites-enabled/default \
 && ln -sf /etc/raddb/sites-available/check-eap-tls /etc/raddb/sites-enabled/check-eap-tls \
 && ln -sf /etc/raddb/sites-available/inner-tunnel /etc/raddb/sites-enabled/inner-tunnel

EXPOSE 1812/udp 1813/udp 3799/udp

# Foreground + full debug — perfect for `docker compose logs`. Switch
# to `radiusd -f` (foreground, normal log level) for production.
CMD ["radiusd", "-X"]
