# Dezhost — Deployment Guide

This guide walks you through deploying Dezhost on an **AlmaLinux** server using **GitHub Actions** to build Docker images and **Docker Compose** to run them.

---

## How it works

```
You push to GitHub main
        │
        ▼
GitHub Actions builds Docker images
  • dezhost-api   (NestJS + Prisma)
  • dezhost-web   (Next.js standalone)
        │
        ▼
Images are pushed to GitHub Container Registry (ghcr.io)
        │
        ▼
GitHub Actions SSH-es into your server
  • docker compose pull  (downloads the new images)
  • docker compose up -d (restarts containers)
  • API container runs Prisma migrations on startup automatically
        │
        ▼
Nginx on the host (port 80/443) proxies traffic to the containers
```

---

## Part 1 — Prepare your GitHub repository

### 1.1 Make the repository private (recommended)

Images pushed to ghcr.io inherit the visibility of the source repo. A private repo keeps your images private.

### 1.2 Add GitHub Secrets

Go to **GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name            | Value                                                                                |
|------------------------|--------------------------------------------------------------------------------------|
| `NEXT_PUBLIC_API_URL`  | Your public API URL, e.g. `https://yourdomain.com/api/v1`                           |
| `SSH_HOST`             | Your server's IP address or hostname                                                 |
| `SSH_USER`             | The SSH user on your server (e.g. `deploy` or `root`)                               |
| `SSH_PRIVATE_KEY`      | The **private** SSH key whose public key is on the server (see step 2.3)            |
| `GHCR_TOKEN`           | A GitHub Personal Access Token (PAT) with `read:packages` scope (see step 1.3)     |

### 1.3 Create a GitHub Personal Access Token for the server

The server needs to `docker login ghcr.io` to pull private images.

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Name it `dezhost-server-pull`
4. Select only `read:packages`
5. Click **Generate token** — copy it and save as the `GHCR_TOKEN` secret above

### 1.4 Edit the docker-compose.prod.yml image names

Open [docker-compose.prod.yml](docker-compose.prod.yml) and replace `YOUR_GITHUB_USERNAME` with your actual GitHub username or organization name:

```yaml
image: ghcr.io/your-actual-username/dezhost-api:latest
image: ghcr.io/your-actual-username/dezhost-web:latest
```

---

## Part 2 — Prepare your server (AlmaLinux)

> **Note:** Run all commands as root or prefix with `sudo`.

### 2.1 Install Docker

```bash
# Install required packages
dnf install -y dnf-utils device-mapper-persistent-data lvm2

# Add Docker's official repo
dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo

# Install Docker
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
systemctl enable --now docker
```

Verify: `docker --version` and `docker compose version`

### 2.2 Install Nginx

```bash
dnf install -y nginx
systemctl enable --now nginx
```

### 2.3 Create a deploy SSH key

On your **local machine** (not the server), generate a key pair:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/dezhost_deploy
```

This creates:
- `~/.ssh/dezhost_deploy` — the **private key** → paste this into the `SSH_PRIVATE_KEY` GitHub secret
- `~/.ssh/dezhost_deploy.pub` — the **public key** → add to the server

On the **server**, add the public key to the deploy user:

```bash
# Replace with your actual public key content
echo "ssh-ed25519 AAAA... github-actions-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Test that it works: `ssh -i ~/.ssh/dezhost_deploy root@YOUR_SERVER_IP`

### 2.4 Create the app directory and environment file

On the **server**:

```bash
mkdir -p /opt/dezhost
cd /opt/dezhost
```

Create the environment file `/opt/dezhost/.env` — this is loaded by both containers at runtime:

```bash
cat > /opt/dezhost/.env << 'EOF'
# Database — use host.docker.internal to reach MariaDB on the host
DATABASE_URL=mysql://dezhost_user:STRONG_PASSWORD@host.docker.internal:3306/dezhost_hosting

# App URLs (use your actual domain)
APP_URL=https://yourdomain.com
PUBLIC_WEB_URL=https://yourdomain.com
PUBLIC_API_URL=https://yourdomain.com/api/v1
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1
CORS_ORIGINS=https://yourdomain.com
COOKIE_DOMAIN=yourdomain.com

# JWT (generate strong random strings)
JWT_ACCESS_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_STRING
JWT_REFRESH_SECRET=CHANGE_THIS_TO_ANOTHER_LONG_RANDOM_STRING
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# Emergency admin (first run only, delete after bootstrapping)
EMERGENCY_ADMIN_EMAIL=admin@yourdomain.com
EMERGENCY_ADMIN_PASSWORD=CHANGE_THIS

# Email
ADMIN_EMAIL=admin@yourdomain.com
MAIL_FROM=noreply@yourdomain.com

# Resell.biz
RESELLBIZ_API_BASE_URL=https://httpapi.com
RESELLBIZ_RESELLER_ID=YOUR_RESELLER_ID
RESELLBIZ_API_KEY=YOUR_API_KEY
RESELLBIZ_DEFAULT_NS=ns1.yourdomain.com,ns2.yourdomain.com

# Virtualmin
VIRTUALMIN_ADMIN_ENDPOINT=https://your-virtualmin-server:10000
VIRTUALMIN_ADMIN_USERNAME=root
VIRTUALMIN_ADMIN_PASSWORD=YOUR_PASSWORD
VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED=1

# Tax
VAT_COUNTRY_CODE=DE
VAT_STANDARD_RATE=19

# Cron
CRON_SECRET=CHANGE_THIS_TO_A_RANDOM_STRING
EOF
```

Protect the file:

```bash
chmod 600 /opt/dezhost/.env
```

### 2.5 Copy docker-compose.prod.yml to the server

From your local machine (after editing the image names in step 1.4):

```bash
scp docker-compose.prod.yml root@YOUR_SERVER_IP:/opt/dezhost/
```

Or clone the repo on the server and copy it:

```bash
# On the server
cp /path/to/repo/docker-compose.prod.yml /opt/dezhost/
```

### 2.6 Create the MariaDB database and user

```bash
mysql -u root -p << 'EOF'
CREATE DATABASE dezhost_hosting CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dezhost_user'@'%' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON dezhost_hosting.* TO 'dezhost_user'@'%';
FLUSH PRIVILEGES;
EOF
```

> The `%` wildcard allows the Docker container (which has a different IP) to connect.
> If you want to restrict it further: use the Docker bridge network IP, e.g. `172.17.0.0/16`.

Verify MariaDB is listening on all interfaces (so Docker can reach it):

```bash
grep -E "^bind-address" /etc/my.cnf.d/*.cnf
```

If it says `127.0.0.1`, change it to `0.0.0.0` or comment it out, then restart:

```bash
systemctl restart mariadb
```

### 2.7 Configure Nginx

Install the Nginx config:

```bash
cp /path/to/repo/nginx/dezhost.conf /etc/nginx/conf.d/dezhost.conf
```

Edit it and replace `yourdomain.com` with your actual domain:

```bash
sed -i 's/yourdomain.com/your-actual-domain.com/g' /etc/nginx/conf.d/dezhost.conf
```

Test the config:

```bash
nginx -t
```

### 2.8 Obtain an SSL certificate with Certbot

```bash
# Install Certbot
dnf install -y certbot python3-certbot-nginx

# Obtain certificate (Nginx must be running and port 80 open in firewall)
certbot --nginx -d yourdomain.com -d www.yourdomain.com \
  --email admin@yourdomain.com --agree-tos --non-interactive

# Enable auto-renewal
systemctl enable --now certbot-renew.timer
```

After Certbot runs, it will update the Nginx config automatically. Reload:

```bash
systemctl reload nginx
```

### 2.9 Open firewall ports

```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

> **Do not** open ports 3000 or 4000 — those should only be accessible from localhost (Nginx).

---

## Part 3 — First deployment

### 3.1 Trigger the GitHub Actions workflow

Push any commit to the `main` branch:

```bash
git push origin main
```

Go to **GitHub → Actions** and watch the workflow run. It will:
1. Build the API and Web Docker images
2. Push them to `ghcr.io`
3. SSH into your server and restart the containers

The API container will automatically run `prisma migrate deploy` on startup, creating all database tables.

### 3.2 Verify the deployment

On the server:

```bash
# Check containers are running
docker compose -f /opt/dezhost/docker-compose.prod.yml ps

# Watch API startup logs (migrations + server start)
docker compose -f /opt/dezhost/docker-compose.prod.yml logs -f api

# Watch web logs
docker compose -f /opt/dezhost/docker-compose.prod.yml logs -f web
```

Then visit `https://yourdomain.com` in a browser.

---

## Part 4 — Everyday operations

### Deploying updates

Just push to `main` — GitHub Actions does the rest automatically.

### Viewing logs

```bash
# Last 100 lines from API
docker compose -f /opt/dezhost/docker-compose.prod.yml logs --tail=100 api

# Follow live
docker compose -f /opt/dezhost/docker-compose.prod.yml logs -f web
```

### Manually restarting a container

```bash
docker compose -f /opt/dezhost/docker-compose.prod.yml restart api
```

### Updating environment variables

1. Edit `/opt/dezhost/.env` on the server
2. Restart the affected container: `docker compose -f /opt/dezhost/docker-compose.prod.yml restart api`

### Running a one-off Prisma command (e.g., db:studio)

```bash
docker compose -f /opt/dezhost/docker-compose.prod.yml exec api \
  node_modules/.bin/prisma studio --schema prisma/schema.prisma
```

### Rollback to a previous version

Each push is tagged with the Git SHA. To roll back:

```bash
# On the server — edit docker-compose.prod.yml
# Change :latest to :THE_SHA_YOU_WANT
docker compose -f /opt/dezhost/docker-compose.prod.yml up -d
```

---

## Files created by this setup

| File | Purpose |
|------|---------|
| `Dockerfile.api` | Multi-stage Docker build for the NestJS API |
| `Dockerfile.web` | Multi-stage Docker build for the Next.js frontend |
| `.dockerignore` | Files excluded from the Docker build context |
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD pipeline |
| `docker-compose.prod.yml` | Production Docker Compose — runs on your server |
| `nginx/dezhost.conf` | Nginx reverse proxy + SSL config |

---

## Secrets checklist

| Where | Secret | Description |
|-------|--------|-------------|
| GitHub Secrets | `NEXT_PUBLIC_API_URL` | Public API URL baked into Next.js at build time |
| GitHub Secrets | `SSH_HOST` | Server IP or hostname |
| GitHub Secrets | `SSH_USER` | SSH login user |
| GitHub Secrets | `SSH_PRIVATE_KEY` | Private key for SSH (public key must be on server) |
| GitHub Secrets | `GHCR_TOKEN` | GitHub PAT with `read:packages` for server to pull images |
| Server `/opt/dezhost/.env` | All runtime secrets | DATABASE_URL, JWT secrets, Resell.biz keys, etc. |

---

## Troubleshooting

**Containers exit immediately after deploy**
```bash
docker compose -f /opt/dezhost/docker-compose.prod.yml logs api
```
Most likely cause: wrong `DATABASE_URL` in `.env` — check host, port, credentials.

**Migrations fail**
The API logs will show the Prisma error. Common causes:
- MariaDB user lacks CREATE/ALTER permissions
- `bind-address` in MariaDB config blocks Docker connections

**Next.js shows API errors**
Check that `NEXT_PUBLIC_API_URL` in the GitHub Secret matches the URL your Nginx is serving (must be HTTPS in production).

**Nginx 502 Bad Gateway**
The container isn't running yet. Check `docker compose ps` and container logs.
