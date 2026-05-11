# API Endpoint Implementation Plan: PUT/DELETE /api/v1/inspections/{inspectionId}/answers/{questionId}

## 1. Przegląd punktu końcowego

Endpoint `PUT /api/v1/inspections/{inspectionId}/answers/{questionId}` zapisuje albo zastępuje pojedynczą odpowiedź dla aktualnie widocznego pytania, a `DELETE /api/v1/inspections/{inspectionId}/answers/{questionId}` usuwa istniejącą odpowiedź. Oba warianty są mutacjami kanonicznego snapshotu inspekcji i muszą działać w tym samym modelu własności, sesji i konfliktów co `part-1` oraz `runtime-flags`.

Zakres odpowiedzialności endpointu:

- potwierdzenie aktywnej sesji Supabase SSR,
- walidacja `inspectionId` i `questionId` jako route params,
- walidacja body dla `PUT`,
- weryfikacja ownership po stronie serwera,
- sprawdzenie, czy inspekcja nadal jest edytowalna,
- sprawdzenie, czy `questionId` należy do aktualnie widocznego zestawu pytań,
- atomowy zapis albo usunięcie odpowiedzi w `public.inspections.snapshot`,
- przeliczenie `progress` i `scoreDistribution`,
- zwrócenie wyłącznie odpowiedzi kanonicznej w standardowej kopercie `ApiSuccessResponseDto`.

Rekomendowana lokalizacja implementacji w Nitro:

- `server/api/v1/inspections/[inspectionId]/answers/[questionId]/index.put.ts` jako cienki handler HTTP dla zapisu odpowiedzi,
- `server/api/v1/inspections/[inspectionId]/answers/[questionId]/index.delete.ts` jako cienki handler HTTP dla usuwania odpowiedzi,
- `server/utils/services/save-inspection-answer.ts` jako serwis orkiestrujący zapis,
- `server/utils/services/delete-inspection-answer.ts` jako serwis orkiestrujący usunięcie,
- `server/utils/services/inspection-answer.ts` albo równoważny moduł z helperami pure,
- `shared/contracts/inspections.ts` dla kontraktów Zod i typów wyprowadzonych z schematów.

Warto utrzymać folder-first layout dla zagnieżdżonego zasobu dynamicznego. Dla tej ścieżki nie należy mieszać logiki w siblingach typu `[questionId].put.ts` / `[questionId].delete.ts`, jeżeli zespół trzyma się już konwencji `index.*` w dynamicznych folderach.

## 2. Szczegóły żądania

### `PUT /api/v1/inspections/{inspectionId}/answers/{questionId}`

- Metoda HTTP: `PUT`
- URL: `/api/v1/inspections/{inspectionId}/answers/{questionId}`
- Auth: wymagana aktywna sesja Supabase SSR
- Query parameters: brak

#### Parametry wejściowe

| Element | Wymagany | Uwagi |
| --- | --- | --- |
| `inspectionId` | tak | `z.string().uuid()` |
| `questionId` | tak | syntaktyczna walidacja w schemacie route params; semantyczna walidacja w serwisie względem aktualnie widocznych pytań |
| `answer` | tak | enum `yes` \| `no` \| `dont_know` |
| `baseSnapshotVersion` | tak | dodatnia liczba całkowita, używana do optimistic concurrency |
| `clientUpdatedAt` | tak | ISO 8601 UTC string z offsetem |

#### Request body

```json
{
  "answer": "yes",
  "baseSnapshotVersion": 9,
  "clientUpdatedAt": "2026-05-01T12:56:00Z"
}
```

#### Reguły walidacji

- body musi być `strictObject`, aby odrzucać nieznane pola,
- `answer` musi należeć do allowlisty odpowiedzi,
- `baseSnapshotVersion` musi być dodatnim integerem,
- `clientUpdatedAt` musi być poprawnym timestampem ISO,
- `questionId` musi zostać potwierdzony przez resolver widoczności na podstawie aktualnego snapshotu,
- jeśli pytanie nie jest widoczne, endpoint powinien zwrócić `422 Unprocessable Entity`,
- jeśli inspekcja nie jest edytowalna, serwis powinien zwrócić `409 Conflict` i wymagać reopen.

### `DELETE /api/v1/inspections/{inspectionId}/answers/{questionId}`

- Metoda HTTP: `DELETE`
- URL: `/api/v1/inspections/{inspectionId}/answers/{questionId}`
- Auth: wymagana aktywna sesja Supabase SSR
- Query parameters: brak
- Request body: brak zgodnie ze specyfikacją

#### Parametry wejściowe

| Element | Wymagany | Uwagi |
| --- | --- | --- |
| `inspectionId` | tak | `z.string().uuid()` |
| `questionId` | tak | semantyczna walidacja w serwisie względem aktualnie widocznych pytań |

#### Reguły walidacji

- handler nie powinien polegać na body,
- jeśli implementacja zdecyduje się egzekwować pusty payload stricte, niepusty body powinien kończyć się `400 Bad Request`,
- `questionId` musi nadal istnieć w kanonicznym, widocznym zbiorze pytań albo usunięcie powinno zostać odrzucone jako `404 Not Found`,
- jeśli inspekcja jest zablokowana przez stan lub konflikt, zwrócić `409 Conflict`.

### Wykorzystywane typy DTO i Command Modele

Istniejące typy z `app/types.ts`, które warto wykorzystać zamiast duplikować:

- `InspectionQuestionRouteParams`,
- `InspectionAnswerValue`,
- `InspectionProgressDto`,
- `InspectionScoreDistributionDto`,
- `ApiMetaDto`,
- `ApiSuccessResponseDto<TData>`,
- pomocniczo `ApiErrorDto` i `ApiErrorResponseDto`, jeżeli repo utrzymuje spójny error envelope dla `/api/v1`.

Nowe kontrakty Zod, które powinny pojawić się w `shared/contracts/inspections.ts`:

- `QuestionIdSchema` albo równoważny schema helper dla route params,
- `InspectionQuestionRouteParamsSchema`,
- `PutInspectionAnswerCommandSchema`,
- `PutInspectionAnswerResultSchema`,
- `PutInspectionAnswerResponseSchema`,
- `DeleteInspectionAnswerResultSchema`,
- `DeleteInspectionAnswerResponseSchema`.

Typy TypeScript powinny być wyprowadzane przez `z.infer` lub `z.output`, a nie utrzymywane ręcznie równolegle. Jeżeli zespół chce zachować zgodność z obecnym stylem repo, można dodać aliasy w `app/types.ts`, ale źródłem prawdy powinny być schematy Zod.

Ważna decyzja kontraktowa: answer mutation powinien pozostać częścią `shared/contracts/inspections.ts`, a nie osobnym plikiem, bo jest to subresource inspekcji, a nie nowa domena.

## 3. Szczegóły odpowiedzi

### `PUT` — `200 OK`

Odpowiedź powinna zwracać wyłącznie kanoniczny wynik mutacji pojedynczej odpowiedzi:

```json
{
  "data": {
    "inspectionId": "uuid",
    "questionId": "q_body_panel_gaps",
    "answer": "yes",
    "snapshotVersion": 10,
    "progress": {
      "answeredQuestions": 2,
      "visibleQuestions": 60,
      "completionRate": 3.33
    },
    "scoreDistribution": {
      "yes": 2,
      "no": 0,
      "dontKnow": 0
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:56:00Z"
  }
}
```

Ważne zasady:

- `answer` w odpowiedzi musi być canonicalized do tego samego enumu, który zaakceptował serwer,
- `snapshotVersion` rośnie tylko po faktycznej zmianie stanu,
- no-op `PUT` z tym samym `answer` nie powinien bumpować `snapshotVersion` ani `updated_at`,
- `progress` i `scoreDistribution` muszą być liczone na podstawie aktualnie widocznych pytań,
- odpowiedź nie powinna zwracać całego snapshotu, `visibleGroupIds` ani `visibleQuestionIds`, bo to nie jest kontrakt tego endpointu.

### `DELETE` — `200 OK`

```json
{
  "data": {
    "inspectionId": "uuid",
    "questionId": "q_body_panel_gaps",
    "deleted": true,
    "snapshotVersion": 11,
    "progress": {
      "answeredQuestions": 1,
      "visibleQuestions": 60,
      "completionRate": 1.67
    },
    "scoreDistribution": {
      "yes": 1,
      "no": 0,
      "dontKnow": 0
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:57:00Z"
  }
}
```

Ważne zasady:

- `deleted` ma być literalnie `true`,
- brakująca odpowiedź nie powinna być traktowana jako cichy no-op; lepsze jest `404 Not Found`,
- `snapshotVersion` rośnie tylko przy realnym usunieciu wpisu z `answers`,
- response pozostaje mały i przewidywalny, bez pełnego snapshotu.

### Kody statusu

#### `PUT`

- `200 OK` — poprawny zapis lub podmiana odpowiedzi,
- `400 Bad Request` — niepoprawny JSON, body nie jest obiektem albo route params są niepoprawne syntaktycznie,
- `401 Unauthorized` — brak aktywnej sesji,
- `404 Not Found` — inspekcja nie istnieje albo nie należy do bieżącego użytkownika,
- `409 Conflict` — `baseSnapshotVersion` jest przestarzały, inspekcja jest w stanie `completed`, albo wystąpił konflikt zapisu,
- `422 Unprocessable Entity` — `answer` jest niepoprawny, `questionId` nie jest aktualnie widoczne albo body nie przechodzi walidacji domenowej,
- `500 Internal Server Error` — nieoczekiwany błąd serwera, bazy albo mapowania odpowiedzi.

#### `DELETE`

- `200 OK` — poprawne usunięcie odpowiedzi,
- `400 Bad Request` — route params są niepoprawne syntaktycznie albo implementacja świadomie odrzuca niepusty body,
- `401 Unauthorized` — brak aktywnej sesji,
- `404 Not Found` — inspekcja nie istnieje, nie należy do użytkownika, odpowiedź nie istnieje albo pytanie nie jest już widoczne,
- `409 Conflict` — inspekcja jest zablokowana lub równoległy zapis zmienił stan między odczytem a zapisem,
- `500 Internal Server Error` — nieoczekiwany błąd serwera albo bazy.

## 4. Przepływ danych

### Wspólny model wykonania

1. Żądanie trafia do handlera Nitro pod `server/api/v1/inspections/[inspectionId]/answers/[questionId]/...`.
2. Handler wywołuje `useRuntimeConfig(event)` i ustawia `Cache-Control: private, no-store` dla odpowiedzi powiązanych z sesją.
3. Dla obu metod uruchamiana jest walidacja `Origin` / `Referer` przez `assertMutationOrigin(event)`, bo auth jest cookie-based.
4. Handler pobiera aktualnego użytkownika przez `getRequiredUserId(event)`.
5. `inspectionId` i `questionId` są walidowane przez Zod na granicy route params.
6. Serwis używa `serverSupabaseServiceRole(event)` i pobiera minimalny rekord inspekcji przez explicit `id + user_id` filter, bo RLS na `public.inspections` jest wyłączone.
7. Jeśli rekord nie istnieje albo należy do innego użytkownika, serwis zwraca `404 Not Found`.
8. Serwis sprawdza `status`; jeśli inspekcja jest `completed`, mutacja powinna kończyć się `409 Conflict`, bo answer mutations są częścią trybu edycji.

### Przepływ `PUT`

1. Handler parsuje body w sposób, który rozróżnia `400` od `422`.
2. `400` oznacza brak body, nieprawidłowy JSON albo body niebędące obiektem.
3. `422` oznacza naruszenie kontraktu: nieznany `answer`, brak obowiązkowego pola, zła liczba wersji albo niepoprawny timestamp.
4. Serwis rekonstruuje bieżący snapshot i z jego pomocą wylicza aktualny widoczny zbiór pytań.
5. Resolver widoczności powinien korzystać z tej samej logiki co `GET /api/v1/inspections/{inspectionId}/parts/{partId}/questions`, czyli z repozytoryjnego question bank artifact, a nie z parsowania markdown w locie.
6. Jeżeli `questionId` nie należy do widocznego zbioru, serwis zwraca `422 Unprocessable Entity`.
7. Jeżeli answer już istnieje i jest identyczny, serwis może wykonać no-op short circuit i zwrócić aktualny `snapshotVersion` bez write path.
8. W przeciwnym razie serwis aktualizuje mapę `snapshot.answers` i przelicza `progress` oraz `scoreDistribution` na podstawie nowego stanu.
9. Atomowy zapis powinien być wykonywany przez dedykowaną funkcję SQL, np. `save_inspection_answer`, która aktualizuje JSONB i wersję snapshotu w jednej transakcji.
10. Handler składa `ApiSuccessResponseDto` z `data` i `meta` oraz zwraca `200 OK`.

### Przepływ `DELETE`

1. Handler nie powinien opierać się na body; kontrakt nie przewiduje treści żądania.
2. Serwis ponownie ładuje kanoniczny snapshot i sprawdza ownership oraz status.
3. Resolver widoczności ustala, czy `questionId` należy do bieżącego zestawu pytań.
4. Jeżeli pytanie nie jest widoczne albo odpowiedź nie istnieje, serwis zwraca `404 Not Found`.
5. Jeżeli odpowiedź istnieje, serwis usuwa klucz z mapy `snapshot.answers` i przelicza `progress` oraz `scoreDistribution`.
6. Usunięcie powinno być wykonywane atomowo przez dedykowaną funkcję SQL, np. `delete_inspection_answer`.
7. Ponieważ publiczny DELETE contract nie przenosi `clientUpdatedAt`, trzeba świadomie ustalić w SQL, czy `client_updated_at` ma zostać ustawione na server timestamp, czy pozostawione bez zmian; decyzja musi być spójna i udokumentowana w serwisie.
8. Handler zwraca `200 OK` z kopertą sukcesu.

### Podział odpowiedzialności

Handler `server/api/v1/inspections/[inspectionId]/answers/[questionId]/index.put.ts` i `index.delete.ts`:

- odpowiadają za granicę HTTP,
- walidują route params i body (`PUT`),
- uruchamiają auth guard i origin guard,
- mapują błędy do statusów HTTP,
- zwracają wyłącznie kontrakt odpowiedzi.

Serwisy `save-inspection-answer.ts` i `delete-inspection-answer.ts`:

- pobierają bieżący snapshot inspekcji,
- sprawdzają ownership i status edytowalności,
- wyliczają aktualny visible set,
- walidują, czy `questionId` może być mutowany,
- aktualizują mapę `answers`,
- przeliczają `progress` i `scoreDistribution`,
- wywołują transakcyjny SQL helper,
- nie zajmują się formatowaniem koperty HTTP.

### Uwaga dotycząca logiki domenowej

W przeciwieństwie do `part-1` i `runtime-flags`, answer mutations nie zmieniają `visibleGroupIds` ani `visibleQuestionIds`, więc nie potrzebują smart pruning. Ich odpowiedzialność to wyłącznie zmiana mapy `answers` i przeliczenie pochodnych metryk. To dobry moment, żeby wydzielić z istniejącego `get-inspection-detail.ts` wspólne pure helpers dla `computeProgress` i `computeScoreDistribution`, aby nie duplikować tej logiki w kilku miejscach.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Endpoint musi działać wyłącznie dla uwierzytelnionych użytkowników na podstawie sesji cookie SSR,
- nie wolno przyjmować `userId` z query, body ani headerów od klienta,
- wszystkie odczyty i zapisy muszą być filtrowane po `user_id` po stronie serwera, bo `public.inspections` nie polega tu na aktywnym RLS.

### CSRF i cookies

- Dla obu metod trzeba stosować `assertMutationOrigin(event)`,
- private responses powinny mieć `Cache-Control: private, no-store`,
- mutacje answerów nie powinny być cache'owane przez CDN ani shared cache.

### Granice zaufania

- `serverSupabaseServiceRole(event)` musi pozostać zamknięty w `server/` i nie może być eksportowany do klienta,
- walidacja body i route params musi traktować wszystkie dane jako nieufne,
- `questionId` nie może być uznany za prawdziwy tylko dlatego, że pasuje do składni; musi przejść semantyczną walidację against current visible set.

### Ochrona danych i logowanie

- logi mają zawierać `requestId`, `userId`, `inspectionId`, `questionId`, typ operacji oraz status błędu,
- nie należy logować pełnego snapshotu, cookies, tokenów ani całej odpowiedzi od Supabase,
- jeśli answer value jest logowana w ogóle, to tylko w minimalnym, kontrolowanym kontekście debugowym.

### Rate limiting i nadużycia

- jeżeli repo ma wspólny helper limitujący mutacje, warto zastosować lekki per-session burst limit również tutaj,
- limit nie powinien być zbyt agresywny, bo answer mutations mogą przychodzić seriami podczas korekt albo reconnectów offline,
- cięższe ograniczenia powinny pozostać dla flow destrukcyjnych, jak delete account.

### Dev / test convenience

- obecny helper `getRequiredUserId` dopuszcza `x-dev-user-id` poza production; to jest pomocne w testach i Postmanie,
- ten wyjątek nie może być przeniesiony do production ani użyty jako mechanizm autoryzacji.

## 6. Obsługa błędów

### Scenariusze błędów dla `PUT`

| Scenariusz | Status | Uwagi |
| --- | --- | --- |
| Brak body, body nie jest obiektem albo JSON jest niepoprawny | `400` | handler powinien odróżniać błąd transportu od walidacji domenowej |
| `inspectionId` lub `questionId` ma niepoprawny format | `400` | route params są walidowane na granicy handlera |
| Brak aktywnej sesji | `401` | zwrócić przewidywalny błąd autoryzacji |
| Inspekcja nie istnieje albo nie należy do bieżącego użytkownika | `404` | nie ujawniać istnienia cudzych danych |
| Inspekcja jest completed albo zablokowana przez konflikt | `409` | mutacja wymaga reopen albo odświeżenia stanu |
| `baseSnapshotVersion` jest przestarzały | `409` | klasyczny optimistic concurrency conflict |
| `answer` jest niepoprawny, `questionId` nie jest aktualnie widoczne albo body narusza kontrakt | `422` | zwłaszcza dla niewidocznego pytania i enumu odpowiedzi |
| Nieoczekiwany błąd bazy albo mappera | `500` | fallback bez wycieku szczegółów Supabase |

### Scenariusze błędów dla `DELETE`

| Scenariusz | Status | Uwagi |
| --- | --- | --- |
| Route params mają niepoprawny format | `400` | np. nieprawidłowy UUID |
| Brak aktywnej sesji | `401` | brak dostępu do mutacji |
| Inspekcja nie istnieje albo nie należy do bieżącego użytkownika | `404` | identyczna odpowiedź dla brakującego i nieuprawnionego zasobu |
| Odpowiedź nie istnieje albo pytanie nie jest już widoczne | `404` | delete dotyczy tylko aktualnego, kanonicznego stanu |
| Inspekcja jest completed albo zablokowana przez konflikt | `409` | wymagany reopen albo ponowienie po odświeżeniu |
| Nieoczekiwany błąd bazy albo mappera | `500` | fallback |

### Rejestrowanie błędów

Aktualny plan bazy danych nie definiuje osobnej tabeli błędów, więc nie ma podstaw do zapisywania tam error events. Dla tego endpointu zalecane jest:

- użycie strukturalnych logów aplikacyjnych w Nitro,
- logowanie tylko metadanych technicznych,
- traktowanie błędów jako obserwowalności operacyjnej, nie jako osobnego modelu danych,
- jeżeli w przyszłości powstanie tabela audytowa, zapisywać wyłącznie `requestId`, `userId`, `inspectionId`, `questionId`, status i kod błędu, bez pełnych payloadów.

## 7. Wydajność

### Profil kosztu endpointu

Mutacja jednej odpowiedzi powinna mieć niski koszt:

- jeden odczyt minimalnego rekordu inspekcji,
- jedna weryfikacja widoczności pytania na podstawie kanonicznego snapshotu,
- jedna atomowa operacja zapisu,
- jedno przeliczenie metryk odpowiedzi.

### Zalecenia optymalizacyjne

- pobierać z `public.inspections` tylko kolumny potrzebne do ownership, statusu, snapshotu i wersji,
- nie odczytywać pełnego detail view ani resolved questions endpointu, jeżeli wystarczy lokalna resolucja widoczności,
- wykorzystywać build-time question bank artifact z repo, a nie parsować markdown przy każdym requestcie,
- aktualizować tylko mapę `answers` w JSONB, bez dotykania niepowiązanych części rekordu,
- short-circuitować no-op `PUT`, żeby nie bumpować `snapshotVersion` i `updated_at` bez realnej zmiany,
- nie wykonywać smart pruning, bo answer mutation nie wpływa na widoczność grup ani pytań.

### Cache i SSR

- odpowiedzi mutacyjne są prywatne i nie powinny trafiać do wspólnego cache,
- `Cache-Control: private, no-store` jest wystarczające dla tej klasy endpointów,
- metryki `progress` i `scoreDistribution` powinny być liczone w pamięci na podstawie bieżącego snapshotu, bez dodatkowej rundy do bazy.

## 8. Kroki implementacji

1. Dodać do `shared/contracts/inspections.ts` nowe schematy dla `InspectionQuestionRouteParams`, `PutInspectionAnswerCommand`, `PutInspectionAnswerResult` i odpowiedzi dla `PUT` oraz `DELETE`.
2. Rozszerzyć `app/types.ts` o typy wyprowadzone z tych schematów albo zastąpić ręcznie utrzymywane DTO aliasami do `z.infer`.
3. Wydzielić wspólne pure helpers dla `computeProgress` i `computeScoreDistribution` z `get-inspection-detail.ts` do osobnego modułu serwerowego, żeby answer mutations mogły je współdzielić.
4. Zaimplementować `save-inspection-answer.ts` i `delete-inspection-answer.ts` z explicit ownership check, status guardem, visibility checkiem, no-op short circuit dla `PUT` i atomicznym RPC do Postgresa.
5. Utworzyć handler `server/api/v1/inspections/[inspectionId]/answers/[questionId]/index.put.ts`, który stosuje `assertMutationOrigin`, `getRequiredUserId`, `getValidatedRouterParams` i `safeParse` body, aby rozróżnić `400` od `422`.
6. Utworzyć handler `server/api/v1/inspections/[inspectionId]/answers/[questionId]/index.delete.ts`, który nie polega na body i odrzuca brak uprawnień, brak zasobu oraz konflikt stanu zgodnie ze specyfikacją.
7. Dodać funkcje SQL, np. `save_inspection_answer` i `delete_inspection_answer`, które aktualizują JSONB snapshot atomowo i nie zmieniają niepowiązanych pól.
8. Ustalić i udokumentować semantykę `client_updated_at` dla `DELETE`, bo publiczny kontrakt nie przenosi `clientUpdatedAt` w body.
9. Dodać testy handlerów i helperów dla najważniejszych scenariuszy: sukces, invalid enum, niewidoczne pytanie, stale `baseSnapshotVersion`, no-op `PUT`, brak odpowiedzi przy `DELETE`, unauthorized, completed inspection i konflikt zapisu.
10. Zweryfikować, że odpowiedzi końcowe zachowują dokładnie te pola, które definiuje specyfikacja API, oraz że `completionRate` i `scoreDistribution` liczą się tak samo jak w istniejących endpointach inspekcji.