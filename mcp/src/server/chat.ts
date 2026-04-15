/**
 * Native AI chat module for Agentation.
 *
 * Direct SDK calls for fast ~1-2s first token responses.
 * Supports Claude (@anthropic-ai/sdk) and OpenAI (openai).
 * API key stays server-side.
 */

import type { ServerResponse } from "http";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { writeFile, readFile } from "fs/promises";
import { resolve, dirname, relative, join } from "path";
import { execFileSync } from "child_process";
import { homedir } from "os";
import {
  getSessionWithAnnotations,
  getPendingAnnotations,
  updateAnnotationStatus,
} from "./store.js";
import { eventBus } from "./events.js";

function log(msg: string): void {
  process.stderr.write(`[chat] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatProvider = "anthropic" | "openai";

export type ChatStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "message_break" }
  | { type: "complete"; url?: string }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// API Key Management (persisted to ~/.agentation/config.json)
// ---------------------------------------------------------------------------

let apiKey: string | null = null;
let provider: ChatProvider | null = null;

const CONFIG_DIR = join(homedir(), ".agentation");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

function persistApiKey(key: string, prov: ChatProvider): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CONFIG_PATH, JSON.stringify({ apiKey: key, provider: prov }), { encoding: "utf-8", mode: 0o600 });
    chmodSync(CONFIG_PATH, 0o600);
  } catch (err) {
    log(`persistApiKey failed: ${err instanceof Error ? err.message : err}`);
  }
}

function loadPersistedApiKey(): void {
  try {
    if (!existsSync(CONFIG_PATH)) return;
    const data = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (data.apiKey && data.provider) {
      apiKey = data.apiKey;
      provider = data.provider;
    }
  } catch (err) {
    log(`loadPersistedApiKey failed: ${err instanceof Error ? err.message : err}`);
  }
}

loadPersistedApiKey();

export function setApiKey(key: string): { provider: ChatProvider } {
  if (key.startsWith("sk-ant-")) {
    provider = "anthropic";
  } else if (key.startsWith("sk-")) {
    provider = "openai";
  } else {
    throw new Error("Unrecognized API key format. Expected sk-ant-* (Anthropic) or sk-* (OpenAI).");
  }
  apiKey = key;
  cachedAnthropicClient = null; // Invalidate cached client
  persistApiKey(key, provider);
  return { provider };
}

export function hasApiKey(): boolean {
  return apiKey !== null;
}

export function getProviderType(): ChatProvider | null {
  return provider;
}

// ---------------------------------------------------------------------------
// Project Root + ripgrep detection
// ---------------------------------------------------------------------------

function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    dir = dirname(dir);
  }
  const parent = dirname(process.cwd());
  if (existsSync(resolve(parent, "package.json"))) return parent;
  return process.cwd();
}

const projectRoot = findProjectRoot();

let hasRg = false;
try {
  execFileSync("which", ["rg"], { encoding: "utf-8", timeout: 1000 });
  hasRg = true;
} catch {
  hasRg = false;
}

// ---------------------------------------------------------------------------
// Source File Resolution
// ---------------------------------------------------------------------------

/** Verify a sourceFile path exists, searching subdirs if needed. */
function resolveSourceFile(sourceFile: string | undefined): string | undefined {
  if (!sourceFile) return undefined;

  // Handle paths with or without line numbers
  const withLine = sourceFile.match(/^(.+?\.(?:tsx?|jsx?|css|scss)):(\d+)/);
  const filePath = withLine ? withLine[1] : sourceFile.replace(/:.*$/, "").trim();
  const line = withLine ? withLine[2] : "1";

  if (!filePath.match(/\.(tsx?|jsx?|css|scss)$/)) return undefined;

  if (existsSync(resolve(projectRoot, filePath))) return `${filePath}:${line}`;

  const fileName = filePath.split("/").pop()!;
  for (const dir of ["package/example", "src", "app", "packages"]) {
    if (existsSync(resolve(projectRoot, dir, filePath))) return `${join(dir, filePath)}:${line}`;
  }

  try {
    const result = execFileSync("find", [
      projectRoot, "-type", "f", "-name", fileName,
      "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*",
      "-not", "-path", "*/dist/*",
    ], { encoding: "utf-8", timeout: 1000 }).trim();
    if (result) return `${relative(projectRoot, result.split("\n")[0])}:${line}`;
  } catch {}
  return undefined;
}

const SOURCE_CACHE_MAX = 200;
const sourceCache = new Map<string, string | undefined>();

/** Grep for text in source files to find file:line. */
function findSourceForText(text: string): string | undefined {
  const searchText = text.replace(/['"]/g, "").trim().slice(0, 60);
  if (!searchText || searchText.length < 3) return undefined;
  if (sourceCache.has(searchText)) return sourceCache.get(searchText);

  try {
    let result: string;
    if (hasRg) {
      result = execFileSync("rg", [
        "--no-heading", "-n", "--max-count", "1", "-F",
        "--type-add", "src:*.{tsx,jsx,ts,js,css,scss,html}", "-t", "src",
        "--", searchText, projectRoot,
        "--glob", "!node_modules", "--glob", "!.git", "--glob", "!dist", "--glob", "!.next",
      ], { encoding: "utf-8", timeout: 3000, maxBuffer: 1024 * 10 }).trim();
    } else {
      // Use find + grep to avoid socket/pipe files
      const files = execFileSync("find", [
        projectRoot, "-type", "f",
        "(", "-name", "*.tsx", "-o", "-name", "*.jsx", "-o", "-name", "*.ts",
        "-o", "-name", "*.js", "-o", "-name", "*.css", "-o", "-name", "*.scss", ")",
        "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*",
        "-not", "-path", "*/dist/*", "-not", "-path", "*/.next/*",
      ], { encoding: "utf-8", timeout: 2000, maxBuffer: 1024 * 100 }).trim();

      if (!files) { cacheSource(searchText, undefined); return undefined; }

      result = execFileSync("grep", [
        "-n", "--max-count=1", "-F", "--", searchText, ...files.split("\n").filter(Boolean).slice(0, 100),
      ], { encoding: "utf-8", timeout: 2000, maxBuffer: 1024 * 10 }).trim();
    }

    if (!result) { cacheSource(searchText, undefined); return undefined; }
    const match = result.split("\n")[0].match(/^(.+?):(\d+):/);
    if (match) {
      const relPath = match[1].startsWith(projectRoot) ? match[1].slice(projectRoot.length + 1) : match[1];
      const resolved = `${relPath}:${match[2]}`;
      cacheSource(searchText, resolved);
      return resolved;
    }
  } catch {}
  cacheSource(searchText, undefined);
  return undefined;
}

function cacheSource(key: string, value: string | undefined): void {
  if (sourceCache.size >= SOURCE_CACHE_MAX) {
    const first = sourceCache.keys().next().value;
    if (first !== undefined) sourceCache.delete(first);
  }
  sourceCache.set(key, value);
}

// ---------------------------------------------------------------------------
// Design System Context (loaded once at startup)
// ---------------------------------------------------------------------------

function safeRead(path: string, maxBytes = 4000): string | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    return content.length > maxBytes ? content.slice(0, maxBytes) + "\n... (truncated)" : content;
  } catch { return null; }
}

function loadDesignContext(): string {
  const sections: string[] = [];

  for (const name of ["CLAUDE.md", "claude.md"]) {
    const content = safeRead(resolve(projectRoot, name), 2000);
    if (content) { sections.push(`## Project Instructions\n${content}`); break; }
  }

  for (const name of ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs"]) {
    const content = safeRead(resolve(projectRoot, name), 2000);
    if (content) { sections.push(`## Tailwind Config\n\`\`\`\n${content}\n\`\`\``); break; }
  }

  for (const name of [
    "src/app/globals.css", "src/app/globals.scss", "app/globals.css",
    "package/example/src/app/globals.css", "package/example/src/app/globals.scss",
  ]) {
    const content = safeRead(resolve(projectRoot, name), 1500);
    if (content) { sections.push(`## Global Styles\n\`\`\`css\n${content}\n\`\`\``); break; }
  }

  return sections.join("\n\n");
}

const designContext = loadDesignContext();

// ---------------------------------------------------------------------------
// Conversation History (capped)
// ---------------------------------------------------------------------------

type MessageHistory = Array<{
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}>;

const MAX_HISTORY = 30;
const MAX_SESSIONS = 50;
const conversationHistory = new Map<string, MessageHistory>();

function getHistory(sessionId: string): MessageHistory {
  if (!conversationHistory.has(sessionId)) {
    if (conversationHistory.size >= MAX_SESSIONS) {
      const oldest = conversationHistory.keys().next().value;
      if (oldest !== undefined) conversationHistory.delete(oldest);
    }
    conversationHistory.set(sessionId, []);
  }
  const history = conversationHistory.get(sessionId)!;
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  return history;
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

/** Read ~30 lines around a target, ensuring nearbyText is included. */
function preReadSourceLines(sourcePath: string, nearbyText?: string): string | null {
  const match = sourcePath.match(/^(.+):(\d+)$/);
  if (!match) return null;
  const [, filePath, lineStr] = match;
  const fullPath = filePath.startsWith("/") ? filePath : resolve(projectRoot, filePath);
  try {
    const content = readFileSync(fullPath, "utf-8");
    const allLines = content.split("\n");
    let targetLine = Math.max(0, parseInt(lineStr, 10) - 15);

    // If nearbyText isn't in the snippet around the given line, find the actual line
    if (nearbyText) {
      const snippet = allLines.slice(targetLine, targetLine + 30).join("\n");
      if (!snippet.includes(nearbyText)) {
        const textLine = allLines.findIndex(l => l.includes(nearbyText));
        if (textLine >= 0) targetLine = Math.max(0, textLine - 5);
      }
    }

    return allLines
      .slice(targetLine, targetLine + 30)
      .map((line, i) => `${targetLine + i + 1}\t${line}`)
      .join("\n");
  } catch {
    return null;
  }
}

/** Resolve a page URL to a source file path. e.g. "/" → "package/example/src/app/page.tsx" */
function resolvePageUrl(url: string): string | null {
  // Extract pathname from URL
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  // Map route to file candidates (Next.js / React Router conventions)
  const route = pathname === "/" ? "" : pathname.replace(/^\//, "").replace(/\/$/, "");
  const candidates = [
    `src/app/${route ? route + "/" : ""}page.tsx`,
    `src/app/${route ? route + "/" : ""}page.jsx`,
    `app/${route ? route + "/" : ""}page.tsx`,
    `src/pages/${route || "index"}.tsx`,
    `pages/${route || "index"}.tsx`,
  ];

  // Search in project root and common subdirectories
  const searchDirs = ["", "package/example"];
  for (const dir of searchDirs) {
    for (const candidate of candidates) {
      const fullPath = resolve(projectRoot, dir, candidate);
      if (existsSync(fullPath)) {
        return dir ? `${dir}/${candidate}` : candidate;
      }
    }
  }
  return null;
}

/** Extract source hints from an enriched client message (e.g. "Source: src/app/page.tsx:42") */
function parseSourceHints(message: string): Map<string, string> {
  const hints = new Map<string, string>();
  const sourceMatch = message.match(/Source:\s*(.+?\.(?:tsx?|jsx?|css|scss)(?::\d+)?(?::\d+)?)\s*$/m);
  const textMatch = message.match(/Current text:\s*"(.+?)"/);
  if (sourceMatch) {
    const resolved = resolveSourceFile(sourceMatch[1]);
    if (resolved) {
      const key = textMatch ? textMatch[1] : sourceMatch[1];
      hints.set(key, resolved);
      // Also seed the source cache to skip grep for this text
      if (textMatch) cacheSource(textMatch[1].replace(/['"]/g, "").trim().slice(0, 60), resolved);
    }
  }
  return hints;
}

export function buildSystemPrompt(sessionId: string, sourceHints?: Map<string, string>, isLayoutChange = false): string {
  const session = getSessionWithAnnotations(sessionId);
  const allPending = getPendingAnnotations(sessionId);
  // For layout changes, skip text feedback annotations — they distract from the layout task
  const pending = isLayoutChange
    ? allPending.filter(a => (a as any).kind === "rearrange" || (a as any).kind === "placement")
    : allPending;

  const lines: string[] = [
    "You are an AI assistant in Agentation, a visual feedback toolbar.",
    `Project root: ${projectRoot}`,
    "",
  ];

  if (designContext) { lines.push(designContext, ""); }

  if (session) { lines.push(`## Page: ${session.url}`, ""); }

  let hasPreReadContent = false;

  if (pending.length > 0) {
    lines.push(`## Pending Annotations (${pending.length})`);
    for (const a of pending) {
      const ann = a as Record<string, unknown>;

      // Resolve source: use client hint (instant) → cached grep → fresh grep (slow)
      let resolvedSource: string | undefined;
      if (sourceHints && a.nearbyText && sourceHints.has(a.nearbyText)) {
        resolvedSource = sourceHints.get(a.nearbyText);
      } else {
        resolvedSource = resolveSourceFile(ann.sourceFile as string | undefined);
        if (a.nearbyText) {
          const grepSource = findSourceForText(a.nearbyText);
          if (grepSource) resolvedSource = grepSource;
        }
      }

      lines.push(`- [${a.id}] "${a.comment}" on <${a.element}>`);

      // Include structured rearrange/placement data when available
      const rearrange = (ann as any).rearrange;
      if (rearrange) {
        const yDelta = Math.round(rearrange.currentRect.y - rearrange.originalRect.y);
        const direction = yDelta < 0 ? "UP" : "DOWN";
        lines.push(`  **Rearrange:** Move "${rearrange.label}" ${direction} by ${Math.abs(yDelta)}px`);
        lines.push(`  Selector: \`${rearrange.selector}\``);
        lines.push(`  Action: In the JSX, swap this element with its ${yDelta < 0 ? "previous" : "next"} sibling.`);
      }

      const placement = (ann as any).placement;
      if (placement) {
        lines.push(`  **Placement:** Insert a \`${placement.componentType}\` component (${placement.width}×${placement.height}px)`);
      }

      if (resolvedSource) {
        lines.push(`  **Source: ${resolvedSource}**`);
        if (a.nearbyText) lines.push(`  Current text: "${a.nearbyText}"`);
        const snippet = preReadSourceLines(resolvedSource, a.nearbyText);
        if (snippet) {
          hasPreReadContent = true;
          lines.push(`  \`\`\`\n${snippet}\n  \`\`\``);
        }
      } else {
        if (a.nearbyText) lines.push(`  Current text: "${a.nearbyText}"`);
      }
    }
    lines.push("");
  }

  // Action-type-specific workflow instructions
  lines.push("## Workflow");
  if (hasPreReadContent) {
    lines.push("File content is included above — do NOT call read_file, go straight to editing.");
    lines.push("1. edit_file with old_string/new_string (indentation mismatches are auto-corrected)");
    lines.push("2. resolve_annotation with the annotation ID and a brief summary");
  } else {
    lines.push("1. read_file with the Source path (auto-centers on the right line)");
    lines.push("2. edit_file with old_string/new_string (indentation mismatches are auto-corrected)");
    lines.push("3. resolve_annotation with the annotation ID and a brief summary");
  }

  lines.push("");
  lines.push("## Rules");
  lines.push("- Annotations are DESIGN FEEDBACK — interpret the comment as intent, not literal replacement text.");
  lines.push("- The new_string MUST differ from old_string and produce a visible, meaningful change.");
  lines.push("- ONLY edit the code targeted by the annotation — no other changes.");
  lines.push("- If the annotation says to remove/delete something, set new_string to empty string.");
  lines.push("- For text edits (typos, copy changes): change only the specific text mentioned.");
  lines.push("- For design feedback (styling, brand, layout): modify CSS/style properties to address the intent.");
  lines.push("- For layout changes: the Page URL maps to a source file (e.g. '/' → 'page.tsx'). Use grep_code to find the file.");
  lines.push("- Keep responses to 1 sentence.");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// SSE Helpers
// ---------------------------------------------------------------------------

function writeSSE(res: ServerResponse, event: ChatStreamEvent): void {
  res.write(`event: chat\ndata: ${JSON.stringify(event)}\n\n`);
}

function startSSE(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  grep_code: "Searching code",
  read_file: "Reading file",
  edit_file: "Editing file",
  write_file: "Creating file",
  list_files: "Listing files",
  resolve_annotation: "Resolving annotation",
};

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "grep_code": {
      const pattern = input.pattern as string;
      try {
        const args = hasRg
          ? ["--no-heading", "-n", "--max-count", "20", "-F",
             "--glob", "!node_modules", "--glob", "!.git", "--glob", "!dist", "--glob", "!.next",
             "--", pattern, projectRoot]
          : ["-rn", "--max-count=20", "-F",
             "--include=*.tsx", "--include=*.jsx", "--include=*.ts", "--include=*.js",
             "--include=*.css", "--include=*.scss",
             "--exclude-dir=node_modules", "--exclude-dir=.git", "--exclude-dir=dist", "--exclude-dir=.next",
             "--", pattern, projectRoot];
        const cmd = hasRg ? "rg" : "grep";
        const result = execFileSync(cmd, args, {
          encoding: "utf-8", maxBuffer: 1024 * 50, timeout: 5000,
        }).trim();
        return result.split("\n")
          .map(l => l.startsWith(projectRoot) ? l.slice(projectRoot.length + 1) : l)
          .slice(0, 15).join("\n");
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 1) return "No matches found.";
        return `Search error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    }

    case "read_file": {
      let filePath = input.file_path as string;
      let targetLine: number | undefined;
      const lineMatch = filePath.match(/^(.+):(\d+)$/);
      if (lineMatch) {
        filePath = lineMatch[1];
        targetLine = Math.max(0, parseInt(lineMatch[2], 10) - 15);
      }
      const path = filePath.startsWith("/") ? filePath : resolve(projectRoot, filePath);
      const offset = (input.offset as number) ?? targetLine ?? 0;
      const limit = Math.min((input.limit as number) ?? (targetLine ? 30 : 60), 80);
      try {
        const content = await readFile(path, "utf-8");
        const lines = content.split("\n");
        return lines.slice(offset, offset + limit)
          .map((line, i) => `${offset + i + 1}\t${line}`).join("\n");
      } catch { return `File not found: ${filePath}`; }
    }

    case "edit_file": {
      const filePath = input.file_path as string;
      const path = filePath.startsWith("/") ? filePath : resolve(projectRoot, filePath);
      const oldStr = input.old_string as string;
      const newStr = input.new_string as string;
      if (!oldStr || typeof newStr !== "string") return `Error: old_string and new_string are both required.`;
      if (oldStr === newStr) return `Error: old_string and new_string are identical — no change would be made.`;
      try {
        const content = await readFile(path, "utf-8");

        // Layer 1: Exact match
        const exactCount = content.split(oldStr).length - 1;
        if (exactCount === 1) {
          await writeFile(path, content.replace(oldStr, newStr), "utf-8");
          return `Edited ${filePath}`;
        }
        if (exactCount > 1) return `old_string found ${exactCount} times — must be unique. Add more context.`;

        // Layer 2: Indent-adjusted match (Aider-inspired)
        // Strip leading whitespace per line, find the match, adjust new_string indent
        const oldLines = oldStr.split("\n");
        const contentLines = content.split("\n");
        const strippedOld = oldLines.map(l => l.trimStart());

        let matchStart = -1;
        let matchCount = 0;
        for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
          let found = true;
          for (let j = 0; j < oldLines.length; j++) {
            if (contentLines[i + j].trimStart() !== strippedOld[j]) { found = false; break; }
          }
          if (found) { matchCount++; if (matchStart < 0) matchStart = i; }
        }

        if (matchCount === 1) {
          const actualOld = contentLines.slice(matchStart, matchStart + oldLines.length).join("\n");
          // Compute indent delta between model's old_string and actual file content
          const oldIndent = oldLines[0].length - oldLines[0].trimStart().length;
          const fileIndent = contentLines[matchStart].length - contentLines[matchStart].trimStart().length;
          const delta = fileIndent - oldIndent;
          const adjustedNew = delta === 0 ? newStr : newStr.split("\n").map(line => {
            if (line.length === 0) return line;
            if (delta > 0) return " ".repeat(delta) + line;
            // delta < 0: remove leading spaces (but not below 0)
            const spaces = line.match(/^ */)?.[0].length ?? 0;
            return " ".repeat(Math.max(0, spaces + delta)) + line.trimStart();
          }).join("\n");
          await writeFile(path, content.replace(actualOld, adjustedNew), "utf-8");
          return `Edited ${filePath}`;
        }
        if (matchCount > 1) return `old_string found ${matchCount} times (indent-adjusted) — add more context.`;

        // No match — show closest match for self-correction
        const searchSnippet = oldStr.split("\n")[0].trim().slice(0, 30);
        const matchIdx = contentLines.findIndex(l => l.includes(searchSnippet));
        if (matchIdx >= 0) {
          const context = contentLines.slice(Math.max(0, matchIdx - 2), matchIdx + 5)
            .map((l, i) => `${Math.max(1, matchIdx - 1) + i}\t${l}`).join("\n");
          return `old_string not found. Closest match near line ${matchIdx + 1}:\n${context}`;
        }
        return `old_string not found in ${filePath}`;
      } catch { return `Error editing ${filePath}`; }
    }

    case "list_files": {
      const dir = input.directory
        ? (input.directory as string).startsWith("/") ? input.directory as string : resolve(projectRoot, input.directory as string)
        : projectRoot;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        return entries
          .filter(e => !e.name.startsWith(".") && e.name !== "node_modules")
          .map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`).join("\n");
      } catch { return `Error listing ${input.directory || "."}`; }
    }

    case "write_file": {
      const filePath = input.file_path as string;
      const content = input.content as string;
      if (!filePath || typeof content !== "string") return `Error: file_path and content are both required.`;
      const path = filePath.startsWith("/") ? filePath : resolve(projectRoot, filePath);
      // Guard: refuse to overwrite existing files — use edit_file instead
      if (existsSync(path)) {
        return `Error: ${filePath} already exists. Use edit_file to modify existing files, not write_file.`;
      }
      // Guard: content must be a valid component file
      if (content.length < 50 || (!content.includes("export") && !content.includes("module.exports"))) {
        return `Error: write_file is for creating complete files, not text snippets. Use edit_file instead.`;
      }
      try {
        mkdirSync(dirname(path), { recursive: true });
        await writeFile(path, content, "utf-8");
        return `Created ${filePath}`;
      } catch (err) { return `Error creating ${filePath}: ${err instanceof Error ? err.message : "unknown"}`; }
    }

    case "resolve_annotation": {
      const id = input.annotation_id as string;
      const summary = input.summary as string | undefined;
      const result = updateAnnotationStatus(id, "resolved", "agent");
      if (!result) return `Annotation ${id} not found.`;
      return `Resolved ${id}${summary ? `: ${summary}` : ""}`;
    }

    default: return `Unknown tool: ${name}`;
  }
}

const ANTHROPIC_TOOLS = [
  {
    name: "grep_code",
    description: "Search for a pattern in source files. Returns file:line:content.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Text to search for" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "read_file",
    description: "Read a file. Supports 'file.tsx:42' to auto-center around line 42.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Path relative to project root" },
        offset: { type: "number", description: "Start line (0-based)" },
        limit: { type: "number", description: "Lines to read (max 80)" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "edit_file",
    description: "Replace an exact unique string in a file with a new string.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Path relative to project root" },
        old_string: { type: "string", description: "Exact string to replace (must be unique)" },
        new_string: { type: "string", description: "Replacement string" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "list_files",
    description: "List files in a directory.",
    input_schema: {
      type: "object" as const,
      properties: {
        directory: { type: "string", description: "Directory (default: project root)" },
      },
    },
  },
  {
    name: "resolve_annotation",
    description: "Mark an annotation as resolved.",
    input_schema: {
      type: "object" as const,
      properties: {
        annotation_id: { type: "string", description: "Annotation ID" },
        summary: { type: "string", description: "Brief fix summary" },
      },
      required: ["annotation_id"],
    },
  },
];

// write_file is ONLY available for wireframe creation — kept separate to prevent accidental file overwrites
const WRITE_FILE_TOOL = {
  name: "write_file",
  description: "Create a new file with the given content. Only for creating new pages — fails if file already exists.",
  input_schema: {
    type: "object" as const,
    properties: {
      file_path: { type: "string", description: "Path relative to project root" },
      content: { type: "string", description: "Full file content" },
    },
    required: ["file_path", "content"],
  },
};

const OPENAI_TOOLS = ANTHROPIC_TOOLS.map(t => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

// ---------------------------------------------------------------------------
// Cached SDK imports + client instances
// ---------------------------------------------------------------------------

let cachedAnthropicSDK: any = null;
let cachedAnthropicClient: any = null;
let cachedOpenAISDK: any = null;
let cachedOpenAIClient: any = null;

async function getAnthropicClient() {
  if (!cachedAnthropicSDK) cachedAnthropicSDK = (await import("@anthropic-ai/sdk")).default;
  if (!cachedAnthropicClient) cachedAnthropicClient = new cachedAnthropicSDK({ apiKey: apiKey! });
  return cachedAnthropicClient;
}

async function getOpenAIClient() {
  if (!cachedOpenAISDK) cachedOpenAISDK = (await import("openai")).default;
  if (!cachedOpenAIClient) cachedOpenAIClient = new cachedOpenAISDK({ apiKey: apiKey! });
  return cachedOpenAIClient;
}

// ---------------------------------------------------------------------------
// Anthropic Provider
// ---------------------------------------------------------------------------

async function streamAnthropic(sessionId: string, message: string, res: ServerResponse): Promise<void> {
  const t0 = Date.now();
  log(`━━━ Chat request received ━━━`);
  log(`  message: "${message.slice(0, 80)}"`);

  const client = await getAnthropicClient();
  log(`  +${Date.now() - t0}ms SDK ready`);

  const history = getHistory(sessionId);
  history.push({ role: "user", content: message });

  // Parse source hints from enriched message to skip grep
  const sourceHints = parseSourceHints(message);
  // Classify action type
  const isLayoutChange = message.includes("layout changes") || message.includes("design changes");

  let systemPrompt = buildSystemPrompt(sessionId, sourceHints, isLayoutChange);
  const isDesignPlacement = message.includes("design changes") || message.includes("Design Layout") || message.includes("## Wireframe:");

  // For layout/design changes, pre-resolve the page file and include its content
  if (isLayoutChange) {
    const urlMatch = message.match(/Page URL:\s*(.+)/);
    if (urlMatch) {
      const pageFile = resolvePageUrl(urlMatch[1].trim());
      if (pageFile) {
        try {
          const content = readFileSync(resolve(projectRoot, pageFile), "utf-8");
          const allLines = content.split("\n");

          if (isDesignPlacement) {
            const isWireframe = message.includes("## Wireframe:");

            if (isWireframe) {
              // Wireframe: create a NEW file — determine the route path
              const pageDir = dirname(pageFile);
              const newRoute = `${pageDir}/wireframe/page.tsx`;
              systemPrompt += `\n\n## Wireframe Instructions`;
              systemPrompt += `\nCreate a NEW page file at \`${newRoute}\` using write_file.`;
              systemPrompt += `\nGenerate a complete React component (with "use client" if needed, imports, and export default).`;
              systemPrompt += `\nUse the Layout Analysis rows from the wireframe to determine the grid/flex structure.`;
              systemPrompt += `\n- The outer wrapper MUST have: position fixed, inset 0, background #fff (or #fdfdfc), z-index 1000, overflow auto. This covers the parent layout's nav/sidebar.`;
              systemPrompt += `\n- Use semantic HTML elements (header, nav, main, aside, footer, section).`;
              systemPrompt += `\n- Use inline styles for layout (flexbox/grid) matching the wireframe coordinates and sizes.`;
              systemPrompt += `\n- Generate realistic placeholder content appropriate to each component type.`;
              systemPrompt += `\n- Do NOT read the current page — this is a standalone wireframe.`;
              systemPrompt += `\nUse write_file to create the file in a single call, then resolve all annotations.`;
            } else {
              // Design placement: insert into existing page
              const returnIdx = allLines.findIndex(l => l.includes("return (") || l.includes("return("));
              const start = returnIdx > 0 ? returnIdx : 0;
              let end = allLines.length;
              let depth = 0;
              for (let i = start; i < allLines.length; i++) {
                if (allLines[i].includes("return (") || allLines[i].includes("return(")) depth++;
                if (depth > 0 && allLines[i].match(/^\s{0,4}\);?\s*$/)) { end = i + 1; break; }
              }
              if (end - start > 200) end = start + 200;
              const snippet = allLines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join("\n");

              systemPrompt += `\n\n## Source File: ${pageFile} (lines ${start + 1}-${end})`;
              systemPrompt += `\n\`\`\`tsx\n${snippet}\n\`\`\``;
              systemPrompt += `\n\n## Design Placement Instructions`;
              systemPrompt += `\nYou are inserting or positioning components in the page JSX above.`;
              systemPrompt += `\nThe full page JSX is shown — find the right insertion point based on the Y coordinate.`;
              systemPrompt += `\n- If the component already exists (e.g. <Footer />), adjust its position/styling instead of adding a duplicate.`;
              systemPrompt += `\n- For new components: generate JSX with inline styles matching the page's design system.`;
              systemPrompt += `\n- Insert at the correct vertical position in the JSX based on the Y coordinate.`;
              systemPrompt += `\nFile: ${pageFile}. Edit directly — do NOT search or read_file.`;
            }
          } else {
            // Rearrange: find the element to move in the source file
            let targetLine = 0;

            // 0. Use structured annotation data from pending rearrange annotations
            const rearrangeAnnotations = getPendingAnnotations(sessionId)
              .filter(a => (a as any).rearrange);
            for (const ra of rearrangeAnnotations) {
              const r = (ra as any).rearrange;
              if (r?.label) {
                // Try className from selector (e.g. "div.animation-demo" → "animation-demo")
                const classFromSelector = r.selector?.match(/\.([a-zA-Z][\w-]*)/);
                if (classFromSelector) {
                  const idx = allLines.findIndex((l: string) => l.includes(`className="${classFromSelector[1]}"`) || l.includes(`class="${classFromSelector[1]}"`));
                  if (idx >= 0) { targetLine = idx; break; }
                }
                // Try the label's quoted text content
                const quotedText = r.label?.match(/"([^"]+?)(?:\.\.\.)?"?/);
                if (quotedText) {
                  // Search for text fragments (skip JSX tags) — check if any line contains key words
                  const words = quotedText[1].split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3);
                  if (words.length > 0) {
                    const idx = allLines.findIndex((l: string) => words.every((w: string) => l.toLowerCase().includes(w.toLowerCase())));
                    if (idx >= 0) { targetLine = idx; break; }
                  }
                }
              }
            }

            // 1. Try explicit Selector: `tag.class` from standard/detailed output
            const selectorMatch = message.match(/Selector:\s*`(.+?)`/);
            if (selectorMatch?.[1]) {
              const classMatch = selectorMatch[1].match(/\.([a-zA-Z][\w-]*)/);
              if (classMatch) {
                targetLine = allLines.findIndex(l => l.includes(`className="${classMatch[1]}"`) || l.includes(`class="${classMatch[1]}"`));
              }
            }

            // 2. Try CSS selector patterns anywhere in message (e.g. div.animation-demo)
            if (targetLine <= 0) {
              const cssClasses = [...message.matchAll(/(?:^|[\s(])(?:div|section|span|p|h[1-6]|a|ul|ol|li|nav|header|footer|main|aside|article|form|button|input)\.([\w-]+)/g)];
              for (const m of cssClasses) {
                const idx = allLines.findIndex(l => l.includes(`className="${m[1]}"`) || l.includes(`class="${m[1]}"`));
                if (idx >= 0) { targetLine = idx; break; }
              }
            }

            // 3. Try bold labels from output (e.g. **Animation demo** or **Paragraph: "Note: With MCP..."**)
            if (targetLine <= 0) {
              const boldLabels = [...message.matchAll(/\*\*(.+?)\*\*/g)].map(m => m[1]);
              for (const label of boldLabels) {
                // Extract quoted text content from labels like 'Paragraph: "Note: With MCP..."'
                const quotedMatch = label.match(/"([^"]+?)(?:\.\.\.)?"?/);
                const searchText = quotedMatch
                  ? quotedMatch[1].trim()
                  : label.slice(0, 30).replace(/\.\.\./g, "").trim();
                if (searchText.length < 3) continue;
                const idx = allLines.findIndex(l => l.toLowerCase().includes(searchText.toLowerCase()));
                if (idx >= 0) { targetLine = idx; break; }
              }
            }

            // Show enough context around the target for the model to cut/paste
            let start = 0;
            let end = Math.min(allLines.length, 80);
            if (targetLine <= 0) {
              // Target not found by text search — show the full return JSX so the model can find it
              const returnIdx = allLines.findIndex(l => l.includes("return (") || l.includes("return("));
              if (returnIdx > 0) {
                start = returnIdx;
                end = Math.min(allLines.length, start + 200);
              }
            } else if (targetLine > 0) {
              // Walk backward to find the parent section/component boundary
              start = targetLine;
              let depth = 0;
              for (let i = targetLine; i >= 0; i--) {
                if (allLines[i].includes("</section") || allLines[i].includes("</div")) depth++;
                if (allLines[i].match(/<section[\s>]/) || (depth > 0 && allLines[i].match(/<div[\s>]/))) {
                  depth--;
                  if (depth <= 0) { start = Math.max(0, i - 2); break; }
                }
              }
              // Walk forward to find the closing
              end = Math.min(allLines.length, targetLine + 30);
              for (let i = targetLine; i < allLines.length; i++) {
                if (allLines[i].includes("</section>")) { end = Math.min(allLines.length, i + 3); break; }
                if (i > targetLine + 80) { end = i; break; }
              }
            }

            const snippet = allLines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join("\n");
            systemPrompt += `\n\n## Source File: ${pageFile} (lines ${start + 1}-${end})`;
            systemPrompt += `\n\`\`\`tsx\n${snippet}\n\`\`\``;
            systemPrompt += `\n\nThe element to move is at line ${targetLine > 0 ? targetLine + 1 : "unknown"}.`;
            systemPrompt += `\nUse edit_file on ${pageFile} — cut the element JSX and paste at the new position.`;
            systemPrompt += `\nDo NOT search, grep, or read_file. Edit directly from the content above.`;
          }
        } catch (err) {
          log(`  Layout pre-read failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  const hasPreRead = systemPrompt.includes("do NOT call read_file") || isLayoutChange;
  const maxSteps = isLayoutChange ? 8 : 6;
  log(`  +${Date.now() - t0}ms system prompt built (${systemPrompt.length} chars, preRead=${hasPreRead}, hints=${sourceHints.size}, layout=${isLayoutChange})`);

  // Layout changes are self-contained — don't include prior conversation history
  // which may contain stale text edit messages that confuse the model
  const messages = isLayoutChange
    ? [{ role: "user" as const, content: message }]
    : history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  startSSE(res);

  let hadToolUse = false;
  let hasEdited = false;
  let createdPageUrl: string | null = null;
  let fullAssistantText = "";

  const isWireframe = isDesignPlacement && message.includes("## Wireframe:");

  for (let step = 0; step < maxSteps; step++) {
    // Step 0 with pre-read: force tool_choice to skip preamble
    const useToolChoice = step === 0 && hasPreRead;

    log(`  Step ${step + 1}: calling API (claude-sonnet-4-6)...`);

    // Gate resolve behind hasEdited; limit tools based on action type
    const tools = isWireframe
      ? [WRITE_FILE_TOOL, ...ANTHROPIC_TOOLS.filter(t => t.name === "resolve_annotation" && hasEdited)]
      : ANTHROPIC_TOOLS.filter(t => {
          if (t.name === "resolve_annotation") return hasEdited;
          if (hasPreRead && step === 0 && !isLayoutChange) return t.name === "edit_file";
          return true;
        });

    // For wireframes step 0, force write_file to skip exploration
    const toolChoice = isWireframe && step === 0
      ? { type: "tool" as const, name: "write_file" }
      : useToolChoice ? { type: "any" as const } : undefined;

    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: isDesignPlacement ? 4096 : 2048,
      system: systemPrompt,
      messages,
      tools,
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    });

    if (hadToolUse) { writeSSE(res, { type: "message_break" }); hadToolUse = false; }

    let stepText = "";
    let firstTokenTime = 0;

    stream.on("text", (text: string) => {
      if (!firstTokenTime) { firstTokenTime = Date.now(); log(`  +${firstTokenTime - t0}ms first token (step ${step + 1})`); }
      stepText += text;
      writeSSE(res, { type: "text_delta", text });
    });

    const finalMessage = await stream.finalMessage();
    log(`  +${Date.now() - t0}ms step ${step + 1} complete (${finalMessage.usage?.input_tokens}in/${finalMessage.usage?.output_tokens}out tokens)`);

    const toolUses = finalMessage.content.filter(
      (b: any): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use"
    );

    messages.push({ role: "assistant", content: finalMessage.content as any });
    fullAssistantText += stepText;

    if (toolUses.length === 0) break;

    hadToolUse = true;
    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
    let justResolved = false;

    for (const tu of toolUses) {
      // Hard block: write_file is ONLY allowed for wireframe creation
      if (tu.name === "write_file" && !isWireframe) {
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Error: write_file is not available. Use edit_file to modify existing files.` });
        log(`  +${Date.now() - t0}ms BLOCKED write_file (not a wireframe request)`);
        continue;
      }
      const label = TOOL_LABELS[tu.name] || tu.name;
      const toolStart = Date.now();
      writeSSE(res, { type: "tool_use", name: label, input: tu.input });
      eventBus.emit("agent.activity", sessionId, {
        event: "tool_use", summary: `${label}...`, active: true,
        tool_name: tu.name, timestamp: new Date().toISOString(),
      });

      const rawResult = await executeTool(tu.name, tu.input);
      const maxLen = tu.name === "read_file" ? 1500 : tu.name === "grep_code" ? 1000 : 3000;
      const result = rawResult.length > maxLen ? rawResult.slice(0, maxLen) + "\n... (truncated)" : rawResult;

      if (tu.name === "edit_file" || tu.name === "write_file") {
        if (rawResult.startsWith("Edited ") || rawResult.startsWith("Created ")) hasEdited = true;
        // Track new page URL for CTA
        if (tu.name === "write_file" && rawResult.startsWith("Created ")) {
          const filePath = tu.input.file_path as string;
          const routeMatch = filePath.match(/app\/(.+?)\/page\.\w+$/);
          if (routeMatch) {
            const origin = message.match(/Page URL:\s*(https?:\/\/[^/\s]+)/)?.[1] || "http://localhost:3000";
            createdPageUrl = `${origin}/${routeMatch[1]}`;
          }
          // Auto-resolve all pending placement annotations — no need for model to do it
          if (isWireframe) {
            const placements = getPendingAnnotations(sessionId).filter(a => (a as any).kind === "placement");
            for (const p of placements) {
              updateAnnotationStatus(p.id, "resolved", "agent");
              log(`  +${Date.now() - t0}ms auto-resolved ${p.id}`);
            }
            justResolved = true;
          }
        }
        log(`  +${Date.now() - t0}ms ${tu.name}: ${rawResult} [${Date.now() - toolStart}ms]`);
      } else {
        log(`  +${Date.now() - t0}ms ${tu.name}(${JSON.stringify(tu.input).slice(0, 60)}) → ${rawResult.length} chars [${Date.now() - toolStart}ms]`);
      }
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
      writeSSE(res, { type: "tool_result", name: label, result });

      if (tu.name === "resolve_annotation") justResolved = true;
    }

    messages.push({ role: "user", content: toolResults as any });

    if (justResolved) {
      writeSSE(res, { type: "message_break" });
      const resolveResult = toolResults.find(tr =>
        toolUses.find(tu => tu.name === "resolve_annotation")?.id === tr.tool_use_id
      );
      if (resolveResult) writeSSE(res, { type: "text_delta", text: resolveResult.content });
      break;
    }
  }

  // Mandatory resolve on exhaustion — notify the UI instead of silently dropping
  if (!fullAssistantText.includes("Resolved") && !hasEdited) {
    writeSSE(res, { type: "text_delta", text: "\n\nCould not complete this edit — the annotation remains pending for manual review." });
  }

  if (fullAssistantText) history.push({ role: "assistant", content: fullAssistantText });

  // Clear history after wireframe creation so subsequent text edits don't see write_file in history
  if (isWireframe && hasEdited) {
    conversationHistory.delete(sessionId);
  }

  log(`━━━ Chat complete: ${Date.now() - t0}ms total ━━━`);

  writeSSE(res, { type: "complete", ...(createdPageUrl ? { url: createdPageUrl } : {}) });
  eventBus.emit("agent.stopped", sessionId, {
    event: "stopped",
    summary: createdPageUrl ? "Page created" : "Finished",
    active: false,
    timestamp: new Date().toISOString(),
    ...(createdPageUrl ? { url: createdPageUrl } : {}),
  });

  if (!res.writableEnded) res.end();
}

// ---------------------------------------------------------------------------
// OpenAI Provider
// ---------------------------------------------------------------------------

async function streamOpenAI(sessionId: string, message: string, res: ServerResponse): Promise<void> {
  const client = await getOpenAIClient();
  const history = getHistory(sessionId);
  history.push({ role: "user", content: message });

  const sourceHints = parseSourceHints(message);
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: buildSystemPrompt(sessionId, sourceHints) },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ];

  startSSE(res);
  let hadToolUse = false;
  let hasEdited = false;
  let fullAssistantText = "";

  for (let step = 0; step < 6; step++) {
    if (hadToolUse) { writeSSE(res, { type: "message_break" }); hadToolUse = false; }

    // Gate resolve behind hasEdited
    const tools = hasEdited
      ? OPENAI_TOOLS
      : OPENAI_TOOLS.filter(t => t.function.name !== "resolve_annotation");

    const stream = await client.chat.completions.create({
      model: "gpt-4o", messages: messages as any, tools, stream: true,
    });

    let stepText = "";
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    for await (const chunk of stream) {
      const delta = (chunk as any).choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        stepText += delta.content;
        writeSSE(res, { type: "text_delta", text: delta.content });
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: "", name: "", arguments: "" };
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }
    }

    fullAssistantText += stepText;

    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant", content: stepText || null,
        tool_calls: toolCalls.map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } })),
      });
    } else {
      messages.push({ role: "assistant", content: stepText });
      break;
    }

    hadToolUse = true;
    let justResolved = false;

    for (const tc of toolCalls) {
      const label = TOOL_LABELS[tc.name] || tc.name;
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.arguments); } catch {}

      writeSSE(res, { type: "tool_use", name: label, input });
      eventBus.emit("agent.activity", sessionId, {
        event: "tool_use", summary: `${label}...`, active: true,
        tool_name: tc.name, timestamp: new Date().toISOString(),
      });

      const rawResult = await executeTool(tc.name, input);
      if ((tc.name === "edit_file" || tc.name === "write_file") && (rawResult.startsWith("Edited ") || rawResult.startsWith("Created "))) hasEdited = true;
      const maxLen = tc.name === "read_file" ? 1500 : tc.name === "grep_code" ? 1000 : 3000;
      const result = rawResult.length > maxLen ? rawResult.slice(0, maxLen) + "\n... (truncated)" : rawResult;
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      writeSSE(res, { type: "tool_result", name: label, result });
      if (tc.name === "resolve_annotation") justResolved = true;
    }

    if (justResolved) {
      writeSSE(res, { type: "message_break" });
      break;
    }
  }

  // Mandatory resolve on exhaustion
  if (!fullAssistantText.includes("Resolved") && !hasEdited) {
    writeSSE(res, { type: "text_delta", text: "\n\nCould not complete this edit — the annotation remains pending for manual review." });
  }

  if (fullAssistantText) history.push({ role: "assistant", content: fullAssistantText });

  writeSSE(res, { type: "complete" });
  eventBus.emit("agent.stopped", sessionId, {
    event: "stopped", summary: "Finished", active: false, timestamp: new Date().toISOString(),
  });

  if (!res.writableEnded) res.end();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleChatMessage(sessionId: string, message: string, res: ServerResponse): Promise<void> {
  if (!apiKey || !provider) {
    startSSE(res);
    writeSSE(res, { type: "error", message: "No API key configured. Send your key to POST /chat/api-key first." });
    res.end();
    return;
  }

  // Pre-warm SDK import while we do other work
  const clientPromise = provider === "anthropic" ? getAnthropicClient() : getOpenAIClient();

  eventBus.emit("agent.activity", sessionId, {
    event: "tool_use", summary: "Thinking...", active: true, timestamp: new Date().toISOString(),
  });

  try {
    await clientPromise; // Ensure SDK is ready
    if (provider === "anthropic") await streamAnthropic(sessionId, message, res);
    else await streamOpenAI(sessionId, message, res);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    log(`Chat error: ${errMsg}`);
    if (!res.headersSent) startSSE(res);
    writeSSE(res, { type: "error", message: errMsg });
    if (!res.writableEnded) res.end();
  }
}

export function clearChatHistory(sessionId: string): void {
  conversationHistory.delete(sessionId);
}
