import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverAgentsAll } from "../src/agents/agents.ts";

function write(path, content) {
  mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  writeFileSync(path, content, "utf8");
}

const agent = `---
name: real-agent
description: A real project subagent.
---

You are a real subagent.
`;

const skill = `---
name: frontend-testing
description: A skill, not a subagent.
---

# Frontend Testing
`;

const marketplaceSkill = `---
name: jira-tool
description: Another skill, not a subagent.
---

# Jira Tool
`;

test("Agent Skills trees are not discovered as subagents", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-subagents-essential-"));

  write(join(root, ".agents", "agents", "real-agent.md"), agent);
  write(join(root, ".agents", "skills", "frontend-testing", "SKILL.md"), skill);
  write(join(root, ".agents", "marketplace", "plugins", "jira-tool", "skills", "jira-tool", "SKILL.md"), marketplaceSkill);

  const discovered = discoverAgentsAll(root).project.map((a) => a.name).sort();

  assert.deepEqual(discovered, ["real-agent"]);
});
