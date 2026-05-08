# API Endpoint Implementation Plan: GET & POST /api/v1/inspections

## 1. Przegląd punktu końcowego

Dwa endpointy zasobów kolekcji inspekcji:

- **`GET /api/v1/inspections`** — zwraca stronicowaną listę inspekcji zalogowanego użytkownika na potrzeby dashboardu. Endpoint wyłącznie do odczytu, obsługuje filtrowanie po statusie, sortowanie oraz paginację kursorową.
- **`POST /api/v1/inspections`** — tworzy nową inspekcję w stanie `draft` z minimalnym kanonicznym snapshotem. Wymaga atomowego sprawdzenia limitu (max 2 inspekcje na konto) i zwraca pełny stan nowej inspekcji wraz z aktualnymi limitami użytkownika.

Zakres odpowiedzialności warstwy Nitro:

- potwierdzenie aktywnej sesji Supabase SSR,
- walidacja wejścia na granicy handlera,
- delegacja logiki domenowej do serwisów w `server/utils/services/`,
- zwrócenie odpowiedzi w kanonicznej kopercie API.

Docelowe lokalizacje:

| Rola | Ścieżka |
|---|---|
| GET handler | `server/api/v1/inspections/index.get.ts` |
| POST handler | `server/api/v1/inspections/index.post.ts` |
| List serwis | `server/utils/services/list-user-inspections.ts` |
| Create serwis | `server/utils/services/create-inspection.ts` |
| Zod kontrakty | `shared/contracts/inspections.ts` |
| SQL migracja | `supabase/migrations/<timestamp>_create_inspection_function.sql` |

---

## 2. Szczegóły żądania

### GET /api/v1/inspections

- **Metoda HTTP:** `GET`
- **URL:** `/api/v1/inspections`
- **Auth:** wymagana aktywna sesja Supabase SSR

#### Query parameters

| Parametr | Typ | Wymagany | Domyślny | Reguły |
|---|---|---|---|---|
| `status` | `draft` \| `completed` | nie | brak (zwraca wszystkie) | enum walidacja |
| `sort` | `updated_at.desc` \| `created_at.desc` \| `title.asc` | nie | `updated_at.desc` | enum walidacja |
| `limit` | integer | nie | `20` | zakres `1..50`; coerce string → number |
| `cursor` | string (opaque) | nie | brak | opaque base64-JSON kursor |

#### Request body

Brak.

---

### POST /api/v1/inspections

- **Metoda HTTP:** `POST`
- **URL:** `/api/v1/inspections`
- **Auth:** wymagana aktywna sesja Supabase SSR

#### Request body

```json
{
  "clientCreatedAt": "2026-05-01T12:00:00Z"
}
```

| Pole | Typ | Wymagany | Reguły |
|---|---|---|---|
| `clientCreatedAt` | ISO 8601 UTC string | tak | walidacja `z.string().datetime()` |

---

## 3. Wykorzystywane typy

### Istniejące typy z `app/types.ts`

| Typ | Użycie |
|---|---|
| `InspectionListItemDto` | Kształt pojedynczego elementu w odpowiedzi GET |
| `CreateInspectionCommand` | Kształt body POST |
| `CreatedInspectionDto` | Kształt nowej inspekcji w odpowiedzi POST |
| `InspectionLimitsDto` | Limity konta w odpowiedzi POST |
| `ListInspectionsQuery` | Kształt parametrów zapytania GET |
| `InspectionProgressDto` | Derived progress w obu DTO |
| `InspectionScoreDistributionDto` | Derived score w obu DTO |
| `InspectionRuntimeFlagsDto` | Flags w `CreatedInspectionDto` |
| `InspectionMode` | `"editable"` \| `"report"` |
| `ApiListResponseDto<InspectionListItemDto>` | Koperta odpowiedzi GET |
| `ApiSuccessResponseDto<CreateInspectionResultData>` | Koperta odpowiedzi POST |
| `Cursor`, `InspectionStatus`, `InspectionSort` | Primitive aliasy |

### Nowe kontrakty Zod w `shared/contracts/inspections.ts`

| Schema | Cel |
|---|---|
| `ListInspectionsQuerySchema` | Walidacja query params GET; coerce limit do number |
| `InspectionProgressSchema` | Shape progress w odpowiedzi |
| `InspectionScoreDistributionSchema` | Shape score distribution w odpowiedzi |
| `InspectionListItemSchema` | Shape jednego elementu listy |
| `ListInspectionsResponseSchema` | Pełna koperta odpowiedzi GET |
| `CreateInspectionCommandSchema` | Walidacja body POST |
| `InspectionRuntimeFlagsSchema` | Shape runtime flags w odpowiedzi POST |
| `CreatedInspectionSchema` | Shape nowej inspekcji w odpowiedzi POST |
| `InspectionLimitsSchema` | Shape limitsw odpowiedzi POST |
| `CreateInspectionResponseSchema` | Pełna koperta odpowiedzi POST |

Typy TypeScript derywować przez `z.infer` — nie powielać ręcznie.

---

## 4. Szczegóły odpowiedzi

### GET /api/v1/inspections — 200 OK

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Toyota Corolla 2016 ABC123",
      "status": "draft",
      "snapshotVersion": 4,
      "updatedAt": "2026-05-01T12:00:00Z",
      "completedAt": null,
      "progress": {
        "answeredQuestions": 12,
        "visibleQuestions": 60,
        "completionRate": 20
      },
      "scoreDistribution": {
        "yes": 5,
        "no": 4,
        "dontKnow": 3
      },
      "part1Complete": true,
      "mode": "editable"
    }
  ],
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z",
    "pagination": {
      "limit": 20,
      "nextCursor": null,
      "hasMore": false
    }
  }
}
```

### POST /api/v1/inspections — 201 Created

```json
{
  "data": {
    "inspection": { /* CreatedInspectionDto */ },
    "limits": {
      "maxInspections": 2,
      "currentInspections": 1,
      "remaining": 1
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

Koperta POST używa `setResponseStatus(event, 201)` zamiast standardowego 200.

---

## 5. Przepływ danych

### GET /api/v1/inspections

```
GET /api/v1/inspections?status=draft&sort=updated_at.desc&limit=20
  │
  ├─ 1. getRequiredUserId(event)                          → userId: string
  │       └─ Throws 401 if no session
  │
  ├─ 2. getValidatedQuery(event, ListInspectionsQuerySchema)
  │       └─ Coerce + validate: status?, sort, limit, cursor?
  │
  ├─ 3. listUserInspections(event, userId, query)
  │       ├─ Decode cursor → { sortValue, id } | null
  │       ├─ serverSupabaseServiceRole(event)             (RLS disabled — must use explicit user_id filter)
  │       ├─ SELECT id, title, status, snapshot_version, updated_at, completed_at,
  │       │         snapshot->'answers', snapshot->'visible_question_ids',
  │       │         snapshot->'part_1'
  │       │    FROM public.inspections
  │       │   WHERE user_id = $userId
  │       │     AND (status = $status IF provided)
  │       │     AND (cursor filter IF provided)
  │       │   ORDER BY <sort_column> <direction>, id ASC   (tie-break on id)
  │       │   LIMIT limit + 1                              (detect hasMore)
  │       │
  │       ├─ Compute per-row derived fields in TypeScript:
  │       │     progress        ← count(answers ∩ visible_question_ids) / len(visible_question_ids)
  │       │     scoreDistribution ← group_by answer value within visible questions
  │       │     part1Complete   ← snapshot.part_1 != null
  │       │     mode            ← status === 'draft' ? 'editable' : 'report'
  │       │
  │       ├─ Slice rows to limit, encode nextCursor from last row sortValue + id
  │       └─ Return { items: InspectionListItemDto[], pagination }
  │
  └─ 4. Return ApiListResponseDto<InspectionListItemDto>
```

### POST /api/v1/inspections

```
POST /api/v1/inspections   body: { clientCreatedAt }
  │
  ├─ 1. assertMutationOrigin(event)                       → void | throws 403
  │
  ├─ 2. getRequiredUserId(event)                          → userId: string
  │       └─ Throws 401 if no session
  │
  ├─ 3. readValidatedBody(event, CreateInspectionCommandSchema)
  │       └─ Validates clientCreatedAt as ISO 8601; throws 422 on malformed
  │
  ├─ 4. createInspection(event, userId, command)
  │       ├─ serverSupabaseServiceRole(event)
  │       │
  │       ├─ ATOMICALLY via private.create_inspection(userId, clientCreatedAt):
  │       │     a) COUNT existing inspections for userId
  │       │     b) IF count >= 2 → raise exception → 409 INSPECTION_LIMIT_REACHED
  │       │     c) INSERT INTO public.inspections (
  │       │            user_id, title, status, question_bank_version,
  │       │            snapshot_schema_version, snapshot_version,
  │       │            client_updated_at, snapshot
  │       │        ) VALUES (
  │       │            userId, 'Untitled inspection', 'draft',
  │       │            CURRENT_QUESTION_BANK_VERSION, '1.0.0', 1,
  │       │            clientCreatedAt, <minimal_snapshot>
  │       │        )
  │       │     d) SELECT count of user's inspections after insert
  │       │     e) RETURN inserted row + count
  │       │
  │       ├─ Map inserted row → CreatedInspectionDto (all snapshot fields with safe defaults)
  │       ├─ Compute InspectionLimitsDto from post-insert count
  │       └─ Return { inspection: CreatedInspectionDto, limits: InspectionLimitsDto }
  │
  ├─ 5. setResponseStatus(event, 201)
  └─ 6. Return ApiSuccessResponseDto<{ inspection, limits }>
```

#### Minimalny snapshot startowy

```json
{
  "part_1": null,
  "runtime_flags": {
    "chargingPortEquipped": false,
    "evBatteryDocsAvailable": false,
    "turboEquipped": false,
    "mechanicalCompressorEquipped": false,
    "importedFromEU": false
  },
  "answers": {},
  "question_notes": {},
  "global_notes": "",
  "visible_group_ids": [],
  "visible_question_ids": []
}
```

### Paginacja kursorowa

Kursor jest nieprzezroczystym stringiem zakodowanym w base64 JSON:

```ts
// Encode
const cursorPayload = { sortValue: row[sortColumn], id: row.id };
const nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64url');

// Decode
const { sortValue, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
```

Filtr kursorowy w zapytaniu Supabase:

| Sort | Warunek |
|---|---|
| `updated_at.desc` | `(updated_at, id) < (sortValue, id)` |
| `created_at.desc` | `(created_at, id) < (sortValue, id)` |
| `title.asc` | `(title, id) > (sortValue, id)` |

> Supabase nie wspiera natywnie klauzul wielokolumnowych w filtrach `.lt/.gt`. Należy zastosować `.or('updated_at.lt.:sortValue,and(updated_at.eq.:sortValue,id.lt.:id)')` albo użyć `.rpc()` z prostą SQL funkcją kursorową.

---

## 6. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Oba endpointy muszą zaczynać się od `getRequiredUserId(event)` — nigdy nie opierać się na danych z query, body ani path params jako źródle userId.
- POST wymaga `assertMutationOrigin(event)` przed walidacją body, ze względu na cookie-based auth.
- GET nie wymaga walidacji Origin (idempotentny odczyt), ale nie wolno go cachować dla uwierzytelnionego użytkownika.
- Ponieważ RLS na `public.inspections` jest **wyłączone** (zgodnie z migracją `20260501000100_disable_app_table_rls.sql`), każde zapytanie DB musi zawierać jawny filtr `.eq('user_id', userId)`. Brak tego filtra ujawniłby dane innych użytkowników.

### Walidacja wejścia

- Wszystkie query params GET są walidowane przez `getValidatedQuery` z dedykowanym schematem — nie przez ręczny odczyt `event.node.req`.
- Body POST jest walidowane przez `readValidatedBody` ze schematem `strictObject`, aby odrzucić nadmiarowe pola.
- `limit` jest coercowany przez `z.coerce.number()` i klampowany do `1..50` po stronie serwera.
- Kursor jest dekodowany po stronie serwera; nieczytelny kursor zwraca `400 Bad Request`.
- `clientCreatedAt` musi być walidowany przez `z.string().datetime({ offset: true })`.

### Limit inspekcji

- Sprawdzenie limitu i tworzenie inspekcji muszą być atomowe (w jednej transakcji lub przez `security definer` SQL funkcję `private.create_inspection`). Nieatomowe podejście (count → insert) naraża na race condition, szczególnie przy offline-first reconnect storm.

### Bezpieczeństwo serwisu

- POST używa klienta service-role do ominięcia polityki `inspections_insert_denied`; ten klient nie może być nigdy eksponowany poza `server/utils/`.
- GET może używać zarówno klienta sesji jak i service-role, ponieważ filtr `user_id` jest jawny. Preferowany service-role ze względu na wyłączone RLS.

---

## 7. Obsługa błędów

### GET /api/v1/inspections

| Scenariusz | Status | Kod błędu |
|---|---|---|
| Brak sesji / nieważna sesja | `401 Unauthorized` | — |
| Nieprawidłowy parametr `status` | `400 Bad Request` | `VALIDATION_ERROR` |
| Nieprawidłowa wartość `sort` | `400 Bad Request` | `VALIDATION_ERROR` |
| `limit` poza zakresem | `400 Bad Request` | `VALIDATION_ERROR` |
| Nieczytelny kursor | `400 Bad Request` | `INVALID_CURSOR` |
| Błąd DB / Supabase | `500 Internal Server Error` | — |

### POST /api/v1/inspections

| Scenariusz | Status | Kod błędu |
|---|---|---|
| Brak sesji / nieważna sesja | `401 Unauthorized` | — |
| Walidacja Origin / Referer nie przeszła | `403 Forbidden` | — |
| Brakujące lub zniekształcone `clientCreatedAt` | `422 Unprocessable Entity` | `VALIDATION_ERROR` |
| Osiągnięto limit 2 inspekcji | `409 Conflict` | `INSPECTION_LIMIT_REACHED` |
| Błąd DB / Supabase | `500 Internal Server Error` | — |

Koperta błędu:

```json
{
  "error": {
    "code": "INSPECTION_LIMIT_REACHED",
    "message": "You have reached the maximum number of inspections."
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

Konwersja błędów Zod na kopertę błędu API powinna być obsługiwana przez wspólny helper transformujący `ZodError` na `ApiErrorDto`, analogicznie do wzorca z istniejących endpointów (`me.delete.ts`).

---

## 8. Wydajność

### GET /api/v1/inspections

- Indeksy `inspections_user_updated_idx(user_id, updated_at DESC)` i `inspections_user_status_idx(user_id, status)` bezpośrednio wspierają domyślny sort i filtr statusu.
- Wybierać tylko niezbędne kolumny i pola snapshot w `SELECT`; nie pobierać pełnego JSONB snapshot dla listy.
- Obliczenia `progress`, `scoreDistribution` i `part1Complete` są wykonywane w TypeScript po stronie serwera na podstawie zminimalizowanych danych JSONB. Dla MVP to wystarczające; przy wzroście liczby inspekcji rozważyć materialized view lub dedykowane kolumny projekcyjne.
- Limit kursorowy: pobierać `limit + 1` wierszy, aby wykryć `hasMore` bez dodatkowego `COUNT`.
- Odpowiedź nie powinna być cachowana (prywatne dane uwierzytelnionego użytkownika).

### POST /api/v1/inspections

- Operacja atomowa przez SQL funkcję eliminuje dwie osobne round-tripsy (count + insert).
- Transakcja DB jest krótka; nie ma potrzeby optymalizacji na poziomie MVP.

---

## 9. Kroki implementacji

### 9.1 Kontrakty Zod — `shared/contracts/inspections.ts`

1. Utworzyć nowy plik `shared/contracts/inspections.ts`.
2. Zdefiniować `InspectionProgressSchema` i `InspectionScoreDistributionSchema` jako reużywalne building blocks.
3. Zdefiniować `InspectionRuntimeFlagsSchema` z dokładnie 5 polami boolean (`chargingPortEquipped`, `evBatteryDocsAvailable`, `turboEquipped`, `mechanicalCompressorEquipped`, `importedFromEU`).
4. Zdefiniować `InspectionListItemSchema` mapujący wszystkie pola `InspectionListItemDto`.
5. Zdefiniować `ListInspectionsQuerySchema` z `z.coerce.number()` dla `limit` (default 20, max 50) i enum walidacją dla `status` i `sort`.
6. Zdefiniować `ListInspectionsResponseSchema` jako `ApiListResponseDto` shape.
7. Zdefiniować `CreateInspectionCommandSchema` ze `z.string().datetime({ offset: true })` dla `clientCreatedAt`.
8. Zdefiniować `CreatedInspectionSchema` i `InspectionLimitsSchema`.
9. Zdefiniować `CreateInspectionResponseSchema` jako `ApiSuccessResponseDto` shape.
10. Wyeksportować wszystkie inferred TypeScript typy przez `z.infer`.

### 9.2 SQL migracja — `private.create_inspection`

1. Utworzyć nową migrację `supabase/migrations/<timestamp>_add_create_inspection_function.sql`.
2. Zdefiniować stałą `CURRENT_QUESTION_BANK_VERSION` (np. `'2026-05-01'`) i `SNAPSHOT_SCHEMA_VERSION` (`'1.0.0'`).
3. Zaimplementować `private.create_inspection(p_user_id uuid, p_client_created_at timestamptz)` jako `SECURITY DEFINER` funkcję:
   - Policzyć istniejące inspekcje dla `p_user_id`.
   - Jeśli count >= 2 — `RAISE EXCEPTION 'INSPECTION_LIMIT_REACHED'`.
   - Wstawić nowy rekord do `public.inspections` z minimalnym snapshotem.
   - Zwrócić `TABLE(row public.inspections, current_count integer)`.
4. Nadać `EXECUTE` na `private.create_inspection` tylko roli `service_role`.

### 9.3 Serwis listowania — `server/utils/services/list-user-inspections.ts`

1. Zaimportować `serverSupabaseServiceRole` i typy.
2. Zdefiniować funkcję `listUserInspections(event, userId, query)` przyjmującą zwalidowane `query`.
3. Zaimplementować dekodowanie kursora (base64url → `{ sortValue, id }`) z obsługą błędu dekodowania (`400`).
4. Zbudować zapytanie Supabase: `.from('inspections').select('id, title, status, snapshot_version, updated_at, completed_at, snapshot->answers, snapshot->visible_question_ids, snapshot->part_1').eq('user_id', userId)`.
5. Zastosować filtr statusu, sort, kursor i `limit + 1`.
6. Zmapować wiersze DB na `InspectionListItemDto`:
   - `progress.answeredQuestions` = `Object.keys(answers).filter(id => visible_question_ids.includes(id)).length`
   - `progress.visibleQuestions` = `visible_question_ids.length`
   - `progress.completionRate` = visibleQuestions > 0 ? answeredQuestions / visibleQuestions * 100 : 0
   - `scoreDistribution` = group visible answers by value
   - `part1Complete` = `part_1 !== null`
   - `mode` = status === 'draft' ? 'editable' : 'report'
7. Wyliczyć `hasMore`, `nextCursor` i zwrócić paginowane wyniki.

### 9.4 Serwis tworzenia — `server/utils/services/create-inspection.ts`

1. Zaimportować `serverSupabaseServiceRole`, typy i stałą wersji question bank.
2. Zdefiniować funkcję `createInspection(event, userId, command)` przyjmującą zwalidowany `command`.
3. Wywołać `supabase.rpc('create_inspection', { p_user_id: userId, p_client_created_at: command.clientCreatedAt })`.
4. Obsłużyć błąd RPC z kodem `INSPECTION_LIMIT_REACHED` → `createError({ statusCode: 409, ... })`.
5. Zmapować zwrócony wiersz na `CreatedInspectionDto`:
   - Wszystkie pola identyfikacyjne z wiersza DB.
   - `part1: null`, `runtimeFlags` z minimalnego snapshota, `answers: {}`, `questionNotes: {}`, `globalNotes: ''`, `visibleGroupIds: []`, `visibleQuestionIds: []`.
   - `progress: { answeredQuestions: 0, visibleQuestions: 0, completionRate: 0 }`.
   - `scoreDistribution: { yes: 0, no: 0, dontKnow: 0 }`.
   - `mode: 'editable'`.
6. Skonstruować `InspectionLimitsDto` z `maxInspections: 2`, `currentInspections: current_count`, `remaining: 2 - current_count`.
7. Zalogować udane utworzenie inspekcji z `requestId` i `userId` (bez PII).

### 9.5 Handler GET — `server/api/v1/inspections/index.get.ts`

1. Wywołać `useRuntimeConfig(event)`.
2. Wywołać `getRequiredUserId(event)` — propaguje `401` przy braku sesji.
3. Wywołać `getValidatedQuery(event, ListInspectionsQuerySchema)` — propaguje `400` przy błędzie walidacji.
4. Wywołać `listUserInspections(event, userId, query)`.
5. Zwrócić `ApiListResponseDto<InspectionListItemDto>` z `requestId = randomUUID()` i `timestamp = new Date().toISOString()`.

### 9.6 Handler POST — `server/api/v1/inspections/index.post.ts`

1. Wywołać `assertMutationOrigin(event)`.
2. Wywołać `useRuntimeConfig(event)`.
3. Wywołać `getRequiredUserId(event)`.
4. Wywołać `readValidatedBody(event, CreateInspectionCommandSchema)` — propaguje `422` przy malformed `clientCreatedAt`.
5. Wywołać `createInspection(event, userId, body)`.
6. Wywołać `setResponseStatus(event, 201)`.
7. Zwrócić `ApiSuccessResponseDto<{ inspection: CreatedInspectionDto, limits: InspectionLimitsDto }>`.

### 9.7 Testy

1. Dodać testy Nuxt/Vitest w `test/nuxt/inspections-get.test.ts`:
   - Pomyślna lista (pusty wynik, wynik z elementami).
   - Filtrowanie po statusie.
   - Paginacja: `hasMore: true`, dekoedowanie kursora, poprawny `nextCursor`.
   - `401` przy braku sesji.
   - `400` przy nieprawidłowym `limit`, `status`, `sort`, złym kursorze.
2. Dodać testy Nuxt/Vitest w `test/nuxt/inspections-post.test.ts`:
   - Pomyślne tworzenie inspekcji (sprawdzenie `201`, kształtu odpowiedzi, `limits`).
   - `409 INSPECTION_LIMIT_REACHED` gdy count >= 2.
   - `422` gdy `clientCreatedAt` jest zniekształcony lub brakuje.
   - `401` przy braku sesji.
