# API Endpoint Implementation Plan: GET & DELETE /api/v1/inspections/{inspectionId}

## 1. Przegląd punktu końcowego

Dwa endpointy zasobu pojedynczej inspekcji:

- **`GET /api/v1/inspections/{inspectionId}`** — zwraca pełny kanoniczny agregat inspekcji potrzebny przez stronę sesji. Endpoint wyłącznie do odczytu; obsługuje opcjonalne rozszerzenia odpowiedzi przez parametr `include`. Odpowiada za weryfikację własności inspekcji (404 dla obcych/nieistniejących).
- **`DELETE /api/v1/inspections/{inspectionId}`** — wykonuje trwałe (hard) usunięcie inspekcji po jawnym potwierdzeniu. Wymaga literalu `DELETE_INSPECTION`, zwalnia jeden slot i zwraca potwierdzenie wraz z liczbą zwolnionych slotów.

Zakres odpowiedzialności warstwy Nitro:

- potwierdzenie aktywnej sesji Supabase SSR,
- walidacja `inspectionId` jako UUID na granicy handlera,
- walidacja body (DELETE) i query (GET) przez Zod,
- delegacja logiki domenowej do serwisów w `server/utils/services/`,
- mapowanie błędów domenowych na kody HTTP,
- zwrócenie odpowiedzi w kanonicznej kopercie API.

Docelowe lokalizacje:

| Rola | Ścieżka |
|---|---|
| GET handler | `server/api/v1/inspections/[inspectionId].get.ts` |
| DELETE handler | `server/api/v1/inspections/[inspectionId].delete.ts` |
| GET serwis | `server/utils/services/get-inspection-detail.ts` |
| DELETE serwis | `server/utils/services/delete-inspection.ts` |
| Zod kontrakty | `shared/contracts/inspections.ts` (rozszerzenie istniejącego pliku) |
| SQL migracja | `supabase/migrations/<timestamp>_add_delete_inspection_function.sql` |

---

## 2. Szczegóły żądania

### GET /api/v1/inspections/{inspectionId}

- **Metoda HTTP:** `GET`
- **URL:** `/api/v1/inspections/{inspectionId}`
- **Auth:** wymagana aktywna sesja Supabase SSR

#### Route parameters

| Parametr | Typ | Wymagany | Reguły |
|---|---|---|---|
| `inspectionId` | UUID string | tak | walidacja `z.string().uuid()` |

#### Query parameters

| Parametr | Typ | Wymagany | Reguły |
|---|---|---|---|
| `include` | comma-separated string | nie | dozwolone wartości: `summary`, `questions-meta`; inne wartości odrzucane jako `400` |

#### Request body

Brak.

---

### DELETE /api/v1/inspections/{inspectionId}

- **Metoda HTTP:** `DELETE`
- **URL:** `/api/v1/inspections/{inspectionId}`
- **Auth:** wymagana aktywna sesja Supabase SSR

#### Route parameters

| Parametr | Typ | Wymagany | Reguły |
|---|---|---|---|
| `inspectionId` | UUID string | tak | walidacja `z.string().uuid()` |

#### Request body

```json
{
  "confirmation": "DELETE_INSPECTION"
}
```

| Pole | Typ | Wymagany | Reguły |
|---|---|---|---|
| `confirmation` | literal string | tak | musi być dokładnie `"DELETE_INSPECTION"` |

---

## 3. Wykorzystywane typy

### Istniejące typy z `app/types.ts`

| Typ | Użycie |
|---|---|
| `InspectionDetailDto` | Kształt danych inspekcji w odpowiedzi GET |
| `InspectionCanonicalDto` | Baza dla `InspectionDetailDto` |
| `InspectionPart1Dto` | Shape pola `part1` |
| `InspectionRuntimeFlagsDto` | Shape pola `runtimeFlags` |
| `InspectionPartStateDto` | Shape elementów tablicy `parts` |
| `InspectionDetailedProgressDto` | Shape pola `progress` z podziałem na części |
| `InspectionPartProgressDto` | Shape elementów `progress.parts` |
| `InspectionScoreDistributionDto` | Shape pola `scoreDistribution` |
| `InspectionMode` | `"editable"` \| `"report"` |
| `InspectionDetailExpansion` | `"summary"` \| `"questions-meta"` |
| `InspectionRouteParams` | Kształt route params `{ inspectionId }` |
| `InspectionId` | UUID alias |
| `ApiSuccessResponseDto<InspectionDetailDto>` | Koperta odpowiedzi GET |

### Nowe kontrakty Zod w `shared/contracts/inspections.ts`

Dodać do istniejącego pliku kontraktów:

| Schema | Cel |
|---|---|
| `InspectionRouteParamsSchema` | Walidacja `{ inspectionId: z.string().uuid() }` |
| `GetInspectionDetailQuerySchema` | Walidacja query param `include` jako tablicy rozszerzonych wartości |
| `InspectionPart1Schema` | Shape Part 1 w odpowiedzi — nullable object |
| `InspectionPartStateSchema` | Shape `{ part, enabled, completed }` |
| `InspectionPartProgressSchema` | Shape `{ part, answeredQuestions, visibleQuestions, completionRate, completed }` |
| `InspectionDetailedProgressSchema` | Rozszerza `InspectionProgressSchema` o `parts: InspectionPartProgressSchema[]` |
| `InspectionDetailSchema` | Pełny shape odpowiedzi GET — zawiera wszystkie pola z planu API |
| `GetInspectionDetailResponseSchema` | Koperta `{ data: InspectionDetailSchema, meta: ApiMetaSchema }` |
| `DeleteInspectionCommandSchema` | Walidacja body DELETE — `z.strictObject({ confirmation: z.literal("DELETE_INSPECTION") })` |
| `DeleteInspectionResultSchema` | Shape `{ deleted: true, inspectionId: uuid, freedSlots: 1 }` |
| `DeleteInspectionResponseSchema` | Koperta `{ data: DeleteInspectionResultSchema, meta: ApiMetaSchema }` |

Typy TypeScript derywować przez `z.infer` — nie powielać ręcznie.

---

## 4. Szczegóły odpowiedzi

### GET /api/v1/inspections/{inspectionId} — 200 OK

```json
{
  "data": {
    "id": "uuid",
    "title": "Toyota Corolla 2016 ABC123",
    "status": "draft",
    "questionBankVersion": "2026-05-01",
    "snapshotSchemaVersion": "1.0.0",
    "snapshotVersion": 7,
    "clientUpdatedAt": "2026-05-01T12:30:00Z",
    "createdAt": "2026-05-01T12:00:00Z",
    "updatedAt": "2026-05-01T12:30:02Z",
    "completedAt": null,
    "part1": { /* InspectionPart1Dto | null */ },
    "runtimeFlags": { /* InspectionRuntimeFlagsDto */ },
    "answers": { "q_brakes_pedal_feel": "yes" },
    "questionNotes": { "q_brakes_pedal_feel": "Pedal feels stable." },
    "globalNotes": "Overall clean cabin.",
    "visibleGroupIds": ["base-body", "fuel-petrol-common"],
    "visibleQuestionIds": ["q_brakes_pedal_feel"],
    "parts": [
      { "part": "part1", "enabled": true, "completed": true },
      { "part": "part2", "enabled": true, "completed": false }
    ],
    "progress": {
      "answeredQuestions": 1,
      "visibleQuestions": 60,
      "completionRate": 1.67,
      "parts": [
        { "part": "part2", "answeredQuestions": 1, "visibleQuestions": 20, "completionRate": 5, "completed": false }
      ]
    },
    "scoreDistribution": { "yes": 1, "no": 0, "dontKnow": 0 },
    "mode": "editable"
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:30:02Z"
  }
}
```

### DELETE /api/v1/inspections/{inspectionId} — 200 OK

```json
{
  "data": {
    "deleted": true,
    "inspectionId": "uuid",
    "freedSlots": 1
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:40:00Z"
  }
}
```

---

## 5. Przepływ danych

### GET /api/v1/inspections/{inspectionId}

```
GET /api/v1/inspections/:inspectionId?include=summary
  │
  ├─ 1. getRequiredUserId(event)                          → userId: string
  │       └─ Throws 401 if no session
  │
  ├─ 2. getValidatedRouterParams(event, InspectionRouteParamsSchema)
  │       └─ Validates inspectionId as UUID; throws 400 on invalid format
  │
  ├─ 3. getValidatedQuery(event, GetInspectionDetailQuerySchema)
  │       └─ Parses optional include csv, validates against allowed values
  │
  ├─ 4. getInspectionDetail(event, userId, inspectionId, query)
  │       ├─ serverSupabaseServiceRole(event)             (RLS disabled — explicit user_id filter required)
  │       │
  │       ├─ SELECT id, title, status, question_bank_version, snapshot_schema_version,
  │       │         snapshot_version, client_updated_at, created_at, updated_at,
  │       │         completed_at, snapshot,
  │       │         make, model, year_of_production, registration_number, vin_number,
  │       │         mileage, fuel_type, transmission, drive, color, body_type,
  │       │         number_of_doors, address, price
  │       │    FROM public.inspections
  │       │   WHERE id = $inspectionId AND user_id = $userId
  │       │   LIMIT 1
  │       │
  │       ├─ IF row is null → throw 404 Not Found
  │       │
  │       ├─ Extract snapshot JSON fields:
  │       │     part_1, runtime_flags, answers, question_notes,
  │       │     global_notes, visible_group_ids, visible_question_ids
  │       │
  │       ├─ Compute derived fields in TypeScript:
  │       │     mode             ← status === 'draft' ? 'editable' : 'report'
  │       │     scoreDistribution ← tally answers filtered to visible_question_ids
  │       │     part1Enabled     ← always true
  │       │     part1Completed   ← part_1 != null (required fields present)
  │       │     partsN_enabled   ← part_1 != null (Part 1 valid unlocks Parts 2-5)
  │       │     partsN_completed ← all visible questions for part answered
  │       │     progress.global  ← count(answers ∩ visible_question_ids) / len(visible_question_ids)
  │       │     progress.parts   ← per-part breakdown (only parts 2-5 in progress.parts array)
  │       │
  │       └─ Return InspectionDetailDto
  │
  └─ 5. Return ApiSuccessResponseDto<InspectionDetailDto>
```

### DELETE /api/v1/inspections/{inspectionId}

```
DELETE /api/v1/inspections/:inspectionId   body: { confirmation }
  │
  ├─ 1. assertMutationOrigin(event)                       → void | throws 403
  │
  ├─ 2. getRequiredUserId(event)                          → userId: string
  │       └─ Throws 401 if no session
  │
  ├─ 3. getValidatedRouterParams(event, InspectionRouteParamsSchema)
  │       └─ Validates inspectionId as UUID; throws 400 on invalid format
  │
  ├─ 4. readValidatedBody(event, DeleteInspectionCommandSchema)
  │       └─ Validates confirmation === "DELETE_INSPECTION"; throws 400 on mismatch
  │
  ├─ 5. deleteInspection(event, userId, inspectionId)
  │       ├─ serverSupabaseServiceRole(event)
  │       │
  │       ├─ CALL private.delete_inspection(userId, inspectionId):
  │       │     a) SELECT id FROM public.inspections
  │       │           WHERE id = $inspectionId AND user_id = $userId FOR UPDATE
  │       │        → IF no row → raise exception NOT_FOUND
  │       │        → IF row locked → raise exception INSPECTION_LOCKED
  │       │     b) DELETE FROM public.inspections WHERE id = $inspectionId
  │       │     c) RETURN deleted_id
  │       │
  │       ├─ Map SQL exception → domain error:
  │       │     NOT_FOUND    → 404
  │       │     INSPECTION_LOCKED → 409 INSPECTION_LOCKED
  │       │
  │       └─ Return { inspectionId, freedSlots: 1 }
  │
  └─ 6. Return ApiSuccessResponseDto<DeleteInspectionResultDto>
```

### Uwagi do podziału `parts` i `progress.parts`

- Tablica `parts` w odpowiedzi zawsze zwraca stan dla `part1` i dla wszystkich części 2–5, niezależnie od tego, czy są odblokowane.
- `progress.parts` zawiera tylko elementy dla parts 2–5. Część 1 nie jest uwzględniana w `progress.parts`, ponieważ nie zawiera pytań z question banku.
- Każdy `InspectionPartProgressDto` w `progress.parts` zawiera zliczenia tylko pytań widocznych dla danej części na podstawie `visible_question_ids`.

---

## 6. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Oba endpointy muszą zaczynać się od `getRequiredUserId(event)` — `userId` jest zawsze ustalanym po stronie serwera, nigdy nie pochodzi z params, query ani body.
- Filtr `WHERE id = $inspectionId AND user_id = $userId` jest obowiązkowy w każdym zapytaniu DB, ponieważ RLS na `public.inspections` jest **wyłączone** (migracja `20260501000100_disable_app_table_rls.sql`). Jego pominięcie ujawniłoby dane innych użytkowników.
- Odpowiedź `404 Not Found` jest zwracana dla inspekcji innego użytkownika i nieistniejących, aby nie ujawniać informacji o zasobach (resource existence leakage prevention).
- DELETE wymaga `assertMutationOrigin(event)` przed walidacją body, ze względu na cookie-based auth.
- GET nie wymaga walidacji Origin (idempotentny odczyt), ale nie może być cachowany dla uwierzytelnionego użytkownika.

### Walidacja wejścia

- `inspectionId` jest walidowane przez `getValidatedRouterParams` ze schematem `z.string().uuid()` — nieprawidłowy format UUID zwraca `400`, nie `404`.
- Body DELETE jest walidowane przez `readValidatedBody` ze `z.strictObject`, aby odrzucić nadmiarowe pola.
- Query param `include` w GET jest walidowany jako lista dozwolonych wartości — nieznana wartość zwraca `400 VALIDATION_ERROR`.

### Limity operacji destrukcyjnych

- Literat `DELETE_INSPECTION` jest świadomym potwierdzeniem akcji i musi być sprawdzany po stronie serwera niezależnie od walidacji w UI.

### Sekrety i granice uprzywilejowania

- `serverSupabaseServiceRole(event)` jest używany w obu serwisach (RLS wyłączone) i musi pozostać zamknięty w `server/utils/`.
- Nie wolno logować pełnych wartości snapshot, odpowiedzi Supabase ani access tokenów.

---

## 7. Obsługa błędów

### GET /api/v1/inspections/{inspectionId}

| Scenariusz | Status | Kod błędu |
|---|---|---|
| Brak sesji / nieważna sesja | `401 Unauthorized` | — |
| Nieprawidłowy format `inspectionId` (nie-UUID) | `400 Bad Request` | `VALIDATION_ERROR` |
| Nieprawidłowa wartość `include` | `400 Bad Request` | `VALIDATION_ERROR` |
| Inspekcja nie należy do użytkownika lub nie istnieje | `404 Not Found` | — |
| Błąd DB / Supabase | `500 Internal Server Error` | — |

### DELETE /api/v1/inspections/{inspectionId}

| Scenariusz | Status | Kod błędu |
|---|---|---|
| Brak sesji / nieważna sesja | `401 Unauthorized` | — |
| Walidacja Origin / Referer nie przeszła | `403 Forbidden` | — |
| Nieprawidłowy format `inspectionId` (nie-UUID) | `400 Bad Request` | `VALIDATION_ERROR` |
| Brakujące lub nieprawidłowe `confirmation` | `400 Bad Request` | `VALIDATION_ERROR` |
| Inspekcja nie należy do użytkownika lub nie istnieje | `404 Not Found` | — |
| Inspekcja zablokowana przez aktywną operację zapisu | `409 Conflict` | `INSPECTION_LOCKED` |
| Błąd DB / Supabase | `500 Internal Server Error` | — |

Koperta błędu:

```json
{
  "error": {
    "code": "INSPECTION_LOCKED",
    "message": "The inspection is currently locked by an active save operation. Please try again shortly."
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:40:00Z"
  }
}
```

Konwersja błędów Zod na kopertę błędu API powinna używać wspólnego helpera transformującego `ZodError` na `ApiErrorDto`, analogicznie do wzorca z istniejących endpointów.

---

## 8. Wydajność

### GET /api/v1/inspections/{inspectionId}

- Zapytanie trafia na klucz główny `inspections_pkey(id)` i natychmiast filtruje po `user_id` — nie wymaga dodatkowych indeksów.
- Pełny snapshot JSONB jest potrzebny dla detail view, więc nie ma możliwości ograniczenia kolumn snapshot tak jak w widoku listy.
- Obliczenia `progress`, `scoreDistribution`, `parts`, `mode` są wykonywane w TypeScript po stronie serwera na podstawie danych z jednego wiersza — brak dodatkowych round-tripów do DB.
- Odpowiedź nie powinna być cachowana (prywatne dane, często modyfikowane).

### DELETE /api/v1/inspections/{inspectionId}

- Operacja atomowa przez prywatną SQL funkcję `private.delete_inspection` zapewnia lock check i usunięcie w jednej transakcji, eliminując race condition.
- Transakcja jest krótka; nie ma potrzeby optymalizacji na poziomie MVP.

---

## 9. Kroki implementacji

### 9.1 Kontrakty Zod — rozszerzenie `shared/contracts/inspections.ts`

1. Dodać `InspectionRouteParamsSchema` z `z.object({ inspectionId: z.string().uuid() })`.
2. Dodać `GetInspectionDetailQuerySchema` parsujący opcjonalny `include` jako `z.string().optional()` z transformem do tablicy `InspectionDetailExpansion`, odrzucając nieznane wartości przez `z.enum`.
3. Dodać `InspectionPart1Schema` jako `z.object({ price, make, model, ... }).nullable()` — wszystkie pola opcjonalne odpowiednio do `InspectionPart1Dto`.
4. Dodać `InspectionPartStateSchema` z polami `{ part: z.enum([...]), enabled: z.boolean(), completed: z.boolean() }`.
5. Dodać `InspectionPartProgressSchema` z polami `{ part, answeredQuestions, visibleQuestions, completionRate, completed }`.
6. Dodać `InspectionDetailedProgressSchema` jako `InspectionProgressSchema.extend({ parts: z.array(InspectionPartProgressSchema) })`.
7. Dodać `InspectionDetailSchema` łącząc wszystkie pola z sekcji 4 (identity + snapshot + parts + progress + scoreDistribution + mode).
8. Dodać `GetInspectionDetailResponseSchema` jako `z.object({ data: InspectionDetailSchema, meta: ApiMetaSchema })`.
9. Dodać `DeleteInspectionCommandSchema` jako `z.strictObject({ confirmation: z.literal("DELETE_INSPECTION") })`.
10. Dodać `DeleteInspectionResultSchema` jako `z.object({ deleted: z.literal(true), inspectionId: z.string().uuid(), freedSlots: z.literal(1) })`.
11. Dodać `DeleteInspectionResponseSchema` jako `z.object({ data: DeleteInspectionResultSchema, meta: ApiMetaSchema })`.
12. Wyeksportować wszystkie nowe inferred TypeScript typy przez `z.infer`.

### 9.2 SQL migracja — `private.delete_inspection`

1. Utworzyć nową migrację `supabase/migrations/<timestamp>_add_delete_inspection_function.sql`.
2. Zdefiniować funkcję `private.delete_inspection(p_user_id uuid, p_inspection_id uuid) RETURNS uuid`:
   - Użyć `SELECT ... FOR UPDATE` w celu wykrycia blokady i weryfikacji własności w jednym kroku.
   - Jeżeli wiersz nie istnieje lub `user_id` nie zgadza się — `RAISE EXCEPTION 'NOT_FOUND'`.
   - Jeżeli wiersz jest zablokowany przez konkurencyjną transakcję — PostgreSQL naturalnie rzuci `lock_not_available` (przy `NOWAIT`); SQL funkcja konwertuje to na `RAISE EXCEPTION 'INSPECTION_LOCKED'`.
   - Wykonać `DELETE FROM public.inspections WHERE id = p_inspection_id`.
   - Zwrócić `p_inspection_id` jako potwierdzenie.
3. Nadać uprawnienia EXECUTE wyłącznie dla roli `service_role`.

### 9.3 Serwis GET — `server/utils/services/get-inspection-detail.ts`

1. Utworzyć nowy plik serwisu.
2. Zdefiniować interfejs `GetInspectionDetailResult` z polem `inspection: InspectionDetailDto`.
3. Zdefiniować wewnętrzne typy dla odczytanego wiersza DB (Pick z `Tables<"inspections">`).
4. Zaimplementować funkcję `getInspectionDetail(event, userId, inspectionId, query)`:
   - Wywołać `serverSupabaseServiceRole(event)`.
   - Wykonać `SELECT` z jawnym filtrem `user_id = userId AND id = inspectionId`.
   - Jeżeli brak wiersza — `throw createError({ statusCode: 404, ... })`.
   - Wyodrębnić pola snapshot z JSONB.
   - Wyliczyć `mode`, `scoreDistribution`, `parts[]`, `progress` (z podziałem na części) w TypeScript.
   - Zbudować i zwrócić `InspectionDetailDto`.

#### Logika obliczania `parts[]`

```ts
const part1HasRequiredFields = snapshot.part_1 !== null &&
  snapshot.part_1.make && snapshot.part_1.model &&
  snapshot.part_1.fuel_type && snapshot.part_1.transmission &&
  snapshot.part_1.drive && snapshot.part_1.body_type;

const parts: InspectionPartStateDto[] = [
  { part: 'part1', enabled: true, completed: part1HasRequiredFields },
  { part: 'part2', enabled: part1HasRequiredFields, completed: isPart2Completed },
  { part: 'part3', enabled: part1HasRequiredFields, completed: isPart3Completed },
  { part: 'part4', enabled: part1HasRequiredFields, completed: isPart4Completed },
  { part: 'part5', enabled: part1HasRequiredFields, completed: isPart5Completed },
];
```

`isPartNCompleted` = wszystkie pytania widoczne dla danej części mają odpowiedź w `answers`. Widoczne pytania danej części należy rozróżnić na podstawie prefiksu lub metadanych question banku — na MVP można przyjąć, że `visible_question_ids` jest dzielone per-part według question banku zbudowanego po stronie serwera lub przechowywanych identyfikatorów.

#### Logika obliczania `progress.parts`

```ts
const partProgress: InspectionPartProgressDto[] = (['part2', 'part3', 'part4', 'part5'] as const)
  .map(part => {
    const partQuestionIds = visibleQuestionIds.filter(qid => questionBelongsToPart(qid, part));
    const answered = partQuestionIds.filter(qid => answers[qid] !== undefined).length;
    const visible = partQuestionIds.length;
    return {
      part,
      answeredQuestions: answered,
      visibleQuestions: visible,
      completionRate: visible > 0 ? roundToTwoDecimals((answered / visible) * 100) : 0,
      completed: visible > 0 && answered === visible,
    };
  });
```

### 9.4 Serwis DELETE — `server/utils/services/delete-inspection.ts`

1. Utworzyć nowy plik serwisu.
2. Zdefiniować interfejs `DeleteInspectionResult` z polami `{ inspectionId: string; freedSlots: 1 }`.
3. Zaimplementować funkcję `deleteInspection(event, userId, inspectionId)`:
   - Wywołać `serverSupabaseServiceRole(event)`.
   - Wywołać `supabase.rpc('private_delete_inspection', { p_user_id: userId, p_inspection_id: inspectionId })` lub analogiczne bezpośrednie wywołanie SQL przez `.from()` z `.delete().eq('id', ...).eq('user_id', ...)`.
   - Zmapować błędy SQL na błędy domenowe:
     - `NOT_FOUND` → `createError({ statusCode: 404 })`
     - `INSPECTION_LOCKED` → `createError({ statusCode: 409, data: { code: 'INSPECTION_LOCKED' } })`
   - Zwrócić `{ inspectionId, freedSlots: 1 }`.

> **Uwaga:** Jeżeli prywatna SQL funkcja `private.delete_inspection` jest niedostępna przez standardowy Supabase client, alternatywą jest bezpośredni DELETE z `serverSupabaseServiceRole` z odpowiednim filtrem `user_id` i `id`, a lock check zaimplementowany przez wcześniejszy SELECT. Preferowana jest SQL funkcja dla atomowości.

### 9.5 GET handler — `server/api/v1/inspections/[inspectionId].get.ts`

1. Utworzyć plik handlera.
2. Wywołać `getRequiredUserId(event)`.
3. Wywołać `getValidatedRouterParams(event, InspectionRouteParamsSchema)`.
4. Wywołać `getValidatedQuery(event, GetInspectionDetailQuerySchema)`.
5. Wywołać serwis `getInspectionDetail(event, userId, inspectionId, query)`.
6. Zbudować i zwrócić `ApiSuccessResponseDto<InspectionDetailDto>` z meta.
7. Otoczyć całość blokiem `try/catch` z logowaniem błędów (requestId, inspectionId, userId) i re-throwem H3 errors.

### 9.6 DELETE handler — `server/api/v1/inspections/[inspectionId].delete.ts`

1. Utworzyć plik handlera.
2. Wywołać `assertMutationOrigin(event)`.
3. Wywołać rate-limit guard dla destrukcyjnych operacji.
4. Wywołać `getRequiredUserId(event)`.
5. Wywołać `getValidatedRouterParams(event, InspectionRouteParamsSchema)`.
6. Wywołać `readValidatedBody(event, DeleteInspectionCommandSchema)`.
7. Wywołać serwis `deleteInspection(event, userId, inspectionId)`.
8. Zbudować i zwrócić `ApiSuccessResponseDto<DeleteInspectionResultDto>` z meta.
9. Otoczyć całość blokiem `try/catch` z logowaniem błędów (requestId, inspectionId, userId) i re-throwem H3 errors.

### 9.7 Testy — `test/nuxt/`

#### GET — `test/nuxt/inspection-get.test.ts`

- Pomyślne pobranie istniejącej inspekcji własnego użytkownika → `200` z pełnym `InspectionDetailDto`.
- Próba pobrania inspekcji innego użytkownika → `404`.
- Nieprawidłowy format `inspectionId` → `400`.
- Brak sesji → `401`.
- Nieprawidłowa wartość `include` → `400`.
- Weryfikacja poprawności pól `parts`, `progress.parts`, `mode`, `scoreDistribution` dla konkretnych danych fixture.

#### DELETE — `test/nuxt/inspection-delete.test.ts`

- Pomyślne usunięcie istniejącej inspekcji → `200` z `{ deleted: true, freedSlots: 1 }`.
- Próba usunięcia inspekcji innego użytkownika → `404`.
- Nieprawidłowe `confirmation` → `400`.
- Brak `confirmation` → `400`.
- Brak sesji → `401`.
- Nieprawidłowy format `inspectionId` → `400`.
