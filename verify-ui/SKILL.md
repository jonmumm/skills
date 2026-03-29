---
name: verify-ui
description: Verify UI changes visually using browser automation before telling the user it's done. Use when making CSS, layout, or visual changes to web apps — especially Starlight docs sites, landing pages, or any frontend work. Triggers on "does this look right", "verify the UI", "check the layout", or after any CSS/HTML change.
---

# Verify UI

After making visual changes (CSS, HTML, layout, components), **always verify with a real browser screenshot before reporting success**. Never tell the user "refresh and check" — check it yourself.

## Why

CSS changes often fail silently:
- Scoped styles don't apply (Astro/Starlight `@layer` precedence)
- Class names get mangled (CSS Modules, Astro scoping)
- Flex/grid layouts break in ways that aren't obvious from code
- Elements overlap, overflow, or misalign at certain widths

The user should never be your QA. You have browser tools — use them.

## Workflow

```
1. Make the CSS/HTML change
2. Navigate to the page in Chrome (mcp__claude-in-chrome__)
3. Take a screenshot
4. Evaluate: does it match the intent?
5. If broken → fix and re-screenshot (DO NOT tell user to check)
6. If good → zoom into the specific area that changed for confirmation
7. Only then report to the user with the screenshot as evidence
```

## How to Use Browser Tools

### First time in a session

```
1. ToolSearch: "select:mcp__claude-in-chrome__tabs_context_mcp"
2. Call tabs_context_mcp with createIfEmpty: true
3. ToolSearch: "select:mcp__claude-in-chrome__tabs_create_mcp"
4. Create a new tab
5. ToolSearch: "select:mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer"
6. Navigate to the dev server URL
```

### Taking screenshots

```typescript
// Full page
mcp__claude-in-chrome__computer({ action: "screenshot", tabId })

// Zoom into a region (e.g., header area)
mcp__claude-in-chrome__computer({
  action: "zoom",
  tabId,
  region: [0, 0, 1400, 60]  // [x0, y0, x1, y1]
})
```

### Debugging layout issues

```typescript
// Read computed styles via JS
mcp__claude-in-chrome__javascript_tool({
  action: "javascript_exec",
  tabId,
  text: `
    const el = document.querySelector('.my-element');
    const cs = window.getComputedStyle(el);
    JSON.stringify({
      display: cs.display,
      flexDirection: cs.flexDirection,
      gap: cs.gap,
      width: cs.width,
    })
  `
})
```

## Common Pitfalls

### Astro/Starlight scoped styles
- Component `<style>` blocks are scoped with data attributes
- They often lose specificity battles with Starlight's `@layer starlight.core`
- Fix: use `<style is:global>` or `!important` for overrides
- Fix: use Starlight's utility classes like `sl-flex` instead of custom `display: flex`

### Starlight CSS variables
- `--sl-font` works but Starlight wraps it in `--__sl-font` internally
- Override via `customCss` files, not inline component styles
- `--sl-nav-pad-x` controls header horizontal padding

### Class name collisions
- Don't use `.hero` in a Starlight splash page — it collides with Starlight's built-in `.hero`
- Prefix custom classes: `.landing-hero`, `.my-feature`, etc.

## Checklist Before Reporting

- [ ] Screenshot taken of the changed area
- [ ] Zoomed into specific elements that changed
- [ ] Checked mobile viewport if relevant (`resize_window` tool)
- [ ] Verified no overflow/cutoff at edges
- [ ] Verified text is readable and properly contrasted
- [ ] Verified alignment with surrounding elements
- [ ] If header/nav changed: checked it's on one line, properly spaced
