# Zasady repozytorium

## Struktura Dokumentacji Technicznej

```
.
|-- README.md             punkt wejścia: czym jest projekt i jak go uruchomić
|-- AGENTS.md             zasady repozytorium
|-- spec/                 specyfikacja i opis projektu, źródło prawdy
|   `-- decisions/        obowiązujące decyzje i ich uzasadnienie
`-- docs/                 materiały wspierające, nie definiują projektu
    |-- plan/             kolejność i organizacja prac
    |-- research/         źródła i analizy
    |-- prompts/          instrukcje dla agentów
    |-- tasks/            zadania
    `-- output/           wyniki i archiwum przebiegów pracy, w tym zastąpione decyzje
```

### Co trafia do `spec/`

- Opis architektury i przegląd całego projektu, jak `ARCHITECTURE.md`.
- Opisy poszczególnych aspektów systemu, gdy wyrastają z opisu architektury.
- Diagramy.
- Decyzje, w `spec/decisions/`.

Plany, notatki robocze, instrukcje, zadania należą do `docs/`.

### Zasady

- `README.md` jest punktem wejścia do projektu: mówi, czym on jest i jak go uruchomić.
- `spec/` opisuje projekt i jest jedynym źródłem prawdy o nim.
- `spec/decisions/` zawiera tylko obowiązujące decyzje i ich uzasadnienie. Decyzji się nie edytuje: gdy nowa jej przeczy, nowa ją zastępuje, zastąpiona może trafić do archiwum w `docs/output/`.
- `docs/` wspiera pracę, ale nie definiuje projektu.

## Jakość kodu

- Przed otwarciem PR zielone są: `bun run check`, `bun run lint`, `bun test`.
- Zmiana nie wprowadza nowych błędów svelte-check ani Biome; ostrzeżenia w plikach, których dotyka, usuwa przy okazji.
- Biome tylko lintuje; formatowania całego repozytorium nie robimy jednym commitem.
