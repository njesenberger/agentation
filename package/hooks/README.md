# Agentation Hooks for Claude Code

Hooks that integrate Agentation with Claude Code for two-way communication:

1. **Annotation injection** — pending UI annotations are injected into Claude's context on every message
2. **Live agent activity** — the toolbar shows what Claude is doing in real-time (editing files, running commands, etc.)
3. **Error visibility** — failed tool calls show as red error state on the toolbar
4. **Hands-free auto-loop** — when Claude finishes, it checks for new annotations and keeps working

## Automatic Setup (Recommended)

Run the init wizard — it configures everything in one step:

```bash
npx agentation-mcp init
```

This registers the MCP server and writes all hooks to `.claude/settings.json`.

## Hook Reference

| Hook | Direction | What it does |
|---|---|---|
| `SessionStart` | → page | "Session started" — toolbar lights up |
| `UserPromptSubmit` | page → Claude | Injects pending annotations into Claude's context |
| `PreToolUse` | → page | "Editing Hero.tsx..." — live status while tool runs |
| `PostToolUse` | → page | "File saved" — confirmation after tool completes |
| `PostToolUseFailure` | → page | "Build failed" — red error state on toolbar |
| `Stop` | → page | "Finished" + checks for new annotations to auto-loop |
| `Notification` | → page | "Waiting for permission" — permission/idle prompts |

## Manual Setup

Add to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:4747/agent-status",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -sf --connect-timeout 1 http://localhost:4747/pending 2>/dev/null | python3 -c \"import sys,json;d=json.load(sys.stdin);c=d['count'];exit(0)if c==0 else[print(f'\\n=== AGENTATION: {c} UI annotations ===\\n'),*[print(f\\\"[{i+1}] {a['element']}\\n    {a['comment']}\\n\\\")for i,a in enumerate(d['annotations'])],print('=== END ===\\n')]\" 2>/dev/null;exit 0"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Bash|Read|Glob|Grep|Agent",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:4747/agent-status",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|Bash",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:4747/agent-status",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "Edit|Write|Bash",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:4747/agent-status",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:4747/agent-status",
            "timeout": 5
          },
          {
            "type": "command",
            "command": "SEE BELOW FOR AUTO-LOOP COMMAND"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "permission_prompt|idle_prompt",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:4747/agent-status",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Stop Auto-Loop

The Stop hook includes a command hook that checks for new annotations when Claude finishes. If annotations exist, it returns `decision: "block"` which prevents Claude from stopping and feeds the annotations as the reason to continue. This creates a fully autonomous hands-free loop.

Use `npx agentation-mcp init` to get the full auto-loop command configured automatically.

## How It Works

### Live Activity (`PreToolUse`, `PostToolUse`)

- **PreToolUse** fires *before* tool execution with a wide matcher (`Edit|Write|Bash|Read|Glob|Grep|Agent`) — the toolbar shows "Editing Hero.tsx" or "Reading files" while Claude works
- **PostToolUse** fires *after* completion for write operations — confirms the action completed

### Error State (`PostToolUseFailure`)

When a tool fails (build error, test failure), the toolbar shows a **red** error label and pulsing dot. The error summary is extracted from the hook's `error` field.

### Hands-Free Auto-Loop (`Stop`)

Two hooks fire on Stop:
1. HTTP hook → sends "Finished" status to toolbar
2. Command hook → checks `/pending` for new annotations. If found, returns `decision: "block"` with the annotation details, so Claude continues working on them

## Requirements

- Agentation server running (`npx agentation-mcp server` or integrated in your app)
- Python 3 (for annotation injection and auto-loop — comes with macOS/most Linux)
- curl (standard on most systems)

## Verifying Setup

```bash
npx agentation-mcp doctor
```
