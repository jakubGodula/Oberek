# Aegis Mercato 🛡️⚡

> **PQC-Secured Private Agent Observability & Action Engine on Solana**  
> Zbudowane w standardzie **Open Mercato** pod kątem hackathonu Solana / AI.  
> **Tech Stack**: **Bun** + **SvelteKit 2 (Svelte 5 Runes)** + **Tailwind CSS** + **Anchor (Rust)** + **NIST PQC**.

Kompletna specyfikacja architektoniczna, schemat modułów oraz kod bazowy znajdują się w:
👉 **[ARCHITECTURE.md](./ARCHITECTURE.md)**

## Kluczowe Filary Projektu:
1. **Solana Actions & Blinks (`@solana/actions`)**:
   - Bezpośrednie zatwierdzanie decyzji agenta (*Human-in-the-Loop*) i awaryjny *Kill-Switch* z poziomu Twittera/X i Discorda.
2. **Obserwowalność Agentów (Agent Tracker)**:
   - Event-driven telemetria, mapowanie transakcji on-chain (Helius/Solana RPC) do bazy MikroORM w Open Mercato.
3. **Prywatność i Post-Quantum Cryptography (PQC + Dual-Mode DMS)**:
   - Wykorzystanie unikalnej cechy Solany (**Ed25519 / RFC 8032 & SLIP-0010**): tożsamość konta opiera się na 256-bitowym seedzie chronionym przez SHA-512, co umożliwia bezstratną migrację post-kwantową (**Dual-Mode Signatures - DMS**, wg *Baldimtsi et al., FC 2026*).
   - Szyfrowanie wrażliwych danych agenta off-chain za pomocą **ML-KEM (Kyber-768)**.
   - Post-kwantowe podpisy cyfrowe **ML-DSA (Dilithium-65)** oraz jednorazowa atestacja (*One-Time Proof Certification*) klucza post-kwantowego pod adresem konta Solana bez zmiany adresu portfela.
   - Kotwiczenie kwantowo-odpornych korzeni stanu (**Quantum-Safe Merkle State Root**) w koncie PDA programu Anchor na Solanie.


