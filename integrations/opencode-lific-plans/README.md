# opencode-lific-plans

An [OpenCode](https://opencode.ai) plugin that makes the harness's planning
**Lific-backed** by overriding the builtin `todowrite` tool.

OpenCode's `todowrite` keeps a per-session todo list that disappears when the
session ends or the context is compacted. This plugin replaces it so the list:

- still renders with the **exact native todo block** (the TUI keys its special
  todo rendering on the literal tool name `todowrite`, so keeping the name keeps
  the rendering),
- is **persisted to a Lific plan** (one per OpenCode session, per project),
  visible/editable in the Lific web UI (Plans tab),
- is **re-injected on compaction**, so the model resumes from the same plan,
- supports **multiple projects**: the target project is set **per folder** via
  the `set_lific_project` tool (no global default), so every repo maps to its
  own Lific project.

Each todo maps to a plan step; steps are marked done for `completed`/`cancelled`
todos, and the plan is marked `done` once everything is complete.

## Why override instead of a new tool

The OpenCode TUI (`@opentui/solid`) renders tools through a `<Switch>` keyed on
the tool name against a **hardcoded** set (`packages/tui/src/routes/session/index.tsx`).
Only `todowrite` gets the pretty `<TodoWrite>`/`<TodoItem>` block; any other tool
name renders as a generic block, and plugins cannot add TUI components
(`PluginModule.tui` is typed `never`). So reusing the name `todowrite` is the
only way to get first-class rendering from a plugin. The override sets
`metadata.todos` (what the renderer reads) exactly like the builtin.

## Hard dependency (by design)

When Lific **is configured**, a failed Lific write **throws** — planning visibly
fails if Lific is down, as a forcing function to keep it running. When Lific is
**not configured**, the tool falls back to pure native behavior (render only),
so the plugin is always safe to load.

## Install

```bash
mkdir -p ~/.config/opencode/plugin
cp index.ts ~/.config/opencode/plugin/lific-plans.ts
```

…or reference it from `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///abs/path/to/integrations/opencode-lific-plans/index.ts"]
}
```

## Configure (connection only)

Just the Lific connection — env vars or plugin options. There is **no global
project setting**; the project is chosen per folder (see below).

```bash
export LIFIC_URL="https://your-lific-instance"
export LIFIC_API_KEY="lific_sk_…"        # Lific → Settings → API keys
```

```jsonc
{
  "plugin": [
    ["file:///abs/path/to/integrations/opencode-lific-plans/index.ts", {
      "url": "https://your-lific-instance",
      "apiKey": "lific_sk_…"
    }]
  ]
}
```

Restart OpenCode after changing config — plugins load once at startup.

## Pick the project, per folder

The plugin exposes a `set_lific_project` tool. Run it **once per folder** to
choose which Lific project that folder's plans go to:

```
set_lific_project({ project: "LIF" })
```

It validates the identifier against your Lific instance (and lists the available
projects if you mistype), then remembers the choice — keyed by the folder's
worktree — in `~/.cache/opencode/lific-plans/projects.json`, so it persists
across sessions. Different repos map to different projects automatically.

Calling the todo tool **before** setting the project fails with a clear
instruction to run `set_lific_project` first.

## Notes / limits

- Reconciles by content (OpenCode todos are flat with no stable ids). Nested
  steps you add by hand in Lific are left untouched; ordering isn't synced.
- One plan per (session, project). Completed plans are marked `done`; archive or
  delete them in Lific when finished.
- Overriding `todowrite` replaces the builtin's native session-todo persistence
  (`todoread` becomes Lific-backed only via this plugin's plan, not opencode's
  internal store). The inline rendering is unaffected.
- A true persistent **sidebar** panel for plans would require a change to
  OpenCode itself (plugins can't contribute TUI) — out of scope here.
