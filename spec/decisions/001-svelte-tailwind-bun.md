# 001: Svelte i Tailwind CSS na froncie, Bun jako środowisko

Data: 2026-10-10

## Decyzja

- Frontend powstaje w **Svelte** (SvelteKit) ze stylami w **Tailwind CSS**.
- Środowiskiem uruchomieniowym, menedżerem pakietów i narzędziem do testów jest **Bun**.

## Uzasadnienie

- **Względy praktyczne.** Komponenty Svelte są bliskie zwykłemu HTML, CSS i JavaScriptowi, a Tailwind trzyma style tuż przy znacznikach. Interfejs da się zbudować szybko i bez rozbudowanej konfiguracji.
- **Code review i ręczne poprawki.** Taki kod łatwo przeczytać w całości, ocenić w code review i poprawić ręcznie, także wtedy, gdy pierwotnie napisał go agent.
- **Jedno narzędzie zamiast kilku.** Bun uruchamia aplikację, instaluje zależności i wykonuje testy, więc w projekcie jest jeden zestaw komend.

## Odrzucone

- **Node.js z npm.** Wymaga osobnych narzędzi do uruchamiania, instalacji i testów tam, gdzie Bun daje jedno.
