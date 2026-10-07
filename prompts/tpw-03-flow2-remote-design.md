# tpw-03-flow2-remote-design.md — Stage 03: Flow 2 design (design only)

Read `tpw-00-common.md` (especially §4.3), then `<output>/research/01-cezar.md` and
`research/04-design-decisions.md`. Implement nothing. Write one file:
`<output>/FLOW2-remote-machine-design.md`.

## Context
Flow 2 equals Flow 1, except some work packages run on a rented machine with 500+ GB RAM.
Priorities: (1) running local or open-weight LLMs as worker models; (2) heavy parallel agent work with
many worktrees, for example rewriting several microservices at once. Heavy builds and data jobs: ignore.

## The document must cover
1. Goals, non-goals, and when Flow 2 is worth it compared with Flow 1.
2. Topology options, compared in a table, with one recommendation:
   a) Cezar runs on the TL's machine; the remote box only serves models over an OpenAI-compatible endpoint;
   b) Cezar `serve` runs on the remote box and executes packages there; the TL uses the cockpit remotely;
   c) hybrid: remote model server plus remote worker pool, local orchestration.
   Base each option on runner and handoff features verified on the branch (cite paths).
3. Model serving: candidate serving stacks, how a Cezar runner or harness points at a custom endpoint,
   concurrency and context limits, and a capacity method. State plainly that RAM is not GPU memory:
   the plan must start by recording the machine's GPUs, and give expected throughput ranges for CPU-only
   and GPU cases as estimates to be measured, not facts.
4. Plan-format impact: how `placement`, minimum tier and estimated tokens in the Flow 1 package brief
   drive scheduling; which package types suit open models and which must stay on strong hosted models.
5. Parallel execution at scale: number of concurrent worktrees, disk and memory per agent, queueing,
   branch naming (unchanged), integration back on the TL's side.
6. Data flow and sync: how the run folder and branches reach the remote box and come back (git remotes,
   Cezar handoff), with no manual copying of secrets.
7. Security and compliance: source code leaving the team's machines, credentials on a rented host,
   disk wipe on teardown, network exposure of the endpoint. List the questions this adds to
   `security-q_and_a.md` and `ai-and-budget-q_and_a.md`.
8. Lifecycle: provision, bootstrap, smoke test, run, collect, teardown; outline of the scripts needed
   (names and responsibilities only).
9. Cost model: rental per hour against hosted-model token cost, with a break-even formula and a worked
   example using clearly labelled placeholder prices.
10. Failure modes and recovery (machine lost mid-run, model server stalls, partial packages), using the
    TPW state files.
11. Phased rollout, each phase with an exit criterion, and open questions.
