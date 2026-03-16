---
name: ai-sdk-testing
description: >
  Test code that uses the Vercel AI SDK (generateText, streamText, generateObject, streamObject)
  without calling real LLM APIs. Uses MockLanguageModelV3, MockEmbeddingModelV3, simulateReadableStream,
  and fetchMock patterns. Use when writing tests for any code that imports from 'ai', when
  /nightshift, /swarm, or /ralph-tdd encounter AI SDK usage, or when testing streaming responses.
---

# AI SDK Testing

You write deterministic, fast tests for code that uses the Vercel AI SDK. LLM calls are non-deterministic, slow, and expensive — never call real providers in tests. Instead, use the SDK's built-in mock providers (`ai/test`) to control outputs exactly, and assert on the behavior of your code around those outputs.

## When to use this skill

- Any code imports from `ai` (`generateText`, `streamText`, `generateObject`, `streamObject`)
- Testing route handlers that proxy or transform LLM responses
- Testing structured output parsing (Zod schemas + `Output.object`)
- Testing streaming UIs or SSE endpoints that use AI SDK
- As part of `/nightshift`, `/swarm`, `/ralph-tdd` loops when the target code uses AI SDK

## Core principles

1. **Never call real providers in tests.** Use `MockLanguageModelV3` for all language model tests and `MockEmbeddingModelV3` for embeddings.
2. **Test your code, not the SDK.** Assert on what your code does with the model's output — transformation, validation, storage, error handling — not that the SDK itself works.
3. **Test both sync and streaming paths.** If your code supports both `generateText` and `streamText`, test both. Streaming has different failure modes (partial chunks, mid-stream errors).
4. **Test structured output parsing.** When using `Output.object` with Zod schemas, test that valid JSON parses correctly AND that your code handles malformed output gracefully.
5. **Mock at the model layer, not fetch.** Prefer `MockLanguageModelV3` over raw fetch mocking. It respects the SDK's internal protocol and is more resilient to SDK version changes.

## Available test helpers

All from `ai/test`:

| Helper | Purpose |
|--------|---------|
| `MockLanguageModelV3` | Mock language model (V3 spec). Implements `doGenerate` and/or `doStream`. |
| `MockEmbeddingModelV3` | Mock embedding model (V3 spec). |
| `mockId` | Returns incrementing integer IDs across calls. |
| `mockValues` | Iterates over an array of values; returns last value when exhausted. |

From `ai`:

| Helper | Purpose |
|--------|---------|
| `simulateReadableStream` | Creates a ReadableStream with configurable chunk delays. |

## Test patterns

### generateText — basic

```typescript
import { generateText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, it, expect } from "vitest";

it("summarizes input using generateText", async () => {
  const result = await generateText({
    model: new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: "This is the summary." }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      }),
    }),
    prompt: "Summarize this long document...",
  });

  expect(result.text).toBe("This is the summary.");
  expect(result.usage.totalTokens).toBe(60);
});
```

### generateText — structured output with Zod

```typescript
import { generateText, Output } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";

const QuizSchema = z.object({
  question: z.string(),
  choices: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
});

it("generates structured quiz data", async () => {
  const mockOutput = { question: "What is 2+2?", choices: ["3", "4", "5", "6"], correctIndex: 1 };

  const result = await generateText({
    model: new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify(mockOutput) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      }),
    }),
    output: Output.object({ schema: QuizSchema }),
    prompt: "Generate a math quiz question",
  });

  expect(result.object).toEqual(mockOutput);
  expect(QuizSchema.parse(result.object)).toBeTruthy();
});
```

### streamText — basic

```typescript
import { streamText, simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

it("streams text chunks", async () => {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Hello" },
            { type: "text-delta", id: "text-1", delta: ", " },
            { type: "text-delta", id: "text-1", delta: "world!" },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              logprobs: undefined,
              usage: {
                inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 10, text: 10, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    }),
    prompt: "Hello, test!",
  });

  const chunks: string[] = [];
  for await (const chunk of result.textStream) {
    chunks.push(chunk);
  }

  expect(chunks).toEqual(["Hello", ", ", "world!"]);
});
```

### streamText — structured output

```typescript
import { streamText, Output, simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";

it("streams structured JSON output", async () => {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: '{ ' },
            { type: "text-delta", id: "text-1", delta: '"content": ' },
            { type: "text-delta", id: "text-1", delta: '"Hello, ' },
            { type: "text-delta", id: "text-1", delta: 'world' },
            { type: "text-delta", id: "text-1", delta: '!"' },
            { type: "text-delta", id: "text-1", delta: ' }' },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              logprobs: undefined,
              usage: {
                inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 10, text: 10, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    }),
    output: Output.object({ schema: z.object({ content: z.string() }) }),
    prompt: "Hello, test!",
  });

  // Collect partial objects as they stream
  const partials: unknown[] = [];
  for await (const partial of result.partialObjectStream) {
    partials.push(partial);
  }

  // Final partial should be complete
  expect(partials[partials.length - 1]).toEqual({ content: "Hello, world!" });
});
```

### Testing embeddings

```typescript
import { embed } from "ai";
import { MockEmbeddingModelV3 } from "ai/test";

it("generates embedding vector", async () => {
  const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];

  const result = await embed({
    model: new MockEmbeddingModelV3({
      doEmbed: async () => ({
        embeddings: [mockEmbedding],
      }),
    }),
    value: "test input",
  });

  expect(result.embedding).toEqual(mockEmbedding);
  expect(result.embedding.length).toBe(5);
});
```

### Using mockValues for multiple calls

```typescript
import { generateText } from "ai";
import { MockLanguageModelV3, mockValues } from "ai/test";

it("returns different responses on successive calls", async () => {
  const responses = mockValues([
    { content: [{ type: "text" as const, text: "First response" }] },
    { content: [{ type: "text" as const, text: "Second response" }] },
    { content: [{ type: "text" as const, text: "Default fallback" }] },
  ]);

  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      ...responses(),
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });

  const r1 = await generateText({ model, prompt: "first" });
  const r2 = await generateText({ model, prompt: "second" });
  const r3 = await generateText({ model, prompt: "third" });
  const r4 = await generateText({ model, prompt: "fourth" }); // exhausted, returns last

  expect(r1.text).toBe("First response");
  expect(r2.text).toBe("Second response");
  expect(r3.text).toBe("Default fallback");
  expect(r4.text).toBe("Default fallback");
});
```

### Testing error handling

```typescript
it("handles model errors gracefully", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error("Rate limit exceeded");
    },
  });

  await expect(
    generateText({ model, prompt: "test" })
  ).rejects.toThrow("Rate limit exceeded");
});

it("handles stream errors mid-stream", async () => {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Partial" },
            { type: "error", error: new Error("Connection lost") },
          ],
        }),
      }),
    }),
    prompt: "test",
  });

  const chunks: string[] = [];
  try {
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }
  } catch (err) {
    expect((err as Error).message).toContain("Connection lost");
  }
  expect(chunks).toEqual(["Partial"]);
});
```

### Simulating UI Message Stream (SSE endpoints)

For testing streaming API routes that return SSE/UI Message Stream format:

```typescript
import { simulateReadableStream } from "ai";

it("simulates SSE response for UI testing", async () => {
  const stream = simulateReadableStream({
    initialDelayInMs: 0, // no delay in tests
    chunkDelayInMs: 0,
    chunks: [
      'data: {"type":"start","messageId":"msg-123"}\n\n',
      'data: {"type":"text-start","id":"text-1"}\n\n',
      'data: {"type":"text-delta","id":"text-1","delta":"Hello"}\n\n',
      'data: {"type":"text-delta","id":"text-1","delta":" world"}\n\n',
      'data: {"type":"text-end","id":"text-1"}\n\n',
      'data: {"type":"finish"}\n\n',
      "data: [DONE]\n\n",
    ],
  });

  const response = new Response(
    stream.pipeThrough(new TextEncoderStream()),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    },
  );

  const text = await response.text();
  expect(text).toContain('"delta":"Hello"');
  expect(text).toContain("[DONE]");
});
```

## Testing AI SDK inside Cloudflare Workers

When your Worker uses the AI SDK with `fetchMock` from `cloudflare:test`:

```typescript
import { SELF, fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, it, expect } from "vitest";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

it("Worker AI endpoint returns streamed response", async () => {
  // Mock the upstream LLM API that the Worker calls
  fetchMock
    .get("https://api.openai.com")
    .intercept({ path: "/v1/chat/completions", method: "POST" })
    .reply(200, JSON.stringify({
      choices: [{ message: { content: "Mocked LLM response" } }],
    }));

  const res = await SELF.fetch("https://api.test/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
    body: JSON.stringify({ message: "Hello" }),
  });

  expect(res.status).toBe(200);
  const body = (await res.json()) as { response: string };
  expect(body.response).toBe("Mocked LLM response");
});
```

## Integration with autonomous loops

### For /nightshift, /ralph-tdd, /swarm

When the current task involves AI SDK code:
1. **Detect AI SDK usage**: Check if the file imports from `ai` or `ai/test`
2. **Never skip testing because "it's AI"**: The non-determinism is why mocks exist. Your code around the AI call must be tested.
3. **Test the contract, not the content**: Assert on response shape, error handling, token counting, rate limiting — not specific generated text.
4. **Mock at the right layer**:
   - Testing a `generateText` wrapper? Use `MockLanguageModelV3`
   - Testing a Worker route that calls an LLM API? Use `fetchMock` to mock the HTTP call
   - Testing a React component that consumes a stream? Use `simulateReadableStream` for the SSE mock

## What to test for each AI SDK integration

- [ ] Happy path with expected output shape
- [ ] Structured output parses through Zod schema correctly
- [ ] Streaming collects all chunks into expected final state
- [ ] Error from model (rate limit, auth failure, timeout) is handled
- [ ] Mid-stream error doesn't crash the consumer
- [ ] Token usage is tracked/logged correctly
- [ ] Multiple sequential calls work (conversation context)
- [ ] Empty/null model response handled gracefully
