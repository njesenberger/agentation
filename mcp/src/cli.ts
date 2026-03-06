/**
 * Agentation MCP CLI
 *
 * Usage:
 *   agentation-mcp server [--port 4747]
 *   agentation-mcp init
 *   agentation-mcp doctor
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const command = process.argv[2];

// ============================================================================
// INIT COMMAND - Interactive setup wizard
// ============================================================================

async function runInit() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                 Agentation MCP Setup Wizard                    ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Step 1: Check Claude Code config
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeConfigPath = path.join(homeDir, ".claude.json");
  const hasClaudeConfig = fs.existsSync(claudeConfigPath);

  if (hasClaudeConfig) {
    console.log(`✓ Found Claude Code config at ${claudeConfigPath}`);
  } else {
    console.log(`○ No Claude Code config found at ${claudeConfigPath}`);
  }
  console.log();

  // Step 2: Ask about MCP server
  console.log(`The Agentation MCP server allows Claude Code to receive`);
  console.log(`real-time annotations and respond to feedback.`);
  console.log();

  const setupMcp = await question(`Set up MCP server integration? [Y/n] `);
  const wantsMcp = setupMcp.toLowerCase() !== "n";

  if (wantsMcp) {
    let port = 4747;
    const portAnswer = await question(`HTTP server port [4747]: `);
    if (portAnswer && !isNaN(parseInt(portAnswer, 10))) {
      port = parseInt(portAnswer, 10);
    }

    // Register MCP server using claude mcp add
    const mcpArgs = port === 4747
      ? ["mcp", "add", "agentation", "--", "npx", "agentation-mcp", "server"]
      : ["mcp", "add", "agentation", "--", "npx", "agentation-mcp", "server", "--port", String(port)];

    console.log();
    console.log(`Running: claude ${mcpArgs.join(" ")}`);

    try {
      const result = spawn("claude", mcpArgs, { stdio: "inherit" });
      await new Promise<void>((resolve, reject) => {
        result.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`claude mcp add exited with code ${code}`));
        });
        result.on("error", reject);
      });
      console.log(`✓ Registered agentation MCP server with Claude Code`);
    } catch (err) {
      console.log(`✗ Could not register MCP server automatically: ${err}`);
      console.log(`  You can register manually by running:`);
      console.log(`  claude mcp add agentation -- npx agentation-mcp server`);
    }
    console.log();

    // Step 3: Set up hooks for live agent activity
    console.log(`Live agent activity shows what Claude is doing in real-time`);
    console.log(`on your web page — editing files, running commands, etc.`);
    console.log();

    const setupHooks = await question(`Set up live agent activity hooks? [Y/n] `);
    if (setupHooks.toLowerCase() !== "n") {
      const statusUrl = `http://localhost:${port}/agent-status`;
      const pendingUrl = `http://localhost:${port}/pending`;
      const hooksConfig = {
        SessionStart: [{
          hooks: [{
            type: "command",
            command: `curl -sf -X POST ${statusUrl} -H 'Content-Type: application/json' -d '{"hook_event_name":"SessionStart"}' --connect-timeout 2 --max-time 3 >/dev/null 2>&1; exit 0`,
          }],
        }],
        UserPromptSubmit: [{
          hooks: [{
            type: "command",
            command: `curl -sf --connect-timeout 1 ${pendingUrl} 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);c=d['count'];exit(0)if c==0 else[print(f'\\n=== AGENTATION: {c} UI annotations ===\\n'),*[print(f\\"[{i+1}] {a[\\'element\\']}\\n    {a[\\'comment\\']}\\n\\")for i,a in enumerate(d['annotations'])],print('=== END ===\\n')]" 2>/dev/null;exit 0`,
          }],
        }],
        PreToolUse: [{
          matcher: "Edit|Write|Bash|Read|Glob|Grep|Agent",
          hooks: [{
            type: "http",
            url: statusUrl,
            timeout: 5,
          }],
        }],
        PostToolUse: [{
          matcher: "Edit|Write|Bash",
          hooks: [{
            type: "http",
            url: statusUrl,
            timeout: 5,
          }],
        }],
        PostToolUseFailure: [{
          matcher: "Edit|Write|Bash",
          hooks: [{
            type: "http",
            url: statusUrl,
            timeout: 5,
          }],
        }],
        Stop: [{
          hooks: [
            {
              type: "http",
              url: statusUrl,
              timeout: 5,
            },
            {
              type: "command",
              command: `response=$(curl -sf --connect-timeout 1 --max-time 2 ${pendingUrl} 2>/dev/null) && count=$(echo "$response" | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])" 2>/dev/null) && [ "$count" -gt 0 ] 2>/dev/null && echo "$response" | python3 -c "import sys,json;d=json.load(sys.stdin);annotations='\\n'.join(f\\"[{i+1}] {a['element']}: {a['comment']}\\" for i,a in enumerate(d['annotations']));print(json.dumps({'decision':'block','reason':f'There are {d[\\"count\\"]} new UI annotations to address:\\n{annotations}\\nPlease review and action these annotations.'}))" 2>/dev/null || exit 0`,
            },
          ],
        }],
        Notification: [{
          matcher: "permission_prompt|idle_prompt",
          hooks: [{
            type: "http",
            url: statusUrl,
            timeout: 5,
          }],
        }],
      };

      try {
        // Ensure .claude directory exists
        const claudeDir = path.join(process.cwd(), ".claude");
        if (!fs.existsSync(claudeDir)) {
          fs.mkdirSync(claudeDir, { recursive: true });
        }

        const settingsPath = path.join(claudeDir, "settings.json");
        let settings: Record<string, unknown> = {};

        if (fs.existsSync(settingsPath)) {
          try {
            settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          } catch {
            // If file is malformed, start fresh
          }
        }

        // Merge hooks (don't overwrite existing hooks for other events)
        const existingHooks = (settings.hooks || {}) as Record<string, unknown[]>;
        settings.hooks = { ...existingHooks, ...hooksConfig };

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

        console.log(`✓ Added hooks to .claude/settings.json`);
        console.log(`  - SessionStart → "session connected" on toolbar`);
        console.log(`  - PreToolUse → live "editing file..." status`);
        console.log(`  - PostToolUse → "file saved" confirmation`);
        console.log(`  - PostToolUseFailure → "build failed" error state`);
        console.log(`  - Stop → finished + auto-loop if new annotations`);
        console.log(`  - Notification → permission/idle prompts`);
        console.log(`  - UserPromptSubmit → annotation context injection`);
      } catch (err) {
        console.log(`✗ Could not write hooks: ${err}`);
        console.log(`  You can add them manually. See: npx agentation-mcp help`);
      }
    }
    console.log();

    // Test connection
    const testNow = await question(`Start server and test connection? [Y/n] `);
    if (testNow.toLowerCase() !== "n") {
      console.log();
      console.log(`Starting server on port ${port}...`);

      // Start server in background
      const server = spawn("agentation-mcp", ["server", "--port", String(port)], {
        stdio: "inherit",
        detached: false,
      });

      // Wait a moment for server to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Test health endpoint
      try {
        const response = await fetch(`http://localhost:${port}/health`);
        if (response.ok) {
          console.log();
          console.log(`✓ Server is running on http://localhost:${port}`);
          console.log(`✓ MCP tools available to Claude Code`);
          console.log();
          console.log(`Press Ctrl+C to stop the server.`);

          // Keep running
          await new Promise(() => {});
        } else {
          console.log(`✗ Server health check failed: ${response.status}`);
          server.kill();
        }
      } catch (err) {
        console.log(`✗ Could not connect to server: ${err}`);
        server.kill();
      }
    }
  }

  console.log();
  console.log(`Setup complete! Run 'agentation-mcp doctor' to verify your setup.`);
  rl.close();
}

// ============================================================================
// DOCTOR COMMAND - Diagnostic checks
// ============================================================================

async function runDoctor() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Agentation MCP Doctor                       ║
╚═══════════════════════════════════════════════════════════════╝
`);

  let allPassed = true;
  const results: Array<{ name: string; status: "pass" | "fail" | "warn"; message: string }> = [];

  // Check 1: Node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  if (majorVersion >= 18) {
    results.push({ name: "Node.js", status: "pass", message: `${nodeVersion} (18+ required)` });
  } else {
    results.push({ name: "Node.js", status: "fail", message: `${nodeVersion} (18+ required)` });
    allPassed = false;
  }

  // Check 2: Claude Code config
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeConfigPath = path.join(homeDir, ".claude.json");
  if (fs.existsSync(claudeConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(claudeConfigPath, "utf-8"));
      // Check top-level and per-project mcpServers for agentation
      let found = false;
      if (config.mcpServers?.agentation) {
        found = true;
      }
      // Also check per-project entries
      if (!found && config.projects) {
        for (const proj of Object.values(config.projects) as Record<string, unknown>[]) {
          if ((proj as { mcpServers?: { agentation?: unknown } }).mcpServers?.agentation) {
            found = true;
            break;
          }
        }
      }
      if (found) {
        results.push({ name: "Claude Code config", status: "pass", message: "MCP server configured" });
      } else {
        results.push({ name: "Claude Code config", status: "warn", message: "Config exists but no agentation MCP entry. Run: claude mcp add agentation -- npx agentation-mcp server" });
      }
    } catch {
      results.push({ name: "Claude Code config", status: "fail", message: "Could not parse config file" });
      allPassed = false;
    }
  } else {
    results.push({ name: "Claude Code config", status: "warn", message: "No config found at ~/.claude.json. Run: claude mcp add agentation -- npx agentation-mcp server" });
  }

  // Check 3: Stale config at old (wrong) path
  const oldConfigPath = path.join(homeDir, ".claude", "claude_code_config.json");
  if (fs.existsSync(oldConfigPath)) {
    results.push({ name: "Stale config", status: "warn", message: `${oldConfigPath} exists but Claude Code doesn't read this file. Safe to delete.` });
  }

  // Check 4: Hooks configuration
  const projectSettingsPath = path.join(process.cwd(), ".claude", "settings.json");
  if (fs.existsSync(projectSettingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(projectSettingsPath, "utf-8"));
      const hooks = settings.hooks as Record<string, unknown[]> | undefined;
      const hasPostToolUse = hooks?.PostToolUse && JSON.stringify(hooks.PostToolUse).includes("agent-status");
      if (hasPostToolUse) {
        results.push({ name: "Hooks", status: "pass", message: "Agent activity hooks configured" });
      } else {
        results.push({ name: "Hooks", status: "warn", message: "No agent activity hooks. Run: agentation-mcp init" });
      }
    } catch {
      results.push({ name: "Hooks", status: "warn", message: "Could not parse .claude/settings.json" });
    }
  } else {
    results.push({ name: "Hooks", status: "warn", message: "No .claude/settings.json found. Run: agentation-mcp init" });
  }

  // Check 5: Server connectivity (try default port)
  try {
    const response = await fetch("http://localhost:4747/health", { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      results.push({ name: "Server (port 4747)", status: "pass", message: "Running and healthy" });
    } else {
      results.push({ name: "Server (port 4747)", status: "warn", message: `Responded with ${response.status}` });
    }
  } catch {
    results.push({ name: "Server (port 4747)", status: "warn", message: "Not running (start with: agentation-mcp server)" });
  }

  // Print results
  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○";
    const color = r.status === "pass" ? "\x1b[32m" : r.status === "fail" ? "\x1b[31m" : "\x1b[33m";
    console.log(`${color}${icon}\x1b[0m ${r.name}: ${r.message}`);
  }

  console.log();
  if (allPassed) {
    console.log(`All checks passed!`);
  } else {
    console.log(`Some checks failed. Run 'agentation-mcp init' to fix.`);
    process.exit(1);
  }
}

// ============================================================================
// COMMAND ROUTER
// ============================================================================

if (command === "init") {
  runInit().catch((err) => {
    console.error("Init failed:", err);
    process.exit(1);
  });
} else if (command === "doctor") {
  runDoctor().catch((err) => {
    console.error("Doctor failed:", err);
    process.exit(1);
  });
} else if (command === "server") {
  // Dynamic import to avoid loading server code for other commands
  import("./server/index.js").then(({ startHttpServer, startMcpServer, setApiKey }) => {
    const args = process.argv.slice(3);
    let port = 4747;
    let mcpOnly = false;
    let httpUrl = "http://localhost:4747";
    let apiKeyArg: string | undefined;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--port" && args[i + 1]) {
        const parsed = parseInt(args[i + 1], 10);
        if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
          port = parsed;
          if (!args.includes("--http-url")) {
            httpUrl = `http://localhost:${port}`;
          }
        }
        i++;
      }
      if (args[i] === "--mcp-only") {
        mcpOnly = true;
      }
      if (args[i] === "--http-url" && args[i + 1]) {
        httpUrl = args[i + 1];
        i++;
      }
      if (args[i] === "--api-key" && args[i + 1]) {
        apiKeyArg = args[i + 1];
        i++;
      }
    }

    // API key from flag or environment variable
    const apiKey = apiKeyArg || process.env.AGENTATION_API_KEY;
    if (apiKey) {
      setApiKey(apiKey);
    }

    if (!mcpOnly) {
      startHttpServer(port, apiKey);
    }
    startMcpServer(httpUrl).catch((err) => {
      console.error("MCP server error:", err);
      process.exit(1);
    });
  });
} else if (command === "help" || command === "--help" || command === "-h" || !command) {
  console.log(`
agentation-mcp - MCP server for Agentation visual feedback

Usage:
  agentation-mcp init                    Interactive setup wizard
  agentation-mcp server [options]        Start the annotation server
  agentation-mcp doctor                  Check your setup and diagnose issues
  agentation-mcp help                    Show this help message

Server Options:
  --port <port>      HTTP server port (default: 4747)
  --mcp-only         Skip HTTP server, only run MCP on stdio
  --http-url <url>   HTTP server URL for MCP to fetch from
  --api-key <key>    API key for cloud storage (or set AGENTATION_API_KEY env var)

Commands:
  init      Guided setup that configures Claude Code to use the MCP server.
            Registers the server via 'claude mcp add'.

  server    Starts both an HTTP server and MCP server for collecting annotations.
            The HTTP server receives annotations from the React component.
            The MCP server exposes tools for Claude Code to read/act on annotations.

  doctor    Runs diagnostic checks on your setup:
            - Node.js version
            - Claude Code configuration
            - Server connectivity

Examples:
  agentation-mcp init                Set up Agentation MCP
  agentation-mcp server              Start server on default port 4747
  agentation-mcp server --port 8080  Start server on port 8080
  agentation-mcp doctor              Check if everything is configured correctly

  # Use cloud storage with API key (local server proxies to cloud)
  agentation-mcp server --api-key ag_xxx

  # Or using environment variable
  AGENTATION_API_KEY=ag_xxx agentation-mcp server
`);
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Run 'agentation-mcp help' for usage information.");
  process.exit(1);
}
