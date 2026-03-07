# ADR Template

Use this template when creating a new Architectural Decision Record.

Save as: `docs/adrs/YYYY-MM-DD-short-kebab-description.md`

---

```markdown
# ADR: [Short Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded by [link]

## Context

[What forces led to this decision? What problem were we solving?
What constraints did we face?

This is the most valuable section — it captures WHY. Be specific.
Include relevant factors:
- Technical constraints
- Business requirements
- Team capabilities / preferences
- Performance needs
- Existing patterns in the codebase
- What alternatives were considered]

## Decision

[What did we decide? State it clearly and concisely.
"We will use X because Y." or "We chose X over Z because..."]

## Consequences

### Positive
- [What we gain from this decision]
- [e.g. Simpler API surface, smaller bundle, better DX]

### Negative
- [What we trade away]
- [e.g. Must maintain custom implementation, less community support]

### Neutral
- [Side effects that are neither clearly good nor bad]
- [e.g. Shifts testing strategy, changes onboarding docs]
```

---

## Examples

### Choosing a Dependency
- Title: "Use expo-audio Instead of expo-av"
- Context: "App needs audio playback for TTS. Expo provides two options..."
- Decision: "Use expo-audio exclusively."
- Consequences: Smaller bundle (+), verify all patterns work (-), no video support (neutral)

### Establishing a Pattern
- Title: "Separate UI from Business Logic Into Isolated Directories"
- Context: "AI agents struggle to keep code straight when UI and logic are interleaved..."
- Decision: "All business logic in services/, all UI in app/ and components/."
- Consequences: Clearer boundaries (+), more files (-), easier for agents to reason about (+)

### Making a Trade-Off
- Title: "Direct Gemini API Calls, No Backend"
- Context: "Need AI features but want to minimize infrastructure..."
- Decision: "Call Gemini API directly from the client, protected by a Cloudflare Worker proxy."
- Consequences: No server to maintain (+), API key exposure risk mitigated by worker (+), offline mode difficult (-)
