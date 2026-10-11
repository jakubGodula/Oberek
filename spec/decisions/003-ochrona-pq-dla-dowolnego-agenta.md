# 003: Projekt jako warstwa ochrony post-kwantowej dla dowolnego agenta

Data: 2026-10-10

## Kontekst

Wcześniejsze wersje dokumentacji opisywały system przez pryzmat konkretnych agentów. Rdzeniem projektu jest jednak mechanizm ich zabezpieczenia: weryfikacja podpisów post-kwantowych on-chain oraz stan agenta odzwierciedlony na blockchainie.

## Decyzja

Projekt jest budowany jako warstwa, do której klient podłącza własnego agenta, aby zabezpieczyć go post-kwantowo. Dla zarejestrowanego agenta system zapewnia:

- **Zapis decyzji, którego nie da się podrobić.** Każda decyzja agenta trafia on-chain jako hash podpisany ML-DSA-44 i zweryfikowany przez program, w ustalonej kolejności, którą pilnuje licznik.
- **Kontrolę właściciela.** Właściciel może agenta zatrzymać w każdej chwili; wznowienie wymaga dodatkowo podpisu post-kwantowego.
- **Proste podłączenie.** Agent łączy się z systemem przez krótki kontrakt HTTP i nie musi znać ani Solany, ani kryptografii.

Agenci dostarczani z projektem służą do pokazu i jako przykład integracji. Nie są produktem.

## Uzasadnienie

- **Tak system już działa.** Program nie zależy od konkretnego agenta, a konto agenta wyprowadza się z właściciela i klucza agenta, więc każdy klient może zarejestrować własnych agentów. Przykładowi agenci działają jako osobne procesy i nie importują niczego z serwera.
- **Szersza wartość.** Ten sam mechanizm zabezpiecza każdego agenta, niezależnie od tego, co agent robi i jak podejmuje decyzje.

## Odrzucone

- **Projekt jako jeden konkretny agent.** Wiązałby wartość projektu z dziedziną tego agenta, a nie z mechanizmem ochrony.
