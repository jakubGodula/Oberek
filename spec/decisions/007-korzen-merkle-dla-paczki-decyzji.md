# 007: Korzeń Merkle dla paczki decyzji szybkiego agenta

Data: 2026-10-11

## Kontekst

Każda decyzja agenta to dotąd osobna transakcja `record_step` z własnym podpisem ML-DSA-44, a serwer przepuszcza co
najwyżej jeden krok na agenta na 10 s, bo płaci za każdy. Szybki agent podejmuje decyzje częściej. Decyzja 004 w
akapicie „Dlaczego nie ma korzenia Merkle” odłożyła korzeń do chwili, gdy wiele decyzji trafi do jednej transakcji.

## Decyzja

- Program ma instrukcję `record_batch(root, size, signature)`. Weryfikuje podpis ML-DSA-44 nad wiadomością
  `3 ‖ agent ‖ licznik ‖ korzeń ‖ size` (kontekst `onchain-agent-guard:v1`), podnosi licznik o jeden, zapisuje korzeń w
  `last_decision` i emituje `BatchRecorded`. Tag 3 odróżnia ją od kroku (1) i wznowienia (2). Pusta paczka jest
  odrzucana (`EmptyBatch`).
- Serwer buforuje decyzje agentów z `BATCHED_AGENT_IDS`, odpowiada im `202` i co `BATCH_FLUSH_MS` (domyślnie 10 s) albo
  przy `BATCH_MAX_DECISIONS` (domyślnie 16) zapisuje cały bufor jedną transakcją. Pozostali agenci działają jak dotąd.
- Drzewo: liść = SHA-256(0x00 ‖ hash decyzji), węzeł = SHA-256(0x01 ‖ lewy ‖ prawy), nieparzysty węzeł przechodzi
  poziom wyżej bez zmian. Hash decyzji to, jak dotąd, SHA-256 jej rekordu.
- Każda decyzja paczki trafia do zapieczętowanego logu (decyzja 006) z licznikiem paczki, swoim indeksem i dowodem
  włączenia.
- Propozycja do zatwierdzenia nie trafia do paczki: serwer najpierw zapisuje bufor, potem propozycję osobnym krokiem.
- Audyt sprawdza dla każdej paczki komplet wpisów w logu, indeksy 0..size-1, każdy dowód i korzeń całego drzewa.

## Uzasadnienie

- **Jeden podpis na N decyzji.** Program nie widzi decyzji, tylko korzeń, więc paczka kosztuje tyle co krok (Mollusk:
  272 270 CU wobec 271 888 CU), niezależnie od rozmiaru. Rozmiar ogranicza polityka serwera, nie limit obliczeń.
- **Pojedyncza decyzja do pokazania.** Właściciel może przedstawić jedną decyzję z dowodem; sprawdzający porówna ją z
  korzeniem na łańcuchu bez reszty paczki, która zostaje zapieczętowana.
- **Odporność kwantowa bez zmian.** Korzeń podpisuje ML-DSA-44, a drzewo z SHA-256 zachowuje około 128 bitów
  bezpieczeństwa wobec algorytmu Grovera.
- **Prefiksy liścia i węzła oraz brak duplikacji** sprawiają, że dwie różne listy decyzji nie dają tego samego korzenia;
  `size` jest dodatkowo podpisany i na łańcuchu.

## Czego nie chroni

- Decyzje w buforze nie są na łańcuchu aż do zapisu paczki. Agent dostał `202`, ale restart serwera gubi niezapisany
  bufor. Te decyzje nie trafiły ani na łańcuch, ani do logu, więc audyt pozostaje spójny.
- Zabity agent: zapis paczki zostaje odrzucony, a zbuforowane decyzje przepadają bez wpisu w logu, tak jak odrzucony krok.

## Odrzucone

- **Korzeń przez istniejący `record_step`, bez zmiany programu.** Bez wdrożenia, ale łańcuch nie odróżniałby korzenia od
  hasha pojedynczej decyzji ani nie znałby rozmiaru paczki; audyt i strona musiałyby zgadywać z logu.
- **Paczka składana przez agenta (tablica decyzji w jednym żądaniu).** Prostsza po stronie serwera, ale każdy agent
  musiałby sam buforować; wybrano bufor na serwerze, przy niezmienionym API agenta poza odpowiedzią `202`.
- **Licznik podnoszony o rozmiar paczki.** Każda decyzja miałaby własny licznik, ale wiadomość do podpisu nie wskazywałaby
  już jednej następnej wartości licznika; wybrano licznik paczki i indeks w niej.

## Konsekwencje

- Ta decyzja zastępuje w decyzji 004 akapit „Dlaczego nie ma korzenia Merkle”. Reszta decyzji 004 obowiązuje: DMS,
  `aegis-registry` i commitmenty SHA3-256 nadal nie istnieją.
- `last_decision` przechowuje hash ostatniego kroku albo korzeń ostatniej paczki; strona nazywa go wtedy „Quantum-Safe
  Merkle Root (SHA-256)”.
