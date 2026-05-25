-- ─────────────────────────────────────────────────────────────────────
--  FreeRADIUS 3.x PostgreSQL schema (canonical).
--
--  Sourced from the upstream rlm_sql/postgresql schema.sql shipped with
--  FreeRADIUS server. The platform writes radcheck/radreply/radgroup*/
--  radusergroup/nas exclusively through RadiusPolicyService; FreeRADIUS
--  writes radacct + radpostauth on its own.
--
--  Indexes mirror upstream defaults. Do not edit without a migration.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radcheck (
  id        BIGSERIAL PRIMARY KEY,
  username  VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op        CHAR(2)     NOT NULL DEFAULT '==',
  value     VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radcheck_username_idx ON radcheck (username, attribute);

CREATE TABLE IF NOT EXISTS radreply (
  id        BIGSERIAL PRIMARY KEY,
  username  VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op        CHAR(2)     NOT NULL DEFAULT '=',
  value     VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radreply_username_idx ON radreply (username, attribute);

CREATE TABLE IF NOT EXISTS radgroupcheck (
  id        BIGSERIAL PRIMARY KEY,
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op        CHAR(2)     NOT NULL DEFAULT '==',
  value     VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radgroupcheck_groupname_idx ON radgroupcheck (groupname, attribute);

CREATE TABLE IF NOT EXISTS radgroupreply (
  id        BIGSERIAL PRIMARY KEY,
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  attribute VARCHAR(64) NOT NULL DEFAULT '',
  op        CHAR(2)     NOT NULL DEFAULT '=',
  value     VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radgroupreply_groupname_idx ON radgroupreply (groupname, attribute);

CREATE TABLE IF NOT EXISTS radusergroup (
  id        BIGSERIAL PRIMARY KEY,
  username  VARCHAR(64) NOT NULL DEFAULT '',
  groupname VARCHAR(64) NOT NULL DEFAULT '',
  priority  INTEGER     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS radusergroup_username_idx ON radusergroup (username);

CREATE TABLE IF NOT EXISTS radacct (
  radacctid          BIGSERIAL PRIMARY KEY,
  acctsessionid      VARCHAR(64)   NOT NULL DEFAULT '',
  acctuniqueid       VARCHAR(32)   NOT NULL UNIQUE,
  username           VARCHAR(64)   NOT NULL DEFAULT '',
  realm              VARCHAR(64)   DEFAULT '',
  nasipaddress       INET          NOT NULL,
  nasportid          VARCHAR(15),
  nasporttype        VARCHAR(32),
  acctstarttime      TIMESTAMP WITH TIME ZONE,
  acctupdatetime     TIMESTAMP WITH TIME ZONE,
  acctstoptime       TIMESTAMP WITH TIME ZONE,
  acctinterval       BIGINT,
  acctsessiontime    BIGINT,
  acctauthentic      VARCHAR(32),
  connectinfo_start  VARCHAR(50),
  connectinfo_stop   VARCHAR(50),
  acctinputoctets    BIGINT,
  acctoutputoctets   BIGINT,
  calledstationid    VARCHAR(50)  NOT NULL DEFAULT '',
  callingstationid   VARCHAR(50)  NOT NULL DEFAULT '',
  acctterminatecause VARCHAR(32)  NOT NULL DEFAULT '',
  servicetype        VARCHAR(32),
  framedprotocol     VARCHAR(32),
  framedipaddress    INET,
  framedipv6address  INET,
  framedipv6prefix   INET,
  framedinterfaceid  VARCHAR(44),
  delegatedipv6prefix INET,
  class              VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS radacct_active_session_idx ON radacct (acctuniqueid) WHERE acctstoptime IS NULL;
CREATE INDEX IF NOT EXISTS radacct_username_idx ON radacct (username);
CREATE INDEX IF NOT EXISTS radacct_start_user_idx ON radacct (acctstarttime, username);

CREATE TABLE IF NOT EXISTS radpostauth (
  id        BIGSERIAL PRIMARY KEY,
  username  VARCHAR(64) NOT NULL,
  pass      VARCHAR(64),
  reply     VARCHAR(32),
  calledstationid  VARCHAR(50),
  callingstationid VARCHAR(50),
  authdate  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  class     VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS radpostauth_username_idx ON radpostauth (username);
CREATE INDEX IF NOT EXISTS radpostauth_authdate_idx ON radpostauth (authdate);

CREATE TABLE IF NOT EXISTS nas (
  id            BIGSERIAL PRIMARY KEY,
  nasname       VARCHAR(128) NOT NULL,
  shortname     VARCHAR(32),
  type          VARCHAR(30)  DEFAULT 'other',
  ports         INTEGER,
  secret        VARCHAR(60)  NOT NULL,
  server        VARCHAR(64),
  community     VARCHAR(50),
  description   VARCHAR(200) DEFAULT 'RADIUS Client'
);
CREATE INDEX IF NOT EXISTS nas_nasname_idx ON nas (nasname);
