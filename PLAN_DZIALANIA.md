# Plan Działania: Aegis Mercato 🛡️⚡
> **PQC-Secured Private Agent Observability & Action Engine on Solana**  
> Operacyjny, sekwencyjny plan realizacji projektu krok po kroku w formie dokumentacji markdown (.md) bez generowania kodu aplikacji.  
> **Środowisko docelowe**: **Bun** + **SvelteKit (Svelte 5 Runes)** + **Tailwind CSS** + **Anchor (Rust)** + **NIST PQC**.

---

## Spis Treści
1. [Założenia i Zasady Realizacji](#1-założenia-i-zasady-realizacji)
2. [Faza 1: Przygotowanie Środowiska (Bun, Rust, Solana)](#faza-1-przygotowanie-środowiska-bun-rust-solana)
3. [Faza 2: Smart Contract Solana (Anchor `aegis-registry`)](#faza-2-smart-contract-solana-anchor-aegis-registry)
4. [Faza 3: Szkielet Architektury SvelteKit & Baza Danych](#faza-3-szkielet-architektury-sveltekit--baza-danych)
5. [Faza 4: Silnik Kryptografii Post-Kwantowej (PQC) & Private Vault](#faza-4-silnik-kryptografii-post-kwantowej-pqc--private-vault)
6. [Faza 5: Solana Actions & Dialect Blinks w SvelteKit](#faza-5-solana-actions--dialect-blinks-w-sveltekit)
7. [Faza 6: Telemetria, Indeksowanie & Event Bus (`agent-tracker`)](#faza-6-telemetria-indeksowanie--event-bus-agent-tracker)
8. [Faza 7: Dashboard Operatora w Svelte 5 + Tailwind CSS](#faza-7-dashboard-operatora-w-svelte-5--tailwind-css)
9. [Faza 8: Testy E2E, Wdrożenie Produkcyjne i Prezentacja Demo](#faza-8-testy-e2e-wdrożenie-produkcyjne-i-prezentacja-demo)
10. [Matryca Zależności, Ryzyk i Kryteria Odbioru](#10-matryca-zależności-ryzyk-i-kryteria-odbioru)

---

## 1. Założenia i Zasady Realizacji

- **Runtime & Zarządzanie Pakietami (Bun)**: Użycie `bun` zamiast standardowego `npm`/`node` do zarządzania zależnościami, uruchamiania dev-serwera oraz testów jednostkowych (`bun test`).
- **Warstwa Full-Stack (SvelteKit + Svelte 5)**: Svelte 5 z Runami (`$state`, `$derived`, `$effect`) zapewnia natychmiastową reaktywność i brak narzutu wirtualnego DOM-u. Serwerowe endpointy `+server.ts` dają 100% precyzyjną kontrolę nad nagłówkami HTTP (kluczowe dla CORS w Solana Actions).
- **Styling (Tailwind CSS)**: Szybkie stylowanie komponentów UI w estetyce Cyber-Security (ciemny motyw, efekty Glassmorphism, akcenty neonowe).
- **Bezpieczeństwo post-kwantowe (NIST PQC)**: Wrażliwe dane agenta chronione są przez **ML-KEM-768** i podpisywane przez **ML-DSA-65**, a na Solanie kotwiczony jest wyłącznie 32-bajtowy korzeń stanu (**Quantum-Safe Merkle Root**).

---

## Faza 1: Przygotowanie Środowiska (Bun, Rust, Solana)

### Zadanie 1.1: Weryfikacja i instalacja toolchainu
- [ ] Zainstalować środowisko **Bun**: `curl -fsSL https://bun.sh/install | bash`.
- [ ] Zainstalować / zweryfikować środowisko **Rust** (`rustup default stable`).
- [ ] Zainstalować narzędzia **Solana CLI** (wersja `1.18+` lub nowsza).
- [ ] Zainstalować **Anchor CLI** (wersja `0.30+` poprzez `avm`).
- [ ] Uruchomić usługę **Docker** dla bazy PostgreSQL.

### Zadanie 1.2: Konfiguracja portfeli i połączeń RPC
- [ ] Wygenerować klucz portfela deweloperskiego: `solana-keygen new --outfile ~/.config/solana/id.json`.
- [ ] Skonfigurować Solana CLI na sieć testową Devnet: `solana config set --url https://api.devnet.solana.com`.
- [ ] Doładować portfel testowymi tokenami SOL: `solana airdrop 2` (lub poprzez web faucet).
- [ ] Skonfigurować klucz API w **Helius.dev** dla Devnet RPC i Webhooków.

### Zadanie 1.3: Konfiguracja pliku zmiennych środowiskowych (`.env`)
- [ ] Utworzyć szablon `.env.example` zawierający:
  - `DATABASE_URL=postgresql://user:password@localhost:5432/aegis_mercato`
  - `SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=<HELIUS_KEY>`
  - `AEGIS_PROGRAM_ID=<ID_PROGRAMU_ANCHOR>`
  - `HELIUS_WEBHOOK_SECRET=<SECRET_DO_WERYFIKACJI>`
  - `PUBLIC_BASE_URL=http://localhost:5173` (lub publiczny URL z ngrok)

---

## Faza 2: Smart Contract Solana (Anchor `aegis-registry`)

### Zadanie 2.1: Inicjalizacja projektu Anchor
- [ ] Utworzyć katalog `programs/aegis-registry`.
- [ ] Zdefiniować pliki konfiguracyjne `Anchor.toml` i `Cargo.toml`.

### Zadanie 2.2: Implementacja konta PDA (`AgentAccount`)
- [ ] Zdefiniować strukturę konta `AgentAccount` z unikalnym adresem wyprowadzanym z nasion (seeds): `[b"agent", agent_id.as_bytes()]`.
- [ ] Zdefiniować pola konta:
  - `owner: Pubkey` (właściciel/operator agenta, 32 bajty)
  - `agent_id: String` (identyfikator unikalny agenta)
  - `pqc_pubkey_hash: [u8; 32]` (hash klucza publicznego ML-DSA agenta)
  - `last_state_root: [u8; 32]` (32-bajtowy korzeń stanu odporny na komputery kwantowe)
  - `is_active: bool` (flaga stanu aktywności – kill-switch)
  - `last_updated: i64` (znacznik czasu ostatniej aktualizacji)

### Zadanie 2.3: Implementacja instrukcji programu
- [ ] `register_agent(agent_id, pqc_pubkey_hash)`: inicjalizacja konta PDA dla nowego agenta.
- [ ] `commit_private_state(new_state_root, zk_proof)`: zapis nowego korzenia stanu i emisja `PrivateStateCommitted`.
- [ ] `set_agent_status(is_active)`: zmiana statusu działania agenta (Emergency Kill-Switch).

### Zadanie 2.4: Testy i wdrożenie na Solana Devnet
- [ ] Zbudować program: `anchor build`.
- [ ] Wykonać testy w TypeScript z użyciem Bun: `bun run test:contracts` (lub `anchor test`).
- [ ] Wdrożyć kontrakt na Devnet: `anchor deploy --provider.cluster devnet`.
- [ ] Skopiować wygenerowany plik IDL (`target/idl/aegis_registry.json`) do `src/lib/solana/idl.json`.

---

## Faza 3: Szkielet Architektury SvelteKit & Baza Danych

### Zadanie 3.1: Inicjalizacja SvelteKit z Bun i Tailwind CSS
- [ ] Zainicjalizować projekt SvelteKit:
  ```bash
  bun create svelte@latest .
  bun install
  bun add -d tailwindcss postcss autoprefixer
  bunx tailwindcss init -p
  ```
- [ ] Zainstalować zależności runtime:
  ```bash
  bun add @solana/web3.js @solana/actions @noble/post-quantum mikro-orm @mikro-orm/postgresql @mikro-orm/core awilix lucide-svelte
  ```

### Zadanie 3.2: Struktura modułów backendowych w `src/lib/server/`
- [ ] `src/lib/server/modules/solana-blink/` (kontroler i serwis Blinks)
- [ ] `src/lib/server/modules/agent-tracker/` (telemetria i ingestion)
- [ ] `src/lib/server/modules/zk-pqc/` (silnik kryptograficzny ML-KEM/ML-DSA)
- [ ] `src/lib/server/modules/private-vault/` (hybrydowe szyfrowanie AES-GCM + KEM)
- [ ] `src/lib/server/di/container.ts` (rejestracja w Awilix DI)
- [ ] `src/lib/server/events/event-bus.ts` (wewnętrzny Event Bus)

### Zadanie 3.3: Konfiguracja MikroORM w SvelteKit (`src/hooks.server.ts`)
- [ ] Skonfigurować `mikro-orm.config.ts` dla bazy PostgreSQL.
- [ ] Zainicjalizować ORM w `src/hooks.server.ts` i przekazywać instancję `em` w `event.locals`.
- [ ] Zdefiniować encje:
  - `Agent.entity.ts`: ID, nazwa, klucz Solana, hash klucza PQC, status, ostatni Merkle Root.
  - `AgentActionLog.entity.ts`: ID, typ akcji, decyzja HITL, sygnatura on-chain, timestamp.
  - `EncryptedDataBlob.entity.ts`: ID, ciphertext, skapsułkowany klucz ML-KEM, IV, authTag.
- [ ] Wykonać początkową migrację schematu bazy danych.

---

## Faza 4: Silnik Kryptografii Post-Kwantowej (PQC) & Private Vault

### Zadanie 4.1: Integracja biblioteki `@noble/post-quantum`
- [ ] Sprawdzić poprawność działania algorytmów NIST w środowisku Bun:
  - Podpisy cyfrowe: **ML-DSA-65** (Dilithium).
  - Wymiana klucza: **ML-KEM-768** (Kyber).

### Zadanie 4.2: Implementacja serwisu `PqcCryptoService`
- [ ] `generateDsaKeys()`: generowanie post-kwantowych kluczy podpisu dla agenta.
- [ ] `generateKemKeys()`: generowanie kluczy KEM do szyfrowania stanu off-chain.
- [ ] `computeStateCommitment(payload)`:
  - Generowanie soli kryptograficznej (32 bajty).
  - Obliczenie skrótu SHA3-256 z połączenia soli i zserializowanych danych stanu.
  - Wygenerowanie 32-bajtowego korzenia stanu (Quantum-Safe State Root).
- [ ] `signState(stateHash, secretKey)`: podpisanie commitmentu za pomocą ML-DSA.
- [ ] `verifyStateSignature(stateHash, signature, publicKey)`: weryfikacja podpisu ML-DSA.

### Zadanie 4.3: Implementacja modułu `private-vault` (`VaultService`)
- [ ] Kapsułkowanie klucza sesyjnego AES-256-GCM za pomocą `ml_kem768.encapsulate()`.
- [ ] Szyfrowanie wrażliwych danych decyzyjnych agenta.
- [ ] Zapis zaszyfrowanego bloba i parametrów KEM w encji `EncryptedDataBlob`.

---

## Faza 5: Solana Actions & Dialect Blinks w SvelteKit

### Zadanie 5.1: Endpoint reguł routingu i CORS (`src/routes/api/actions.json/+server.ts`)
- [ ] Zaimplementować metody `GET` oraz `OPTIONS` zwracające:
  ```json
  {
    "rules": [
      { "pathPattern": "/api/actions/**", "apiPath": "/api/actions/**" }
    ]
  }
  ```
- [ ] Ustawić nagłówki CORS w standardzie Web Fetch API:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization, Content-Encoding, Accept-Encoding`

### Zadanie 5.2: Endpoint metadanych Blinka (`src/routes/api/actions/agent-action/+server.ts`)
- [ ] Handler `GET`:
  - Odczyt parametru `agentId` z `url.searchParams`.
  - Zwrócenie struktury `ActionGetResponse` zawierającej:
    - Ikonę tarczy Aegis Sentinel.
    - Tytuł ze statusem agenta i zadaniem.
    - Opis z fragmentem aktualnego PQC State Root.
    - Akcje:
      1. **"Autoryzuj kolejny krok"** (`href: /api/actions/agent-action?agentId=...&decision=approve`)
      2. **"Emergency Kill-Switch (Wstrzymaj)"** (`href: /api/actions/agent-action?agentId=...&decision=pause`)

### Zadanie 5.3: Endpoint transakcji (`POST`) w `+server.ts`
- [ ] Handler `POST`:
  - Odczyt pola `account` z ciała zapytania JSON.
  - Zbudowanie instrukcji transakcji Solana wywołującej program `aegis-registry`.
  - Serializacja transakcji do Base64 i zwrócenie odpowiedzi `createPostResponse`.
- [ ] Handler `OPTIONS`: natychmiastowe zwrócenie nagłówków CORS ze statusem 200/204.

### Zadanie 5.4: Weryfikacja w Dialect Inspectorze
- [ ] Uruchomienie dev-serwera: `bun run dev`.
- [ ] Uruchomienie tunelu: `npx ngrok http 5173`.
- [ ] Przetestowanie URL w [dial.to](https://dial.to) pod kątem poprawności CORS i podpisywania transakcji w portfelu.

---

## Faza 6: Telemetria, Indeksowanie & Event Bus (`agent-tracker`)

### Zadanie 6.1: Webhook Helius w SvelteKit (`src/routes/api/webhooks/helius/+server.ts`)
- [ ] Obsługa zapytania `POST` od serwisu Helius po zatwierdzeniu transakcji na Devnecie.
- [ ] Weryfikacja nagłówka autoryzacyjnego z webhooka.
- [ ] Dekodowanie logów Anchor i zdarzenia `PrivateStateCommitted`.

### Zadanie 6.2: Emisja zdarzeń i subskrypcja
- [ ] Opublikowanie zdarzenia w wewnętrznym Event Busie.
- [ ] Zaktualizowanie encji `Agent` w bazie PostgreSQL (nowy stan i timestamp).
- [ ] Dodanie wpisu w `AgentActionLog` z sygnaturą transakcji.

---

## Faza 7: Dashboard Operatora w Svelte 5 + Tailwind CSS

### Zadanie 7.1: Interfejs Dashboardu (`src/routes/(dashboard)/+page.svelte`)
- [ ] Wykorzystanie reaktywności **Svelte 5 Runes**:
  - Zarządzanie listą agentów przez `$state(agents)`.
  - Filtrowanie i wyliczanie metryk przez `$derived(activeAgents)`.
- [ ] **Karty agentów**: Stylizacja Tailwind CSS (ciemne tła, gradienty, wskaźniki statusu pulse/glow).

### Zadanie 7.2: Panel Kryptograficzny (PQC Inspector)
- [ ] Wizualizacja 32-bajtowego skrótu Merkle State Root z możliwością kopiowania jednym kliknięciem.
- [ ] Wyświetlanie hasha klucza publicznego ML-DSA i wskaźnika ochrony post-kwantowej.

### Zadanie 7.3: Centrum Udostępniania Blinks
- [ ] Generator linków do Dialect Blinks z podglądem na żywo.
- [ ] Przycisk "Kopiuj do X/Twitter" i szybki link do otwarcia w [dial.to](https://dial.to).

### Zadanie 7.4: Awaryjny Kill-Switch
- [ ] Przycisk natychmiastowego zatrzymania agenta w Dashboardzie z potwierdzeniem akcji.

---

## Faza 8: Testy E2E, Wdrożenie Produkcyjne i Prezentacja Demo

### Zadanie 8.1: Test pełnego scenariusza (End-to-End Walkthrough)
1. Agent podejmuje autonomiczną decyzję i szyfruje dane za pomocą ML-KEM.
2. Zostaje wygenerowany post-kwantowy podpis ML-DSA pod commitmentem SHA3.
3. System generuje Blink z akcją zatwierdzenia.
4. Użytkownik zatwierdza akcję w Dialect Inspectorze (`dial.to`) na Devnecie.
5. Transakcja zostaje potwierdzona przez sieć Solana, PDA zostaje zaktualizowany.
6. Webhook Helius aktualizuje bazę, a Dashboard w SvelteKit natychmiast odzwierciedla nowy stan.

### Zadanie 8.2: Wdrożenie Produkcyjne
- [ ] Wdrożenie aplikacji SvelteKit na platformie Vercel / Railway / Cloudflare Pages.
- [ ] Podłączenie bazy danych PostgreSQL (Neon Tech / Supabase).
- [ ] Skonfigurowanie webhooka Helius na publiczny adres URL.

### Zadanie 8.3: Przygotowanie materiałów konkursowych
- [ ] Nagranie 2-3 minutowego wideo demo.
- [ ] Przygotowanie prezentacji Pitch Deck (Problem, Rozwiązanie, Architektura SvelteKit+Bun, PQC+Blinks, Zespół).
- [ ] Aktualizacja `README.md` o instrukcję uruchomienia z użyciem `bun`.

---

## 10. Matryca Zależności, Ryzyk i Kryteria Odbioru

### Zależności między fazami
```
Faza 1 (Bun + Solana) 
   └──> Faza 2 (Anchor Devnet) ────────┐
   └──> Faza 3 (SvelteKit + MikroORM) ───> Faza 5 (Solana Blinks + CORS)
   └──> Faza 4 (PQC ML-KEM / ML-DSA) ──┘        │
                                                ▼
                                          Faza 6 (Telemetria & Helius)
                                                │
                                                ▼
                                          Faza 7 (Svelte 5 Dashboard + Tailwind)
                                                │
                                                ▼
                                          Faza 8 (Testy E2E & Demo)
```

### Kryteria Odbioru (Definition of Done)
1. **Bun**: Wszystkie komendy deweloperskie i testy wykonywane są za pośrednictwem `bun`.
2. **SvelteKit & Tailwind CSS**: Pełna aplikacja full-stack działa w SvelteKit z komponentami Svelte 5 (Runes) i estetyką Tailwind CSS.
3. **Blinks**: Endpointy `/api/actions.json` oraz `/api/actions/agent-action` poprawnie odpowiadają na zapytania CORS i renderują się w Dialect Inspectorze (`dial.to`).
4. **Smart Contract**: Program `aegis-registry` wdrożony na Solana Devnet, rejestruje agentów i kotwiczy korzenie stanu PQC.
5. **Kryptografia**: Generowanie kluczy i sygnatur ML-DSA oraz kapsułkowanie ML-KEM działa bezbłędnie.
