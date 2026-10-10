<script lang="ts">
  import {
    Shield, ShieldAlert, ShieldCheck, Cpu, Terminal, Key, Copy, Check,
    ExternalLink, RefreshCw, Zap, Clock, Activity, AlertTriangle,
    ChevronRight, Lock, Unlock, BarChart3
  } from 'lucide-svelte';

  let { data } = $props();

  let agents = $state(data.agents);
  let selectedAgent = $state(data.agents[0] || null);
  let copiedId = $state<string | null>(null);
  let isSimulating = $state(false);
  let simulationMessage = $state<string | null>(null);
  let simulationSuccess = $state<boolean | null>(null);
  let history = $state<any[]>(data.history || []);
  let isLoadingHistory = $state(false);

  const blinkUrl = $derived(
    selectedAgent ? `${data.origin}/api/actions/agent-action?agentId=${selectedAgent.id}` : ''
  );

  const dialToUrl = $derived(
    blinkUrl ? `https://dial.to/?action=solana-action:${encodeURIComponent(blinkUrl)}&cluster=devnet` : ''
  );

  const riskColors: Record<string, string> = {
    LOW: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    MEDIUM: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    HIGH: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    CRITICAL: 'text-rose-400 bg-rose-500/10 border-rose-500/30'
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    PAUSED: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
    IDLE: 'text-slate-400 bg-slate-500/15 border-slate-500/30'
  };

  function timeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s temu`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min temu`;
    return `${Math.floor(diff / 3600)}h temu`;
  }

  async function refreshAll() {
    try {
      const [agentsRes, histRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/actions/history?limit=15')
      ]);
      const agentsJson = await agentsRes.json();
      const histJson = await histRes.json();

      if (agentsJson.success) {
        agents = agentsJson.agents;
        if (selectedAgent) {
          const updated = agentsJson.agents.find((a: any) => a.id === selectedAgent.id);
          if (updated) selectedAgent = updated;
        }
      }
      if (histJson.success) history = histJson.history;
    } catch (e) {
      console.error('Błąd odświeżania:', e);
    }
  }

  // Fleet agents run as their own processes and change state on their own.
  const REFRESH_INTERVAL_MS = 5000;
  $effect(() => {
    const timer = setInterval(refreshAll, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  });

  async function copyText(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    copiedId = id;
    setTimeout(() => { copiedId = null; }, 2000);
  }

  async function simulateAction(decision: 'approve' | 'pause') {
    if (!selectedAgent) return;
    isSimulating = true;
    simulationMessage = null;
    simulationSuccess = null;

    try {
      const demoAccount = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
      const res = await fetch(`/api/actions/agent-action?agentId=${selectedAgent.id}&decision=${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: demoAccount })
      });
      const result = await res.json();
      simulationSuccess = res.ok;
      simulationMessage = result.message || 'Transakcja przetworzona pomyślnie.';
      await refreshAll();
    } catch (err: any) {
      simulationSuccess = false;
      simulationMessage = `Błąd: ${err.message}`;
    } finally {
      isSimulating = false;
    }
  }
</script>

<div class="min-h-screen bg-[#080b14] text-slate-100 flex flex-col font-sans selection:bg-purple-500/40 selection:text-white">

  <!-- Top Navigation -->
  <header class="border-b border-white/[0.06] bg-[#0c101e]/80 backdrop-blur-xl sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-3.5">
      <div class="relative p-2.5 bg-gradient-to-tr from-violet-600 via-purple-500 to-emerald-500 rounded-xl shadow-lg shadow-purple-500/25">
        <Shield class="w-5 h-5 text-white" />
        <span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#0c101e] animate-pulse"></span>
      </div>
      <div>
        <h1 class="text-[17px] font-bold tracking-tight bg-gradient-to-r from-violet-400 via-purple-300 to-emerald-400 bg-clip-text text-transparent leading-none">
          Aegis Mercato
        </h1>
        <p class="text-[11px] text-slate-500 mt-0.5">Post-Quantum Agent Observability Engine · Solana Devnet</p>
      </div>
    </div>

    <div class="flex items-center gap-2.5">
      <div class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 text-[11px] font-mono">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
        Devnet Live
      </div>
      <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-violet-500/[0.08] border border-violet-500/20 text-violet-300 text-[11px] font-mono">
        <Lock class="w-3 h-3" /> ML-DSA-44 · KEM-768
      </div>
      <button
        onclick={refreshAll}
        class="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-all border border-white/[0.08] text-slate-400 hover:text-white cursor-pointer"
        title="Odśwież dane"
      >
        <RefreshCw class="w-3.5 h-3.5" />
      </button>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 max-w-[1400px] w-full mx-auto p-5 grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-5">

    <!-- ─── LEFT COLUMN: Agent List ─── -->
    <aside class="flex flex-col gap-4">

      <!-- Agent Fleet -->
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 backdrop-blur-sm">
        <h2 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Cpu class="w-3.5 h-3.5 text-violet-400" /> Flota Agentów AI
          <span class="ml-auto text-violet-300 font-mono">{agents.length}</span>
        </h2>

        <div class="space-y-2">
          {#each agents as agent}
            <button
              type="button"
              onclick={() => selectedAgent = agent}
              class="w-full text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer group
                {selectedAgent?.id === agent.id
                  ? 'bg-violet-950/40 border-violet-500/40 shadow-lg shadow-violet-500/10'
                  : 'bg-white/[0.02] border-white/[0.05] hover:border-white/[0.12] hover:bg-white/[0.04]'}"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-[13px] text-white leading-none">{agent.name}</span>
                <span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono uppercase font-bold tracking-wider border {statusColors[agent.status]}">
                  {agent.status}
                </span>
              </div>
              <p class="text-[11px] text-slate-400 line-clamp-2 mb-2.5">{agent.currentTask}</p>
              <div class="flex items-center justify-between">
                <span class="px-1.5 py-0.5 rounded text-[9px] font-mono border {riskColors[agent.riskLevel]}">
                  RISK: {agent.riskLevel}
                </span>
                <span class="text-[10px] text-slate-500 font-mono">{agent.actionsExecuted} tx</span>
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Stats panel -->
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 backdrop-blur-sm">
        <h3 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <BarChart3 class="w-3.5 h-3.5 text-sky-400" /> Statystyki Sieci
        </h3>
        <div class="space-y-2.5">
          <div class="flex justify-between items-center">
            <span class="text-[11px] text-slate-400">Aktywnych agentów</span>
            <span class="text-[13px] font-mono font-bold text-emerald-400">
              {agents.filter(a => a.status === 'ACTIVE').length}/{agents.length}
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[11px] text-slate-400">Łączna liczba tx</span>
            <span class="text-[13px] font-mono font-bold text-violet-300">
              {agents.reduce((s, a) => s + (a.actionsExecuted || 0), 0)}
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[11px] text-slate-400">Zdarzenia w logu</span>
            <span class="text-[13px] font-mono font-bold text-sky-300">{history.length}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[11px] text-slate-400">Algorytm PQC</span>
            <span class="text-[11px] font-mono text-violet-300">ML-DSA-44</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[11px] text-slate-400">Algorytm KEM</span>
            <span class="text-[11px] font-mono text-violet-300">ML-KEM-768</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- ─── CENTER COLUMN: Main Inspector ─── -->
    <section class="flex flex-col gap-5">

      {#if selectedAgent}
        <!-- Agent Hero Card -->
        <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden">
          <!-- Background glow -->
          <div class="absolute -top-16 -right-16 w-64 h-64 bg-violet-600/[0.07] rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-8 -left-8 w-48 h-48 bg-emerald-600/[0.05] rounded-full blur-3xl pointer-events-none"></div>

          <div class="relative">
            <div class="flex items-start justify-between mb-4">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  {#if selectedAgent.status === 'ACTIVE'}
                    <ShieldCheck class="w-5 h-5 text-emerald-400" />
                  {:else if selectedAgent.status === 'PAUSED'}
                    <ShieldAlert class="w-5 h-5 text-rose-400" />
                  {:else}
                    <Shield class="w-5 h-5 text-slate-400" />
                  {/if}
                  <h2 class="text-lg font-bold text-white">{selectedAgent.name}</h2>
                </div>
                <p class="text-[12px] text-slate-400 max-w-lg">{selectedAgent.currentTask}</p>
              </div>
              <div class="flex flex-col items-end gap-1.5">
                <span class="px-2 py-1 rounded-lg text-[10px] font-mono uppercase font-bold border {statusColors[selectedAgent.status]}">
                  {selectedAgent.status}
                </span>
                <span class="px-2 py-1 rounded-lg text-[10px] font-mono uppercase border {riskColors[selectedAgent.riskLevel]}">
                  Risk: {selectedAgent.riskLevel}
                </span>
              </div>
            </div>

            <!-- Metrics row -->
            <div class="grid grid-cols-3 gap-3 mb-5">
              <div class="bg-black/20 rounded-xl p-3 border border-white/[0.05]">
                <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">TX wykonane</p>
                <p class="text-xl font-bold font-mono text-violet-300">{selectedAgent.actionsExecuted}</p>
              </div>
              <div class="bg-black/20 rounded-xl p-3 border border-white/[0.05]">
                <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Ostatnia aktywność</p>
                <p class="text-sm font-mono text-sky-300">{timeAgo(selectedAgent.lastUpdated)}</p>
              </div>
              <div class="bg-black/20 rounded-xl p-3 border border-white/[0.05]">
                <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Agent ID</p>
                <p class="text-[11px] font-mono text-slate-300 truncate">{selectedAgent.id}</p>
              </div>
            </div>

            <!-- PQC State Root -->
            <div class="bg-black/30 rounded-xl p-3.5 border border-violet-500/[0.15] mb-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-semibold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Key class="w-3 h-3" /> Quantum-Safe Merkle State Root (SHA3-256)
                </span>
                <button
                  onclick={() => copyText(selectedAgent.lastCommitmentRoot, 'root')}
                  class="text-slate-500 hover:text-white text-[10px] flex items-center gap-1 cursor-pointer transition"
                >
                  {#if copiedId === 'root'}
                    <Check class="w-3 h-3 text-emerald-400" /> Skopiowano
                  {:else}
                    <Copy class="w-3 h-3" /> Kopiuj
                  {/if}
                </button>
              </div>
              <p class="font-mono text-[11px] text-emerald-300 break-all select-all leading-relaxed bg-black/30 p-2 rounded-lg">
                {selectedAgent.lastCommitmentRoot}
              </p>
              <p class="text-[10px] text-slate-500 mt-1.5">
                Kotwiczone na Solana Devnet · Program PDA <code class="text-violet-400">aegis-registry</code>
              </p>
            </div>

            <!-- PQC Pubkey Hash -->
            <div class="bg-black/30 rounded-xl p-3.5 border border-emerald-500/[0.12]">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock class="w-3 h-3" /> Post-Quantum Public Key Hash (ML-DSA-44)
                </span>
                <button
                  onclick={() => copyText(selectedAgent.pqcPubkeyHash, 'pubkey')}
                  class="text-slate-500 hover:text-white text-[10px] flex items-center gap-1 cursor-pointer transition"
                >
                  {#if copiedId === 'pubkey'}
                    <Check class="w-3 h-3 text-emerald-400" /> Skopiowano
                  {:else}
                    <Copy class="w-3 h-3" /> Kopiuj
                  {/if}
                </button>
              </div>
              <p class="font-mono text-[11px] text-emerald-200 break-all select-all leading-relaxed bg-black/30 p-2 rounded-lg">
                {selectedAgent.pqcPubkeyHash}
              </p>
              <p class="text-[10px] text-slate-500 mt-1.5">
                One-Time Attestation · Klucz powiązany z adresem konta Solana przez DMS (RFC 8032)
              </p>
            </div>
          </div>
        </div>

        <!-- HITL Decision Console -->
        <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 backdrop-blur-sm">
          <h3 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <Zap class="w-3.5 h-3.5 text-amber-400" />
            Human-In-The-Loop · Konsola Decyzyjna
          </h3>

          <p class="text-[12px] text-slate-400 mb-4 leading-relaxed">
            Zatwierdź kolejny krok agenta lub aktywuj awaryjny Kill-Switch.
            Każda decyzja jest podpisana transakcją Solana z zaktualizowanym PQC State Rootem.
          </p>

          <div class="grid grid-cols-2 gap-3 mb-4">
            <button
              onclick={() => simulateAction('approve')}
              disabled={isSimulating}
              class="relative overflow-hidden px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-[12px] font-semibold shadow-lg shadow-emerald-600/20 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <span class="absolute inset-0 bg-white/[0.06] opacity-0 group-hover:opacity-100 transition"></span>
              {#if isSimulating}
                <RefreshCw class="w-4 h-4 animate-spin" />
              {:else}
                <ShieldCheck class="w-4 h-4" />
              {/if}
              Autoryzuj Krok
            </button>
            <button
              onclick={() => simulateAction('pause')}
              disabled={isSimulating}
              class="relative overflow-hidden px-4 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-[12px] font-semibold shadow-lg shadow-rose-600/20 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <span class="absolute inset-0 bg-white/[0.06] opacity-0 group-hover:opacity-100 transition"></span>
              <ShieldAlert class="w-4 h-4" />
              Kill-Switch 🛑
            </button>
          </div>

          {#if simulationMessage}
            <div class="p-3.5 rounded-xl border text-[11px] font-mono leading-relaxed
              {simulationSuccess
                ? 'bg-emerald-950/30 border-emerald-500/25 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/25 text-rose-300'}"
            >
              {simulationMessage}
            </div>
          {/if}
        </div>

        <!-- Blinks Hub -->
        <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 backdrop-blur-sm">
          <h3 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <Terminal class="w-3.5 h-3.5 text-sky-400" /> Solana Actions & Dialect Blinks
          </h3>

          <div class="space-y-3">
            <div>
              <label for="blink-url" class="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                Action URL (Solana Action Spec)
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="blink-url"
                  type="text"
                  readonly
                  value={blinkUrl}
                  class="flex-1 bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2.5 text-[11px] font-mono text-slate-300 focus:outline-none"
                />
                <button
                  onclick={() => copyText(blinkUrl, 'blink')}
                  class="px-3 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white text-[11px] font-semibold border border-white/[0.08] transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {#if copiedId === 'blink'}
                    <Check class="w-3.5 h-3.5 text-emerald-400" />
                  {:else}
                    <Copy class="w-3.5 h-3.5" />
                  {/if}
                  Kopiuj
                </button>
              </div>
            </div>

            <a
              href={dialToUrl}
              target="_blank"
              rel="noreferrer"
              class="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-sky-950/40 to-violet-950/40 border border-sky-500/[0.2] hover:border-sky-500/40 transition-all group"
            >
              <div>
                <p class="text-[13px] font-semibold text-white">Przetestuj w Dialect Inspector</p>
                <p class="text-[11px] text-slate-400">Otwórz akcję na dial.to · Solana Devnet</p>
              </div>
              <ExternalLink class="w-4 h-4 text-sky-400 group-hover:text-sky-300 transition" />
            </a>
          </div>
        </div>
      {/if}
    </section>

    <!-- ─── RIGHT COLUMN: Observability History Log ─── -->
    <aside class="flex flex-col gap-4">

      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 backdrop-blur-sm flex flex-col flex-1">
        <h2 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Activity class="w-3.5 h-3.5 text-rose-400" />
          On-Chain Observability Log
          <span class="ml-auto text-rose-300 font-mono">{history.length}</span>
        </h2>

        <div class="space-y-2 flex-1 overflow-y-auto max-h-[580px] pr-0.5">
          {#each history as entry (entry.id)}
            <div class="group p-3 rounded-xl bg-black/20 border border-white/[0.04] hover:border-white/[0.1] transition-all">
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-1.5">
                  {#if entry.decision === 'approve'}
                    <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>
                    <span class="text-[10px] font-bold text-emerald-400 uppercase">APPROVE</span>
                  {:else if entry.decision === 'pause'}
                    <span class="w-2 h-2 rounded-full bg-rose-400 shadow-sm shadow-rose-400/50"></span>
                    <span class="text-[10px] font-bold text-rose-400 uppercase">KILL-SWITCH</span>
                  {:else}
                    <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span class="text-[10px] font-bold text-slate-400 uppercase">SYSTEM</span>
                  {/if}
                </div>
                <span class="text-[9px] font-mono text-slate-500 flex items-center gap-1">
                  <Clock class="w-2.5 h-2.5" />
                  {timeAgo(entry.timestamp)}
                </span>
              </div>

              <p class="text-[11px] font-semibold text-slate-200 mb-1 leading-tight">{entry.agentName}</p>

              <div class="flex items-center gap-1.5 mb-1.5">
                <span class="text-[9px] text-slate-500">Operator:</span>
                <span class="text-[10px] font-mono text-violet-300">{entry.operator}</span>
                <ChevronRight class="w-2.5 h-2.5 text-slate-600" />
                <span class="px-1 py-0.5 rounded text-[9px] font-mono uppercase {entry.newStatus === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}">
                  {entry.newStatus}
                </span>
              </div>

              <div class="bg-black/30 rounded-lg p-1.5 border border-white/[0.04]">
                <p class="text-[9px] font-mono text-slate-500 break-all leading-relaxed">
                  {entry.memoHash}
                </p>
              </div>

              <div class="mt-1.5">
                <p class="text-[9px] text-slate-600 font-mono">
                  root: <span class="text-slate-400">{entry.newRoot.slice(0, 12)}…{entry.newRoot.slice(-8)}</span>
                </p>
              </div>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-12 text-slate-600">
              <Activity class="w-8 h-8 mb-3 opacity-30" />
              <p class="text-[12px]">Brak zdarzeń w logu</p>
              <p class="text-[10px] mt-1">Wykonaj akcję HITL, aby zobaczyć wpisy</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- PQC Algorithm Info -->
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 backdrop-blur-sm">
        <h3 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Lock class="w-3.5 h-3.5 text-violet-400" /> Stos Kryptograficzny
        </h3>
        <div class="space-y-2">
          {#each [
            { label: 'Podpis (podpisywanie)', value: 'ML-DSA-44', note: 'NIST FIPS 204' },
            { label: 'Enkapsulacja klucza', value: 'ML-KEM-768', note: 'NIST FIPS 203' },
            { label: 'State Commitment', value: 'SHA3-256', note: 'Quantum-Safe Hash' },
            { label: 'Ed25519 seed ochrona', value: 'DMS (RFC 8032)', note: 'Dual-Mode Sig' },
            { label: 'Blockchain', value: 'Solana Devnet', note: 'sub-400ms finality' },
          ] as algo}
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-[10px] text-slate-500">{algo.label}</p>
                <p class="text-[10px] text-violet-300 font-mono">{algo.note}</p>
              </div>
              <span class="text-[11px] font-mono text-white font-semibold whitespace-nowrap">{algo.value}</span>
            </div>
          {/each}
        </div>
      </div>
    </aside>

  </main>

  <!-- Footer -->
  <footer class="border-t border-white/[0.05] px-6 py-3 flex items-center justify-between text-[10px] text-slate-600">
    <span>Aegis Mercato · Solana Hackathon 2025 · Open Mercato Standard</span>
    <span class="font-mono">Powered by <span class="text-violet-400">@noble/post-quantum</span> · <span class="text-sky-400">@solana/actions</span></span>
  </footer>
</div>
