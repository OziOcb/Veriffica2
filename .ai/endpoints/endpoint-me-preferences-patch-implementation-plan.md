# API Endpoint Implementation Plan: PATCH /api/v1/me/preferences

## 1. Przegląd punktu końcowego

Endpoint `PATCH /api/v1/me/preferences` aktualizuje mutowalne ustawienia aplikacyjne aktualnie zalogowanego użytkownika w tabeli `public.user_preferences`. Jest to wąski, zaufany kontrakt serwerowy dla zmian ustawień współdzielonych między urządzeniami: `theme`, `fontScale` i `hideInspectionIntro`.

Zakres odpowiedzialności endpointu:

- potwierdzenie aktywnej sesji Supabase utrzymywanej w cookie SSR,
- walidacja częściowego payloadu `PATCH` i odrzucenie nieznanych pól,
- wymuszenie ochrony dla mutacji cookie-based przez walidację `Origin` / `Referer`,
- wykonanie aktualizacji tylko dla rekordu właściciela ustalonego po stronie serwera,
- zwrócenie kanonicznego stanu preferencji po zapisie w standardowej kopercie sukcesu.

Docelowa lokalizacja implementacji:

- `server/api/v1/me/preferences.patch.ts` jako cienki handler HTTP,
- `server/utils/services/update-current-user-preferences.ts` jako serwis orkiestrujący zapis,
- `server/utils/auth/get-required-user-id.ts` jako współdzielony helper auth,
- `server/utils/security/assert-mutation-origin.ts` jako ochrona CSRF dla cookie auth,
- `shared/contracts/current-user-preferences.ts` jako współdzielony kontrakt Zod dla request i response.

Najważniejsza decyzja architektoniczna: zapis ma iść przez zaufaną ścieżkę serwerową, a nie przez bezpośredni browser update tabeli. Jest to zgodne zarówno z planem API, jak i z planem bazy danych. Dodatkowo aktualny stan repo wymaga jawnej kontroli autoryzacji po stronie serwera, ponieważ migracja `20260501000100_disable_app_table_rls.sql` wyłącza RLS na `public.user_preferences`, mimo że polityki pozostają zdefiniowane w katalogu bazy.

## 2. Szczegóły żądania

- Metoda HTTP: `PATCH`
- URL: `/api/v1/me/preferences`
- Auth: wymagana ważna sesja Supabase z cookie SSR
- Query parameters: brak
- Route params: brak
- Request body: częściowy obiekt JSON z co najmniej jednym mutowalnym polem

### Parametry wejściowe

- Wymagane:
  - aktywny uwierzytelniony użytkownik ustalony po stronie serwera,
  - niepusty obiekt JSON zawierający co najmniej jedno z pól: `theme`, `fontScale`, `hideInspectionIntro`.
- Opcjonalne:
  - `theme`: `system | light | dark`,
  - `fontScale`: `small | medium | large`,
  - `hideInspectionIntro`: `boolean`.

Specyfikacja endpointu pokazuje przykład z kompletem trzech pól, ale istniejący model `PatchCurrentUserPreferencesCommand` w `app/types.ts` oraz semantyka `PATCH` sugerują częściową aktualizację. Plan implementacyjny powinien utrzymać tę semantykę: każde pole jest opcjonalne indywidualnie, ale payload jako całość nie może być pusty.

### Wymagane typy DTO i modele command

Istniejące typy z `app/types.ts`:

- `Theme`,
- `FontScale`,
- `UserPreferencesDto`,
- `PatchCurrentUserPreferencesCommand`,
- `ApiMetaDto`,
- `ApiSuccessResponseDto<TData>`,
- pomocniczo `ApiErrorDto` i `ApiErrorResponseDto`, jeśli repo utrzymuje wspólną kopertę błędów dla `/api/v1`.

Brakujące typy, które warto dodać do implementacji tego endpointu:

- `PatchCurrentUserPreferencesResultDto`,
- `PatchCurrentUserPreferencesResponseDto`.

Nie należy używać `UserPreferencesDto` jako bezpośredniego DTO odpowiedzi dla `PATCH`, ponieważ kontrakt odpowiedzi nie zawiera `createdAt`. Odpowiedź patcha powinna zwracać tylko:

- `userId`,
- `theme`,
- `fontScale`,
- `hideInspectionIntro`,
- `updatedAt`.

### Rekomendowany kontrakt runtime

Najmniejszy spójny zakres zmian w `shared/contracts/current-user-preferences.ts`:

- pozostawić istniejące `ThemeSchema` i `FontScaleSchema`,
- dodać `PatchCurrentUserPreferencesCommandSchema` jako `strictObject` z opcjonalnymi polami,
- dodać walidację „at least one field”,
- dodać `PatchCurrentUserPreferencesResultSchema`,
- dodać `PatchCurrentUserPreferencesResponseSchema`.

Przykładowe założenia kontraktowe:

- `theme` walidowane przez `ThemeSchema`,
- `fontScale` walidowane przez `FontScaleSchema`,
- `hideInspectionIntro` walidowane przez `z.boolean()`,
- nieznane pola odrzucane,
- pusty obiekt `{}` odrzucany jako `400 Bad Request`.

Typy TypeScript powinny być wyprowadzane z tych schematów przez `z.infer` i dopiero potem ewentualnie aliasowane w `app/types.ts`.

### Walidacja wejścia

Walidacja na granicy handlera powinna obejmować:

- `readValidatedBody(event, ...)` z użyciem `PatchCurrentUserPreferencesCommandSchema`,
- odrzucenie nieprawidłowego JSON albo body niebędącego obiektem jako `400`,
- odrzucenie pustego patcha jako `400`,
- odrzucenie nieznanych pól jako `400`,
- odrzucenie niepoprawnych enumów i typów jako `400`,
- ustalenie `userId` wyłącznie z sesji serwerowej, nigdy z request body.

Endpoint nie przyjmuje query ani route params, więc nie ma potrzeby użycia `getValidatedQuery` ani `getValidatedRouterParams`.

## 3. Szczegóły odpowiedzi

### Sukces: `200 OK`

Po poprawnym zapisie endpoint powinien zwrócić pełny kanoniczny stan mutowalnych preferencji, a nie tylko echo przesłanego patcha:

```json
{
  "data": {
    "userId": "uuid",
    "theme": "dark",
    "fontScale": "large",
    "hideInspectionIntro": true,
    "updatedAt": "2026-05-01T12:05:00Z"
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:05:00Z"
  }
}
```

Znaczenie pól:

- `data.userId` pochodzi z `public.user_preferences.user_id`,
- `data.theme` pochodzi z `public.user_preferences.theme`,
- `data.fontScale` pochodzi z `public.user_preferences.font_scale`,
- `data.hideInspectionIntro` pochodzi z `public.user_preferences.hide_inspection_intro`,
- `data.updatedAt` musi pochodzić z bazy po aktualizacji, nie z lokalnego zegara handlera,
- `meta.requestId` powinno być generowane na wejściu requestu,
- `meta.timestamp` powinno być generowane po stronie serwera jako ISO 8601 UTC.

### Zachowanie no-op

Jeśli klient wyśle wartości identyczne z już zapisanymi, endpoint nadal może zwrócić `200 OK` z aktualnym stanem kanonicznym. Zgodnie z zasadami domenowymi `updatedAt` nie powinno zmieniać się przy no-op. Plan implementacji może polegać na istniejącym triggerze `updated_at`, o ile helper `private.touch_updated_at()` nie aktualizuje znacznika czasu przy braku rzeczywistej zmiany wiersza.

### Błędy kontraktowe

Minimalny zestaw zgodny ze specyfikacją endpointu:

- `400 Bad Request` dla nieprawidłowego body, nieznanych pól, pustego patcha i błędnych enumów,
- `401 Unauthorized` dla braku ważnej sesji.

Dodatkowe błędy operacyjne, które są racjonalne w tej architekturze:

- `403 Forbidden` dla niepoprawnego `Origin` / `Referer`, jeśli endpoint używa istniejącego guardu mutacji,
- `500 Internal Server Error` dla naruszenia niezmiennika danych albo błędu zapisu do bazy.

`404 Not Found` nie jest oczekiwane dla poprawnie zaimplementowanego `PATCH /api/v1/me/preferences`, ponieważ endpoint adresuje wyłącznie rekord bieżącego użytkownika, który powinien być auto-provisionowany po utworzeniu konta.

## 4. Przepływ danych

### Logika wykonania

1. Żądanie trafia do `server/api/v1/me/preferences.patch.ts`.
2. Handler pobiera runtime config przez `useRuntimeConfig(event)` i generuje `requestId`.
3. Handler uruchamia `assertMutationOrigin(event)` przed wejściem w logikę zapisu.
4. Handler ustala `userId` przez `getRequiredUserId(event)` na podstawie sesji SSR.
5. Handler waliduje payload przez `readValidatedBody(event, ...)` i kontrakt Zod.
6. Handler wywołuje serwis `updateCurrentUserPreferences(event, userId, command, requestId)`.
7. Serwis buduje whitelistowany obiekt aktualizacji, mapując pola HTTP `camelCase` na kolumny bazy `snake_case` tylko wtedy, gdy dane pole zostało przekazane.
8. Serwis wykonuje pojedynczy zapis do `public.user_preferences`, ograniczony warunkiem `eq("user_id", userId)`.
9. Serwis zwraca zaktualizowany rekord w minimalnym zakresie kolumn potrzebnych do odpowiedzi.
10. Handler buduje `PatchCurrentUserPreferencesResponseDto` i zwraca `200 OK`.

### Rekomendowany podział odpowiedzialności

Handler `server/api/v1/me/preferences.patch.ts`:

- odpowiada za granicę HTTP,
- wykonuje auth guard i origin guard,
- parsuje request body,
- nie zawiera logiki SQL ani mapowania kolumn bazy,
- zwraca wyłącznie response envelope zgodny z kontraktem.

Serwis `server/utils/services/update-current-user-preferences.ts`:

- przyjmuje `event`, `userId`, zwalidowany command i `requestId`,
- buduje bezpieczny, whitelistowany payload zapisu,
- wykonuje jedną operację update po `user_id`,
- mapuje rekord bazy do DTO odpowiedzi,
- loguje błędy z kontekstem domenowym.

Wspólna warstwa kontraktów `shared/contracts/current-user-preferences.ts`:

- pozostaje źródłem prawdy dla request schema i response schema,
- współdzieli enumy z endpointem `GET /api/v1/me/preferences`,
- zmniejsza ryzyko rozjazdu między testami, handlerem i frontendem.

### Wybór ścieżki zapisu

Rekomendacja dla obecnego stanu repo: użyć zaufanego klienta backendowego do zapisu, a nie klienta sesyjnego.

Uzasadnienie:

- plan bazy i komentarze migracji mówią, że aktualizacje preferencji mają przechodzić przez „trusted narrow contract”,
- RLS jest obecnie wyłączone dla `public.user_preferences`, więc nie wolno opierać autoryzacji wyłącznie na politykach bazy,
- operacja jest prosta, jedno-wierszowa i nie wymaga jeszcze dedykowanej funkcji SQL.

Najbardziej pragmatyczna implementacja MVP:

- użyć `serverSupabaseServiceRole(event)` w serwisie,
- zawsze filtrować zapis po `user_id = authenticatedUser.id`,
- nigdy nie ufać żadnemu identyfikatorowi z payloadu,
- zwracać zaktualizowany rekord przez `select(...).single()`.

Opcjonalna ścieżka hardeningu na później:

- przenieść zapis do prywatnej funkcji SQL w schemacie `private`, jeśli zespół będzie chciał dodatkowo domknąć reguły write-path w bazie albo przygotować się na ponowne włączenie RLS.

### Dane i źródła prawdy

- `auth.users` i sesja SSR są źródłem prawdy dla tożsamości użytkownika,
- `public.user_preferences` jest jedynym źródłem prawdy dla preferencji aplikacyjnych,
- rekord `user_preferences` powinien istnieć zawsze dzięki triggerowi `private.handle_new_auth_user()` i backfillowi z migracji inicjalnej.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Endpoint musi działać wyłącznie dla aktualnie zalogowanego użytkownika ustalonego po stronie serwera.
- Nie wolno przyjmować `userId` z body, query, headerów ani cookies zarządzanych po stronie klienta.
- Ponieważ RLS na tabelach aplikacyjnych jest obecnie wyłączone, warunek `.eq("user_id", userId)` w trusted write path jest krytycznym elementem autoryzacji i nie może zostać pominięty.

### Ochrona przed CSRF

- Jest to endpoint mutujący oparty o cookie auth, więc powinien używać `assertMutationOrigin(event)` albo równoważnego guardu `Origin` / `Referer`.
- W aktualnym repo helper ten zwraca `403 Forbidden` dla niezgodnego pochodzenia żądania, co warto zaakceptować jako dodatkowy status bezpieczeństwa dla mutacji.

### Ograniczenie powierzchni zapisu

- Payload musi być ściśle whitelistowany do trzech pól: `theme`, `fontScale`, `hideInspectionIntro`.
- Nieznane pola powinny być odrzucane na granicy Zod, aby uniknąć mass assignment.
- Mapper serwisowy powinien przekładać tylko jawnie dostarczone pola na `snake_case` kolumn bazy.

### Sekrety i granice uprzywilejowania

- Jeżeli serwis używa service-role do zapisu, klucz uprzywilejowany musi pozostać wyłącznie w `server/`.
- Handler powinien zawsze wywoływać `useRuntimeConfig(event)`, aby Nitro respektowało env overrides.
- Logi nie mogą zawierać access tokenów, refresh tokenów, cookies ani pełnego payloadu sesji.

### Prywatność i cache

- Odpowiedź endpointu nie może być publicznie cache'owana.
- Endpoint nie powinien ujawniać `createdAt` ani innych pól spoza kontraktu odpowiedzi.
- Błędy zwracane do klienta nie mogą zawierać surowych komunikatów Supabase lub wewnętrznych szczegółów SQL.

## 6. Obsługa błędów

### Scenariusze błędów i statusy

| Scenariusz | Status | Kod błędu | Uwagi implementacyjne |
| --- | --- | --- | --- |
| Body nie jest poprawnym obiektem JSON | `400` | `VALIDATION_ERROR` | Odrzucić na granicy `readValidatedBody`. |
| Payload jest pusty (`{}`) | `400` | `EMPTY_PATCH` lub `VALIDATION_ERROR` | `PATCH` musi zawierać co najmniej jedno pole. |
| `theme` ma wartość spoza enum | `400` | `VALIDATION_ERROR` | Zgodnie ze specyfikacją endpointu. |
| `fontScale` ma wartość spoza enum | `400` | `VALIDATION_ERROR` | Zgodnie ze specyfikacją endpointu. |
| `hideInspectionIntro` nie jest booleanem | `400` | `VALIDATION_ERROR` | Typ musi być jawnie sprawdzony przez Zod. |
| Payload zawiera nieznane pola | `400` | `VALIDATION_ERROR` | `strictObject` zapobiega mass assignment. |
| Brak aktywnej sesji | `401` | `UNAUTHORIZED` | Nie wykonywać żadnej operacji zapisu. |
| `Origin` / `Referer` nie przechodzi walidacji | `403` | `FORBIDDEN` | Wynika z istniejącego helpera bezpieczeństwa. |
| Rekord `user_preferences` nie istnieje mimo zalogowanego usera | `500` | `PREFERENCES_INVARIANT_BROKEN` lub `INTERNAL_SERVER_ERROR` | To naruszenie niezmiennika auto-provisioningu. |
| Błąd zapisu do Supabase/Postgres | `500` | `INTERNAL_SERVER_ERROR` | Logować z `requestId` i `userId`. |
| Nieoczekiwany wyjątek w handlerze lub serwisie | `500` | `INTERNAL_SERVER_ERROR` | Nie zwracać surowych błędów bibliotek. |

### Strategia obsługi błędów

- Zod validation failures mapować na kontrolowane `400`, a nie przepuszczać surowego `ZodError` do klienta.
- `401` zwracać wyłącznie dla braku wiarygodnej tożsamości użytkownika.
- `500` traktować jako fallback dla naruszeń niezmienników i błędów infrastrukturalnych.
- `404` nie używać w tym endpointcie, bo nie ma tu adresowalnego zasobu po identyfikatorze klienta.

### Rejestrowanie błędów

Aktualny model bazy nie definiuje osobnej tabeli błędów ani audytu dla tego flow, więc zapis błędów do tabeli nie ma obecnie podstaw projektowych. Zalecane jest:

- logowanie strukturalne w Nitro / Vercel Logs,
- korzystanie z logów Supabase dla problemów po stronie bazy,
- logowanie tylko metadanych technicznych: `requestId`, endpoint, `userId`, typ błędu, status HTTP.

Minimalny zakres logowania:

- `requestId`,
- nazwa endpointu (`PATCH /api/v1/me/preferences`),
- `userId`, jeśli został ustalony,
- `errorType` typu `validation`, `auth`, `origin-check`, `preferences-update`, `unexpected`.

## 7. Wydajność

### Profil kosztu endpointu

Endpoint ma niski koszt wykonania:

- jedno sprawdzenie sesji,
- jedna walidacja request body,
- jeden update po kluczu głównym `user_id`,
- jedno mapowanie DTO bez ciężkiej logiki domenowej.

### Zalecenia optymalizacyjne

- wykonywać pojedynczą operację `update(...).eq("user_id", userId).select(...).single()` zamiast sekwencji read-then-write-then-read,
- aktualizować tylko te kolumny, które rzeczywiście przyszły w patchu,
- zwracać tylko pola wymagane przez kontrakt odpowiedzi,
- nie używać `select *`.

### No-op i trigger `updated_at`

- Trigger `user_preferences_set_updated_at` już istnieje na tabeli, więc implementacja nie powinna ręcznie ustawiać `updated_at`.
- Jeżeli helper `private.touch_updated_at()` jest poprawnie napisany, no-op nie powinien sztucznie zmieniać `updated_at`.
- Nie ma potrzeby dodawania dodatkowego pre-read tylko po to, by wykrywać brak zmian, dopóki nie pojawi się realny problem wydajnościowy lub kontraktowy.

### Cache i skalowanie

- Endpoint nie powinien mieć współdzielonego cache HTTP, bo odpowiedź jest prywatna i zależna od sesji.
- Obciążenie skaluje się liniowo i jest pomijalne dla MVP, bo operacja dotyczy jednego wiersza per użytkownik.

## 8. Kroki implementacji

1. Rozszerzyć `shared/contracts/current-user-preferences.ts` o `PatchCurrentUserPreferencesCommandSchema`, `PatchCurrentUserPreferencesResultSchema` i `PatchCurrentUserPreferencesResponseSchema`, zachowując istniejące `ThemeSchema` i `FontScaleSchema` jako źródło prawdy dla enumów.
2. Dodać brakujące DTO w `app/types.ts`: `PatchCurrentUserPreferencesResultDto` oraz `PatchCurrentUserPreferencesResponseDto`, albo wprowadzić aliasy do typów wyprowadzonych z Zod.
3. Utworzyć serwis `server/utils/services/update-current-user-preferences.ts`, który:
   - przyjmuje `event`, `userId`, zwalidowany command i `requestId`,
   - buduje whitelistowany payload `snake_case`,
   - wykonuje zapis zawężony do `user_id`,
   - zwraca zmapowany DTO odpowiedzi,
   - loguje kontrolowane błędy z kontekstem.
4. W serwisie użyć zaufanego klienta backendowego do zapisu i nie polegać na aktualnym stanie RLS jako głównej granicy bezpieczeństwa.
5. Zaimplementować `server/api/v1/me/preferences.patch.ts` jako cienki handler używający `useRuntimeConfig(event)`, `assertMutationOrigin(event)`, `getRequiredUserId(event)` oraz `readValidatedBody(event, ...)`.
6. Ujednolicić budowanie `meta.requestId` i `meta.timestamp` z istniejącymi endpointami `me.get` i `me.delete`, aby utrzymać jeden format koperty API.
7. Rozważyć współdzielenie mappera rekordów `user_preferences` między endpointami `GET` i `PATCH`, aby uniknąć duplikacji logiki `snake_case -> camelCase`.
8. Dodać testy w `test/nuxt/me-preferences-patch.test.ts` dla co najmniej następujących scenariuszy:
   - `200 OK` dla pełnego patcha,
   - `200 OK` dla częściowego patcha tylko z jednym polem,
   - `400 Bad Request` dla pustego payloadu,
   - `400 Bad Request` dla niepoprawnego enum,
   - `400 Bad Request` dla nieznanego pola,
   - `401 Unauthorized` dla braku sesji,
   - `500 Internal Server Error` dla brakującego rekordu albo błędu zapisu.
9. Jeśli zespół chce rygorystycznie testować guard CSRF, dodać również scenariusz `403 Forbidden` w warunkach produkcyjnych dla niezgodnego `Origin` / `Referer`.
10. Zweryfikować manualnie na lokalnym środowisku Supabase, że:
   - rekord `user_preferences` jest auto-provisionowany po utworzeniu użytkownika,
   - update zwraca kanoniczne `updatedAt` z bazy,
   - payload częściowy nie nadpisuje nieprzesłanych pól,
   - endpoint nie pozwala zaktualizować cudzego rekordu nawet przy wyłączonym RLS.