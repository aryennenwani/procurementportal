# PeerIQ Procure — Vendor Quotation & Procurement Portal

A full-stack procurement platform that lets purchase managers raise sourcing
requirements, invite vendors to quote through unique no-login links, compare
bids side-by-side, and stay accountable through a built-in **anti-corruption
& partiality detection engine**, an **immutable audit trail**, and a
**permanent proposal archive**.

Every quotation a vendor submits is locked the moment it lands — there is no
edit or delete path anywhere in the system, by design.

---

## 1. Tech stack

| Layer       | Technology |
|-------------|------------|
| Frontend    | React 19 (Vite), React Router v7, Tailwind CSS v4, Axios, lucide-react |
| Backend     | Node.js, Express 4, express-validator |
| Database    | SQLite via `better-sqlite3` (WAL mode, foreign keys enforced) |
| Auth        | JWT (`jsonwebtoken`) + bcrypt password hashing for managers |
| Exports     | `json2csv` (CSV) and `pdfkit` (PDF, charcoal/gold branded) |
| Dev tooling | `concurrently` (run server + client together), `nodemon` |

---

## 2. Project structure

```
vendor-procurement-portal/
├── package.json              # root scripts (dev, server, client, seed, build)
├── .env / .env.example       # JWT_SECRET, PORT
├── server/
│   ├── index.js              # Express app, CORS, auto-seed, startup banner
│   ├── db.js                 # SQLite schema (9 tables) + connection
│   ├── seed.js               # Sample managers/vendors/requirements/quotes
│   ├── utils.js              # toIST(), nowUTC(), getClientIp()
│   ├── middleware/
│   │   ├── auth.js           # JWT verification (requireAuth)
│   │   └── audit.js          # recordAudit() + auditMiddleware (logs every request)
│   ├── services/
│   │   └── partiality.js     # Anti-corruption detection engine + health score
│   └── routes/
│       ├── auth.js           # POST /api/auth/login
│       ├── requirements.js   # CRUD, status, vendor assignment, quotations
│       ├── vendors.js        # vendor CRUD, win-rate stats, activity log
│       ├── vendorPortal.js   # PUBLIC: view + submit quotes via unique token
│       ├── quotations.js     # record win/not-selected outcomes
│       ├── archive.js        # permanent searchable proposal archive
│       ├── compliance.js     # health score, flags, leaderboard, audit reports
│       ├── auditLog.js       # filterable system-wide audit trail
│       └── exportRoutes.js   # per-requirement CSV / PDF comparison exports
└── client/
    └── src/
        ├── api/client.js               # Axios instance + interceptors
        ├── context/                    # AuthContext, ToastContext
        ├── components/                 # DashboardLayout, Badges, Common UI kit
        └── pages/
            ├── Login.jsx
            ├── manager/                # Overview, Requirements, RequirementDetail,
            │                           # Vendors, Archive, Compliance, AuditLog
            └── vendor/                 # VendorPortal, QuoteForm, ConfirmationScreen
```

---

## 3. Getting started

### 3.1 Prerequisites
- Node.js 18+ and npm

### 3.2 Install & configure

```bash
cd vendor-procurement-portal
npm install                 # installs server dependencies
npm install --prefix client # installs client dependencies
cp .env.example .env        # then edit the values below
cp client/.env.example client/.env
```

Open `.env` and fill in:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Long random string used to sign manager session tokens |
| `PORT` | API port (defaults to `4000`) |
| `DB_PATH` | Optional override for the SQLite file location (set automatically in production — see deployment section) |
| `FRONTEND_URL` | The client origin allowed by CORS (e.g. `http://localhost:5173`) |
| `GMAIL_USER` | The Gmail address the app will send mail **from** |
| `GMAIL_APP_PASSWORD` | A 16-character Gmail **App Password** (see below) — *not* your normal Gmail password |

#### Generating a Gmail App Password (required for real emails to send)

The portal sends real email through your Gmail account via SMTP
(`smtp.gmail.com:587`). Gmail will not accept your normal account password for
SMTP — you need a dedicated **App Password**:

1. Go to your [Google Account → Security](https://myaccount.google.com/security).
2. Turn on **2-Step Verification** if it isn't already enabled (App Passwords
   require it).
3. In the Google Account search bar, search for **"App Passwords"** and open
   that page.
4. Under "App name", type something recognizable like `Procurement Portal`
   and click **Create**.
5. Google will show you a **16-character password** (with spaces, e.g.
   `abcd efgh ijkl mnop`). Copy it — you won't be able to see it again.
6. Paste it into `.env` as `GMAIL_APP_PASSWORD` (spaces are fine either way),
   and set `GMAIL_USER` to the full Gmail address you generated it for.

If these variables are left blank, or Gmail rejects the credentials, the
portal **does not crash** — every send attempt is wrapped so that a failure is
caught, logged to the audit trail with action type `email_failed`, and the
underlying request (assigning a vendor, submitting a quote, etc.) completes
normally. You can verify this by checking the Audit Log for `email_failed`
entries after triggering an email-sending action without valid credentials.

### 3.3 Run it

```bash
npm run dev
```

This launches **both** the Express API (default `http://localhost:4000`) and
the Vite React client (`http://localhost:5173`) together via `concurrently`.

On first boot, if the database is empty, the server seeds **one** account —
the default manager login below — and nothing else. There is no demo data:
every requirement, vendor, quotation, flag, and log entry you see is something
you (or a vendor) actually created. This keeps the system trustworthy from
minute one — what's in the Compliance Dashboard and Audit Log is always real.

> Only ever need one side? `npm run server` or `npm run client` work
> independently. `npm run seed` re-runs the seed script manually (it skips
> seeding if data already exists).

### 3.4 Default login

```
Email:    admin@company.com
Password: admin123
```

---

## 4. Using the Manager Dashboard

Sign in at `http://localhost:5173/login`. The sidebar gives you six sections:

### Dashboard (Overview)
At-a-glance stats (open requirements, active vendors, pending quotations),
a circular **procurement health-score gauge**, recently created
requirements with status/risk badges, and any currently active partiality
flags.

### Requirements
- **Create a requirement**: title, description, quantity, unit, grade/spec,
  deadline, and notes.
- **Assign vendors**: open a requirement and pick from your vendor list —
  this is what generates the quote-submission opportunity on their portal.
- **Compare quotations**: once vendors respond, the detail page renders a
  side-by-side comparison table. The cheapest quote is highlighted in green
  with a **"LOWEST QUOTE"** tag.
- **Record an outcome**: mark a vendor's quote as *Won* or *Not Selected*
  (with a reason). A requirement can only have one winner, and a decision,
  once recorded, cannot be reversed.
- **Update status**: move a requirement through `Open → Pending → Closed`.
- **Export**: download the quotation comparison as **CSV** or a
  branded **PDF** at any time.
- If the detection engine finds something concerning, you'll see a banner:

  > ⚠️ **Partiality Risk Detected — Review flagged concerns before proceeding**

### Vendors
- **Add a vendor**: company name, contact person, email, phone, category.
  The system auto-generates a **unique UUID portal link**
  (`/vendor/<token>`) — copy it with one click and send it to the vendor by
  whatever channel you prefer (email, WhatsApp, etc.). No vendor login is
  required.
- Each vendor card shows their **win rate**, total bids, and a button to view
  their full **activity log** (link opens, quotes submitted, timestamps, IP).

### Proposal Archive
A permanent, read-only record of **every quotation ever submitted** —
immutable by design (no edit/delete endpoints exist anywhere in the system).
Search and filter by vendor, requirement, item, outcome, or date range.

### Compliance Dashboard
The home of the anti-corruption tooling:
- **Health score gauge** (0–100, with a Good / Fair / Needs Attention label).
- **Active flags list**, color-coded by risk level, each with a plain-English
  explanation of what was detected and why it matters.
- **Vendor leaderboard** — win rates and bid counts, so unusually dominant
  vendors stand out visually.
- **Investigate** any flagged requirement directly from this view.
- **Export an audit report** as CSV or PDF for offline review or escalation.

### Audit Log
A chronological, filterable, append-only log of *every* action taken in the
system — who did what, when (shown in IST, stored in UTC), and from which IP.
Filter by action type, actor, or date range; click a row to expand full
details. Nothing here can be edited or removed.

---

## 5. The Vendor Portal (secure, email-locked, no password)

When a manager assigns a vendor to a requirement, the vendor automatically
receives an email containing their **unique secure portal link**:

```
http://localhost:5173/vendor/<unique-token>
```

### 5.1 Email-verification gate

The link alone is **not enough** to view anything. The first time a browser
visits it (or whenever its session has expired), the portal shows:

> **"Enter your email address to access your portal"**

The visitor types the email address the link was sent to and clicks
**"Verify & Continue."** The server checks it against the vendor's registered
email:
- **Match** → a secure, `httpOnly` session cookie is issued (valid 24 hours)
  and the portal loads.
- **No match** → *"This link is not associated with that email address."*
  (deliberately vague — it never reveals whether the token itself is valid).
- **5 failed attempts from the same IP** → that IP is locked out for **1
  hour**, and a `vendor_access_brute_force` entry is written to the audit log.

This means a leaked or guessed link is useless without also knowing the
vendor's exact registered email — and every verification attempt, success or
failure, is recorded in that vendor's activity log.

### 5.2 Submitting and revising quotations

Once verified, the vendor sees their assigned requirements, each marked as
*already submitted* or with a **"Submit quotation"** button.

- **Quote form** — per-unit price, lead time, validity period, payment
  terms, and optional remarks. The total value is **auto-calculated** live
  (`quantity × per-unit price`).
- **Confirmation screen** — a clean summary of everything recorded, with the
  exact timestamp in IST.
- **Revisions** — while the requirement is still *Open*, the deadline hasn't
  passed, and no winner has been decided, the vendor can click **"Revise
  Offer"** to update their price and terms — up to **3 times**. Each revision
  is stored as a brand-new, immutable record (never an edit of the original),
  so the full bidding history is permanently preserved. The portal shows a
  live counter — *"Revisions used: X of 3"* — and the complete revision
  history with each price. Once the limit is reached, or the requirement
  closes, the button disappears and a *"Revision period closed"* message
  explains why.
- The manager is notified — both **in-app** and **by email** — every time a
  quotation is submitted or revised, including the new and previous price for
  revisions, so nothing slips by unnoticed.

Behind the scenes, the database allows multiple historical rows per
vendor/requirement but enforces, via a **partial unique index**
(`WHERE is_latest = 1`), that only one of them is ever the "current" bid —
guaranteeing the partiality engine, the comparison table, and every export
always reflect the vendor's most recent offer.

---

## 6. The Anti-Corruption & Partiality Detection Engine

Every time quotations for a requirement are viewed, the engine re-evaluates
five independent signals and (de-duplicated) persists any new flags:

| Signal | Risk | Trigger |
|---|---|---|
| **Price Outlier** | 🔴 HIGH | The winning quote is *not* the cheapest one submitted |
| **Vendor Win Rate** | 🔴 HIGH | A vendor has won **>60%** of their bids across **3+** submissions |
| **Quote Clustering** | 🟠 MEDIUM | Two vendors quote within ~1–2% of each other while every other bid is markedly higher (possible price coordination) |
| **Single Vendor** | ⚪ LOW | A requirement was sent to only one vendor — no competitive bidding |
| **Short Deadline** | ⚪ LOW | The response deadline was set less than **48 hours** after the requirement was created |

The overall **health score** starts at 100 and deducts points per active flag
(12 for HIGH, 6 for MEDIUM, 2 for LOW), normalized by the number of
requirements so the score stays meaningful as the system scales. Whenever a
HIGH-risk flag is active on a requirement, managers see the
**"⚠️ Partiality Risk Detected"** banner right where they're making decisions
— not buried in a separate report.

---

## 7. Data & immutability guarantees

- **Quotations cannot be edited or deleted** — there is no such route on the
  server, and the UI never offers one. A "revision" is never an update to an
  existing row; it is always a brand-new row (`revision_number`,
  `parent_quotation_id`, `is_latest`) linked back to the original, so the
  entire bidding history survives forever, immutable.
- **Outcomes are final** — a winner can be recorded once per requirement, and
  a decided quote cannot be re-decided.
- **The audit log and proposal archive are append-only** — every state change
  anywhere in the system is recorded with actor, timestamp (UTC stored, IST
  displayed), and IP address, and none of it can be altered after the fact.

This combination is what makes the Compliance Dashboard and Audit Log
trustworthy: the data they're built on can't quietly change underneath them.

---

## 7.5 SAP S/4HANA Purchase Order Integration

Selecting a winning bid automatically **raises a purchase order**:

1. An internal PO (`PO-<year>-<seq>`, e.g. `PO-2026-00001`) is created
   synchronously in the same flow as the award decision — it can never be lost,
   even if SAP is down.
2. If SAP is configured, the PO is pushed in the background to the standard
   S/4HANA OData service `API_PURCHASEORDER_PROCESS_SRV` (CSRF token handshake +
   `A_PurchaseOrder` POST). The SAP-assigned PO number is stored alongside the
   internal one.
3. Sync state is tracked per PO — `synced`, `pending`, `failed` (retryable from
   the UI), or `local` (SAP not configured). Failures record the exact SAP error
   and can be retried from the **Purchase Orders** page or the requirement page.

Configuration (all optional — leave `SAP_BASE_URL` empty to run portal-only):

| Variable | Meaning | Default |
|---|---|---|
| `SAP_BASE_URL` | S/4HANA host, e.g. `https://myhost.s4hana.cloud.sap` | — |
| `SAP_USERNAME` / `SAP_PASSWORD` | Communication user credentials | — |
| `SAP_CLIENT` | Optional `sap-client` number | — |
| `SAP_COMPANY_CODE` | Company code on the PO | `1000` |
| `SAP_PURCH_ORG` | Purchasing organization | `1000` |
| `SAP_PURCH_GROUP` | Purchasing group | `001` |
| `SAP_PLANT` | Receiving plant | `1000` |

Each vendor additionally needs an **SAP supplier code** (their vendor-master
number) before their POs can sync — set it when adding the vendor or later from
the Vendors page. A branded **PO PDF** (supplier block, item table, terms,
signature lines) can be downloaded for any PO regardless of SAP state.

---

## 8. Useful scripts (run from the project root)

| Command | What it does |
|---|---|
| `npm run dev` | Run API + client together (recommended) |
| `npm run server` | Run only the Express API |
| `npm run client` | Run only the Vite dev server |
| `npm run seed` | Seed the database (no-op if data already exists) |
| `npm run build` | Production-build the React client |

---

## 9. Deploying to production

### Backend (Railway)

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from
   GitHub** and select your repo. Railway detects `railway.toml` and uses
   Nixpacks to build and run the API automatically.
2. Add environment variables under **Variables**:
   ```
   JWT_SECRET = any long random string
   NODE_ENV = production
   GMAIL_USER = your gmail
   GMAIL_APP_PASSWORD = your app password
   FRONTEND_URL = your Vercel URL
   DB_PATH = /data/procurement.db
   ```
3. Go to **Settings → Add Volume** and mount it at `/data` — this gives the
   SQLite file persistent storage across deploys and restarts.
4. Deploy, then copy your Railway URL — you'll need it as `VITE_API_URL`
   when you deploy the frontend.

### Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → **New Project** → import the same
   GitHub repo, with `client/` as the root directory.
2. Add the environment variable `VITE_API_URL` pointing at your Railway
   backend URL.
3. Deploy, then copy your Vercel URL back into the backend's `FRONTEND_URL`
   variable on Railway (for CORS and email links) and redeploy the backend.

### General notes

- Replace the development `JWT_SECRET` in `.env` with a long random secret.
- Consider moving from SQLite to a managed database if you expect high
  concurrent write volume (the schema and queries are plain SQL and port
  cleanly).
- Railway's mounted volume at `/data` already persists the SQLite file across
  deploys — back it up regularly anyway, since it is your permanent audit and
  archive record.
