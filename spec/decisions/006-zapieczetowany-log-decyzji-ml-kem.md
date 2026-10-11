# 006: Zapieczętowany log decyzji: ML-KEM-768 do właściciela, AES-256-GCM per agent

Data: 2026-10-11

## Kontekst

Łańcuch przechowuje tylko SHA-256 każdej decyzji. Pełne decyzje leżą na serwerze w `.devnet/fleet/<id>/decisions.jsonl`,
dotąd jawnym tekstem. Kopia tego pliku (backup, udostępniony katalog, wyciek) zdradzała całą historię agenta.

## Decyzja

- Właściciel ma parę kluczy ML-KEM-768 (`OWNER_MLKEM_FILE`, domyślnie `.devnet/owner-mlkem.json`).
- Każdy agent floty dostaje pieczęć (`seal.json`): kapsułkę ML-KEM-768 do klucza publicznego właściciela i klucz danych
  AES-256 = HKDF-SHA256(wspólny sekret, `onchain-agent-guard:decision-log:v1`).
- Każdy wiersz logu to AES-256-GCM pod kluczem danych, z losowym nonce i licznikiem kroku jako AAD. Jawny jest tylko
  licznik.
- Hash na łańcuchu liczony jest z jawnej decyzji, jak dotąd. Program i transakcje się nie zmieniają.
- Audyt (`scripts/audit.ts`) odzyskuje klucz danych z kapsułki kluczem prywatnym właściciela, nie bierze kopii serwera.

## Uzasadnienie

- **Odporność na „zbierz teraz, odszyfruj później”.** Sam plik `decisions.jsonl` jest nieczytelny bez klucza danych, a
  AES-256 zachowuje około 128 bitów bezpieczeństwa wobec algorytmu Grovera.
- **Rola ML-KEM-768.** Właściciel otwiera log własnym kluczem prywatnym, bez kopii klucza danych z serwera, a to
  opakowanie pozostaje bezpieczne po Q-day.
- **Serwer musi czytać własny log.** Strona pokazuje decyzje, Sentinel po restarcie wznawia stan skarbca z ostatniej
  decyzji, a akceptacja propozycji szuka jej w logu. Dlatego serwer trzyma klucz danych w `seal.json`, a szyfrowanie nie
  chroni przed przejęciem serwera ani przed kopią całego katalogu agenta (z `seal.json`), tylko przed kopią samego logu.
- **Łańcuch nic nie zdradza.** Hash z jawnego tekstu nie mówi, czy i jak log jest szyfrowany, a podmieniony wiersz i tak
  nie przejdzie audytu.
- Ta decyzja urzeczywistnia zdanie z decyzji 002 o ML-KEM używanym do szyfrowania.

## Odrzucone

- **Log tylko do zapisu (kapsułka przy każdym wierszu, serwer bez klucza).** Chroniłby historię także przed przejętym
  serwerem, ale serwer nie mógłby czytać ostatniej decyzji: Sentinel nie wznowiłby stanu, akceptacje i strona by nie
  działały bez osobnego, jawnego stanu bieżącego.
- **Szyfrogram on-chain (SPL Memo).** Większe transakcje i opłaty, a zysk dla pokazu niewielki.
- **Nowa kapsułka przy każdym restarcie serwera.** Czystsze, ale dzieli log na segmenty i komplikuje audyt.
- **Szyfrowanie plików kluczy hasłem.** Pytanie o hasło przy każdym starcie serwera psuje pokaz.
