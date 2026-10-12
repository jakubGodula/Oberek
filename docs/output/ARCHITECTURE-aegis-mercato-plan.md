> Archive: the original Aegis Mercato plan (Open Mercato), replaced on 2026-10-12 by [spec/ARCHITECTURE.md](../../spec/ARCHITECTURE.md). Most of it was never built; see decision 004.

# Aegis Mercato: Architektura Systemu (Hackathon)

> **PQC-Secured Private Agent Observability & Action Engine on Solana**  
> Zbudowane w oparciu o wzorzec **Modular Monolith** w standardzie Open Mercato (Awilix IoC, Bun, SvelteKit 2 z Svelte 5 Runes, Tailwind CSS, MikroORM).

---

## 1. Executive Summary & Założenia Projektowe

### Wizja
Stworzenie platformy nowej generacji łączącej:
- **Autonomicznych agentów AI na Solanie** z pełną obserwowalnością i audytowalnością.
- **Odpowiedź właściciela z Telegrama**: bot wysyła propozycje agentów i zmiany ich stanu z przyciskami Accept, Reject,
  Kill i Resume (decyzja 008).
- **Bezpieczeństwo post-kwantowe (PQC)** i **prywatność stanów (Zero-Knowledge Commitments)**: Ochrona wrażliwych danych agentów (strategie, klucze API, salda) przed złamaniem przez komputery kwantowe poprzez wykorzystanie algorytmów NIST PQC (ML-DSA-44 / Dilithium, ML-KEM-768 / Kyber) oraz kotwiczenie kwantowo-odpornych korzeni stanu (**Quantum-Safe Merkle State Root**) na Solanie w koncie PDA programu Anchor.

---

## 2. Architektura Systemu

```mermaid
flowchart TB
    subgraph Client_Layer ["Warstwa Użytkownika / Social Media"]
        TG["Telegram (owner bot, bot/telegram)"]
        Dash["Operator Dashboard (SvelteKit 5 + Tailwind)"]
    end

    subgraph Backend_Core ["Aegis Core Backend (Bun Runtime)"]
        ServerAPI["SvelteKit Endpoints (+server.ts)"]
        
        subgraph Modules ["Moduły Domenowe (DI: Awilix)"]
            M_Blink["module: solana-blink\n(agent cards, kill & resume)"]
            M_Tracker["module: agent-tracker\n(Observability & Logs)"]
            M_ZKPQC["module: zk-pqc\n(ML-KEM & ML-DSA Engine)"]
            M_Vault["module: private-vault\n(Encrypted Off-chain Storage)"]
        end

        EventBus["Internal Event Bus"]
        DB[("PostgreSQL / MikroORM")]
    end

    subgraph Crypto_Pipeline ["PQC & Commitment Pipeline"]
        PQC_Engine["ML-KEM-768 (KEM) + ML-DSA-44 (Signatures)\n@noble/post-quantum"]
        Commitment_Engine["Hash Commitments (SHA3-256 / Merkle Root)\nOptional zkVM (SP1 / RISC Zero Prover)"]
    end

    subgraph Solana_L1 ["Solana L1 Blockchain (Devnet)"]
        AnchorProg["Aegis Registry Program (Anchor)\n• PDA: AgentAccount\n• PQC State Root Commitments\n• Emergency Kill-Switch"]
        Helius["Solana RPC / Helius Webhooks"]
    end

    TG -->|1. GET agents, POST approval / control| ServerAPI
    ServerAPI --> M_Blink
    M_Blink -->|2. Emit Event| EventBus
    EventBus --> M_Tracker
    M_Tracker -->|3. Persist Telemetry| DB
    Helius -->|Index Agent Tx| M_Tracker
    
    M_Vault -->|Encrypt Sensitive Data| PQC_Engine
    M_ZKPQC -->|Compute Root & Sign| Commitment_Engine
    Commitment_Engine -->|Submit Root Tx| AnchorProg
    AnchorProg -.->|Commitment Validated| Solana_L1
    Dash -->|View Metrics & Runes State| DB
```

---

## 3. Struktura Katalogów Projektu (SvelteKit + Bun Standard)

```text
solana-aegis-mercato/
├── AGENTS.md                          # Instrukcje architektury dla agentów AI
├── package.json                       # Konfiguracja projektu zarządzana przez Bun
├── tsconfig.json
├── svelte.config.js                   # Konfiguracja SvelteKit 2
├── vite.config.ts                     # Vite bundler
├── tailwind.config.ts                 # Konfiguracja Tailwind CSS
├── docker-compose.yml                 # PostgreSQL, Redis, local Solana test-validator
├── programs/                          # Smart Kontrakty Solana (Anchor)
│   └── aegis-registry/
│       ├── Cargo.toml
│       ├── Anchor.toml
│       └── src/
│           ├── lib.rs                 # Główna logika programu Anchor
│           ├── state.rs               # Definicje kont PDA (AgentAccount)
│           ├── errors.rs              # Kody błędów (np. AgentInactive)
│           └── instructions/
│               ├── register_agent.rs
│               ├── commit_private_state.rs
│               └── set_agent_status.rs
├── zk-circuits/                       # Obwody dowodzące zkVM (Opcjonalny SP1 Prover / STARK)
│   ├── Cargo.toml
│   └── src/
│       └── main.rs                    # Obwód weryfikujący stan i sygnaturę ML-DSA
├── bot/
│   └── telegram/                      # Bot Telegram właściciela (osobny proces, decyzja 008)
└── src/
    ├── routes/                        # SvelteKit App Router
    │   ├── (dashboard)/
    │   │   ├── +page.svelte           # Dashboard operatora w Svelte 5 (Runes)
    │   │   └── +page.server.ts        # Ładowanie danych agentów i telemetrii
    │   └── api/
    │       └── webhooks/
    │           └── helius/
    │               └── +server.ts     # Ingestion transakcji on-chain z Helius
    ├── lib/
    │   ├── server/
    │   │   ├── modules/               # Moduły Domenowe (Modular Monolith)
    │   │   │   ├── solana-blink/
    │   │   │   │   └── blink.service.ts
    │   │   │   ├── agent-tracker/
    │   │   │   │   ├── entities/
    │   │   │   │   │   ├── Agent.entity.ts
    │   │   │   │   │   └── AgentActionLog.entity.ts
    │   │   │   │   ├── services/
    │   │   │   │   │   ├── telemetry.service.ts
    │   │   │   │   │   └── onchain-watcher.service.ts
    │   │   │   │   └── subscribers/
    │   │   │   │       └── agent-events.subscriber.ts
    │   │   │   ├── zk-pqc/
    │   │   │   │   ├── services/
    │   │   │   │   │   ├── pqc-crypto.service.ts    # ML-KEM & ML-DSA (@noble/post-quantum)
    │   │   │   │   │   ├── zk-prover.service.ts     # Wrapper Provera dowodów
    │   │   │   │   │   └── state-merkle.service.ts  # Kwantowo-odporne drzewo Merkle
    │   │   │   ├── private-vault/
    │   │   │   │   ├── services/
    │   │   │   │   │   └── vault.service.ts         # Hybrydowe szyfrowanie off-chain
    │   │   │   │   └── entities/
    │   │   │   │       └── EncryptedDataBlob.entity.ts
    │   │   ├── di/
    │   │   │   └── container.ts       # Awilix IoC Container
    │   │   ├── events/
    │   │   │   └── event-bus.ts       # Wewnętrzny Event Bus
    │   │   └── db/
    │   │       └── mikro-orm.config.ts# Konfiguracja MikroORM PostgreSQL
    │   └── solana/
    │       └── idl.json               # Wygenerowany IDL programu Anchor
    └── hooks.server.ts                # Inicjalizacja MikroORM & DI na żądanie
```

---

## 4. Specyfikacja Techniczna Modułów

### 4.1. Moduł: `solana-blink` (karty agentów i sterowanie właściciela)
Buduje karty agentów dla strony i dla `GET /api/agents` oraz przyjmuje odpowiedzi właściciela:
- `GET /api/agents` – karty agentów (stan, ostatnia decyzja, oczekująca propozycja).
- `POST /api/agents/<id>/control` – kill i resume agenta (`kill` / `resume`).
- `POST /api/agents/<id>/approval` – werdykt właściciela dla propozycji (zatwierdzenie lub odrzucenie).

Z tych samych endpointów korzysta bot Telegram właściciela (sekcja 5.2, decyzja 008); ścieżka Solana Actions / Blinks została usunięta.

### 4.2. Moduł: `agent-tracker` (Obserwowalność i Telemetria)
- Pobiera zdarzenia on-chain (za pośrednictwem webhooków Helius lub dedykowanego serwisu indeksującego RPC).
- Mapuje akcje agentów (zakupy, swapy, rebalansowanie, wywołania AI) do encji w bazie PostgreSQL (MikroORM).
- Publikuje zdarzenia w **Event Bus** (`AgentActionTriggered`, `AgentActionValidated`, `AgentKilled`).

### 4.3. Moduł: `zk-pqc` oraz `private-vault` (Post-Quantum ZK Commitments & DMS)
> Nieaktualne: DMS, `aegis-registry` i commitmenty SHA3-256 nie są zaimplementowane; korzeń Merkle (SHA-256) istnieje tylko dla paczek decyzji szybkiego agenta ([decyzja 007](decisions/007-korzen-merkle-dla-paczki-decyzji.md)); dla dowodu DMS nie istnieje weryfikator na Solanie. ML-KEM-768 nie szyfruje niczego on-chain; pieczętuje tylko log decyzji na serwerze ([decyzja 006](decisions/006-zapieczetowany-log-decyzji-ml-kem.md)). Obowiązuje [decyzja 004](decisions/004-bez-dms-ochrona-pq-bez-dowodu-seeda.md).

- **Problem kryptograficzny**: Klasyczne algorytmy asymetryczne (RSA, ECC, Ed25519) są podatne na złamanie przez algorytm Shora na komputerach kwantowych. W łańcuchach typu ECDSA (Ethereum, Bitcoin) ujawnienie klucza publicznego trwale kompromituje konto, ponieważ klucze są bezstrukturalnymi skalarami.
- **Przewaga strukturalna Solany (RFC 8032 & SLIP-0010)**:
  - Zgodnie z badaniami *Baldimtsi et al. (FC 2026, Mysten Labs & Soundness Labs)*: łańcuchy oparte na **EdDSA (Solana)** posiadają kluczową cechę – klucz prywatny jest deterministycznie wyprowadzany z **256-bitowego seeda** poprzez funkcję skrótu:
    $$\text{sk} = \text{HashToScalar}(\text{SHA-512}(\text{seed})[:32]), \quad \text{pk} = \text{sk} \cdot G$$
  - Nawet jeśli komputer kwantowy odzyska $\text{sk}$ ze znanego $\text{pk}$, **nie potrafi odwrócić SHA-512** (atak Grovera daje jedynie przyspieszenie $\mathcal{O}(\sqrt{N})$, zachowując ~256 bitów bezpieczeństwa).
  - Prawdziwy właściciel konta zna $\text{seed}$, co pozwala na autoryzację przejścia w tryb post-kwantowy bez utraty konta i bez zmiany adresu on-chain!

- **Model Dual-Mode Signature (DMS) & One-Time Attestation w Aegis**:
  1. **Dual Mode Signature (DMS)**:
     - **Mode 1 (Legacy)**: Standardowy podpis Ed25519 używany w normalnym cyklu życia Solany.
     - **Mode 2 (Quantum-Safe)**: Podpisy **ML-DSA-44 (Dilithium)** wspierane przez kapsułkowanie **ML-KEM-768 (Kyber)**.
  2. **One-Time Key Certification (Atestacja powiązania)**:
     - Zamiast generować ogromny dowód ZK (~5.4 MB w zkVM) do każdej transakcji, agent dokonuje **jednorazowej certyfikacji** powiązania: rejestruje hash swojego klucza post-kwantowego `pqc_pubkey_hash` w koncie PDA programu `aegis-registry`.
     - Kolejne decyzje, logi i akcje agenta autoryzowane są przez podpis ML-DSA weryfikowany względem zarejestrowanego stanu.
  3. **Kwantowo-odporne Commitments**:
     - Wykorzystanie solonych hashy (**Hash-based Commitments**: SHA3-256):
       $$\text{CommitmentRoot} = \text{SHA3-256}(\text{Salt} \parallel \text{JSON}(\text{DecisionPayload}))$$
     - Kotwiczenie wyłącznie 32-bajtowego korzenia stanu (**Quantum-Safe Merkle State Root**) na L1 Solany w PDA agenta.
     - Pełna agilność kryptograficzna (*Crypto Agility*) – możliwość rotacji parametrów PQC bez naruszania struktury bazowej konta Solana.

### 4.4. Pakiet `pq-agent-guard` (`kit/`)
Klient programu `onchain_agent_guard` i strażnik zbudowany na nim, jako samodzielny pakiet (workspace Bun): instrukcje i
wiadomości podpisywane kluczami ML-DSA-44, transakcje V1, pliki kluczy, `OnchainGuard` oraz API jednego agenta
`openGuardedAgent` / `step`. `kit/` nie importuje niczego z aplikacji; serwer (`fleet`), skrypty i testy importują
`pq-agent-guard` jak każdą bibliotekę. Użycie: [kit/README.md](../kit/README.md).

---

## 5. Implementacje Kluczowych Komponentów

### 5.1. Serwis PQC & Commitments (`src/lib/server/modules/zk-pqc/services/pqc-crypto.service.ts`)
```typescript
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { createHash, randomBytes } from 'crypto';

export interface PqcKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export class PqcCryptoService {
  /**
   * Generuje parę kluczy ML-DSA-44 (Dilithium) dla agenta
   */
  generateDsaKeys(): PqcKeyPair {
    const keys = ml_dsa44.keygen();
    return {
      publicKey: keys.publicKey,
      secretKey: keys.secretKey,
    };
  }

  /**
   * Generuje parę kluczy ML-KEM-768 (Kyber) do szyfrowania danych niepublicznych
   */
  generateKemKeys(): PqcKeyPair {
    const keys = ml_kem768.keygen();
    return {
      publicKey: keys.publicKey,
      secretKey: keys.secretKey,
    };
  }

  /**
   * Oblicza post-kwantowy commitment stanu z użyciem solenia (SHA3-256 / Poseidon)
   */
  computeStateCommitment(privatePayload: Record<string, unknown>): { commitmentRoot: Buffer; salt: Buffer } {
    const salt = randomBytes(32);
    const serialized = Buffer.from(JSON.stringify(privatePayload), 'utf-8');
    
    const hasher = createHash('sha3-256');
    hasher.update(salt);
    hasher.update(serialized);
    const commitmentRoot = hasher.digest();

    return { commitmentRoot, salt };
  }

  /**
   * Podpisuje stan agenta przy użyciu post-kwantowego podpisu ML-DSA
   */
  signState(stateHash: Uint8Array, secretKey: Uint8Array): Uint8Array {
    return ml_dsa44.sign(secretKey, stateHash);
  }

  /**
   * Weryfikuje podpis ML-DSA
   */
  verifyStateSignature(stateHash: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return ml_dsa44.verify(publicKey, stateHash, signature);
  }
}
```

### 5.2. Bot Telegram właściciela (`bot/telegram/`)
Bot jest osobnym procesem (`bun bot/telegram`) i rozmawia z serwerem tylko przez HTTP (decyzja 008). Co 3 s czyta `GET /api/agents` i porównuje stan z poprzednim odczytem. Nowa propozycja trafia do czatu właściciela z treścią i przyciskami Accept, Reject, Kill; zabicie agenta z przyciskiem Resume; wznowienie z Kill. Przycisk woła `POST /api/agents/<id>/approval` albo `POST /api/agents/<id>/control` (`kill` / `resume`), a wiadomość kończy się linią wyniku. `/agents` wypisuje flotę z przyciskami pasującymi do stanu agenta. Przyciski naciśnięte spoza czatu `TELEGRAM_OWNER_CHAT_ID` są ignorowane.

### 5.3. Smart Kontrakt Solana (Anchor: `programs/aegis-registry/src/lib.rs`)
```rust
use anchor_lang::prelude::*;

declare_id!("Aeg1sRegistry11111111111111111111111111111111");

#[program]
pub mod aegis_registry {
    use super::*;

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        agent_id: String,
        pqc_pubkey_hash: [u8; 32]
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;
        agent.owner = *ctx.accounts.owner.key;
        agent.agent_id = agent_id;
        agent.pqc_pubkey_hash = pqc_pubkey_hash;
        agent.is_active = true;
        agent.last_state_root = [0u8; 32];
        agent.last_updated = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn commit_private_state(
        ctx: Context<CommitPrivateState>,
        new_state_root: [u8; 32],
        _zk_proof: Vec<u8>
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;
        require!(agent.is_active, AegisError::AgentInactive);
        
        // Zapis odpornego na ataki kwantowe korzenia stanu niepublicznego
        agent.last_state_root = new_state_root;
        agent.last_updated = Clock::get()?.unix_timestamp;

        emit!(PrivateStateCommitted {
            agent_id: agent.agent_id.clone(),
            state_root: new_state_root,
            timestamp: agent.last_updated,
        });

        Ok(())
    }

    pub fn set_agent_status(
        ctx: Context<SetAgentStatus>,
        is_active: bool
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;
        agent.is_active = is_active;
        agent.last_updated = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

#[account]
pub struct AgentAccount {
    pub owner: Pubkey,
    pub agent_id: String,
    pub pqc_pubkey_hash: [u8; 32],
    pub last_state_root: [u8; 32],
    pub is_active: bool,
    pub last_updated: i64,
}

#[derive(Accounts)]
#[instruction(agent_id: String)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 64 + 32 + 32 + 1 + 8,
        seeds = [b"agent", agent_id.as_bytes()],
        bump
    )]
    pub agent_account: Account<'info, AgentAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitPrivateState<'info> {
    #[account(mut, has_one = owner)]
    pub agent_account: Account<'info, AgentAccount>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetAgentStatus<'info> {
    #[account(mut, has_one = owner)]
    pub agent_account: Account<'info, AgentAccount>,
    pub owner: Signer<'info>,
}

#[event]
pub struct PrivateStateCommitted {
    pub agent_id: String,
    pub state_root: [u8; 32],
    pub timestamp: i64,
}

#[error_code]
pub enum AegisError {
    #[msg("Agent jest obecnie wstrzymany")]
    AgentInactive,
}
```

---

## 6. Harmonogram Realizacji na Hackathon (36–48h)

| Okres | Cel | Kluczowe Rezultaty |
| :--- | :--- | :--- |
| **0h – 6h** | **Infrastruktura & Środowisko** | Inicjalizacja Open Mercato monorepo, setup Postgres/MikroORM, konfiguracja Solana Devnet i Anchor CLI. |
| **6h – 16h** | **Bot Telegram & Kontrakt Anchor** | Kompilacja i wdrożenie `aegis-registry` na Solana Devnet. Oprogramowanie endpointów właściciela (`approval`, `control`) i bota Telegram. |
| **16h – 26h** | **Agent Tracking & Observability** | Integracja Event Busa Open Mercato, nasłuch transakcji z Helius Webhook, zapis historii akcji w MikroORM, widok w dashboardzie SvelteKit 5. |
| **26h – 38h** | **PQC & ZK State Pipeline** | Integracja `@noble/post-quantum` (ML-DSA / ML-KEM). Generowanie solonych commitmentów SHA3/Poseidon dla danych prywatnych, generowanie dowodu i zapisywanie rootów on-chain. |
| **38h – 48h** | **Testy E2E, Polishing & Demo** | Przejście pełnego scenariusza live: akcja agenta -> wiadomość z przyciskami w Telegramie -> decyzja właściciela -> zapis PQC Roota na Solanie -> aktualizacja stanu w dashboardzie. |

---

## 7. Wskazówki i "Pitch Deck" dla Jury

1. **Dlaczego Open Mercato?** Pokazuje dojrzałość inżynierską – zamiast prototypu w jednym pliku, stworzono modularną, skalowalną platformę z Dependency Injection (Awilix) i Event-Driven Architecture.
2. **Dlaczego PQC + Dual-Mode Signature (DMS)?**
   > Nieaktualne: DMS nie jest zaimplementowany i na Solanie nie istnieje weryfikator jego dowodu. Obowiązuje [decyzja 004](decisions/004-bez-dms-ochrona-pq-bez-dowodu-seeda.md).
   - Komputery kwantowe (algorytm Shora) nieodwracalnie łamią ECDSA (Ethereum/Bitcoin), niszcząc tożsamość kont.
   - Wskazujemy na **przełomową przewagę Solany (RFC 8032 / SLIP-0010)** udowodnioną w pracy *Baldimtsi et al. (FC 2026)*: klucz Solany to w istocie seed za hashem SHA-512, którego komputer kwantowy nie potrafi odwrócić.
   - Aegis Mercato jako pierwsze rozwiązanie na Solanie wdraża formalny model **Dual-Mode Signatures (DMS)** i jednorazową atestację klucza **ML-DSA-44 (NIST PQC)**, pozwalając agentom na bezpieczną migrację post-kwantową bez konieczności porzucania adresów portfeli.
3. **Efekt "WOW" na żywo**: Bezpośrednia interakcja z agentem AI w Telegramie (Human-in-the-Loop i awaryjny Kill-Switch): propozycja agenta przychodzi na telefon z przyciskami.
