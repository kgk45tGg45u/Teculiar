#!/usr/bin/env bash
# Teculiar self-hosted storefront installer (Phase 4.6f, O-3 = self-hosted-first).
#
# Runs on the CUSTOMER's Linux server. Installs nothing global except Docker (if missing); everything
# else lives under /opt/teculiar-storefront. The storefront is presentational only — no secrets, no
# business logic — and talks to the hosted Teculiar API on the customer's own api.<domain> (white-label).
#
# Usage (values come from the onboarding flow):
#   TENANT=acme DOMAIN=acmehost.com bash install.sh
#   # optional: PORT=3001 (local storefront port), IMAGE_TAG=latest
#
# What the customer must have done first (the wizard/runbook walks them through it):
#   1. DNS: admin.<domain>, client.<domain>, api.<domain> → CNAME/A to the Teculiar edge.
#   2. Those hosts registered + verified (DNS-TXT) with Teculiar, so the edge issues their certs.
#   3. The apex (<domain>) pointing at THIS server — the storefront installed here serves it.
#
# Published at https://get.teculiar.com/install.sh (serve this file from the teculiar.net vhost).
# ⚠️ OP PREREQUISITE: the ghcr.io storefront image must be PUBLIC (or customers get a pull token) —
#    ghcr.io/kgk45tgg45u/teculiar-storefront is private today; make the package public before first use.

set -euo pipefail

TENANT="${TENANT:?Set TENANT=<your tenant subdomain> (from your Teculiar welcome email)}"
DOMAIN="${DOMAIN:?Set DOMAIN=<your storefront domain, e.g. acmehost.com>}"
PORT="${PORT:-3001}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/opt/teculiar-storefront}"
IMAGE="ghcr.io/kgk45tgg45u/teculiar-storefront:${IMAGE_TAG}"

echo "Teculiar storefront installer — tenant '${TENANT}', domain '${DOMAIN}'"

# 1) Docker (install only if missing; official convenience script).
if ! command -v docker >/dev/null 2>&1; then
  echo "→ Installing Docker…"
  curl -fsSL https://get.docker.com | sh
fi

# 2) App directory + compose file. The storefront resolves its API base at RUNTIME (never baked):
#    the browser calls same-origin /api (proxied), SSR calls TECULIAR_UPSTREAM.
mkdir -p "${INSTALL_DIR}"
cat > "${INSTALL_DIR}/docker-compose.yml" <<EOF
services:
  storefront:
    image: ${IMAGE}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${PORT}:3001"
    environment:
      # SSR data fetches → the tenant's hosted API, via the customer's own white-label api host.
      - TECULIAR_UPSTREAM=https://api.${DOMAIN}
EOF

# 3) Pull + start.
cd "${INSTALL_DIR}"
docker compose pull
docker compose up -d

# 4) Local web server wiring (the part we cannot do generically): the customer's web server must send
#    the apex's traffic to the storefront and the hosted paths to their api host. If Caddy is present
#    we can offer a ready block; otherwise print instructions for their existing server.
cat <<EOF

✅ Storefront running on 127.0.0.1:${PORT} (tenant: ${TENANT}).

Final step — point your web server at it. Your ${DOMAIN} vhost needs:
  • everything          → http://127.0.0.1:${PORT}
  • /api and /uploads   → https://api.${DOMAIN}   (keeps browser calls same-origin)
  • /admin, /client, /login, /reset-password → redirect (301) to https://client.${DOMAIN} / admin.${DOMAIN}

Example (Caddy on this server):
  ${DOMAIN} {
      handle /api/* {
          reverse_proxy https://api.${DOMAIN} {
              header_up Host api.${DOMAIN}
          }
      }
      handle /uploads/* {
          reverse_proxy https://api.${DOMAIN} {
              header_up Host api.${DOMAIN}
          }
      }
      redir /admin* https://admin.${DOMAIN}
      redir /client* https://client.${DOMAIN}
      redir /login https://client.${DOMAIN}/login
      handle {
          reverse_proxy 127.0.0.1:${PORT}
      }
  }

Verify: https://${DOMAIN} shows your storefront; https://client.${DOMAIN} shows your customer portal.
Updates: cd ${INSTALL_DIR} && docker compose pull && docker compose up -d
EOF
