# CLI Orchestrator — Quickstart

## 1. Install a CLI agent

You need at least **one** of these on your PATH:

| CLI | Install | Models | API key |
|-----|---------|--------|---------|
| Claude Code | `npm i -g @anthropic-ai/claude-code` | opus, sonnet, haiku | `ANTHROPIC_API_KEY` |
| Codex | `npm i -g @openai/codex` | gpt-5.4, o3-pro, o3-mini | `OPENAI_API_KEY` |
| OpenAI CLI | `pip install openai` | gpt-5.4, o3-pro | `OPENAI_API_KEY` |
| OpenCode | `go install github.com/opencode-ai/opencode@latest` | any (see below) | varies |

Verify:

```bash
claude --version     # or: codex --version / openai --version / opencode --version
```

## 2. Install and run

```bash
cd con_ai
npm install
npm run dev
```

That's it. The Electron window opens and auto-discovers every supported CLI on your PATH.

## 3. Quick test

1. Click **Orchestration** in the sidebar.
2. Type: `Research the project structure, then implement a hello-world endpoint`
3. Click **Start**.

The system splits it into nodes, assigns agents by role, and runs them.

---

## Using third-party APIs

The adapter system is a thin CLI wrapper — it spawns a process and passes your prompt. Any API key in your shell environment flows through automatically. This means any provider that has a CLI tool works.

### OpenCode — universal adapter

OpenCode supports **any OpenAI-compatible API** by setting a model string with a provider prefix. This makes it the easiest way to use third-party providers:

```bash
# Set up for the provider you want:
export OPENAI_API_KEY=sk-...          # OpenAI / OpenRouter
export ANTHROPIC_API_KEY=sk-ant-...   # Anthropic
export GOOGLE_API_KEY=AIza...         # Google Gemini
```

Then in the app's Settings page, create an agent profile using the **OpenCode** adapter with one of these model strings:

| Provider | Model string example |
|----------|---------------------|
| Anthropic | `anthropic/claude-sonnet-4-20250514` |
| OpenAI | `openai/gpt-5.4` |
| Google | `google/gemini-2.5-pro` |
| DeepSeek | `deepseek/deepseek-coder` |
| Groq | `groq/llama-4-maverick-17b-128e` |
| OpenRouter | `openrouter/meta-llama/llama-4-maverick` |

### Adding a new CLI adapter

Edit `config/adapters.json` to add any CLI that accepts a prompt and outputs text:

```json
{
  "id": "my-tool",
  "displayName": "My Tool",
  "visibility": "user",
  "requiresDiscovery": true,
  "command": "my-tool",
  "promptTransport": "arg",
  "args": ["run", "--model", "{{model}}", "{{prompt}}"],
  "description": "My custom CLI agent.",
  "capabilities": ["code", "planning"],
  "health": "idle",
  "enabled": true,
  "defaultTimeoutMs": null,
  "defaultModel": "default-model-name"
}
```

Template variables: `{{prompt}}`, `{{model}}`, `{{title}}`. Set `promptTransport` to `"stdin"` if the CLI reads from stdin instead of an argument.

After editing, click **Refresh local tools** on the Settings page.

---

## Project structure

```
config/
  adapters.json          # CLI adapter definitions
  agent-profiles.json    # default agent profiles (role + adapter + model)
  skills.json            # reusable task templates
  mcp-servers.json       # MCP server definitions

src/
  main/                  # Electron main process
    orchestratorService  # adapter discovery, run spawning, orchestration
    services/            # agent registry, skill registry, planner, execution
  renderer/src/          # React UI (Launch, Orchestration, Sessions, Settings)
  shared/                # domain types + IPC contracts
  preload/               # typed Electron IPC bridge
```

## Troubleshooting

**No enabled adapters** — No CLIs found on PATH. Install one, then click **Refresh local tools** in Settings.

**Blocked by environment** — CLI binary found but can't run. Launch the app from a terminal where the CLI works, or set a custom path in Settings.

**Node fails with "Adapter is not configured"** — The agent profile points to an adapter you don't have. Edit the profile in Settings to use one you do.

**Third-party API errors** — Check that the right API key env var is set in the terminal where you launched `npm run dev`. The app inherits your shell environment.
