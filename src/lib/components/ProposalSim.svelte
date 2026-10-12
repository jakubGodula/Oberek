<script lang="ts">
  import { ChevronDown, FlaskConical } from 'lucide-svelte';

  type Direction = 'positive' | 'negative';

  let {
    agents,
    onChange
  }: {
    agents: { id: string; fleet: { proposalArmed: Direction | null; shockArmed: boolean } }[];
    onChange: () => Promise<void>;
  } = $props();

  const JITO_ID = 'jito-01';
  const SENTINEL_ID = 'sentinel-01';
  const SHOCK_PCT = -3;
  const CHOICES: { direction: Direction; label: string }[] = [
    { direction: 'positive', label: 'Upcoming proposal · positive for JitoSOL holders' },
    { direction: 'negative', label: 'Upcoming proposal · negative for JitoSOL holders' }
  ];

  let open = $state(false);
  let busy = $state(false);
  let message = $state<string | null>(null);
  let ok = $state<boolean | null>(null);

  const steward = $derived(agents.find((agent) => agent.id === JITO_ID));
  const sentinel = $derived(agents.find((agent) => agent.id === SENTINEL_ID));
  const armed = $derived(steward?.fleet.proposalArmed ?? null);
  const shockArmed = $derived(sentinel?.fleet.shockArmed ?? false);

  async function post(url: string, body: object, done: string) {
    busy = true;
    message = null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await res.json().catch(() => ({}));
      ok = res.ok;
      message = res.ok ? done : `Refused (${res.status}): ${result.message ?? res.statusText}`;
      await onChange();
    } catch (error) {
      ok = false;
      message = `Error: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      busy = false;
    }
  }

  function arm(direction: Direction) {
    return post(
      `/api/agents/${JITO_ID}/proposal`,
      { direction },
      'Proposal armed: the steward applies it in its next cycle.'
    );
  }

  function armShock() {
    return post(
      `/api/agents/${SENTINEL_ID}/shock`,
      { pct: SHOCK_PCT },
      'Price shock armed: the agent applies it in its next cycle.'
    );
  }
</script>

<div class="fixed bottom-5 left-5 z-[60] flex flex-col items-start gap-3">
  {#if open}
    <section class="w-96 rounded-2xl border border-white/[0.08] bg-[#0c101e]/95 shadow-2xl shadow-black/40 backdrop-blur-xl p-4">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-wider text-violet-300">Simulate</p>
          <p class="text-[12px] text-slate-300 mt-1 leading-snug">Arm one demo for the next cycle. A later click replaces it.</p>
        </div>
        <button
          type="button"
          onclick={() => (open = false)}
          aria-label="Collapse proposal simulator"
          class="shrink-0 w-7 h-7 rounded-full border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
        >
          <ChevronDown class="w-4 h-4" />
        </button>
      </div>

      <div class="pt-1">
        <p class="text-[10px] font-bold uppercase tracking-wider text-violet-300">JitoSOL steward</p>
        <p class="text-[12px] text-slate-300 mt-1 mb-2 leading-snug">
          An upcoming proposal. The steward reads it as positive or negative for JitoSOL holders and votes on its next cycle.
        </p>
        {#if !steward}
          <p class="text-[11px] text-slate-500">jito-01 is not in the fleet yet.</p>
        {:else}
          <div class="flex flex-col gap-2">
            {#each CHOICES as choice}
              <button
                type="button"
                onclick={() => arm(choice.direction)}
                disabled={busy}
                class="w-full px-3 py-2.5 rounded-xl border text-left text-[12px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition {armed === choice.direction
                  ? 'border-violet-400/60 bg-violet-500/20 text-violet-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'}"
              >
                {choice.label}
              </button>
            {/each}
          </div>
          {#if armed}
            <p class="mt-3 text-[11px] text-violet-200">
              {armed === 'positive' ? 'Positive' : 'Negative'} reading armed, applied in the next cycle.
            </p>
          {/if}
        {/if}
      </div>

      <div class="mt-4 pt-4 border-t border-white/[0.08]">
        <p class="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Sentinel</p>
        <p class="text-[12px] text-slate-300 mt-1 mb-2 leading-snug">
          A one-off price move. The next rebalance is made at the price shifted by −3%.
        </p>
        {#if !sentinel}
          <p class="text-[11px] text-slate-500">sentinel-01 is not in the fleet yet.</p>
        {:else}
          <button
            type="button"
            onclick={armShock}
            disabled={busy || shockArmed}
            class="w-full px-3 py-2.5 rounded-xl border border-fuchsia-500/40 bg-fuchsia-950/30 hover:bg-fuchsia-900/40 text-fuchsia-200 text-left text-[12px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {shockArmed ? 'Shock armed, applied in the next cycle' : 'Simulate a price shock (−3%)'}
          </button>
        {/if}
      </div>

      {#if message}
        <p class="mt-3 text-[11px] {ok ? 'text-emerald-300' : 'text-rose-300'}">{message}</p>
      {/if}
    </section>
  {/if}

  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    class="h-12 px-4 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[13px] font-semibold shadow-lg shadow-violet-950/50 flex items-center gap-2 cursor-pointer"
  >
    <FlaskConical class="w-4 h-4" />
    {open ? 'Hide' : 'Simulate'}
  </button>
</div>
