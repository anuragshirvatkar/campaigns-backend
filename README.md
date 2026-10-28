# Campaign One — API

Backend for the Campaign Amplification mobile app: people create campaigns, backers fund the
**advertising that spreads a message** (not a donation to the cause), and the platform reports reach.

Node 20 · Express 5 · TypeScript · Prisma 6 · PostgreSQL 16 · Cloudinary · OpenAI

- **Live:** `https://campaign-one.64-227-171-165.sslip.io/api`
- **Demo login:** `demo@campaignone.app` / `Demo@1234`
- **Test cards:** `4242 4242 4242 4242` succeeds · `4000 0000 0000 0002` declined · `4000 0000 0000 9995` insufficient funds · `4000 0000 0000 0119` provider error

## Run locally

```bash
cp .env.example .env        # then fill in secrets
npm install
npm run db:up               # Postgres in Docker on port 5433
npm run db:migrate          # create tables
npm run db:seed             # demo users + campaigns (add -- --reset to recreate)
npm run admin:create        # the one admin account (humanity-admin@gmail.com)
npm run dev                 # http://localhost:4000/api
```

| Script | |
|---|---|
| `npm run dev` | API with auto-reload |
| `npm run typecheck` | TypeScript check |
| `npm run test:e2e` | End-to-end test of every flow (local DB, fast timers; see `tests/e2e.mjs`) |
| `npm run db:studio` | Browse the database |
| `npm run admin:create` | Create the admin (or re-mark it admin; `-- --reset-password` resets the password). Server: `docker compose run --rm api node dist/scripts/create-admin.js` |
| `npm run deploy` | Build locally, ship to the droplet, migrate, restart, health-check |

Speed up the demo lifecycle (distribution, ad delivery) with `DEMO_STEP_SEC=5` in `.env`.

## Structure

```
src/
  server.ts, app.ts, routes.ts    start-up, middleware, route table
  config/       env.ts (validated .env), app.config.ts (fees, reach model, limits, timers)
  lib/          prisma, jwt, cloudinary, openai, dummy-payment
  middlewares/  auth, validate (zod), rate limits, error handler
  jobs/         scheduler: timed lifecycle steps every few seconds
  modules/<feature>/
    <feature>.routes.ts       URL → middleware → controller
    <feature>.controller.ts   HTTP in/out only
    <feature>.service.ts      business logic + database
    <feature>.schema.ts       zod request schemas
  scripts/seed.ts
prisma/schema.prisma, migrations/, seed-images/
deploy/docker-compose.yml, scripts/deploy.sh, Dockerfile
```

## Key rules

- **Money** is integer cents (USD). The 20% platform fee is inside the contribution ($25 → $20 ads + $5 fee); ~2.9% card processing is added on top.
- **Funding totals are never stored**; they're computed from succeeded contributions.
- **Lifecycle:** draft → submitted → (the admin approves) funding → funded *or* funding_ended → distribution_prep → promoting → completed. Also `cancelled`. Keep-what-you-raise: a campaign that ends under goal still promotes with what it raised; there are no refunds.
- **Review** is done by the one admin (`role = admin`, created only by `src/scripts/create-admin.ts`, never by the API). Each submission is pre-screened automatically (AI, or built-in rules) and the result is shown to the admin as a suggestion only. The admin approves, asks for changes (creator edits and resubmits) or rejects. A campaign that was live before can't be rejected, only sent back for changes.
- **Editing** is allowed in draft / submitted / approved / funding. Editing a live campaign sends it back through review (deadline unchanged). Locked once funded.
- **Reach** is always an estimate range: `0.8 × 1000 / (CPM $16.34 × frequency 1.8) ≈ 27 people per $1`. Measured delivery (simulated ad platform) is reported separately.
- **Notifications** go to the campaign owner + followers. Backing a campaign follows it. Each event is sent once per person (dedupe key).

## API

All responses are JSON. Errors: `{ "error": { "code", "message", "details?" } }`.
Auth: `Authorization: Bearer <token>` (30-day JWT from signup/login). 🔒 = login required.

### Account
| | | |
|---|---|---|
| POST | `/auth/signup` | `{ email, password (8+), fullName }` → `{ token, user }` |
| POST | `/auth/login` | `{ email, password, role?: user|admin }` → `{ token, user }`; 403 `WRONG_ROLE` if the role doesn't match the account |
| POST | `/contributions` | Signed in **or guest** (no token). `{ campaignId, amountCents, isPublic, idempotencyKey, guestEmail? }` → pending contribution; guests also get `guestToken`, sent back as `X-Guest-Token` on `/contributions/:id`, `/confirm`, `/cancel` |
| POST | `/auth/google` | `{ idToken }` (Google ID token for the web client) → `{ token, user }`; signs in the account with that email or creates one |
| POST | `/auth/forgot-password` | `{ email }` → always `{ message }`; emails a 6-digit code (15 min) via Resend if the account exists |
| POST | `/auth/reset-password` | `{ email, code, newPassword }` → `{ token, user }`; the code dies once the password changes |
| GET 🔒 | `/me` | Profile + counts (created, backed, following) |
| PATCH 🔒 | `/me` | `{ fullName?, avatarUrl? }` |
| GET/PUT 🔒 | `/me/notification-preferences` | `{ push, muted: category[] }` with categories my_campaigns, funding, payments, promotion, updates. Muted categories are not sent; push only when on; security alerts always |
| POST 🔒 | `/me/password` | `{ currentPassword, newPassword }` (sends a security notification) |

Logging out = delete the token on the device.

### Browse (no login)
| | | |
|---|---|---|
| GET | `/config` | Fees, reach model, presets, durations, categories, channels, test cards, voice prompts |
| GET | `/campaigns` | `?q= &category= &status= &featured=true &sort=newest\|most_funded\|ending_soon\|nearly_funded &limit= &offset=` → `{ items, nextOffset }` |
| GET | `/campaigns/:idOrSlug` | Full page: story, sources, ad, reach, timeline, use of funds, public backers, counts, `viewer` (if logged in) |
| GET | `/campaigns/:idOrSlug/report` | Distribution report: funds, measured delivery, estimate, by channel, time series |
| GET | `/campaigns/:id/updates` | Creator updates |
| GET | `/campaigns/:id/comments` | Threads with one level of replies |
| GET | `/demo-docs/:slug` | HTML demo documents the seeded campaigns link to (sources, calls to action). Existing data: `node dist/scripts/demo-links.js` |

### Create (creator) 🔒
| | | |
|---|---|---|
| POST | `/me/campaigns` | `{ creationMode: "manual"\|"voice" }` → new draft |
| GET | `/me/campaigns` | `?tab=drafts\|under_review\|funding\|promoting\|completed\|requires_action` → `{ items, counts }` |
| GET | `/me/campaigns/:id` | Editable campaign + `readiness { issues, warnings, canSubmit }` (each with `step` 1–5) |
| PATCH | `/me/campaigns/:id` | Autosave any fields (see `campaigns.schema.ts`). On a live campaign, sends it back to review |
| DELETE | `/me/campaigns/:id` | Drafts only |
| POST | `/me/campaigns/:id/submit` | 422 with `details: [{ field, step, message }]` if incomplete |
| POST | `/me/campaigns/:id/cancel` | Only before the first contribution |
| GET | `/me/campaigns/:id/analytics` | Report + funding over time, milestones, followers, feedback tallies |
| POST | `/campaigns/:id/updates` | `{ title, body }`, owner only; notifies followers |
| POST | `/uploads` | multipart `file` + `purpose=cover\|ad\|story\|avatar` → `{ url, type, width, height, … }` |
| POST | `/ai/transcribe` | multipart `file` (audio) → `{ mode, text }` |
| POST | `/ai/draft` | `{ text }` → `{ mode, draft }` (never sources or a funding goal) |
| POST | `/ai/creative-feedback` | `{ imageUrl, title?, adHeadline?, adDescription?, ctaText? }` → `{ mode, strengths, suggestions }` |

`mode` is `"ai"` or `"demo"` (no key / AI unavailable). AI routes are rate limited.

### Back a campaign 🔒
| | | |
|---|---|---|
| POST | `/contributions` | `{ campaignId, amountCents, isPublic?, idempotencyKey }` → pending + fee breakdown + estimated reach |
| POST | `/contributions/:id/confirm` | `{ cardNumber }` → succeeded / rejected / failed (+ updated campaign funding) |
| POST | `/contributions/:id/cancel` | Cancel a pending payment |
| GET | `/contributions/:id` | Receipt |
| GET | `/me/contributions` | Payment history |
| GET | `/me/backed` | Backed campaigns with my total |

### Admin (admin account only)
| | | |
|---|---|---|
| GET | `/admin/campaigns` | `?tab=pending|changes_requested|approved|rejected` → `{ items, counts }`; items carry creator, `aiSuggestion`, `isResubmission` |
| GET | `/admin/campaigns/:id` | Full campaign + creator, AI suggestion, review history, `canReject` |
| POST | `/admin/campaigns/:id/review` | `{ decision: approved|changes_requested|rejected, note?, issues?: [{ step, message }] }` (note or issues required unless approving) |
| GET | `/admin/analytics` | `?days=7|30|90` → KPIs vs previous period, all-time totals, review stats, daily series, categories, payments, delivery by channel, funnel, engagement, top campaigns |

### Sam, the voice assistant 🔒
| | | |
|---|---|---|
| POST | `/assistant/turn` | Voice: multipart `file` (m4a) + `context` (JSON string). Typed: `{ text, context }`. `context = { screen, editor?, history }`. → `{ transcript, reply, actions, audioUrl }`; actions: navigate, open_campaign, back_campaign, search, show_category, new_draft, draft_from_idea, fill_field, go_step, turn_off |
| POST | `/assistant/speak` | `{ text }` → `{ audioUrl }` (intro tour lines) |
| GET | `/assistant/audio/:id` | The MP3 clip (public, unguessable id, 10 min) |

Voice: ElevenLabs when `ELEVEN_LABS_API_KEY` is set (`ELEVEN_LABS_VOICE_ID` picks the voice), otherwise OpenAI `tts-1` with `OPENAI_TTS_VOICE` (default ash). Users have `appIntroduced` (tour done) and `assistantEnabled`, both changeable via `PATCH /me`.

### Engage 🔒
| | | |
|---|---|---|
| PUT / DELETE | `/campaigns/:id/follow` | Follow / unfollow |
| GET | `/me/follows` | Followed campaigns |
| PUT | `/campaigns/:id/feedback` | `{ visualsAnswer?, changedMindAnswer? }`: `no\|somewhat\|yes` |
| POST | `/campaigns/:id/comments` | `{ body, parentId? }` |
| DELETE | `/comments/:id` | Author or campaign owner |
| POST | `/comments/:id/report` | `{ reason: spam\|abusive\|misleading\|other }`; hidden after 3 reports |
| GET | `/me/notifications` | `?limit= &offset=` |
| GET | `/me/notifications/unread-count` | `{ count }` for the tab badge |
| POST | `/me/notifications/:id/read`, `/me/notifications/read-all` | |
