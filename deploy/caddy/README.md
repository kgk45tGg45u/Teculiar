# Teculiar edge (Caddy) — stand-up, topology B1 (second IP)

The edge terminates TLS for tenant domains and reverse-proxies to the Docker containers, with **on-demand
TLS** for external custom domains gated by the API's `tls-allowed` endpoint. Topology **B1**: Caddy runs on
eu01's **second IP**, so Apache keeps the first IP for your Virtualmin hosting customers — **zero change to
their sites**. Design: [../../docs/teculiar-phase4.6-plan.md](../../docs/teculiar-phase4.6-plan.md) §3.

> The [`Caddyfile`](./Caddyfile) is a **starting template** — validate it and test on teculiar.com before
> touching dezhost.com. The named-site (own-domain) routing is complete; the external-customer catch-all is a
> documented TODO pending the hosting-model decision (O-2 / apexMode).

## Prerequisites (yours)

1. **A second IPv4 on eu01** (or an IPv6). Assign it to the box: `ip addr add 203.0.113.2/24 dev eth0` (make
   it persistent via your netplan/ifcfg). Confirm Apache is NOT listening on it (Virtualmin binds the first
   IP; check `ss -ltnp | grep :443`).
2. The `:edge` API image with the **`tls-allowed`** endpoint deployed (it ships in the current build):
   `curl -s http://127.0.0.1:4001/api/v1/tenancy/tls-allowed?domain=teculiar.com` → `{"ok":true}` (once
   teculiar.com is a registered ACTIVE `tenant_domains` row), any other host → 404.

## Install + run Caddy

```bash
# Debian/Ubuntu (adjust for your distro):
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo mkdir -p /opt/teculiar/edge
sudo cp deploy/caddy/Caddyfile /opt/teculiar/edge/Caddyfile   # then edit: real second IP + confirm ports
caddy validate --config /opt/teculiar/edge/Caddyfile          # MUST pass before you point any DNS
sudo cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile           # or run: caddy run --config .../Caddyfile
sudo systemctl restart caddy
```

Caddy is free (Apache-2.0), including on-demand TLS — no license, no per-tenant fee.

## Point DNS at the edge (the only white-label step for a tenant)

- **Own domains (Part L):** repoint `teculiar.com`/`dezhost.com` (A/ALIAS at apex, CNAME for `www`) to the
  **second IP**, and remove their §6 Apache proxy block (see server-migration Part L). Do teculiar.com first.
- **An external customer:** they set `admin.theirdomain.com` / `client.theirdomain.com` (and `api.` /
  apex per the model) as a **CNAME/record to the edge** — no web-server config on their end. On the first
  request, Caddy asks `tls-allowed`; because you registered those hosts `active`, the cert issues
  automatically.

## Verify

```bash
caddy validate --config /etc/caddy/Caddyfile
curl -sI https://teculiar.com --resolve teculiar.com:443:203.0.113.2 | head -1   # 200 via the edge
```
Then browse teculiar.com → storefront + `/admin`,`/client` load same-origin with a valid cert (URL never
shows teculiar.net). Roll back by restoring the Apache block + reverting DNS (Part L keeps the saved copy).

## Not done yet (needs decisions, not just standing this up)

- **External-customer routing** (the Caddyfile catch-all): finalize per-surface-subdomain vs apex + the
  storefront hosting model (self-hosted install-script vs a Host-multiplexed hosted storefront). Until then,
  external tenants can use a `*.teculiar.net` subdomain (covered by the existing wildcard cert, no edge
  needed) or self-host their storefront.
- **DNS-TXT domain-ownership verification** (so an external customer's host only goes `active` after they
  prove they own it) — pairs with the onboarding wizard (4.6f). For your own domains you set them `active`
  directly via `register-domain`, so this isn't needed for Part L.
