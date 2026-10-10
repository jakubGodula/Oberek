PQ – łańcuch wniosków:
• Ma być odporne kwantowo → podpis PQ musi weryfikować sam program, on-chain. Jeśli nie on-chain, to atak kwantowy (odzyskanie prywatnego klucza Ed25519 ownera z jego klucza publicznego, który leży jawnie w PDA (na blockchainie)) pozwala wysłać podpisaną nim transakcję prosto do programu i ominąć backend, który sprawdza podpis PQ.
• On-chain → najprościej, gdy podpis mieści się w jednej transakcji. Od 15.09.2026 Solana ma transakcje v1 do 4096 B (wcześniej 1232 B).
  Nie musi to być jedna transakcja: podpis można wgrać kawałkami do konta-bufora w kilku transakcjach i zweryfikować w ostatniej (tak Solana wgrywa programy). Podobnie, jeśli weryfikacja nie zmieści się w limicie CU, da się rozbić obliczenia na kilka transakcji. Ale to skomplikowane: kilka transakcji na jedną akcję, stan pośredni na koncie i pilnowanie, żeby nikt nie podmienił bufora po drodze.
• 4096 B → mieści się Dilithium (oficjalny standard NIST FIPS 204): ML-DSA-65 (podpis 3309 B) i ML-DSA-44 (podpis 2420 B).
• Gotowy weryfikator Dilithium dla programów Solany jest, ale tylko dla ML-DSA-44 (blueshift-gg/solana-ml-dsa, podpis 2420 B), nie dla ML-DSA-65. Sprawdzone w spike'u ../mldsa44-dilithium-noble-compat (08.10.2026, także na devnecie transakcjami v1): przyjmuje podpisy z @noble/post-quantum. Weryfikacja kosztuje ~260 tys. CU (transakcja 2672 B), a jednorazowa rejestracja klucza ~1,09 mln CU; oba mieszczą się w limicie 1,4 mln CU na transakcję. Biblioteka nie przeszła audytu, opublikowano ją 13.09.2026. Transakcje v1 wysyła tylko @solana/kit ≥ 8 albo web3.js 3.x.
• Oba weryfikatory działają w programie Anchor 1.2.1 (toolchain z WP-02), sprawdzone w spike'u ../pq-verify-anchor (08.10.2026, Mollusk). Narzut Anchora jest mały (Dilithium ~+0,5 tys. CU, Falcon ~+4 tys. CU), ale trzeba wyłączyć overflow-checks dla bibliotek weryfikatorów (inaczej Dilithium się nie kompiluje, a Falcon kosztuje ~283 tys. zamiast ~172 tys. CU), a konto klucza Dilithium (20 KB) zakładać po stronie klienta instrukcją System Program i inicjalizować przez #[account(zero)]. Falcon mieści się w transakcji legacy (web3.js 1.x), Dilithium wymaga v1.
• Alternatywa (odrzucona): Falcon-512 (666 B, gotowa biblioteka ~180k CU, mieści się w transakcji legacy, w tę stronę idzie sama Solana), ale jako standard NIST to dopiero projekt (FIPS 206).

Rozważane warianty:
A) PQ on-chain → kontrola nad agentem JEST odporna kwantowo (atakujący może go co najwyżej zatrzymać).
B) PQ tylko off-chain → kontrola NIE jest odporna kwantowo: atakujący kwantowo może przejąć pełną kontrolę nad programem (wznowić agenta po kill-switchu, zatwierdzać kroki, zapisywać stan). Odporne kwantowo zostają tylko dane i dziennik (ML-KEM, Dilithium).

Decyzje (09.10.2026):
• Wariant A: podpis PQ weryfikuje program Anchor on-chain.
• Algorytm: ML-DSA-44. Skutki: transakcje v1 przez @solana/kit, w każdej jawnie ustawiony limit CU i limit danych ładowanych kont (nieustawione oznaczają zero), konto klucza 20 KB zakładane po stronie klienta, ten sam context string (FIPS 204) w aplikacji i w programie.
• Na start jeden agent, najprostszy: działa po stronie serwera aplikacji SvelteKit (nie w przeglądarce, bo trzyma klucz prywatny, i nie w programie, bo program sam niczego nie inicjuje), decyduje według stałej reguły, bez modelu AI. Jego kroki i wznowienie po kill-switchu wymagają podpisu ML-DSA-44, kill-switch wystarczy portfelem właściciela (Ed25519).

Uwaga dla obu wariantów: klucz do aktualizacji programu (upgrade authority) to też Ed25519. Dopóki program da się aktualizować, atakujący kwantowo podmieni jego kod. Wersja pokazywana jako odporna kwantowo musi być niemodyfikowalna (set-upgrade-authority --final).
