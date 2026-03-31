# Deployment Guide

## Hosting

**Provider:** DigitalOcean
**Plan:** Basic Droplet (1 vCPU, 1 GB RAM, 25 GB SSD)
**Location:** Amsterdam (AMS3)
**OS:** Ubuntu 24.04 LTS
**Cost:** $6/mo

See [ADR-003](adr/003-hosting-digitalocean.md) for the decision rationale.

## 1. Create DigitalOcean droplet

1. Sign up at [digitalocean.com](https://www.digitalocean.com/) (credit card or PayPal)
2. Create a new project
3. Add your SSH key (Settings > Security > SSH Keys)
4. Create droplet:
   - Region: Amsterdam (AMS3)
   - Image: Ubuntu 24.04
   - Size: Basic > Regular > $6/mo (1 GB / 1 CPU / 25 GB SSD)
   - Authentication: SSH key
   - Hostname: `bots`
5. Note the droplet IP address

## 2. Initial server setup

SSH into the server:

```bash
ssh root@<SERVER_IP>
```

### Secure the server

```bash
# Update system
apt update && apt upgrade -y

# Create non-root user
adduser botuser
usermod -aG sudo botuser

# Copy SSH key to new user
mkdir -p /home/botuser/.ssh
cp ~/.ssh/authorized_keys /home/botuser/.ssh/
chown -R botuser:botuser /home/botuser/.ssh

# Disable root SSH login and password auth
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Set up firewall
ufw allow OpenSSH
ufw enable
```

Log out and reconnect as `botuser`:

```bash
ssh botuser@<SERVER_IP>
```

### Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add user to docker group (no sudo needed for docker commands)
sudo usermod -aG docker botuser

# Log out and back in for group change to take effect
exit
```

```bash
ssh botuser@<SERVER_IP>

# Verify
docker --version
docker compose version
```

## 3. Deploy the bot

### Clone the repo

```bash
mkdir -p ~/bots
cd ~/bots
git clone <YOUR_REPO_URL> property-bot
cd property-bot
```

### Configure environment

```bash
cat > .env << 'EOF'
BOT_TOKEN=<your-bot-token>
DB_PATH=data/property-bot.db
EOF
```

### Build and start

```bash
docker compose up -d --build
```

That's it. The bot is running.

## 4. Project files

The repo includes these Docker files:

### Dockerfile

Multi-stage build — installs all deps for compilation, then copies only the built JS and production deps into a slim image.

### docker-compose.yml

Single service with:

- `restart: unless-stopped` — auto-restarts on crash or reboot
- `./data:/app/data` volume — SQLite database persists across rebuilds
- Log rotation (10 MB max, 3 files)

### .dockerignore

Excludes node_modules, dist, .git, docs, tests from the build context for fast builds.

## 5. Deploy updates

Create a deploy script on the server:

```bash
cat > ~/bots/property-bot/deploy.sh << 'SCRIPT'
#!/bin/bash
set -e
cd ~/bots/property-bot
git pull
docker compose up -d --build
docker image prune -f
echo "Deployed successfully"
SCRIPT
chmod +x ~/bots/property-bot/deploy.sh
```

To deploy after pushing to git:

```bash
ssh botuser@<SERVER_IP> "~/bots/property-bot/deploy.sh"
```

## 6. Adding more bots

Each bot gets its own directory, Dockerfile, and compose file. Same pattern:

```bash
cd ~/bots
git clone <REPO_URL> my-other-bot
cd my-other-bot
# Create .env, then:
docker compose up -d --build
```

Each bot is fully isolated — own Node version, own dependencies, own container.

## 7. Monitoring & logs

```bash
# View running containers
docker ps

# View logs (follow)
cd ~/bots/property-bot
docker compose logs -f

# View logs (last 100 lines)
docker compose logs --tail 100

# Restart
docker compose restart

# Stop
docker compose down

# Resource usage
docker stats
```

## 8. Backups

SQLite database is at `~/bots/property-bot/data/property-bot.db`.

```bash
# Create backups directory
mkdir -p ~/backups

# Add to crontab (daily at 3 AM)
crontab -e
# Add this line:
0 3 * * * cp ~/bots/property-bot/data/property-bot.db ~/backups/property-bot-$(date +\%Y\%m\%d).db && find ~/backups -name "property-bot-*.db" -mtime +7 -delete
```

This keeps 7 days of backups and auto-deletes older ones.

## Quick reference

| Task                | Command                                                   |
| ------------------- | --------------------------------------------------------- |
| SSH into server     | `ssh botuser@<SERVER_IP>`                                 |
| View all containers | `docker ps`                                               |
| View logs           | `cd ~/bots/property-bot && docker compose logs -f`        |
| Restart bot         | `cd ~/bots/property-bot && docker compose restart`        |
| Stop bot            | `cd ~/bots/property-bot && docker compose down`           |
| Deploy update       | `ssh botuser@<SERVER_IP> "~/bots/property-bot/deploy.sh"` |
| Resource usage      | `docker stats`                                            |
| Disk usage          | `df -h`                                                   |
