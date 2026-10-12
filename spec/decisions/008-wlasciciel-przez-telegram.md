# 008: Właściciel odpowiada agentom przez Telegram, nie przez Blinks

Data: 2026-10-12

## Kontekst

Właściciel miał zatwierdzać propozycje i zabijać agentów z Blinka (Solana Actions). Blinka nic nie renderuje: dial.to
jest wstrzymany, blinks.xyz nie działa, a X wymaga publicznego HTTPS i rejestracji przez dial.to. Endpoint Actions był
gotowy, ale nikt nie mógł go zobaczyć.

## Decyzja

- Bot Telegram (`bot/telegram`) jest osobnym procesem, jak agenci, i rozmawia z serwerem tylko przez HTTP. Co 3 s czyta
  `GET /api/agents` i wysyła właścicielowi: propozycję z treścią i przyciskami Accept, Reject, Kill; zabicie z Resume;
  wznowienie z Kill. `/agents` wypisuje flotę z przyciskami pasującymi do stanu agenta.
- Przyciski wołają te same endpointy co strona: `POST /api/agents/<id>/approval` i nowy `POST /api/agents/<id>/control`
  (`kill` / `resume`). Accept i Reject niosą licznik kroku propozycji z wiadomości (`accept:<id>:<licznik>`), a serwer
  odrzuca werdykt kodem 409, gdy czeka już inna propozycja; stara wiadomość nie zatwierdzi propozycji, której właściciel
  nie widział. Strona wysyła licznik tak samo.
- Działać może tylko czat `TELEGRAM_OWNER_CHAT_ID`; `/start` podaje każdemu jego id czatu.
- Ścieżka Blinks znika: `/api/actions/agent-action`, `actions.json`, transakcja Memo i zależność `@solana/actions`.

## Uzasadnienie

- **Działa z localhost.** Long polling nie potrzebuje publicznego adresu ani rejestracji; demo pokazuje prawdziwą
  wiadomość na telefonie.
- **Treść propozycji z agenta.** Bot pokazuje `summary`, które pisze agent, więc każdy agent z propozycją daje czytelną
  wiadomość bez kodu po stronie bota.

## Czego nie chroni

- Serwer podpisuje kill i resume własnym kluczem (`OWNER_KEYPAIR`), bez podpisu portfela. Na ścieżce bota jedyną
  bramką jest sprawdzenie czatu właściciela; strona nie ma żadnej.
- Stan krótszy niż jeden odczyt (3 s) nie trafia do wiadomości.

## Odrzucone

- **Własny renderer Blinka na stronie z Wallet Standard.** Dałby podpis portfela, ale to osobny podsystem, a Blink na
  własnej stronie nie wychodzi do mediów społecznościowych.
- **Blinks za publicznym adresem (VPS i domena).** Nie wskrzesza dial.to, od którego zależy rozwijanie Blinka na X.
