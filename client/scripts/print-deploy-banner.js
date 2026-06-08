const SEP = '═'.repeat(64);

console.log(`
${SEP}
  VENDOR PROCUREMENT PORTAL — DEPLOYMENT GUIDE
${SEP}

  BACKEND (Railway)
  -----------------
  1. Push this repository to GitHub.
  2. In Railway, click "New Project" → "Deploy from GitHub" and select
     this repo — railway.toml at the project root configures the
     service for you.
  3. Add environment variables on the service:
       JWT_SECRET          any long random string
       NODE_ENV            production
       GMAIL_USER          your Gmail address
       GMAIL_APP_PASSWORD  16-character Gmail App Password (see README)
       FRONTEND_URL        the Vercel URL from the frontend step below
       DB_PATH             /data/procurement.db
  4. Go to Settings → Add Volume and mount it at /data so the SQLite
     file persists across deploys.
  5. Deploy. Confirm GET https://<your-service>.up.railway.app/health
     responds with { "status": "ok", "timestamp": ... }.

  FRONTEND (Vercel)
  -----------------
  1. Import this repository in Vercel, set the root directory to "client".
  2. Add an environment variable:
       VITE_API_URL = https://<your-service>.up.railway.app
  3. Deploy. vercel.json already rewrites all routes to index.html so
     client-side routing (e.g. /vendor/:token) works on refresh.
  4. Copy the resulting Vercel URL back into the backend's FRONTEND_URL
     environment variable on Railway and redeploy the backend so CORS
     and email links point at the live frontend.

${SEP}
`);
