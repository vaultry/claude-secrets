import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

type PolicyFile = {
  allow?: string[] | "*";
};

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

async function loadPolicy(cwd: string): Promise<PolicyFile | null> {
  const path = join(cwd, ".claude", "secrets.yml");
  try {
    await access(path);
  } catch {
    return null;
  }
  const raw = await readFile(path, "utf8");
  return parseYaml(raw) as PolicyFile;
}

export async function isAllowed(name: string, cwd: string): Promise<{ ok: boolean; reason?: string }> {
  const policy = await loadPolicy(cwd);
  if (!policy) {
    return {
      ok: false,
      reason: `No .claude/secrets.yml in ${cwd}. Create one with 'allow: [${name}]' to grant access.`,
    };
  }
  if (policy.allow === "*") return { ok: true };
  if (!Array.isArray(policy.allow) || policy.allow.length === 0) {
    return { ok: false, reason: "secrets.yml has no 'allow' list" };
  }
  for (const pattern of policy.allow) {
    if (globToRegex(pattern).test(name)) return { ok: true };
  }
  return {
    ok: false,
    reason: `'${name}' not in allow-list of ${cwd}/.claude/secrets.yml`,
  };
}

export async function allowedNames(availableNames: string[], cwd: string): Promise<string[]> {
  const policy = await loadPolicy(cwd);
  if (!policy) return [];
  if (policy.allow === "*") return availableNames;
  if (!Array.isArray(policy.allow)) return [];
  const regexes = policy.allow.map(globToRegex);
  return availableNames.filter((n) => regexes.some((r) => r.test(n)));
}
