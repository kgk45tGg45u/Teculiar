# Dezhost — Deployment Guide

This guide is written specifically for your setup:
- **Server:** AlmaLinux with Virtualmin already running
- **Domain:** `https://www.dezhost.com` (already hosted and SSL-certified in Virtualmin)
- **Database:** MariaDB already installed and running on the server
- **CI/CD:** GitHub Actions builds Docker images; your server only pulls and restarts

---

## How it works

```
You push to GitHub main
        │
        ▼
GitHub Actions builds two Docker images:
  • teculiar-api   (NestJS + Prisma)
  • teculiar-web   (Next.js)
        │
        ▼
Images are pushed to GitHub Container Registry (ghcr.io — free, private)
        │
        ▼
GitHub Actions SSH-es into your server and runs:
  • docker compose pull   → downloads the new images
  • docker compose up -d  → restarts the containers
  • API container automatically runs database migrations on every start
        │
        ▼
Apache in Virtualmin (already running) proxies
  www.dezhost.com/api/  →  Docker container port 4000 (API)
  www.dezhost.com/      →  Docker container port 3000 (website)
```

---

## www vs. non-www — choose one and be consistent

Your site is `https://www.dezhost.com`. **Use `www.dezhost.com` everywhere** throughout this guide.

The rule to remember:
- `NEXT_PUBLIC_API_URL` and all URLs in `.env` → `https://www.dezhost.com`
- `COOKIE_DOMAIN` → `dezhost.com` (no www — this covers both www and non-www for cookies)
- `CORS_ORIGINS` → `https://www.dezhost.com`

In Virtualmin, make sure there is a redirect from `dezhost.com` (no www) → `https://www.dezhost.com`. Virtualmin usually sets this up automatically. If not, you can add it under **Servers → dezhost.com → Aliases and Redirects**.

---

## Part 1 — Prepare your GitHub repository

### 1.1 Make the repository private (recommended)

Images pushed to ghcr.io inherit the visibility of the repo. A private repo keeps your images private. In your GitHub repo: **Settings → General → Change repository visibility → Private**.

### 1.2 Add GitHub Secrets

Go to: **GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret**

Add these five secrets:

| Secret name           | What to put there |
|-----------------------|-------------------|
| `NEXT_PUBLIC_API_URL` | `https://www.dezhost.com/api/v1` |
| `SSH_HOST`            | Your server's IP address (e.g. `192.168.1.100`) |
| `SSH_USER`            | `deploy` (the user you created — see step 2.2) |
| `SSH_PRIVATE_KEY`     | The private key content — see step 2.3 |
| `GHCR_TOKEN`          | A GitHub token — see step 1.3 |

> **NEXT_PUBLIC_API_URL note:** Use `https://www.dezhost.com/api/v1` (with www, no trailing slash).
> This URL is baked into the Next.js browser bundle at build time so it must match exactly
> what the browser will call. Since your SSL certificate and Virtualmin are set up for
> `www.dezhost.com`, always use that form.

### 1.3 Create a GitHub Personal Access Token (PAT) for the server

Your server needs this token to download the private Docker images from GitHub.

1. Go to: **GitHub → top-right avatar → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a name like `dezhost-server-pull`
4. Under "Select scopes", tick only **`read:packages`** — nothing else
5. Click **Generate token**
6. **Copy the token immediately** (you can't see it again) and save it as the `GHCR_TOKEN` secret

### 1.4 Set your GitHub username in docker-compose.prod.yml

Open [docker-compose.prod.yml](docker-compose.prod.yml) and replace `YOUR_GITHUB_USERNAME` (appears twice) with your actual GitHub username:

```yaml
# Example — replace balsamico with your actual GitHub username
image: ghcr.io/balsamico/teculiar-api:latest
image: ghcr.io/balsamico/teculiar-web:latest
```

---

## Part 2 — Prepare your server

> All commands below run on your server, either as `root` or as the `deploy` user where noted.

### 2.1 Install Docker

```bash
# Run as root
dnf install -y dnf-utils device-mapper-persistent-data lvm2

dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo

dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
```

Verify it worked:
```bash
docker --version
docker compose version
```

### 2.2 Create the `deploy` user

You mentioned you already created a user called `deploy`. Here is how to set it up properly if you haven't already, and how to make sure it can run Docker:

```bash
# Run as root

# Create the user (skip if it already exists)
useradd -m -s /bin/bash deploy

# Add deploy to the docker group so it can run docker commands without sudo
usermod -aG docker deploy

# Create the app directory and give deploy ownership
mkdir -p /opt/dezhost
chown deploy:deploy /opt/dezhost
chmod 750 /opt/dezhost
```

> **Why the docker group?** Docker requires root by default. Adding `deploy` to the `docker`
> group lets it run `docker compose` without `sudo`, which is what the GitHub Actions
> deployment script does.

After adding the user to the docker group, the change takes effect on the **next login**. You may need to run `newgrp docker` or reconnect your SSH session.

### 2.3 Create the deploy SSH key

This key lets GitHub Actions log in to your server without a password.

**Step A — On your Mac (not the server), open Terminal and run:**

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/dezhost_deploy
```

Press Enter twice (no passphrase needed).

This creates two files:
- `~/.ssh/dezhost_deploy` — the **private key** (you paste this into GitHub)
- `~/.ssh/dezhost_deploy.pub` — the **public key** (you copy this to the server)

**Step B — Copy the public key content:**

```bash
cat ~/.ssh/dezhost_deploy.pub
```

This prints one long line that looks like this (yours will be different):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFh8... github-actions-deploy
```

**Select and copy that entire line** — from `ssh-ed25519` all the way to the end.

**Step C — On the server, paste it into the deploy user's authorized_keys:**

```bash
# Run as root (or as the deploy user if you can already SSH in)
su - deploy
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Paste the line you copied in the command below, replacing everything inside the quotes
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFh8... github-actions-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

> **Important:** The part starting with `AAAA...` is the actual cryptographic key content.
> Replace the example above with the full line that `cat ~/.ssh/dezhost_deploy.pub` printed.
> It is one long line — do not add any line breaks.

**Step D — Test the connection from your Mac:**

```bash
ssh -i ~/.ssh/dezhost_deploy deploy@YOUR_SERVER_IP
```

If you get a shell prompt, the key works. Type `exit` to leave.

**Step E — Add the private key to GitHub:**

```bash
# On your Mac
cat ~/.ssh/dezhost_deploy
```

Copy the entire output (including the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines) and paste it as the `SSH_PRIVATE_KEY` GitHub secret.

### 2.4 Create the environment file on the server

Log in to the server as the `deploy` user and create the configuration file:

```bash
cat > /opt/dezhost/.env << 'EOF'
# ── Database ────────────────────────────────────────────────────────────────
# host.docker.internal reaches MariaDB running on the host machine
DATABASE_URL=mysql://dezhost_user:STRONG_DB_PASSWORD@host.docker.internal:3306/dezhost_hosting

# ── App URLs ─────────────────────────────────────────────────────────────────
# Use https://www.dezhost.com everywhere (with www, no trailing slash)
APP_URL=https://www.dezhost.com
PUBLIC_WEB_URL=https://www.dezhost.com
PUBLIC_API_URL=https://www.dezhost.com/api/v1
NEXT_PUBLIC_API_URL=https://www.dezhost.com/api/v1
CORS_ORIGINS=https://www.dezhost.com
# COOKIE_DOMAIN has no www — it covers both www and non-www automatically
COOKIE_DOMAIN=dezhost.com

# ── JWT secrets ───────────────────────────────────────────────────────────────
# Generate these with: openssl rand -hex 64
JWT_ACCESS_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_STRING
JWT_REFRESH_SECRET=CHANGE_THIS_TO_ANOTHER_LONG_RANDOM_STRING
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# ── Emergency admin (first boot only) ────────────────────────────────────────
# Remove these lines after you have logged in for the first time
EMERGENCY_ADMIN_EMAIL=admin@dezhost.com
EMERGENCY_ADMIN_PASSWORD=CHANGE_THIS

# ── Email ─────────────────────────────────────────────────────────────────────
ADMIN_EMAIL=admin@dezhost.com
MAIL_FROM=noreply@dezhost.com

# ── Resell.biz ────────────────────────────────────────────────────────────────
RESELLBIZ_API_BASE_URL=https://httpapi.com
RESELLBIZ_RESELLER_ID=YOUR_RESELLER_ID
RESELLBIZ_API_KEY=YOUR_API_KEY
RESELLBIZ_DEFAULT_NS=ns1.dezhost.com,ns2.dezhost.com

# ── Virtualmin API ────────────────────────────────────────────────────────────
VIRTUALMIN_ADMIN_ENDPOINT=https://www.dezhost.com:10000
VIRTUALMIN_ADMIN_USERNAME=root
VIRTUALMIN_ADMIN_PASSWORD=YOUR_VIRTUALMIN_ROOT_PASSWORD
VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED=1

# ── Tax ───────────────────────────────────────────────────────────────────────
VAT_COUNTRY_CODE=DE
VAT_STANDARD_RATE=19

# ── Cron ──────────────────────────────────────────────────────────────────────
# Generate with: openssl rand -hex 32
CRON_SECRET=CHANGE_THIS_TO_A_RANDOM_STRING
EOF
```

Protect the file so only the deploy user can read it:

```bash
chmod 600 /opt/dezhost/.env
```

> **Tip:** Generate strong secrets with `openssl rand -hex 64` (for JWT) and
> `openssl rand -hex 32` (for CRON_SECRET). Run this command on your Mac or the server.

### 2.5 Copy docker-compose.prod.yml to the server

You edited [docker-compose.prod.yml](docker-compose.prod.yml) in step 1.4 to set your GitHub username.
Now copy it to the server from your **Mac**:

```bash
# The path below is YOUR LOCAL path to the project on your Mac
scp -i ~/.ssh/dezhost_deploy \
  "/Users/balsamico/code/New Dezhost/docker-compose.prod.yml" \
  deploy@YOUR_SERVER_IP:/opt/dezhost/docker-compose.prod.yml
```

> **What is that path?** `/Users/balsamico/code/New Dezhost/` is where your project
> lives on your Mac. The command copies the file to `/opt/dezhost/` on your server.
> If you move the project later, update the path accordingly.

### 2.6 Create the MariaDB database and user

On the **server**, connect to MariaDB as root and run:

```bash
mysql -u root -p
```

Then paste these SQL commands (replace `STRONG_DB_PASSWORD` with a real password that you also put in `.env`):

```sql
CREATE DATABASE dezhost_hosting CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'dezhost_user'@'%' IDENTIFIED BY 'STRONG_DB_PASSWORD';
GRANT ALL PRIVILEGES ON dezhost_hosting.* TO 'dezhost_user'@'%';
FLUSH PRIVILEGES;
EXIT;
```

> The `%` lets the Docker container connect from any IP. Docker containers get
> their own internal IP (e.g. `172.17.0.x`) so the user must be able to connect
> from more than just `localhost`.

**Make sure MariaDB listens on all network interfaces**, not just localhost:

```bash
grep -r "bind-address" /etc/my.cnf /etc/my.cnf.d/ 2>/dev/null
```

If the output shows `bind-address = 127.0.0.1`, open the config file and change it to:
```
bind-address = 0.0.0.0
```
Then restart MariaDB:
```bash
systemctl restart mariadb
```

### 2.7 Configure Apache in Virtualmin as a reverse proxy

**You do not need to install Nginx.** Virtualmin is already running Apache (or Nginx), and
your dezhost.com SSL certificate is already set up and auto-renewing through Virtualmin's
built-in Let's Encrypt integration. You only need to tell the existing web server to
forward traffic to the Docker containers.

**First, make sure Apache's proxy modules are enabled:**

```bash
httpd -M | grep proxy
```

You should see `proxy_module` and `proxy_http_module` in the output. If they are missing:

```bash
# The module config is in /etc/httpd/conf.modules.d/00-proxy.conf
# Uncomment or add these lines:
echo "LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so" \
  >> /etc/httpd/conf.modules.d/00-proxy.conf

systemctl restart httpd
```

**Then add the proxy configuration in Virtualmin:**

1. Log in to Virtualmin: `https://www.dezhost.com:10000`
2. In the left panel, click on the **dezhost.com** virtual server
3. Go to **Services → Configure Website** (or **Website → Apache Directives** depending on your Virtualmin version)
4. Look for a section called **"Directives and settings"** or **"Custom directives"** or an **"Apache Directives"** tab
5. Add the following lines in the field for the **SSL / port 443** virtual host:

```apache
ProxyPreserveHost On
ProxyRequests Off

# API requests go to the NestJS container on port 4000
ProxyPass /api/ http://127.0.0.1:4000/api/
ProxyPassReverse /api/ http://127.0.0.1:4000/api/

# Everything else goes to the Next.js container on port 3000
ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/
```

6. Click **Save** and then restart Apache:

```bash
systemctl restart httpd
```

> **Why not use Nginx here?** The file `nginx/dezhost.conf` in this repo is kept as
> a reference only — it shows the equivalent configuration if you ever want to use
> standalone Nginx. Since Virtualmin is already running Apache and managing your SSL
> certificates, there is no reason to add another web server.

> **About SSL:** Virtualmin's Let's Encrypt integration already issued and auto-renews
> the SSL certificate for `www.dezhost.com`. Apache in Virtualmin is already configured
> to use it. You do not need to run Certbot separately.

### 2.8 Open firewall ports

Only HTTP and HTTPS need to be publicly accessible. **Do not** open ports 3000 or 4000:

```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

---

## Part 3 — First deployment

### 3.1 Trigger the build

Push any commit to the `main` branch from your Mac:

```bash
cd "/Users/balsamico/code/New Dezhost"
git push origin main
```

Go to **GitHub → your repo → Actions** to watch the workflow run. It takes a few minutes:
1. Builds the API Docker image
2. Builds the Web Docker image (with your `NEXT_PUBLIC_API_URL` baked in)
3. Pushes both images to `ghcr.io`
4. SSHs into your server and runs `docker compose pull` + `docker compose up -d`

The API container automatically runs Prisma database migrations on startup — you do not have to do this manually.

### 3.2 Verify the deployment

On the server:

```bash
# See if both containers are running
docker compose -f /opt/dezhost/docker-compose.prod.yml ps

# Watch the API start up (shows migrations running, then server listening)
docker compose -f /opt/dezhost/docker-compose.prod.yml logs -f api

# Watch the web container
docker compose -f /opt/dezhost/docker-compose.prod.yml logs -f web
```

Then open `https://www.dezhost.com` in your browser.

---

## Part 4 — Everyday operations

### Deploy an update

Push to `main` — GitHub Actions handles everything automatically.

### View live logs

```bash
# Follow API logs
docker compose -f /opt/dezhost/docker-compose.prod.yml logs -f api

# Last 100 lines from web
docker compose -f /opt/dezhost/docker-compose.prod.yml logs --tail=100 web
```

### Restart a container manually

```bash
docker compose -f /opt/dezhost/docker-compose.prod.yml restart api
```

### Change an environment variable

1. Edit `/opt/dezhost/.env` on the server
2. Restart the container: `docker compose -f /opt/dezhost/docker-compose.prod.yml restart api`

### Roll back to a previous version

Every push is also tagged with its Git commit hash. To go back:

```bash
# On the server — edit /opt/dezhost/docker-compose.prod.yml
# Change :latest to the commit SHA you want, e.g.:
#   image: ghcr.io/balsamico/teculiar-api:a3f9c12
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
| `docker-compose.prod.yml` | Production containers config — runs on your server |
| `nginx/dezhost.conf` | Reference Nginx config (not used — you use Apache via Virtualmin) |

---

## Secrets checklist

| Where | Name | Value |
|-------|------|-------|
| GitHub Secrets | `NEXT_PUBLIC_API_URL` | `https://www.dezhost.com/api/v1` |
| GitHub Secrets | `SSH_HOST` | Your server IP |
| GitHub Secrets | `SSH_USER` | `deploy` |
| GitHub Secrets | `SSH_PRIVATE_KEY` | Contents of `~/.ssh/dezhost_deploy` |
| GitHub Secrets | `GHCR_TOKEN` | GitHub PAT with `read:packages` |
| Server `/opt/dezhost/.env` | all runtime config | See step 2.4 |

---

## Troubleshooting

**Containers exit immediately**
```bash
docker compose -f /opt/dezhost/docker-compose.prod.yml logs api
```
Usually means wrong `DATABASE_URL`. Check the host, port, username, and password.

**502 Bad Gateway from Apache**
The container isn't running yet or crashed. Run:
```bash
docker compose -f /opt/dezhost/docker-compose.prod.yml ps
docker compose -f /opt/dezhost/docker-compose.prod.yml logs api
```

**Cannot connect to MariaDB**
The Docker container can't reach MariaDB on the host. Check:
- `bind-address` is `0.0.0.0` in MariaDB config (step 2.6)
- The MariaDB user is created with `@'%'` not `@'localhost'`
- The password in `DATABASE_URL` matches what you set in MariaDB

**Next.js shows API errors in the browser**
The `NEXT_PUBLIC_API_URL` GitHub secret must exactly match the URL your browser uses to reach the API.
It was baked in at build time — if you change it, you must push a new commit to rebuild.

**Migrations fail**
Look at the API container logs. Common causes:
- MariaDB user lacks permissions (`GRANT ALL PRIVILEGES`)
- Wrong database name in `DATABASE_URL`

**Cannot push to ghcr.io in GitHub Actions**
Make sure the repo has "Read and write permissions" for the `GITHUB_TOKEN`:
**GitHub → repo → Settings → Actions → General → Workflow permissions → Read and write permissions**
