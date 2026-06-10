<script lang="ts">
  // LIF-157 — audit-log timeline for issue/page detail.
  //
  // A quiet, text-first history: each entry is one line of "who did what
  // via which door", newest first, with a hairline gutter rail tying the
  // entries together. Field changes render old → new; status/priority
  // reuse the shared icon vocabulary; long values (descriptions, page
  // content) collapse behind a details-style expander instead of flooding
  // the page. Collapsed to the latest few entries by default — history
  // should be available, not loud.

  import type { Activity } from "./api";
  import { formatDate, formatRelative } from "./format";
  import StatusIcon from "./StatusIcon.svelte";
  import PriorityIcon from "./PriorityIcon.svelte";
  import { History, ChevronDown } from "lucide-svelte";

  let {
    items,
    /** How many entries show before the "Show all" expander. */
    initialCount = 6,
    /** LIF-158 feed mode: render the entity label as a navigable link
     *  ("created issue LIF-42") instead of detail-page phrasing
     *  ("created this issue"). */
    showEntity = false,
    /** Called when the user clicks an entity label in feed mode. */
    onOpenEntity,
    /** Server paging (feed mode): when set, the bottom control becomes
     *  a "Load more" button instead of the local show-all expander. */
    hasMore = false,
    onLoadMore,
    /** Hide the section header (the feed route owns its own chrome). */
    bare = false,
  }: {
    items: Activity[];
    initialCount?: number;
    showEntity?: boolean;
    onOpenEntity?: (a: Activity) => void;
    hasMore?: boolean;
    onLoadMore?: () => void;
    bare?: boolean;
  } = $props();

  let expanded = $state(false);
  // Server-paged feeds always show everything loaded; the detail-page
  // embed collapses to the latest few.
  let visible = $derived(
    onLoadMore || expanded ? items : items.slice(0, initialCount),
  );

  /** Can this entry navigate somewhere? Issues, pages, modules, and
   *  comments (via their parent) have destinations; labels/folders/
   *  project rows don't. */
  function isNavigable(a: Activity): boolean {
    if (!showEntity || !onOpenEntity) return false;
    return (
      a.entity_type === "issue" ||
      a.entity_type === "page" ||
      a.entity_type === "module" ||
      (a.entity_type === "comment" && (a.issue_id !== null || a.page_id !== null))
    );
  }

  /** Per-entry expansion for long old→new values (description/content). */
  let openValues = $state<Set<number>>(new Set());

  function toggleValue(id: number) {
    const next = new Set(openValues);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    openValues = next;
  }

  function actorName(a: Activity): string {
    return a.actor_display_name || a.actor_username || "system";
  }

  /** Long-form fields get the expandable old/new treatment. */
  function isLongField(a: Activity): boolean {
    return a.field === "description" || a.field === "content";
  }

  function shortValue(v: string | null, max = 80): string {
    if (!v) return "(none)";
    const flat = v.replace(/\n+/g, " ").trim();
    if (!flat) return "(none)";
    return flat.length > max ? flat.slice(0, max) + "…" : flat;
  }

  /** Human verb for the entry, excluding the value rendering. In feed
   *  mode the entity is named ("created issue"); on a detail page it's
   *  deictic ("created this issue"). The label link renders separately. */
  function verb(a: Activity): string {
    const ent = showEntity ? a.entity_type : `this ${a.entity_type}`;
    switch (a.action) {
      case "create":
        return a.entity_type === "comment" ? "commented on" : `created ${ent}`;
      case "delete":
        return a.entity_type === "comment" ? "deleted a comment on" : `deleted ${a.entity_type}`;
      case "update":
        return a.entity_type === "comment"
          ? "edited a comment on"
          : showEntity
            ? `changed ${a.field} on`
            : `changed ${a.field}`;
      case "attach":
        return showEntity ? "added label on" : "added label";
      case "detach":
        return showEntity ? "removed label on" : "removed label";
      case "link":
        return `linked ${(a.field ?? "relates_to").replace("_", " ")}`;
      case "unlink":
        return `unlinked ${(a.field ?? "relates_to").replace("_", " ")}`;
      default:
        return a.action;
    }
  }

  /** In feed mode, comment verbs end with "on" and need the parent
   *  label; detail mode skips the label entirely except for deletes. */
  function showLabelAfterVerb(a: Activity): boolean {
    if (!showEntity) return false;
    return a.action !== "link" && a.action !== "unlink";
  }
</script>

{#if items.length > 0}
  <section class="mt-10">
    <!-- Header: same uppercase-tracking vocabulary as the sidebar field
         labels and list group headers. -->
    {#if !bare}
      <div class="flex items-center gap-2 mb-4 pb-2 border-b border-[var(--border)]">
        <History size={13} class="text-[var(--text-faint)]" />
        <h2
          class="text-[0.6875rem] font-semibold uppercase tracking-widest
                 text-[var(--text-muted)]"
        >
          Activity
        </h2>
        <span class="text-[0.6875rem] text-[var(--text-faint)] tabular-nums">
          {items.length}
        </span>
      </div>
    {/if}

    <ol class="m-0 p-0 list-none relative">
      <!-- Gutter rail: ties entries into one history, mirroring the
           comment thread's connector vocabulary. -->
      <div
        class="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-[var(--border)]"
        aria-hidden="true"
      ></div>

      {#each visible as a (a.id)}
        <li class="relative pl-5 pb-3 last:pb-0">
          <!-- Timeline dot -->
          <span
            class="absolute left-0 top-[0.4375rem] size-[7px] rounded-full
                   border border-[var(--border)] bg-[var(--surface)]"
            aria-hidden="true"
          ></span>

          <div class="text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
            <!-- Actor -->
            <span class="font-medium text-[var(--text)]">{actorName(a)}</span>
            {#if a.actor_is_bot}
              <span
                class="inline-block align-middle text-[0.5625rem] font-semibold
                       uppercase tracking-wider px-1 py-px rounded
                       bg-[var(--accent-subtle)] text-[var(--accent)] mx-0.5"
              >
                agent
              </span>
            {/if}

            <!-- Verb + values -->
            {verb(a)}
            {#if showLabelAfterVerb(a)}
              {#if isNavigable(a)}
                <button
                  class="font-mono text-[0.75rem] text-[var(--accent)]
                         hover:underline align-baseline"
                  onclick={() => onOpenEntity?.(a)}
                >
                  {a.entity_label ?? `#${a.entity_id}`}
                </button>
              {:else}
                <span class="font-mono text-[0.75rem] text-[var(--text-muted)]">
                  {a.entity_label ?? `#${a.entity_id}`}
                </span>
              {/if}
            {/if}
            {#if a.action === "update" && a.field === "status"}
              <span class="inline-flex items-center gap-1 align-middle mx-0.5">
                <StatusIcon status={a.old_value ?? ""} size={12} />
                <span class="capitalize">{a.old_value}</span>
              </span>
              <span class="text-[var(--text-faint)]">→</span>
              <span class="inline-flex items-center gap-1 align-middle mx-0.5">
                <StatusIcon status={a.new_value ?? ""} size={12} />
                <span class="capitalize text-[var(--text)]">{a.new_value}</span>
              </span>
            {:else if a.action === "update" && a.field === "priority"}
              <span class="inline-flex items-center gap-1 align-middle mx-0.5">
                <PriorityIcon priority={a.old_value ?? "none"} size={12} />
                <span class="capitalize">{a.old_value}</span>
              </span>
              <span class="text-[var(--text-faint)]">→</span>
              <span class="inline-flex items-center gap-1 align-middle mx-0.5">
                <PriorityIcon priority={a.new_value ?? "none"} size={12} />
                <span class="capitalize text-[var(--text)]">{a.new_value}</span>
              </span>
            {:else if a.action === "update" && isLongField(a)}
              <button
                class="text-[0.75rem] text-[var(--accent)] hover:underline
                       inline-flex items-center gap-0.5 align-baseline"
                onclick={() => toggleValue(a.id)}
              >
                {openValues.has(a.id) ? "hide" : "show"} change
                <ChevronDown
                  size={11}
                  class="transition-transform {openValues.has(a.id) ? 'rotate-180' : ''}"
                />
              </button>
            {:else if a.action === "update"}
              <span class="text-[var(--text-faint)]">{shortValue(a.old_value, 40)}</span>
              <span class="text-[var(--text-faint)]">→</span>
              <span class="text-[var(--text)]">{shortValue(a.new_value, 40)}</span>
            {:else if a.action === "attach" || a.action === "detach"}
              <span
                class="text-[0.6875rem] font-medium px-1.5 py-0.5 rounded-full
                       border border-[var(--border)] align-middle"
              >
                {a.action === "attach" ? a.new_value : a.old_value}
              </span>
            {:else if a.action === "link" || a.action === "unlink"}
              <span class="font-mono text-[0.75rem] text-[var(--accent)]">
                {a.action === "link" ? a.new_value : a.old_value}
              </span>
            {:else if a.action === "create" && a.entity_type === "comment"}
              <span class="text-[var(--text-faint)] italic">
                “{shortValue(a.new_value, 60)}”
              </span>
            {/if}

            <!-- Time + transport, quiet, at the end of the line -->
            <span
              class="text-[0.75rem] text-[var(--text-faint)] whitespace-nowrap"
              title="{formatDate(a.ts)} · via {a.transport}"
            >
              · {formatRelative(a.ts)} via {a.transport}
            </span>
          </div>

          <!-- Expanded old/new blocks for description/content edits -->
          {#if a.action === "update" && isLongField(a) && openValues.has(a.id)}
            <div class="mt-2 mb-1 flex flex-col gap-1.5 max-w-[640px]">
              <div
                class="text-[0.75rem] leading-relaxed px-3 py-2 rounded-md
                       border border-[var(--border)] bg-[var(--error-bg)]
                       text-[var(--text-muted)] whitespace-pre-wrap break-words
                       max-h-[200px] overflow-y-auto"
              >{a.old_value || "(empty)"}</div>
              <div
                class="text-[0.75rem] leading-relaxed px-3 py-2 rounded-md
                       border border-[var(--border)] bg-[var(--success-bg)]
                       text-[var(--text)] whitespace-pre-wrap break-words
                       max-h-[200px] overflow-y-auto"
              >{a.new_value || "(empty)"}</div>
            </div>
          {/if}
        </li>
      {/each}
    </ol>

    {#if onLoadMore}
      <!-- Feed mode: server paging. -->
      {#if hasMore}
        <button
          class="mt-3 ml-5 text-[0.75rem] text-[var(--text-muted)]
                 hover:text-[var(--text)] inline-flex items-center gap-1
                 transition-colors"
          onclick={onLoadMore}
        >
          <ChevronDown size={12} />
          Load more
        </button>
      {/if}
    {:else if items.length > initialCount}
      <button
        class="mt-2 ml-5 text-[0.75rem] text-[var(--text-muted)]
               hover:text-[var(--text)] inline-flex items-center gap-1
               transition-colors"
        onclick={() => { expanded = !expanded; }}
      >
        <ChevronDown
          size={12}
          class="transition-transform {expanded ? 'rotate-180' : ''}"
        />
        {expanded ? "Show recent only" : `Show all ${items.length} entries`}
      </button>
    {/if}
  </section>
{/if}
