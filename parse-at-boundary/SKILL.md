---
name: parse-at-boundary
description: >
  Enforce the "parse, don't validate" discipline at every system edge.
  Data crossing a trust boundary must be parsed through a schema before
  entering application logic. Language-agnostic — covers TypeScript,
  Python, Go, Swift, and Kotlin. Use when writing code that receives
  external data (API responses, HTTP requests, env vars, file reads,
  message queues) or when reviewing code that casts, asserts, or
  accesses unvalidated external input.
---

# Parse at the Boundary

Every piece of data entering your code from outside your control must be
**parsed through a schema exactly once, at the boundary**. After parsing,
downstream code receives typed data and never re-validates.

If parsing fails, **fail loudly**. Never silently coerce.

> *"We require Codex to parse data shapes at the boundary, but are not
> prescriptive on how that happens."*
> — OpenAI Harness Engineering

## The Rule

```
Untrusted data ──▶ [ Schema Parse ] ──▶ Typed data flows through your code
                        │
                   Parse fails?
                        │
                   Fail loudly ──▶ Structured error with context
```

1. **Parse once, at the edge.** The boundary is where untrusted becomes trusted.
2. **Typed downstream.** After parsing, everything is a known type. No defensive checks deep in the call stack.
3. **Fail fast.** A clear parse error at the boundary beats a `TypeError: cannot read property 'id' of undefined` three layers deep.

## What Counts as a Boundary

If data crosses one of these edges, it needs parsing:

| Boundary | Examples |
|----------|----------|
| HTTP responses you consume | `fetch()`, API client calls, webhook payloads |
| HTTP requests you receive | Handler inputs, middleware, query params |
| Environment variables | `process.env`, `os.environ`, `os.Getenv` |
| Database results | Raw SQL results, untyped ORM returns |
| File reads | JSON, YAML, CSV, config files |
| Message queues / events | Kafka, SQS, PubSub, WebSocket messages |
| URL state | Path params, search params, hash fragments |
| Third-party SDKs | Anything returning `any`, `interface{}`, `dict`, `id` |
| CLI arguments | `argv`, command-line flags |

## Anti-Patterns and Fixes

### TypeScript

```typescript
// BAD: Trust-cast. Compiles fine, blows up at runtime when shape changes.
const data = await res.json() as User;

// BAD: Non-null assertion on unknown shape.
const name = data.user!.name!;

// GOOD: Parse at the boundary. Downstream code gets a typed User.
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});
type User = z.infer<typeof UserSchema>;

const data = UserSchema.parse(await res.json());
```

Idiomatic tools: **Zod**, Valibot, ArkType.
For deeper TypeScript-specific guidance (typed routing, server/client boundaries,
database types), see the **offensive-typesafety** skill.

### Python

```python
# BAD: Raw dict access. KeyError at runtime when upstream changes shape.
data = response.json()
user_id = data["user"]["id"]
email = data["user"]["email"]

# GOOD: Parse into a model at the boundary.
from pydantic import BaseModel

class User(BaseModel):
    id: str
    name: str
    email: str

user = User.model_validate(response.json())
```

Idiomatic tools: **Pydantic**, attrs + cattrs, msgspec.

### Go

```go
// BAD: Unstructured access. Silent zero-values on missing fields.
var raw map[string]interface{}
json.Unmarshal(body, &raw)
name := raw["name"].(string) // panic if missing or wrong type

// GOOD: Decode into a struct with strict mode.
type User struct {
    ID    string `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

decoder := json.NewDecoder(bytes.NewReader(body))
decoder.DisallowUnknownFields()
var user User
if err := decoder.Decode(&user); err != nil {
    return fmt.Errorf("parsing user response: %w", err)
}
```

Idiomatic tools: **encoding/json** (strict mode), go-playground/validator.

### Swift

```swift
// BAD: Force-unwrap JSON. Crash at runtime.
let json = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
let name = json["name"] as! String

// GOOD: Codable decoding with error handling.
struct User: Codable {
    let id: String
    let name: String
    let email: String
}

let user = try JSONDecoder().decode(User.self, from: data)
```

Idiomatic tools: **Codable**, custom `CodingKeys`.

### Kotlin

```kotlin
// BAD: Unchecked JSONObject access. Throws at runtime on missing key.
val json = JSONObject(responseBody)
val name = json.getString("name")

// GOOD: Kotlinx serialization with schema.
@Serializable
data class User(val id: String, val name: String, val email: String)

val user = Json.decodeFromString<User>(responseBody)
```

Idiomatic tools: **kotlinx.serialization**, Moshi.

## Env Vars: The Most Commonly Missed Boundary

Environment variables are the boundary people forget most. They're strings
from an external source — they deserve the same parsing discipline as an
API response.

**The anti-pattern:** scattered `process.env.FOO` / `os.environ["FOO"]` /
`os.Getenv("FOO")` calls throughout the codebase, each hoping the value
exists and is the right format.

**The fix:** parse all env vars into a typed config object once at startup.

### TypeScript

```typescript
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_FEATURE_X: z.coerce.boolean().default(false),
});

export const config = EnvSchema.parse(process.env);
```

### Python

```python
from pydantic_settings import BaseSettings

class Config(BaseSettings):
    database_url: str
    port: int = 3000
    log_level: str = "info"
    enable_feature_x: bool = False

config = Config()  # reads from env automatically
```

### Go

```go
type Config struct {
    DatabaseURL    string `env:"DATABASE_URL,required"`
    Port           int    `env:"PORT" envDefault:"3000"`
    LogLevel       string `env:"LOG_LEVEL" envDefault:"info"`
    EnableFeatureX bool   `env:"ENABLE_FEATURE_X" envDefault:"false"`
}

// using caarlos0/env
var cfg Config
if err := env.Parse(&cfg); err != nil {
    log.Fatalf("parsing config: %v", err)
}
```

One config object. Parsed once. Imported everywhere. If a required var is
missing, the app fails at startup — not at 3am when the code path that
reads it finally runs.

## The Boundary Test

When writing or reviewing code, apply this mental check:

> "Am I about to use data that came from outside this process?
> Has it been parsed through a schema?
> If no — parse it now, at this boundary."

Signs you're missing a boundary parse:
- Type assertions: `as`, `.(type)`, `as!`, force casts
- Raw dict/map access on external data: `data["key"]`, `data.get("key")`
- Non-null assertions on external fields: `!`, `!!`, force-unwrap
- Defensive checks deep in business logic: `if data and "key" in data`
- String-to-number conversions scattered through handlers

## Summary Checklist

- [ ] Every `fetch()` / HTTP client response is parsed through a schema before use
- [ ] Every HTTP handler parses its input (body, query params, path params) at entry
- [ ] Env vars are parsed into a single typed config object at startup
- [ ] File reads (JSON, YAML, config) are parsed through a schema
- [ ] Message queue consumers parse payloads before processing
- [ ] No `as MyType`, `.(type)` assertions, or force-unwraps on external data
- [ ] Parse failures produce structured errors with context, not silent coercion
- [ ] Downstream code receives typed data — no re-validation deep in the stack
