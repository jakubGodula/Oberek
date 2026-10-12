# 004: Bez DMS; ochrona post-kwantowa bez dowodu znajomości seeda

Data: 2026-10-11

## Kontekst

`spec/ARCHITECTURE.md` §4.3 opisuje model Dual-Mode Signature (DMS) z pracy *Baldimtsi i in., „Post-Quantum Readiness in EdDSA Chains”, FC 2026* (`docs/research/post-quantum-readiness-eddsa-chains_2025-1368.pdf`), a obok niego: rejestr `aegis-registry` z `pqc_pubkey_hash`, solone commitmenty SHA3-256 z korzeniem Merkle i szyfrowanie ML-KEM-768. Strona operatora pokazywała te elementy jak działające. Żadnego z nich nie ma w kodzie.

DMS opiera się na tym, że klucz prywatny Ed25519 powstaje z 32-bajtowego seeda przez SHA-512 (RFC 8032). Komputer kwantowy odzyska klucz prywatny z publicznego, ale nie seed. Właściciel konta dowodzi więc w dowodzie zero-knowledge, że zna seed, i tym dowodem wiąże swój adres z kluczem post-kwantowym, bez zmiany adresu.

## Decyzja

- **Nie implementujemy DMS.** Na Solanie nie istnieje weryfikator jego dowodu. Klucz ML-DSA-44 agenta wiąże z właścicielem zwykły podpis Ed25519 transakcji `register_agent`.
- Strona i dokumentacja pokazują tylko to, co istnieje: podpisy ML-DSA-44 weryfikowane on-chain przez `onchain_agent_guard`, klucz agenta w koncie `agent_key`, hash SHA-256 ostatniej decyzji w polu `last_decision` konta agenta.
- `aegis-registry`, `pqc_pubkey_hash`, commitmenty SHA3-256 i korzeń Merkle nie istnieją i nie są pokazywane.
- ML-KEM-768 nie szyfruje niczego on-chain. Służy tylko do zapieczętowania logu decyzji na serwerze kluczem właściciela ([decyzja 006](006-zapieczetowany-log-decyzji-ml-kem.md)) i tak jest opisany na stronie.

## Uzasadnienie

### DMS nie mieści się w programie Solany

- **Na Solanie nie istnieje weryfikator dowodu DMS** (zkVM Ligetron) i nie znamy produkcyjnego weryfikatora żadnego post-kwantowego dowodu zero-knowledge tej klasy (STARK). Dowody weryfikowane dziś na Solanie, Groth16 przez syscalle `alt_bn128` i dowody programu ZK ElGamal, opierają się na krzywych eliptycznych, więc nie są odporne kwantowo.
- Według autorów dowód ma 5,4 MB, jego wygenerowanie trwa 6,2 s, a weryfikacja 2,3 s natywnie (zkVM Ligetron). Autorzy proponują go jako aktualizację walidatorów, czyli zmianę protokołu, a nie program on-chain.
- Transakcja Solany ma najwyżej 4096 B i 1,4 mln CU. Nawet gdyby taki weryfikator powstał, szacunkowo samo wgranie dowodu to około 1500 transakcji, a weryfikacja tysiące kolejnych.
- Opakowanie dowodu w mały dowód Groth16, który Solana weryfikuje tanio, opiera się na krzywych eliptycznych, więc komputer kwantowy łamie je dokładnie wtedy, gdy DMS jest potrzebny.
- Weryfikacja dowodu na serwerze oznacza zaufanie do serwera, a nie do dowodu; takie rozwiązanie odrzuca decyzja 002.

### Dlaczego nie ma korzenia Merkle

Korzeń Merkle streszcza wiele rekordów jedną wartością; ma sens, gdy on-chain trafia jedna kotwica dla paczki decyzji zapisanych poza łańcuchem. Tu każda decyzja jest osobną transakcją `record_step` z własnym hashem SHA-256 i podpisem ML-DSA-44, a licznik konta nadaje im kolejność. Historią jest więc sam ciąg transakcji: audyt (`scripts/audit.ts`) odtwarza go z łańcucha i porównuje z logiem rekord po rekordzie. Pole `last_decision` to hash ostatniego kroku, nadpisywany przy każdym kroku; nie jest korzeniem ani łańcuchem hashy. Korzeń nad całym logiem nie dodałby nic, czego nie ma już w transakcjach, a wymagałby drzewa po stronie serwera jako drugiego źródła prawdy dla dowodów włączenia. Wróci dopiero, gdyby wiele decyzji trafiało do jednej transakcji.

### DMS jest potrzebny dopiero po Q-day

Dopóki nie ma komputera kwantowego zdolnego złamać Ed25519, zwykły podpis Ed25519 jest bezpieczny. Wiązanie klucza agenta z właścicielem, zapisane on-chain przy rejestracji, zostaje na łańcuchu na stałe. DMS jest ścieżką ratunkową dla kont, które nie zdążyły zarejestrować klucza post-kwantowego przed Q-day; ma sens na poziomie całej sieci, nie pojedynczego programu.

Podpisy nie podlegają zasadzie „zbierz teraz, odszyfruj później”. Przyszły komputer kwantowy nie unieważni kroków już zapisanych on-chain; może jedynie podrobić nowe transakcje wysłane po Q-day.

### Co jest odporne kwantowo

- **Kroki agenta.** `record_step` przyjmuje tylko podpis ML-DSA-44 agenta, weryfikowany on-chain; licznik nie pozwala użyć podpisu drugi raz. Historii decyzji nie da się podrobić nawet po złamaniu wszystkich kluczy Ed25519.
- **Wznowienie.** `resume` wymaga podpisu ML-DSA-44 agenta oraz podpisu właściciela; sam podrobiony podpis Ed25519 nie wznowi agenta.
- **Hash decyzji.** SHA-256 zachowuje wobec algorytmu Grovera około 128 bitów bezpieczeństwa; SHA3-256 nie dałby tu nic więcej.
- **Log decyzji na serwerze.** Zapieczętowany AES-256-GCM pod kluczem opakowanym ML-KEM-768 do właściciela (decyzja 006); sama kopia pliku jest nieczytelna także po Q-day.

### Co nie jest odporne kwantowo

- **`kill`** wymaga tylko podpisu Ed25519 właściciela, celowo: to hamulec awaryjny, który musi działać ze zwykłego portfela, także gdy serwer agenta nie działa. Napastnik kwantowy mógłby agenta jedynie zatrzymać, nie wznowić.
- **`register_agent`** wymaga tylko podpisu Ed25519 właściciela. Po Q-day napastnik mógłby zarejestrować własnego agenta pod adresem właściciela; historia istniejących agentów pozostaje nienaruszona. Tę lukę zamyka klucz ML-DSA-44 właściciela, zarejestrowany przed Q-day.
- **Upgrade authority programu** to klucz Ed25519. Zgodnie z decyzją 002 wersja pokazywana jako odporna kwantowo jest wdrażana jako immutable; program na devnecie jest dziś jeszcze aktualizowalny.

## Odrzucone

- **DMS weryfikowany w programie, w częściach.** Tysiące transakcji na jedno powiązanie i weryfikator, którego nie ma.
- **DMS weryfikowany na serwerze.** Zaufanie do serwera zamiast do dowodu.
- **Dowód opakowany w Groth16.** Nie jest odporny kwantowo.
- **Etykiety z §4.3 zostawione na stronie.** Strona twierdziłaby coś, czego system nie robi.

## Konsekwencje

- Ta decyzja zastępuje w `spec/ARCHITECTURE.md` §4.3 opis DMS, `aegis-registry`, commitmentów SHA3-256, korzenia Merkle i szyfrowania ML-KEM-768 danych agenta. Zdanie z decyzji 002 o ML-KEM używanym do szyfrowania odnosi się dziś tylko do pieczęci logu decyzji (decyzja 006); on-chain nic nie jest szyfrowane.
- Strona operatora pokazuje adres konta `agent_key` z linkiem do Solana Explorer zamiast hasha klucza i opisuje `last_decision` jako SHA-256.
- Dalsze kroki, każdy z osobną decyzją: klucz ML-DSA-44 właściciela dla `register_agent` i `kill`; program wdrożony jako immutable.
