# Pi user instructions

## Subagents

`pi-subagents` is installed. Use the `subagent` tool when a request benefits from independent fresh context, codebase exploration, implementation delegation, or review.

Generic compatibility mappings:

- `Agent(prompt)` means run `subagent({ agent: "agent", task: prompt, context: "fresh" })`.
- `Explore(prompt)` means run `subagent({ agent: "explore", task: prompt, context: "fresh" })`.
- "fresh subagent" means `context: "fresh"`.

Prefer these local agents for focused context-management work:

- `codebase-locator`: locate files by feature/topic; paths only.
- `codebase-analyzer`: durable how-it-works writeup with file/line citations.
- `codebase-pattern-finder`: find ready-to-copy code patterns and matching tests.
- `web-search-researcher`: current web/docs research when available tools support it.
- `explore`: generic no-edit repository exploration.
- `agent`: generic fresh-context task execution.

References in shared Claude/Pi skills to Claude Code tools such as `TaskCreate`, `TaskUpdate`, or `TaskList` are harness examples. In Pi, use Pi-native todo/task tracking and `subagent` while preserving the described workflow.

## Mermaid diagrams

When writing Mermaid diagrams, prefer syntax that is valid in standard Mermaid renderers:

- Quote node labels that contain punctuation, parentheses, slashes, colons, commas, angle brackets, or other special characters: `nodeId["Label with functionCall()"]`.
- Keep node IDs simple: letters, numbers, and underscores only.
- Avoid raw parentheses in unquoted labels, especially inside `[]`, `{}`, or `()` node shapes.
- If a label needs code-like text, quote it or replace punctuation with plain words.
- Before sending a diagram, quickly scan it for unquoted labels containing `(`, `)`, `<`, `>`, `{`, `}`, `[`, `]`, `:`, or `/`.
