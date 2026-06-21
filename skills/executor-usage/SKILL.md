---
name: executor-usage
description: >-
  Load this skill before calling the `execute` tool. Teaches the Executor sandbox
  calling model: discover with `tools.search({ query, limit })`, inspect with
  `tools.describe.tool({ path })`, list sources with `tools.executor.sources.list({})`,
  then call the real tool by its full address. Use for SaaS APIs, remote systems,
  MCP/OpenAPI/GraphQL integrations, and auth/approval-managed actions.
metadata:
  short-description: Required calling pattern for Executor `execute`
---

# Executor Usage

Use this skill before any `execute` call.

It exists because Executor's sandbox is a **lazy proxy over real tools**, not a normal JS object. Naive probing (`Object.keys(tools)`, `globalThis`, `tools()`, random namespace guesses) is misleading and wastes turns.

## Source of truth

Before calling `execute`, re-read its tool definition in the current context. The description there is the session-specific source of truth. This skill is the stable summary.

## Mental model

Inside an `execute` snippet:

- The `tools` object is a **lazy proxy**. It is not enumerable. Do not probe it.
- You **discover** tools with built-in helpers, then call the real tool by its full address.
- The address is returned by `tools.search` / `tools.describe.tool` as a `path` like `"github.ronsanzone.personal.issues.list"`. Call it as `tools[path]`.
- Built-in helpers:
  - `tools.search({ query, namespace?, limit? })` → ranked matches
  - `tools.describe.tool({ path })` → compact `inputTypeScript` / `outputTypeScript`
  - `tools.executor.sources.list({ query?, limit? })` → configured source inventory

## Required workflow

Follow this order inside every `execute` snippet unless you already know the exact path with high confidence.

1. **Search** for the tool by short intent phrase + key nouns.
2. **Pick** the best path from the results.
3. **Describe** it to get compact TS shapes.
4. **Call** it via `tools[path]`.
5. **Unwrap** MCP-style content blocks before returning.

## Canonical pattern

```ts
const { items: matches } = await tools.search({ query: "github issues", limit: 5 });
const path = matches[0]?.path;
if (!path) return "No matching tools found.";

const details = await tools.describe.tool({ path });
// details.inputTypeScript / details.outputTypeScript give you the exact shape.

const result = await tools[path]({ owner: "octocat", repo: "Hello-World" });
return result;
```

## Unwrapping MCP results

MCP-backed tools often return:

```ts
{ content: [{ type: "text", text: "{...json...}" }], structuredContent?: {...} }
```

Prefer `structuredContent`. Otherwise parse the first text block if it looks like JSON.

```ts
const unwrap = (value: any) => {
  if (value?.structuredContent) return value.structuredContent;
  const text = value?.content?.find?.((b: any) => b?.type === "text")?.text;
  if (typeof text !== "string") return value;
  try { return JSON.parse(text); } catch { return value; }
};

return unwrap(await tools[path](args));
```

## Hard rules

### Required

- Always start with `tools.search({ query, ... })` for unknown integrations.
- Always pass an **object** to helper tools (`{ query, limit }`, never a bare string).
- Always call the real tool via the **full address** returned by `tools.search` / `tools.describe.tool`.
- Use `tools.describe.tool({ path })` before invoking unfamiliar tools.
- Use `tools.executor.sources.list({})` for source/namespace confirmation.

### Forbidden

- Do not call `tools()` as a function.
- Do not probe with `Object.keys(tools)`, `for...in tools`, or rely on `globalThis`.
- Do not guess namespaces from property names like `tools.linear` or `tools.mcp`.
- Do not pass a string to `tools.search`; pass an object.
- Do not use `includeSchemas` on `tools.describe.tool`; that parameter is no longer accepted.
- Do not assume tool results are already plain JSON — always unwrap.
- Do not use `fetch` when Executor already has the integration you need.

## Decision rule

- **Executor** is for work **outside the repo**: SaaS APIs, remote systems, configured MCP/OpenAPI/GraphQL, auth/approval-managed actions.
- **Pi's native file tools** (`read`, `edit`, `write`, `bash`, etc.) are for work **inside the repo**: reading files, editing code, refactors, local tests and builds.

## Interaction rule

In Pi UI sessions, let `execute` handle any Executor interaction inline. Only call `resume` if `execute` explicitly returns an `executionId` for a paused interaction that it could not finish inline.

## Recovery checklist

If an `execute` snippet behaves strangely:

1. Did you load this skill before using `execute`?
2. Did you call `tools.search({ ... })` instead of guessing?
3. Did you pass an object to helper tools?
4. Did you `tools.describe.tool({ path })` before calling an unfamiliar tool?
5. Did you call the real tool via the full `path` (not a guessed namespace)?
6. Did you unwrap `structuredContent` / JSON text if the result looked nested?
