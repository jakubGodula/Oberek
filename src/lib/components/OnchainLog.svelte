<script lang="ts">
  import { Activity, ExternalLink } from 'lucide-svelte';
  import { explorerTxUrl, type OnchainLogItem } from '#lib/onchain-log';

  let {
    items,
    fill
  }: {
    /** The selected agent's transactions, newest first. */
    items: OnchainLogItem[];
    /** Takes the column's remaining height. */
    fill: boolean;
  } = $props();

  const CHIPS = {
    StepRecorded: { label: 'KROK', style: 'text-slate-300', dot: 'bg-slate-400' },
    AgentKilled: { label: 'KILL-SWITCH', style: 'text-rose-400', dot: 'bg-rose-400' },
    AgentResumed: { label: 'RESUME', style: 'text-sky-400', dot: 'bg-sky-400' },
    accept: { label: 'APPROVED', style: 'text-emerald-400', dot: 'bg-emerald-400' },
    reject: { label: 'REJECTED', style: 'text-amber-400', dot: 'bg-amber-400' }
  };
  const HASH_EDGE = 6;
  const SIGNATURE_EDGE = 4;

  const chipOf = (item: OnchainLogItem) => CHIPS[item.verdict ?? item.event];
  const shorten = (text: string, edge: number) => `${text.slice(0, edge)}…${text.slice(-edge)}`;
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' });
</script>

<div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 backdrop-blur-sm flex flex-col {fill ? 'flex-1' : ''}">
  <h2 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
    <Activity class="w-3.5 h-3.5 text-rose-400" />
    On-Chain Observability Log
    <span class="ml-auto text-rose-300 font-mono">{items.length}</span>
  </h2>

  <div class="space-y-1.5 flex-1 overflow-y-auto max-h-[580px] pr-0.5">
    {#each items as item (item.id)}
      {@const chip = chipOf(item)}
      <div class="px-3 py-2 rounded-lg bg-black/20 border border-white/[0.04] hover:border-white/[0.1] transition-all">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full {chip.dot}"></span>
          <span class="text-[10px] font-bold uppercase {chip.style}">{chip.label}</span>
          <span class="text-[10px] font-mono text-slate-500">#{item.counter}</span>
          <span class="ml-auto text-[9px] font-mono text-slate-500">{clock(item.landedAt)}</span>
        </div>
        {#if item.summary}
          <p class="mt-0.5 text-[10px] font-mono text-slate-300 truncate" title={item.summary}>{item.summary}</p>
        {/if}
        <div class="mt-0.5 flex flex-wrap items-center gap-x-3 text-[9px] font-mono text-slate-500">
          <a
            href={explorerTxUrl(item.signature)}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
          >
            tx {shorten(item.signature, SIGNATURE_EDGE)} <ExternalLink class="w-2.5 h-2.5" />
          </a>
          {#if item.decisionHash}
            <span>hash <span class="text-slate-400">{shorten(item.decisionHash, HASH_EDGE)}</span></span>
          {/if}
        </div>
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center py-12 text-slate-600">
        <Activity class="w-8 h-8 mb-3 opacity-30" />
        <p class="text-[12px]">Brak transakcji on-chain tego agenta</p>
        <p class="text-[10px] mt-1">od startu serwera; agenci demonstracyjni (mock) ich nie wysyłają</p>
      </div>
    {/each}
  </div>
</div>
