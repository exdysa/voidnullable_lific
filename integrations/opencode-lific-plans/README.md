# opencode-lific-plans

An [OpenCode](https://opencode.ai) plugin that makes the harness's in-session
planning **durable** by mirroring it into [Lific](https://github.com/VoidNullable/lific)
**plans**.

OpenCode's `todowrite` tool keeps a per-session todo list that disappears when
the session ends or the context is compacted. This plugin pushes that list into
a Lific plan (one per OpenCode session) so it:

- **persists** across sessions and restarts,
- is **visible and editable** in the Lific web UI (Plans tab),
- is **re-injected on compaction**, so the model resumes from the same plan.

It maps each todo to a plan step, marks steps done when a todo is
`completed`/`cancelled`, and marks the whole plan `done` once everything is
complete.

## How it works

| OpenCode | → | Lific |
| --- | --- | --- |
| `todo.updated` event (`todowrite`) | → | reconcile the session's plan steps (add / delete / toggle done) |
| `experimental.session.compacting` | → | inject the plan (`LIF-PLAN-n` + checklist) into the continuation context |

Plans are keyed to the OpenCode `sessionID` via a sidecar cache at
`~/.cache/opencode/lific-plans/<sessionID>.json`.

The plugin is fully defensive: if it isn't configured, or any Lific call fails,
it logs and no-ops — it will never break a coding session.

## Install

Drop the file into your OpenCode plugin directory (auto-loaded at startup):

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

## Configure

All three are required to activate (otherwise the plugin stays inert). Use env
vars:

```bash
export LIFIC_URL="https://your-lific-instance"
export LIFIC_API_KEY="lific_sk_…"        # Lific → Settings → API keys
export LIFIC_PLAN_PROJECT="LIF"          # project identifier the plans live in
```

…or plugin options in `opencode.json`:

```jsonc
{
  "plugin": [
    ["file:///abs/path/to/integrations/opencode-lific-plans/index.ts", {
      "url": "https://your-lific-instance",
      "apiKey": "lific_sk_…",
      "project": "LIF"
    }]
  ]
}
```

Restart OpenCode after changing config — it loads plugins once at startup.

## Notes / limits

- OpenCode todos are **flat and have no stable ids**, so steps are reconciled by
  content. Nested steps you add by hand in Lific are left untouched.
- Step ordering is not synced (content add/remove/done is). Reorder in Lific if
  you care about order.
- One plan per OpenCode session. Completed sessions' plans are marked `done`;
  archive or delete them in Lific when you're finished.
