# FreeRADIUS (Ubuntu) + MySQL + PEAP/MSCHAPv2 + Optional MAC Binding

## Files

System (active)
- /etc/freeradius/3.0/sites-enabled/default
- /etc/freeradius/3.0/sites-enabled/inner-tunnel

Local copies
- D:/RnD/Freeradius/default
- D:/RnD/Freeradius/inner-tunnel

## DB (radcheck)

Password (required)
```sql
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('<user>', 'Cleartext-Password', ':=', '<password>');
```

MAC bind (optional per-user; match NAS format, e.g. AA-BB-CC-DD-EE-FF)
```sql
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('<user>', 'Calling-Station-Id', ':=', 'AA-BB-CC-DD-EE-FF');
```

## MAC Binding Logic

Location: /etc/freeradius/3.0/sites-enabled/inner-tunnel (authorize {}, after sql)
Compare: %{tolower:%{outer.request:Calling-Station-Id}} vs stored Calling-Station-Id from radcheck.

## Commands

Start service
```bash
sudo pkill freeradius
sudo pkill radiusd
sudo systemctl start freeradius
sudo systemctl status freeradius
```

Debug mode
```bash
sudo pkill freeradius
sudo pkill radiusd
sudo freeradius -X
```
