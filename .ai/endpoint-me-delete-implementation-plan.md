# API Endpoint Implementation Plan: DELETE /api/v1/me

## 1. Przegląd punktu końcowego

Endpoint `DELETE /api/v1/me` wykonuje trwałe usunięcie konta aktualnie zalogowanego użytkownika wraz ze wszystkimi danymi podrzędnymi. W tej architekturze oznacza to usunięcie rekordu z `auth.users` przez zaufaną ścieżkę serwerową, po czym PostgreSQL wykona kaskadowe usunięcie rekordów z `public.profiles`, `public.user_preferences` i `public.inspections` dzięki istniejącym relacjom `ON DELETE CASCADE`.

Zakres odpowiedzialności endpointu:

- potwierdzenie aktywnej sesji Supabase utrzymywanej w cookie SSR,
- zwalidowanie payloadu z literalem `DELETE_MY_ACCOUNT`,
- wymuszenie zabezpieczeń dla operacji destrukcyjnej: rate limit oraz walidacja `Origin` / `Referer`,
- uruchomienie uprzywilejowanego usunięcia użytkownika w Supabase Auth,
- wyczyszczenie serwerowej sesji / ciasteczek auth w odpowiedzi HTTP,
- zwrócenie standardowej koperty sukcesu `DeleteCurrentUserResponseDto`.

Docelowa lokalizacja implementacji:

- `server/api/v1/me.delete.ts` jako cienki handler HTTP,
- `server/utils/services/delete-current-user-account.ts` jako serwis orkiestrujący delete flow,
- `server/utils/auth/get-required-user-id.ts` albo podobny helper auth do odczytu bieżącego użytkownika,
- `server/utils/security/assert-mutation-origin.ts` dla ochrony CSRF przy cookie auth,
- `server/utils/security/rate-limit.ts` albo równoważny guard dla endpointów destrukcyjnych,
- `shared/contracts/current-user.ts` albo `shared/contracts/account.ts` dla kontraktu Zod tego endpointu.

Najważniejsza decyzja architektoniczna: nie wykonywać ręcznych `DELETE` na tabelach `public.*`, ponieważ aktualny model danych już definiuje poprawne kaskady z `auth.users`. Root cause operacji to delete użytkownika w Supabase Auth, a nie manualne czyszczenie wielu tabel.

## 2. Szczegóły żądania

- Metoda HTTP: `DELETE`
- URL: `/api/v1/me`
- Auth: wymagana ważna sesja Supabase z cookie SSR
- Query parameters: brak
- Route params: brak
- Request body:

```json
{
  "confirmation": "DELETE_MY_ACCOUNT"
}
```

### Parametry wejściowe

- Wymagane:
  - aktywny uwierzytelniony użytkownik po stronie serwera,
  - `confirmation` o dokładnej wartości `DELETE_MY_ACCOUNT`.
- Opcjonalne: brak.

### Wymagane typy DTO i modele command

Istniejące typy z `app/types.ts`:

- `DeleteCurrentUserCommand`
- `DeleteCurrentUserResultDto`
- `DeleteCurrentUserResponseDto`
- `ApiMetaDto`
- `ApiSuccessResponseDto<TData>`
- pomocniczo `ApiErrorDto` i `ApiErrorResponseDto`, jeżeli repo utrzymuje wspólną kopertę błędów dla `/api/v1`

Rekomendowane nowe kontrakty runtime w `shared/` oparte o Zod 4:

- `DeleteCurrentUserCommandSchema`
- `DeleteCurrentUserResultSchema`
- `DeleteCurrentUserResponseSchema`
- opcjonalnie `DeleteCurrentUserErrorSchema` albo wspólne schematy błędów, jeżeli zespół buduje pełną kontraktową warstwę response envelopes

Typy TypeScript powinny być wyprowadzane z tych schematów przez `z.infer`, a istniejące interfejsy z `app/types.ts` mogą pozostać jako warstwa kompatybilności albo zostać zastąpione aliasami do typów schema-derived.

### Walidacja wejścia

Walidacja na granicy handlera powinna obejmować:

- `readValidatedBody(event, DeleteCurrentUserCommandSchema)` z `strictObject`, aby odrzucać nieznane pola,
- literalne sprawdzenie `confirmation === "DELETE_MY_ACCOUNT"`,
- odrzucenie pustego, nie-JSON-owego lub nieobiektowego body jako `400 Bad Request`,
- weryfikację obecności uwierzytelnionego `userId` po stronie serwera,
- walidację żądania state-changing pod kątem `Origin` i `Referer`, ponieważ model auth jest cookie-based,
- sprawdzenie niskiego limitu częstotliwości dla operacji destrukcyjnych przed wykonaniem delete.

Endpoint nie przyjmuje query ani route params, więc nie ma potrzeby użycia `getValidatedQuery` ani `getValidatedRouterParams`, ale handler powinien jawnie ignorować wszelkie nieobsługiwane parametry i nie opierać się na danych pochodzących od klienta poza `confirmation`.

## 3. Szczegóły odpowiedzi

### Sukces: `200 OK`

Po poprawnym usunięciu użytkownika odpowiedź powinna mieć postać:

```json
{
  "data": {
    "deleted": true,
    "signedOut": true
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

Znaczenie pól:

- `deleted: true` oznacza, że uprzywilejowana operacja usunięcia `auth.users` zakończyła się powodzeniem,
- `signedOut: true` oznacza, że odpowiedź usunęła lokalny stan sesji HTTP, tak aby klient nie zachował nieaktualnych cookie auth,
- `meta.requestId` pochodzi z request context albo współdzielonego helpera meta,
- `meta.timestamp` powinien być generowany po stronie serwera jako ISO 8601 UTC.

### Błędy oczekiwane

- `400 Bad Request`: brak `confirmation`, niepoprawny literal, nieprawidłowy JSON albo błędny format payloadu,
- `401 Unauthorized`: brak ważnej sesji albo brak możliwości ustalenia bieżącego użytkownika,
- `409 Conflict`: flow delete nie może zostać zakończony bezpiecznie mimo poprawnego żądania i aktywnej sesji,
- `429 Too Many Requests`: przekroczony limit dla destrukcyjnych operacji konta,
- `500 Internal Server Error`: nieoczekiwany błąd infrastrukturalny lub błąd implementacji nieobjęty kontrolowanym mapowaniem.

### Mapowanie statusów do realnych scenariuszy

- `400` powinno być zarezerwowane dla błędów wejścia, nie dla błędów auth ani Supabase Admin API.
- `401` powinno być zwracane zanim rozpocznie się jakakolwiek operacja uprzywilejowana.
- `409` jest właściwe, gdy serwer zna użytkownika i żądanie jest poprawne, ale nie może bezpiecznie sfinalizować usunięcia, na przykład gdy wywołanie `auth.admin.deleteUser(...)` kończy się błędem domenowym albo stan auth jest niespójny.
- `500` jest fallbackiem dla sytuacji nieprzewidzianych i nie powinno wyciekać z surowymi detalami Supabase.

## 4. Przepływ danych

### Logika wykonania

1. Żądanie trafia do `server/api/v1/me.delete.ts`.
2. Handler pobiera runtime config przez `useRuntimeConfig(event)`.
3. Handler uruchamia ochronę dla mutacji cookie-based:
   - walidacja `Origin` / `Referer`,
   - sprawdzenie rate limitu dla tego endpointu.
4. Handler parsuje body przez `readValidatedBody` i schemat Zod dla `DeleteCurrentUserCommand`.
5. Handler albo współdzielony helper auth ustala bieżącego użytkownika na podstawie sesji SSR, najlepiej przez helpery modułu `@nuxtjs/supabase` (`serverSupabaseUser(event)` dla identyfikacji użytkownika, ewentualnie `serverSupabaseClient(event)` jeśli potrzebny jest kontekst sesji).
6. Jeśli użytkownik nie istnieje albo nie ma wiarygodnego `user.id`, handler zwraca `401 Unauthorized`.
7. Handler wywołuje serwis `deleteCurrentUserAccount`, przekazując `event`, `userId`, `requestId` i ewentualnie znormalizowany kontekst audytowy.
8. Serwis tworzy uprzywilejowanego klienta Supabase przez `serverSupabaseServiceRole(event)`.
9. Serwis wywołuje `supabase.auth.admin.deleteUser(userId, false)`, aby wykonać hard delete rekordu z `auth.users`.
10. Po sukcesie PostgreSQL automatycznie usuwa rekordy z `public.profiles`, `public.user_preferences` i `public.inspections` na podstawie istniejących FK `ON DELETE CASCADE`.
11. Handler czyści sesję HTTP. Najbezpieczniej zrobić to przez jawne wygaszenie Supabase SSR cookies z użyciem `config.public.supabase.cookiePrefix` i `cookieOptions`, zamiast polegać wyłącznie na wtórnym wywołaniu auth, które może być mniej przewidywalne po usunięciu użytkownika.
12. Handler buduje `DeleteCurrentUserResponseDto` z `deleted: true` i `signedOut: true` oraz zwraca `200 OK`.
13. Sukces i błędy są logowane strukturalnie z `requestId` i `userId`, bez danych wrażliwych.

### Podział odpowiedzialności

Handler `server/api/v1/me.delete.ts`:

- odpowiada za walidację HTTP,
- uruchamia auth guard, origin guard i rate limit,
- wywołuje serwis domenowy,
- mapuje oczekiwane błędy na kody HTTP,
- czyści ciasteczka sesji i buduje finalny response envelope.

Serwis `server/utils/services/delete-current-user-account.ts`:

- izoluje logikę uprzywilejowanego usuwania użytkownika,
- używa tylko serwerowego klienta service-role,
- hermetyzuje mapowanie błędów Supabase Admin API do błędów domenowych endpointu,
- nie zajmuje się formatowaniem odpowiedzi HTTP.

Wspólne helpery:

- helper auth ustala `userId` bez przyjmowania jakichkolwiek identyfikatorów od klienta,
- helper meta buduje `requestId` i `timestamp`,
- helper security waliduje `Origin` / `Referer`,
- helper rate-limit udostępnia niski burst limit dla delete flow.

### Dlaczego nie SQL function jako pierwszy wybór

Prywatna funkcja SQL nie jest tu konieczna do samego usuwania danych aplikacyjnych, ponieważ operacja źródłowa dotyczy `auth.users`, a to i tak wymaga ścieżki uprzywilejowanej po stronie serwera / Supabase Admin API. Najprostszy i najbardziej zgodny ze schematem flow to:

- zweryfikować użytkownika po stronie serwera,
- wywołać delete user w Supabase Auth,
- zaufać kaskadom FK dla danych `public.*`.

Jeżeli zespół później wprowadzi prywatny SQL helper do audytu lub preflight checks, nie powinno to zmieniać kontraktu HTTP endpointu.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Endpoint musi działać wyłącznie dla aktualnie zalogowanego użytkownika ustalonego po stronie serwera.
- Nie wolno przyjmować `userId` z body, query, headers ani cookies zarządzanych ręcznie przez klienta.
- Użycie `serverSupabaseServiceRole(event)` musi pozostać zamknięte w `server/` i nie może być eksportowane do kodu klienta.

### Ochrona przed CSRF i nadużyciami

- Ponieważ sesja opiera się o cookie SSR, stan-zmieniające żądanie musi weryfikować `Origin` i `Referer`.
- Endpoint powinien mieć bardzo niski burst rate limit na poziomie aplikacji oraz, jeśli infrastruktura na to pozwala, dodatkowe ograniczenie na edge.
- Literat `DELETE_MY_ACCOUNT` jest minimalnym świadomym potwierdzeniem akcji i powinien być sprawdzany po stronie serwera niezależnie od walidacji formularza w UI.

### Sekrety i granice uprzywilejowania

- Service-role / secret key może być użyty wyłącznie w Nitro server route albo serwisie w `server/utils`.
- Handler powinien wywoływać `useRuntimeConfig(event)`, aby poprawnie odczytać `NUXT_SUPABASE_SECRET_KEY` lub równoważny sekret środowiskowy.
- Nie wolno logować service keys, cookies, access tokenów ani pełnych odpowiedzi z Supabase Admin API.

### Integralność delete flow

- Implementacja musi używać hard delete, nie soft delete, aby zachować zgodność ze specyfikacją API i planem bazy danych.
- Nie należy wykonywać dodatkowych ręcznych delete na `profiles`, `user_preferences` ani `inspections`, ponieważ zwiększa to ryzyko częściowo wykonanej operacji i dubluje reguły już zakodowane w FK.
- Po udanym delete auth użytkownika handler powinien jawnie wygasić SSR cookies auth, aby klient nie utrzymywał pozornej sesji.

### Prywatność i cache

- Odpowiedź endpointu nie może być publicznie cache'owana.
- Logowanie powinno ograniczać się do metadanych technicznych: `requestId`, `userId`, wynik operacji, typ błędu, status HTTP.
- Nie zapisywać treści request body poza informacją, czy `confirmation` przeszło walidację.

## 6. Obsługa błędów

### Scenariusze błędów i statusy

| Scenariusz | Status | Kod błędu | Uwagi implementacyjne |
| --- | --- | --- | --- |
| Brak body lub body nie jest obiektem JSON | `400` | `VALIDATION_ERROR` | Zwrócić przewidywalny błąd wejścia. |
| `confirmation` nie istnieje lub ma inną wartość | `400` | `INVALID_CONFIRMATION` | Komunikat powinien jasno wymagać `DELETE_MY_ACCOUNT`. |
| Brak aktywnej sesji | `401` | `UNAUTHORIZED` | Nie wykonywać żadnych operacji uprzywilejowanych. |
| Nie można ustalić `userId` z sesji | `401` | `UNAUTHORIZED` | Traktować jako brak wiarygodnej tożsamości. |
| Limit wywołań przekroczony | `429` | `RATE_LIMITED` | Użyć niskiego limitu per user / session / IP. |
| Supabase Admin API odrzuca delete albo zwraca stan niespójny z oczekiwaniami | `409` | `ACCOUNT_DELETE_CONFLICT` | Flow nie może zostać zakończony bezpiecznie. |
| Brak klucza service-role lub błąd inicjalizacji uprzywilejowanego klienta | `500` | `INTERNAL_SERVER_ERROR` | To błąd konfiguracji środowiska. |
| Nieoczekiwany wyjątek w handlerze lub serwisie | `500` | `INTERNAL_SERVER_ERROR` | Nie zwracać surowych komunikatów bibliotek. |

### Strategia mapowania błędów

- Błędy walidacyjne mapować na `400` bez rzucania surowego `ZodError` do klienta.
- Błędy auth mapować na `401` przez współdzielony helper `createError`.
- Błędy kontrolowane z serwisu delete mapować na `409`, gdy request jest poprawny, ale delete flow nie daje gwarancji bezpiecznego zakończenia.
- Wszystkie inne wyjątki traktować jako `500` i logować z kontekstem diagnostycznym.

### Rejestrowanie błędów

Aktualny plan bazy danych nie definiuje osobnej tabeli błędów ani tabeli audytowej dla takich zdarzeń, więc zapis błędów do bazy nie ma obecnie podstaw modelowych. Dla tego endpointu zalecane jest:

- użycie strukturalnych logów aplikacyjnych w Nitro / Vercel,
- korzystanie z logów Supabase dla błędów auth admin,
- logowanie sukcesu i porażki delete flow z `requestId`, `userId`, statusem i kategorią błędu.

Jeżeli w przyszłości powstanie tabela audytowa, należy zapisywać jedynie metadane operacji destrukcyjnej, a nie pełne payloady czy dane sesji.

## 7. Wydajność

### Profil kosztu endpointu

Endpoint ma niski koszt operacyjny:

- jedno sprawdzenie sesji / użytkownika,
- jedna walidacja body,
- jedno wywołanie uprzywilejowanego `auth.admin.deleteUser`,
- automatyczne kaskady po stronie bazy.

Koszt usunięcia danych aplikacyjnych jest ograniczony przez aktualną regułę biznesową maksymalnie `2` inspekcji na konto, więc delete flow ma naturalnie mały i przewidywalny zakres danych podrzędnych.

### Zalecenia optymalizacyjne

- nie wykonywać preflight odczytów z `profiles`, `user_preferences` i `inspections`, jeśli nie są potrzebne do bezpieczeństwa lub diagnostyki,
- nie wykonywać wieloetapowych ręcznych delete SQL, skoro pojedyncza operacja na `auth.users` uruchamia poprawne kaskady,
- rate limit sprawdzać przed inicjalizacją kosztowniejszego flow uprzywilejowanego,
- helpery auth i meta utrzymać lekkie i współdzielone z innymi endpointami `/api/v1/me*`.

### Wydajność a niezawodność

Tutaj ważniejsza od mikrooptymalizacji jest przewidywalność flow destrukcyjnego. Lepsza jest jedna jawna operacja admin + czyszczenie cookie niż bardziej złożona sekwencja lokalnych delete, która zwiększa ryzyko stanów częściowych.

## 8. Kroki implementacji

1. Dodać moduł kontraktów Zod w `shared/` dla `DeleteCurrentUserCommand`, `DeleteCurrentUserResultDto` i response envelope tego endpointu.
2. Utworzyć współdzielony helper auth w `server/utils/auth/`, który ustala bieżącego użytkownika po sesji SSR i kończy się `401`, gdy użytkownik nie jest zalogowany.
3. Dodać helper meta do generowania `requestId` i `timestamp`, jeśli repo nie ma jeszcze wspólnego mechanizmu dla kopert API.
4. Dodać helper bezpieczeństwa dla mutacji cookie-based: walidacja `Origin` / `Referer` oraz niski burst rate limit dla `DELETE /api/v1/me`.
5. Zaimplementować serwis `delete-current-user-account.ts`, który:
   - tworzy klienta przez `serverSupabaseServiceRole(event)`,
   - wywołuje `auth.admin.deleteUser(userId, false)`,
   - mapuje błędy Supabase na kontrolowane błędy domenowe endpointu.
6. Zaimplementować `server/api/v1/me.delete.ts` jako cienki handler, używając `useRuntimeConfig(event)`, `readValidatedBody`, helpera auth, helpera security i serwisu delete.
7. Dodać jawne czyszczenie Supabase SSR cookies po sukcesie delete, wykorzystując `config.public.supabase.cookiePrefix` oraz `cookieOptions`, aby odpowiedź mogła kontraktowo zwrócić `signedOut: true`.
8. Ujednolicić mapowanie błędów na koperty API dla statusów `400`, `401`, `409`, `429` i fallbackowego `500`.
9. Dodać testy dla krytycznych scenariuszy:
   - `200 OK` dla poprawnego requestu z aktywną sesją i prawidłowym `confirmation`,
   - `400` dla brakującego albo błędnego `confirmation`,
   - `401` dla braku sesji,
   - `429` dla przekroczonego limitu,
   - `409` gdy Supabase Admin API nie pozwala bezpiecznie dokończyć delete flow.
10. Zweryfikować manualnie na lokalnym środowisku Supabase, że usunięcie `auth.users` rzeczywiście kaskaduje dane z `public.profiles`, `public.user_preferences` i `public.inspections`, a klient po odpowiedzi nie posiada już ważnych cookies sesyjnych.