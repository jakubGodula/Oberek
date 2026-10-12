<script lang="ts">
  import { AlertTriangle, Check, X } from 'lucide-svelte';

  interface PendingProposal {
    counter: number;
    summary: string;
  }

  let {
    pending,
    busy,
    onVerdict
  }: {
    pending: PendingProposal;
    busy: boolean;
    onVerdict: (verdict: 'accept' | 'reject') => void;
  } = $props();
</script>

<div class="p-4 rounded-2xl border border-amber-500/40 bg-amber-950/30">
  <p class="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1.5 flex items-center gap-1.5">
    <AlertTriangle class="w-3.5 h-3.5" /> The agent is waiting for your verdict · step #{pending.counter}
  </p>
  <p class="text-[12px] font-mono text-amber-100 mb-3 leading-relaxed">{pending.summary}</p>
  <div class="grid grid-cols-2 gap-3">
    <button
      onclick={() => onVerdict('accept')}
      disabled={busy}
      class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
    >
      <Check class="w-4 h-4" /> Approve
    </button>
    <button
      onclick={() => onVerdict('reject')}
      disabled={busy}
      class="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-rose-500/40 text-rose-200 text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
    >
      <X class="w-4 h-4" /> Reject
    </button>
  </div>
</div>
