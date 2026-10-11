# 005: Klucz ML-DSA-44 właściciela aktywuje każdego agenta

Data: 2026-10-11

Zastępuje zdanie decyzji 004: „Klucz ML-DSA-44 agenta wiąże z właścicielem zwykły podpis Ed25519 transakcji
`register_agent`”. Reszta decyzji 004 obowiązuje.

## Kontekst

`register_agent` przyjmował tylko podpis Ed25519 właściciela. Komputer kwantowy, który odzyska klucz prywatny Ed25519
z publicznego, mógłby więc zarejestrować w imieniu właściciela fałszywego agenta z własnym kluczem ML-DSA-44 i
podpisywać jego kroki. Nie przejąłby istniejącego agenta ani nie wznowiłby zatrzymanego, ale łańcuch pokazywałby
historię decyzji „agenta właściciela”, której właściciel nie zatwierdził.

## Decyzja

- Właściciel ma własny klucz ML-DSA-44. `register_owner` przygotowuje go raz na portfel w koncie `OwnerKey`
  (20 552 B) i zapisuje jego adres w PDA `OwnerRecord` o seedach `["owner", owner]`. `OwnerRecord` powstaje przez
  `init`, więc drugiego klucza dla tego samego portfela nie da się zarejestrować ani podmienić.
- `register_agent` tworzy agenta w stanie `Pending`. W tym stanie program odrzuca każdy krok (`AgentPending`).
- `activate_agent` przyjmuje podpis ML-DSA-44 właściciela nad adresem agenta (wiadomość z tagiem 3 i licznikiem 0,
  kontekst `onchain-agent-guard:v1`), sprawdza go kluczem z `OwnerRecord` właściciela agenta i ustawia `Active`.
  Nie wymaga podpisu portfela: autoryzacją jest podpis ML-DSA-44, opłatę może zapłacić ktokolwiek.
- Sekretny klucz ML-DSA-44 właściciela leży na serwerze obok portfela właściciela (`OWNER_MLDSA_FILE`), bo żaden
  portfel nie podpisuje jeszcze ML-DSA, a na devnecie właścicielem i tak jest portfel serwera.

## Uzasadnienie

### Dwie transakcje, nie jedna

Jedna transakcja `register_agent` z kluczem publicznym agenta (1312 B) i podpisem właściciela (2420 B) ma około
4190 B, więcej niż 4096 B transakcji V1. Potrzebowałaby też około 1,36 mln z 1,4 mln CU: przygotowanie klucza to
około 1,09 mln, weryfikacja podpisu około 0,26 mln. Rejestracja zostaje więc taka jak była, a aktywacja jest osobną
transakcją wielkości `resume` (zmierzone w Mollusk: `register_owner` 1 092 362 CU, `activate_agent` 263 642 CU).
Adres agenta jest znany przed pierwszą transakcją, więc właściciel podpisuje go od razu i obie idą jedna po drugiej.

### Klucz właściciela przygotowany raz, w osobnym koncie

Weryfikacja on-chain potrzebuje przygotowanego klucza: przygotowanie kosztuje około 1,09 mln CU, a przygotowany klucz
zajmuje 20,5 KB. Klucz przekazywany w każdej aktywacji nie zmieściłby się w limicie CU. Osobny typ `OwnerKey` (inny
dyskryminator niż `AgentKey`) sprawia, że konta klucza agenta nie da się podać jako klucza właściciela.

### Co nadal zależy od Ed25519

- Pierwsze `register_owner` danego portfela: kto zarejestruje klucz pierwszy, ten go ma. Robimy to teraz, przed
  Q-day; potem sfałszowany podpis Ed25519 nie podmieni klucza właściciela i nie aktywuje agenta.
- `kill`: celowo tylko Ed25519, żeby właściciel mógł zatrzymać agenta zwykłym portfelem (README, „What is
  post-quantum here”). Atakujący kwantowy może agenta zatrzymać, ale nie wznowić ani aktywować.
- Program na devnecie, dopóki ma klucz aktualizacji Ed25519. Wdrożenie z `--final` jest ostatnim krokiem, po
  wszystkich innych zmianach programu: później każda poprawka wymaga nowego adresu programu i ponownej rejestracji
  agentów.

### Agenci sprzed tej zmiany

Program zaktualizowano w miejscu (`BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`), a `sentinel-01` i `tick-01`
zarejestrowano ponownie z aktywacją. Ich poprzednie konta zostają na łańcuchu jako `Active` bez zatwierdzenia
kluczem właściciela:

- `sentinel-01`: agent `7iin1WNsaquzuVDz9gC24fcsQLfaaxvhnTUu9okot7YL`, klucz `76qLccCyWwwAsGD52G1LLT8fN6doXGQvXFyU44gKv3jy`
- `tick-01`: agent `BF8MdAhmX8f8myq1p84sN2RZHsRZsfK9LAw6ihYMkPgN`, klucz `CA61y1mTZQ6CSgv4iNAPYHHV16BoYAcdcb2xRBK72nqs`

Ich pliki leżą lokalnie w `.devnet/legacy-2026-10-11/`; serwer ich nie uruchamia.

Projekt: `docs/superpowers/specs/2026-10-11-owner-pq-key-design.md`.
