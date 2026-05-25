# Docker usage

## Compose files

| File | Use when |
|------|----------|
| `docker-compose.yml` | FreeRADIUS + daloRADIUS in Docker; **MariaDB runs outside** Compose |
| `docker-compose-db.yml` | Full local stack including a `radius-mysql` MariaDB container |

Use `Dockerfile-standalone` only when MariaDB and FreeRADIUS are already managed outside this repository.

## External database stack (`docker-compose.yml`)

Create an environment file from the template:

```bash
cp .env.example .env
```

Edit `.env` and replace every `CHANGE_ME_...` value:

```dotenv
MYSQL_HOST=your-mariadb-host.example.com
MYSQL_PORT=3306
MYSQL_DATABASE=radius
MYSQL_USER=radius
MYSQL_PASSWORD=CHANGE_ME_RADIUS_DB_PASSWORD
DEFAULT_CLIENT_SECRET=CHANGE_ME_RADIUS_SHARED_SECRET
```

If MariaDB runs on the same machine as Docker, use `MYSQL_HOST=host.docker.internal` (Linux: `extra_hosts` is already set in Compose).

Prepare the external database before first startup:

```sql
CREATE DATABASE radius CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'radius'@'%' IDENTIFIED BY 'your-strong-password';
GRANT ALL PRIVILEGES ON radius.* TO 'radius'@'%';
FLUSH PRIVILEGES;
```

Ensure the server accepts TCP connections from the Docker host (firewall, `bind-address`, user host grants). On first run with an empty database, the `radius` and `radius-web` containers import the daloRADIUS and FreeRADIUS schemas automatically.

Optional values:

```dotenv
TZ=Europe/Vienna
DALORADIUS_OPERATORS_BIND=127.0.0.1:8000
FREERADIUS_SQL_TLS=disabled
MAIL_SMTPADDR=127.0.0.1
MAIL_PORT=25
MAIL_FROM=root@daloradius.example.com
MAIL_AUTH=
```

Validate and start:

```bash
docker compose config --quiet
docker compose up -d --build
```

## Bundled MariaDB stack (`docker-compose-db.yml`)

```bash
cp .env.db.example .env
```

Edit `.env` (includes `MYSQL_ROOT_PASSWORD` for the MariaDB container):

```dotenv
MYSQL_PASSWORD=CHANGE_ME_RADIUS_DB_PASSWORD
MYSQL_ROOT_PASSWORD=CHANGE_ME_ROOT_DB_PASSWORD
DEFAULT_CLIENT_SECRET=CHANGE_ME_RADIUS_SHARED_SECRET
```

Start with the alternate compose file:

```bash
docker compose -f docker-compose-db.yml config --quiet
docker compose -f docker-compose-db.yml up -d --build
```

Services:

- `radius-mysql`: MariaDB database
- `radius`: FreeRADIUS
- `radius-web`: daloRADIUS users and operators web interfaces

### Import an existing database backup (bundled MariaDB only)

Copy one or more `.sql` or `.sql.gz` files into `./var/backup` before the first startup:

```bash
mkdir -p var/backup
cp /path/to/backup.sql.gz var/backup/
docker compose -f docker-compose-db.yml up -d --build
```

The `radius-mysql` container mounts `./var/backup` as `/docker-entrypoint-initdb.d`, so MariaDB imports those files when `./data/mysql` is empty.

`MYSQL_HEALTH_START_PERIOD` in `.env` controls how long Docker ignores failing MariaDB healthchecks during first startup; increase it for large dumps.

To replace an already initialized Docker database:

```bash
docker compose -f docker-compose-db.yml down
rm -rf ./data/mysql
mkdir -p var/backup
cp /path/to/backup.sql.gz var/backup/
docker compose -f docker-compose-db.yml up -d --build
```

## Common operations

Check service state:

```bash
docker compose ps
```

Access the web interfaces:

- users UI: `http://localhost/`
- operators UI: `http://127.0.0.1:8000/`, unless `DALORADIUS_OPERATORS_BIND` is changed

The initial operator account seeded by the default schema is:

```text
username: administrator
password: radius
```

Use this account only for the first login, then change the operator password from the operators UI.

RADIUS authentication and accounting listen on host UDP ports `1812` and `1813`.

With the external-database compose file, init state remains in `./data/freeradius` and `./data/daloradius`. With the bundled-database compose file, MariaDB data also remains in `./data/mysql`.

## Logs

```bash
docker compose logs -f radius-web radius
```

For the bundled stack:

```bash
docker compose -f docker-compose-db.yml logs -f radius-web radius radius-mysql
```

The FreeRADIUS log is shared with the web container through the `radius_logs` volume so the daloRADIUS operators UI can read `/var/log/freeradius/radius.log`.

## Stop and reset

Stop containers without deleting data:

```bash
docker compose down
```

Remove containers and local application state (add `./data/mysql` if you used the bundled database compose file):

```bash
docker compose down
rm -rf ./data
```

## Standalone web image

Build the standalone web image:

```bash
docker build -t daloradius-standalone -f Dockerfile-standalone .
```

Create a `daloradius.conf.php` for your external database and RADIUS settings, then mount it into the container:

```bash
docker run --name daloradius-standalone \
  -v /path/to/daloradius.conf.php:/var/www/html/daloradius/common/includes/daloradius.conf.php:ro \
  -p 80:80 \
  -p 127.0.0.1:8000:8000 \
  -d daloradius-standalone
```
