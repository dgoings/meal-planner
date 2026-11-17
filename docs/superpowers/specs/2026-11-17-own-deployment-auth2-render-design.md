# Own Convex deployment, Convex Auth 2.0, and Render hosting

Date: 2026-11-17

## Intent

Dylan cloned PerfectPlate (originally `sydney-cole/recipe-builder`) into
`dgoings/meal-planner` and wants to run it as his own app: a Convex project he
owns, authentication on the current Convex Auth release (2.0), and the Next.js
frontend hosted on Render instead of Vercel.

## Goals

- The checkout is linked to a new Convex project in Dylan's account, with a
  dev deployment for local work and a production deployment for Render.
- Authentication runs on `@convex-dev/auth` 2.0.0 (email + password), with
  account emails sent through Resend.
- The frontend builds and runs on Render from a `render.yaml` in the repo, and
  each Render build deploys the Convex functions first.
- `npm run check` and `npm run build` pass; the README and `.env.example`
  describe the new setup.

## Non-goals

- Migrating users or data from the original deployment. The new deployment
  starts empty, and 2.0 has no v1 data-migration tooling yet.
- New sign-in methods (passkeys, OAuth, TOTP).
- Changing recipe import, search, grocery lists, or the visual design beyond
  what the new auth flow requires.
- A custom domain for the app (the Render `onrender.com` URL is fine to start).

## Anti-goals

- No shims around unsupported 2.0 internals (for example faking the Resend
  component to keep AgentMail for account email).
- No secrets in the repo, `.env.example`, or Render build logs.

## Constraints

- 2.0 needs `convex` ^1.48 (repo is on ^1.45; latest is 1.50) and Next 16
  (already satisfied).
- 2.0's email + password method only sends through the `@convex-dev/resend`
  component, and it verifies by emailed link, not a typed code. The link only
  works in the browser that started the flow.
- Resend needs an account, an API key, and a verified sending domain to mail
  arbitrary addresses. Without a verified domain it only delivers to the
  account owner's own address (enough for a first smoke test).
- The local machine's `npm` is broken (nvm's bundled npm is missing); `pnpm`
  and `bun` work. The repo has a `package-lock.json` and CI runs `npm ci`.
- The Render connector is not authorized in this session, so the Render
  service is created by Dylan from the blueprint in the Render dashboard.
- Auth 2.0 access tokens are signed by the deployment itself; there are no
  JWT keys to generate.

## Approaches

**Account email (decided by Dylan: option 1).**

1. *Resend with links* — 2.0 as designed. Needs a Resend account and domain;
   the code-entry screens become "check your email" plus link landing pages.
   **Chosen:** supported path, least surprising to maintain.
2. *AgentMail through a stand-in for the Resend send function* — no new
   account, but unsupported and fragile across 2.0.x updates.
3. *Stay on the 0.0.x line* — keeps six-digit codes, but is not 2.0.

**Render hosting (Claude's call).** A Node web service running `next start`,
not a static site: the app uses a proxy (middleware), server components that
read the auth cookie, and route handlers, none of which a static export
supports. Docker was considered and dropped as unnecessary for a stock Next
app.

## Design

### 1. Convex project

- Create a new Convex project in Dylan's account (name `meal-planner`) with
  the Convex CLI, which writes `CONVEX_DEPLOYMENT` and
  `NEXT_PUBLIC_CONVEX_URL` to `.env.local` (git-ignored).
- Deployment environment variables, set on dev and again on prod:
  `RESEND_API_KEY`, `SENDER_EMAIL`, optional `SENDER_NAME`, `SITE_URL`,
  `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, and the three `AGENTMAIL_*` values.
  Dylan supplies the secrets; nothing is written to the repo.
- AgentMail is now only for forwarded recipes. If its values are absent, the
  Recipe Inbox does not work but sign-up does (a change from today, where
  sign-up depended on AgentMail).

### 2. Auth 2.0 backend

- `convex/convex.config.ts`: mount `auth`, `authPassword`, `authEmail`, and
  `resend` alongside the existing components.
- `convex/auth.config.ts`: `providers: [convexAuthProvider()]`.
- `convex/auth.ts`: `setupConvexAuth` plus `setupEmailPassword` with the
  Resend sender and three link paths: `/validate-email`,
  `/reset-password`, and `/confirm-email-change`. Export the session functions
  and the email-password functions. Remove the AgentMail code-sending logic
  and the `@auth/core` dependency.
- `convex/http.ts`: drop `auth.addHttpRoutes`; keep the AgentMail webhook.
- `convex/schema.ts`: remove `authTables`. The app keeps its own `users`
  table; drop the v1-only fields (`emailVerificationTime`, `phone*`,
  `isAnonymous`) and the two auth deletion stages.
- `convex/users.ts`: add the internal `createUser` callback. In 2.0 it
  receives no email or name, so it creates an empty `users` row. An
  `onSignIn` callback copies the user's verified primary email from the auth
  email component onto `users.email` (Claude's call). `users.email` is
  therefore set only for verified accounts, and the existing email index
  keeps working.
- Name (Claude's call): the sign-up form no longer asks for a name, because
  2.0 sign-up accepts only email and password. The name stays editable in
  Settings, and anywhere the app shows a name falls back to the part of the
  email before the `@`.
- Account deletion replaces its two v1 auth stages with one: revoke the
  user's sessions and delete their verified emails through the 2.0
  components, then continue with the existing app-data stages. The password
  component has no delete function, so the password hash is left behind; it
  is unreachable once the email records are gone (Claude's call, a known
  limitation to note in the README).
- Unverified accounts (Claude's call): 2.0 creates the `users` row before
  the link is opened and has no "resend" function, so signing up again is
  the way to get a new link, and sign-in shows one combined message ("No
  verified account for that email. Check your inbox for the confirmation
  link, or sign up again."). A daily cron deletes `users` rows that are more
  than 24 hours old and still have no email.
- `convex/email.ts`: forwarded mail is attributed through `users.email`,
  which now implies verified, replacing the `emailVerificationTime` check.
- The link URLs passed to `setupEmailPassword` must be absolute, so they are
  built from `SITE_URL` with a `http://localhost:3000` fallback.
- `convex/migrations.ts`: remove `grandfatherEmailVerification` (it only
  served the original deployment's early accounts).
- Every `getAuthUserId(ctx)` call keeps working unchanged.

### 3. Auth 2.0 frontend

- `lib/server-auth.ts` (`setupConvexAuthServer`) and three route handlers at
  exactly `/auth/signin`, `/auth/refresh`, `/auth/signout`.
- `lib/convex-auth.tsx` (`setupConvexAuthNextjs`) providing the proxy helper,
  server provider, and access-token helper.
- `proxy.ts`: same redirect rules as today, on the 2.0 proxy helper, with
  `/auth` excluded from the matcher.
- `app/layout.tsx` and `app/convex-client-provider.tsx`: 2.0 providers.
- `app/(app)/app/recipes/[recipeId]/page.tsx`: 2.0 access-token helper.
- Auth screens, using the 2.0 email-password React hooks and keeping the
  current look:
  - Sign up → "check your email" state (replaces code entry).
  - `/validate-email` → completes sign-up from the link, then enters the app.
  - Sign in → as today; an unverified account is told to use its emailed link.
  - Forgot password → "check your email"; `/reset-password` sets the new
    password from the link.
  - `/confirm-email-change` exists because the method requires the path;
    it completes the change, but no "change email" control is added to
    Settings (Claude's call: out of scope).
- Sign out in the app shell and settings uses the 2.0 `useAuthActions`.

### 4. Tests

- Backend tests register the 2.0 components with `@convex-dev/auth/test`
  helpers (including the Resend stub) and create signed-in users through
  them instead of writing v1 auth rows.
- Auth form tests are rewritten for the link flow; other component tests
  only update their auth mocks.
- Tests for the removed migration and v1 deletion stages are removed or
  replaced with tests for the new deletion path.

### 5. Render

- `render.yaml`: one Node web service, Node 22, build command
  `npm ci && npx convex deploy --cmd 'npm run build'`, start command
  `npm run start` (Bun equivalents on the fork's `deploy` branch), with `CONVEX_DEPLOY_KEY` declared as a secret Dylan enters
  in the dashboard (`sync: false`). Plan: free to start (Claude's call; it
  sleeps when idle, upgrade later if that hurts).
- `convex deploy` supplies `NEXT_PUBLIC_CONVEX_URL` to the build; no other
  frontend variables are needed.
- After the first deploy, `SITE_URL` on the production Convex deployment is
  set to the Render URL so emailed links point at the live site.
- The AgentMail webhook is registered against the production Convex site URL
  when Dylan sets up AgentMail.

### 6. Configurable recipe model provider

Added 2026-11-17 at Dylan's request: the recipe agent must not be tied to an
Anthropic key; it should accept other providers' keys or OpenRouter. The
details below are Claude's calls.

- Three providers: `anthropic`, `openai`, `openrouter`. Each reads its own
  key from the Convex deployment: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `OPENROUTER_API_KEY`.
- `RECIPE_AGENT_PROVIDER` picks one. When it is unset, the provider is
  inferred if exactly one of the three keys is set; with several keys set and
  no provider named, the import fails with a message naming the variable.
- `RECIPE_AGENT_MODEL` names the model. It stays optional for `anthropic`
  (default `claude-sonnet-5`, as today) and is required for `openai` and
  `openrouter`, because there is no safe default to guess.
- OpenRouter goes through the AI SDK's OpenAI-compatible provider at
  `https://openrouter.ai/api/v1`, not a third-party package.
- A missing or inconsistent configuration is recorded on the import as a
  failure with a clear message, as the missing Anthropic key is today.
- No per-user keys and no UI: this is deployment configuration only.

### 7. Bun and upstream pull requests

Added 2026-11-17 at Dylan's request.

- The project moves from npm to Bun as its package manager and script
  runner. Next.js, the Convex CLI, and Vitest still run on Node; tests are
  not ported to Bun's test runner (Claude's call).
- Each piece of work is a separate branch cut from `main` so it can be
  opened as its own pull request against the upstream repository
  (`sydney-cole/recipe-builder`) and reviewed on its own: Bun migration,
  recipe model provider, Convex Auth 2.0, Render blueprint.
- The branches do not build on each other (Claude's call). Feature branches
  therefore keep upstream's current npm lockfile, and only the Bun branch
  introduces `bun.lock`. The cost is a lockfile regeneration on whichever
  dependency-changing PR merges second.
- Upstream-facing changes must not assume Dylan's setup: Render docs are
  added beside the Vercel docs, not in place of them; the repository URLs in
  `package.json` are left alone; these design documents stay out of the PRs.
- A fork-only `deploy` branch merges all four branches and is what Dylan's
  Convex project and Render service run. It uses Bun commands in
  `render.yaml` and carries the design documents.
- The Auth 2.0 pull request has a real cost for upstream: its existing
  accounts cannot be migrated and it needs a Resend account and domain. The
  PR description says so up front; whether to merge is the author's call.

### 8. Docs and housekeeping

- README changes travel with the branch they describe: Render is added
  beside Vercel, the AgentMail account-email text is replaced by Resend in
  the auth branch, and commands change to Bun in the Bun branch.
- `.env.example`: current variable names; remove the stale Firecrawl note.

## Status as of 2026-11-17

- Convex project exists: dev deployment `elated-platypus-554`, linked in
  `.env.local`. `TAVILY_API_KEY`, `RESEND_API_KEY`, and `SITE_URL`
  (`http://localhost:3000`) are set on it.
- No Resend domain yet, so `SENDER_EMAIL` is Resend's test sender
  `onboarding@resend.dev`, which delivers only to Dylan's own Resend account
  address. Real users need a verified domain later.

## What needs Dylan

- Resend: a verified domain and sender address before other people sign up.
- Render: create the service from the blueprint and paste the Convex
  production deploy key.
- Anthropic and (optionally) AgentMail credentials for the new deployment.
  Tavily's key comes from the Tavily setup already in progress.

## Left to the builder

- Exact copy for the "check your email" and link landing states.
- How a link opened in a different browser is explained to the user.
- Whether the v1 `users` fields are dropped in one schema change (fine: the
  deployment is new and empty).
- Getting a working npm locally (for example via corepack or reinstalling
  the nvm Node) without changing Dylan's default Node version.
