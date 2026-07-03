# Teculiar edge (Caddy) — stand-up, topology B1 (second IP)

The edge terminates TLS for tenant domains and reverse-proxies to the Docker containers, with **on-demand
TLS** for external custom domains gated by the API's `tls-allowed` endpoint. Topology **B1**: Caddy runs on
eu01's **second IP**, so Apache keeps the first IP for your Virtualmin hosting customers — **zero change to
their sites**. Design: [../../docs/teculiar-phase4.6-plan.md](../../docs/teculiar-phase4.6-plan.md) §3.

> The [`Caddyfile`](./Caddyfile) is a **starting template** — validate it and test on teculiar.com before
> touching dezhost.com. The named-site (own-domain) routing is complete; the external-customer catch-all is a
> documented TODO pending the hosting-model decision (O-2 / apexMode).

## Prerequisites — do these IN ORDER before installing Caddy (AlmaLinux, non-root sudo admin)

**Use a second IPv4, not IPv6-only.** The edge is public-facing; IPv4-only visitors can't reach an
IPv6-only address, so the site would be down for them. IPv6 is fine only as an extra dual-stack address.

1. **Buy an additional IPv4** from your host (Hetzner: it's a small paid add-on; IPv6 is free but doesn't
   replace IPv4 for public reachability).
2. **Assign it to the interface** (it's allocated to the server but not live on the OS until you add it):
   ```bash
   nmcli connection show                                   # find the active connection name
   sudo nmcli connection modify "System eth0" +ipv4.addresses 203.0.113.2/32
   sudo nmcli connection up "System eth0"
   ip addr show                                            # the new IP should be listed
   ```
   (Use the netmask/gateway your host gives you; some dedicated setups route the extra IP as /32.)
3. **Free the second IP's :443 — pin Apache to the FIRST IP.** Apache/Virtualmin almost certainly listens on
   *all* IPs, which blocks Caddy from binding the second one. Check + fix:
   ```bash
   sudo ss -ltnp '( sport = :443 )'          # httpd on 0.0.0.0:443 / *:443 / [::]:443 → it grabs the new IP too
   ```
   Fix in **Virtualmin** (so it isn't overwritten): Webmin → **Servers → Apache Webserver → Global
   configuration → Networking and Addresses** → set the listen address from "All" to your **first IP** for
   both 80 and 443. (Or edit `Listen` in `/etc/httpd/` to `Listen <FIRST_IP>:80` / `Listen <FIRST_IP>:443
   https`, then `sudo systemctl restart httpd`.) Re-check: `sudo ss -ltnp '( sport = :443 )'` → httpd should
   show **only `<first-ip>:443`**. Your hosting customers are unaffected (their domains resolve to the first IP).
4. **Open the firewall for 80/443** (Caddy needs :80 for the ACME challenge + redirect):
   ```bash
   sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
   ```
   If you also run a Hetzner **Cloud Firewall**, allow 80/443 there too.
5. **Confirm the `tls-allowed` endpoint is live** (it ships in the current `:edge` API build):
   `curl -s 'http://127.0.0.1:4001/api/v1/tenancy/tls-allowed?domain=teculiar.com'` → `{"ok":true}` once
   teculiar.com is a registered ACTIVE `tenant_domains` row; any other host → 404.

## Install + run Caddy (AlmaLinux / RHEL, via COPR)

```bash
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable -y @caddy/caddy
sudo dnf install -y caddy
```
The package installs a **systemd service that runs Caddy as the `caddy` user with `CAP_NET_BIND_SERVICE`**, so
it can bind :80/:443 even though you're a non-root admin — you drive it entirely with `sudo`, never
`caddy run` as your own user (that can't bind low ports). Then:

```bash
sudo cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile        # then edit: real second IP + confirm container ports
sudo caddy validate --config /etc/caddy/Caddyfile          # MUST pass before you point any DNS
sudo systemctl enable --now caddy
sudo systemctl reload caddy                                # graceful reload after later edits
sudo systemctl status caddy                                # active (running)
journalctl -u caddy -e                                     # logs, incl. ACME cert issuance
```

> **SELinux (enforcing on AlmaLinux):** if Caddy starts but can't reach the containers or issue certs, check
> `sudo ausearch -m AVC -ts recent`. Caddy from COPR runs unconfined via systemd, so this is usually fine; if
> a reverse-proxy connection is denied, `sudo setsebool -P httpd_can_network_connect 1` clears the common case.

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
