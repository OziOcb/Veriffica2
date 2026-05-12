# API Endpoint Implementation Plan: Notes

## 1. Przegląd punktu końcowego

Plan obejmuje trzy mutacyjne endpointy podzasobów inspekcji:

- `PUT /api/v1/inspections/{inspectionId}/question-notes/{questionId}` zapisuje albo nadpisuje notatkę przypisaną do jednego pytania i jednocześnie aktualizuje `snapshot.global_notes` zgodnie z regułą jednokierunkowego mirroringu.
- `DELETE /api/v1/inspections/{inspectionId}/question-notes/{questionId}` usuwa notatkę pytania z `snapshot.question_notes` i utrzymuje spójność `snapshot.global_notes` bez parsowania ręcznych edycji użytkownika do struktury `question_notes`.
- `PUT /api/v1/inspections/{inspectionId}/global-notes` zastępuje cały dokument `snapshot.global_notes`, ale nie wolno mu odtwarzać ani modyfikować `snapshot.question_notes` na podstawie swobodnego tekstu.

Te trzy operacje są częścią tego samego kanonicznego modelu snapshotu co `part-1`, `runtime-flags` i `answers`. Implementacja powinna świadomie reuse'ować istniejący wzorzec z endpointów odpowiedzi:

- cienki handler Nitro na granicy HTTP,
- kontrakty Zod w `shared/contracts/inspections.ts`,
- serwis z prefetch + guardami domenowymi,
- atomowy zapis przez funkcję SQL / RPC z advisory lock,
- brak zaufania do klienta w kwestii ownership, edytowalności i visibility.

Rekomendowana lokalizacja implementacji:

- `server/api/v1/inspections/[inspectionId]/question-notes/[questionId]/index.put.ts`
- `server/api/v1/inspections/[inspectionId]/question-notes/[questionId]/index.delete.ts`
- `server/api/v1/inspections/[inspectionId]/global-notes.put.ts`
- `server/utils/services/save-inspection-question-note.ts`
- `server/utils/services/delete-inspection-question-note.ts`
- `server/utils/services/save-inspection-global-notes.ts`
- `server/utils/services/inspection-note-document.ts` jako pure helper do mirroringu i usuwania fragmentów z dokumentu globalnego
- `shared/contracts/inspections.ts` dla schematów request/response
- nowa migracja w `supabase/migrations/` z funkcjami RPC dla notatek

Ważna reguła domenowa, która musi zostać zachowana w całej implementacji:

- `question_notes` i `global_notes` są odrębnymi polami snapshotu,
- zapis notatki z karty pytania aktualizuje oba pola,
- ręczna edycja `global_notes` nie propaguje się z powrotem do `question_notes`,
- serwer nie może próbować dwukierunkowo parsować semantyki między tymi polami.

## 2. Szczegóły żądania

### 2.1 `PUT /api/v1/inspections/{inspectionId}/question-notes/{questionId}`

- Metoda HTTP: `PUT`
- URL: `/api/v1/inspections/{inspectionId}/question-notes/{questionId}`
- Auth: wymagana aktywna sesja Supabase SSR
- Query params: brak

#### Wymagane parametry

| Element | Wymagany | Walidacja |
| --- | --- | --- |
| `inspectionId` | tak | `uuid` |
| `questionId` | tak | syntaktycznie `q_[a-z0-9_]+`, semantycznie pytanie musi należeć do bieżącego `visible_question_ids` |
| `note` | tak | string po normalizacji `trim`, rekomendowane `1..500` znaków |
| `baseSnapshotVersion` | tak | dodatni integer |
| `clientUpdatedAt` | tak | poprawny ISO 8601 UTC z offsetem |

#### Request body

```json
{
  "note": "Small paint mismatch near the rear door.",
  "baseSnapshotVersion": 10,
  "clientUpdatedAt": "2026-05-01T12:58:00Z"
}
```

#### Reguły walidacji

- body musi być obiektem JSON; `null`, tablica i niepoprawny JSON kończą się `400 Bad Request`,
- schema powinna być `z.strictObject(...)`, żeby odrzucać nieznane pola,
- `note` powinno być przycięte na wejściu; rekomendacja implementacyjna: pusty string po `trim` odrzucić jako `422`, ponieważ usuwanie notatki ma osobny endpoint `DELETE`,
- `questionId` przechodzi walidację semantyczną dopiero w serwisie względem aktualnego snapshotu,
- jeśli pytanie nie jest aktualnie widoczne, endpoint zwraca `422 Unprocessable Entity`,
- jeśli snapshot version jest przestarzały, endpoint zwraca `409 Conflict`.

### 2.2 `DELETE /api/v1/inspections/{inspectionId}/question-notes/{questionId}`

- Metoda HTTP: `DELETE`
- URL: `/api/v1/inspections/{inspectionId}/question-notes/{questionId}`
- Auth: wymagana aktywna sesja Supabase SSR
- Query params: brak
- Request body: brak

#### Wymagane parametry

| Element | Wymagany | Walidacja |
| --- | --- | --- |
| `inspectionId` | tak | `uuid` |
| `questionId` | tak | syntaktycznie `q_[a-z0-9_]+`; semantycznie endpoint ma działać tylko dla istniejącej notatki pytania w bieżącej inspekcji |

#### Reguły walidacji

- handler nie powinien polegać na body,
- jeśli `questionId` nie jest już widoczne albo nie ma notatki dla tego pytania, rekomendowane jest `404 Not Found`,
- brak `baseSnapshotVersion` oznacza, że konflikt wersji nie jest tu klientowi sygnalizowany przez token optimistic concurrency; `409` pozostaje właściwe dla stanu `completed` albo dla innych lokalnych blokad domenowych.

### 2.3 `PUT /api/v1/inspections/{inspectionId}/global-notes`

- Metoda HTTP: `PUT`
- URL: `/api/v1/inspections/{inspectionId}/global-notes`
- Auth: wymagana aktywna sesja Supabase SSR
- Query params: brak

#### Wymagane parametry

| Element | Wymagany | Walidacja |
| --- | --- | --- |
| `inspectionId` | tak | `uuid` |
| `globalNotes` | tak | string `0..10000` znaków |
| `baseSnapshotVersion` | tak | dodatni integer |
| `clientUpdatedAt` | tak | poprawny ISO 8601 UTC z offsetem |

#### Request body

```json
{
  "globalNotes": "Overall clean interior. Minor tire wear.",
  "baseSnapshotVersion": 12,
  "clientUpdatedAt": "2026-05-01T13:00:00Z"
}
```

#### Reguły walidacji

- body musi być obiektem JSON,
- `globalNotes` może być pustym stringiem, bo kontrakt pozwala wyczyścić dokument,
- długość powyżej `10000` znaków kończy się `422 Unprocessable Entity`,
- endpoint nie może modyfikować `question_notes` na podstawie tekstu `globalNotes`, nawet jeśli treść wygląda jak wcześniejszy fragment wygenerowany z notatki pytania,
- `baseSnapshotVersion` wymusza optimistic concurrency analogicznie do `PUT answer` i `PUT part-1`.

### 2.4 Wymagane typy DTO i modele command

Repo ma już zgodne DTO w `app/types.ts`, które należy potraktować jako kontrakt docelowy warstwy aplikacyjnej:

- `PutInspectionQuestionNoteCommand`
- `PutInspectionGlobalNotesCommand`
- `PutInspectionQuestionNoteResultDto`
- `DeleteInspectionQuestionNoteResultDto`
- `PutInspectionGlobalNotesResultDto`
- `PutInspectionQuestionNoteResponseDto`
- `DeleteInspectionQuestionNoteResponseDto`
- `PutInspectionGlobalNotesResponseDto`

W `shared/contracts/inspections.ts` należy dodać brakujące schematy Zod i typy wyprowadzane z tych schematów:

- `QuestionNoteTextSchema` jako schema dla pojedynczej notatki pytania,
- `GlobalNotesTextSchema` jako schema dla dokumentu globalnego,
- `PutInspectionQuestionNoteCommandSchema`,
- `PutInspectionQuestionNoteResultSchema`,
- `PutInspectionQuestionNoteResponseSchema`,
- `DeleteInspectionQuestionNoteResultSchema`,
- `DeleteInspectionQuestionNoteResponseSchema`,
- `PutInspectionGlobalNotesCommandSchema`,
- `PutInspectionGlobalNotesResultSchema`,
- `PutInspectionGlobalNotesResponseSchema`.

Schematy route params powinny reuse'ować istniejące definicje:

- `InspectionQuestionRouteParamsSchema` dla endpointów `question-notes`,
- `InspectionRouteParamsSchema` dla endpointu `global-notes`.

Źródłem prawdy dla walidacji runtime mają być schematy Zod w `shared/contracts`, a nie ręcznie utrzymywane równoległe interfejsy.

## 3. Szczegóły odpowiedzi

### 3.1 `PUT question-note` — `200 OK`

```json
{
  "data": {
    "inspectionId": "uuid",
    "questionId": "q_body_panel_gaps",
    "questionNote": "Small paint mismatch near the rear door.",
    "globalNotes": "## Do the body panel gaps look even?\nSmall paint mismatch near the rear door.",
    "snapshotVersion": 11
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:58:00Z"
  }
}
```

Zasady odpowiedzi:

- `questionNote` zwraca znormalizowaną wartość zapisaną w `snapshot.question_notes[questionId]`,
- `globalNotes` zwraca kanoniczny dokument po jednokierunkowym mirroringu,
- `snapshotVersion` rośnie tylko przy realnej zmianie `question_notes` lub `global_notes`,
- identyczny `PUT` powinien zwracać bieżący `snapshotVersion` bez write path, jeśli stan końcowy dokumentu i notatki jest identyczny.

### 3.2 `DELETE question-note` — `200 OK`

```json
{
  "data": {
    "inspectionId": "uuid",
    "questionId": "q_body_panel_gaps",
    "deleted": true,
    "snapshotVersion": 12
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:59:00Z"
  }
}
```

Zasady odpowiedzi:

- `deleted` ma być literalnie `true`,
- brak notatki nie powinien być cichym no-op; rekomendowane `404 Not Found`,
- mimo że kontrakt odpowiedzi nie zwraca `globalNotes`, serwis nadal powinien doprowadzić `snapshot.global_notes` do spójnego stanu zgodnego z przyjętą strategią mirroringu.

### 3.3 `PUT global-notes` — `200 OK`

```json
{
  "data": {
    "inspectionId": "uuid",
    "globalNotes": "Overall clean interior. Minor tire wear.",
    "snapshotVersion": 13
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:00:00Z"
  }
}
```

Zasady odpowiedzi:

- endpoint zwraca wyłącznie finalny `globalNotes` i nowy `snapshotVersion`,
- zapis identycznego dokumentu powinien być no-op bez bumpu wersji,
- odpowiedź nie może zwracać zrekonstruowanych `questionNotes`, bo ten endpoint nie ma prawa ich wytwarzać z tekstu globalnego.

### 3.4 Kody statusu

#### `PUT question-note`

- `200 OK` — poprawny zapis albo no-op z identycznym stanem końcowym,
- `400 Bad Request` — niepoprawny JSON, body nie jest obiektem, route params są syntaktycznie błędne,
- `401 Unauthorized` — brak aktywnej sesji,
- `404 Not Found` — inspekcja nie istnieje albo nie należy do bieżącego użytkownika,
- `409 Conflict` — inspekcja jest `completed` albo `baseSnapshotVersion` jest przestarzały,
- `422 Unprocessable Entity` — `note` przekracza limit, jest pusty po trim, albo pytanie nie jest widoczne,
- `500 Internal Server Error` — nieoczekiwany błąd bazy, RPC lub niespójność question banku.

#### `DELETE question-note`

- `200 OK` — poprawne usunięcie,
- `400 Bad Request` — błędne route params,
- `401 Unauthorized` — brak aktywnej sesji,
- `404 Not Found` — inspekcja nie istnieje, nie należy do użytkownika, pytanie nie jest już widoczne albo notatka nie istnieje,
- `409 Conflict` — inspekcja jest `completed` lub mutacja nie może zostać bezpiecznie wykonana,
- `500 Internal Server Error` — nieoczekiwany błąd serwera lub RPC.

#### `PUT global-notes`

- `200 OK` — poprawny zapis albo no-op,
- `400 Bad Request` — niepoprawny JSON, body nie jest obiektem, błędny `inspectionId`,
- `401 Unauthorized` — brak aktywnej sesji,
- `404 Not Found` — inspekcja nie istnieje albo nie należy do bieżącego użytkownika,
- `409 Conflict` — inspekcja jest `completed` albo `baseSnapshotVersion` jest przestarzały,
- `422 Unprocessable Entity` — `globalNotes` przekracza `10000` znaków,
- `500 Internal Server Error` — nieoczekiwany błąd serwera lub RPC.

## 4. Przepływ danych

### 4.1 Wspólny model wykonania

1. Żądanie trafia do handlera Nitro w `server/api/v1/...`.
2. Handler generuje `requestId`, wywołuje `useRuntimeConfig(event)` i ustawia odpowiedź jako `Cache-Control: private, no-store`.
3. Dla wszystkich trzech endpointów uruchamiane jest `assertMutationOrigin(event)`, bo autoryzacja opiera się o cookie SSR.
4. Handler pobiera użytkownika przez `getRequiredUserId(event)`.
5. Route params są walidowane Zodem przez `getValidatedRouterParams(...)`.
6. Dla `PUT` handler odczytuje body, rozróżniając błędy transportowe `400` od błędów kontraktu `422` tak samo, jak robią to obecne endpointy `answers`.
7. Handler deleguje wykonanie do serwisu i mapuje tylko błędy nieoczekiwane na `500`.
8. Serwis pracuje na service-role kliencie Supabase, bo RLS na `public.inspections` jest w repo wyłączone, więc ownership musi być wymuszone jawnie po `id + user_id`.

### 4.2 `PUT question-note`

1. Serwis pobiera `status`, `snapshot_version` i `snapshot` dla inspekcji filtrowanej po `inspectionId` i `userId`.
2. Jeżeli rekordu nie ma, zwraca `404`.
3. Jeżeli `status = completed`, zwraca `409` z kodem domenowym w stylu `INSPECTION_NOT_EDITABLE`.
4. Serwis porównuje `baseSnapshotVersion` z bieżącym `snapshot_version`; rozjazd kończy się `409 SNAPSHOT_CONFLICT`.
5. Z bieżącego snapshotu odczytywane są co najmniej:
   - `visible_question_ids`,
   - `question_notes`,
   - `global_notes`.
6. Jeżeli `questionId` nie należy do `visible_question_ids`, serwis zwraca `422`.
7. Serwis pobiera etykietę pytania z `QUESTION_TEXT_BY_ID`; brak tekstu dla widocznego pytania należy traktować jako błąd niezmiennika i zwrócić `500`, a nie `404`.
8. Pure helper z `inspection-note-document.ts` wylicza nowy dokument `globalNotes` na podstawie:
   - poprzedniego `global_notes`,
   - poprzedniej wartości notatki dla `questionId`,
   - nowej notatki,
   - canonical question label.
9. Helper musi realizować jednokierunkowy mirroring: aktualizować dokument globalny tak, aby notatka pytania była w nim widoczna, ale bez prób rekonstruowania `question_notes` z dowolnego tekstu użytkownika.
10. Jeżeli wynikowy `question_notes[questionId]` i `global_notes` byłyby identyczne jak w stanie bieżącym, serwis kończy się no-op bez wywołania RPC.
11. W przeciwnym razie serwis wywołuje dedykowaną funkcję SQL, rekomendacyjnie `public.save_inspection_question_note(...)`, przekazując:
   - `p_user_id`,
   - `p_inspection_id`,
   - `p_question_id`,
   - `p_note`,
   - `p_global_notes`,
   - `p_base_snapshot_version`,
   - `p_client_updated_at`.
12. Funkcja SQL pod advisory lockiem aktualizuje jednocześnie `snapshot.question_notes` i `snapshot.global_notes`; trigger `private.prepare_inspection_row` inkrementuje `snapshot_version` i stempluje `updated_at`.
13. Handler zwraca response envelope z nowym `snapshotVersion` i finalnym `globalNotes`.

### 4.3 `DELETE question-note`

1. Serwis pobiera bieżący rekord inspekcji analogicznie do `PUT`.
2. Sprawdza ownership i `status`.
3. Odczytuje `question_notes`, `global_notes` i `visible_question_ids`.
4. Jeżeli pytanie nie jest widoczne albo wpisu nie ma w `question_notes`, serwis zwraca `404`, co ogranicza wyciek informacji o stanie zestawu pytań.
5. Serwis pobiera tekst pytania z `QUESTION_TEXT_BY_ID` i wylicza nowy `global_notes` przez pure helper, który usuwa wygenerowany przez system fragment albo aktualizuje dokument w inny deterministyczny sposób, ale nie parsuje ręcznych edycji użytkownika do struktury mapy.
6. Funkcja SQL, rekomendacyjnie `public.delete_inspection_question_note(...)`, usuwa klucz z `snapshot.question_notes`, zapisuje nowy `snapshot.global_notes` i ustawia `client_updated_at = now()`, bo publiczny kontrakt `DELETE` nie przekazuje czasu klienta.
7. Odpowiedź pozostaje minimalna: `inspectionId`, `questionId`, `deleted`, `snapshotVersion`.

### 4.4 `PUT global-notes`

1. Serwis pobiera bieżący rekord inspekcji i sprawdza ownership.
2. Sprawdza `status` oraz `baseSnapshotVersion`.
3. Normalizuje `globalNotes` wyłącznie jako zwykły tekstowy dokument; nie wolno mu odczytywać z niego rzekomych notatek pytaniowych.
4. Jeżeli nowy dokument jest identyczny z aktualnym `snapshot.global_notes`, serwis zwraca no-op.
5. W przeciwnym razie serwis wywołuje RPC, rekomendacyjnie `public.save_inspection_global_notes(...)`, przekazując finalny tekst dokumentu oraz `clientUpdatedAt`.
6. Funkcja SQL aktualizuje wyłącznie `snapshot.global_notes` i `client_updated_at`; `snapshot.question_notes` pozostaje nienaruszone.

### 4.5 Ekstrakcja logiki do service i helperów

Najbardziej rozsądny podział odpowiedzialności:

- Handlery HTTP:
  - auth,
  - origin guard,
  - walidacja route params i body,
  - response envelope i mapowanie wyjątków.
- Serwisy:
  - ownership check,
  - edytowalność inspekcji,
  - optimistic concurrency dla obu `PUT`,
  - visibility guard dla `question-notes`,
  - no-op short-circuit,
  - wywołanie RPC,
  - logowanie błędów z kontekstem domenowym.
- Pure helper `inspection-note-document.ts`:
  - renderowanie fragmentu notatki pytania do postaci dokumentowej,
  - deterministyczne `upsert` w `global_notes`,
  - deterministyczne `remove` z `global_notes`,
  - brak side effectów, brak dostępu do bazy, brak zależności od H3.

Taki podział pozwoli reuse'ować logikę dokumentową także w przyszłym `/sync`, jeżeli snapshot offline będzie zawierał jednocześnie `questionNotes` i `globalNotes`.

### 4.6 Rekomendacja dla warstwy SQL

Analogicznie do istniejących funkcji `save_inspection_answer` i `delete_inspection_answer` należy dodać trzy funkcje `security definer` dostępne tylko dla `service_role`:

- `public.save_inspection_question_note(...)`
- `public.delete_inspection_question_note(...)`
- `public.save_inspection_global_notes(...)`

Wspólne wymagania dla tych funkcji:

- advisory lock wyliczany z `(user_id, inspection_id)`,
- wtórna weryfikacja ownership pod lockiem,
- wtórna weryfikacja `snapshot_version` dla obu `PUT`,
- brak logiki question banku po stronie SQL,
- SQL przyjmuje już finalny tekst `global_notes` obliczony w warstwie serwisowej,
- `execute` wyłącznie dla `service_role`,
- `snapshot_version` i `updated_at` pozostają pod kontrolą istniejącego triggera przygotowującego wiersz.

## 5. Względy bezpieczeństwa

### 5.1 Uwierzytelnianie i autoryzacja

- Wszystkie trzy endpointy muszą wymagać aktywnej sesji Supabase SSR.
- `userId` wolno ustalać wyłącznie po stronie serwera; nie przyjmować żadnych owner-identyfikatorów z klienta.
- Ponieważ RLS na `public.inspections` jest wyłączone, każda operacja musi filtrować rekord po `id + user_id` i dodatkowo powtórzyć ownership check w SQL RPC.

### 5.2 Ochrona przed CSRF i nadużyciami

- Każdy endpoint mutacyjny musi przechodzić przez `assertMutationOrigin(event)`.
- Należy utrzymać `Cache-Control: private, no-store` dla odpowiedzi prywatnych.
- Trzeba egzekwować rozsądny limit rozmiaru body, szczególnie dla `PUT global-notes`, aby 10 KB dokumentu nie oznaczało niekontrolowanego payloadu całego JSON.

### 5.3 Ochrona danych i prywatności

- Nie logować treści `note` ani pełnego `globalNotes`; logować tylko identyfikatory i długości payloadu, jeśli to potrzebne diagnostycznie.
- Nie zwracać surowych błędów Zod ani surowych komunikatów Postgresa.
- Nie używać service-role poza warstwą serwerową.

### 5.4 Bezpieczeństwo domenowe

- `PUT question-note` może działać tylko na pytaniach aktualnie widocznych.
- `PUT global-notes` nie może modyfikować `question_notes`; to chroni przed przypadkowym obejściem walidacji visibility przez wpisanie notatki w dokumencie globalnym.
- `DELETE question-note` nie może być cichym no-op, bo to utrudnia wykrywanie rozjazdów klient-serwer.

### 5.5 Brak tabeli błędów

Obecny model danych i specyfikacja nie definiują tabeli błędów. Plan nie powinien dodawać nowego persistence layer tylko do logowania awarii. Właściwą strategią jest:

- `console.error` z ustrukturyzowanym payloadem,
- logi platformowe Vercel / Nitro,
- logi bazy / Supabase dla błędów RPC.

## 6. Obsługa błędów

### 6.1 Scenariusze błędów i statusy

| Scenariusz | Status | Kod domenowy | Uwagi |
| --- | --- | --- | --- |
| Brak sesji | `401` | `UNAUTHORIZED` | Wspólny guard auth. |
| Niepoprawny `inspectionId` lub `questionId` | `400` | `BAD_REQUEST` | Route params nie przechodzą walidacji Zod. |
| Body nie jest JSON obiektem | `400` | `BAD_REQUEST` | Dotyczy obu `PUT`. |
| Inspekcja nie istnieje albo nie należy do usera | `404` | `NOT_FOUND` | Nie ujawniać, czy istnieje cudzy rekord. |
| Pytanie nie jest widoczne dla `PUT question-note` | `422` | `QUESTION_NOT_VISIBLE` | Semantyczna walidacja domenowa. |
| Notatka pytania nie istnieje przy `DELETE` | `404` | `NOT_FOUND` | Brak silent no-op. |
| Inspekcja jest `completed` | `409` | `INSPECTION_NOT_EDITABLE` | Dotyczy wszystkich trzech endpointów. |
| `baseSnapshotVersion` przestarzały | `409` | `SNAPSHOT_CONFLICT` | Dotyczy obu `PUT`. |
| `note` > 500 znaków | `422` | `VALIDATION_ERROR` | Walidacja Zod. |
| `globalNotes` > 10000 znaków | `422` | `VALIDATION_ERROR` | Walidacja Zod. |
| Brak tekstu pytania w `QUESTION_TEXT_BY_ID` dla widocznego `questionId` | `500` | `QUESTION_BANK_INVARIANT_BROKEN` | To błąd serwera, nie klienta. |
| RPC zwraca pusty zestaw wierszy albo nieoczekiwany błąd | `500` | `INTERNAL_SERVER_ERROR` | Logować z `requestId`. |

### 6.2 Strategia mapowania błędów

- Na granicy handlera używać `safeParse`, żeby zbudować przewidywalne `422` z listą błędów pól.
- W serwisie rzucać `createError(...)` dla błędów oczekiwanych (`404`, `409`, `422`).
- Nieoczekiwane wyjątki opakowywać w `500` po wcześniejszym logowaniu kontekstu.
- Helper tekstowy nie powinien rzucać błędów związanych z walidacją wejścia; powinien dostawać już poprawne, znormalizowane dane.

## 7. Wydajność

- Snapshot pojedynczej inspekcji jest mały, a `global_notes` ma limit `10000` znaków, więc operacje tekstowe w helperze będą liniowe i akceptowalne dla MVP.
- Do lookupu pytania należy używać istniejącego singletonu `QUESTION_TEXT_BY_ID`, bez czytania markdownu lub JSON z dysku per request.
- Oba endpointy `PUT` powinny mieć no-op short-circuit, aby uniknąć zbędnych write'ów, bumpowania wersji i wywołań RPC.
- Funkcje SQL powinny reuse'ować obecny wzorzec advisory lock per `(user_id, inspection_id)`, co minimalizuje ryzyko race conditions bez szerokich blokad tabelowych.
- Odpowiedzi powinny pozostawać małe: bez pełnego snapshotu, bez ponownego zwracania `questionNotes` mapy, bez dodatkowych projekcji.
- Nie ma potrzeby ponownego liczenia visibility dla samych notatek; wystarczy czytać persistowane `visible_question_ids` ze snapshotu, bo kanoniczny zestaw został już wyliczony przy wcześniejszych mutacjach Part 1 / runtime flags.

## 8. Kroki implementacji

1. Rozszerzyć `shared/contracts/inspections.ts` o schematy i eksporty dla `question-notes` oraz `global-notes`, reuse'ując istniejące `InspectionQuestionRouteParamsSchema` i `InspectionRouteParamsSchema`.
2. Zweryfikować zgodność z istniejącymi DTO w `app/types.ts`; jeśli repo nadal utrzymuje oba źródła, zadbać, by typy aplikacyjne były zgodne z nowymi schematami Zod i nie wprowadzały rozjazdu nazewniczego.
3. Dodać pure helper `server/utils/services/inspection-note-document.ts` z funkcjami do deterministycznego `upsert` i `remove` fragmentów w `global_notes`, przy zachowaniu reguły jednokierunkowego mirroringu.
4. Dodać testy unit dla helpera tekstowego, obejmujące co najmniej:
   - dodanie pierwszej notatki,
   - podmianę notatki tego samego pytania,
   - usunięcie notatki,
   - zachowanie ręcznie dopisanego tekstu użytkownika,
   - brak prób rekonstrukcji `question_notes` z `global_notes`.
5. Przygotować nową migrację SQL z funkcjami `save_inspection_question_note`, `delete_inspection_question_note` i `save_inspection_global_notes`, wzorowaną na istniejących funkcjach answer endpoints.
6. Zaimplementować `save-inspection-question-note.ts`, bazując na strukturze `save-inspection-answer.ts`: fetch, ownership guard, status guard, optimistic concurrency, visibility guard, lookup etykiety pytania, no-op, RPC, logowanie.
7. Zaimplementować `delete-inspection-question-note.ts`, bazując na `delete-inspection-answer.ts`, ale z dodatkowym wyliczeniem nowego `global_notes` przed wywołaniem RPC.
8. Zaimplementować `save-inspection-global-notes.ts` z logiką podobną do answer PUT: fetch, ownership, status, optimistic concurrency, no-op, RPC.
9. Dodać trzy handlery Nitro:
   - `question-notes/[questionId]/index.put.ts`,
   - `question-notes/[questionId]/index.delete.ts`,
   - `global-notes.put.ts`.
10. W handlerach utrzymać spójny styl repo:
    - `randomUUID()` dla `requestId`,
    - `useRuntimeConfig(event)`,
    - `assertMutationOrigin(event)`,
    - `getRequiredUserId(event)`,
    - `getValidatedRouterParams(...)`,
    - `readBody(...)` + `safeParse(...)` dla `PUT`,
    - `setResponseHeader(event, "Cache-Control", "private, no-store")`.
11. Dodać testy Nuxt dla route handlers, rekomendacyjnie:
    - `test/nuxt/inspection-question-note-put-delete.test.ts`,
    - `test/nuxt/inspection-global-notes-put.test.ts`.
12. Pokryć w testach co najmniej:
    - `200` sukces,
    - no-op dla obu `PUT`,
    - `400` za niepoprawne body,
    - `404` za brak inspekcji i brak notatki przy `DELETE`,
    - `409` za `completed` oraz stale `baseSnapshotVersion`,
    - `422` za przekroczenie limitów i niewidoczne pytanie,
    - poprawne parametry RPC,
    - brak ingerencji `PUT global-notes` w `question_notes`.
13. Uruchomić ukierunkowane testy dla nowych plików i powiązanych kontraktów oraz sprawdzić, że istniejące testy answer endpoints nie regresują.
14. Po wdrożeniu dopisać krótki komentarz architektoniczny w odpowiednim planie lub README tylko wtedy, jeśli zespół uzna, że reguła jednokierunkowego mirroringu nie jest wystarczająco oczywista z samego kodu i testów.