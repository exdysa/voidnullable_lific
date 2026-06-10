<script lang="ts">
  // LIF-158 — project-level activity feed ("logs"). Everything that
  // happened in the project, newest first, across issues, pages,
  // comments, modules, labels, and folders. Entity labels link to their
  // detail pages. Background-polls like the issue list so an agent
  // working over MCP shows up here within seconds.

  import {
    listProjects,
    listProjectActivity,
    type Project,
    type Activity,
  } from "../lib/api";
  import ActivityTimeline from "../lib/ActivityTimeline.svelte";
  import { startAutoRefresh } from "../lib/autoRefresh.svelte";
  import { ChevronRight, History } from "lucide-svelte";
  import { getContext } from "svelte";

  const PAGE_SIZE = 50;

  const topbarCtx = getContext<{
    set: (s: import("svelte").Snippet | undefined) => void;
  } | undefined>("lific:topbar");

  $effect(() => {
    topbarCtx?.set(topbarContent);
    return () => topbarCtx?.set(undefined);
  });

  let {
    navigate,
    projectIdentifier,
  }: {
    navigate: (path: string) => void;
    projectIdentifier: string;
  } = $props();

  let project = $state<Project | null>(null);
  let items = $state<Activity[]>([]);
  let hasMore = $state(false);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state("");

  $effect(() => {
    const id = projectIdentifier;
    loadProject(id);
  });

  async function loadProject(ident: string) {
    loading = true;
    error = "";
    items = [];
    const projRes = await listProjects();
    if (!projRes.ok) { error = projRes.error; loading = false; return; }
    const found = projRes.data.find((p) => p.identifier === ident);
    if (!found) { error = `Project ${ident} not found`; loading = false; return; }
    project = found;

    const res = await listProjectActivity(found.id, PAGE_SIZE, 0);
    if (res.ok) {
      items = res.data.items;
      hasMore = res.data.has_more;
    }
    loading = false;
  }

  async function loadMore() {
    if (!project || loadingMore) return;
    loadingMore = true;
    const res = await listProjectActivity(project.id, PAGE_SIZE, items.length);
    if (res.ok) {
      // Dedupe on id: a poll may have prepended rows since the offsets
      // were computed, which would otherwise repeat entries.
      const known = new Set(items.map((a) => a.id));
      items = [...items, ...res.data.items.filter((a) => !known.has(a.id))];
      hasMore = res.data.has_more;
    }
    loadingMore = false;
  }

  // Background poll: re-pull the first page and prepend anything new.
  // Vetoed while paging so Load more's offsets stay coherent.
  async function refreshFeed() {
    if (!project) return;
    const res = await listProjectActivity(project.id, PAGE_SIZE, 0);
    if (!res.ok) return;
    const known = new Set(items.map((a) => a.id));
    const fresh = res.data.items.filter((a) => !known.has(a.id));
    if (fresh.length > 0) items = [...fresh, ...items];
    if (items.length <= PAGE_SIZE) hasMore = res.data.has_more;
  }

  $effect(() =>
    startAutoRefresh({
      refresh: refreshFeed,
      isBusy: () => loading || loadingMore,
      intervalMs: 15_000,
    }),
  );

  /** Route an activity entry to its entity's detail page. */
  function openEntity(a: Activity) {
    switch (a.entity_type) {
      case "issue":
        if (a.entity_label) navigate(`/${projectIdentifier}/issues/${a.entity_label}`);
        break;
      case "page":
        navigate(`/${projectIdentifier}/pages/${a.entity_id}`);
        break;
      case "module":
        navigate(`/${projectIdentifier}/modules/${a.entity_id}`);
        break;
      case "comment":
        // Comments navigate to their parent.
        if (a.issue_id !== null && a.entity_label) {
          navigate(`/${projectIdentifier}/issues/${a.entity_label}`);
        } else if (a.page_id !== null) {
          navigate(`/${projectIdentifier}/pages/${a.page_id}`);
        }
        break;
    }
  }
</script>

{#snippet topbarContent()}
  <div class="flex items-center gap-3 px-6 py-2 w-full">
    <div class="flex items-center gap-1.5 shrink-0">
      <button
        class="text-[0.8125rem] font-mono font-medium text-[var(--text-muted)]
               hover:text-[var(--text)] transition-colors"
        onclick={() => navigate(`/${projectIdentifier}/settings`)}
      >
        {projectIdentifier}
      </button>
      <ChevronRight size={12} class="text-[var(--text-faint)]" />
      <span class="text-[0.8125rem] font-medium text-[var(--text)]">
        Activity
      </span>
      {#if !loading}
        <span
          class="ml-1 text-[0.6875rem] text-[var(--text-faint)] font-medium
                 tabular-nums"
        >
          {items.length}{hasMore ? "+" : ""}
        </span>
      {/if}
    </div>
  </div>
{/snippet}

<div class="h-full flex flex-col">
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div
          class="size-6 rounded-full border-2 border-[var(--border)]
                 border-t-[var(--accent)] animate-spin"
        ></div>
      </div>
    {:else if error}
      <div class="flex items-center justify-center py-20">
        <p class="text-[var(--error)] text-[0.875rem]">{error}</p>
      </div>
    {:else if items.length === 0}
      <div class="flex flex-col items-center py-20 gap-3 px-6 max-w-[480px] mx-auto text-center">
        <History size={32} class="text-[var(--text-faint)]" />
        <p class="text-[0.9375rem] text-[var(--text-muted)]">No activity yet</p>
        <p class="text-[0.8125rem] text-[var(--text-faint)] leading-relaxed">
          Every change in this project lands here — who did it, what
          changed, and whether it came through the web UI, an agent over
          MCP, the API, or the CLI. History starts from the moment the
          audit log shipped.
        </p>
      </div>
    {:else}
      <div class="max-w-[760px] mx-auto px-6 py-6">
        <ActivityTimeline
          {items}
          bare
          showEntity
          onOpenEntity={openEntity}
          {hasMore}
          onLoadMore={loadMore}
        />
      </div>
    {/if}
  </div>
</div>
