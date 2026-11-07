# Installing OpenPlate (runbook for AI agents)

This file is written for an AI coding agent (Claude Code, Codex, Cursor,
Gemini CLI, …) to follow step by step, with the human only stepping in to
log in or click a link. A person can follow it too.

**Goal:** the owner ends up with their own private OpenPlate at
`https://<something>.vercel.app`, on their own free Supabase and Vercel
accounts, with an MCP connector URL they can add to any AI chat.

**Cost:** $0. Supabase free tier + Vercel Hobby tier are enough for one
person or a household.

> Agent rules for this runbook
> - Ask the owner for anything personal (email, time zone) instead of guessing.
> - Never print or commit secrets (database password, access tokens, agent
>   keys) into the repo. `.env` is git-ignored; keep it that way.
> - When a step needs the human (logging in, clicking an email link), say
>   exactly what to do and wait.
> - Each step says how to check it worked. Don't move on until it does.

---

## 0. Ask the owner three things

1. **Email** they'll sign in with (becomes the only allowed account).
2. **Time zone** as an IANA name, e.g. `America/New_York`, `Europe/London`,
   `Asia/Karachi`. Offer the machine's zone as the default
   (`node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"`).
3. **Their GitHub username**, if they want their own copy of the repo
   (recommended: Vercel then redeploys on every push, and they can customise).

## 1. Get the code

Preferred: the owner's own copy, so Vercel can deploy from it.

```bash
# with the GitHub CLI (asks the owner to log in if needed)
gh repo fork farhan1301/openplate --clone --remote
cd openplate
```

No `gh`? Ask the owner to click **Fork** (or **Use this template**) on
GitHub, then `git clone https://github.com/<their-username>/openplate`.

```bash
npm install
```

Check: `npm run build` succeeds.

## 2. Create the Supabase project

Pick whichever tool you have, in this order:

**A. Supabase MCP server** (if you have `create_project` / `apply_migration`
tools): list organizations, check the cost with the cost tool (free tier
shows $0), create a project named `openplate` in the region closest to the
owner, and wait until its status is `ACTIVE_HEALTHY`.

**B. Supabase CLI**

```bash
npx supabase login                     # opens the browser; owner logs in
npx supabase orgs list
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')   # keep in memory only
npx supabase projects create openplate --org-id <org-id> \
  --db-password "$DB_PASSWORD" --region <closest region, e.g. us-east-1>
npx supabase projects list            # note the REFERENCE ID
```

**C. Dashboard:** ask the owner to create a project at
https://supabase.com/dashboard/new and give you the project ref (the
`xxxx` in `https://xxxx.supabase.co`) and the database password.

New projects take 1–2 minutes before they accept connections.

## 3. Create the database

Apply every file in `supabase/migrations/` **in filename order**. They are
idempotent, so re-running is safe.

**A. Supabase MCP:** for each file, `apply_migration` with the file name
(without `.sql`) as the name and the file contents as the query.

**B. Supabase CLI:**

```bash
npx supabase link --project-ref <ref> --password "$DB_PASSWORD"
npx supabase db push
```

Then set the owner's time zone and allow their email (MCP `execute_sql`,
the dashboard SQL editor, or `psql`):

```sql
update public.meals_settings set timezone = '<IANA time zone>' where id = 1;
insert into public.meals_allowlist (email) values (lower('<owner email>'))
on conflict (email) do nothing;
```

Check:

```sql
select public.meals_tz();                         -- the owner's zone
select count(*) from public.ingredient_categories; -- 12
select email from public.meals_allowlist;          -- the owner's email
```

## 4. Get the API URL and key

- MCP: `get_project_url` and `get_publishable_keys` (use the publishable
  key, or the legacy `anon` key).
- CLI: `npx supabase projects api-keys --project-ref <ref>`; the URL is
  `https://<ref>.supabase.co`.

These two values are **public by design** (they ship in the browser
bundle). Row Level Security and the allowlist protect the data. Never use
the `service_role` / secret key anywhere in this app.

Write them to `.env` for local development:

```bash
cat > .env <<EOF
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable or anon key>
EOF
```

## 5. Deploy to Vercel

```bash
npx vercel login                          # owner logs in once
npx vercel link --yes --project openplate
for target in production preview development; do
  printf '%s' "https://<ref>.supabase.co" | npx vercel env add VITE_SUPABASE_URL $target
  printf '%s' "<key>"                      | npx vercel env add VITE_SUPABASE_ANON_KEY $target
done
npx vercel git connect                    # optional: redeploy on every push to main
npx vercel deploy --prod --yes
```

No CLI? Ask the owner to import their repo at https://vercel.com/new, add
the two environment variables, and press **Deploy**.

Note the production URL, e.g. `https://openplate-xyz.vercel.app`
(`npx vercel ls` or the deploy output). Call it `APP_URL` below.

Check: `curl -s -o /dev/null -w '%{http_code}' $APP_URL` prints `200`, and
`curl -s -X POST "$APP_URL/api/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
answers with an error saying an agent key is needed (that means the API is up).

## 6. Point Supabase Auth at the app

Magic-link emails must redirect back to `APP_URL`.

**With a Supabase access token** (`npx supabase login` stores one; or the
owner creates one at https://supabase.com/dashboard/account/tokens):

```bash
curl -sS -X PATCH "https://api.supabase.com/v1/projects/<ref>/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"site_url\":\"$APP_URL\",\"uri_allow_list\":\"$APP_URL/**,http://localhost:5173/**\"}"
```

**Otherwise** ask the owner: Supabase dashboard → Authentication → URL
Configuration → set **Site URL** to `APP_URL` and add `APP_URL/**` under
**Redirect URLs**.

## 7. First sign-in (the owner)

Ask the owner to open `APP_URL`, enter their email, and click the link in
the email **on the same device**. They should land on Home.

- "doesn't have access" → the email in `meals_allowlist` doesn't match
  (check case and typos).
- Link opens `localhost` → step 6 wasn't applied.
- Supabase's built-in email is rate limited (a few per hour). That's fine
  for one person; add custom SMTP in Supabase for more.

Optional hardening once the owner has signed in: turn off new sign-ups
(dashboard → Authentication → Sign In / Providers → disable **Allow new
users to sign up**, or `"disable_signup": true` through the API above).
Data is already protected by the allowlist; this just stops strangers
creating empty accounts.

## 8. Connect AI agents

In the app: **profile picture → AI Access**.

1. Fill in **About me** (body, goals, diet, allergies, training, tastes).
   Agents read this first.
2. **Create a key**, turn on **Can make changes** if the agent should log
   food, update the pantry, etc. Copy the MCP URL shown:
   `APP_URL/api/mcp?key=opa_…` (shown once).
3. Add it as a custom connector:
   - **Claude** (claude.ai / Desktop / mobile): Settings → Connectors → Add
     custom connector → paste the URL.
   - **Claude Code:** `claude mcp add --transport http openplate "<URL>"`
   - **ChatGPT:** Settings → Connectors / Apps → developer mode → add the
     URL as an MCP server.
   - **Gemini CLI, Cursor, VS Code, others:** add it as a remote HTTP MCP
     server.
   - **Anything else:** AI Access → **Copy guide + snapshot** and paste it
     into the chat.

Check: ask the agent "What can I cook tonight?" It should call
`get_kitchen_guide` and `get_kitchen_snapshot`.

## 9. Tell the owner what they have

Summarise: the app URL, that the data lives in their own Supabase project
(`<ref>`), that keys can be revoked any time in AI Access, and that
switching AI apps only means adding the same URL to the new one: all
history, goals and the guide stay in their database.

---

### Updating later

```bash
git pull upstream main     # or sync the fork on GitHub
npx supabase db push       # or apply new files in supabase/migrations via MCP
git push                   # Vercel redeploys
```

### Running locally

```bash
npm run dev    # http://localhost:5173 (uses .env)
```

The `/api` functions run on Vercel; use `npx vercel dev` to run them locally.

### Optional: Google sign-in

Create a Google OAuth client, enable the Google provider in Supabase
(Authentication → Sign In / Providers), then set
`VITE_ENABLE_GOOGLE_AUTH=true` in Vercel and redeploy.
