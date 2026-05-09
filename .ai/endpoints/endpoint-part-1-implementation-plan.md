# API Endpoint Implementation Plan: PUT /api/v1/inspections/{inspectionId}/part-1

## 1. Przegląd punktu końcowego

Endpoint `PUT /api/v1/inspections/{inspectionId}/part-1` waliduje, normalizuje, zapisuje i projektuje Part 1 do kanonicznego snapshotu inspekcji oraz do kolumn projekcyjnych tabeli `public.inspections`. Jest to najważniejszy endpoint mutacyjny w lifecycle inspekcji, ponieważ prawidłowe dane Part 1 odblokowują Parts 2-5 i determinują widoczność grup pytań oraz pytań na podstawie konfiguracji pojazdu.

Obsługuje opcjonalny tryb `dryRun=true`, w którym normalizacja i walidacja są wykonywane, ale żaden zapis do bazy nie następuje — wynik jest zwracany bez persystowania.

Zakres odpowiedzialności warstwy Nitro:

- potwierdzenie aktywnej sesji Supabase SSR,
- walidacja `inspectionId` jako UUID i odczyt query param `dryRun`,
- walidacja i normalizacja body przez rozbudowany schemat Zod,
- weryfikacja własności inspekcji (404 dla obcych/nieistniejących),
- sprawdzenie statusu inspekcji (nie powinna być ukończona, aby Part 1 był edytowalny),
- zastosowanie reguł cross-field (np. `Electric` wymaga `Automatic`),
- wywołanie serwisu zapisu snapshotu, który aktualizuje snapshot JSONB + kolumny projekcyjne + tytuł + `visibleGroupIds` / `visibleQuestionIds` + smart pruning,
- zwrócenie kanonicznej odpowiedzi z przebudowanymi projekcjami i metadanymi zmiany wersji.

Docelowe lokalizacje:

| Rola | Ścieżka |
|---|---|
| Handler | `server/api/v1/inspections/[inspectionId]/part-1.put.ts` |
| Serwis | `server/utils/services/save-inspection-part1.ts` |
| SQL funkcja | `supabase/migrations/<timestamp>_add_save_inspection_part1_function.sql` |
| Zod kontrakty | `shared/contracts/inspections.ts` (rozszerzenie istniejącego pliku) |
| Typy DTO | `app/types.ts` (istniejące typy są wystarczające; ewentualnie dodanie `PutPart1ResultDto`) |

---

## 2. Szczegóły żądania

- **Metoda HTTP:** `PUT`
- **URL:** `/api/v1/inspections/{inspectionId}/part-1`
- **Auth:** wymagana aktywna sesja Supabase SSR

### Route parameters

| Parametr | Typ | Wymagany | Reguły walidacji |
|---|---|---|---|
| `inspectionId` | UUID string | tak | `z.string().uuid()` |

### Query parameters

| Parametr | Typ | Wymagany | Reguły walidacji |
|---|---|---|---|
| `dryRun` | `"true"` \| `"false"` | nie | `z.coerce.boolean().optional()`; brak → `false` |

### Request body

```json
{
  "price": 23000,
  "make": " Toyota ",
  "model": "Corolla",
  "yearOfProduction": 2016,
  "registrationNumber": "abc 123",
  "vinNumber": "JH4DA9350LS000000",
  "mileage": 132000,
  "fuelType": "Petrol",
  "transmission": "Manual",
  "drive": "2WD",
  "color": "Silver",
  "bodyType": "Sedan",
  "numberOfDoors": 4,
  "address": "Main Street 10, London",
  "notes": ""
}
```

| Pole | Typ | Wymagany | Reguły walidacji i normalizacji |
|---|---|---|---|
| `make` | string | **tak** | trim; collapse repeated spaces; 1–50 znaków po normalizacji |
| `model` | string | **tak** | trim; collapse repeated spaces; 1–60 znaków po normalizacji |
| `fuelType` | enum | **tak** | `Petrol` \| `Diesel` \| `Hybrid` \| `Electric` |
| `transmission` | enum | **tak** | `Manual` \| `Automatic` |
| `drive` | enum | **tak** | `2WD` \| `4WD` |
| `bodyType` | enum | **tak** | `Sedan` \| `Hatchback` \| `SUV` \| `Coupe` \| `Convertible` \| `Van` \| `Pickup` \| `Other` |
| `price` | number \| null | nie | jeśli podane: `0..10000000`, max 2 miejsca po przecinku |
| `yearOfProduction` | integer \| null | nie | jeśli podane: 4 cyfry, zakres `1886..current UTC year + 1` |
| `registrationNumber` | string \| null | nie | jeśli podane: trim → uppercase → collapse spaces; 2–15 znaków; `^[A-Z0-9 -]+$` |
| `vinNumber` | string \| null | nie | jeśli podane: uppercase; dokładnie 17 znaków; `^[A-HJ-NPR-Z0-9]{17}$` |
| `mileage` | integer \| null | nie | jeśli podane: 0–9 999 999 |
| `color` | string \| null | nie | jeśli podane: trim; 1–40 znaków |
| `numberOfDoors` | integer \| null | nie | jeśli podane: 1–9 |
| `address` | string \| null | nie | jeśli podane: trim; 5–150 znaków |
| `notes` | string | nie | max 1000 znaków; brak → `""` |

**Reguła cross-field:** `fuelType = "Electric"` wymaga `transmission = "Automatic"`. Naruszenie → `422` z komunikatem `Electric cars must use Automatic transmission.` dla pola `transmission`.

---

## 3. Wykorzystywane typy

### Istniejące typy z `app/types.ts`

- `InspectionId`
- `InspectionPart1Dto` — kanoniczny kształt Part 1 po normalizacji
- `InspectionRuntimeFlagsDto`
- `SmartPruningResultDto`
- `ApiMetaDto`
- `ApiSuccessResponseDto<TData>`
- `ApiErrorDto`, `ApiErrorResponseDto`
- `FuelType`, `TransmissionType`, `DriveType`, `BodyType`
- `QuestionId`, `QuestionGroupId`
- `InspectionPartId`

### Nowe typy do zdefiniowania (pochodne z Zod przez `z.infer`)

Rekomendowane nazwy w `shared/contracts/inspections.ts`:

```ts
// Schemat wejściowy (z transformami normalizacji)
PutInspectionPart1CommandSchema   // z.strictObject, transforms, refinements
PutInspectionPart1QuerySchema     // dryRun?: boolean

// Schemat odpowiedzi
SmartPruningResultSchema
PutInspectionPart1ResultSchema
PutInspectionPart1ResponseSchema

// Typy TS wyprowadzone z schematów
type PutInspectionPart1Command = z.input<typeof PutInspectionPart1CommandSchema>
type PutInspectionPart1CommandNormalized = z.output<typeof PutInspectionPart1CommandSchema>
type PutInspectionPart1Result = z.infer<typeof PutInspectionPart1ResultSchema>
type PutInspectionPart1Response = z.infer<typeof PutInspectionPart1ResponseSchema>
```

W `app/types.ts` opcjonalnie:
```ts
// Interfejs zwracany przez serwis
interface PutPart1ServiceResult {
  inspectionId: string;
  part1: InspectionPart1Dto;
  title: string;
  unlockedParts: InspectionPartId[];
  visibleGroupIds: QuestionGroupId[];
  visibleQuestionIds: QuestionId[];
  smartPruning: SmartPruningResultDto;
  snapshotVersion: number;
  clientUpdatedAt: string;
}
```

---

## 4. Szczegóły odpowiedzi

### Sukces: `200 OK`

```json
{
  "data": {
    "inspectionId": "uuid",
    "part1": {
      "price": 23000,
      "make": "Toyota",
      "model": "Corolla",
      "yearOfProduction": 2016,
      "registrationNumber": "ABC 123",
      "vinNumber": "JH4DA9350LS000000",
      "mileage": 132000,
      "fuelType": "Petrol",
      "transmission": "Manual",
      "drive": "2WD",
      "color": "Silver",
      "bodyType": "Sedan",
      "numberOfDoors": 4,
      "address": "Main Street 10, London",
      "notes": ""
    },
    "title": "Toyota Corolla 2016 ABC 123",
    "unlockedParts": ["part2", "part3", "part4", "part5"],
    "visibleGroupIds": ["base-body", "fuel-petrol-common"],
    "visibleQuestionIds": ["q_brakes_pedal_feel"],
    "smartPruning": {
      "applied": false,
      "removedAnswerIds": [],
      "removedQuestionNoteIds": []
    },
    "snapshotVersion": 8,
    "clientUpdatedAt": "2026-05-01T12:45:00Z"
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:45:01Z"
  }
}
```

W trybie `dryRun=true` odpowiedź ma identyczną strukturę, ale `snapshotVersion` zwraca aktualną wartość z bazy (bez inkrementacji), a `clientUpdatedAt` odzwierciedla wartość z request body lub aktualny timestamp serwera.

### Błędy

| Status | Kiedy |
|---|---|
| `400 Bad Request` | Brak body, nieprawidłowy JSON, nierozpoznane pola (strict), brakujące wymagane pola enum |
| `401 Unauthorized` | Brak aktywnej sesji Supabase SSR |
| `404 Not Found` | Inspekcja nie istnieje lub nie należy do bieżącego użytkownika |
| `409 Conflict` | `baseSnapshotVersion` jest przestarzały i wymagane jest odświeżenie stanu — lub inspekcja jest aktualnie zablokowana przez równoległy zapis |
| `422 Unprocessable Entity` | Błędy walidacji pól lub reguła cross-field (np. `Electric` + `Manual`) |

---

## 5. Przepływ danych

### Diagram kroku po kroku

```
PUT /api/v1/inspections/{inspectionId}/part-1
  │
  ├─ 1. assertMutationOrigin(event)          — Origin/Referer guard (cookie-based auth)
  ├─ 2. getRequiredUserId(event)             — 401 jeśli brak sesji
  ├─ 3. getValidatedRouterParams(InspectionRouteParamsSchema)  — 400 jeśli bad UUID
  ├─ 4. getValidatedQuery(PutInspectionPart1QuerySchema)       — dryRun: boolean
  ├─ 5. readValidatedBody(PutInspectionPart1CommandSchema)     — 400/422 jeśli invalid
  │      ↳ normalizacja w transformach Zod:
  │        • trim + collapse spaces na make, model, color, address
  │        • uppercase: registrationNumber, vinNumber
  │        • reguła cross-field: Electric → Automatic
  │
  ├─ 6. saveInspectionPart1(event, { userId, inspectionId, command, dryRun })
  │      ↳ pobiera bieżący rekord inspekcji (ownership + version check)
  │      ↳ 404 jeśli nieznana lub obca inspekcja
  │      ↳ wywołuje SQL funkcję public.save_inspection_part1(...)
  │          • atomowo aktualizuje snapshot.part_1
  │          • aktualizuje kolumny projekcyjne (make, model, fuel_type, …)
  │          • wylicza title z pól Part 1
  │          • wylicza visibleGroupIds i visibleQuestionIds z question bank
  │          • wykonuje smart pruning odpowiedzi/notatek poza widocznymi pytaniami
  │          • inkrementuje snapshot_version
  │          • aktualizuje client_updated_at
  │      ↳ jeśli dryRun=true: nie wywołuje SQL funkcji zapisu;
  │          zwraca znormalizowany payload + obliczone projekcje bez persystowania
  │
  └─ 7. Zwraca PutInspectionPart1ResponseDto z 200 OK
```

### Podział odpowiedzialności

**Handler `server/api/v1/inspections/[inspectionId]/part-1.put.ts`:**
- Origin guard i auth guard
- Walidacja i normalizacja przez Zod (route params, query, body)
- Wywołanie serwisu
- Mapowanie błędów domenowych na kody HTTP
- Budowanie koperty odpowiedzi

**Serwis `server/utils/services/save-inspection-part1.ts`:**
- Odczyt bieżącego stanu inspekcji i weryfikacja własności
- Opcjonalny snapshot version check (409 Conflict jeśli `baseSnapshotVersion` niezgodny, jeśli klient go dostarcza)
- Wywołanie SQL funkcji `public.save_inspection_part1` przez `serverSupabaseServiceRole`
- Obliczanie tytułu z znormalizowanych pól Part 1
- Obliczanie `visibleGroupIds` i `visibleQuestionIds` z question bank na podstawie `fuelType`, `transmission`, `drive`, `bodyType`
- Smart pruning: identyfikacja odpowiedzi i notatek do usunięcia po zmianie widoczności
- Zwrócenie `PutPart1ServiceResult` do handlera
- W trybie `dryRun`: wykonanie obliczeń bez wywołania SQL zapisu

**SQL funkcja `public.save_inspection_part1`:**
- Aktualizacja atomowa pod advisory lock per inspection
- Zapis `snapshot.part_1` jako JSONB
- Aktualizacja kolumn projekcyjnych (`make`, `model`, `fuel_type`, `transmission`, `drive`, `body_type`, `price`, `mileage`, `registration_number`, `vin_number`, `year_of_production`, `color`, `number_of_doors`, `address`)
- Zapis `title` (zbudowanego po stronie serwisu)
- Zapis `visible_group_ids` i `visible_question_ids` w snapshot
- Zastosowanie smart pruning w snapshot (usunięcie kluczy z `answers` i `question_notes`)
- Inkrementacja `snapshot_version`
- Aktualizacja `client_updated_at` i `updated_at`
- `SECURITY DEFINER`, `EXECUTE` tylko dla `service_role`

### Budowanie tytułu

Tytuł inspekcji jest budowany z znormalizowanych pól Part 1 w formacie:
`{make} {model} [{yearOfProduction}] [{registrationNumber}]`

Przykłady:
- `"Toyota Corolla 2016 ABC 123"` — wszystkie pola podane
- `"Toyota Corolla 2016"` — brak numeru rejestracyjnego
- `"Toyota Corolla"` — brak roku i numeru rejestracyjnego

Tytuł powinien być budowany deterministycznie po stronie serwisu TypeScript (nie w SQL), aby logika pozostała testowalną jednostką.

### Obliczanie widoczności (question bank)

`visibleGroupIds` i `visibleQuestionIds` są wyliczane po stronie serwisu Node.js z kanonicznego question bank (repo artifact, nie baza). Widoczność bazuje na:
- `Base` — zawsze widoczne
- `fuelType` — `fuel-petrol-common`, `fuel-diesel-common`, `fuel-hybrid-common`, `fuel-electric-common`
- `transmission`, `drive`, `bodyType` — dodatkowe grupy specyficzne dla konfiguracji
- Runtime flags (pobierane ze snapshotu — nie zmieniane przez Part 1)

### Smart Pruning

Po obliczeniu nowej listy `visibleQuestionIds`, serwis porównuje je z poprzednią i identyfikuje pytania, które stały się niewidoczne. Dla każdego takiego `questionId` usuwa wpis z `snapshot.answers` i `snapshot.question_notes`. Zwraca `SmartPruningResultDto` z listami usuniętych ID i flagą `applied`.

---

## 6. Względy bezpieczeństwa

### Uwierzytelnienie i autoryzacja

- Sesja SSR jest weryfikowana przez `getRequiredUserId(event)` (helper oparty o `serverSupabaseUser(event)`) przed jakąkolwiek operacją domenową.
- Własność inspekcji jest weryfikowana po stronie serwisu przez `WHERE id = $inspectionId AND user_id = $userId`. Brak wyniku → 404 (nie wyciekamy informacji o istnieniu cudzych inspekcji).
- Zapis przez `serverSupabaseServiceRole` jest jedyną drogą mutacji, ponieważ RLS blokuje bezpośrednie zapisy przeglądarki do `public.inspections`.

### Ochrona CSRF

- `assertMutationOrigin(event)` uruchamiany przed jakimkolwiek parsowaniem body — weryfikuje nagłówki `Origin` / `Referer` dla cookie-based auth.

### Walidacja danych wejściowych

- `z.strictObject` na body schema — nieznane pola powodują `400`.
- Normalizacja w transformach Zod (trim, uppercase) zapobiega wstrzyknięciu danych z nadmiarowymi białymi znakami lub mieszaną wielkością liter.
- Reguła cross-field (`Electric` + `Automatic`) jest egzekwowana i przez Zod `.superRefine()` (422 z polem `transmission`), i przez CHECK constraint w bazie (`fuel_type IS DISTINCT FROM 'Electric' OR transmission IS NULL OR transmission = 'Automatic'`).
- `yearOfProduction` wymaga dynamicznego górnego limitu (`current UTC year + 1`) — walidacja przez `.superRefine()` w schemacie Zod.
- `dryRun` jest traktowany jako `false` gdy nieobecny — zapobiega przypadkowemu pominięciu zapisu.

### Bezpieczeństwo bazy danych

- SQL funkcja `public.save_inspection_part1` używa `SECURITY DEFINER` z `EXECUTE` ograniczonym do `service_role`.
- Advisory lock per inspection ID serializuje równoległe żądania zapisu i eliminuje race condition snapshot_version.
- Dane wejściowe trafiają do bazy wyłącznie przez parametryzowane zapytania (nie ma interpolacji stringów w SQL).

---

## 7. Obsługa błędów

| Kod | Scenariusz | Wiadomość / szczegóły |
|---|---|---|
| `400 Bad Request` | Nieprawidłowy JSON, brakujące pola wymagane (`make`, `model`, `fuelType`, `transmission`, `drive`, `bodyType`), nieznane pola w strict body | Ogólny komunikat walidacji lub lista pól |
| `401 Unauthorized` | Brak sesji lub wygasła sesja SSR | `Unauthorized` |
| `404 Not Found` | `inspectionId` nie istnieje lub należy do innego użytkownika | `Inspection not found` |
| `409 Conflict` | `baseSnapshotVersion` (opcjonalne) niezgodny z aktualnym | `Snapshot version conflict. Refresh inspection state and retry.` |
| `422 Unprocessable Entity` | Reguła cross-field: Electric + Manual | `Electric cars must use Automatic transmission.` dla pola `transmission` |
| `422 Unprocessable Entity` | Inne naruszenia semantyczne (np. `yearOfProduction` poza zakresem, `registrationNumber` nieprawidłowe znaki) | Lista błędów per pole |
| `500 Internal Server Error` | Nieoczekiwany błąd bazy lub bug implementacji | Ogólny komunikat bez detali Supabase |

### Konwencja formatu błędu

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": [
      {
        "field": "transmission",
        "message": "Electric cars must use Automatic transmission."
      }
    ]
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:45:01Z"
  }
}
```

### Mapowanie błędów domenowych

- Błąd bazy `INSPECTION_NOT_FOUND` lub brak wiersza → `404`
- Błąd bazy `SNAPSHOT_VERSION_CONFLICT` → `409`
- `ZodError` z body validation → `422` z `details` per pole
- `ZodError` z cross-field → `422` z `details` dla `transmission`
- Pozostałe nieoczekiwane błędy → `500` (logowane z `requestId`)

---

## 8. Wydajność

### Potencjalne wąskie gardła

- Odczyt question bank per request — question bank powinien być wczytany do pamięci raz przy starcie serwisu Nitro (singleton) lub cached jako moduł ES importowany statycznie, nie odczytywany z dysku per request.
- Obliczanie widoczności (grup i pytań) — deterministyczne filtrowanie na in-memory question bank jest tanie; nie wymaga cache per request.
- Advisory lock w SQL — serializuje równoległe zapisy dla tego samego `inspectionId`, ale przy modelu 2 inspekcji per user nie stanowi wąskiego gardła.

### Strategie optymalizacji

- Singleton question bank importowany statycznie jako moduł TS — brak I/O per request.
- SQL funkcja `public.save_inspection_part1` łączy select + update w jednej transakcji, minimalizując round-tripsy.
- Odpowiedź jest budowana z wartości zwróconych przez SQL funkcję (returning clause) — brak dodatkowego selecta po zapisie.
- Dla `dryRun=true` pomijamy cały round-trip do bazy — koszt to jedynie obliczenia po stronie Node.js.

---

## 9. Kroki implementacji

1. **Rozszerzyć `shared/contracts/inspections.ts`** o:
   - `PutInspectionPart1QuerySchema` (`dryRun: z.coerce.boolean().default(false)`)
   - `PutInspectionPart1CommandSchema` — `z.strictObject` z transformami normalizacji (trim, uppercase, collapse spaces) i `.superRefine` dla cross-field (Electric + Automatic) oraz `yearOfProduction` dynamic upper bound
   - `SmartPruningResultSchema`
   - `PutInspectionPart1ResultSchema` i `PutInspectionPart1ResponseSchema`

2. **Zaimplementować logikę obliczania tytułu** w `server/utils/services/save-inspection-part1.ts` jako czystą funkcję `buildInspectionTitle(part1: PutInspectionPart1CommandNormalized): string`.

3. **Zaimplementować logikę widoczności** — funkcja `resolveVisibility(part1: ..., runtimeFlags: ...): { visibleGroupIds: string[], visibleQuestionIds: string[] }` operująca na statycznym question bank (singleton zaimportowany jako moduł TS).

4. **Zaimplementować logikę smart pruning** — funkcja `applySmartPruning(snapshot: ..., newVisibleQuestionIds: string[]): SmartPruningResultDto` usuwająca orphaned answers i question_notes.

5. **Napisać SQL migrację** `supabase/migrations/<timestamp>_add_save_inspection_part1_function.sql`:
   - Funkcja `public.save_inspection_part1(p_user_id, p_inspection_id, p_part1_json, p_visible_group_ids, p_visible_question_ids, p_pruned_answers, p_pruned_question_notes, p_title, p_client_updated_at)` z advisory lock per inspection ID
   - `SECURITY DEFINER`, `EXECUTE` tylko dla `service_role`
   - `RETURNS TABLE` z pełnymi kolumnami potrzebnymi do zbudowania odpowiedzi

6. **Zaimplementować serwis** `server/utils/services/save-inspection-part1.ts`:
   - Metoda `saveInspectionPart1(event, params)` zawierająca:
     - Odczyt inspekcji (`SELECT ... WHERE id = ? AND user_id = ?`)
     - 404 jeśli brak wyniku
     - Opcjonalny snapshot_version conflict check (409)
     - Wywołanie funkcji obliczania widoczności
     - Wywołanie smart pruning
     - Budowanie tytułu
     - Wywołanie SQL funkcji przez `serverSupabaseServiceRole(event).rpc(...)`
     - Mapowanie wyniku RPC na `PutPart1ServiceResult`
   - Osobna ścieżka dla `dryRun=true` (obliczenia bez zapisu SQL)

7. **Zaimplementować handler** `server/api/v1/inspections/[inspectionId]/part-1.put.ts`:
   - `assertMutationOrigin(event)`
   - `getRequiredUserId(event)`
   - `getValidatedRouterParams(event, InspectionRouteParamsSchema)`
   - `getValidatedQuery(event, PutInspectionPart1QuerySchema)`
   - `readValidatedBody(event, PutInspectionPart1CommandSchema)` z obsługą `ZodError` → `422`
   - Wywołanie `saveInspectionPart1(...)` lub `dryRunPart1(...)` zależnie od flagi
   - Mapowanie błędów domenowych na `createError()`
   - Zwrócenie `{ data: result, meta: { requestId, timestamp } }` z status `200`

8. **Napisać testy Nuxt** `test/nuxt/inspection-part1-put.test.ts`:
   - Scenariusz sukcesu: pełny payload → normalizacja + zapis + odpowiedź 200
   - Scenariusz `dryRun=true`: brak zapisu, odpowiedź 200 z prawidłowymi projekcjami
   - Scenariusz 401: brak sesji
   - Scenariusz 404: nieznany lub cudzy `inspectionId`
   - Scenariusz 409: `baseSnapshotVersion` niezgodny
   - Scenariusz 422 cross-field: `Electric` + `Manual` → błąd dla `transmission`
   - Scenariusz 422 per-field: `yearOfProduction` poza zakresem, `registrationNumber` nieprawidłowe znaki
   - Scenariusz smart pruning: zmiana `fuelType` → usunięcie odpowiedzi powiązanych z poprzednią konfiguracją
