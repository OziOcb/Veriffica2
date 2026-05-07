# API Endpoint Implementation Plan: GET /api/v1/me/preferences

## 1. Przegląd punktu końcowego

Endpoint `GET /api/v1/me/preferences` zwraca ustawienia aplikacyjne aktualnie zalogowanego użytkownika przechowywane w tabeli `public.user_preferences`. Jest to endpoint tylko do odczytu, oparty o aktywną sesję Supabase utrzymywaną w ciasteczkach SSR, bez parametrów wejściowych i bez request body.

Zakres odpowiedzialności endpointu:

- potwierdzenie, że żądanie pochodzi od uwierzytelnionego użytkownika,
- pobranie rekordu 1:1 z tabeli `public.user_preferences`,
- mapowanie pól bazy danych z `snake_case` do kontraktu API w `camelCase`,
- zwrócenie danych w standardowej kopercie `ApiSuccessResponseDto<UserPreferencesDto>`.

Docelowa lokalizacja implementacji w warstwie Nitro:

- `server/api/v1/me/preferences.get.ts` jako cienki handler HTTP,
- `server/utils/services/get-current-user-preferences.ts` jako serwis orkiestrujący odczyt danych,
- `server/utils/auth/get-required-user-id.ts` jako współdzielony helper auth,
- `shared/contracts/current-user-preferences.ts` jako współdzielony kontrakt Zod dla DTO i response envelope.

Najważniejsza decyzja architektoniczna: endpoint powinien korzystać ze zwykłego klienta Supabase związanego z bieżącą sesją użytkownika, a nie z service-role. Odczyt `public.user_preferences` jest objęty RLS `select_own`, więc minimalny poziom uprawnień jest tutaj wystarczający i bezpieczniejszy.

## 2. Szczegóły żądania

- Metoda HTTP: `GET`
- URL: `/api/v1/me/preferences`
- Auth: wymagana ważna sesja Supabase z cookie SSR
- Query parameters: brak
- Route params: brak
- Request body: brak

### Parametry wejściowe

- Wymagane: brak jawnych parametrów wejściowych; wymagany jest wyłącznie kontekst uwierzytelnionego użytkownika wynikający z sesji.
- Opcjonalne: brak.

### Wymagane typy DTO i modele kontraktowe

Istniejące typy z `app/types.ts`:

- `Theme`
- `FontScale`
- `UserPreferencesDto`
- `ApiMetaDto`
- `ApiSuccessResponseDto<TData>`
- `GetCurrentUserPreferencesResponseDto`
- pomocniczo `ApiErrorDto` i `ApiErrorResponseDto`, jeśli repo utrzymuje wspólną kopertę błędów dla `/api/v1`

Modele command nie są potrzebne, ponieważ endpoint niczego nie mutuje i nie przyjmuje payloadu wejściowego.

### Rekomendowany kontrakt runtime

Współdzielony moduł `shared/contracts/current-user-preferences.ts` powinien zawierać co najmniej:

- `ApiMetaSchema` albo import istniejącego wspólnego schematu meta,
- `ThemeSchema` jako enum `system | light | dark`,
- `FontScaleSchema` jako enum `small | medium | large`,
- `UserPreferencesSchema`,
- `GetCurrentUserPreferencesResponseSchema`.

Typy TypeScript powinny być wyprowadzane z tych schematów przez `z.infer`. Istniejące aliasy z `app/types.ts` mogą pozostać warstwą kompatybilności, ale nowy runtime contract powinien być źródłem prawdy dla testów i walidacji odpowiedzi.

### Walidacja wejścia

Ponieważ endpoint nie przyjmuje body, query ani route params, walidacja koncentruje się na granicy uwierzytelnienia i integralności danych:

- sprawdzić obecność aktywnej sesji użytkownika,
- sprawdzić obecność `user.id`,
- pobrać dokładnie jeden rekord `public.user_preferences` dla `user_id = authenticatedUser.id`,
- potraktować brak rekordu jako naruszenie niezmiennika danych, bo rekord ma być auto-provisionowany po utworzeniu `auth.users`.

Nie ma potrzeby użycia `readValidatedBody`, `getValidatedQuery` ani `getValidatedRouterParams` dla tego endpointu.

## 3. Szczegóły odpowiedzi

### Sukces: `200 OK`

Odpowiedź powinna mieć standardową kopertę sukcesu i zawierać wyłącznie pola z kontraktu API:

```json
{
  "data": {
    "userId": "uuid",
    "theme": "system",
    "fontScale": "medium",
    "hideInspectionIntro": false,
    "createdAt": "2026-05-01T12:00:00Z",
    "updatedAt": "2026-05-01T12:00:00Z"
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

Mapowanie danych:

- `data.userId` pochodzi z `public.user_preferences.user_id`,
- `data.theme` pochodzi z `public.user_preferences.theme`,
- `data.fontScale` pochodzi z `public.user_preferences.font_scale`,
- `data.hideInspectionIntro` pochodzi z `public.user_preferences.hide_inspection_intro`,
- `data.createdAt` pochodzi z `public.user_preferences.created_at`,
- `data.updatedAt` pochodzi z `public.user_preferences.updated_at`,
- `meta.requestId` pochodzi z warstwy request context lub lokalnego generatora request id,
- `meta.timestamp` powinno być generowane po stronie serwera jako ISO 8601 UTC.

### Błędy kontraktowe

- `401 Unauthorized`: brak ważnej sesji lub brak możliwości ustalenia uwierzytelnionego użytkownika.
- `500 Internal Server Error`: błąd infrastrukturalny albo naruszenie niezmiennika danych, na przykład brak rekordu `user_preferences` dla istniejącego użytkownika.

`400 Bad Request` i `404 Not Found` nie są oczekiwane dla poprawnie zaimplementowanego `GET /api/v1/me/preferences`, ponieważ endpoint nie przyjmuje danych wejściowych i nie adresuje zasobu po identyfikatorze z klienta.

## 4. Przepływ danych

### Logika aplikacyjna

1. Żądanie trafia do `server/api/v1/me/preferences.get.ts`.
2. Handler pobiera runtime config przez `useRuntimeConfig(event)` i generuje `requestId`.
3. Handler wywołuje współdzielony helper `getRequiredUserId(event)`.
4. Jeśli użytkownik nie istnieje albo sesja nie jest wiarygodna, handler kończy wykonanie błędem `401 Unauthorized`.
5. Handler wywołuje serwis `getCurrentUserPreferences`, przekazując `event`, `userId` i opcjonalnie `requestId` do logowania kontekstowego.
6. Serwis tworzy klienta przez `serverSupabaseClient(event)` i wykonuje odczyt z `public.user_preferences`, filtrując po `user_id = authenticatedUser.id`.
7. Serwis mapuje wynik do `UserPreferencesDto`, zamieniając pola `font_scale` i `hide_inspection_intro` na odpowiednie nazwy kontraktu HTTP.
8. Handler buduje `GetCurrentUserPreferencesResponseDto` wraz z `meta.requestId` i `meta.timestamp`.
9. Handler zwraca `200 OK` z danymi preferencji użytkownika.

### Proponowany podział odpowiedzialności

Handler `server/api/v1/me/preferences.get.ts`:

- odpowiada za granicę HTTP,
- uruchamia auth guard,
- nie zawiera logiki dostępu do bazy poza wywołaniem serwisu,
- zwraca wyłącznie kontrakt API.

Serwis `server/utils/services/get-current-user-preferences.ts`:

- pobiera rekord `public.user_preferences` dla zalogowanego użytkownika,
- mapuje rekord bazy na `UserPreferencesDto`,
- ukrywa szczegóły integracji z Supabase przed handlerem,
- stanowi naturalny punkt ponownego użycia dla przyszłego `PATCH /api/v1/me/preferences`.

Helper auth `server/utils/auth/get-required-user-id.ts`:

- hermetyzuje sposób odczytu użytkownika z sesji Supabase,
- rzuca `createError({ statusCode: 401, ... })`, gdy użytkownik nie jest zalogowany,
- zapewnia jeden spójny mechanizm auth dla całej rodziny endpointów `/api/v1/me*`.

### Dane i źródła prawdy

- `public.user_preferences` jest jedynym źródłem prawdy dla `theme`, `fontScale` i `hideInspectionIntro`.
- `auth.users` pozostaje źródłem prawdy dla tożsamości użytkownika, ale nie dla jego ustawień aplikacyjnych.
- Rekord `user_preferences` powinien istnieć zawsze dzięki triggerowi provisionującemu po `INSERT` do `auth.users`.

### Rekomendowane zapytanie do bazy

Serwis powinien pobierać tylko potrzebne kolumny:

- `user_id`
- `theme`
- `font_scale`
- `hide_inspection_intro`
- `created_at`
- `updated_at`

Należy unikać `select *`, bo endpoint ma stabilny i mały kontrakt odpowiedzi.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Endpoint musi działać wyłącznie dla uwierzytelnionych użytkowników na podstawie sesji cookie SSR.
- Nie wolno przyjmować `userId` z query, headerów ani body.
- Odczyt preferencji musi być filtrowany po `authenticatedUser.id`, nigdy po wartości pochodzącej od klienta.

### Zasada najmniejszych uprawnień

- Do odczytu należy użyć klienta sesyjnego `serverSupabaseClient(event)`, nie `serverSupabaseServiceRole(event)`.
- RLS `user_preferences_select_own` już ogranicza odczyt do właściciela, więc service-role byłby tu zbędnym rozszerzeniem uprawnień.
- Endpoint nie powinien wykonywać żadnych operacji mutujących ani obchodzić polityk RLS.

### Ochrona danych

- Odpowiedź powinna zawierać tylko pola z kontraktu; nie zwracać kolumn lub metadanych spoza specyfikacji.
- Endpoint nie powinien ustawiać publicznych nagłówków cache dla odpowiedzi prywatnej.
- Logi błędów nie mogą zawierać tokenów, cookie ani pełnego obiektu sesji.

### Zagrożenia bezpieczeństwa do uwzględnienia

- ryzyko auth bypass, jeśli implementacja dopuści `userId` z żądania zamiast z sesji,
- ryzyko wycieku prywatnych danych przez błędne cache'owanie odpowiedzi zależnych od sesji,
- ryzyko nadmiernych uprawnień, jeśli odczyt zostanie zrealizowany przez service-role zamiast klienta sesyjnego,
- ryzyko wycieku szczegółów infrastruktury w surowych błędach Supabase lub Zod.

## 6. Obsługa błędów

### Scenariusze błędów i statusy

| Scenariusz | Status | Kod błędu | Uwagi implementacyjne |
| --- | --- | --- | --- |
| Brak aktywnej sesji Supabase | `401` | `UNAUTHORIZED` | Zwrócić przewidywalny komunikat bez szczegółów technicznych. |
| Sesja istnieje, ale nie ma `user.id` | `401` | `UNAUTHORIZED` | Traktować jako brak wiarygodnej tożsamości użytkownika. |
| Brak rekordu `user_preferences` dla zalogowanego usera | `500` | `PREFERENCES_INVARIANT_BROKEN` lub `INTERNAL_SERVER_ERROR` | Rekord powinien być auto-provisionowany po utworzeniu konta. |
| Błąd zapytania do Supabase/Postgres | `500` | `INTERNAL_SERVER_ERROR` | Zalogować z kontekstem `requestId` i `userId`, bez sekretów. |
| Nieoczekiwany wyjątek w mapperze lub handlerze | `500` | `INTERNAL_SERVER_ERROR` | Handler powinien zwracać przewidywalną kopertę błędu. |

### Strategia obsługi błędów

- Używać `createError` dla błędów oczekiwanych, przede wszystkim `401`.
- Błędy nieoczekiwane logować z kontekstem: `requestId`, nazwa endpointu, `userId` jeśli znane.
- Nie ma przesłanek do zapisu błędów do osobnej tabeli błędów, ponieważ obecny plan bazy nie definiuje takiego mechanizmu.
- Jeżeli repo ma globalny mapper błędów API, endpoint powinien używać tego samego mechanizmu dla spójności całego `/api/v1`.

### Minimalny zakres logowania

Logować:

- `requestId`,
- nazwę endpointu (`GET /api/v1/me/preferences`),
- rodzaj błędu (`auth`, `preferences-fetch`, `mapping`, `unexpected`),
- `userId`, jeżeli został już ustalony.

Nie logować:

- wartości cookie,
- tokenów access lub refresh,
- pełnych danych sesji Supabase,
- pełnej treści odpowiedzi z bazy.

## 7. Wydajność

### Profil kosztu endpointu

Endpoint ma bardzo niski koszt wykonania:

- jedno sprawdzenie sesji / użytkownika,
- jedno zapytanie po kluczu głównym do `public.user_preferences`,
- proste mapowanie DTO bez transformacji domenowych.

### Zalecenia optymalizacyjne

- pobierać tylko potrzebne kolumny z `public.user_preferences`,
- użyć istniejącego klucza głównego `user_preferences_pkey` na `user_id`,
- nie wykonywać dodatkowych odczytów z `profiles` ani `inspections`,
- nie stosować współdzielonego cache HTTP, ponieważ odpowiedź jest prywatna i zależna od sesji.

### Niezawodność i testowalność

- Ze względu na prosty charakter endpointu większy priorytet niż mikrooptymalizacja ma przewidywalność odpowiedzi i konsekwentne mapowanie błędów.
- Wystarczą lekkie testy Nuxt/Vitest potwierdzające poprawne mapowanie i statusy auth/error.

## 8. Kroki implementacji

1. Dodać współdzielony kontrakt Zod w `shared/contracts/current-user-preferences.ts` dla `Theme`, `FontScale`, `UserPreferencesDto` i response envelope `GetCurrentUserPreferencesResponseSchema`.
2. Utworzyć serwis `server/utils/services/get-current-user-preferences.ts`, który przyjmuje `event` i `userId`, wykonuje selektywny odczyt z `public.user_preferences` i mapuje wynik do `UserPreferencesDto`.
3. W serwisie traktować brak rekordu `user_preferences` jako błąd niezmiennika systemowego i mapować go na kontrolowany `500`, z logiem zawierającym `requestId` i `userId`.
4. Zaimplementować `server/api/v1/me/preferences.get.ts` jako cienki handler używający `useRuntimeConfig(event)`, `getRequiredUserId(event)` i serwisu `getCurrentUserPreferences`.
5. Ujednolicić budowanie `meta.requestId` i `meta.timestamp` z resztą endpointów `/api/v1/me*`, tak aby odpowiedź miała identyczny format koperty jak istniejące `GET /api/v1/me` i `DELETE /api/v1/me`.
6. Dodać testy w `test/nuxt/` dla co najmniej trzech scenariuszy:
   - `200 OK` dla poprawnego odczytu preferencji zalogowanego użytkownika,
   - `401 Unauthorized` dla braku aktywnej sesji,
   - `500 Internal Server Error` dla brakującego rekordu `user_preferences` albo błędu odczytu z bazy.
7. Zweryfikować w testach, że odpowiedź przechodzi przez `GetCurrentUserPreferencesResponseSchema.safeParse(...)`, tak jak istniejące testy endpointów `/api/v1/me`.
8. Rozważyć drobną refaktoryzację współdzielonej warstwy `GET /api/v1/me`, aby oba endpointy `me` i `me/preferences` korzystały z tego samego helpera auth i zbliżonego wzorca logowania błędów.