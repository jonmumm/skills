---
name: storybook-play-testing
description: >
  Storybook play function integration testing for TanStack Start/Router apps.
  Covers Vite config for blocking server code, router/query/theme decorators,
  state mocking strategies (props, collections, React Query cache, actor-kit),
  play function patterns, viewport coverage, and vitest browser test runner.
  Use when writing Storybook stories, setting up Storybook in a TanStack Start
  project, testing route-level pages, or adding play function interaction tests.
---

# Storybook Play Function Testing

Integration tests that render real components in a real browser. No mocks of what you own — mock only the server boundary, then test real behavior through real DOM interactions.

## When to Use

- Setting up Storybook in a TanStack Start/Router project
- Writing stories for route-level pages or shared components
- Adding play function interaction tests
- Testing form flows, state transitions, edge cases
- Verifying responsive behavior (desktop + mobile)

## The Problem: TanStack Start + Storybook

TanStack Start has SSR, server functions (`createServerFn`), Cloudflare Workers entry points, and a generated route tree — all of which crash in Storybook's browser-only preview.

## Setup

### Using the published addon (recommended)

```bash
pnpm add -D storybook-addon-tanstack-start
```

This single package handles everything: server-side import stubbing, TanStack/Nitro plugin stripping, router context, route params, search params, and loader data.

```typescript
// .storybook/main.ts
import { tanstackStartPlugin } from 'storybook-addon-tanstack-start/plugin'
import { mergeConfig } from 'vite'

const config = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-themes',
  ],
  framework: { name: '@storybook/react-vite', options: {} },
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [tanstackStartPlugin({
        // Stub your app's server modules too
        additionalServerModules: ['~/lib/auth/server', '~/lib/billing/server'],
      })],
    })
  },
}
export default config
```

```typescript
// .storybook/preview.ts — router decorator auto-applied
export { decorators } from 'storybook-addon-tanstack-start/preview'
```

For app-specific server modules, alias them to mock files:

```typescript
// .storybook/mocks/auth-server.ts
export async function loginWithPassword({ data }: LoginInput) {
  if (data.email === 'test@example.com' && data.password === 'password123')
    return { ok: true as const, role: 'parent' as const }
  return { ok: false as const, error: 'Invalid email or password' }
}
```

```typescript
// in .storybook/main.ts resolve.alias:
'~/lib/auth/server': path.resolve(__dirname, 'mocks/auth-server.ts'),
```

### 4. Query Decorator (`.storybook/decorators/QueryDecorator.tsx`)

Provides React Query context with optional cache pre-population:

```typescript
import type { Decorator } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

export const withQuery: Decorator = (Story, context) => {
  const queryConfig = context.parameters?.query || {}

  const queryClient = React.useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false, // Fast failures in tests
          ...queryConfig.options?.queries,
          ...(queryConfig.enabled === false && { enabled: false }),
        },
        mutations: { retry: false, ...queryConfig.options?.mutations },
      },
    })

    // Pre-populate cache
    if (queryConfig.mockData) {
      Object.entries(queryConfig.mockData).forEach(([key, data]) => {
        const queryKey = Array.isArray(key) ? key : JSON.parse(key)
        client.setQueryData(queryKey, data)
      })
    }

    return client
  }, [queryConfig])

  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  )
}
```

### 5. Preview (`.storybook/preview.ts`)

Wire decorators in correct order — outermost first. The router decorator comes
from the addon; the Query decorator is custom (if your app uses React Query):

```typescript
import { withThemeByClassName } from '@storybook/addon-themes'
import type { Preview } from '@storybook/react'
import { decorators as routerDecorators } from 'storybook-addon-tanstack-start/preview'
import { withQuery } from './decorators/QueryDecorator'
import '../src/styles.css'

const preview: Preview = {
  initialGlobals: {
    viewport: { value: 'desktop', isRotated: false },
  },
  decorators: [
    withQuery,           // Outermost: React Query context
    ...routerDecorators, // Middle: Router context (from addon)
    withThemeByClassName({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
      parentSelector: 'html',
    }),
  ],
  parameters: {
    viewport: {
      options: {
        mobileSmall: { name: 'Mobile Small (320px)', styles: { width: '320px', height: '568px' } },
        mobileLarge: { name: 'Mobile Large (414px)', styles: { width: '414px', height: '896px' } },
        tablet: { name: 'Tablet (768px)', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop (1280px)', styles: { width: '1280px', height: '800px' } },
      },
    },
  },
}
export default preview
```

### 6. Vitest Browser Testing (`vitest.config.ts`)

Run play functions as real browser tests via Playwright:

```typescript
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    storybookTest({
      configDir: '.storybook',
      storybookScript: 'pnpm storybook --ci',
      tags: {
        include: ['test'],
        exclude: ['no-tests'],
      },
    }),
  ],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
    setupFiles: ['./.storybook/vitest.setup.ts'],
    globals: true,
  },
})
```

### Dependencies

```bash
pnpm add -D storybook-addon-tanstack-start \
  @storybook/react @storybook/react-vite @storybook/builder-vite \
  @storybook/addon-vitest @storybook/addon-a11y @storybook/addon-docs \
  @storybook/addon-themes storybook \
  @vitest/browser playwright
```

## State Mocking Strategies

Different state management requires different mocking approaches. Pick the one that matches your app:

### Strategy 1: Props (simplest)

For presentational components that receive data as props:

```typescript
const meta: Meta<typeof AdminDashboard> = {
  component: AdminDashboard,
  tags: ['autodocs'],
}

export const Desktop: Story = {
  args: {
    kids: mockKids,
    totalLiability: 43750,
    pendingRequests: mockPendingRequests,
    onApproveRequest: fn(),
    onDenyRequest: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Total Liability')).toBeVisible()
  },
}
```

**When to use:** Components that are already well-composed — they take data in, render it, and emit callbacks. This is the ideal target shape.

### Strategy 2: Storybook Loaders + In-Memory Collections

For apps using TanStack React DB, Zustand, nanostores, or any client-side store:

```typescript
import { appStateCollection, kidProfilesCollection } from '~/lib/kid-store'

const seedData = async () => {
  appStateCollection.insert({ id: 'app-state', activeProfileId: 'kid-1', globalRate: 500 })
  kidProfilesCollection.insert({
    id: 'kid-1', name: 'Avery', type: 'CHILD',
    payAmount: 2500, payFrequency: 'WEEKLY',
    nextPayoutDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
  })
  return {}
}

export const Desktop: Story = {
  loaders: [seedData],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Current Balance')).toBeVisible()
  },
}
```

**When to use:** Components that read from client-side stores via hooks. The loader seeds the store before the story renders. No network calls happen — collections live in memory.

### Strategy 3: React Query Cache Pre-Population

For components that use `useQuery` / `useSuspenseQuery`:

```typescript
export const WithData: Story = {
  parameters: {
    query: {
      mockData: {
        '["posts"]': [{ id: 1, title: 'First Post' }],
        '["user","123"]': { id: '123', name: 'John' },
      },
    },
  },
}

// Force loading state
export const Loading: Story = {
  parameters: { query: { enabled: false } },
}
```

**When to use:** Components that fetch data via React Query hooks.

### Strategy 4: Actor-Kit Mock Clients

For components consuming actor-kit contexts (see `/actorkit-storybook-testing` skill for full details):

```typescript
import { createActorKitMockClient } from 'actor-kit/test'
import { withActorKit } from 'actor-kit/storybook'

// Via decorator (static states)
const meta: Meta<typeof GameView> = {
  decorators: [
    withActorKit<GameMachine>({ actorType: 'game', context: GameContext }),
  ],
}

export const Lobby: Story = {
  parameters: {
    actorKit: {
      game: { 'game-123': { ...defaultGameSnapshot, value: { lobby: 'ready' } } },
    },
  },
}

// Via mount (interactive — state mutations mid-test)
export const StartGame: Story = {
  play: async ({ mount, canvas }) => {
    const client = createActorKitMockClient<GameMachine>({ initialSnapshot: defaultGameSnapshot })

    client.send = (event) => {
      if (event.type === 'START_GAME') {
        client.produce((draft) => { draft.value = { active: 'questionPrep' } })
      }
      return Promise.resolve()
    }

    await mount(
      <GameContext.ProviderFromClient client={client}>
        <GameView />
      </GameContext.ProviderFromClient>
    )

    await userEvent.click(canvas.getByRole('button', { name: /start/i }))
    await canvas.findByText(/question prep/i)
  },
}
```

### Strategy 5: Server Function Mocks

For pages that call `createServerFn` — create per-domain mock files:

```typescript
// .storybook/mocks/auth-server.ts
export async function loginWithPassword({ data }: LoginInput) {
  if (data.email === 'test@example.com' && data.password === 'password123')
    return { ok: true as const, role: 'parent' as const }
  return { ok: false as const, error: 'Invalid email or password' }
}
```

Then alias in `main.ts`:
```typescript
'~/lib/auth/server': path.resolve(__dirname, 'mocks/auth-server.ts'),
```

## Play Function Patterns

### Basic: Assert Visibility

```typescript
play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await expect(canvas.getByText('Dashboard')).toBeVisible()
  await expect(canvas.getByRole('button', { name: /submit/i })).toBeDisabled()
}
```

### Form Interaction

```typescript
play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)

  await userEvent.type(canvas.getByLabelText('Amount'), '10')
  await userEvent.type(canvas.getByLabelText('What is this for?'), 'Art supplies')

  const submit = canvas.getByRole('button', { name: /submit/i })
  await expect(submit).toBeEnabled()
  await userEvent.click(submit)
}
```

### Async Waiting

```typescript
play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await waitFor(() =>
    expect(canvas.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  )
}
```

### Labeled Steps

```typescript
play: async ({ canvasElement, step }) => {
  const canvas = within(canvasElement)

  await step('Fill form', async () => {
    await userEvent.type(canvas.getByLabelText('Name'), 'Sarah')
  })

  await step('Submit', async () => {
    await userEvent.click(canvas.getByRole('button', { name: /continue/i }))
  })

  await step('Verify success', async () => {
    await expect(canvas.getByText(/success/i)).toBeVisible()
  })
}
```

### Portaled Content (Drawers, Modals, Tooltips)

Content that portals to `document.body` won't be inside `canvasElement`:

```typescript
play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)

  await userEvent.click(canvas.getByRole('button', { name: 'Review' }))

  // Query from document.body for portaled content
  const body = within(document.body)
  await expect(body.getByText('Review Withdrawal Request')).toBeVisible()
}
```

### Spy Callbacks

```typescript
import { fn } from 'storybook/test'

export const ClickHandler: Story = {
  args: { onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}
```

## Viewport Coverage

**Every story MUST have Desktop + Mobile variants.** This catches responsive bugs early.

```typescript
export const Desktop: Story = {
  args: defaultArgs,
  play: async ({ canvasElement }) => { /* assertions */ },
}

export const Mobile: Story = {
  args: defaultArgs,
  globals: { viewport: { value: 'mobileLarge', isRotated: false } },
  play: Desktop.play, // Reuse play function when assertions are the same
}
```

For stories with mobile-specific assertions, write a separate play function.

## Story Organization

### Route-Level Pages

Extract the page component from the route file so it can be imported without route registration side effects:

```typescript
// src/routes/dashboard/index.tsx (route file)
export const Route = createFileRoute('/dashboard/')({
  component: DashboardPage,
  loader: async () => { /* server-side loader */ },
})

// The page component is exported separately
export function DashboardPage() { /* ... */ }
```

```typescript
// src/routes/dashboard/DashboardPage.stories.tsx
import { DashboardPage } from '~/routes/dashboard/index'

function DashboardWrapper() {
  return (
    <div className="min-h-screen">
      <Navigation currentPath="/dashboard" />
      <DashboardPage />
    </div>
  )
}

const meta: Meta<typeof DashboardWrapper> = {
  title: 'Pages/Dashboard',
  component: DashboardWrapper,
  parameters: { layout: 'fullscreen' },
}
```

### Naming Convention

```
Components/UI/Button          — Shared UI primitives
Components/Navigation         — Layout components
Components/AdminDashboard     — Feature components
Onboarding/Kid Name           — Flow steps
Pages/Kid/Dashboard           — Route-level pages
Pages/Admin/Settings          — Route-level pages
```

## Mocking Server Functions in Stories

The addon stubs `createServerFn` generically. For your app's own server modules,
use `additionalServerModules` in the plugin config to redirect them to stubs,
then create mock files with the same function signatures:

```typescript
// .storybook/mocks/auth-server.ts
export async function loginWithPassword({ data }: LoginInput) {
  if (data.email === 'parent@example.com' && data.password === 'password123')
    return { ok: true as const, role: 'parent' as const }
  return { ok: false as const, error: 'Invalid email or password' }
}

export async function startOAuthLogin({ data }: OAuthStartInput) {
  return { ok: true as const, redirectUrl: `https://oauth.example.com/${data.provider}` }
}
```

Then alias in `.storybook/main.ts`:

```typescript
resolve: {
  alias: {
    '~/lib/auth/server': path.resolve(__dirname, 'mocks/auth-server.ts'),
    '~/lib/billing/server': path.resolve(__dirname, 'mocks/billing-server.ts'),
  },
},
```

## Checklist

Before shipping stories:

- [ ] Every story has Desktop + Mobile variants
- [ ] Play functions assert on visible text/roles, not implementation details
- [ ] `fn()` used for callback props to verify interactions
- [ ] Edge cases covered: empty state, error state, loading state, max data
- [ ] Portaled content (drawers, modals) queried from `document.body`
- [ ] Server modules aliased to mocks in `.storybook/main.ts`
- [ ] `tags: ['autodocs']` on meta for auto-generated docs
- [ ] `parameters: { layout: 'fullscreen' }` for page-level stories

## Storybook MCP for Agent-Driven Development

Storybook 10.3+ includes [MCP support](https://storybook.js.org/blog/storybook-mcp-for-react/) that
lets AI agents interact with your stories — preview components, run tests, and self-correct.

```bash
# Install the MCP addon
npx storybook add @storybook/addon-mcp

# Register with your agent
npx mcp-add --type http --url "http://localhost:6006/mcp" --scope project
```

For TanStack Start projects, install `storybook-addon-tanstack-start` first (makes the
build work), then add MCP on top. For team-wide access, publish via Chromatic:

```json
{
  "mcpServers": {
    "storybook-mcp": {
      "type": "http",
      "url": "https://main--<appid>.chromatic.com/mcp"
    }
  }
}
```

## Related Skills

- `/actorkit-storybook-testing` — Deep patterns for actor-kit mock clients and state machines
- `/testing-trophy` — Philosophy: play functions ARE the integration test layer
- `/react-composable-components` — Components shaped for easy story testing
- `/dont-use-use-effect` — Cleaner React = easier to test
- `/mutation-testing` — Verify play function test quality with Stryker
