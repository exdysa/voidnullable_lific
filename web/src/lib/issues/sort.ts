// Issue-list sorting. Extracted from IssueList.svelte (LIF-99) so the
// ordering logic is pure, unit-testable, and shared by the list + board
// render paths without dragging the component's reactive state along.
//
// `compareIssues` takes the search query and per-issue scores as plain
// arguments rather than reading component state, so it stays a pure
// comparator the caller can hand straight to Array.prototype.sort.

import type { Issue } from "../api";

// Topbar-controlled ordering. Applied after filter, before grouping — so
// the sort is honored both inside each status group AND in the flat list.
// `sortDir` is interpreted per field:
//   priority asc  = urgent first (lowest rank number)
//   priority desc = none first
//   age      asc  = oldest first
//   age      desc = newest first
//   number   asc  = smallest issue # first
//   number   desc = largest issue # first
export type SortField = "priority" | "age" | "number" | "updated";
export type SortDir = "asc" | "desc";

export const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** Minimal score shape `compareIssues` needs. The search module's richer
 *  `SearchHit` is structurally compatible, so its score map can be passed
 *  straight in without a dependency from sort -> search. */
export interface ScoreLike {
  score: number;
}

/** Comparator for the issue list. When a search query is active and
 *  produced scores, relevance wins over the user's chosen sort field;
 *  otherwise priority/age/number/updated drives the ordering.
 *
 *  Pure: pass the trimmed-or-raw query, the score map, and the active
 *  field/direction. The caller is responsible for trimming consistency —
 *  it's checked here with `.trim()` to match the original behavior. */
export function compareIssues(
  a: Issue,
  b: Issue,
  opts: {
    searchQuery: string;
    scores: Map<number, ScoreLike>;
    sortField: SortField;
    sortDir: SortDir;
  },
): number {
  const { searchQuery, scores, sortField, sortDir } = opts;

  // LIF-119: when search is active, relevance wins over the user's chosen
  // sort field. Otherwise priority/age/number drives the ordering as before.
  if (searchQuery.trim() && scores.size > 0) {
    const sa = scores.get(a.id)?.score ?? 0;
    const sb = scores.get(b.id)?.score ?? 0;
    if (sa !== sb) return sb - sa;
    // Tie-break by identifier so the order is stable across keystrokes.
    return a.identifier.localeCompare(b.identifier);
  }

  let r = 0;
  switch (sortField) {
    case "priority":
      r = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
      // Tie-break: newest first within the same priority so urgent issues
      // from today float above urgents from last month.
      if (r === 0) r = b.created_at.localeCompare(a.created_at);
      break;
    case "age":
      r = a.created_at.localeCompare(b.created_at);
      break;
    case "updated":
      r = a.updated_at.localeCompare(b.updated_at);
      break;
    case "number":
      r = a.sequence - b.sequence;
      break;
  }
  return sortDir === "asc" ? r : -r;
}

/** Direction default for a freshly-selected sort field. "updated" means
 *  "last activity", where newest-first is the natural default; everything
 *  else defaults to ascending. Mirrors the topbar's selectSort behavior. */
export function defaultSortDir(field: SortField): SortDir {
  return field === "updated" ? "desc" : "asc";
}
