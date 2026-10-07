# Aegis Mercato: Architektura Systemu (Hackathon)

> **PQC-Secured Private Agent Observability & Action Engine on Solana**  
> Zbudowane w oparciu o framework **Open Mercato** (Modular Monolith, Awilix IoC, Next.js, MikroORM, Overlay System).

---

## 1. Executive Summary & Założenia Projektowe

### Wizja
Stworzenie platformy nowej generacji łączącej:
- **Autonomicznych agentów AI na Solanie** z pełną obserwowalnością i audytowalnością.
- **Interakcję z użytkownikiem w mediach społecznościowych** za pomocą protokołu **Solana Actions & Dialect Blinks** (Human-in-the-Loop bezpośrednio z Twittera/X, Discorda).
- **Bezpieczeństwo post-kwantowe (PQC)** i **prywatność stanów (Zero-Knowledge)**: Ochrona wrażliwych danych agentów (strategie, klucze API, salda) przed złamaniem przez komputery kwantowe poprzez wykorzystanie algorytmów NIST PQC (ML-DSA / Dilithium, ML-KEM / Kyber) oraz dowodów ZK z kwantowo-odpornymi commitmentami.

---

## 2. Architektura Systemu

```mermaid
flowchart TB
    subgraph Client_Layer ["Warstwa Użytkownika / Social Media"]
        X["Twitter / X / Discord (Dialect Blink UI)"]
        Dash["Open Mercato Admin Dashboard (Next.js)"]
    end

    subgraph OpenMercato_Core ["Open Mercato Backend (Modular Monolith)"]
        Gateway["Next.js API Gateway / Actions Dispatcher"]
        
        subgraph Modules ["Moduły Domenowe (DI: Awilix)"]
            M_Blink["module: solana-blink\n(Actions & Blinks Spec)"]
            M_Tracker["module: agent-tracker\n(Observability & Logs)"]
            M_ZKPQC["module: zk-pqc\n(Post-Quantum & ZK Engine)"]
            M_Vault["module: private-vault\n(Encrypted Off-chain Storage)"]
        end

        EventBus["Open Mercato Event Bus"]
        DB[("PostgreSQL / MikroORM")]
    end

    subgraph Crypto_Pipeline ["PQC & ZK Proof Pipeline"]
        PQC_Engine["ML-KEM (Kyber-768) + ML-DSA (Dilithium)\nPost-Quantum Cryptography"]
        ZK_Prover["zkVM Prover (SP1 / RISC Zero / Hash-STARK)\n• Hash-based Commitments (Poseidon2 / SHA-3)"]
    end

    subgraph Solana_L1 ["Solana L1 Blockchain"]
        AnchorProg["Aegis Registry Program (Anchor)\n• Agent PDA Registry\n• PQC State Root Commitments"]
        Helius["Solana RPC / Helius Webhooks"]
    end

    X -->|1. GET/POST Blink Action| Gateway
    Gateway --> M_Blink
    M_Blink -->|2. Emit Event| EventBus
    EventBus --> M_Tracker
    M_Tracker -->|3. Persist Telemetry| DB
    Helius -->|Index Agent Tx| M_Tracker
    
    M_Vault -->|Encrypt Sensitive Data| PQC_Engine
    M_ZKPQC -->|Generate Proof| ZK_Prover
    ZK_Prover -->|Submit Root + Proof| AnchorProg
    AnchorProg -.->|Commitment Validated| Solana_L1
    Dash -->|View Metrics| M_Tracker
```

---

## 3. Struktura Katalogów Projektu (Open Mercato Standard)

```text
solana-aegis-mercato/
├── AGENTS.md                          # Instrukcje architektury dla modeli AI (standard Open Mercato)
├── package.json
├── tsconfig.json
├── docker-compose.yml                 # PostgreSQL, Redis, local Solana test-validator
├── programs/                          # Smart Kontrakty Solana (Anchor)
│   └── aegis-registry/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                 # Główna logika programu Anchor
│           ├── state.rs               # Definicje kont PDA (AgentAccount, StateCommitment)
│           ├── errors.rs              # Kody błędów
│           └── instructions/
│               ├── register_agent.rs
│               └── commit_private_state.rs
├── zk-circuits/                       # Obwody ZK (SP1 zkVM / Rust lub Circom)
│   ├── Cargo.toml
│   └── src/
│       └── main.rs                    # Obwód weryfikujący stan i sygnaturę ML-DSA
└── src/
    ├── app/                           # Next.js App Router (Open Mercato UI + API)
    │   ├── api/
    │   │   ├── actions/               # Solana Actions & Blinks
    │   │   │   ├── agent-action/route.ts
    │   │   │   └── actions.json/route.ts
    │   │   └── webhooks/
    │   │       └── helius/route.ts    # Webhook do indeksowania transakcji agentów
    │   └── (dashboard)/               # Interfejs analityczny i telemetryczny
    ├── modules/                       # Moduły Domenowe (Open Mercato Pattern)
    │   ├── solana-blink/
    │   │   ├── services/
    │   │   │   └── blink-generator.service.ts
    │   │   ├── controllers/
    │   │   │   └── blink.controller.ts
    │   │   ├── types/
    │   │   └── index.ts               # Rejestracja w kontenerze Awilix DI
    │   ├── agent-tracker/
    │   │   ├── entities/
    │   │   │   ├── Agent.entity.ts    # MikroORM Entity
    │   │   │   └── AgentActionLog.entity.ts
    │   │   ├── services/
    │   │   │   ├── telemetry.service.ts
    │   │   │   └── onchain-watcher.service.ts
    │   │   ├── subscribers/           # Subskrybenci Event Busa
    │   │   │   └── agent-events.subscriber.ts
    │   │   └── index.ts
    │   ├── zk-pqc/
    │   │   ├── services/
    │   │   │   ├── pqc-crypto.service.ts    # ML-KEM & ML-DSA (Dilithium)
    │   │   │   ├── zk-prover.service.ts     # Integracja z Proverem ZK
    │   │   │   └── state-merkle.service.ts  # Kwantowo-odporne drzewo Merkle
    │   │   └── index.ts
    │   └── private-vault/
    │       ├── services/
    │       │   └── vault.service.ts   # Hybrydowe szyfrowanie off-chain
    │       ├── entities/
    │       │   └── EncryptedDataBlob.entity.ts
    │       └── index.ts
    └── shared/                        # Współdzielona infrastruktura Open Mercato
        ├── di/                        # Awilix IoC Container
        ├── events/                    # Event Bus
        └── database/                  # Konfiguracja MikroORM
```

---

## 4. Specyfikacja Techniczna Modułów

### 4.1. Moduł: `solana-blink` (Solana Actions)
Odpowiada za standard **Dialect Blinks** / **Solana Actions**:
- `GET /api/actions.json` – deklaracja reguł routingu actions (CORS & Actions Spec).
- `GET /api/actions/agent-action?agentId=...` – zwraca metadane akcji do wyrenderowania w feedzie na Twitterze/X (ikona, opis stanu, przyciski autoryzacji akcji agenta, kill-switch).
- `POST /api/actions/agent-action` – odbiera konto portfela użytkownika (`account`), przygotowuje i podpisuje transakcję Solana kierowaną do programu `aegis-registry`, zwracając zserializowaną transakcję w formacie base64.

### 4.2. Moduł: `agent-tracker` (Obserwowalność i Telemetria)
- Pobiera zdarzenia on-chain (za pośrednictwem webhooków Helius lub dedykowanego serwisu indeksującego RPC).
- Mapuje akcje agentów (zakupy, swapy, rebalansowanie, wywołania AI) do encji w bazie PostgreSQL (MikroORM).
- Publikuje zdarzenia w **Open Mercato Event Bus** (`AgentActionTriggered`, `AgentActionValidated`, `AgentKilled`).

### 4.3. Moduł: `zk-pqc` oraz `private-vault` (Post-Quantum ZK)
- **Problem**: Klasyczne algorytmy (RSA, ECC, Ed25519, standardowe ZK-SNARKi oparte o krzywe BN254) są podatne na złamanie przez algorytm Shora na komputerach kwantowych.
- **Rozwiązanie**:
  1. **NIST PQC Standards**:
     - **ML-KEM (Kyber-768)** – post-kwantowy mechanizm kapsułkowania klucza do symetrycznego szyfrowania (AES-256-GCM) niepublicznych danych agenta w `private-vault`.
     - **ML-DSA (Dilithium-65)** – post-kwantowe podpisy cyfrowe generowane przez agentów pod stanami decyzyjnymi.
  2. **Kwantowo-odporne Dowody ZK**:
     - Wykorzystanie weryfikacji opartej o funkcje skrótu (**Hash-based Commitments**: SHA3-256 / Poseidon2).
     - Dowód poprawności stanu generowany w zkVM (**SP1** lub **RISC Zero**), który weryfikuje poprawność sygnatury ML-DSA oraz pre-image hasha.
     - Kotwiczenie wyłącznie korzenia stanu (**Quantum-Safe Merkle State Root**) na L1 Solany w koncie PDA agenta.

---

## 5. Implementacje Kluczowych Komponentów

### 5.1. Serwis PQC & ZK Commitments (`src/modules/zk-pqc/services/pqc-crypto.service.ts`)
```typescript
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { createHash, randomBytes } from 'crypto';

export interface PqcKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export class PqcCryptoService {
  /**
   * Generuje parę kluczy ML-DSA-65 (Dilithium) dla agenta
   */
  generateDsaKeys(): PqcKeyPair {
    const keys = ml_dsa65.keygen();
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
    return ml_dsa65.sign(secretKey, stateHash);
  }

  /**
   * Weryfikuje podpis ML-DSA
   */
  verifyStateSignature(stateHash: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return ml_dsa65.verify(publicKey, stateHash, signature);
  }
}
```

### 5.2. Kontroler Solana Actions & Blinks (`src/modules/solana-blink/controllers/blink.controller.ts`)
```typescript
import { ActionGetResponse, ActionPostRequest, ActionPostResponse, createPostResponse } from '@solana/actions';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

export class BlinkController {
  constructor(
    private readonly telemetryService: any,
    private readonly solanaConnection: any
  ) {}

  async getActionMetadata(agentId: string): Promise<ActionGetResponse> {
    const agent = await this.telemetryService.getAgentStatus(agentId);
    
    return {
      type: 'action',
      icon: 'https://aegis-mercato.app/icons/pqc-shield.png',
      title: `Aegis Sentinel | Agent: ${agent.name}`,
      description: `Stan: ${agent.status} | Aktywne zadanie: ${agent.currentTask}\nPQC State Root: ${agent.lastCommitment.slice(0, 14)}...`,
      label: 'Autoryzacja Agenta',
      actions: [
        {
          label: 'Autoryzuj kolejny krok',
          href: `/api/actions/agent-action?agentId=${agentId}&decision=approve`
        },
        {
          label: 'Emergency Kill-Switch (Wstrzymaj)',
          href: `/api/actions/agent-action?agentId=${agentId}&decision=pause`
        }
      ]
    };
  }

  async createActionTransaction(req: ActionPostRequest, agentId: string, decision: string): Promise<ActionPostResponse> {
    const userPubkey = new PublicKey(req.account);
    const tx = new Transaction();

    const programId = new PublicKey(process.env.AEGIS_PROGRAM_ID!);
    
    // Instrukcja wzywająca smart kontrakt na Solanie
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: true },
      ],
      programId,
      data: Buffer.from(JSON.stringify({ agentId, decision }))
    });

    tx.add(instruction);
    tx.feePayer = userPubkey;
    const { blockhash } = await this.solanaConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    return await createPostResponse({
      fields: {
        transaction: tx,
        message: `Agent ${agentId} został zaktualizowany decyzją: ${decision.toUpperCase()}.`
      }
    });
  }
}
```

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
| **6h – 16h** | **Solana Blink & Kontrakt Anchor** | Kompilacja i wdrożenie `aegis-registry` na Solana Devnet. Oprogramowanie endpointów Solana Actions (`actions.json` + `agent-action`), test w Dialect Inspectorze (`dial.to`). |
| **16h – 26h** | **Agent Tracking & Observability** | Integracja Event Busa Open Mercato, nasłuch transakcji z Helius Webhook, zapis historii akcji w MikroORM, widok w dashboardzie Next.js. |
| **26h – 38h** | **PQC & ZK State Pipeline** | Integracja `@noble/post-quantum` (ML-DSA / ML-KEM). Generowanie solonych commitmentów SHA3/Poseidon dla danych prywatnych, generowanie dowodu i zapisywanie rootów on-chain. |
| **38h – 48h** | **Testy E2E, Polishing & Demo** | Przejście pełnego scenariusza live: akcja agenta -> Blink na Twitterze -> podpis transakcji -> zapis PQC Roota na Solanie -> aktualizacja stanu w dashboardzie. |

---

## 7. Wskazówki i "Pitch Deck" dla Jury

1. **Dlaczego Open Mercato?** Pokazuje dojrzałość inżynierską – zamiast prototypu w jednym pliku, stworzono modularną, skalowalną platformę z Dependency Injection (Awilix) i Event-Driven Architecture.
2. **Dlaczego PQC + ZK?** Komputery kwantowe to realne zagrożenie dla kryptografii asymetrycznej. Rozwiązanie wprowadza standardy NIST (ML-DSA, ML-KEM) wraz z kwantowo-odpornymi dowodami ZK dla danych agentów.
3. **Efekt "WOW" na żywo**: Bezpośrednia interakcja z agentem AI na Twitterze/X za pośrednictwem Blinka, bez konieczności opuszczania platformy społecznościowej.
