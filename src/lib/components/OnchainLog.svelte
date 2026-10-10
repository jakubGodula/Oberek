<script lang="ts">
  import { Activity, ChevronRight, ExternalLink } from 'lucide-svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { explorerTxUrl, groupOnchainLog, type OnchainLogItem } from '#lib/onchain-log';

  let {
    items,
    fill
  }: {
    /** Newest first. */
    items: OnchainLogItem[];
    /** Takes the column's remaining height. */
    fill: boolean;
  } = $props();

  const rows = $derived(groupOnchainLog(items));
  /** Groups the user opened, by key: they stay open across the page's refresh. */
  const openGroups = new SvelteSet<string>();

  const toggle = (key: string) => (openGroups.has(key) ? openGroups.delete(key) : openGroups.add(key));

  const ACTION_CHIPS = {
    AgentKilled: { label: 'KILL-SWITCH', style: 'text-rose-400', dot: 'bg-rose-400' },
    AgentResumed: { label: 'RESUME', style: 'text-sky-400', dot: 'bg-sky-400' },
    accept: { label: 'APPROVED', style: 'text-emerald-400', dot: 'bg-emerald-400' },
    reject: { label: 'REJECTED', style: 'text-amber-400', dot: 'bg-amber-400' }
  };
  const HASH_EDGE = 6;
  const SIGNATURE_EDGE = 4;

  const actionChip = (item: OnchainLogItem) =>
    item.verdict ? ACTION_CHIPS[item.verdict] : ACTION_CHIPS[item.event as 'AgentKilled' | 'AgentResumed'];
  const shorten = (text: string, edge: number) => `${text.slice(0, edge)}…${text.slice(-edge)}`;
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' });
</script>

{#snippet transaction(item: OnchainLogItem)}
  <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] font-mono text-slate-500">
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
{/snippet}

<div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 backdrop-blur-sm flex flex-col {fill ? 'flex-1' : ''}">
  <h2 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
    <Activity class="w-3.5 h-3.5 text-rose-400" />
    On-Chain Observability Log
    <span class="ml-auto text-rose-300 font-mono">{items.length}</span>
  </h2>

  <div class="space-y-2 flex-1 overflow-y-auto max-h-[580px] pr-0.5">
    {#each rows as row (row.type === 'steps' ? row.key : row.item.id)}
      <div class="p-3 rounded-xl bg-black/20 border border-white/[0.04] hover:border-white/[0.1] transition-all">
        {#if row.type === 'action'}
          {@const chip = actionChip(row.item)}
          <div class="flex items-center gap-1.5 mb-1.5">
            <span class="w-2 h-2 rounded-full {chip.dot}"></span>
            <span class="text-[10px] font-bold uppercase {chip.style}">{chip.label}</span>
            <span class="text-[10px] font-mono text-slate-500">#{row.item.counter}</span>
            <span class="ml-auto text-[9px] font-mono text-slate-500">{clock(row.item.landedAt)}</span>
          </div>
          <p class="text-[11px] font-semibold text-slate-200 mb-1 leading-tight">{row.item.agentName}</p>
          {#if row.item.summary}
            <p class="text-[10px] font-mono text-slate-400 mb-1">{row.item.summary}</p>
          {/if}
          {@render transaction(row.item)}
        {:else}
          {@const open = openGroups.has(row.key)}
          {@const newest = row.items[0]}
          <button type="button" class="w-full text-left" onclick={() => toggle(row.key)}>
            <span class="flex items-center gap-1.5 mb-1.5">
              <ChevronRight class="w-3 h-3 shrink-0 text-emerald-400 transition-transform {open ? 'rotate-90' : ''}" />
              <span class="text-[10px] font-bold uppercase text-emerald-400">Kroki agenta ×{row.items.length}</span>
              <span class="text-[10px] font-mono text-slate-500">
                #{row.items.at(-1)?.counter}{row.items.length > 1 ? `–${newest.counter}` : ''}
              </span>
              <span class="ml-auto text-[9px] font-mono text-slate-500">{clock(newest.landedAt)}</span>
            </span>
            <span class="block text-[11px] font-semibold text-slate-200 leading-tight">{row.agentName}</span>
          </button>
          {#if open}
            <div class="mt-2 space-y-1.5 border-l border-white/[0.06] pl-2.5">
              {#each row.items as item (item.id)}
                <div>
                  <p class="text-[10px] font-mono text-slate-300">
                    <span class="text-slate-500">#{item.counter} · {clock(item.landedAt)}</span>
                    {item.summary ?? ''}
                  </p>
                  {@render transaction(item)}
                </div>
              {/each}
            </div>
          {:else if newest.summary}
            <p class="mt-1 text-[10px] font-mono text-slate-400 truncate">ostatni: {newest.summary}</p>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center py-12 text-slate-600">
        <Activity class="w-8 h-8 mb-3 opacity-30" />
        <p class="text-[12px]">Brak transakcji on-chain od startu serwera</p>
        <p class="text-[10px] mt-1">Pojawią się po kroku agenta lub akcji operatora</p>
      </div>
    {/each}
  </div>
</div>
