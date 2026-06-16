<script lang="ts">
  // Shared mascot renderer. The white-silhouette PNGs are drawn via CSS
  // mask so they pick up a theme-aware muted fill (a raw <img> vanishes on
  // light). Crucially, size is driven by `scale` = screen pixels per source
  // pixel, NOT a fixed width: every mascot rendered at the same `scale`
  // therefore shares an identical pixel-to-screen ratio, so the artwork
  // appears at a consistent scale across surfaces regardless of each PNG's
  // canvas dimensions or padding.

  let {
    src,
    nativeW,
    nativeH,
    scale = 0.25,
    class: className = "",
  }: {
    src: string;
    /** Intrinsic pixel dimensions of the source PNG. */
    nativeW: number;
    nativeH: number;
    /** Screen pixels per source pixel. Same value ⇒ same rendered scale. */
    scale?: number;
    class?: string;
  } = $props();

  const w = $derived(Math.round(nativeW * scale));
  const h = $derived(Math.round(nativeH * scale));
</script>

<div
  aria-hidden="true"
  class="shrink-0 {className}"
  style="width: {w}px; height: {h}px; opacity: 0.5;
         background-color: var(--text-faint);
         -webkit-mask: url({src}) center / contain no-repeat;
         mask: url({src}) center / contain no-repeat;"
></div>
