const SEP = '═'.repeat(64);

console.log(`
${SEP}
  VENDOR PROCUREMENT PORTAL — DEPLOYMENT GUIDE
${SEP}

  BACKEND (Render)
  ----------------
  1. Push this repository to GitHub.
  2. In Render, click "New +" → "Blueprint" and select this repo —
     render.yaml at the project root configures the service for you.
  3. Set the secret environment variables on the service:
       GMAIL_USER          your Gmail address
       GMAIL_APP_PASSWORD  16-character Gmail App Password (see README)
       FRONTEND_URL        the Vercel URL from the frontend step below
     JWT_SECRET and DB_PATH are generated / set automatically.
  4. Deploy. Confirm GET https://<your-service>.onrender.com/health
     responds with { "status": "ok", "timestamp": ... }.

  FRONTEND (Vercel)
  -----------------
  1. Import this repository in Vercel, set the root directory to "client".
  2. Add an environment variable:
       VITE_API_URL = https://<your-service>.onrender.com
  3. Deploy. vercel.json already rewrites all routes to index.html so
     client-side routing (e.g. /vendor/:token) works on refresh.
  4. Copy the resulting Vercel URL back into the backend's FRONTEND_URL
     environment variable on Render and redeploy the backend so CORS
     and email links point at the live frontend.

${SEP}
`);
