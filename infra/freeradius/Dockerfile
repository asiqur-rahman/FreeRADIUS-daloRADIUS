# ─────────────────────────────────────────────────────────────────────
#  FreeRADIUS image used by docker-compose.
#
#  Overlays platform-owned config files onto the upstream image.
#  Certificates are NOT baked in — they are volume-mounted at runtime
#  from infra/freeradius/raddb/certs/ (see docker-compose.radius.yml).
#  Generate dev certs first:  pnpm certs:generate
# ─────────────────────────────────────────────────────────────────────
FROM freeradius/freeradius-server:3.2.5

# Platform-owned config overlays
COPY raddb/clients.conf                          /etc/raddb/clients.conf
COPY raddb/mods-available/sql                    /etc/raddb/mods-available/sql
COPY raddb/mods-available/rest                   /etc/raddb/mods-available/rest
COPY raddb/mods-available/eap                    /etc/raddb/mods-available/eap
COPY raddb/sites-available/default               /etc/raddb/sites-available/default
COPY raddb/sites-available/check-eap-tls         /etc/raddb/sites-available/check-eap-tls
COPY raddb/sites-available/inner-tunnel          /etc/raddb/sites-available/inner-tunnel

# Entrypoint — fixes cert permissions before radiusd starts.
# Needed on Windows/WSL where bind-mounted files appear as 777.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Fix permissions and enable modules + sites.
RUN chmod -R go-w /etc/raddb \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && ln -sf /etc/raddb/mods-available/sql            /etc/raddb/mods-enabled/sql \
 && ln -sf /etc/raddb/mods-available/rest           /etc/raddb/mods-enabled/rest \
 && ln -sf /etc/raddb/sites-available/default       /etc/raddb/sites-enabled/default \
 && ln -sf /etc/raddb/sites-available/check-eap-tls /etc/raddb/sites-enabled/check-eap-tls \
 && ln -sf /etc/raddb/sites-available/inner-tunnel  /etc/raddb/sites-enabled/inner-tunnel

EXPOSE 1812/udp 1813/udp 3799/udp

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
# docker-compose overrides CMD to "radiusd -f" for production.
# Change to ["radiusd", "-X"] temporarily for full debug output.
CMD ["radiusd", "-f"]
