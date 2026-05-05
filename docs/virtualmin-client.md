# Virtualmin Client Prototype

## Purpose

`/api/v1/virtualmin-client` is a temporary HTML endpoint for testing Virtualmin account visibility before this moves into the customer dashboard.

It asks for:

- Virtualmin API URL, for example `https://panel.example.com:10000`
- Domain name
- Virtualmin username
- Virtualmin password

The endpoint calls Virtualmin Remote API at `/virtual-server/remote.cgi` with HTTP Basic auth and `json=1`.
List commands use bare flags like `multiline`, not `multiline=1`.

References:

- https://www.virtualmin.com/documentation/developer/http
- https://www.virtualmin.com/docs/development/api-programs/list-domains/

## Current Commands

- `list-domains` for IP address, disk usage, limits, owner, and other virtual server fields.
- `list-users` with `mail-size` for mailboxes, mailbox quotas, and mailbox usage when Virtualmin returns them.
- `list-databases` for databases.
- `list-bandwidth` for bandwidth information when available.
- `create-user` to add mailbox users.
- `delete-user` to remove mailbox users.
- `modify-user` to change mailbox user passwords.
- `create-database` to add databases.
- `delete-database` to remove databases.
- `modify-database-pass` to change the domain database password.

## Secure Admin Proxy Mode

Virtualmin Remote API is master-admin only. A virtual server owner can have valid panel credentials and still get:

```text
ERROR: You are not allowed to run remote commands
```

For production-style testing, set these API environment variables:

```bash
VIRTUALMIN_ADMIN_ENDPOINT="https://eu01.dezhost.com:10000"
VIRTUALMIN_ADMIN_USERNAME="api-admin"
VIRTUALMIN_ADMIN_PASSWORD="..."
VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED="1"
```

Then the page works like this:

- The user enters their own domain, username, and password.
- The API checks that the user password is valid.
- The API uses the admin credential only on the server side.
- The API runs `list-domains` with both `domain` and `user` filters.
- Every action is forced back to the validated domain.
- User-supplied commands are never accepted.
- The admin password is never sent to the browser.
- The user password is no longer stored in hidden form fields; action forms require it again.

## Known Limits

- Virtualmin Remote API requires the master administrator.
- Existing mailbox and database passwords are not retrievable through this client.
- The client supports changing mailbox passwords and changing the domain database password.
- Webmin often uses a self-signed certificate. The form has a temporary self-signed TLS checkbox for testing.

## Later Dashboard Plan

- Store the admin credential in a secret manager.
- Link a client service record to the Virtualmin domain.
- Replace this HTML page with authenticated dashboard API endpoints.
- Add CSRF/session protection and rate limits for all mailbox and database mutations.
- Add audit logs for every Virtualmin action.



Use it:

npm --workspace @crimson/api run start:dev
Open:

http://localhost:4000/api/v1/virtualmin-client
Build later, when you want:

npm --workspace @crimson/api run build
