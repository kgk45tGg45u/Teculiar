# Teculiar edge (Caddy) on the live eu01 box — full runbook

> **✅ STATUS (2026-07-04): Part 1 completed on eu01 and smoke-tested end-to-end** — Apache pinned to the
> primary IP, floating IP added, Caddy 2.11 running on `195.201.252.12:443`, and `edge-test.teculiar.net`
> proved the full pipeline (tls-allowed gate → Let's Encrypt issuance → tenant resolution → routing).
> **The edge is now the standard path for white-label domains** — the Apache proxy blocks (old
> server-migration §6b/§6c, operations H.5) are retired; own-domain flips are DNS-only per
> [server-migration §6](../../docs/teculiar-phase4.6-server-migration.md).

**Model (topology B1, one box):** Apache keeps the **primary IP** `178.104.82.146` — every Virtualmin
hosting customer, the own-domain Apache bootstrap (teculiar.com/dezhost.com/teculiar.net), and their
**Let's Encrypt via Virtualmin all keep working exactly as today**, because those domains' DNS points at
the primary IP and validation happens there. Caddy owns only the **floating IP** `195.201.252.12` and
terminates TLS for **Teculiar tenant custom domains** whose DNS points at it.

Why Let's Encrypt doesn't conflict: LE has no per-server state — each web server proves control of the
hostnames *routed to it*. Apache validates domains pointing at the primary IP; Caddy validates domains
pointing at the floating IP. They never compete for the same hostname.

Why this attempt won't repeat the last failure: every Caddy site uses **on-demand TLS**, so Caddy attempts
**zero certificates at startup** — the whole install is inert until a domain's DNS actually points at the
floating IP. And we pin Apache + tell Virtualmin its primary IP *before* re-adding the floating IP, which
removes the two things that fought back (the `*:443` grab and the "primary IP changed" warning).

> AlmaLinux, non-root sudo admin. Design: [../../docs/teculiar-phase4.6-plan.md](../../docs/teculiar-phase4.6-plan.md) §3.
> Own-domain DNS flips live in the server-migration doc **§6** (teculiar.com = 6b, dezhost.com = 6c).

---

## Part 1 — Conversion (do in this exact order; checkpoint after every step)

### Step 0 — Preconditions
- Floating IP `195.201.252.12` exists in the Hetzner console and is **assigned to eu01** (Console →
  Floating IPs). Assigned ≠ configured on the OS — that's step 3.
- The `tls-allowed` endpoint answers:
  ```bash
  curl -s 'http://127.0.0.1:4001/api/v1/tenancy/tls-allowed?domain=teculiar.com'   # {"ok":true}
  curl -s 'http://127.0.0.1:4001/api/v1/tenancy/tls-allowed?domain=example.com'    # 404 JSON
  ```

### Step 1 — Pin Apache to the primary IP (the fix for `*:443`)
```bash
sudo grep -rniE '^\s*Listen' /etc/httpd/
# expected:  /etc/httpd/conf/httpd.conf:      Listen 80
#            /etc/httpd/conf.d/ssl.conf:      Listen 443 https
```
Edit **every** `Listen` found to be IP-qualified:
```apache
Listen 178.104.82.146:80
Listen 178.104.82.146:443 https
```
```bash
sudo apachectl configtest && sudo systemctl restart httpd
```
**Checkpoint:** `sudo ss -ltnp '( sport = :443 )'` shows httpd on **`178.104.82.146:443` only** (no `*:443`).
Browse one hosting-customer site + https://teculiar.com — all normal. (`<VirtualHost *:443>` blocks are
fine as-is: `Listen` controls the socket; vhosts match whatever arrives on it.)

### Step 2 — Tell Virtualmin its primary IP explicitly (the fix for the warning)
Virtualmin → **System Settings → Virtualmin Configuration → Networking settings** → set **"Default virtual
server IPv4 address"** from *detect automatically* to **explicitly `178.104.82.146`** (same for the default
IP for DNS records if shown). Now Virtualmin no longer guesses from the interface, so adding the floating IP
cannot flip its idea of the primary. New virtual servers keep landing on the primary IP as before.

### Step 3 — Add the floating IP to the interface (persistent)
```bash
sudo nmcli connection modify "cloud-init eth0" +ipv4.addresses 195.201.252.12/32
sudo nmcli connection up "cloud-init eth0"
```
**Checkpoints:**
```bash
ip -br addr                     # eth0 lists BOTH 195.201.252.12/32 and 178.104.82.146/32
ip route get 8.8.8.8            # MUST show "src 178.104.82.146" — outbound (incl. mail/SPF) unchanged
```
Virtualmin dashboard: **no** "primary IP changed" warning this time (step 2 prevents it). If one appears
anyway, choose *don't change* — never "update to the new IP".
> After the next planned reboot, re-check `ip -br addr` once: if cloud-init ever regenerates the network
> config and drops the IP, freeze it with
> `echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg`
> and re-add via nmcli.

### Step 4 — Firewall
```bash
sudo firewall-cmd --list-services      # http + https must be present (they already are for Apache)
# if missing:  sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
```
If a Hetzner **Cloud Firewall** is attached to eu01, allow TCP 80+443 there too (it filters the floating IP
as well).

### Step 5 — Install Caddy (COPR) + config
```bash
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable -y @caddy/caddy
sudo dnf install -y caddy
sudo cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile     # from a repo checkout; IP + ports already match eu01
sudo caddy validate --config /etc/caddy/Caddyfile       # MUST pass
sudo systemctl enable --now caddy
sudo systemctl status caddy                             # active (running)
```
The COPR package runs Caddy as the `caddy` user with `CAP_NET_BIND_SERVICE` via systemd — that's how it
binds :80/:443 without root; drive it only with `sudo systemctl …`, never `caddy run` as your login user.

**Checkpoint:** `sudo ss -ltnp '( sport = :443 )'` now shows **httpd on `178.104.82.146:443` AND caddy on
`195.201.252.12:443`** — the box's two front doors, one per IP. `journalctl -u caddy -e` shows a clean start
and **no certificate attempts** (on-demand = nothing until traffic arrives).
> SELinux note: if Caddy later can't reach the containers, check `sudo ausearch -m AVC -ts recent`;
> `sudo setsebool -P httpd_can_network_connect 1` clears the common denial.

### Step 6 — Register the smoke-test host
```bash
cd /opt/teculiar
docker compose exec api node apps/api/dist/tenancy/register-domain.js edge-test.teculiar.net teculiar apex active
```
And add a DNS **A record**: `edge-test.teculiar.net → 195.201.252.12` (an explicit record overrides the
`*.teculiar.net` wildcard for that name).

### Step 7 — End-to-end smoke test (no live domain touched)
Once the A record resolves (`dig +short edge-test.teculiar.net` → `195.201.252.12`):
```bash
curl -sI https://edge-test.teculiar.net | head -3
```
First request: Caddy asks `tls-allowed` (allowed — you registered it), gets a Let's Encrypt cert (HTTP-01
or TLS-ALPN-01, both land on the floating IP), and serves the teculiar storefront. Expect **`307`** on the
bare apex — that's the storefront's locale redirect (`/` → `/de`); add `-L` to follow it to the `200`.
Browser check: valid padlock, `/admin` + `/client` load. `journalctl -u caddy -e` shows the issuance.
**This proves the entire pipeline — on-demand gate, ACME, tenant resolution, container routing — with zero
risk to live domains.** *(Verified on eu01 2026-07-04: teculiar.com issued in ~3 s via tls-alpn-01.)*

Negative test (the abuse gate): point any unregistered hostname you control at the floating IP and curl it —
the TLS handshake must **fail** (ask → 404 → no cert). 

**Done.** teculiar.com/dezhost.com stay on Apache until you deliberately run **Part L** (server-migration
doc). External customers become possible after the catch-all site block is enabled (see the TODO at the
bottom of the Caddyfile — needs the O-2 hosting-model decision + 4.6f onboarding).

---

## Part 2 — Change ledger (everything this runbook changes on the box)

| # | What | Before | After |
|---|---|---|---|
| 1 | `/etc/httpd/conf/httpd.conf` `Listen` | `Listen 80` | `Listen 178.104.82.146:80` |
| 2 | `/etc/httpd/conf.d/ssl.conf` `Listen` | `Listen 443 https` | `Listen 178.104.82.146:443 https` |
| 3 | Virtualmin → Networking → default virtual-server IPv4 | detect automatically | explicit `178.104.82.146` |
| 4 | NetworkManager profile `cloud-init eth0` | primary IP only | `+ipv4.addresses 195.201.252.12/32` |
| 5 | Packages/services | — | `caddy` (COPR repo `@caddy/caddy`) enabled; config `/etc/caddy/Caddyfile` |
| 6 | firewalld | http/https already open | unchanged (verify only) |
| 7 | Hetzner | floating IP unassigned | floating IP assigned to eu01 (+ Cloud-Firewall 80/443 if used) |
| 8 | Control-plane data | — | `tenant_domains` row `edge-test.teculiar.net` + DNS A record |

Nothing else: `/opt/teculiar` stack, tenant DBs, Apache vhosts, Webmin, and all customer sites untouched.

## Part 3 — Full revert (back to the pre-Caddy box)

Reverse order; each step independent:
1. **Caddy off:** `sudo systemctl disable --now caddy` (package can stay; to purge:
   `sudo dnf remove caddy && sudo rm -rf /etc/caddy` — certs live in `/var/lib/caddy`, removable too).
2. **Unpin Apache:** restore `Listen 80` / `Listen 443 https` (ledger #1–2), then
   `sudo apachectl configtest && sudo systemctl restart httpd`. (`ss` shows `*:443` again = original state.)
3. **Virtualmin setting:** optionally set the default IP back to *detect automatically* (keeping it explicit
   is harmless and actually safer — fine to leave).
4. **Remove the floating IP from the OS:**
   `sudo nmcli connection modify "cloud-init eth0" -ipv4.addresses 195.201.252.12/32 && sudo nmcli connection up "cloud-init eth0"`
   (if `ip -br addr` still shows it: `sudo ip addr del 195.201.252.12/32 dev eth0`).
5. **Hetzner:** unassign the floating IP (keep it allocated cheaply for later, or delete it — deleting
   loses the IP forever, which matters once customer DNS points at it).
6. **Cleanup data:** delete the `edge-test.teculiar.net` A record; deactivate the row:
   `register-domain.js edge-test.teculiar.net teculiar apex disabled`.

## Part 4 — Moving eu01 to a new server later

The floating IP is the **migration asset**: external customers' DNS points at `195.201.252.12`, and a
floating IP can be **reassigned to another Hetzner server in seconds** — customer DNS never changes.
1. Build the new box (Virtualmin backup/restore, `/opt/teculiar` stack + `.env`, MariaDB dumps incl.
   `teculiar_control` + tenant DBs, uploads volume).
2. Repeat **Part 1** on the new box (pin Apache to *its* primary IP, Virtualmin explicit IP, install Caddy —
   same Caddyfile, only `default_bind`'s IP stays the floating IP).
3. In the Hetzner console, **reassign the floating IP** to the new server; add it to the new box's
   interface (step 3). External tenant domains keep working unchanged.
4. Update DNS that points at the **primary** IP (teculiar.net + wildcard, teculiar.com, dezhost.com, MX/PTR)
   to the new primary IP — that's ordinary server-move DNS, independent of Caddy.

## Part 5 — Buying a dedicated Caddy edge box later (topology B3)

When a small cloud box becomes available, the edge moves off eu01 **without customers noticing**:
1. Provision the box (same Hetzner location), attach **both** servers to a Hetzner **private network**
   (free) — say eu01 = `10.0.0.2`.
2. eu01: revert Part 1 steps 1–5 if you wish (Apache pinning may simply stay), and in `/opt/teculiar/.env`
   set `BIND_HOST=10.0.0.2` + `docker compose up -d` (compose supports it) so the containers listen on the
   private IP. Do the same in the Dezhost storefront compose (`:3021`). **Firewall those ports to the
   private subnet only** (firewalld: put the private interface/subnet in a trusted/internal zone; never
   expose 4001/3010/3011/3021 publicly).
3. Edge box: install Caddy (Part 1 step 5), copy the **same Caddyfile**, and set the backend override:
   `sudo systemctl edit caddy` → `[Service]` → `Environment=TECULIAR_BACKEND_HOST=10.0.0.2` → restart.
4. **Reassign the floating IP** from eu01 to the edge box (console + add to its interface) — external
   tenant DNS unchanged. Disable Caddy on eu01.

---

Caddy is free (Apache-2.0), including on-demand TLS — no license, no per-tenant fee, at any scale.
