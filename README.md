# PerfectPlate

PerfectPlate is an email-powered recipe organizer and meal-planning application.
The application uses Next.js, TypeScript, Tailwind CSS, and shadcn-style UI
components with Convex for authentication, realtime data, durable recipe
ingestion, and grocery-list workflows. The app scrapes pasted or emailed
recipe links directly, a language model (Anthropic, OpenAI, or OpenRouter)
structures recipe cards, and AgentMail receives recipes forwarded to a shared
inbox.

The frontend can be hosted on Vercel or Render. This fork hosts it on Render,
built from the `deploy` branch; the Vercel setup remains supported. Convex
remains the production database and application backend. See
[Deployment](#deployment).

## Run the code locally

### Prerequisites

- Node.js 22 or newer
- Bun 1.3 or newer

After cloning or pulling the repository, install the dependencies:

```sh
bun install
```

`@ai-sdk/provider` and `@ai-sdk/provider-utils` are pinned to the exact
versions the `ai` package itself depends on, so that `@convex-dev/agent`'s types
match `ai`'s under Bun's install layout. Bump them together with `ai`.

Start the Next.js development server:

```sh
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser. The development
server supports hot reload, so saved frontend changes should appear without
restarting it.

The authenticated application and Recipe Book require Convex. Open a second
terminal in the project root and run:

```sh
bunx convex dev
```

Keep both terminals running during full-stack development:

1. `bun run dev` serves the frontend at `http://localhost:3000`.
2. `bunx convex dev` watches and deploys Convex backend changes to the configured
   development deployment.

### Quality checks

Before sharing changes, run:

```sh
bun run typecheck
bun run lint
bun run build
```

### Tests

The test suite uses Vitest, Testing Library, and `convex-test`. It covers pure
domain logic, interactive React behavior, and authenticated Convex data access.

```sh
bun run test             # one complete run
bun run test:watch       # rerun affected tests while developing
bun run test:coverage    # text and HTML coverage reports
bun run check            # typecheck, lint, and tests
```

Keep tests beside the module they exercise using `*.test.ts` or `*.test.tsx`.
Every bug fix should include a regression test, and new Convex functions should
cover both authorized and unauthorized callers. Generated coverage output is
written to `coverage/` and should not be committed. The GitHub Actions CI
workflow runs checks, coverage floors, and a production build on pushes and
pull requests.

## Frontend features currently supported

The frontend currently includes the following responsive, navigable flows:

- **Marketing and authentication:** landing page plus working password-based
  sign-in, sign-up, and password-recovery screens backed by Convex Auth 2.0.
  Sign-up asks only for an email address and a password (the name can be set
  later in Settings); the account starts once its owner opens the confirmation
  link emailed to them. Password recovery also works through an emailed link.
  Links only work in the browser that requested them and expire; to get a new
  confirmation link, sign up again with the same address. Application routes
  require an authenticated session.
- **Application shell:** responsive desktop sidebar and five-item mobile bottom
  navigation. Recipe Inbox lives with the primary destinations; Log out and
  Settings are grouped at the bottom of the desktop sidebar.
- **Dashboard:** quick access to Discover, the shared Recipe Inbox, grocery
  lists, recent recipes, and a current recipe that can be viewed, changed, or
  cleared.
- **Recipe Book:** Convex-backed, searchable and sortable recipe gallery with
  favorites, a tag filter, a three-column desktop layout, detailed recipe
  pages, and a selection mode for changing the current recipe. The book lists
  the 500 most recently saved recipes and says so when that limit is reached.
- **Recipe details:** ingredients, cooking instructions, serving controls that
  show kitchen fractions and carry the chosen serving count into a grocery
  list, source attribution, favorites, save/current/grocery/source actions,
  and duplicate-grocery-list confirmation. Personal notes and favorites are
  available once a recipe is in the Recipe Book. Editing and removal are
  offered only to the account that imported or created the recipe; anyone else
  can remove it from their own book.
- **Recipe importing:** authenticated users can search the web for recipes or
  paste recipe links on Discover, or forward recipe emails to one configured AgentMail inbox. The Recipe Inbox
  shows received and processing states, successful recipe previews, and clear
  failures. One plausible recipe URL is selected per email, inbound events and
  notifications are deduplicated, and the same URL validation and failure rules
  apply to both direct and email imports. The app scrapes the page before the
  recipe agent creates a structured preview; the recipe enters the
  Recipe Book only when the user explicitly saves it. A failed import offers
  **Try again**. Resubmitting a link retries it automatically unless the agent
  already read the page and found no complete recipe; each link is limited to
  five attempts. Pages that need the model use the user's own AI key (see
  [AI provider keys](#ai-provider-keys)). Without one, imports still start, and
  pages with complete recipe data import as usual. A page that needs the model
  fails with a request to add a key in Settings; forwarded emails show
  **Needs an AI key** with **Try again**. An email whose import failed because
  of the user's provider account (rejected key, no credit, rate limit, unknown
  model) shows the reason and **Try again** too.
- **Weekly planner:** plan breakfast, lunch and dinner a week at a time. Each
  slot is Cook, Leftovers, Eat out or Skip. A Cook slot can attach a saved
  recipe, create one, or import a pasted link; Leftovers point back at an
  earlier meal. A week can be copied from an earlier one, the last change can
  be undone, and the dashboard shows today's planned meals. Each week has a
  grocery list built from its Cook slots, scaled by the number of people and
  the leftovers planned from each meal. The meals to plan, the week's first
  day and the number of people are planner preferences.
- **Grocery lists:** list overview plus an interactive editor that can add,
  rename, check off, remove, restore, and change the quantity or unit of grocery
  items. Users can create recipe-named lists from saved recipe ingredients,
  merge two lists into a user-named replacement, delete a list, and save new or
  existing lists atomically to Convex. Checking an item off a saved list is
  stored immediately. Changes made to the same list elsewhere appear in an
  open editor, and saving removes only the items that were removed in that
  editor. Items from recipes are grouped by store section.
- **Settings:** profile details, the AI provider key, and account deletion.
- **Design-system states:** responsive layouts, accessible focus behavior,
  loading skeletons, alerts, dialogs, empty-state scaffolding,
  and a custom not-found page.

Generated recipe lists and manually created lists use the Convex-backed editor;
see `FRONTEND_DESIGN_GAPS.md` for remaining design decisions.

## Setup

### Convex project

Install dependencies and connect the local checkout to its Convex development
deployment:

```sh
bun install
bunx convex dev
```

### Recipe page scraping

Direct, email-forwarded, and pasted-link recipe URLs run through a durable
workflow that fetches the page itself (`convex/recipeWebScrape.ts`), extracts
its schema.org Recipe JSON-LD and a markdown-ish rendering of the page text,
and stores that as bounded source evidence before agent processing. There is
no external scraping API or API key to configure for this step; it uses the
Convex deployment's own outbound `fetch` and the `cheerio` HTML parser. Page
and image downloads resolve each hostname and refuse private or loopback
addresses, and enforce their time and size limits while the body is read.

### Recipe search

Discover can search the web for recipes through the
[Tavily](https://www.tavily.com) search API (`convex/recipeSearch.ts`). Results
are filtered down to individual recipe pages, and choosing one sends its URL
through the same import workflow as a pasted link. Each distinct query is
cached in Convex for seven days, so repeats do not use search credits.

Create a Tavily API key (the free plan includes 1,000 searches a month) and
store it on the Convex deployment:

```sh
bunx convex env set TAVILY_API_KEY
```

Without the key, search shows a "not set up" message and pasted links keep
working.

### AI provider keys

After the page is scraped, the Convex Agent component sends it to a language
model (`convex/recipeAgent.ts`). It creates an editable recipe preview and
stores its structured ingredients. The user can then save it to the Recipe
Book, set it as current, or create a grocery list from its non-optional
ingredients. Agent threads and messages are still persisted by the Convex Agent
component, while normalized recipe and grocery data lives in the application's
Convex tables.

When the page publishes a complete schema.org `Recipe` in JSON-LD (a title,
ingredients, and instructions), the preview is built from that data directly
and no model is called (`convex/lib/recipeJsonLd.ts`). Ingredient lines are
parsed and given a grocery aisle by keyword; these imports record
`schema.org-json-ld` as their model. Pages without complete structured data
go to the model as described below.

Model output is cached by page URL for 30 days in `recipeExtractions` and shared
across users, so a page someone has already imported is not sent to the model
again. Before a page is sent, reader comments and reviews after the recipe are
dropped and the page text is capped, more tightly when JSON-LD is also sent.
The extraction step is retried once on failure, and each attempt is sent
without the earlier attempts' messages from the agent thread.

Every AI feature runs on a key the user supplies. Under **Settings → AI
provider**, each user picks Anthropic, OpenAI, or OpenRouter, enters a model,
and pastes an API key; calls are billed to their own provider account. There is
no deployment-level model key. A user without a saved key can still import:
pages with complete structured data, or with a cached result, import without
calling the model. A page that needs the model fails with a request to add a
key in Settings, and **Try again** works once one is saved; that failure does
not count toward the link's five attempts.

- Anthropic's model is optional and defaults to `claude-sonnet-5`.
- OpenAI and OpenRouter need a model that supports structured output. For
  OpenRouter, use its `vendor/model` identifier; it is reached through the AI
  SDK's OpenAI-compatible provider at `https://openrouter.ai/api/v1`.
- Saving makes a free metadata call to the provider (no tokens): Anthropic's
  model list checks the key, OpenAI's model lookup checks the key and model,
  and OpenRouter's key and model endpoints check the key, the model, and its
  structured-output support.
- The key is encrypted with AES-256-GCM before it is stored, and is never sent
  back to the browser; Settings shows only its last four characters.

Keys are encrypted with `AI_KEY_ENCRYPTION_SECRET`, 32 random bytes as base64.
Set a different value on every Convex deployment (your dev deployment,
`staging`, and production):

```sh
openssl rand -base64 32
bunx convex env set AI_KEY_ENCRYPTION_SECRET                 # dev
bunx convex env set AI_KEY_ENCRYPTION_SECRET --deployment staging
bunx convex env set AI_KEY_ENCRYPTION_SECRET --prod
```

Without it, saving keys and every AI feature are refused. Changing it makes
every saved key unreadable: each user is asked to paste their key again.

No model API key belongs in the frontend, `.env.local`, the repository, or the
Convex deployment environment. A failure caused by a user's key or provider
account (rejected key, no credit, rate limit, unknown model, a model without
structured output) is recorded on the import with a message telling them what
to fix, and does not use up one of the five attempts. Uncertain or truncated
results are marked as needing review.

The backend exposes authenticated operations for editing recipe fields,
instructions, ingredients, quantities, personal notes, grocery lists, and
grocery items. Recipe-card removal is a soft deletion so generated grocery data
can remain independent; deleting a grocery list removes that list and its item
provenance without deleting the recipe.

### Account email (Resend)

Convex Auth sends the sign-up confirmation, password-reset, and
email-change links through the [Resend](https://resend.com) Convex component.
Create a Resend API key and set it, the sender, and the frontend origin the
links point at on the Convex deployment:

```sh
bunx convex env set RESEND_API_KEY
bunx convex env set SENDER_EMAIL
bunx convex env set SENDER_NAME   # optional, defaults to PerfectPlate
bunx convex env set SITE_URL      # e.g. http://localhost:3000 for development
```

Without `SENDER_EMAIL`, mail is sent from Resend's test sender,
`onboarding@resend.dev`, which only delivers to the email address of the
Resend account owner. To let real users sign up, verify a domain in Resend and
use a sender address on it. `SITE_URL` defaults to `http://localhost:3000`.

### AgentMail

The official AgentMail Convex component stores inbox messages and threads,
verifies inbound webhook signatures, and routes recipe links into the
`recipeImports` table.

Open the [AgentMail console](https://console.agentmail.to) and select the
AgentMail account used by PerfectPlate. Create an API key, then select the
shared PerfectPlate inbox. Copy its inbox ID, which is usually the inbox email
address (`perfectplate@agentmail.to`). The inbox and API key must belong to the
same AgentMail account.

Store both values directly on the Convex development deployment. Omit each
value from the command so the CLI prompts for it without placing the secret in
your shell history:

```sh
bunx convex env set AGENTMAIL_API_KEY
bunx convex env set AGENTMAIL_INBOX_ID
```

If you need to target a particular deployment explicitly, append its deployment
name to both commands:

```sh
bunx convex env set AGENTMAIL_API_KEY --deployment <deployment-name>
bunx convex env set AGENTMAIL_INBOX_ID --deployment <deployment-name>
```

PerfectPlate uses this single configured inbox only to receive forwarded
recipes; account email goes through Resend, so sign-up does not depend on
AgentMail. It never creates AgentMail inboxes automatically.
Users should forward recipes from the email address they use to sign in so the
inbound webhook can privately associate each message with the correct account.
Forwards are attributed only to accounts whose email address is confirmed. The
match still relies on the message's From address, which AgentMail does not
authenticate for the application.
After changing either value, run
`bunx convex dev --once` so the development backend is refreshed before testing
email delivery.

Register this endpoint in the AgentMail console so forwarded messages reach the
application:

```text
https://<your-convex-site>/agentmail/webhook
```

Copy the webhook signing secret into Convex:

```sh
bunx convex env set AGENTMAIL_WEBHOOK_SECRET
```

Do not store the API key or webhook signing secret in `.env.local` or Git.

## Deployment

The Next.js frontend deploys to Vercel (or to Render; see [Render](#render))
and the backend to Convex.

In the Vercel project settings:

- Set the build command to `bunx convex deploy --cmd 'bun run build'` so each
  production build deploys the Convex functions first and receives
  `NEXT_PUBLIC_CONVEX_URL` automatically. Vercel detects Bun from `bun.lock`
  and uses it to install dependencies.
- Add `CONVEX_DEPLOY_KEY` (a production deploy key from the Convex dashboard)
  to the Production environment only.

On the production Convex deployment, set the site URL that the emailed links
point at, alongside the Resend, `AI_KEY_ENCRYPTION_SECRET`, and AgentMail
values described above:

```sh
bunx convex env set SITE_URL https://perfectplate.vercel.app --prod
```

Register the production webhook, `https://<production-deployment>.convex.site/agentmail/webhook`,
in the AgentMail console. API keys and webhook secrets stay on the Convex
deployment; none belong in Vercel or Git.

### Render

The repository also includes a Render Blueprint, `render.yaml`, that runs the
frontend as a Node web service. It uses the same build as Vercel
(`bunx convex deploy --cmd 'bun run build'`), so each deploy pushes the Convex
functions first and builds with the production `NEXT_PUBLIC_CONVEX_URL`.

On this fork, the Render service is created from the `deploy` branch, because
`render.yaml` does not exist on `main`. Push `deploy` before creating the
service.

1. In the Render dashboard, choose **New** → **Blueprint**, pick this
   repository, and select the `deploy` branch.
2. When prompted for `CONVEX_DEPLOY_KEY`, paste a **production** deploy key
   from the Convex dashboard. Render asks for it only when the Blueprint is
   first created; change it later in the service's environment settings.
3. After the first deploy, point Convex Auth at the Render URL:

   ```sh
   bunx convex env set SITE_URL https://<service>.onrender.com --prod
   ```

   `SITE_URL` holds a single origin, so setting it to the Render URL replaces
   the Vercel one for emailed links and redirects; a production Convex
   deployment serves one frontend host at a time.

The production Convex setup above (the AgentMail webhook and the API keys on
the Convex deployment) applies to Render the same way. The Blueprint uses
Render's free plan, which spins the service down when it is idle, so the first
request after a quiet period waits while it starts again.

### Upgrading an existing deployment

#### Bring-your-own AI keys

The recipe model no longer reads `RECIPE_AGENT_PROVIDER`,
`RECIPE_AGENT_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or
`OPENROUTER_API_KEY`. To upgrade a deployment:

1. Generate a secret with `openssl rand -base64 32` and set it with
   `bunx convex env set AI_KEY_ENCRYPTION_SECRET` (plus `--prod` or
   `--deployment <name>`) before deploying.
2. Deploy as usual.
3. Save your own provider key under **Settings → AI provider**.
4. Remove the old variables, one at a time:

   ```sh
   bunx convex env remove RECIPE_AGENT_PROVIDER
   bunx convex env remove RECIPE_AGENT_MODEL
   bunx convex env remove ANTHROPIC_API_KEY
   bunx convex env remove OPENAI_API_KEY
   bunx convex env remove OPENROUTER_API_KEY
   ```

5. Revoke the old provider key if nothing else uses it.

Imports in progress during the upgrade fail with a request to add an AI key,
and can be retried once one is saved.

#### Convex Auth 2.0

This version moves to Convex Auth 2.0, which cannot yet migrate Convex Auth v1
accounts. After upgrading, every user registers again. The v1 `users` rows stay
in the database with their old fields. Once a user has registered again with
the same email address, an operator can move the v1 account's data onto the
new account with the functions in `convex/legacyAccounts.ts`.

## Known limitations

- Deleting an account revokes its sessions and removes its email addresses,
  but leaves its password hash behind, because Convex Auth 2.0 has no function
  to delete it. The hash can no longer be reached once the email addresses are
  gone.
