---
name: emulate
description: >
  Set up and use the `emulate` package for local API emulation in tests and CI.
  Covers CLI usage, programmatic API (`createEmulator`), seed config, and
  integration test patterns for GitHub, Vercel, Google, Slack, Apple, Microsoft,
  and AWS emulators. Use when configuring emulate, writing tests against emulated
  APIs, or setting up CI pipelines with emulated services.
---

# Emulate

You help developers set up and use `emulate` — a local drop-in replacement for production APIs (GitHub, Vercel, Google, Slack, Apple, Microsoft, AWS). All state is in-memory, fully stateful, and production-fidelity. Not mocks.

## When to use this skill

- Setting up emulate in a new or existing project
- Writing integration tests that hit emulated APIs
- Configuring seed data for emulated services
- Adding emulate to CI pipelines
- Switching from mocked API calls to emulated services
- Debugging emulate configuration or connectivity issues

## Available services

| Service       | Key capabilities |
|---------------|-----------------|
| **github**    | Users, repos, issues, PRs, comments, reviews, labels, milestones, branches, git data, orgs, teams, releases, webhooks, search, actions, checks, OAuth apps, GitHub Apps (JWT) |
| **vercel**    | User, teams, projects, deployments, domains, env vars, API keys, OAuth integrations, file uploads, protection bypass |
| **google**    | OAuth 2.0/OIDC, Gmail (messages/drafts/threads/labels/history/settings), Calendar (events/lists/freebusy), Drive (files/uploads) |
| **slack**     | Auth, chat, conversations, users, reactions, team, OAuth, incoming webhooks, signing secret verification |
| **apple**     | Sign In with Apple OAuth, JWT/JWKS, private relay emails |
| **microsoft** | Entra ID OAuth 2.0/OIDC, Graph /me, tenant isolation |
| **aws**       | S3 (buckets/objects), SQS (queues/messages), IAM (users/roles/access keys), STS (assume role, caller identity) |

## CLI usage

```bash
# Zero-config — all services on port 4000+
npx emulate

# Specific services
npx emulate --service github,vercel

# Custom port
npx emulate --port 3000

# With seed config
npx emulate --seed emulate.config.yaml

# Generate a starter config
npx emulate init
npx emulate init --service github

# List available services
npx emulate list
```

Port auto-increments per service: github on 4000, vercel on 4001, google on 4002, etc.

Environment variables `EMULATE_PORT` or `PORT` override the default base port.

## Programmatic API (for tests)

```typescript
import { createEmulator } from "emulate";

const github = await createEmulator({
  service: "github",
  port: 14000,
  seed: {
    github: {
      users: [{ login: "test-user" }],
      repos: [{ owner: "test-user", name: "my-repo", auto_init: true }],
    },
  },
});

// github.url → "http://localhost:14000"
// github.reset() → wipe store, re-seed
// github.close() → shutdown server
```

### Vitest integration pattern

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createEmulator, type Emulator } from "emulate";

let github: Awaited<ReturnType<typeof createEmulator>>;

beforeAll(async () => {
  github = await createEmulator({
    service: "github",
    port: 14000,
    seed: {
      tokens: {
        "test-token": { login: "testuser", scopes: ["repo", "user"] },
      },
      github: {
        users: [{ login: "testuser", name: "Test User", email: "test@example.com" }],
        repos: [{ owner: "testuser", name: "my-repo" }],
      },
    },
  });
});

afterEach(() => {
  github.reset(); // Clean state between tests
});

afterAll(async () => {
  await github.close();
});

it("fetches the authenticated user", async () => {
  const res = await fetch(`${github.url}/user`, {
    headers: { Authorization: "Bearer test-token" },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.login).toBe("testuser");
});
```

### Multiple services

```typescript
const [github, vercel, google] = await Promise.all([
  createEmulator({ service: "github", port: 14000 }),
  createEmulator({ service: "vercel", port: 14001 }),
  createEmulator({ service: "google", port: 14002 }),
]);

// Point your app at emulated URLs
process.env.GITHUB_API_URL = github.url;
process.env.VERCEL_API_URL = vercel.url;
process.env.GOOGLE_API_URL = google.url;
```

## Seed config format

The config file (`emulate.config.yaml`) has two top-level sections:

### 1. Tokens (shared across services)

```yaml
tokens:
  gho_test_token_admin:
    login: admin
    scopes: [repo, user, admin:org, admin:repo_hook]
  gho_test_token_user1:
    login: octocat
    scopes: [repo, user]
```

Tokens map to users. Pass as `Authorization: Bearer <token>` or `Authorization: token <token>`.

Default token (when no tokens configured): `gho_test_token_admin` with login `admin`.

### 2. Service-specific seed data

Each service key contains arrays of entities to pre-populate:

```yaml
github:
  users:
    - login: octocat
      name: The Octocat
      email: octocat@github.com
  orgs:
    - login: my-org
      name: My Organization
  repos:
    - owner: octocat
      name: hello-world
      description: My first repository
      language: JavaScript
      topics: [hello, world]
      auto_init: true
  oauth_apps:
    - client_id: my_client_id
      client_secret: my_client_secret
      name: My App
      redirect_uris:
        - http://localhost:3000/callback
  apps:
    - app_id: 12345
      slug: my-github-app
      name: My GitHub App
      private_key: |
        -----BEGIN RSA PRIVATE KEY-----
        ...
        -----END RSA PRIVATE KEY-----
      permissions:
        contents: read
        issues: write
      installations:
        - installation_id: 100
          account: octocat
          repository_selection: all

vercel:
  users:
    - username: developer
      email: dev@example.com
  teams:
    - slug: my-team
      name: My Team
  projects:
    - name: my-app
      team: my-team
      framework: nextjs
  integrations:
    - client_id: oac_abc123
      client_secret: secret_abc123
      name: My Vercel App
      redirect_uris:
        - http://localhost:3000/callback

google:
  users:
    - email: testuser@gmail.com
      name: Test User
  oauth_clients:
    - client_id: google_client_id
      client_secret: google_client_secret
      name: My Google App
      redirect_uris:
        - http://localhost:3000/callback
  messages:
    - id: msg_welcome
      user_email: testuser@gmail.com
      from: welcome@example.com
      to: testuser@gmail.com
      subject: Welcome
      body_text: Hello world
      label_ids: [INBOX, UNREAD]
  calendars:
    - id: primary
      user_email: testuser@gmail.com
      summary: testuser@gmail.com
      primary: true
  calendar_events:
    - id: evt_1
      user_email: testuser@gmail.com
      calendar_id: primary
      summary: Meeting
      start_date_time: "2025-01-10T09:00:00.000Z"
      end_date_time: "2025-01-10T09:30:00.000Z"
  drive_items:
    - id: drv_folder
      user_email: testuser@gmail.com
      name: Documents
      mime_type: application/vnd.google-apps.folder
      parent_ids: [root]

slack:
  team:
    name: My Workspace
    domain: my-workspace
  users:
    - name: bot
      real_name: Bot User
      email: bot@example.com
      is_admin: false
  channels:
    - name: general
      topic: General discussion
  oauth_apps:
    - client_id: slack_client_id
      client_secret: slack_client_secret
      name: My Slack App
      redirect_uris:
        - http://localhost:3000/callback
  incoming_webhooks:
    - channel: general
      label: Notifications

apple:
  users:
    - email: user@icloud.com
      name: Apple User
  oauth_clients:
    - client_id: com.example.app
      team_id: TEAMID123
      name: My iOS App
      redirect_uris:
        - http://localhost:3000/callback

microsoft:
  users:
    - email: user@outlook.com
      name: MS User
      tenant_id: "9188040d-6c67-4c5b-b112-36a304b66dad"
  oauth_clients:
    - client_id: ms_client_id
      client_secret: ms_client_secret
      name: My Azure App
      redirect_uris:
        - http://localhost:3000/callback

aws:
  region: us-east-1
  s3:
    buckets:
      - name: my-bucket
        region: us-east-1
  sqs:
    queues:
      - name: my-queue
        fifo: false
  iam:
    users:
      - user_name: deploy-user
        create_access_key: true
```

## Authentication patterns

### Token auth (GitHub, Vercel, Slack)

```bash
curl -H "Authorization: Bearer gho_test_token_admin" http://localhost:4000/user
```

### OAuth flows (GitHub, Google, Vercel, Apple, Microsoft)

The emulator implements full OAuth 2.0 authorization code flow:
1. Redirect to emulator's authorize endpoint
2. Emulator shows user-picker consent screen
3. Redirect back with authorization code
4. Exchange code for access token
5. Use token to call API

### GitHub Apps (JWT)

Sign a JWT with `{ iss: "<app_id>" }` using the app's private key (RS256). Create installation access tokens via:

```bash
curl -X POST -H "Authorization: Bearer <jwt>" \
  http://localhost:4001/app/installations/100/access_tokens
```

## CI setup

```yaml
# GitHub Actions example
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
        env:
          GITHUB_API_URL: http://localhost:14000
          VERCEL_API_URL: http://localhost:14001
```

No special CI setup needed — emulate runs in-process via `createEmulator()` in your test files.

For CLI-based CI (starting emulator as a sidecar):

```yaml
- name: Start emulator
  run: npx emulate --service github --port 14000 --seed emulate.config.yaml &
- name: Wait for emulator
  run: curl --retry 5 --retry-delay 1 --retry-connrefused http://localhost:14000/meta
- name: Run tests
  run: pnpm test
```

## Common patterns

### Replace environment variables for your app

```typescript
// In test setup, point your app's SDK clients at the emulator
process.env.GITHUB_URL = github.url;        // Instead of https://api.github.com
process.env.VERCEL_API = vercel.url;         // Instead of https://api.vercel.com
process.env.GOOGLE_AUTH_URL = google.url;    // Instead of https://accounts.google.com
```

### Test webhook delivery

```typescript
// Seed a GitHub app with webhook config
const github = await createEmulator({
  service: "github",
  port: 14000,
  seed: {
    github: {
      apps: [{
        app_id: 1,
        slug: "test-app",
        name: "Test App",
        webhook_url: "http://localhost:3000/webhooks/github",
        webhook_secret: "test-secret",
        installations: [{ installation_id: 100, account: "testuser", repository_selection: "all" }],
      }],
    },
  },
});
```

### Generate starter config

```bash
npx emulate init                    # All services
npx emulate init --service github   # Just GitHub
```

This creates `emulate.config.yaml` with commented examples.

## Debugging

- Set `DEBUG=1` or `EMULATE_DEBUG=1` to enable debug logging
- The emulator prints a startup banner showing URLs, enabled services, and loaded config
- Rate limiting is built-in (5000 req/hour per token) with `X-RateLimit-*` headers
- All state is in-memory — restart or `reset()` to get a clean slate
- Config auto-detection checks: `emulate.config.yaml`, `emulate.config.yml`, `emulate.config.json`
