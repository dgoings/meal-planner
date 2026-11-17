# Own Deployment, Convex Auth 2.0, Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run PerfectPlate on Dylan's own Convex project with Convex Auth 2.0 (email + password via Resend), a configurable recipe model provider, Bun as package manager, and Render hosting — delivered as four independent branches that can each be opened as a pull request against the upstream repo, plus one fork-only branch that combines them for deployment.

**Architecture:** Auth moves from the v1 `convexAuth({providers})` API to 2.0's component model: mounted `auth`, `authPassword`, `authEmail`, and `resend` components, with the app owning its `users` table through `createUser`/`onSignIn` callbacks. The Next.js side uses 2.0's SSR helpers (cookie-backed route handlers plus a proxy). The recipe agent picks its model through a small pure resolver over deployment environment variables.

**Tech Stack:** Bun 1.3 (package manager), Next.js 16 (App Router, `proxy.ts`), Convex 1.50, `@convex-dev/auth` 2.0.0, `@convex-dev/resend`, AI SDK v7 (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`), Vitest 5 + `convex-test`, Render Blueprint.

**Spec:** `docs/superpowers/specs/2026-11-17-own-deployment-auth2-render-design.md`

## Global Constraints

- `@convex-dev/auth` exactly `2.0.0`; `convex` `^1.50.0` (2.0 needs `^1.48`).
- The 2.0 API reference is the package source: `node_modules/@convex-dev/auth/src/**` (JSDoc on `server/setup.ts`, `methods/email-password/server.ts`, `methods/email-password/react.tsx`, `ssr/setup.ts`, `ssr/nextjs/index.tsx`, `testing/*.ts`). Read the JSDoc for any 2.0 function before calling it; do not rely on v1 knowledge.
- No shims around 2.0 internals. Only call component functions the package documents for app use (`getPrimaryEmail`, `getEmails`, `deleteUser` on the email component; `listSessions`, `revokeSessions` on the core).
- No secrets in the repo, `.env.example`, or logs. Secrets live only on the Convex deployment.
- Four independent branches, each cut from `main` (which equals upstream `sydney-cole/recipe-builder` `main` at `474f9a7`) and each a self-contained upstream PR: `bun-migration` (Task 2), `recipe-model-provider` (Task 3), `convex-auth-2` (Tasks 4–5), `render-deploy` (Task 6). No branch contains another's commits. See "Branch and PR structure".
- Upstream's package manager is npm until its Bun PR merges, so `recipe-model-provider` and `convex-auth-2` update `package-lock.json` with npm, and `bun-migration` is the only branch that touches `bun.lock`. The machine's nvm npm is broken; Task 1 fixes that.
- Nothing fork-specific goes into a PR branch: no `docs/superpowers/`, no `package.json` repository URL changes, no deployment names, no Dylan-specific URLs. Those live only on the fork's `deploy` branch (Task 7).
- PR branches must not break upstream's Vercel setup: docs for Render are additive, and existing Vercel instructions stay.
- Dev deployment is `elated-platypus-554` (already in `.env.local`). Never run `convex deploy` (production) in this plan; production is deployed by Render.
- Link paths are exactly `/validate-email`, `/reset-password`, `/confirm-email-change`. Route handler paths are exactly `/auth/signin`, `/auth/refresh`, `/auth/signout`.
- Keep the existing visual design; reuse the current auth form components' markup and classes.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Keep each branch's history tidy (a few meaningful commits), since the upstream author reviews it.
- Do not push or open PRs; Dylan asks for that separately.

## Branch and PR structure

| Branch | Upstream PR | Depends on | Lockfile touched |
| --- | --- | --- | --- |
| `bun-migration` | Switch package manager to Bun | nothing | `bun.lock` (replaces `package-lock.json`) |
| `recipe-model-provider` | Configurable recipe model provider | nothing | `package-lock.json` |
| `convex-auth-2` | Move to Convex Auth 2.0 | nothing | `package-lock.json` |
| `render-deploy` | Add Render blueprint and docs | nothing | none |
| `deploy` (fork only, no PR) | — | merges all four | `bun.lock`, regenerated |

Expected merge friction, to state in each PR description: `recipe-model-provider` and `convex-auth-2` both edit `package.json` dependencies and the lockfile, so whichever merges second needs a lockfile regeneration; once `bun-migration` merges, open PRs regenerate `bun.lock` instead of `package-lock.json`. No source file is edited by two branches except `README.md` (different sections) and `.env.example`.

Each PR description states what it changes, how it was verified, and any operational consequence for upstream. The `convex-auth-2` description must lead with: existing accounts cannot be carried over (Convex Auth 2.0 has no v1 data migration yet), every user re-registers, and account email moves from AgentMail codes to Resend links, so upstream needs a Resend account and verified domain before merging.

## Review Focus

1. A confirmation or reset link opened in a different browser than the one that started the flow: the page must explain that and offer the way forward (sign up again / request a new reset), not show a raw error. (Task 5)
2. A link opened twice, or after expiry: same friendly treatment, no crash. (Task 5)
3. Two deployment keys set (for example `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`) with no `RECIPE_AGENT_PROVIDER`: the import fails with a message naming `RECIPE_AGENT_PROVIDER`, not a silent pick. (Task 3)
4. A forwarded recipe email from an address whose account never opened its confirmation link: not attributed to anyone. (Task 4)
5. The daily cleanup must not delete a `users` row that is unverified but younger than 24 hours, nor any row that has an email. (Task 4)

---

### Task 1: Working toolchain and green baseline (no commits)

- [ ] **Step 1: Restore npm for Node 25.8.2 without changing the default Node**

Run: `PATH="$HOME/.local/share/nvm/v25.8.2/bin:$PATH" pnpm dlx npm@latest install -g npm@latest`
Then: `~/.local/share/nvm/v25.8.2/bin/npm --version`
Expected: a version number. All later commands assume `export PATH="$HOME/.local/share/nvm/v25.8.2/bin:$HOME/.bun/bin:$PATH"`.

- [ ] **Step 2: Install and record the baseline on `main`**

Run: `npm ci && NEXT_PUBLIC_CONVEX_URL=https://test.convex.cloud npm run check && NEXT_PUBLIC_CONVEX_URL=https://test.convex.cloud CONVEX_SITE_URL=https://test.convex.site npm run build`
Expected: PASS. If anything fails before any change, stop and report it; do not fix unrelated failures silently.

- [ ] **Step 3: Keep the design docs out of the PR branches**

`docs/superpowers/` stays untracked while working on the four PR branches (add `docs/superpowers/` to `.git/info/exclude`, not `.gitignore`). It is committed only on `deploy` in Task 7.

---

### Task 2: Bun migration — branch `bun-migration`

**Files:**
- Delete: `package-lock.json`
- Create: `bun.lock`
- Modify: `package.json`, `.github/workflows/ci.yml`, `README.md`, `.gitignore` (only if a Bun artifact needs ignoring)

Scope: package manager and script runner only. Next.js, the Convex CLI, and Vitest keep running on Node (`engines.node` stays `>=22`); tests are **not** ported to `bun test`.

- [ ] **Step 1:** `git switch -c bun-migration main && rm -rf node_modules package-lock.json && bun install` — Expected: `bun.lock` (text lockfile) created.

- [ ] **Step 2: `package.json`** — add `"packageManager": "bun@1.3.11"`; change `check` to `bun run typecheck && bun run lint && bun run test`. Leave every other script as is.

- [ ] **Step 3: CI** — in `.github/workflows/ci.yml` keep `actions/setup-node@v4` with Node 22 but drop `cache: npm`; add `oven-sh/setup-bun@v2` with `bun-version: 1.3.11`; replace the four run steps with `bun install --frozen-lockfile`, `bun run check`, `bun run test:coverage`, `bun run build`.

- [ ] **Step 4: README** — replace `npm install` / `npm run …` / `npm test` / `npx …` with `bun install` / `bun run …` / `bun run test` / `bunx …` throughout, change the prerequisites to "Node.js 22 or newer" and "Bun 1.3 or newer", and update the Vercel build command to `bunx convex deploy --cmd 'bun run build'` with a note that Vercel detects Bun from `bun.lock`.

- [ ] **Step 5: Verify** — `bun install --frozen-lockfile && NEXT_PUBLIC_CONVEX_URL=https://test.convex.cloud bun run check && bun run test:coverage && NEXT_PUBLIC_CONVEX_URL=https://test.convex.cloud CONVEX_SITE_URL=https://test.convex.site bun run build`. Expected: PASS with the same test count as the Task 1 baseline. `grep -rn "npm \|npx " README.md .github package.json` returns nothing.

- [ ] **Step 6: Commit** — `build: switch package manager to Bun`.

---

### Task 3: Configurable recipe model provider — branch `recipe-model-provider`

**Files:**
- Create: `convex/lib/recipeModel.ts`, `convex/lib/recipeModel.test.ts`
- Modify: `convex/recipeAgent.ts` (replace `recipeModelName` and the key/model lines in `recipeAgent`), `package.json`

**Interfaces:**
- Produces:
  ```ts
  export type RecipeModelProvider = "anthropic" | "openai" | "openrouter";
  export type RecipeModelConfig = { provider: RecipeModelProvider; model: string; apiKey: string };
  export const DEFAULT_ANTHROPIC_RECIPE_MODEL = "claude-sonnet-5";
  /** Throws Error with a user-readable message on any misconfiguration. */
  export function resolveRecipeModelConfig(env: Record<string, string | undefined>): RecipeModelConfig;
  /** "anthropic/claude-sonnet-5" style label stored on the import. */
  export function recipeModelLabel(config: RecipeModelConfig): string;
  ```

- [ ] **Step 0:** `git switch -c recipe-model-provider main && npm ci`

- [ ] **Step 1: Write failing tests in `convex/lib/recipeModel.test.ts`**

Cases (each `expect(resolveRecipeModelConfig(env))` or `.toThrow(/…/)`):
- only `ANTHROPIC_API_KEY: " k "` → `{ provider: "anthropic", model: "claude-sonnet-5", apiKey: "k" }`
- `ANTHROPIC_API_KEY` + `RECIPE_AGENT_MODEL: "claude-x"` → model `"claude-x"`
- only `OPENROUTER_API_KEY` + `RECIPE_AGENT_MODEL: "vendor/model"` → provider `"openrouter"`
- only `OPENAI_API_KEY`, no model → throws `/RECIPE_AGENT_MODEL/`
- only `OPENROUTER_API_KEY`, no model → throws `/RECIPE_AGENT_MODEL/`
- `ANTHROPIC_API_KEY` + `OPENROUTER_API_KEY`, no provider → throws `/RECIPE_AGENT_PROVIDER/`
- both keys + `RECIPE_AGENT_PROVIDER: "OpenRouter "` + model → provider `"openrouter"` (trimmed, case-insensitive)
- `RECIPE_AGENT_PROVIDER: "openai"` with only `ANTHROPIC_API_KEY` → throws `/OPENAI_API_KEY/`
- `RECIPE_AGENT_PROVIDER: "mistral"` → throws `/anthropic, openai, openrouter/`
- no keys at all → throws `/ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY/`
- blank-string keys count as unset
- `recipeModelLabel({ provider: "openrouter", model: "vendor/model", apiKey: "k" })` → `"openrouter/vendor/model"`

- [ ] **Step 2: Run** `npx vitest run convex/lib/recipeModel.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `convex/lib/recipeModel.ts`** to the interface above (pure; no imports from AI SDK).

- [ ] **Step 4: Run the same command** — Expected: PASS.

- [ ] **Step 5: Wire `convex/recipeAgent.ts`**

`npm install @ai-sdk/openai @ai-sdk/openai-compatible` (versions compatible with the installed `ai` v7). In `recipeAgent`, take a `RecipeModelConfig` and build the language model: `createAnthropic({apiKey})(model)`, `createOpenAI({apiKey})(model)`, or `createOpenAICompatible({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey, supportsStructuredOutputs: true })(model)`; keep the existing `as never` cast and its comment. In `extractRecipe`, call `resolveRecipeModelConfig(process.env)` once and return `recipeModelLabel(config)` as `model`. Check where `model` is stored/compared (`grep -rn "model" convex/recipeAgentData.ts convex/recipeIngestion.ts`) and keep the stored format consistent with the existing `"anthropic/test-model"` fixtures.

- [ ] **Step 6: Run** `npx vitest run convex && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 7: README** — rename the "Anthropic recipe agent" section to "Recipe model provider" and document `RECIPE_AGENT_PROVIDER`, the three key names, and the `RECIPE_AGENT_MODEL` rules from the spec (section 6). Existing Anthropic-only deployments keep working with no change; say so.

- [ ] **Step 8: Commit** — `feat: configurable recipe model provider`.

---

### Task 4: Auth 2.0 backend — branch `convex-auth-2`

**Files:**
- Modify: `package.json`, `tsconfig.json` (add `"allowImportingTsExtensions": true`), `convex/convex.config.ts`, `convex/auth.config.ts`, `convex/auth.ts`, `convex/http.ts`, `convex/schema.ts`, `convex/users.ts`, `convex/email.ts`, `convex/functions.test.ts`
- Create: `convex/crons.ts`, `convex/testing.ts` (test-only helpers, no Convex functions)
- Delete: `convex/migrations.ts`

**Interfaces:**
- Produces (public, on `api.auth`): `signOut`, `refreshSession`, `isAuthenticated`, `signUpWithEmailPassword`, `completeSignUpWithEmailPassword`, `signInWithEmailPassword`, `changePassword`, `startPasswordRecovery`, `checkPasswordRecovery`, `completePasswordRecovery`, `startChangeEmail`, `completeChangeEmail`.
- Produces (internal, on `internal.users`):
  - `createUserEmailPassword` — args `{ method: v.object({ name: v.literal(<the method name 2.0 passes>), profile: v.object({}) }) }`, returns `v.id("users")`; inserts `{ createdAt: Date.now() }`.
  - `syncUserEmail` (the `onSignIn` callback) — args `{ method, userId: v.id("users") }`, returns `v.null()`; reads `components.authEmail.verifiedEmails.getPrimaryEmail` and patches `users.email` when it differs.
  - `deleteUnverifiedUsers` — args `{}`, returns `v.null()`; deletes up to 100 `users` rows with no `email`, no `deletionStage`, and `createdAt` (fall back to `_creationTime`) older than 24 hours.
- Produces (`convex/testing.ts`): `initAuthTest()` returning a `convexTest` instance with all auth components and the Resend stub registered, and `signedInUser(t, email)` that signs up, completes validation using the code from the stubbed email, and returns `{ userId, as }` where `as` is `t.withIdentity(sessionIdentity(tokens))`.

- [ ] **Step 0:** `git switch -c convex-auth-2 main && npm ci`

- [ ] **Step 1: Dependencies**

`npm install @convex-dev/auth@2.0.0 convex@^1.50.0 @convex-dev/resend && npm uninstall @auth/core`. Confirm `convex-test` still satisfies 2.0's test helpers (`npm ls convex-test`); upgrade it if `registerComponent`/`runInComponent` are missing.

- [ ] **Step 2: Config files**

`convex/convex.config.ts`: add `app.use` for `@convex-dev/auth/convex.config` (`auth`), `@convex-dev/auth/components/password/convex.config` (`authPassword`), `@convex-dev/auth/components/email/convex.config` (`authEmail`), `@convex-dev/resend/convex.config` (`resend`), keeping the three existing components. `convex/auth.config.ts`: `export default { providers: [convexAuthProvider()] } satisfies AuthConfig;`. `convex/http.ts`: remove the `auth` import and `auth.addHttpRoutes(http)`.

- [ ] **Step 3: Rewrite `convex/auth.ts`**

`setupConvexAuth({ component: components.auth })`, then `setupEmailPassword(auth, {...}).attachUserCallbacks({ createUser: internal.users.createUserEmailPassword, onSignIn: internal.users.syncUserEmail })`. Sender: `apiKey: process.env.RESEND_API_KEY ?? ""`, `from` built as `"<SENDER_NAME or PerfectPlate> <SENDER_EMAIL or onboarding@resend.dev>"`. URLs from `(process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")` plus the three paths in Global Constraints. If the package's JSDoc shows a typed `env` on `defineApp` as the intended way to read these, use that instead and keep the same defaults.

- [ ] **Step 4: Schema**

Remove `authTables` and its import. In `users`: drop `emailVerificationTime`, `phone`, `phoneVerificationTime`, `isAnonymous`; keep `email` and its `email` index (v1's `authTables` defined that index, so declare `.index("email", ["email"])` on the table explicitly); replace the `"authAccounts"` and `"authSessions"` deletion stages with one `"auth"` stage.

- [ ] **Step 5: Write failing backend tests** (in `convex/functions.test.ts`, replacing the v1 `createUser` helper usage with `convex/testing.ts`)

New/changed tests, by name:
- `sign-up then validation yields a user whose email is set` — after `signedInUser(t, "Ana@Example.com")`, the `users` row has `email === "ana@example.com"` and `api.users.current` (called via `as`) returns it.
- `sign-up alone leaves the user without an email` — after `signUpWithEmailPassword` only, exactly one `users` row exists and its `email` is `undefined`.
- `forwarded mail from an unconfirmed address is not attributed` — sign up without validating, run the inbound handler with that From address, expect `{ queued: 0 }`.
- `forwarded mail from a confirmed address is attributed` — existing positive test, now using `signedInUser`.
- `deleteUnverifiedUsers removes only stale rows without an email` — three rows: no email + 25h old (deleted), no email + 1h old (kept), with email + 25h old (kept). Use `vi.useFakeTimers` / explicit `createdAt`.
- `account deletion revokes sessions and removes verified emails` — after `deleteAccount` and draining scheduled functions, `api.auth.isAuthenticated` via `as` is `false`, `getEmails` for the user is empty, and the `users` row is gone.
- Remove the `grandfatherEmailVerification` tests.
For every other existing test that only needs "a user id", keep inserting a `users` row directly (`{ name, email, createdAt }`) and `t.withIdentity` is replaced by a helper that creates a real session only where the function under test calls `getAuthUserId`. Check first how existing tests authenticate (`grep -n "withIdentity" convex/functions.test.ts | head`) and convert them through one shared helper rather than per-test edits.

- [ ] **Step 6: Run** `npx vitest run convex` — Expected: the new tests FAIL.

- [ ] **Step 7: Implement `convex/users.ts`, `convex/email.ts`, `convex/crons.ts`, delete `convex/migrations.ts`**

`users.ts`: the three internal functions from Interfaces; `continueAccountDeletion`'s first stage becomes `"auth"`: call `components.auth.public.revokeSessions` and `components.authEmail.verifiedEmails.deleteUser` for the user (read their JSDoc for exact args), then advance to `"savedRecipes"`; `deleteAccount` starts at `"auth"`. `email.ts`: attribution condition becomes `user === null || user.deletionRequestedAt !== undefined` → not attributed (email presence now implies verified); update the comment. `crons.ts`: `crons.daily("delete unverified users", { hourUTC: 9, minuteUTC: 0 }, internal.users.deleteUnverifiedUsers, {})`.

- [ ] **Step 8: Run** `npx vitest run convex` — Expected: PASS. (`tsc` is expected to fail until Task 5 because the frontend still imports v1 entry points.)

- [ ] **Step 9: Push to the dev deployment**

Run: `npx convex env set SENDER_EMAIL onboarding@resend.dev && npx convex dev --once`
Expected: functions deploy to `elated-platypus-554` with no schema or auth-config error. If the push is blocked by typecheck of frontend files, use `--typecheck=disable` for this one push and note it.

- [ ] **Step 10: Commit** — `feat: move backend to Convex Auth 2.0`.

---

### Task 5: Auth 2.0 frontend — branch `convex-auth-2` (continues Task 4)

**Files:**
- Create: `lib/server-auth.ts`, `lib/convex-auth.tsx`, `app/auth/signin/route.ts`, `app/auth/refresh/route.ts`, `app/auth/signout/route.ts`, `app/(auth)/validate-email/page.tsx`, `app/(auth)/reset-password/page.tsx`, `app/(auth)/confirm-email-change/page.tsx`, `components/auth/link-landing.tsx`, `components/auth/link-landing.test.tsx`, `lib/display-name.ts`, `lib/display-name.test.ts`
- Modify: `proxy.ts`, `app/layout.tsx`, `app/convex-client-provider.tsx`, `app/(app)/app/recipes/[recipeId]/page.tsx`, `components/auth/auth-form.tsx` + test, `components/auth/password-reset-form.tsx` + test, `components/app-shell/app-shell.tsx` + test, `components/settings/settings-panel.tsx` + test, any component that renders the user's name

**Interfaces:**
- Consumes: `api.auth.*` from Task 4.
- Produces:
  - `lib/server-auth.ts`: `export const auth = setupConvexAuthServer({ convexUrl, refreshSession: api.auth.refreshSession, signOut: api.auth.signOut, signIn: [api.auth.signInWithEmailPassword, api.auth.completeSignUpWithEmailPassword, api.auth.completePasswordRecovery], cookieOptions: { secure: process.env.NODE_ENV === "production" } })`. Verify against the JSDoc which email-password functions issue sessions and list exactly those.
  - `lib/convex-auth.tsx`: `export const { convexAuthNextjsProxy, nextjsProxyRedirect, convexAuthNextjsAccessToken, isAuthenticatedNextjs, ConvexAuthNextjsServerProvider } = setupConvexAuthNextjs({...})`.
  - `lib/display-name.ts`: `export function displayName(user: { name?: string; email?: string } | null | undefined): string` — trimmed `name` if non-empty, else the part of `email` before `@`, else `"there"`.
  - `components/auth/link-landing.tsx`: three client components `ValidateEmailLanding`, `ResetPasswordLanding`, `ConfirmEmailChangeLanding`, each reading `?code=` and driving the matching 2.0 hook.

- [ ] **Step 1: SSR wiring**

Create the two `lib` files and three route handlers (`export const POST = auth.convexProxyHandler | auth.refreshHandler | auth.signOutHandler`). `proxy.ts`: same two redirect rules as today using `convexAuthNextjsProxy(async (request, { isAuthenticated }) => …)` and `nextjsProxyRedirect`; add `auth` to the matcher's negative lookahead so `/auth/*` is excluded; add `/validate-email`, `/reset-password`, `/confirm-email-change` to nothing (they stay public). `app/layout.tsx`: provider from `@/lib/convex-auth`, wrapped in `<Suspense>` as the 2.0 Next.js setup requires. `app/convex-client-provider.tsx`: `ConvexAuthNextjsProvider` from `@convex-dev/auth/ssr/nextjs/client` export path shown in the package `exports` map (check `package.json` exports for the exact client entry). Recipe page: `convexAuthNextjsAccessToken()`.

- [ ] **Step 2: Write failing tests for `displayName`**

`displayName({ name: " Ana " , email: "a@b.co" })` → `"Ana"`; `displayName({ name: "", email: "ana.lopez@example.com" })` → `"ana.lopez"`; `displayName(null)` → `"there"`. Run `npx vitest run lib/display-name.test.ts` (FAIL), implement, run (PASS). Replace direct `user.name` renders (`grep -rn "\.name" components app --include='*.tsx' | grep -i user`) with `displayName(user)`.

- [ ] **Step 3: Rewrite auth form tests first** (`components/auth/auth-form.test.tsx`, `password-reset-form.test.tsx`), mocking `@convex-dev/auth/methods/email-password/react`

Assertions:
- Sign-up form has email and password fields and **no** name field; a successful `signUp` shows text matching `/check your email/i` and the entered address; a result with `userError` shows that error and stays on the form.
- Sign-in success navigates to `next` (or `/app`); a `USER_NOT_FOUND`-type result shows exactly: `No verified account for that email. Check your inbox for the confirmation link, or sign up again.`
- Forgot-password submit calls `startPasswordRecovery({ email })` and shows `/check your email/i` regardless of whether the address exists.
- Keep the existing `next`-parameter safety test (open-redirect guard) unchanged in intent.

- [ ] **Step 4: Run** `npx vitest run components/auth` — Expected: FAIL.

- [ ] **Step 5: Rewrite `auth-form.tsx` and `password-reset-form.tsx`** on `useSignUpWithEmailPassword`, `useSignInWithEmailPassword`, `useStartPasswordRecovery`; remove all code-entry steps and `useAuthActions().signIn` usage.

- [ ] **Step 6: Landing page tests** (`components/auth/link-landing.test.tsx`)

- `ValidateEmailLanding` with a code: on the hook's success state, navigates to `/app`.
- No `code` in the URL, or the hook's error state (expired, already used, wrong browser): shows `This link can't be used here.` plus a link to `/sign-up` labelled `Sign up again` (for validate) or to `/forgot-password` labelled `Request a new link` (for reset). The explanatory line mentions that links only work in the browser that requested them and expire.
- `ResetPasswordLanding`: once the hook reports the code is valid, shows a new-password field; submitting calls `completePasswordRecovery({ newPassword })` and navigates to `/app`; a password `userError` is shown inline.
- `ConfirmEmailChangeLanding`: success shows `Your email address has been updated.` with a link to `/app/settings`.

- [ ] **Step 7: Implement `link-landing.tsx` and the three pages**; run `npx vitest run components/auth` — Expected: PASS.

- [ ] **Step 8: Sign-out call sites**

`app-shell.tsx` and `settings-panel.tsx`: `useAuthActions` from `@convex-dev/auth/react` (2.0); confirm `signOut`'s signature in the JSDoc and that the Next.js provider supplies it. Update the two test mocks.

- [ ] **Step 9: Full verification**

Run: `npm run check && npm run test:coverage && npm run build`
Expected: all PASS, coverage thresholds met.

- [ ] **Step 10: Live smoke test against the dev deployment**

Run `npx convex dev --once` then `npm run dev`, and with a headless check (`curl -sI http://localhost:3000/app`) confirm an unauthenticated request redirects to `/sign-in?next=%2Fapp`, and `curl -s http://localhost:3000/sign-up` renders. Then call `signUpWithEmailPassword` once with Dylan's Resend account address via `npx convex run` **only if** Dylan has supplied that address; otherwise leave the email round-trip for Dylan and say so in the handoff. Stop the dev server afterwards.

- [ ] **Step 11: Docs for this PR** — README: rewrite the auth feature bullet (emailed links, no name at sign-up, sign up again to get a new link); add a Resend section (`RESEND_API_KEY`, `SENDER_EMAIL`, optional `SENDER_NAME`, `SITE_URL`; the `onboarding@resend.dev` test sender only reaches the account owner; real users need a verified domain); change the AgentMail section to inbound recipes only (sign-up no longer depends on it); remove the `grandfatherEmailVerification` instructions; add a "Known limitations" note that account deletion leaves an unreachable password hash because Convex Auth 2.0 has no delete for it; add an "Upgrading an existing deployment" note that v1 accounts are not migrated. `.env.example`: replace the trailing comment with the current deployment-only variable names (no Firecrawl).

- [ ] **Step 12: Commit** — `feat: move frontend to Convex Auth 2.0 link flows` (docs may be a separate `docs:` commit).

---

### Task 6: Render blueprint and docs — branch `render-deploy`

**Files:**
- Create: `render.yaml`
- Modify: `README.md`

- [ ] **Step 0:** `git switch -c render-deploy main`

- [ ] **Step 1: `render.yaml`**

```yaml
services:
  - type: web
    name: perfectplate
    runtime: node
    plan: free
    buildCommand: npm ci && npx convex deploy --cmd 'npm run build'
    startCommand: npm run start
    healthCheckPath: /
    envVars:
      - key: NODE_VERSION
        value: 22
      - key: CONVEX_DEPLOY_KEY
        sync: false
```

Confirm `next start` binds Render's `PORT` (Next reads `PORT`) and host `0.0.0.0`; if Render requires an explicit host, change `start` usage in `startCommand` only (`npm run start -- -H 0.0.0.0`), not the `package.json` script.

- [ ] **Step 2: README (additive)**

Keep the Vercel instructions. Under "Deployment", add a "Render" subsection: New → Blueprint → pick the repo → paste a **production** deploy key from the Convex dashboard into `CONVEX_DEPLOY_KEY`; after the first deploy run `npx convex env set SITE_URL https://<service>.onrender.com --prod`; the free plan sleeps when idle. Change the intro sentence to say the frontend can be hosted on Vercel or Render without removing the existing Vercel link.

- [ ] **Step 3: Verify** — `python3 -c "import yaml; yaml.safe_load(open('render.yaml'))"` (or a careful read if PyYAML is missing), and `git diff main --stat` shows only `render.yaml` and `README.md`.

- [ ] **Step 4: Commit** — `feat: add Render blueprint`.

---

### Task 7: Fork deployment branch — branch `deploy` (no upstream PR)

**Files:**
- Modify (conflict resolution only): `package.json`, `README.md`, `.env.example`, `render.yaml`
- Create: `bun.lock` (regenerated), `docs/superpowers/**` (the spec and this plan)

- [ ] **Step 1:** `git switch -c deploy main`, then merge `bun-migration`, `recipe-model-provider`, `convex-auth-2`, `render-deploy` in that order with `--no-ff`. Resolve `package.json` by keeping every dependency change; delete `package-lock.json`; run `bun install` to regenerate `bun.lock`.

- [ ] **Step 2: Bun-flavoured blueprint** — on `deploy` only, change `render.yaml` to `buildCommand: bun install --frozen-lockfile && bunx convex deploy --cmd 'bun run build'`, `startCommand: bun run start`, add `branch: deploy`, and keep `NODE_VERSION` (Next still runs on Node). Confirm from Render's docs that Bun is available in the native Node runtime; if a `BUN_VERSION` variable is needed, add it with value `1.3.11`.

- [ ] **Step 3: Commit the design docs** — remove the `docs/superpowers/` line from `.git/info/exclude` and commit the spec and plan.

- [ ] **Step 4: Full verification** — `bun install --frozen-lockfile && bun run check && bun run test:coverage && bun run build` (with the two test env URLs). Expected: PASS.

- [ ] **Step 5: Push to the dev deployment and smoke test** — `bunx convex dev --once`, `bun run dev`, repeat the two `curl` checks from Task 5 Step 10, stop the server.

- [ ] **Step 6: Commit** — `chore: integrate branches for fork deployment`.

---

## After the plan

Handoff to Dylan (not tasks): say when to push the five branches and open the four upstream PRs (Claude drafts the descriptions per "Branch and PR structure"); create the Render Blueprint service from the `deploy` branch and paste the production deploy key; set production Convex variables; verify a Resend domain; choose and set the recipe model provider key.
