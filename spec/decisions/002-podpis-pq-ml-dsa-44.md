# 002: ML-DSA-44 jako podpis post-kwantowy, weryfikowany on-chain

Data: 2026-10-09

## Kontekst

Ochrona przed komputerem kwantowym ma sens tylko wtedy, gdy podpis post-kwantowy sprawdza sam program on-chain. Jeśli sprawdza go wyłącznie serwer, atakujący z odzyskanym kluczem Ed25519 wyśle transakcję prosto do programu i serwer pominie. Do wyboru były trzy podpisy z rodziny NIST: Falcon-512, ML-DSA-65 i ML-DSA-44. Od 15.09.2026 Solana przyjmuje transakcje v1 do 4096 B, co po raz pierwszy mieści podpisy ML-DSA.

## Decyzja

- Podpisy **ML-DSA-44** (standard NIST FIPS 204, wariant z SHAKE) weryfikuje **on-chain** sam program Solany, a nie serwer.
- Klucz publiczny agenta zapisuje się raz, przy rejestracji, w koncie programu, od razu w postaci przygotowanej do weryfikacji. Każda kolejna transakcja niesie już tylko podpis.
- Podpis z biblioteki `@noble/post-quantum` sprawdza w programie biblioteka `solana-ml-dsa`; obie strony używają tego samego context string (FIPS 204).

## Uzasadnienie

- **Ostateczny standard.** ML-DSA jest standardem NIST od 2024 roku. Falcon (FN-DSA, FIPS 206) jest wciąż projektem, a dzisiejsze implementacje Falcona nie są zgodne z tym, co FIPS 206 ostatecznie opisze.
- **Bezpieczne podpisywanie.** Podpisy składa strona agenta, off-chain. ML-DSA liczy wyłącznie na liczbach całkowitych, więc łatwo go zaimplementować w stałym czasie. Podpisywanie Falcona opiera się na liczbach zmiennoprzecinkowych i próbkowaniu z rozkładu Gaussa; ma udokumentowane ataki side-channel, przed którymi nie ma dziś zadowalającej ochrony.
- **Sprawdzona zgodność.** Podpis wygenerowany w `@noble/post-quantum` przechodzi weryfikację w programie, w testach i na devnecie (`spikes/mldsa44-dilithium-noble-compat`, `spikes/pq-verify-anchor`).
- **Mieści się w jednej transakcji.** Weryfikacja kosztuje około 260 tys. z limitu 1,4 mln compute units (CU), a transakcja ma około 2,7 KB przy limicie 4096 B.
- **Spójność.** Ta sama biblioteka dostarcza ML-KEM, którego projekt używa do szyfrowania.

## Odrzucone

- **Falcon-512.** Jego zalety są realne: podpis ma 666 B, weryfikacja kosztuje około 172-182 tys. CU, mieści się w zwykłej transakcji, a sama Solana rozważa go jako podpis protokołu. Przegrywa na niezakończonej standaryzacji i trudnym bezpiecznym podpisywaniu. Zostaje planem awaryjnym; działający spike jest w `spikes/falcon-noble-compat`.
- **ML-DSA-65.** Nie ma weryfikatora dla programów Solany, a podpis (3309 B) razem z kluczem (1952 B) nie mieści się w jednej transakcji.
- **Klucz przesyłany w każdej transakcji.** Przygotowanie klucza przy każdej weryfikacji zabiera prawie cały limit CU.

## Konsekwencje

- Konto na klucz tworzy klient, bo z programu nie da się przez CPI utworzyć konta większego niż 10 KiB.
- Transakcje z podpisem wymagają formatu v1, czyli `@solana/kit` w wersji obsługującej v1.
- Biblioteka `solana-ml-dsa` jest używana świadomie przed jej audytem; jej rozwój i audyt są śledzone, a do tego czasu poprawność weryfikacji zabezpieczają testy projektu.
- Upgrade authority programu to również klucz Ed25519, dlatego wersja pokazywana jako odporna kwantowo jest wdrażana jako immutable program, z odebranym upgrade authority.
