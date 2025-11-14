# Deployment Guide

This guide covers deploying the CTO application to production using Docker and a reverse proxy.

## Quick Start (TL;DR)

```bash
# 1. Configure production environment
cat > .env << EOF
VITE_API_URL=https://your-domain.com/api
VITE_SUPABASE_URL=https://your-domain.com/supabase
VITE_SUPABASE_ANON_KEY=your-key
# ... other vars
EOF

# 2. Build images (use --env-file to avoid .env.local conflicts)
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker-compose --env-file .env build

# 3. Save and transfer
docker save cto-api:latest | gzip > cto-api.tar.gz
docker save cto-web:latest | gzip > cto-web.tar.gz
scp cto-*.tar.gz user@server:~/cto/

# 4. On server: Load and start
ssh user@server
cd ~/cto
docker load < cto-api.tar.gz && docker load < cto-web.tar.gz
docker compose -f docker-compose.prod.yml up -d
```

## Prerequisites

- A server with Docker and Docker Compose installed (Ubuntu 20.04+ recommended)
- A domain name pointing to your server
- Supabase account and project
- OpenAI API key

## Environment Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd cto
```

### 2. Configure Environment Variables

⚠️ **Important**: There are TWO types of environment variables:

1. **Build-time variables (Frontend)** - Baked into the JavaScript bundle during `docker build`
   - `VITE_API_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - These go in the **root `.env`** file (used during image build)

2. **Runtime variables (API)** - Read when container starts
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `WEB_ORIGIN`
   - `GITHUB_PERSONAL_TOKEN`
   - etc.
   - These go in **`api/.env`** for local dev, or root `.env` on server

#### Local Development `.env` files

Root `.env` (for building web):

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
VITE_API_URL=https://your-domain.com/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

#### API `.env` (Backend Runtime Variables)

```bash
cp api/.env.example api/.env
```

Edit `api/.env` and set:

```env
OPENAI_API_KEY=sk-proj-your-openai-api-key
WEB_ORIGIN=https://your-domain.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-key
APIFY_API_TOKEN=apify_api_your-token (optional)
```

### 3. Configure Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Set **Site URL** to: `https://your-domain.com`
4. Add to **Redirect URLs**: `https://your-domain.com/**`

### 4. Set Up Database Schema

Run the SQL migrations in your Supabase SQL editor:

```bash
# In order:
supabase/migrations/supabase-migration-knowledge-base.sql
supabase/migrations/supabase-migration-compass-scores.sql
supabase/migrations/supabase-migration-assessments-hr.sql
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

### Option 1: Docker Compose (Recommended)

#### Build and Deploy Steps

1. **Set production environment variables** in your root `.env` file:

```bash
# Create/update .env file with PRODUCTION values
cat > .env << EOF
# Build-time variables for web frontend
VITE_API_URL=https://your-domain.com/api
VITE_SUPABASE_URL=https://your-domain.com/supabase
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Runtime variables for API (also needed during build)
OPENAI_API_KEY=your-openai-key
SUPABASE_URL=https://your-domain.com/supabase
SUPABASE_SECRET_KEY=your-supabase-service-role-key
WEB_ORIGIN=https://your-domain.com
APIFY_API_TOKEN=your-apify-token
GITHUB_PERSONAL_TOKEN=your-github-token
PORT=8080
ALLOW_FILE_STORE=false
SEED_JOBS_COUNT=30
UPLOAD_MAX_MB=3
EOF
```

⚠️ **CRITICAL**: If you have a `.env.local` file (for local development), it will override `.env`. Either:
- Delete `.env.local` before building for production, OR
- Use `--env-file .env` flag to explicitly specify which file to use

2. **Build the Docker images**:

```bash
# RECOMMENDED: Use docker-compose with explicit env file
# This ensures production .env is used (not .env.local)
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker-compose --env-file .env build

# If building on AMD64 Linux (cloud server), you can omit the platform flag:
docker-compose --env-file .env build
```

**Platform Notes:**
- **Apple Silicon (M1/M2/M3)**: MUST use `DOCKER_DEFAULT_PLATFORM=linux/amd64`
- **Cloud servers (AWS/DigitalOcean/etc)**: Usually AMD64, platform flag optional
- Web frontend requires build-time env vars (baked into JavaScript bundle)

3. **Save and transfer images to your server**:

```bash
# Save images to compressed tar files
docker save cto-api:latest | gzip > cto-api.tar.gz
docker save cto-web:latest | gzip > cto-web.tar.gz

# Check sizes (API ~98MB, Web ~20MB)
ls -lh cto-*.tar.gz

# Transfer to server
scp cto-api.tar.gz cto-web.tar.gz user@your-server:~/cto/
```

4. **On your production server**, load images and deploy:

```bash
# SSH to server
ssh user@your-server
cd ~/cto

# Load Docker images
docker load < cto-api.tar.gz
docker load < cto-web.tar.gz

# Start containers using docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d

# Verify containers are running
docker ps

# Cleanup tar files
rm -f cto-api.tar.gz cto-web.tar.gz
```

**Note**: Make sure you have `api/.env` on the server with runtime variables (OpenAI key, Supabase credentials, etc.)

### Option 2: Build on Server

1. **Transfer files to server**:

```bash
rsync -avz --exclude node_modules --exclude .git . user@your-server:~/cto/
```

2. **On your server**, build and start:

```bash
cd ~/cto
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## Reverse Proxy Setup

### Using Caddy (Recommended)

1. **Install Caddy** (if not already installed):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

2. **Create Caddyfile** (`/etc/caddy/Caddyfile`):

```caddy
your-domain.com {
    # API routes
    handle /api/* {
        reverse_proxy localhost:8080
    }

    # Frontend
    handle /* {
        reverse_proxy localhost:80
    }
}
```

3. **Reload Caddy**:

```bash
sudo systemctl reload caddy
```

### Using Nginx

1. **Create Nginx config** (`/etc/nginx/sites-available/cto`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # API
    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

2. **Enable and reload**:

```bash
sudo ln -s /etc/nginx/sites-available/cto /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

3. **Set up SSL with Certbot**:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Using Docker Networks (Advanced)

If you're running Caddy/Nginx in Docker alongside the CTO application, connect the containers to the same network:

```bash
# Check existing network (if using existing docker-compose setup)
docker network ls

# Connect your containers to the reverse proxy network
docker network connect <proxy-network-name> cto-api
docker network connect <proxy-network-name> cto-web
```

**Update your docker-compose.yml to automatically connect:**

```yaml
services:
  cto-api:
    image: cto-api:latest
    container_name: cto-api
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - WEB_ORIGIN=https://your-domain.com
      - PORT=8080
      - NODE_ENV=production
    networks:
      - proxy-network  # Connect to reverse proxy network
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  cto-web:
    image: cto-web:latest
    container_name: cto-web
    restart: unless-stopped
    depends_on:
      - cto-api
    networks:
      - proxy-network  # Connect to reverse proxy network

networks:
  proxy-network:
    external: true  # Use existing network
    name: n8n-docker-caddy_default  # Replace with your actual network name
```

**Update Caddyfile to use container names:**

```caddy
your-domain.com {
    # API routes
    handle /api/* {
        reverse_proxy cto-api:8080
    }
    
    # Frontend
    handle /* {
        reverse_proxy cto-web:80
    }
}
```

## Verification

1. **Check container status**:

```bash
docker ps
# Both cto-web and cto-api should show "Up" status
```

2. **Test API health**:

```bash
curl https://your-domain.com/api/health
# Should return: {"ok":true}
```

3. **Visit your domain**:

```
https://your-domain.com
```

## Troubleshooting

### Platform Mismatch Error

If you see this error on the server:
```
The requested image's platform (linux/arm64) does not match the detected host platform (linux/amd64)
```

**Solution:** Rebuild images with `--platform linux/amd64` flag:
```bash
docker build --platform linux/amd64 -t cto-api:latest -f api/Dockerfile .
docker build --platform linux/amd64 -t cto-web:latest -f web/Dockerfile .
```

This is especially important when building on Apple Silicon Macs (M1/M2/M3).

### Containers Keep Restarting

```bash
# Check logs
docker logs cto-api
docker logs cto-web

# Common issues:
# - Platform mismatch: Use --platform linux/amd64 flag when building
# - Environment variables not set: Check .env files
# - Port conflicts: Ensure ports 80 and 8080 are available
```

### 502 Bad Gateway

```bash
# Check if containers are running
docker ps | grep cto

# Check if containers are on the same network as reverse proxy
docker network ls
docker network inspect <network-name>

# Reconnect if needed
docker network connect <network-name> cto-api
docker network connect <network-name> cto-web

# Restart reverse proxy
sudo systemctl reload caddy
# or
sudo systemctl reload nginx
```

### Authentication Redirects to Localhost

- Verify Supabase URL configuration includes your production domain
- Check that `VITE_API_URL` and `WEB_ORIGIN` are set correctly

### Frontend Shows "localhost:8080" in Browser Console Errors

This means the web image was built with the wrong `VITE_API_URL`. The frontend tries to call `http://localhost:8080/api` instead of your production API URL.

**Root Cause**: `.env.local` overrode `.env` during build, or build args weren't passed correctly.

**Solution**:

```bash
# Option 1: Temporarily remove .env.local before building
mv .env.local .env.local.backup
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker-compose --env-file .env build web
mv .env.local.backup .env.local

# Option 2: Explicitly use .env file (recommended)
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker-compose --env-file .env build web

# Verify the build used correct URL by checking the built files
docker run --rm cto-web:latest cat /usr/share/nginx/html/assets/index-*.js | grep -o 'VITE_API_URL[^"]*'

# Save and transfer the corrected image
docker save cto-web:latest | gzip > cto-web.tar.gz
scp cto-web.tar.gz user@your-server:~/cto/

# On server: Load and restart
docker load < cto-web.tar.gz
docker compose -f docker-compose.prod.yml down cto-web
docker compose -f docker-compose.prod.yml up -d cto-web
```

### CORS Errors in Browser Console

- Check that `WEB_ORIGIN` in `api/.env` matches your frontend URL
- Ensure API is accessible at the URL specified in `VITE_API_URL`
- Verify reverse proxy is correctly forwarding `/api/*` requests

## Updates and Maintenance

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild images
docker compose -f docker-compose.prod.yml build

# Restart containers
docker compose -f docker-compose.prod.yml up -d
```

### View Logs

```bash
# Follow all logs
docker compose logs -f

# Specific service
docker compose logs -f cto-api
```

### Backup Data

If using file-based storage (`ALLOW_FILE_STORE=true`):

```bash
# Backup volumes
docker run --rm -v cto_data:/data -v $(pwd):/backup ubuntu tar czf /backup/cto-backup.tar.gz /data
```

## Security Best Practices

1. **Use secrets management**: Consider using Docker secrets or environment files with restricted permissions
2. **Enable HTTPS**: Always use SSL/TLS in production (Caddy does this automatically)
3. **Regular updates**: Keep Docker images and system packages updated
4. **Firewall**: Only expose ports 80 and 443 to the internet
5. **Environment files**: Never commit `.env` files to version control

## Performance Optimization

1. **Enable caching** in your reverse proxy
2. **Use CDN** for static assets if needed
3. **Monitor resources**: Use `docker stats` to monitor container resource usage
4. **Scale**: Use Docker Swarm or Kubernetes for high-traffic deployments

## Support

For issues and questions:
- Check the [API Documentation](api/docs/API.md)
- Review [Examples](api/docs/EXAMPLES.md)
- Open an issue on GitHub
