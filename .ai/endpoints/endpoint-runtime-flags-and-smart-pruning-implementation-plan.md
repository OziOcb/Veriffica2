# API Endpoint Implementation Plan: PATCH /api/v1/inspections/{inspectionId}/runtime-flags

## 1. Przegląd punktu końcowego

Endpoint `PATCH /api/v1/inspections/{inspectionId}/runtime-flags` aktualizuje runtime flags zapisane w kanonicznym snapshotcie inspekcji i po każdej zmianie ponownie wylicza `visibleGroupIds` oraz `visibleQuestionIds`. Jeżeli nowa konfiguracja powoduje, że część pytań przestaje być widoczna, endpoint musi uruchomić Smart Pruning i usunąć osierocone odpowiedzi oraz notatki pytaniowe.

To jest mutacja kontrolująca stan pochodny snapshotu, więc implementacja powinna być spójna z istniejącym flow `PUT /api/v1/inspections/{inspectionId}/part-1`:

- ten sam model auth i ownership check po stronie Nitro,
- ten sam model response envelope z `requestId` i timestampem,
- ten sam mechanizm wyliczania widoczności oparty o question bank w repo,
- ten sam model smart pruning,
- atomowy zapis do `public.inspections.snapshot` przez funkcję SQL wywoływaną z serwisu.

Endpoint wspiera dwa tryby:

- `mode=apply` jako domyślny tryb persystujący zmiany,
- `mode=preview`, który liczy wynik kanoniczny i pruning, ale nie wykonuje zapisu.

Docelowe lokalizacje implementacji:

| Rola | Ścieżka |
| --- | --- |
| Handler | `server/api/v1/inspections/[inspectionId]/runtime-flags.patch.ts` |
| Serwis | `server/utils/services/patch-inspection-runtime-flags.ts` |
| Wspólne pure helpers | `server/utils/services/inspection-visibility.ts` albo równoważny nowy moduł |
| Zod kontrakty | `shared/contracts/inspections.ts` |
| SQL migracja | `supabase/migrations/<timestamp>_add_save_inspection_runtime_flags_function.sql` |
| Test handlera | `test/nuxt/inspection-runtime-flags-patch.test.ts` |

Najważniejsza decyzja architektoniczna: nie duplikować `resolveVisibility` i `applySmartPruning` w nowym serwisie. Oba helpery już istnieją w `save-inspection-part1.ts` i powinny zostać wyodrębnione do wspólnego modułu serwerowego, ponieważ będą współdzielone co najmniej przez `PUT /part-1`, `PATCH /runtime-flags` i późniejszy `/sync`.

## 2. Szczegóły żądania

- Metoda HTTP: `PATCH`
- URL: `/api/v1/inspections/{inspectionId}/runtime-flags`
- Auth: wymagana aktywna sesja Supabase SSR

### Parametry route

| Parametr | Typ | Wymagany | Walidacja |
| --- | --- | --- | --- |
| `inspectionId` | UUID string | tak | `z.string().uuid()` |

### Query parameters

| Parametr | Typ | Wymagany | Walidacja |
| --- | --- | --- | --- |
| `mode` | `preview` \| `apply` | nie | domyślnie `apply` |

### Request body

Rekomendowana semantyka powinna pozostać zgodna z istniejącym `PatchInspectionRuntimeFlagsCommand` z `app/types.ts`, czyli zachować prawdziwe zachowanie `PATCH`:

- `baseSnapshotVersion` jest obowiązkowe,
- co najmniej jedno znane pole flagi musi być obecne,
- każde pole flagi jest opcjonalne i typu `boolean`,
- nieznane pola muszą zostać odrzucone.

Przykładowe pełne body ze specyfikacji:

```json
{
  "chargingPortEquipped": false,
  "evBatteryDocsAvailable": false,
  "turboEquipped": true,
  "mechanicalCompressorEquipped": false,
  "importedFromEU": false,
  "baseSnapshotVersion": 8
}
```

Przykładowe częściowe body, które również powinno być akceptowane:

```json
{
  "turboEquipped": true,
  "baseSnapshotVersion": 8
}
```

### Reguły walidacji wejścia

| Pole | Typ | Wymagane | Reguła |
| --- | --- | --- | --- |
| `baseSnapshotVersion` | integer | tak | dodatnia liczba całkowita |
| `chargingPortEquipped` | boolean | nie | tylko `true` / `false` |
| `evBatteryDocsAvailable` | boolean | nie | tylko `true` / `false` |
| `turboEquipped` | boolean | nie | tylko `true` / `false` |
| `mechanicalCompressorEquipped` | boolean | nie | tylko `true` / `false` |
| `importedFromEU` | boolean | nie | tylko `true` / `false` |

Dodatkowe zasady:

- body musi być `strictObject`, żeby nieznane klucze kończyły się kontrolowanym `422`,
- endpoint nie powinien przyjmować pustego patcha zawierającego wyłącznie `baseSnapshotVersion`,
- `mode=preview` nie może wykonywać zapisu ani inkrementować `snapshotVersion`,
- `mode=apply` nie może podnosić wersji dla no-op update, zgodnie z regułą domenową repo.

### Wymagane DTO i modele command

Istniejące typy w `app/types.ts`, które należy wykorzystać zamiast duplikować:

- `PatchInspectionRuntimeFlagsQuery`
- `PatchInspectionRuntimeFlagsCommand`
- `InspectionRuntimeFlagsDto`
- `SmartPruningResultDto`
- `PatchInspectionRuntimeFlagsResultDto`
- `PatchInspectionRuntimeFlagsResponseDto`
- `InspectionRouteParams`
- `ApiSuccessResponseDto<T>`

Nowe lub rozszerzone kontrakty Zod w `shared/contracts/inspections.ts`:

```ts
export const RuntimeFlagsPatchModeSchema = z.enum(["preview", "apply"]);

export const PatchInspectionRuntimeFlagsQuerySchema = z.object({
  mode: RuntimeFlagsPatchModeSchema.default("apply"),
});

export const PatchInspectionRuntimeFlagsCommandSchema = z
  .strictObject({
    baseSnapshotVersion: z.number().int().positive(),
    chargingPortEquipped: z.boolean().optional(),
    evBatteryDocsAvailable: z.boolean().optional(),
    turboEquipped: z.boolean().optional(),
    mechanicalCompressorEquipped: z.boolean().optional(),
    importedFromEU: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // co najmniej jedna znana flaga musi być obecna
  });

export const PatchInspectionRuntimeFlagsResultSchema = z.object({
  inspectionId: z.string().uuid(),
  runtimeFlags: InspectionRuntimeFlagsSchema,
  visibleGroupIds: z.array(z.string()),
  visibleQuestionIds: z.array(z.string()),
  smartPruning: SmartPruningResultSchema,
  snapshotVersion: z.number().int().positive(),
});

export const PatchInspectionRuntimeFlagsResponseSchema = z.object({
  data: PatchInspectionRuntimeFlagsResultSchema,
  meta: ApiMetaSchema,
});
```

Typy TypeScript powinny zostać wyprowadzone przez `z.infer` lub `z.output`, bez ręcznego utrzymywania równoległych interfejsów kontraktowych.

## 3. Szczegóły odpowiedzi

### Sukces: `200 OK`

```json
{
  "data": {
    "inspectionId": "uuid",
    "runtimeFlags": {
      "chargingPortEquipped": false,
      "evBatteryDocsAvailable": false,
      "turboEquipped": true,
      "mechanicalCompressorEquipped": false,
      "importedFromEU": false
    },
    "visibleGroupIds": [
      "base-body",
      "fuel-petrol-common",
      "petrol-turbo"
    ],
    "visibleQuestionIds": [
      "q_brakes_pedal_feel",
      "q_turbo_whistle"
    ],
    "smartPruning": {
      "applied": true,
      "removedAnswerIds": [],
      "removedQuestionNoteIds": []
    },
    "snapshotVersion": 9
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:50:00Z"
  }
}
```

### Semantyka `preview`

W `mode=preview` odpowiedź ma identyczny shape jak w `apply`, ale:

- `snapshotVersion` zwraca bieżącą wartość z bazy,
- nic nie jest persystowane,
- `smartPruning` opisuje, co zostałoby usunięte po zastosowaniu patcha,
- odpowiedź służy wyłącznie do pokazania skutku zmiany przed zapisem.

### Semantyka no-op

Jeżeli wynikowy stan runtime flags jest identyczny z bieżącym stanem kanonicznym, a recompute widoczności i pruning niczego nie zmieniają, endpoint powinien zwrócić `200 OK` bez inkrementacji `snapshotVersion` i bez wykonywania mutacji SQL. To jest ważne dla zachowania reguły repo: no-op update nie zmienia wersji snapshotu ani `updated_at`.

### Kody błędów

| Status | Kiedy |
| --- | --- |
| `400 Bad Request` | niepoprawny UUID, niepoprawny `mode`, brak JSON body, nieprawidłowy JSON |
| `401 Unauthorized` | brak aktywnej sesji użytkownika |
| `404 Not Found` | inspekcja nie istnieje lub nie należy do bieżącego użytkownika |
| `409 Conflict` | `baseSnapshotVersion` jest przestarzały albo inspekcja jest w stanie `completed` i wymaga reopen |
| `422 Unprocessable Entity` | nieznane flagi, brak choć jednej mutowalnej flagi, nieprawidłowe typy pól body |
| `500 Internal Server Error` | nieoczekiwany błąd serwera lub bazy |

## 4. Przepływ danych

### Handler HTTP

Rekomendowany handler `server/api/v1/inspections/[inspectionId]/runtime-flags.patch.ts` powinien być cienką warstwą HTTP, analogiczną do istniejącego `part-1.put.ts`:

1. wygenerować `requestId`,
2. wywołać `useRuntimeConfig(event)`,
3. uruchomić `assertMutationOrigin(event)`,
4. pobrać `userId` przez `getRequiredUserId(event)`,
5. zwalidować route params i query przez Zod,
6. odczytać i zwalidować body,
7. wywołać serwis `patchInspectionRuntimeFlags(...)`,
8. zwrócić standardową kopertę sukcesu.

### Rekomendowany podział logiki

**Handler** odpowiada za:

- auth guard,
- CSRF guard (`Origin` / `Referer`),
- walidację `inspectionId`, `mode` i body,
- mapowanie błędów Zod/domenowych na kody HTTP,
- zbudowanie response envelope.

**Nowy serwis `patch-inspection-runtime-flags.ts`** odpowiada za:

- pobranie bieżącej inspekcji z `public.inspections`,
- weryfikację ownership i statusu,
- sprawdzenie konfliktu `baseSnapshotVersion`,
- zmergowanie patcha z bieżącym `runtime_flags`,
- odczyt `part_1` z kanonicznego snapshotu,
- przeliczenie `visibleGroupIds` i `visibleQuestionIds`,
- wykonanie Smart Pruning,
- obsługę `preview`, `no-op`, `apply`,
- wywołanie funkcji SQL zapisującej snapshot atomowo.

**Wspólny moduł pure helpers** powinien zawierać:

- `resolveVisibility(part1, runtimeFlags)`
- `applySmartPruning(currentAnswers, currentQuestionNotes, visibleQuestionIds)`

To są już sprawdzone elementy obecne w `save-inspection-part1.ts`; należy je przenieść bez zmiany semantyki.

### Szczegółowy przebieg serwisu

1. `serverSupabaseServiceRole(event)` wykonuje odczyt rekordu `inspections` filtrowanego po `id` i `user_id`.
2. Serwis pobiera co najmniej: `status`, `snapshot_version`, `snapshot`, `client_updated_at`.
3. Jeżeli brak rekordu, zwraca `404`.
4. Jeżeli `status = 'completed'`, zwraca `409`, bo runtime flags nie mogą być edytowane dla raportu w trybie `report`.
5. Jeżeli `baseSnapshotVersion !== current.snapshot_version`, zwraca `409 Conflict`.
6. Serwis odczytuje bieżące `runtime_flags` z `snapshot.runtime_flags`, wypełniając brakujące klucze wartością `false`.
7. Serwis scala patch body z bieżącymi flagami i buduje `nextRuntimeFlags`.
8. Serwis odczytuje `part_1` ze snapshotu:
   - jeśli `part_1` istnieje i jest poprawnym obiektem, uruchamia `resolveVisibility`,
   - jeśli `part_1` jest `null`, zwraca puste `visibleGroupIds` i `visibleQuestionIds`, co utrzymuje kanoniczną spójność snapshotu także przed zapisaniem Part 1.
9. Serwis uruchamia `applySmartPruning` dla aktualnych `answers` i `question_notes`.
10. Jeśli `mode=preview`, zwraca wynik bez wywołania SQL.
11. Jeśli wynik jest no-op, zwraca `200` z bieżącym `snapshotVersion` bez wywołania SQL.
12. W przeciwnym razie wywołuje funkcję SQL zapisującą nowy `runtime_flags`, nowe tablice widoczności i smart pruning.
13. Serwis buduje `PatchInspectionRuntimeFlagsResultDto` i zwraca go handlerowi.

### SQL / zapis do bazy

Najbardziej spójne z aktualnym repo jest dodanie nowej funkcji `public.save_inspection_runtime_flags(...)`, analogicznej do istniejącej `public.save_inspection_part1(...)`.

Funkcja SQL powinna:

- działać jako `security definer`,
- być wykonywalna tylko przez `service_role`,
- założyć `pg_advisory_xact_lock` per `(user_id, inspection_id)`,
- jeszcze raz zweryfikować ownership wewnątrz locka,
- jeszcze raz porównać `snapshot_version` z `p_base_snapshot_version`,
- zbudować nowy `snapshot` na podstawie aktualnego rekordu,
- nadpisać `snapshot.runtime_flags`,
- usunąć klucze z `snapshot.answers` i `snapshot.question_notes` zgodnie z pruningiem,
- nadpisać `snapshot.visible_group_ids` i `snapshot.visible_question_ids`,
- ustawić `client_updated_at` na serwerowy timestamp ISO,
- zwrócić zaktualizowany rekord lub minimalny zestaw pól potrzebnych do odpowiedzi.

Rekomendowany minimalny podpis RPC:

```sql
public.save_inspection_runtime_flags(
  p_user_id uuid,
  p_inspection_id uuid,
  p_base_snapshot_version bigint,
  p_runtime_flags jsonb,
  p_visible_group_ids text[],
  p_visible_question_ids text[],
  p_removed_answer_ids text[],
  p_removed_question_note_ids text[],
  p_client_updated_at timestamptz
)
```

### Walidacja na granicy HTTP

Specyfikacja rozróżnia `400` od `422`, więc handler powinien jawnie rozdzielić te przypadki:

- `400`: błędny route/query, nieprawidłowy JSON, brak obiektu body,
- `422`: body ma poprawny JSON, ale łamie kontrakt domenowy lub zawiera nieznane flagi.

Praktycznie oznacza to, że dla body lepiej użyć `safeParse` i własnego mapowania ZodError niż polegać bezwarunkowo na domyślnym `schema.parse(...)` w `readValidatedBody`, bo ten endpoint ma bardziej precyzyjne wymagania status code niż obecny `part-1.put.ts`.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Endpoint musi działać wyłącznie dla użytkownika ustalonego po stronie serwera z sesji Supabase SSR.
- `inspectionId` jest danymi nieufnymi; ownership musi być sprawdzany w warstwie serwisowej i ponownie w funkcji SQL.
- `404 Not Found` musi maskować różnicę między zasobem nieistniejącym i cudzym.

### Ochrona przed CSRF

- Ponieważ model auth jest cookie-based, handler musi uruchamiać `assertMutationOrigin(event)` przed jakąkolwiek mutacją.
- Nie wolno polegać wyłącznie na tym, że UI wywołuje endpoint z tej samej domeny.

### Granice uprzywilejowania

- Zapis ma przechodzić przez serwis w `server/utils/services` i funkcję SQL wywoływaną klientem service-role.
- Żaden sekret ani klucz service-role nie może wyciekać do klienta.
- Nawet jeśli repo obecnie korzysta z explicit ownership checks w service-role path, funkcja SQL nadal musi sprawdzać `user_id`, żeby nie opierać bezpieczeństwa tylko na warstwie HTTP.

### Integralność danych

- `baseSnapshotVersion` chroni przed nadpisaniem nowszej wersji snapshotu przez starszy klient.
- Smart Pruning musi usuwać tylko te odpowiedzi i notatki, które nie są już widoczne po recompute; nie może naruszać nadal widocznych pytań.
- `mode=preview` nie może zmieniać `snapshot`, `snapshotVersion`, `updated_at` ani `client_updated_at`.

### Logowanie operacyjne

W repo nie ma obecnie tabeli błędów ani tabeli audytowej dla takich operacji. Dlatego zalecane jest logowanie strukturalne do logów aplikacyjnych z polami:

- `requestId`
- `userId`
- `inspectionId`
- `mode`
- `baseSnapshotVersion`
- lista zmienionych flag
- liczba usuniętych odpowiedzi i notatek
- kategoria błędu

Nie należy logować pełnego snapshotu ani danych wrażliwych użytkownika.

## 6. Obsługa błędów

### Główne scenariusze błędów

| Scenariusz | Status | Kod błędu | Uwagi |
| --- | --- | --- | --- |
| `inspectionId` nie jest UUID | `400` | `VALIDATION_ERROR` | Route param error |
| `mode` ma wartość inną niż `preview` lub `apply` | `400` | `VALIDATION_ERROR` | Query error |
| Body nie jest poprawnym JSON | `400` | `BAD_REQUEST` | Parse error |
| Body zawiera nieznany klucz flagi | `422` | `VALIDATION_ERROR` | Spec wymaga `422` dla unknown flags |
| Body nie zawiera żadnej flagi do aktualizacji | `422` | `VALIDATION_ERROR` | PATCH bez mutacji nie powinien być akceptowany |
| Jedna z flag nie jest booleanem | `422` | `VALIDATION_ERROR` | Body shape error |
| Brak aktywnej sesji | `401` | `UNAUTHORIZED` | Auth failure |
| Inspekcja nie istnieje lub jest cudza | `404` | `NOT_FOUND` | Ownership masked |
| `baseSnapshotVersion` jest przestarzałe | `409` | `SNAPSHOT_CONFLICT` | Klient musi odświeżyć stan |
| Inspekcja ma status `completed` | `409` | `INSPECTION_NOT_EDITABLE` | Najpierw `POST /reopen` |
| RPC zwraca nieoczekiwany błąd bazy | `500` | `INTERNAL_SERVER_ERROR` | Logować z kontekstem |

### Strategia mapowania błędów

- Błędy walidacji route/query mapować bezpośrednio na `400`.
- Błędy kontraktu body mapować na `422`, zwłaszcza przy nieznanych flagach i błędach shape.
- Błędy konfliktu wersji i state-machine mapować na `409`.
- Nieprzewidziane wyjątki z Supabase lub RPC mapować na `500` i logować z kontekstem endpointu.

### Rejestrowanie błędów w tabeli błędów

Nie dotyczy obecnego stanu repo. `db-plan.md` nie definiuje tabeli błędów, więc implementacja nie powinna tworzyć ad hoc persistence layer tylko dla tego endpointu. Wystarczą:

- strukturalne logi Nitro/Vercel,
- logi Supabase dla błędów SQL/RPC,
- testy regresyjne odtwarzające najważniejsze błędy domenowe.

## 7. Wydajność

- Question bank jest już ładowany jako singleton modułowy z JSON w repo, więc recompute widoczności nie wymaga I/O z dysku ani bazy.
- `preview` powinien wykonywać tylko jeden odczyt rekordu inspekcji i zero zapisów.
- `apply` powinien wykonywać co najwyżej jeden odczyt oraz jeden atomowy RPC zapisujący snapshot.
- Warto dodać w serwisie short-circuit dla no-op update, żeby uniknąć zbędnego RPC i sztucznego contention na locku.
- Advisory lock musi być per inspekcja, nie globalny, aby nie serializować niezależnych zapisów innych użytkowników.
- Smart Pruning działa na mapach `answers` i `question_notes`, które w MVP są małe; liniowy przebieg po kluczach jest wystarczający.
- Maksymalnie 2 inspekcje na użytkownika ograniczają wolumen danych, więc ważniejsza od mikrootymalizacji jest deterministyczna poprawność wersjonowania i pruning.

## 8. Kroki implementacji

1. Rozszerzyć `shared/contracts/inspections.ts` o `PatchInspectionRuntimeFlagsQuerySchema`, `PatchInspectionRuntimeFlagsCommandSchema`, `PatchInspectionRuntimeFlagsResultSchema` i `PatchInspectionRuntimeFlagsResponseSchema`.
2. Wyodrębnić `resolveVisibility` i `applySmartPruning` z `server/utils/services/save-inspection-part1.ts` do nowego wspólnego modułu serwerowego i przepiąć istniejący serwis Part 1 na import z tego modułu.
3. Utworzyć `server/utils/services/patch-inspection-runtime-flags.ts`, który obsłuży fetch bieżącej inspekcji, merge patcha, version conflict, recompute widoczności, smart pruning, preview oraz no-op short-circuit.
4. Dodać migrację SQL z funkcją `public.save_inspection_runtime_flags(...)`, wzorowaną na `public.save_inspection_part1(...)`, z advisory lockiem, ownership checkiem i aktualizacją tylko pól snapshotowych związanych z runtime flags.
5. Utworzyć handler `server/api/v1/inspections/[inspectionId]/runtime-flags.patch.ts` zgodny ze stylem obecnych handlerów Nitro: `requestId`, `useRuntimeConfig(event)`, `assertMutationOrigin(event)`, `getRequiredUserId(event)`, walidacja wejścia, wywołanie serwisu, response envelope.
6. Dodać precyzyjne mapowanie błędów body validation na `422`, tak aby nieznane flagi nie kończyły się ogólnym `400`.
7. Napisać testy w `test/nuxt/inspection-runtime-flags-patch.test.ts` dla scenariuszy: `200 apply`, `200 preview`, `200 no-op`, `401`, `404`, `409 stale version`, `409 completed`, `422 unknown flags`, `422 empty patch`, `smart pruning removes hidden answers`.
8. Dodać lub uzupełnić testy jednostkowe dla wyodrębnionych helperów visibility/pruning, żeby runtime-flags i part-1 współdzieliły ten sam kontrakt zachowania.
9. Po implementacji uruchomić wąski zestaw testów Nuxt/Vitest dla handlera runtime flags i regresyjnie dla `inspection-part1-put`, aby upewnić się, że ekstrakcja helperów nie zmieniła działania istniejącego endpointu.
