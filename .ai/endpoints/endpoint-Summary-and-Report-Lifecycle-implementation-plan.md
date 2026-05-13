# API Endpoint Implementation Plan: Summary and Report Lifecycle

## 1. Przegląd punktu końcowego

Sekcja Summary and Report Lifecycle obejmuje trzy powiązane endpointy tego samego zasobu `Inspection`:

- `GET /api/v1/inspections/{inspectionId}/summary`
- `POST /api/v1/inspections/{inspectionId}/finalize`
- `POST /api/v1/inspections/{inspectionId}/reopen`

To jest jeden spójny obszar domenowy, bo wszystkie trzy endpointy operują na tym samym kanonicznym rekordzie `public.inspections`, korzystają z tych samych zasad ownership i optimistic concurrency oraz współdzielą pojęcia `status`, `mode`, `snapshotVersion` i `completedAt`.

Zakres odpowiedzialności:

- `summary` zwraca raportowy widok inspekcji: globalny rozkład odpowiedzi, rozkłady per part, progress oraz opcjonalne wiersze pytań do edycji.
- `finalize` przełącza inspekcję z `draft` do `completed` po jawnym potwierdzeniu użytkownika.
- `reopen` przełącza inspekcję z `completed` z powrotem do `draft` po jawnym potwierdzeniu użytkownika.

Docelowa lokalizacja handlerów, zgodnie z aktualnym layoutem Nitro dla dynamicznych zasobów z podtrasami:

- `server/api/v1/inspections/[inspectionId]/summary.get.ts`
- `server/api/v1/inspections/[inspectionId]/finalize.post.ts`
- `server/api/v1/inspections/[inspectionId]/reopen.post.ts`

Rekomendowany podział odpowiedzialności:

- cienkie handlery HTTP w `server/api/v1/...`
- osobne serwisy domenowe w `server/utils/services/`
- współdzielone kontrakty Zod w `shared/contracts/inspections.ts`
- atomowe przejścia statusu przez prywatne funkcje SQL / RPC, jeśli jeszcze nie istnieją

Najważniejsza obserwacja o stanie repo:

- `app/types.ts` ma już DTO i command modele dla `InspectionSummaryDto`, `FinalizeInspectionCommand`, `ReopenInspectionCommand` oraz odpowiadające response DTO.
- `shared/contracts/inspections.ts` ma już wiele kontraktów dla innych endpointów inspekcji, ale plan powinien zakładać dopisanie brakujących schematów Zod dla `summary`, `finalize` i `reopen`.
- istniejące mutacje już respektują regułę domenową: inspekcja `completed` nie może być edytowana i wymaga `reopen` przed kolejną zmianą.

## 2. Szczegóły żądania

### GET /api/v1/inspections/{inspectionId}/summary

- Metoda HTTP: `GET`
- URL: `/api/v1/inspections/{inspectionId}/summary`
- Auth: wymagana aktywna sesja Supabase rozpoznawana po stronie serwera
- Route params:
  - wymagane: `inspectionId` jako UUID
- Query params:
  - opcjonalne: `include`
  - dozwolone wartości: `questions`, `notes`
- Request body: brak

Rekomendowany kontrakt query:

- dodać `InspectionSummaryExpansionSchema = z.enum(["questions", "notes"])`
- dodać `GetInspectionSummaryQuerySchema`, która parsuje `include` z listy comma-separated do tablicy tokenów
- nieznane tokeny zwracać jako `400 Bad Request`

Rekomendowana reguła semantyczna dla `include`:

- bez `include` endpoint zwraca tylko zagregowane dane summary bez pola `questions`
- `include=questions` dołącza `questions[]`
- `include=questions,notes` dołącza `questions[]` wraz z `questionNote`
- `include=notes` bez `questions` najlepiej odrzucić jako `400`, bo `notes` są rozszerzeniem wierszy pytań, a nie osobnym top-level zasobem

### POST /api/v1/inspections/{inspectionId}/finalize

- Metoda HTTP: `POST`
- URL: `/api/v1/inspections/{inspectionId}/finalize`
- Auth: wymagana aktywna sesja Supabase rozpoznawana po stronie serwera
- Route params:
  - wymagane: `inspectionId` jako UUID
- Query params: brak
- Request body:

```json
{
  "confirmation": "FINALIZE_INSPECTION",
  "baseSnapshotVersion": 13
}
```

Walidacja wejścia:

- `confirmation` musi mieć dokładnie wartość `FINALIZE_INSPECTION`
- `baseSnapshotVersion` musi być dodatnią liczbą całkowitą
- body musi być ścisłym obiektem JSON bez nieznanych pól

### POST /api/v1/inspections/{inspectionId}/reopen

- Metoda HTTP: `POST`
- URL: `/api/v1/inspections/{inspectionId}/reopen`
- Auth: wymagana aktywna sesja Supabase rozpoznawana po stronie serwera
- Route params:
  - wymagane: `inspectionId` jako UUID
- Query params: brak
- Request body:

```json
{
  "confirmation": "REOPEN_INSPECTION",
  "baseSnapshotVersion": 14
}
```

Walidacja wejścia:

- `confirmation` musi mieć dokładnie wartość `REOPEN_INSPECTION`
- `baseSnapshotVersion` musi być dodatnią liczbą całkowitą
- body musi być ścisłym obiektem JSON bez nieznanych pól

### Wymagane DTO i Command modele

Istniejące typy w `app/types.ts`, które należy wykorzystać lub zachować jako źródło zgodności:

- `InspectionSummaryDto`
- `InspectionSummaryPartDto`
- `InspectionSummaryQuestionDto`
- `GetInspectionSummaryResponseDto`
- `FinalizeInspectionCommand`
- `FinalizeInspectionResultDto`
- `FinalizeInspectionResponseDto`
- `ReopenInspectionCommand`
- `ReopenInspectionResultDto`
- `ReopenInspectionResponseDto`

Brakujące lub wymagające doprecyzowania kontrakty runtime w `shared/contracts/inspections.ts`:

- `InspectionSummaryExpansionSchema`
- `GetInspectionSummaryQuerySchema`
- `InspectionSummaryPartSchema`
- `InspectionSummaryQuestionSchema`
- `InspectionSummarySchema`
- `GetInspectionSummaryResponseSchema`
- `FinalizeInspectionCommandSchema`
- `FinalizeInspectionResultSchema`
- `FinalizeInspectionResponseSchema`
- `ReopenInspectionCommandSchema`
- `ReopenInspectionResultSchema`
- `ReopenInspectionResponseSchema`

Do route params należy ponownie użyć istniejącego `InspectionRouteParamsSchema` zamiast definiować osobny wariant.

## 3. Szczegóły odpowiedzi

### GET /api/v1/inspections/{inspectionId}/summary

Sukces: `200 OK`

Odpowiedź powinna mieć kopertę `ApiSuccessResponseDto<InspectionSummaryDto>` i zawierać:

- `inspectionId`
- `title`
- `status`
- `mode`
- `totalScoreDistribution`
- `parts[]`
- `progress`
- opcjonalne `questions[]`

Ważne reguły mapowania:

- `mode = editable`, gdy `status = draft`
- `mode = report`, gdy `status = completed`
- `questions` pojawia się tylko wtedy, gdy klient jawnie poprosi o `include=questions`
- `questionNote` pojawia się tylko wtedy, gdy klient poprosi o `include=notes`
- `questions[].editable` powinno wynikać z trybu inspekcji, czyli dla MVP być równoważne `status === "draft"`
- `questions[].answer` powinno używać tej samej wartości co snapshot i kontrakty answer endpointów: `yes | no | dont_know`
- `totalScoreDistribution` i `parts[].scoreDistribution` pozostają w formacie agregatu DTO: `yes`, `no`, `dontKnow`

### POST /api/v1/inspections/{inspectionId}/finalize

Sukces: `200 OK`

Odpowiedź powinna mieć kopertę `ApiSuccessResponseDto<FinalizeInspectionResultDto>` i zawierać:

- `inspectionId`
- `status: "completed"`
- `completedAt` jako ISO 8601 UTC string
- `mode: "report"`
- `snapshotVersion` po udanej zmianie stanu

### POST /api/v1/inspections/{inspectionId}/reopen

Sukces: `200 OK`

Odpowiedź powinna mieć kopertę `ApiSuccessResponseDto<ReopenInspectionResultDto>` i zawierać:

- `inspectionId`
- `status: "draft"`
- `completedAt: null`
- `mode: "editable"`
- `snapshotVersion` po udanej zmianie stanu

### Mapowanie odpowiedzi do kontraktów Zod

Plan powinien zakładać, że handler nie zwraca "gołych" obiektów bez kontraktu. Każdy endpoint powinien kończyć się strukturą zgodną z dedykowanym response schema z `shared/contracts/inspections.ts`, tak samo jak istniejące endpointy inspekcji.

## 4. Przepływ danych

### Wspólne elementy wykonania

Wszystkie trzy endpointy powinny używać tego samego szkieletu wykonania:

1. `useRuntimeConfig(event)` na początku handlera.
2. Walidacja route params przez `getValidatedRouterParams(... InspectionRouteParamsSchema.parse ...)`.
3. Dla endpointów `POST` dodatkowo `assertMutationOrigin(event)` przed wejściem w logikę domenową.
4. Rozwiązanie użytkownika przez istniejący helper auth, preferencyjnie `getRequiredUserId(event)`.
5. Wywołanie serwisu domenowego z `event`, `userId`, `inspectionId`, zwalidowanym command/query i `requestId`.
6. Zwrócenie `Cache-Control: private, no-store` dla danych prywatnych.

Kluczowa reguła dostępu do danych:

- RLS na `public.inspections` jest obecnie wyłączone, więc każdy odczyt i każda mutacja musi używać jawnego filtra `.eq("user_id", userId)` albo prywatnej funkcji SQL, która taki ownership check wymusza wewnętrznie.

### Rekomendowana ekstrakcja logiki do serwisów

Nowe serwisy:

- `server/utils/services/get-inspection-summary.ts`
- `server/utils/services/finalize-inspection.ts`
- `server/utils/services/reopen-inspection.ts`

Wspólne helpery, które warto wydzielić lub rozbudować:

- `server/utils/services/load-owned-inspection.ts` albo podobny helper do pobrania minimalnego zestawu kolumn z `public.inspections`
- `server/utils/services/build-inspection-summary.ts` do czystego mapowania wiersza DB i question banku do `InspectionSummaryDto`
- `server/utils/services/assert-inspection-lifecycle.ts` do reguł typu `canFinalize` i `canReopen`

To pozwoli uniknąć dublowania logiki pomiędzy `summary`, `detail`, przyszłym report view i endpointami lifecycle.

### Przepływ GET /summary

1. Handler waliduje `inspectionId` i query `include`.
2. Serwis pobiera minimalny rekord inspekcji potrzebny do summary:
   - `id`, `title`, `status`, `question_bank_version`, `snapshot`, `snapshot_version`, `completed_at`
   - opcjonalnie tylko te kolumny projekcyjne, które są potrzebne do walidacji stanu lub przyszłych rozszerzeń
3. Serwis odczytuje z `snapshot`:
   - `answers`
   - `question_notes`
   - `visible_group_ids`
   - `visible_question_ids`
4. Serwis wylicza `totalScoreDistribution` i `progress`, najlepiej przez reuse istniejących helperów `computeScoreDistribution` i `computeProgress`.
5. Serwis wylicza `parts[].scoreDistribution` w jednym przebiegu po `visibleQuestionIds`, używając statycznych singletonów z `server/utils/question-bank.ts` (`QUESTIONS`, `QUESTION_TEXT_BY_ID` i metadanych grup/partów), bez dodatkowych zapytań i bez parsowania plików w runtime.
6. Gdy klient zażąda `include=questions`, serwis buduje `questions[]` na podstawie `visibleQuestionIds`, `QUESTIONS` i `QUESTION_TEXT_BY_ID`:
   - `questionId`
   - `part`
   - `groupId`
   - `text`
   - `answer`
   - `editable`
   - opcjonalnie `questionNote`
7. Serwis mapuje `status` na `mode`.
8. Handler zwraca `200 OK` w kopercie sukcesu.

Ważna decyzja implementacyjna:

- summary nie powinno wywoływać resolved-questions per part ani wykonywać N+1 odczytów. Wszystkie dane potrzebne do zbudowania raportu są już dostępne w snapshotcie i build-time question banku.

### Przepływ POST /finalize

1. Handler waliduje `inspectionId` oraz body przez `safeParse` i zamienia błędy walidacji na `400`.
2. Handler uruchamia `assertMutationOrigin(event)` i auth guard.
3. Serwis wykonuje preflight read minimalnego stanu inspekcji: `status`, `snapshot_version`, `completed_at`, `snapshot`, `user_id`.
4. Serwis porównuje `baseSnapshotVersion` z aktualnym `snapshot_version`.
5. Serwis wywołuje regułę `assertInspectionCanBeFinalized(...)`.
6. Po przejściu walidacji serwis wykonuje atomową zmianę statusu do `completed`.
7. Serwis zwraca nowy stan lifecycle: `status`, `completedAt`, `mode`, `snapshotVersion`.

Rekomendacja dla warstwy zapisu:

- ponieważ finalize jest przejściem stanu wymagającym ownership check, optimistic concurrency i inkrementacji `snapshot_version`, najlepszym rozwiązaniem jest prywatna funkcja SQL / RPC, np. `private.finalize_inspection(...)`, dodana przez nową migrację w `supabase/migrations/`.
- serwis `finalize-inspection.ts` powinien opakować wywołanie RPC i mapować błędy domenowe (`NOT_FOUND`, `SNAPSHOT_CONFLICT`, `INVALID_STATE`) na właściwe statusy HTTP.

Rekomendowana minimalna reguła `assertInspectionCanBeFinalized(...)`:

- inspekcja istnieje i należy do bieżącego użytkownika
- `status === "draft"`
- `baseSnapshotVersion` zgadza się z aktualnym snapshotem
- snapshot jest wewnętrznie spójny i gotowy do zamrożenia

Jeżeli produkt ma wymagać pełnej kompletności przed finalizacją, ten warunek musi być zamknięty wyłącznie w tym helperze, nie rozsiany po handlerach. Obecna specyfikacja nie wymusza 100% completion, więc plan powinien traktować tę regułę jako pojedynczy punkt rozszerzenia polityki biznesowej.

### Przepływ POST /reopen

1. Handler waliduje `inspectionId` oraz body przez `safeParse` i zamienia błędy walidacji na `400`.
2. Handler uruchamia `assertMutationOrigin(event)` i auth guard.
3. Serwis wykonuje preflight read minimalnego stanu inspekcji: `status`, `snapshot_version`, `completed_at`, `user_id`.
4. Serwis porównuje `baseSnapshotVersion` z aktualnym `snapshot_version`.
5. Serwis wywołuje regułę `assertInspectionCanBeReopened(...)`.
6. Po przejściu walidacji serwis wykonuje atomową zmianę statusu do `draft` oraz zeruje `completed_at`.
7. Serwis zwraca nowy stan lifecycle: `status`, `completedAt`, `mode`, `snapshotVersion`.

Analogicznie do finalizacji, rekomendowany jest prywatny RPC `private.reopen_inspection(...)` z mapowaniem błędów po stronie serwisu.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- wszystkie trzy endpointy wymagają aktywnej sesji Supabase przechowywanej w SSR cookies
- `inspectionId` jest parametrem nieufnym i musi przejść walidację UUID
- ownership musi być weryfikowany wyłącznie po stronie serwera
- nie wolno ufać żadnym polom typu `status`, `mode`, `userId` przesyłanym przez klienta

### Ochrona mutacji

- `finalize` i `reopen` są state-changing, więc muszą używać `assertMutationOrigin(event)`
- body powinno być parsowane jako ścisły JSON object; brak body, invalid JSON i extra keys muszą kończyć się `400`
- body size dla command endpointów jest małe, ale nadal warto opierać się na standardowym limicie JSON body dla Nitro

### Granice uprzywilejowania

- service-role i ewentualne RPC pozostają wyłącznie w `server/`
- jeśli używana jest prywatna funkcja SQL, musi być umieszczona w nieeksponowanym schemacie typu `private`
- klient nie może nigdy sam ustawiać `completed_at`, `status` ani `snapshot_version`

### Prywatność i cache

- odpowiedzi `summary` są prywatne i nie mogą trafiać do publicznego cache
- odpowiedzi `finalize` i `reopen` również powinny mieć `Cache-Control: private, no-store`
- logi nie powinny zawierać pełnego snapshotu, global notes ani treści notatek pytaniowych

### Ryzyka bezpieczeństwa specyficzne dla tego zakresu

- ominięcie ownership check przy wyłączonym RLS na `public.inspections`
- niejawne przejścia stanu bez optimistic concurrency, co mogłoby nadpisać nowszą wersję snapshotu
- dopuszczenie `reopen` lub `finalize` bez walidacji `Origin` / `Referer` w modelu cookie auth
- dublowanie logiki state transition w kilku miejscach, co zwiększa ryzyko niespójnych reguł biznesowych

## 6. Obsługa błędów

### GET /api/v1/inspections/{inspectionId}/summary

- `200 OK` dla poprawnego odczytu
- `400 Bad Request` dla niepoprawnego `inspectionId` lub nieznanych tokenów `include`
- `401 Unauthorized` dla braku aktywnej sesji
- `404 Not Found` gdy inspekcja nie istnieje lub nie należy do bieżącego użytkownika
- `500 Internal Server Error` dla błędów bazy, mapowania lub nieoczekiwanych wyjątków

### POST /api/v1/inspections/{inspectionId}/finalize

- `200 OK` dla poprawnej finalizacji
- `400 Bad Request` dla brakującego body, błędnego JSON, extra keys lub niepoprawnego `confirmation`
- `401 Unauthorized` dla braku aktywnej sesji
- `404 Not Found` gdy inspekcja nie istnieje lub nie należy do bieżącego użytkownika
- `409 Conflict` dla stale `baseSnapshotVersion` albo próby finalizacji inspekcji, która została już zmieniona w międzyczasie
- `422 Unprocessable Entity` gdy inspekcja jest w stanie biznesowo niepozwalającym na finalizację
- `500 Internal Server Error` dla nieoczekiwanych błędów po stronie serwera

Przykłady scenariuszy `422` dla finalizacji:

- snapshot nie spełnia minimalnych reguł gotowości do finalizacji
- status technicznie jest `draft`, ale inspekcja nie ma spójnego stanu wymaganego przez politykę biznesową

### POST /api/v1/inspections/{inspectionId}/reopen

- `200 OK` dla poprawnego reopen
- `400 Bad Request` dla brakującego body, błędnego JSON, extra keys lub niepoprawnego `confirmation`
- `401 Unauthorized` dla braku aktywnej sesji
- `404 Not Found` gdy inspekcja nie istnieje lub nie należy do bieżącego użytkownika
- `409 Conflict` dla stale `baseSnapshotVersion` albo próby reopen inspekcji, która nie jest już `completed`
- `500 Internal Server Error` dla nieoczekiwanych błędów po stronie serwera

### Rejestrowanie błędów

W aktualnym modelu danych nie ma tabeli błędów ani audytu, więc ten zakres nie powinien dodawać nowej tabeli tylko po to, aby obsłużyć te trzy endpointy.

Zalecane logowanie:

- strukturalne `console.error` / `console.warn` w stylu już obecnym w serwisach repo
- kontekst: `endpoint`, `requestId`, `userId`, `inspectionId`, `errorCode`, `errorMessage`
- osobne logi dla sukcesu i porażki `finalize` / `reopen`, bo to ważne zdarzenia lifecycle

Nie logować:

- całego `snapshot`
- `globalNotes`
- treści `questionNotes`
- żadnych sekretów, cookie ani tokenów

## 7. Wydajność

### GET /summary

- powinien wykonywać jeden odczyt z `public.inspections`
- powinien bazować na build-time question banku załadowanym jako singleton modułu, a nie czytać plików w runtime
- powinien liczyć agregaty w jednym lub maksymalnie dwóch przebiegach po `visibleQuestionIds`
- nie powinien wykonywać dodatkowych odczytów per part ani per question

Rekomendacja implementacyjna:

- użyć minimalnego `select(...)`, zamiast pobierać cały rekord detail, jeśli nie jest to potrzebne
- jeśli część logiki z `get-inspection-detail.ts` ma być współdzielona, wydzielić helper mapujący snapshot do wspólnego formatu zamiast dublować cały handler

### POST /finalize i POST /reopen

- każda operacja powinna kończyć się pojedynczym atomowym update albo pojedynczym RPC po krótkim preflight check
- nie wykonywać ręcznych wieloetapowych update'ów bez concurrency guard
- nie wykonywać zbędnych odczytów agregatów summary podczas state transition

### Indeksy i koszt zapytań

- `inspections_pkey` wspiera lookup po `id`
- indeksy po `user_id` i `status` są wystarczające dla ownership i dashboardowych scenariuszy
- dla tego zakresu nie ma potrzeby dodawania indeksów GIN po `snapshot`

## 8. Kroki implementacji

1. Rozszerzyć `shared/contracts/inspections.ts` o brakujące schematy Zod dla `summary`, `finalize` i `reopen`, reuse'ując istniejące `InspectionRouteParamsSchema`, `InspectionScoreDistributionSchema`, `InspectionProgressSchema`, `InspectionStatusSchema` i `InspectionModeSchema`.
2. Potwierdzić zgodność `app/types.ts` z nowymi schematami i uzupełnić tylko brakujące aliasy lub result DTO, bez ręcznego dublowania typów wyprowadzanych z Zod.
3. Wydzielić lub dodać wspólny helper do pobrania minimalnego owned inspection row z jawnym filtrem `user_id`, aby nie powielać tego samego selecta w trzech serwisach.
4. Dodać `server/utils/services/get-inspection-summary.ts`, który buduje `InspectionSummaryDto` z `snapshot`, `status` i question bank singletonów.
5. Dodać `server/api/v1/inspections/[inspectionId]/summary.get.ts` z walidacją route params i query oraz mapowaniem błędów na `400/401/404/500`.
6. Dodać helper lifecycle, np. `assertInspectionCanBeFinalized` i `assertInspectionCanBeReopened`, żeby wszystkie reguły state transition były skupione w jednym miejscu.
7. Jeżeli repo nie ma jeszcze odpowiednich funkcji SQL, dodać migrację `supabase/migrations/<timestamp>_add_finalize_and_reopen_inspection_functions.sql` z prywatnymi funkcjami `private.finalize_inspection(...)` i `private.reopen_inspection(...)`.
8. Dodać `server/utils/services/finalize-inspection.ts`, który wykona preflight check, wywoła RPC finalizacji i zmapuje błędy domenowe na `404/409/422/500`.
9. Dodać `server/utils/services/reopen-inspection.ts`, który wykona preflight check, wywoła RPC reopen i zmapuje błędy domenowe na `404/409/500`.
10. Dodać `server/api/v1/inspections/[inspectionId]/finalize.post.ts` oraz `server/api/v1/inspections/[inspectionId]/reopen.post.ts` z `assertMutationOrigin(event)` i spójnym envelope response.
11. Dodać `test/nuxt/inspection-summary-get.test.ts` dla `200`, `400`, `401`, `404`, poprawnego `include`, poprawnych agregatów i poprawnego `editable`.
12. Dodać `test/nuxt/inspection-finalize-post.test.ts` dla `200`, `400`, `401`, `404`, `409`, `422` i poprawnego przejścia do `mode=report`.
13. Dodać `test/nuxt/inspection-reopen-post.test.ts` dla `200`, `400`, `401`, `404`, `409` i poprawnego przejścia do `mode=editable`.
14. Zweryfikować, że istniejące mutacje answers/notes/global-notes nadal blokują edycję inspekcji `completed`, a `reopen` rzeczywiście odblokowuje dalsze write endpointy.
15. Uruchomić wąski zestaw testów dla nowych plików oraz istniejących testów inspekcji, aby potwierdzić brak regresji w ownership, kontraktach DTO i mapowaniu `mode`.