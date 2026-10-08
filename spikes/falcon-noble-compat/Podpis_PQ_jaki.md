PQ – łańcuch wniosków:
• Ma być odporne kwantowo → podpis PQ musi weryfikować sam program, on-chain. Jeśli nie on-chain, to atak kwantowy (odzyskanie prywatnego klucza Ed25519 ownera z jego klucza publicznego, który leży jawnie w PDA (na blockchainie)) pozwala wysłać podpisaną nim transakcję prosto do programu i ominąć backend, który sprawdza podpis PQ.
• On-chain → najprościej, gdy podpis mieści się w jednej transakcji. Od 15.09.2026 Solana ma transakcje v1 do 4096 B (wcześniej 1232 B).
  Nie musi to być jedna transakcja: podpis można wgrać kawałkami do konta-bufora w kilku transakcjach i zweryfikować w ostatniej (tak Solana wgrywa programy). Podobnie, jeśli weryfikacja nie zmieści się w limicie CU, da się rozbić obliczenia na kilka transakcji. Ale to skomplikowane: kilka transakcji na jedną akcję, stan pośredni na koncie i pilnowanie, żeby nikt nie podmienił bufora po drodze.
• 4096 B → mieści się Dilithium (ML-DSA-65, oficjalny standard NIST FIPS 204, podpis 3309 B), czyli algorytm, który już mamy w dokumentach.
• Do sprawdzenia: nie ma gotowego weryfikatora Dilithium dla programów Solany i nie wiadomo, czy zmieści się w limicie 1,4 mln CU. Transakcje v1 wysyła tylko @solana/kit ≥ 8 albo web3.js 3.x.
• Plan awaryjny: Falcon-512 (666 B, gotowa biblioteka ~180k CU, w tę stronę idzie sama Solana), ale jako standard NIST to dopiero projekt (FIPS 206).

Do decyzji:
A) PQ on-chain (Dilithium, awaryjnie Falcon) → kontrola nad agentem JEST odporna kwantowo (atakujący może go co najwyżej zatrzymać).
B) PQ tylko off-chain → kontrola NIE jest odporna kwantowo: atakujący kwantowo może przejąć pełną kontrolę nad programem (wznowić agenta po kill-switchu, zatwierdzać kroki, zapisywać stan). Odporne kwantowo zostają tylko dane i dziennik (ML-KEM, Dilithium).

Uwaga dla obu wariantów: klucz do aktualizacji programu (upgrade authority) to też Ed25519. Dopóki program da się aktualizować, atakujący kwantowo podmieni jego kod. Wersja pokazywana jako odporna kwantowo musi być niemodyfikowalna (set-upgrade-authority --final).
