<script lang="ts">
  import { Activity } from 'lucide-svelte';
  import { toFeedRow, type Chip, type FeedEntry } from '#lib/fleet-feed';

  let {
    agentId,
    entries,
    pendingCounter
  }: {
    agentId: string;
    entries: FeedEntry[];
    /** The counter of the proposal waiting for a verdict, if any. */
    pendingCounter: number | null;
  } = $props();

  const rows = $derived(entries.map((entry) => toFeedRow(entry, pendingCounter)));

  const CHIP_STYLES: Record<Chip, string> = {
    HOLD: 'text-slate-300 bg-slate-500/15 border-slate-500/30',
    REBALANCE: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
    AWAITING_APPROVAL: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
    PROPOSAL: 'text-amber-200/70 border-amber-500/25',
    APPROVED: 'text-emerald-300 border-emerald-500/50',
    REJECTED: 'text-rose-300 border-rose-500/50',
    DECISION: 'text-sky-300 bg-sky-500/10 border-sky-500/30'
  };
  const CHIP_LABELS: Record<Chip, string> = {
    HOLD: 'HOLD',
    REBALANCE: 'REBALANCE',
    AWAITING_APPROVAL: 'AWAITING APPROVAL',
    PROPOSAL: 'PROPOSAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    DECISION: 'DECISION'
  };
  const PERCENT = 100;

  const percent = (share: number) => `${(share * PERCENT).toFixed(2)}%`;
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' });
</script>

<div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 backdrop-blur-sm">
  <h2 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
    <Activity class="w-3.5 h-3.5 text-emerald-400" /> Decyzje agenta
    <span class="normal-case tracking-normal font-mono text-slate-400">· {agentId}</span>
    <span class="ml-auto text-emerald-300 font-mono">{rows.length}</span>
  </h2>

  <div class="space-y-2 max-h-[760px] overflow-y-auto pr-0.5">
    {#each rows as row (row.key)}
      <div class="p-3 rounded-xl bg-black/20 border border-white/[0.05]">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-[10px] font-mono text-slate-500">{clock(row.observedAt)}</span>
          <span class="text-[10px] font-mono text-slate-500">#{row.counter}</span>
          <span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold tracking-wider border {CHIP_STYLES[row.chip]}">
            {CHIP_LABELS[row.chip]}
          </span>
          {#if row.details?.shockPct != null}
            <span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono border border-fuchsia-500/40 text-fuchsia-300">
              simulated shock {row.details.shockPct}%
            </span>
          {/if}
          {#if row.unconfirmed}
            <span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono border border-slate-500/40 text-slate-400">unconfirmed</span>
          {/if}
        </div>
        {#if row.details}
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-slate-300">
            <span>${row.details.priceUsd.toFixed(2)}</span>
            <span>SOL {percent(row.details.solShareBefore)} → {percent(row.details.solShareAfter)}</span>
            {#if row.details.trade}
              <span class="text-white">
                {row.details.trade.side} {row.details.trade.sol.toFixed(3)} SOL (${row.details.trade.usdc.toFixed(0)})
              </span>
            {/if}
          </div>
        {:else}
          <p class="text-[11px] font-mono text-slate-300">{row.summary}</p>
        {/if}
      </div>
    {:else}
      <p class="text-[12px] text-slate-500 py-6 text-center">Brak decyzji: agent jeszcze nie działał</p>
    {/each}
  </div>
</div>
