# API Endpoint Implementation Plan: GET /api/v1/me

## 1. Przegląd punktu końcowego

Endpoint `GET /api/v1/me` zwraca bieżący kontekst konta zalogowanego użytkownika potrzebny do uruchomienia app shell aplikacji. Jest to endpoint tylko do odczytu, oparty o aktywną sesję Supabase utrzymywaną w ciasteczkach SSR, bez parametrów wejściowych i bez request body.

Zakres odpowiedzialności endpointu:

- potwierdzenie, że żądanie pochodzi od uwierzytelnionego użytkownika,
- pobranie podstawowych danych tożsamości z kontekstu Supabase Auth,
- pobranie technicznego profilu 1:1 z tabeli `public.profiles`,
- zwrócenie danych w standardowej kopercie `ApiSuccessResponseDto`.

Docelowa lokalizacja implementacji w warstwie Nitro:

- `server/api/v1/me.get.ts` jako cienki handler HTTP,
- `server/utils/services/get-current-user-account.ts` jako serwis orkiestrujący odczyt danych,
- opcjonalnie `server/utils/auth/get-required-user.ts` jako współdzielony helper auth, jeśli repo nie ma jeszcze wspólnej warstwy uwierzytelnienia.

## 2. Szczegóły żądania

- Metoda HTTP: `GET`
- URL: `/api/v1/me`
- Auth: wymagana ważna sesja Supabase z cookie SSR
- Query parameters: brak
- Route params: brak
- Request body: brak

### Parametry wejściowe

- Wymagane: brak jawnych parametrów wejściowych; wymagany jest wyłącznie kontekst uwierzytelnionego użytkownika wynikający z sesji.
- Opcjonalne: brak.

### Wymagane typy DTO i modele kontraktowe

Istniejące typy z [app/types.ts](/Users/pozyzniewski/Code/Learning/Ai/Veriffica-z-ai/app/types.ts):

- `AuthenticatedUserDto`
- `ProfileDto`
- `CurrentUserAccountDto`
- `ApiMetaDto`
- `ApiSuccessResponseDto<TData>`
- `GetCurrentUserResponseDto`
- pomocniczo `ApiErrorDto` i `ApiErrorResponseDto`, jeśli repo ma ujednoliconą kopertę błędu

Modele command nie są potrzebne, ponieważ endpoint niczego nie mutuje i nie przyjmuje payloadu wejściowego.

### Rekomendowany kontrakt runtime

Zgodnie z zasadami Zod warto dodać współdzielony kontrakt w `shared/`, mimo że endpoint nie ma request body. Rekomendowany moduł:

- `shared/contracts/current-user.ts`

Proponowane elementy tego modułu:

- `AuthenticatedUserSchema`
- `ProfileSchema`
- `CurrentUserAccountSchema`
- `GetCurrentUserResponseSchema`

Typy TypeScript powinny być wyprowadzane z tych schematów przez `z.infer`. Jeżeli zespół chce utrzymać zgodność wsteczną z [app/types.ts](/Users/pozyzniewski/Code/Learning/Ai/Veriffica-z-ai/app/types.ts), należy potraktować obecne interfejsy jako warstwę kompatybilności albo zastąpić je aliasami do typów wyprowadzonych z kontraktów Zod.

### Walidacja wejścia

Ponieważ endpoint nie przyjmuje body ani query, walidacja koncentruje się na granicy uwierzytelnienia i integralności danych:

- sprawdzić obecność aktywnej sesji użytkownika,
- sprawdzić obecność `user.id`,
- sprawdzić obecność `user.email`, bo odpowiedź kontraktowo wymaga pola `email`,
- pobrać dokładnie jeden rekord `public.profiles` dla `user_id = auth.user.id`.

Nie ma potrzeby użycia `readValidatedBody`, `getValidatedQuery` ani `getValidatedRouterParams` dla tego endpointu.

## 3. Szczegóły odpowiedzi

### Sukces: `200 OK`

Odpowiedź powinna mieć standardową kopertę sukcesu i zawierać wyłącznie pola z kontraktu API:

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "createdAt": "2026-05-01T12:00:00Z"
    },
    "profile": {
      "userId": "uuid",
      "createdAt": "2026-05-01T12:00:00Z",
      "updatedAt": "2026-05-01T12:00:00Z"
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

Mapowanie danych:

- `data.user.id` pochodzi z Supabase Auth user,
- `data.user.email` pochodzi z Supabase Auth user,
- `data.user.createdAt` pochodzi z Supabase Auth user,
- `data.profile.userId` pochodzi z `public.profiles.user_id`,
- `data.profile.createdAt` pochodzi z `public.profiles.created_at`,
- `data.profile.updatedAt` pochodzi z `public.profiles.updated_at`,
- `meta.requestId` pochodzi z warstwy request context lub lokalnego generatora request id,
- `meta.timestamp` powinno być generowane po stronie serwera jako ISO 8601 UTC.

### Błędy kontraktowe

- `401 Unauthorized`: brak ważnej sesji lub brak możliwości ustalenia uwierzytelnionego użytkownika.
- `500 Internal Server Error`: błąd infrastrukturalny albo naruszenie niezmiennika danych, np. brak rekordu `profiles` dla istniejącego użytkownika.

`400 Bad Request` i `404 Not Found` nie są oczekiwane dla poprawnie zaimplementowanego `GET /api/v1/me`, ponieważ endpoint nie przyjmuje danych wejściowych i nie adresuje dowolnego zasobu po identyfikatorze z klienta.

## 4. Przepływ danych

### Logika aplikacyjna

1. Żądanie trafia do `server/api/v1/me.get.ts`.
2. Handler pobiera runtime config przez `useRuntimeConfig(event)` oraz inicjalizuje serwerowy kontekst Supabase zgodny z SSR/cookie auth.
3. Handler lub helper auth odczytuje bieżącego użytkownika z sesji Supabase.
4. Jeśli użytkownik nie istnieje, handler kończy wykonanie błędem `401 Unauthorized`.
5. Handler wywołuje serwis `getCurrentUserAccount`, przekazując `event` i zweryfikowanego użytkownika.
6. Serwis pobiera rekord z `public.profiles`, filtrując po `user_id = authenticatedUser.id`.
7. Serwis mapuje dane z dwóch źródeł do `CurrentUserAccountDto`:
   - źródło 1: Supabase Auth user,
   - źródło 2: tabela `public.profiles`.
8. Handler buduje kopertę `GetCurrentUserResponseDto` wraz z `meta.requestId` i `meta.timestamp`.
9. Handler zwraca `200 OK` z danymi użytkownika.

### Proponowany podział odpowiedzialności

Handler `server/api/v1/me.get.ts`:

- odpowiada za granicę HTTP,
- obsługuje auth failure i mapowanie wyjątków HTTP,
- nie zawiera logiki zapytań do bazy poza wywołaniem serwisu,
- zwraca wyłącznie kontrakt API.

Serwis `server/utils/services/get-current-user-account.ts`:

- pobiera `profiles` dla zalogowanego użytkownika,
- mapuje rekord bazy i usera auth do DTO,
- ukrywa szczegóły integracji z Supabase przed handlerem,
- stanowi naturalny punkt ponownego użycia w przyszłych endpointach typu `/api/v1/me/preferences` albo w middleware bootstrapującym app shell.

Helper auth `server/utils/auth/get-required-user.ts`:

- hermetyzuje sposób odczytu użytkownika z sesji Supabase,
- rzuca `createError({ statusCode: 401, ... })`, gdy użytkownik nie jest zalogowany,
- centralizuje przyszłe rozszerzenia, np. walidację stanu sesji lub ujednolicone logowanie błędów auth.

### Dane i źródła prawdy

- Supabase Auth jest źródłem prawdy dla tożsamości i adresu e-mail.
- `public.profiles` jest źródłem prawdy dla technicznego profilu 1:1 powiązanego z `auth.users`.
- Endpoint nie powinien czytać `public.user_preferences`, bo nie należy to do kontraktu `GET /api/v1/me`.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Endpoint musi działać wyłącznie dla uwierzytelnionych użytkowników na podstawie sesji cookie SSR.
- Nie wolno przyjmować `userId` z query, headerów ani body.
- Odczyt profilu musi być filtrowany po `authenticatedUser.id`, nigdy po wartości pochodzącej od klienta.

### Granice zaufania

- Dane z Supabase Auth i dane z tabeli `profiles` należy traktować jako dwa osobne źródła, które trzeba jawnie scalić po stronie serwera.
- Nie wolno wystawiać service-role key ani używać go w kodzie klienta.
- Jeśli do odczytu `profiles` wystarczy zwykły kontekst zalogowanego użytkownika, należy preferować klienta związanego z sesją, nie uprzywilejowane poświadczenia.

### Ochrona danych

- Odpowiedź powinna zawierać tylko pola z kontraktu; nie zwracać `raw_user_meta_data`, `app_metadata`, tokenów ani innych danych auth.
- Endpoint nie powinien ustawiać publicznych nagłówków cache dla odpowiedzi prywatnej.
- Logi błędów nie mogą zawierać tokenów, cookie, pełnych obiektów auth ani danych osobowych innych niż minimalny kontekst diagnostyczny.

### RLS i integralność

- RLS dla `public.profiles` powinno dopuszczać odczyt tylko własnego rekordu przez `auth.uid() = user_id` albo przez zaufaną warstwę serwerową.
- Brak rekordu `profiles` dla istniejącego usera należy traktować jako błąd niezmiennika systemowego, a nie brak zasobu po stronie klienta.

## 6. Obsługa błędów

### Scenariusze błędów i statusy

| Scenariusz | Status | Kod błędu | Uwagi implementacyjne |
| --- | --- | --- | --- |
| Brak sesji Supabase | `401` | `UNAUTHORIZED` | Zwrócić przewidywalny komunikat bez szczegółów technicznych. |
| Sesja istnieje, ale nie ma `user.id` | `401` lub `500` | `UNAUTHORIZED` lub `INTERNAL_SERVER_ERROR` | Preferowane `401`, jeśli problem oznacza brak wiarygodnej tożsamości. |
| Sesja istnieje, ale brak `user.email` wymaganej kontraktem | `500` | `INTERNAL_SERVER_ERROR` | To niespójność danych auth względem kontraktu. |
| Brak rekordu `profiles` dla zalogowanego usera | `500` | `PROFILE_INVARIANT_BROKEN` lub `INTERNAL_SERVER_ERROR` | Trigger tworzący profil powinien gwarantować istnienie rekordu. |
| Błąd zapytania do Supabase/Postgres | `500` | `INTERNAL_SERVER_ERROR` | Zalogować z kontekstem `requestId` i `userId`, bez sekretów. |
| Nieoczekiwany wyjątek w mapperze/handlerze | `500` | `INTERNAL_SERVER_ERROR` | Handler powinien zwracać przewidywalną kopertę błędu. |

### Strategia obsługi błędów

- Używać `createError` dla błędów oczekiwanych (`401`).
- Błędy nieoczekiwane logować z kontekstem: `requestId`, nazwa endpointu, `userId` jeśli znane.
- Nie ma przesłanek do zapisu błędów do osobnej tabeli błędów, ponieważ obecna specyfikacja i model danych nie definiują takiego mechanizmu.
- Jeżeli w repo pojawi się globalny error mapper, endpoint powinien zwracać błędy przez ten sam mechanizm dla spójności całego `/api/v1`.

### Minimalny zakres logowania

Logować:

- `requestId`,
- nazwę endpointu (`GET /api/v1/me`),
- rodzaj błędu (`auth`, `profile-fetch`, `mapping`, `unexpected`),
- `userId`, jeżeli został już ustalony.

Nie logować:

- wartości cookie,
- tokenów access/refresh,
- pełnego obiektu użytkownika z Supabase,
- pełnej treści odpowiedzi auth providerów.

## 7. Wydajność

### Profil kosztu endpointu

Endpoint ma bardzo niski koszt wykonania:

- jeden odczyt kontekstu auth z sesji,
- jedno zapytanie po kluczu głównym do `public.profiles`,
- proste mapowanie DTO bez transformacji domenowych.

### Zalecenia optymalizacyjne

- Pobierać tylko potrzebne kolumny z `public.profiles`: `user_id`, `created_at`, `updated_at`.
- Unikać `select *`.
- Nie wykonywać dodatkowych odczytów `user_preferences` ani `inspections` w tym endpointcie.
- Korzystać z indeksu wynikającego z `PRIMARY KEY (user_id)` w `profiles`; nie są potrzebne dodatkowe indeksy.

### Cache i SSR

- Nie stosować współdzielonego cache HTTP, ponieważ odpowiedź jest prywatna i zależy od sesji użytkownika.
- Można rozważyć krótkotrwały cache w obrębie pojedynczego request lifecycle tylko wtedy, gdy inne komponenty serwerowe w tym samym żądaniu potrzebują tych samych danych; nie jest to jednak wymagane dla MVP.

### Testy wydajnościowe i regresyjne

- Wystarczą lekkie testy integracyjne potwierdzające pojedyncze zapytanie do bazy i poprawne mapowanie danych.
- Nie ma potrzeby tworzenia osobnych benchmarków, dopóki endpoint nie stanie się elementem masowo odświeżanym przez frontend.

## 8. Kroki implementacji

1. Utworzyć minimalny szkielet backendu Nitro, jeśli katalog `server/` nadal nie istnieje, zaczynając od `server/api/v1/me.get.ts` i `server/utils/`.
2. Dodać współdzielony helper auth, który odczytuje bieżącego użytkownika Supabase z sesji SSR i rzuca `401 Unauthorized`, gdy sesja nie istnieje.
3. Utworzyć serwis `getCurrentUserAccount`, który przyjmuje uwierzytelnionego usera, pobiera rekord `public.profiles` i mapuje wynik do `CurrentUserAccountDto`.
4. W handlerze `GET /api/v1/me` wywołać helper auth i serwis, a następnie zbudować `GetCurrentUserResponseDto` z prawidłowym `meta.requestId` i `meta.timestamp`.
5. Dodać kontrakt runtime w `shared/contracts/current-user.ts` oparty o Zod 4; jeśli zespół nie chce od razu refaktoryzować całego repo, zacząć od samego response schema dla tego endpointu.
6. Ujednolicić mapowanie błędów tak, aby `401` było przewidywalne, a wszystkie błędy infrastrukturalne kończyły się jako `500` bez wycieku szczegółów Supabase.
7. Dodać testy dla co najmniej trzech scenariuszy:
   - poprawna odpowiedź `200` dla zalogowanego użytkownika z istniejącym profilem,
   - `401` przy braku sesji,
   - `500` przy naruszeniu niezmiennika, np. brak rekordu `profiles`.
8. Umieścić testy w odpowiedniej warstwie:
   - test serwisu jako unit test w `test/unit/`,
   - test handlera jako Nuxt runtime test w `test/nuxt/`, jeśli repo utrzymuje oddzielny projekt Nuxt dla testów endpointów.
9. Zweryfikować lokalnie implementację przez uruchomienie wąskich testów oraz ręczne wywołanie endpointu z aktywną i nieaktywną sesją.
10. Upewnić się, że frontend używa endpointu tylko do bootstrapu bieżącego konta, a preferencje i inne zasoby pobiera z dedykowanych endpointów, bez rozszerzania zakresu `GET /api/v1/me` ponad ustalony kontrakt.

### Proponowana kolejność zmian w kodzie

1. Kontrakty `shared/`.
2. Helper auth.
3. Serwis odczytu profilu.
4. Handler HTTP.
5. Testy.
6. Weryfikacja lokalna.

### Kryteria ukończenia

- Endpoint zwraca `200 OK` dla zalogowanego użytkownika zgodnie ze specyfikacją JSON.
- Endpoint zwraca `401 Unauthorized` przy braku sesji.
- Endpoint nie ujawnia żadnych pól spoza kontraktu.
- Handler nie zawiera logiki dostępowej do danych poza wywołaniem serwisu.
- Logowanie błędów jest obecne i nie zawiera sekretów.
- Testy obejmują ścieżkę sukcesu i co najmniej dwa scenariusze błędów.
