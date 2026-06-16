<script lang="ts">
  // Reusable circular progress ring (LIF-180). Two stacked SVG circles:
  // a faint full-circle track and a progress arc drawn via
  // stroke-dasharray / stroke-dashoffset, rotated -90deg so it starts at
  // the top, with a rounded line cap. Subtle motion only: the arc
  // animates from empty to `value` once on mount via a CSS transition on
  // stroke-dashoffset, gated behind motion-safe so reduced-motion users
  // get the static final state. Always renders a visible % (or custom
  // label) and exposes role=progressbar so it's never ring-only for AT.

  import { onMount } from "svelte";

  let {
    value = 0,
    size = 48,
    stroke = 4,
    color = "var(--success)",
    track = "var(--border)",
    label,
    showValue = true,
    animate = true,
    class: className = "",
  }: {
    /** 0..1 completion fraction. */
    value?: number;
    size?: number;
    stroke?: number;
    color?: string;
    track?: string;
    /** Custom center content; overrides the default percentage. */
    label?: import("svelte").Snippet;
    showValue?: boolean;
    animate?: boolean;
    class?: string;
  } = $props();

  const clamped = $derived(Math.max(0, Math.min(1, value)));
  const r = $derived((size - stroke) / 2);
  const circumference = $derived(2 * Math.PI * r);
  const pct = $derived(Math.round(clamped * 100));

  // Start mounted=false so the first painted frame has a fully-empty arc;
  // flipping to true on mount lets the CSS transition tween it up.
  let mounted = $state(false);
  onMount(() => {
    // rAF so the empty offset is committed before we animate to target.
    requestAnimationFrame(() => { mounted = true; });
  });

  const dashoffset = $derived(
    animate && !mounted ? circumference : circumference * (1 - clamped)
  );
</script>

<div
  class="relative inline-grid place-items-center shrink-0 {className}"
  style="width: {size}px; height: {size}px;"
  role="progressbar"
  aria-valuenow={pct}
  aria-valuemin={0}
  aria-valuemax={100}
>
  <svg
    width={size}
    height={size}
    viewBox="0 0 {size} {size}"
    class="-rotate-90"
    aria-hidden="true"
  >
    <circle
      cx={size / 2}
      cy={size / 2}
      {r}
      fill="none"
      stroke={track}
      stroke-width={stroke}
    />
    <circle
      cx={size / 2}
      cy={size / 2}
      {r}
      fill="none"
      stroke={color}
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={dashoffset}
      class={animate ? "motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out" : ""}
    />
  </svg>
  <div class="absolute inset-0 grid place-items-center">
    {#if label}
      {@render label()}
    {:else if showValue}
      <span
        class="font-semibold tabular-nums text-[var(--text)] leading-none"
        style="font-size: {Math.max(9, Math.round(size * 0.26))}px;"
      >
        {pct}<span class="text-[0.7em] text-[var(--text-muted)]">%</span>
      </span>
    {/if}
  </div>
</div>
