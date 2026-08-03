# Trading Journal

A TradeZella-style trading calendar. Log each day's P&L, trade count and notes; the
calendar colours itself green/red and the dashboard recalculates instantly.

Pure HTML + CSS + vanilla ES modules, with Supabase as the backend. No build step,
no server, no framework — drop it on Vercel and it works.

---

## What's inside

```
trading-journal/
├── index.html
├── vercel.json
├── css/
│   ├── style.css        design tokens, buttons, fields, auth screen, toasts
│   ├── dashboard.css    statistics cards
│   ├── calendar.css     month grid + day cells
│   └── modal.css        add/edit dialog
├── js/
│   ├── config.js        ← your Supabase URL + anon key go here
│   ├── supabase.js      client, auth, all CRUD
│   ├── utils.js         dates, money formatting, DOM + toast helpers
│   ├── calendar.js      month grid rendering & navigation
│   ├── statistics.js    metric calculation + dashboard rendering
│   ├── modal.js         add / edit / delete dialog
│   └── app.js           entry point, state owner, wiring
├── sql/
│   └── schema.sql       table, indexes, trigger, RLS policies
└── assets/
```

---

## Setup

### 1. Create a Supabase project

1. Go to **https://supabase.com/dashboard** and sign up (free tier is plenty).
2. **New project** → give it a name, set a database password, pick a region near you.
3. Wait ~2 minutes for it to provision.

### 2. Create the table

1. In your project, open **SQL Editor → New query**.
2. Paste the entire contents of `sql/schema.sql` and click **Run**.
3. You should see `Success. No rows returned`.

This creates `public.trading_days`, the `updated_at` trigger, and the four RLS
policies that scope every row to its owner.

### 3. Get your credentials

Supabase issues these — nobody can generate them for you.

1. **Project Settings → API** (newer dashboards: **Project Settings → Data API** for
   the URL, and **API Keys** for the key).
2. Copy two values:

| Dashboard label            | Looks like                              | Goes into           |
| -------------------------- | --------------------------------------- | ------------------- |
| Project URL                | `https://abcdefghijkl.supabase.co`      | `SUPABASE_URL`      |
| `anon` / `public` API key  | `eyJhbGciOiJIUzI1NiIsInR5cCI6…` (long)  | `SUPABASE_ANON_KEY` |

3. Open `js/config.js` and paste them in:

```js
export const SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6...';
```

> **Is it safe to commit the anon key?** Yes. The anon key is designed to ship in
> frontend code — it only grants what your RLS policies allow. **Never** put the
> `service_role` key here; that one bypasses RLS entirely.

### 4. Auth settings

**Authentication → Providers → Email** is on by default.

- **Fastest start (personal use):** turn **Confirm email** *off*
  (Authentication → Sign In / Providers → Email). You can then sign up and be
  logged in immediately.
- **Leaving it on:** you'll get a confirmation email; click the link, then sign in.

Once deployed, add your Vercel URL under **Authentication → URL Configuration →
Site URL / Redirect URLs** so confirmation links come back to the right place.

### 5. Run it locally

ES modules need to be served over HTTP — opening `index.html` with `file://` will fail.

```bash
cd trading-journal

# any one of these
python3 -m http.server 5173
npx serve .
npx http-server -p 5173
```

Then open <http://localhost:5173>.

---

## Deploy to Vercel

**Option A — drag & drop**

1. Go to <https://vercel.com/new>.
2. Drag the `trading-journal` folder in.
3. Framework preset: **Other**. Build command: *(empty)*. Output directory: `./`
4. Deploy.

**Option B — Git**

```bash
cd trading-journal
git init && git add . && git commit -m "Trading journal"
git remote add origin https://github.com/<you>/trading-journal.git
git push -u origin main
```

Then **Import Project** on Vercel and pick the repo. `vercel.json` is already set up
for a static deploy.

**Option C — CLI**

```bash
npm i -g vercel
cd trading-journal
vercel --prod
```

After deploying, add the live URL to Supabase → **Authentication → URL Configuration**.

---

## Using it

| Action | How |
| --- | --- |
| Log a day | Click any date cell, or **+ Log day** |
| Edit a day | Click a coloured cell — the form pre-fills |
| Delete | Open the day → **Delete** |
| Change month | ◀ ▶ buttons, or **←** / **→** arrow keys |
| Jump to today | **Today** button, or press **T** |
| Save from keyboard | **Cmd/Ctrl + Enter** inside the dialog |
| Close dialog | **Esc**, or click the backdrop |

Enter losses with a minus sign (`-555`). The **Make negative / Make positive** chips
flip the sign if you forget.

Cells with notes show a small dot in the corner; hover any cell for the full figure
and note text.

### Colour coding

| Cell | Meaning |
| --- | --- |
| Green | Profitable day |
| Red | Losing day |
| Grey | Break-even day (P&L exactly 0) |
| White | No entry |

---

## Dashboard metrics

| Metric | Definition |
| --- | --- |
| Total Profit | Sum of every positive day |
| Total Loss | Sum of every negative day |
| Net P&L | Total Profit − Total Loss |
| Trading Days | Days with an entry |
| Winning / Losing / Break-even Days | Days where P&L is > 0 / < 0 / = 0 |
| Total Trades | Sum of `trade_count` |
| Avg Profit / Win Day | Total Profit ÷ Winning Days |
| Avg Loss / Loss Day | Total Loss ÷ Losing Days |
| Avg P&L / Day | Net P&L ÷ Trading Days |
| Win Rate | Winning Days ÷ (Winning + Losing Days) — break-even days excluded |

Toggle **All time / This view** under the cards to scope the stats to the month
currently on screen. Everything recalculates automatically after any save,
update or delete.

---

## Function reference

| Function | File | Purpose |
| --- | --- | --- |
| `initializeSupabase()` | `supabase.js` | Creates the memoised client |
| `loadTradingDays(range?)` | `supabase.js` | Fetch rows (RLS scopes to the user) |
| `saveTradingDay(payload)` | `supabase.js` | Insert |
| `updateTradingDay(id, payload)` | `supabase.js` | Update by id |
| `upsertTradingDay(payload)` | `supabase.js` | Insert-or-update on `(user_id, trade_date)` |
| `deleteTradingDay(id)` | `supabase.js` | Delete by id |
| `signIn` / `signUp` / `signOut` / `onAuthChange` | `supabase.js` | Auth |
| `loadCalendar(handlers)` | `calendar.js` | Build the grid shell + bind nav |
| `renderCalendarData(map)` | `calendar.js` | Paint P&L into cells |
| `goToMonth` / `goToToday` | `calendar.js` | Navigation |
| `calculateStatistics(records)` | `statistics.js` | Pure metric calculation |
| `renderStatistics(stats)` | `statistics.js` | Write metrics to the DOM |
| `openTradeModal(iso, record?)` | `modal.js` | Open add/edit dialog |
| `refreshCalendar()` | `app.js` | Reload from DB → repaint grid + stats |

---

## Customising

**Week starts on Monday** — `js/config.js`:

```js
export const APP_CONFIG = { weekStartsOn: 1, currency: 'USD', locale: 'en-US' };
```

**Different currency** — same file, e.g. `currency: 'INR', locale: 'en-IN'`.
All formatting flows through `Intl.NumberFormat`, so cells, stats and tooltips
update together.

**Colours** — every colour is a CSS variable at the top of `css/style.css`
(`--profit`, `--loss`, `--brand`, radii, shadows). Change them there once.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Supabase is not configured" | You haven't replaced the placeholders in `js/config.js` |
| "The `trading_days` table is missing" | Run `sql/schema.sql` in the SQL editor |
| "Permission denied" / rows never appear | RLS policies weren't created — re-run `sql/schema.sql` |
| Blank page, console shows CORS/module errors | You opened `index.html` via `file://`. Serve it over HTTP |
| "Please confirm your email address first" | Click the link in your inbox, or disable **Confirm email** in Supabase |
| Signed up but stuck on the auth screen | Email confirmation is on — confirm, then sign in |
| Dates appear one day off | Shouldn't happen — all dates are handled as local calendar dates. If it does, check your device timezone |

---

## Notes

- Data is fetched once per refresh and cached in memory, so month navigation and
  the stats toggle are instant with no extra round trips.
- The database enforces one entry per user per day (`unique (user_id, trade_date)`),
  so duplicates are impossible even across two open tabs.
- The Supabase SDK is loaded from jsDelivr as an ES module — no `npm install`,
  no bundler.
