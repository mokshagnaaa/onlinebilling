# Uhaas Beauty Studio Billing

A full React + Vite beauty-studio billing application with a green-and-white UI, Supabase Auth, PostgreSQL data storage, Row Level Security, atomic gift-card redemption, invoice printing/PDF download, reports, and a browser-only demo mode.

## What is included

- Supabase-backed email/password registration and login, email confirmation, password-reset links, logout, and profile/password updates.
- Dashboard figures that are calculated from saved bills and line items.
- Service catalogue with price editing and active/inactive status.
- Normal/custom-service billing, automatic totals, line discounts, invoice preview, printing, and PDF download.
- Gift card creation, partial redemption, transaction history, and separate physical/gift-card collection accounting.
- Date-range reports, CSV export, and print-friendly reports.
- `supabase/schema.sql`: tables, indexes, RLS policies, seed services, and secure PostgreSQL RPCs.
- Tests for calculations, reporting, discounts, and partial gift-card redemption.

## Run locally on Windows

1. Install Node.js 20+.
2. In PowerShell, open this folder and install the dependencies:

   ```powershell
   npm.cmd install
   ```

3. Copy `.env.example` to `.env.local` and set the two browser-safe values from your Supabase project:

   ```powershell
   Copy-Item .env.example .env.local
   ```

4. Start the development server:

   ```powershell
   npm.cmd run dev
   ```

5. Open the localhost URL Vite displays. `npm.cmd start` starts the same frontend server if you prefer the standard start command.

Without `.env.local`, the login screen provides **Explore the live demo**. It is intentionally browser-only and lets you verify the UI and every workflow before connecting Supabase.

## Set up Supabase

1. Create a new Supabase project.
2. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).

If the database was set up before bill deletion or gift-card number collision handling was added, run the updated schema again so the transactional functions and their permissions are installed. Gift card issuance now skips card numbers that already exist, so cards can continue to be generated safely on an existing database.
3. In **Authentication → URL Configuration**, set:

   - Site URL: your production URL, for example `https://your-app.vercel.app`
   - Redirect URLs: `http://localhost:5173` and your production URL

4. In **Authentication → Providers → Email**, enable email/password sign-in and enable email confirmation.
5. Register the first app user through the UI and confirm their email. Then promote that user to an administrator in the SQL Editor (replace the email):

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'your-admin@example.com');
   ```

   This manual bootstrap is intentional: new browser-created users cannot promote themselves to administrators.

6. From **Project Settings → API**, copy your Project URL and publishable key into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Configure authentication email

Configure a custom SMTP provider in **Authentication → SMTP Settings** if you need production delivery. Put SMTP credentials only in Supabase's server-side dashboard—not in `.env.local`, Git, or the React source. Use the email templates there for confirmation and password-reset links. The included app uses Supabase Auth's secure email verification and reset links.

> The Gmail app password shared in the original request should be revoked and regenerated in the Google account. It is a secret and is not included in this project.

## Database safety model

All exposed tables have RLS enabled. Normal users receive the `staff` role; only `admin` profiles can read/manage business data. The client never receives a service-role key.

`create_bill` is a `SECURITY DEFINER` function that recalculates totals on the database, locks the gift card row with `FOR UPDATE`, inserts the bill and its items, deducts the card, and records the redemption as one transaction. This prevents negative balances and concurrent double spending.

## Validate

```powershell
npm.cmd run test
npm.cmd run build
```

## Deploy free on Vercel

1. Push this folder to a GitHub repository.
2. Import it into Vercel; it detects Vite automatically.
3. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL` in Vercel's Environment Variables.
4. Deploy, then add the resulting Vercel URL to Supabase Auth's Site URL and Redirect URLs.

Do not add a Supabase `service_role` key to Vercel frontend variables.
