# VictorySync Deployment Guide

This guide covers deploying VictorySync outside of Replit to your own infrastructure.

---

## Option A - Vercel

This repo includes `vercel.json` for Vercel:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @workspace/leadgen build`
- Output directory: `artifacts/leadgen/dist/public`
- API routes: `/api/*` handled by `api/[...path].ts`, which delegates to the Express app
- SPA fallback: non-API routes rewrite to `/index.html`

### Steps

1. Push this repository to GitHub.
2. In Vercel, choose **Add New Project** and import the repo.
3. Keep the root directory as the repository root.
4. Add environment variables in Vercel Project Settings:
   ```
   DATABASE_URL=<your_supabase_pooler_connection_string>
   SESSION_SECRET=<random 64 chars>
   NODE_ENV=production
   BASE_PATH=/
   APP_URL=https://your-vercel-domain.vercel.app
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=<your_supabase_anon_key>
   SUPABASE_SERVICE_ROLE_KEY=<your_supabase_service_role_key>
   SUPABASE_AUTH_REQUIRED=true
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=<your_supabase_anon_key>
   ```
   Add OAuth variables from `.env.example` only for providers you plan to use.
5. Deploy.
6. Run database migrations once from your machine or another trusted shell:
   ```bash
   DATABASE_URL=<your_supabase_pooler_connection_string> pnpm --filter @workspace/db run push
   ```

For Supabase Postgres, copy the **Connection Pooler** URI from the Supabase Connect panel and use it as `DATABASE_URL`; replace the password placeholder with your database password. In Supabase Auth settings, add your Vercel URL to allowed redirect/site URLs. Update OAuth callback URLs to `https://yourdomain.com/api/oauth/<provider>/callback`.

Supabase Auth public signups should stay disabled. Create the first admin user manually in Supabase **Authentication > Users**, then sign in and use **Team > Invite Member** to issue single-use invite codes tied to a specific name and email. After pulling changes that add new tables, run the DB push command again so the `invite_codes` table exists.

---

## Option B — Railway (Recommended, ~5 min)

Railway handles PostgreSQL, builds, and deploys automatically from GitHub.

### Steps

1. **Push to GitHub**
   ```bash
   git init && git add . && git commit -m "initial"
   git remote add origin https://github.com/YOUR_USERNAME/victorysync.git
   git push -u origin main
   ```

2. **Create a Railway project**
   - Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
   - Select your repo

3. **Add a PostgreSQL database**
   - In your Railway project → New → Database → PostgreSQL
   - Railway auto-sets `DATABASE_URL` in your service

4. **Set environment variables** in Railway → Variables:
   ```
   SESSION_SECRET=<random 64 chars>
   NODE_ENV=production
   PORT=8080
   BASE_PATH=/
   ```
   Add any OAuth credentials from `.env.example` as needed.

5. **Run DB migrations** (one-time, from Railway shell or locally):
   ```bash
   DATABASE_URL=<your_railway_db_url> pnpm --filter @workspace/db run push
   ```

6. Railway auto-detects the `Dockerfile` and deploys. Done!

---

## Option C — Render (Free tier available)

1. Connect your GitHub repo at [render.com](https://render.com) → New Web Service
2. Choose **Docker** as runtime (Render reads your Dockerfile)
3. Add a PostgreSQL database service in Render
4. Set environment variables (same as Railway above)
5. Run migrations with Render's shell or a one-off job

---

## Option D — Docker on any VPS (DigitalOcean, Linode, etc.)

### Requirements
- A Linux server with Docker + Docker Compose installed
- A domain name (optional but recommended)

### Steps

```bash
# 1. SSH into your server
ssh user@your-server-ip

# 2. Clone your repo
git clone https://github.com/YOUR_USERNAME/victorysync.git
cd victorysync

# 3. Copy and fill in environment variables
cp .env.example .env
nano .env   # Fill in DATABASE_URL, SESSION_SECRET, OAuth keys

# 4. Build and start everything
docker compose up -d --build

# 5. Run database migrations (first time only)
docker compose exec app sh -c "DATABASE_URL=$DATABASE_URL node -e \"
const { execSync } = require('child_process');
execSync('pnpm --filter @workspace/db run push', { stdio: 'inherit' });
\""
```

Your app is now running at `http://your-server-ip:8080`.

### Adding HTTPS with nginx + Let's Encrypt

```bash
apt install nginx certbot python3-certbot-nginx
certbot --nginx -d app.victorysync.io
```

Update nginx config to proxy to port 8080.

---

## Option E — Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login and create app
fly auth login
fly launch --no-deploy

# Add PostgreSQL
fly postgres create --name victorysync-db
fly postgres attach victorysync-db

# Set secrets
fly secrets set SESSION_SECRET=<random> NODE_ENV=production BASE_PATH=/

# Deploy
fly deploy
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | Random 64-char secret for sessions |
| `PORT` | ✅ | Server port (default 8080) |
| `NODE_ENV` | ✅ | Set to `production` |
| `GOOGLE_CLIENT_ID` | OAuth only | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth only | Google OAuth app client secret |
| `FACEBOOK_APP_ID` | OAuth only | Meta app ID |
| `FACEBOOK_APP_SECRET` | OAuth only | Meta app secret |
| `SLACK_CLIENT_ID` | OAuth only | Slack app client ID |
| `SLACK_CLIENT_SECRET` | OAuth only | Slack app client secret |
| `LINKEDIN_CLIENT_ID` | OAuth only | LinkedIn app client ID |
| `LINKEDIN_CLIENT_SECRET` | OAuth only | LinkedIn app client secret |

---

## Custom Domain

Once deployed, update your DNS:
```
CNAME  app  →  your-railway-or-render-url.com
```

Then update OAuth redirect URIs in each provider's developer portal to point to `https://app.victorysync.io/api/oauth/<provider>/callback`.

---

## Production Checklist

- [ ] `SESSION_SECRET` is a long random string (not a word)
- [ ] `DATABASE_URL` points to a persistent database (not Replit's ephemeral one)
- [ ] SSL/HTTPS is configured on your domain
- [ ] OAuth redirect URIs updated in each provider's developer portal
- [ ] DB migrations have been run: `pnpm --filter @workspace/db run push`
