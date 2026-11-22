import { readFile } from "node:fs/promises";
import path from "node:path";

export type PromptVersion = "v1" | "v2" | "v3" | "final";
export type PromptName = "P1" | "P2" | "P3";

export interface PromptConfig {
  temperature?: number;
  responseMimeType?: string;
  thinkingBudget?: number;
}

export interface PromptFile {
  id: string;
  version: string;
  config: PromptConfig;
  template: string;
}

const PROMPTS_DIR = path.join(process.cwd(), "prompts");
const cache = new Map<string, PromptFile>();

/**
 * A prompt file is Markdown with optional frontmatter (`key: value` lines
 * between `---` markers, `#` lines are comments). Everything after the
 * frontmatter is the prompt template, sent to the model as-is after
 * {{placeholders}} are filled in.
 */
export function parsePromptFile(raw: string): PromptFile {
  const text = raw.replace(/\r\n/g, "\n");
  const meta: Record<string, string> = {};
  let body = text;

  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    body = text.slice(fm[0].length);
  }

  const config: PromptConfig = {};
  if (meta.temperature !== undefined) config.temperature = Number(meta.temperature);
  if (meta.response_mime_type) config.responseMimeType = meta.response_mime_type;
  if (meta.thinking_budget !== undefined) config.thinkingBudget = Number(meta.thinking_budget);

  return {
    id: meta.id ?? "unknown",
    version: meta.version ?? "unknown",
    config,
    template: body.trim(),
  };
}

export async function loadPrompt(version: PromptVersion, name: PromptName): Promise<PromptFile> {
  const key = `${version}/${name}`;
  const hit = cache.get(key);
  if (hit && process.env.NODE_ENV === "production") return hit;

  const raw = await readFile(path.join(PROMPTS_DIR, version, `${name}.md`), "utf8");
  const prompt = parsePromptFile(raw);
  cache.set(key, prompt);
  return prompt;
}

/** Fills {{name}} placeholders in one pass, so values are never re-scanned. */
export function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`Prompt variable {{${key}}} was not provided`);
    return vars[key];
  });
}
