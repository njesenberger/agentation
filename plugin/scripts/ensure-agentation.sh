#!/bin/bash
# Auto-install agentation + MCP server in React projects (supports monorepos)

command -v node &>/dev/null || exit 0
[[ ! -f "package.json" ]] && exit 0

# --- 1. Install the React package if missing ---

RESULT=$(node -e "
  const fs = require('fs');
  const path = require('path');

  function checkDir(dir) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return { hasReact: !!deps.react, hasAgentation: !!deps.agentation, dir };
    } catch { return null; }
  }

  const results = [];
  const root = checkDir('.');
  if (root && root.hasReact) results.push(root);

  for (const base of ['apps', 'packages']) {
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const r = checkDir(path.join(base, e.name));
        if (r && r.hasReact) results.push(r);
      }
    } catch {}
  }

  const missing = results.filter(r => !r.hasAgentation);
  if (missing.length > 0) { console.log(JSON.stringify(missing)); process.exit(0); }
  // Still a React project even if agentation is installed
  if (results.length > 0) { console.log('installed'); process.exit(0); }
  console.log('skip');
" 2>/dev/null)

if [[ "$RESULT" != "skip" ]] && [[ "$RESULT" != "installed" ]]; then
  DIRS=$(echo "$RESULT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); d.forEach(r => console.log(r.dir))" 2>/dev/null)

  if [[ -n "$DIRS" ]]; then
    while IFS= read -r WEB_DIR; do
      if [[ -f "pnpm-lock.yaml" ]]; then
        pnpm add agentation -D --filter "./${WEB_DIR}" &>/dev/null
      elif [[ -f "yarn.lock" ]]; then
        yarn workspace "$(node -e "console.log(require('./${WEB_DIR}/package.json').name)" 2>/dev/null)" add agentation -D &>/dev/null
      elif [[ -f "bun.lockb" ]] || [[ -f "bun.lock" ]]; then
        (cd "$WEB_DIR" && bun add agentation -D &>/dev/null)
      else
        (cd "$WEB_DIR" && npm install agentation -D &>/dev/null)
      fi
    done <<< "$DIRS"
  fi
fi

# --- 2. Add MCP server config if missing ---

SETTINGS_FILE=".claude/settings.local.json"
mkdir -p .claude

if [[ -f "$SETTINGS_FILE" ]]; then
  # Check if agentation MCP is already configured
  HAS_MCP=$(node -e "
    const s = JSON.parse(require('fs').readFileSync('$SETTINGS_FILE', 'utf8'));
    console.log(s.mcpServers?.agentation ? 'yes' : 'no');
  " 2>/dev/null)

  if [[ "$HAS_MCP" != "yes" ]]; then
    # Merge into existing settings
    node -e "
      const fs = require('fs');
      const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      s.mcpServers = s.mcpServers || {};
      s.mcpServers.agentation = { command: 'npx', args: ['-y', 'agentation-mcp'] };
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(s, null, 2) + '\n');
    " 2>/dev/null
  fi
else
  # Create new settings file
  cat > "$SETTINGS_FILE" << 'MCPEOF'
{
  "mcpServers": {
    "agentation": {
      "command": "npx",
      "args": ["-y", "agentation-mcp"]
    }
  }
}
MCPEOF
fi

exit 0
