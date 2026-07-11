import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SkillSource } from "../types.ts";

export interface SkillRoot {
  path: string;
  source: SkillSource;
}

export function getAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR?.trim();
  if (configured) return expandHome(configured);
  return join(homedir(), ".pi", "agent");
}

export function getSkillRoots(cwd: string): SkillRoot[] {
  const resolvedCwd = resolve(cwd);
  const userLocalRoot = join(getAgentDir(), "skills-local");
  const userSharedRoot = join(homedir(), ".agents", "skills");
  const projectRoot = resolve(resolvedCwd, ".pi", "skills");
  const projectLegacyRoot = resolve(resolvedCwd, ".agents", "skills");
  const roots: SkillRoot[] = [
    {
      path: userLocalRoot,
      source: { kind: "user-local", root: userLocalRoot },
    },
    {
      path: userSharedRoot,
      source: { kind: "user-shared", root: userSharedRoot },
    },
    {
      path: projectRoot,
      source: { kind: "project", root: projectRoot },
    },
    // Project-level Agent Skills installed by older harnesses.
    {
      path: projectLegacyRoot,
      source: { kind: "project-legacy", root: projectLegacyRoot },
    },
  ];

  const seen = new Set<string>();
  return roots.filter((root) => {
    const key = resolve(root.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  return input;
}
