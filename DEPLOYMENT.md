# Deployment Guide

This guide covers deploying the CTO application to production using Docker and a reverse proxy.

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

#### Root `.env` (Web Frontend Build Variables)

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

#### Local Build and Deploy

1. **Build the images** (on a machine with the same architecture as your server):

```bash
# For AMD64 servers (most cloud providers)
docker build \
  --platform linux/amd64 \
  --build-arg VITE_API_URL=https://your-domain.com/api \
  --build-arg VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
  --build-arg VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY} \
  -t cto-web:latest \
  -f web/Dockerfile .

docker build \
  --platform linux/amd64 \
  -t cto-api:latest \
  -f api/Dockerfile .
```

2. **Save and transfer images**:

```bash
docker save cto-web:latest | gzip > cto-web.tar.gz
docker save cto-api:latest | gzip > cto-api.tar.gz

scp cto-web.tar.gz user@your-server:~/
scp cto-api.tar.gz user@your-server:~/
scp docker-compose.prod.yml user@your-server:~/docker-compose.yml
scp .env user@your-server:~/
```

3. **On your server**, load and start:

```bash
docker load < cto-web.tar.gz
docker load < cto-api.tar.gz
docker compose up -d
```

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

If you're running Caddy/Nginx in Docker, connect the containers:

```bash
# Create a shared network (or use existing one)
docker network create proxy

# Connect your containers
docker network connect proxy cto-api
docker network connect proxy cto-web

# Update Caddyfile to use container names
your-domain.com {
    handle /api/* {
        reverse_proxy cto-api:8080
    }
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

### Containers Keep Restarting

```bash
# Check logs
docker logs cto-api
docker logs cto-web

# Common issues:
# - Platform mismatch: Use --platform linux/amd64 flag when building
# - Environment variables not set: Check .env files
```

### 502 Bad Gateway

```bash
# Check if containers are on the same network as reverse proxy
docker network ls
docker network inspect <network-name>

# Reconnect if needed
docker network connect <network-name> cto-api
docker network connect <network-name> cto-web
```

### Authentication Redirects to Localhost

- Verify Supabase URL configuration includes your production domain
- Check that `VITE_API_URL` and `WEB_ORIGIN` are set correctly

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
