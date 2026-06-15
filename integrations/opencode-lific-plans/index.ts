// opencode-lific-plans — make OpenCode's harness-level planning durable.
//
// OpenCode's `todowrite` tool keeps an in-session todo list that evaporates
// when the session ends or context is compacted. This plugin mirrors that list
// into a Lific **plan** (one per OpenCode session) so the plan persists, is
// visible/editable in the Lific web UI, and is re-injected on compaction.
//
// How it hooks in:
//   - `event` → `todo.updated` ({ sessionID, todos:[{content,status,priority}] })
//     reconciles the session's plan steps with the todo list.
//   - `experimental.session.compacting` injects the current plan (as a markdown
//     checklist + its LIF-PLAN-n id) into the continuation context.
//
// Config (plugin options OR env), all required to activate — otherwise no-op:
//   LIFIC_URL          base URL of the Lific instance (e.g. https://lific.example)
//   LIFIC_API_KEY      a Lific API key (Settings → API keys)
//   LIFIC_PLAN_PROJECT project identifier the session plans live in (e.g. LIF)
//
// The plugin is defensive: any error is logged and swallowed so it can never
// break a coding session.

import type { Plugin } from "@opencode-ai/plugin";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Types mirroring the Lific REST surface ───────────────────
interface Step {
  id: number;
  title: string;
  done: boolean;
  parent_step_id: number | null;
  children: Step[];
}
interface Plan {
  id: number;
  identifier: string;
  title: string;
  status: string;
  steps: Step[];
  step_count: number;
  done_count: number;
}
interface Todo {
  content: string;
  status: string;
  priority?: string;
}

interface Cfg {
  url: string;
  apiKey: string;
  project: string;
}

function loadConfig(options?: Record<string, unknown>): Cfg | null {
  const pick = (k: string, env: string) =>
    (typeof options?.[k] === "string" ? (options![k] as string) : "") || process.env[env] || "";
  const url = pick("url", "LIFIC_URL").replace(/\/+$/, "");
  const apiKey = pick("apiKey", "LIFIC_API_KEY");
  const project = pick("project", "LIFIC_PLAN_PROJECT");
  if (!url || !apiKey || !project) return null;
  return { url, apiKey, project };
}

// Sidecar cache: sessionID → planId, so a restarted process doesn't orphan or
// duplicate the session's plan.
const CACHE_DIR = join(homedir(), ".cache", "opencode", "lific-plans");
function cachePath(sessionID: string) {
  return join(CACHE_DIR, `${sessionID.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
}
function readCachedPlanId(sessionID: string): number | null {
  try {
    return JSON.parse(readFileSync(cachePath(sessionID), "utf8")).planId ?? null;
  } catch {
    return null;
  }
}
function writeCachedPlanId(sessionID: string, planId: number) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(sessionID), JSON.stringify({ planId }));
  } catch {
    /* cache is best-effort */
  }
}

const isDone = (status: string) => status === "completed" || status === "cancelled";

// ── Thin Lific REST client ───────────────────────────────────
class Lific {
  constructor(private cfg: Cfg) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.url}/api${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Lific ${method} ${path} → ${res.status} ${detail}`.trim());
    }
    return (res.status === 204 ? null : await res.json()) as T;
  }

  async projectId(identifier: string): Promise<number | null> {
    const projects = await this.req<Array<{ id: number; identifier: string }>>("GET", "/projects");
    return projects.find((p) => p.identifier === identifier)?.id ?? null;
  }
  getPlan(id: number) {
    return this.req<Plan>("GET", `/plans/${id}`);
  }
  createPlan(projectId: number, title: string) {
    return this.req<Plan>("POST", "/plans", { project_id: projectId, title });
  }
  setPlan(id: number, patch: Record<string, unknown>) {
    return this.req<Plan>("PUT", `/plans/${id}`, patch);
  }
  addStep(planId: number, title: string) {
    return this.req<Plan>("POST", `/plans/${planId}/steps`, { title });
  }
  setStep(planId: number, stepId: number, patch: Record<string, unknown>) {
    return this.req<unknown>("PUT", `/plans/${planId}/steps/${stepId}`, patch);
  }
  deleteStep(planId: number, stepId: number) {
    return this.req<unknown>("DELETE", `/plans/${planId}/steps/${stepId}`);
  }
}

/** Reconcile a plan's top-level steps with the flat OpenCode todo list.
 *  Matches by content: toggles done in place, adds new todos, deletes gone
 *  ones. (OpenCode todos have no stable ids and never nest, so top-level
 *  content is the only join key. Nested steps a human added in Lific are
 *  left untouched.) */
async function syncTodos(lific: Lific, planId: number, todos: Todo[]): Promise<Plan> {
  let plan = await lific.getPlan(planId);
  const byTitle = new Map<string, Step>();
  for (const s of plan.steps) if (!byTitle.has(s.title)) byTitle.set(s.title, s);

  const desired = todos.map((t) => ({ title: t.content, done: isDone(t.status) }));
  const desiredTitles = new Set(desired.map((d) => d.title));

  for (const d of desired) {
    const existing = byTitle.get(d.title);
    if (existing) {
      if (existing.done !== d.done) await lific.setStep(planId, existing.id, { done: d.done });
    } else {
      const after = await lific.addStep(planId, d.title);
      const created = after.steps.find((s) => s.title === d.title);
      if (created && d.done) await lific.setStep(planId, created.id, { done: true });
    }
  }

  for (const s of plan.steps) {
    if (!desiredTitles.has(s.title)) await lific.deleteStep(planId, s.id);
  }

  // Reflect overall completion on the plan's status.
  const allDone = desired.length > 0 && desired.every((d) => d.done);
  plan = await lific.getPlan(planId);
  const targetStatus = allDone ? "done" : "active";
  if (plan.status !== targetStatus && plan.status !== "archived") {
    plan = await lific.setPlan(planId, { status: targetStatus });
  }
  return plan;
}

function renderPlanMarkdown(plan: Plan): string {
  const lines: string[] = [];
  const walk = (steps: Step[], depth: number) => {
    for (const s of steps) {
      lines.push(`${"  ".repeat(depth)}- [${s.done ? "x" : " "}] ${s.title}`);
      if (s.children?.length) walk(s.children, depth + 1);
    }
  };
  walk(plan.steps, 0);
  return lines.join("\n");
}

export const LificPlans: Plugin = async ({ client, worktree, directory }, options) => {
  const cfg = loadConfig(options);
  const lific = cfg ? new Lific(cfg) : null;

  const log = (level: string, message: string) =>
    client.app
      .log({ body: { service: "lific-plans", level: level as never, message } })
      .catch(() => {});

  if (!lific) {
    await log(
      "info",
      "lific-plans inactive — set LIFIC_URL, LIFIC_API_KEY and LIFIC_PLAN_PROJECT (or plugin options) to enable.",
    );
    return {};
  }

  let projectIdCache: number | null = null;
  async function ensureProjectId(): Promise<number | null> {
    if (projectIdCache != null) return projectIdCache;
    projectIdCache = await lific!.projectId(cfg!.project);
    if (projectIdCache == null) await log("warn", `project '${cfg!.project}' not found in Lific`);
    return projectIdCache;
  }

  async function ensurePlan(sessionID: string): Promise<number | null> {
    const cached = readCachedPlanId(sessionID);
    if (cached != null) {
      try {
        await lific!.getPlan(cached);
        return cached;
      } catch {
        /* stale — fall through and recreate */
      }
    }
    const pid = await ensureProjectId();
    if (pid == null) return null;
    const repo = (worktree || directory || "").split("/").filter(Boolean).pop() || "session";
    const short = sessionID.slice(-6);
    const plan = await lific!.createPlan(pid, `OpenCode · ${repo} · ${short}`);
    writeCachedPlanId(sessionID, plan.id);
    await log("info", `created plan ${plan.identifier} for session ${sessionID}`);
    return plan.id;
  }

  return {
    event: async ({ event }) => {
      const e = event as { type?: string; properties?: { sessionID?: string; todos?: Todo[] } };
      if (e.type !== "todo.updated") return;
      const sessionID = e.properties?.sessionID;
      const todos = e.properties?.todos;
      if (!sessionID || !Array.isArray(todos)) return;
      try {
        const planId = await ensurePlan(sessionID);
        if (planId == null) return;
        await syncTodos(lific, planId, todos);
      } catch (err) {
        await log("warn", `sync failed: ${String(err)}`);
      }
    },

    "experimental.session.compacting": async ({ sessionID }, output) => {
      const planId = readCachedPlanId(sessionID);
      if (planId == null) return;
      try {
        const plan = await lific.getPlan(planId);
        if (plan.step_count === 0) return;
        output.context.push(
          `## Active Lific plan (${plan.identifier})\n` +
            `This session's plan is persisted in Lific and survives compaction. ` +
            `Resume from it; keep planning via \`todowrite\` (mirrored to this plan automatically).\n\n` +
            renderPlanMarkdown(plan),
        );
      } catch {
        /* never block compaction */
      }
    },
  };
};

export default LificPlans;
