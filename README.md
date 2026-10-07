# Aegis Mercato 🛡️⚡

> **PQC-Secured Private Agent Observability & Action Engine on Solana**  
> Zbudowane w standardzie **Open Mercato** pod kątem hackathonu Solana / AI.

Kompletna specyfikacja architektoniczna, schemat modułów oraz kod bazowy znajdują się w:
👉 **[ARCHITECTURE.md](file:///Users/jakubgodula/Documents/Solana/ARCHITECTURE.md)**

## Kluczowe Filary Projektu:
1. **Solana Actions & Blinks (`@solana/actions`)**:
   - Bezpośrednie zatwierdzanie decyzji agenta (*Human-in-the-Loop*) i awaryjny *Kill-Switch* z poziomu Twittera/X i Discorda.
2. **Obserwowalność Agentów (Agent Tracker)**:
   - Event-driven telemetria, mapowanie transakcji on-chain (Helius/Solana RPC) do bazy MikroORM w Open Mercato.
3. **Prywatność i Post-Quantum Cryptography (PQC + ZK)**:
   - Szyfrowanie wrażliwych danych agenta off-chain za pomocą **ML-KEM (Kyber-768)**.
   - Post-kwantowe podpisy cyfrowe **ML-DSA (Dilithium-65)** weryfikowane w obwodzie zkVM/STARK.
   - Kotwiczenie kwantowo-odpornych korzeni stanu (**Quantum-Safe Merkle State Root**) w koncie PDA programu Anchor na Solanie.
