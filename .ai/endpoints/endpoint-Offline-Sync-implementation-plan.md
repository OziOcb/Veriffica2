# API Endpoint Implementation Plan: POST /api/v1/inspections/{inspectionId}/sync

## 1. Przegląd punktu końcowego

Endpoint `POST /api/v1/inspections/{inspectionId}/sync` jest kanonicznym punktem synchronizacji offline-first dla inspekcji. Przyjmuje częściową lub pełną mutację snapshotu, waliduje dane wejściowe, scala je z aktualnym stanem kanonicznym, przelicza stan pochodny, egzekwuje reguły domenowe i zwraca jawny wynik synchronizacji z polityką `client_wins`.

Zakres odpowiedzialności endpointu:

- potwierdzenie aktywnej sesji Supabase opartej o cookie SSR,
- walidacja `inspectionId` oraz query parametru `strategy`,
- walidacja payloadu `baseSnapshotVersion`, `clientUpdatedAt` i `mutation`,
- scalenie patcha z bieżącym snapshotem inspekcji,
- ponowne wyliczenie widocznych grup i pytań,
- zastosowanie smart pruning dla osieroconych odpowiedzi i notatek,
- obsługa konfliktów LWW z jawnie zwracanym stanem kanonicznym,
- zwrócenie wyłącznie kanonicznej odpowiedzi w standardowej kopercie API.

To jest jedyny wspierany endpoint do atomowego reconcile dla wielu subresource jednocześnie. Nie powinien delegować zapisów do osobnych endpointów `part-1`, `runtime-flags`, `answers` i `notes`, bo wtedy łatwo utracić atomowość oraz poprawną semantykę konfliktów.

Docelowe lokalizacje implementacji:

| Rola | Ścieżka |
| --- | --- |
| Handler HTTP | `server/api/v1/inspections/[inspectionId]/sync.post.ts` |
| Serwis domenowy | `server/utils/services/sync-inspection.ts` |
| Wspólne helpery snapshotu | `server/utils/services/inspection-snapshot.ts` |
| Wspólny resolver widoczności | `server/utils/services/inspection-visibility.ts` |
| Wspólny helper notatek | `server/utils/services/inspection-note-document.ts` |
| Kontrakty Zod | `shared/contracts/inspections.ts` |
| SQL migracja | `supabase/migrations/<timestamp>_add_save_inspection_snapshot_function.sql` |
| Test handlera | `test/nuxt/inspection-sync-post.test.ts` |

Aktualny model bazy nie definiuje osobnej tabeli błędów, więc dla tego endpointu rejestrowanie błędów powinno odbywać się przez strukturalne logi aplikacyjne, a nie przez zapis do tabeli error log.

## 2. Szczegóły żądania

- Metoda HTTP: `POST`
- URL: `/api/v1/inspections/{inspectionId}/sync`
- Auth: wymagana aktywna sesja Supabase SSR
- Query parameters: `strategy` z jedyną wspieraną wartością `client_wins`
- Request body: wymagane

### Parametry wejściowe

| Element | Wymagany | Typ / zakres | Uwagi |
| --- | --- | --- | --- |
| `inspectionId` | tak | UUID | Identyfikuje inspekcję bieżącego użytkownika |
| `strategy` | nie | literal `client_wins` | Jeśli podany, musi mieć wartość `client_wins`; w praktyce to jedyny dozwolony tryb |
| `baseSnapshotVersion` | tak | dodatnia liczba całkowita | Optimistic concurrency token |
| `clientUpdatedAt` | tak | ISO 8601 UTC string z offsetem | Czas lokalnego commitu po stronie klienta |
| `mutation` | tak | obiekt JSON | Częściowa mutacja snapshotu z co najmniej jednym polem |

### Proponowana semantyka request body

```json
{
  "baseSnapshotVersion": 13,
  "clientUpdatedAt": "2026-05-01T13:15:00Z",
  "mutation": {
    "part1": {
      "make": "Toyota",
      "model": "Corolla",
      "fuelType": "Petrol",
      "transmission": "Manual",
      "drive": "2WD",
      "bodyType": "Sedan"
    },
    "runtimeFlags": {
      "turboEquipped": true
    },
    "answers": {
      "q_body_panel_gaps": "yes"
    },
    "questionNotes": {
      "q_body_panel_gaps": "Looks consistent."
    },
    "globalNotes": "Overall clean interior."
  }
}
```

### Reguły walidacji wejścia

| Pole | Typ | Wymagane | Reguła |
| --- | --- | --- | --- |
| `baseSnapshotVersion` | integer | tak | dodatnia liczba całkowita |
| `clientUpdatedAt` | timestamp | tak | poprawny ISO 8601 UTC z offsetem |
| `mutation` | object | tak | `strictObject`, bez nieznanych kluczy |
| `mutation.part1` | object | nie | częściowy patch Part 1; brakujące pola zostają z bieżącego stanu |
| `mutation.runtimeFlags` | object | nie | patch 5 znanych flag boolean; brakujące flagi zachowują obecne wartości |
| `mutation.answers` | object | nie | mapa `questionId -> yes | no | dont_know`; klucze muszą mieć format `q_...` |
| `mutation.questionNotes` | object | nie | mapa `questionId -> string`; każdy wpis max 500 znaków |
| `mutation.globalNotes` | string | nie | max 10000 znaków |

Dodatkowe zasady:

- `mutation` musi zawierać co najmniej jeden z dozwolonych kluczy top-level; pusty obiekt jest niepoprawny,
- `visibleGroupIds` i `visibleQuestionIds` są wyłącznie własnością serwera i nie mogą być przyjmowane z requestu,
- `part1` nie powinien używać `null` jako sposobu czyszczenia danych; brak pola oznacza brak zmiany,
- `answers` i `questionNotes` są patch-mapami, więc brak klucza oznacza brak zmiany, a nie usunięcie,
- usunięcia nadal powinny być obsługiwane przez dedykowane endpointy DELETE lub smart pruning po zmianie widoczności,
- `questionId` musi używać kanonicznego formatu `q_...`, a nie legacy hyphenated identifiers,
- `runtimeFlags` musi zawierać wyłącznie dozwolone flagi; nieznane klucze kończą się `422`.

### Wykorzystywane typy DTO i Command Modele

Istniejące typy z `app/types.ts`, które powinny zostać wykorzystane zamiast duplikowania:

- `SyncStrategy`
- `PostInspectionSyncQuery`
- `InspectionSyncMutationDto`
- `SyncInspectionCommand`
- `SyncConflictInfoDto`
- `SyncConflictCanonicalInspectionDto`
- `SyncedInspectionDto`
- `SyncInspectionResultDto`
- `SyncInspectionResponseDto`
- `SyncInspectionConflictDataDto`
- `SyncInspectionConflictResponseDto`
- `InspectionCanonicalDto`
- `SmartPruningResultDto`
- `InspectionPart1Dto`
- `InspectionRuntimeFlagsDto`
- `InspectionAnswersDto`
- `InspectionQuestionNotesDto`
- `InspectionProgressDto`
- `InspectionScoreDistributionDto`
- `QuestionId`
- `QuestionGroupId`

Ważna uwaga kontraktowa: obecne typy sync w `app/types.ts` są dobrym transportowym punktem odniesienia, ale runtime schema w `shared/contracts/inspections.ts` powinna być bardziej precyzyjna niż sam `Pick<InspectionSnapshotDto, ...>`. W szczególności `mutation.part1` powinno być traktowane jako patch z tymi samymi regułami normalizacji co Part 1, a nie jako pełny `InspectionPart1Dto`.

Nowe lub uzupełniane kontrakty Zod, które powinny pojawić się w `shared/contracts/inspections.ts`:

- `PostInspectionSyncQuerySchema`
- `InspectionSyncPart1PatchSchema`
- `InspectionSyncRuntimeFlagsPatchSchema`
- `InspectionSyncAnswersPatchSchema`
- `InspectionSyncQuestionNotesPatchSchema`
- `InspectionSyncMutationSchema`
- `SyncInspectionCommandSchema`
- `SyncConflictInfoSchema`
- `SyncConflictCanonicalInspectionSchema`
- `SyncedInspectionSchema`
- `SyncInspectionResultSchema`
- `SyncInspectionResponseSchema`
- `SyncInspectionConflictDataSchema`
- `SyncInspectionConflictResponseSchema`

Jeżeli zespół chce zachować jednoznaczność z istniejącymi typami, nazwy schematów powinny odzwierciedlać aktualne nazwy DTO w `app/types.ts`, a typy TS powinny być wyprowadzane przez `z.infer` / `z.output`, nie utrzymywane ręcznie równolegle.

## 3. Szczegóły odpowiedzi

### Sukces: `200 OK`

Odpowiedź powinna zwracać kanoniczny stan synchronizacji, ale w projekcji lżejszej niż `InspectionCanonicalDto`:

```json
{
  "data": {
    "inspection": {
      "id": "uuid",
      "title": "Toyota Corolla",
      "status": "draft",
      "snapshotVersion": 14,
      "clientUpdatedAt": "2026-05-01T13:15:00Z",
      "updatedAt": "2026-05-01T13:15:01Z",
      "part1": {
        "price": null,
        "make": "Toyota",
        "model": "Corolla",
        "yearOfProduction": null,
        "registrationNumber": null,
        "vinNumber": null,
        "mileage": null,
        "fuelType": "Petrol",
        "transmission": "Manual",
        "drive": "2WD",
        "color": null,
        "bodyType": "Sedan",
        "numberOfDoors": null,
        "address": null,
        "notes": ""
      },
      "runtimeFlags": {
        "chargingPortEquipped": false,
        "evBatteryDocsAvailable": false,
        "turboEquipped": true,
        "mechanicalCompressorEquipped": false,
        "importedFromEU": false
      },
      "answers": {
        "q_body_panel_gaps": "yes"
      },
      "questionNotes": {
        "q_body_panel_gaps": "Looks consistent."
      },
      "globalNotes": "Overall clean interior.",
      "visibleGroupIds": ["base_body"],
      "visibleQuestionIds": ["q_body_panel_gaps"],
      "progress": {
        "answeredQuestions": 1,
        "visibleQuestions": 1,
        "completionRate": 100
      },
      "scoreDistribution": {
        "yes": 1,
        "no": 0,
        "dontKnow": 0
      },
      "mode": "editable"
    },
    "conflict": {
      "detected": false,
      "resolvedWith": "client_wins"
    },
    "smartPruning": {
      "applied": false,
      "removedAnswerIds": [],
      "removedQuestionNoteIds": []
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:15:01Z"
  }
}
```

Mapowanie pól odpowiedzi:

- `inspection` jest projekcją typu `SyncedInspectionDto`, nie pełnym `InspectionDetailDto`,
- `conflict.detected` musi być `false` przy zwykłym sukcesie,
- `conflict.resolvedWith` musi być zawsze `client_wins` dopóki nie powstanie drugi wspierany strategy,
- `smartPruning` raportuje tylko to, co rzeczywiście zostało usunięte z kanonicznego stanu po recompute widoczności,
- `snapshotVersion` rośnie tylko po rzeczywistej zmianie stanu,
- `clientUpdatedAt` w odpowiedzi powinno odzwierciedlać wartość przyjętą z requestu.

### Konflikt: `409 Conflict`

W przypadku konfliktu wersji odpowiedź powinna zwracać jawny envelope konfliktu z kanonicznym stanem referencyjnym:

```json
{
  "error": {
    "code": "SYNC_CONFLICT",
    "message": "The inspection changed since the provided base snapshot version.",
    "details": [
      {
        "field": "baseSnapshotVersion",
        "message": "Refresh local state and retry."
      }
    ]
  },
  "data": {
    "canonicalInspection": {
      "id": "uuid",
      "snapshotVersion": 14,
      "clientUpdatedAt": "2026-05-01T13:14:00Z"
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:15:01Z"
  }
}
```

### Kody odpowiedzi

- `200 OK` — poprawna synchronizacja lub no-op bez zmiany stanu,
- `400 Bad Request` — niepoprawny UUID, nieobsługiwany `strategy`, brak JSON body albo body niebędące obiektem,
- `401 Unauthorized` — brak aktywnej sesji Supabase,
- `404 Not Found` — inspekcja nie istnieje albo nie należy do bieżącego użytkownika,
- `409 Conflict` — `baseSnapshotVersion` jest przestarzały lub stan wymaga jawnej reakcji klienta; dla wersji diverged użyć `SYNC_CONFLICT`,
- `422 Unprocessable Entity` — nieprawidłowy shape snapshotu, naruszenie reguł domenowych, zły `questionId`, przekroczone limity pól albo błędna kombinacja danych,
- `500 Internal Server Error` — nieoczekiwany błąd serwera, bazy lub mapowania.

## 4. Przepływ danych

### Logika wykonania

1. Żądanie trafia do `server/api/v1/inspections/[inspectionId]/sync.post.ts`.
2. Handler pobiera `requestId` i wywołuje `useRuntimeConfig(event)`.
3. Uruchamiany jest `assertMutationOrigin(event)`, ponieważ auth jest cookie-based i endpoint wykonuje mutację stanu.
4. Handler pobiera `userId` przez `getRequiredUserId(event)`.
5. `inspectionId` jest walidowany jako UUID, a `strategy` jako literal `client_wins`.
6. Body jest parsowane przez `readBody` + `safeParse`, aby rozróżnić `400` dla nieprawidłowego JSON od `422` dla błędów kontraktu.
7. Serwis `sync-inspection.ts` pobiera minimalny rekord inspekcji przez `serverSupabaseServiceRole(event)` z jawnym filtrem `id + user_id`.
8. Jeżeli rekord nie istnieje albo należy do innego użytkownika, zwracane jest `404 Not Found` bez ujawniania różnicy między brakującym a cudzym zasobem.
9. Serwis wczytuje bieżący kanoniczny snapshot, `questionBankVersion`, `snapshotVersion`, `clientUpdatedAt`, `status` i pola projekcyjne potrzebne do scalenia.
10. Jeżeli inspekcja jest w stanie `completed`, synchronizacja powinna zostać zablokowana i wymagać jawnego reopen, zamiast cichego nadpisania raportu.
11. Jeśli `mutation.part1` jest obecne, serwis scala patch z bieżącym Part 1, a następnie waliduje wynik przez te same reguły co endpoint Part 1.
12. Jeśli `mutation.runtimeFlags` jest obecne, serwis scala patch z bieżącym zestawem flag i normalizuje brakujące klucze do `false`.
13. Jeżeli `mutation.questionNotes` jest obecne, serwis aktualizuje `question_notes` oraz używa helpera `inspection-note-document.ts` do zachowania one-way mirroring w `globalNotes`; manualny free-text nie może zostać zpowrotem zinterpretowany jako struktura.
14. Jeżeli `mutation.globalNotes` jest obecne, serwis traktuje je jako jawny free-text document i nie próbuje wyciągać z niego struktury notatek pytaniowych.
15. Po scaleniach serwis wylicza nową widoczność przez `resolveVisibility(part1, runtimeFlags)`.
16. Następnie uruchamiane jest `applySmartPruning(...)` dla odpowiedzi i notatek, które przestały być widoczne po recompute.
17. Serwis przelicza `progress`, `scoreDistribution`, `mode` i title wynikający z kanonicznego Part 1.
18. Jeżeli wynikowy stan jest no-op po pełnej kanonikalizacji, serwis powinien zwrócić aktualny snapshot bez bumpowania `snapshotVersion` i bez write path.
19. Jeżeli stan się zmienia, serwis wywołuje pojedynczą atomową funkcję SQL, preferencyjnie `private.save_inspection_snapshot(...)` (albo publiczny odpowiednik z grantem tylko dla `service_role`, jeśli projekt jeszcze nie używa prywatnego schematu).
20. Funkcja SQL pracuje pod advisory lock dla pary `(user_id, inspection_id)`, re-waliduje ownership i `baseSnapshotVersion` wewnątrz transakcji, aktualizuje snapshot JSONB oraz kolumny projekcyjne i zwraca kanoniczny wersjonowany wynik.
21. Handler składa response envelope i zwraca `200 OK` albo `409 Conflict` z `SYNC_CONFLICT`, jeśli wykryto divergencję wersji.

### Podział odpowiedzialności

Handler `server/api/v1/inspections/[inspectionId]/sync.post.ts`:

- odpowiada za granicę HTTP,
- wykonuje auth i CSRF guard,
- waliduje route params, query i body,
- nie zawiera logiki domenowej scalenia snapshotu,
- mapuje błędy na statusy HTTP,
- buduje response envelope i private/no-store header.

Serwis `server/utils/services/sync-inspection.ts`:

- pobiera bieżący rekord inspekcji,
- scala patch z kanonicznym stanem,
- waliduje merged Part 1 i runtime flags,
- przelicza widoczność i smart pruning,
- używa shared note-document helpera,
- wywołuje jedną atomową funkcję SQL,
- zwraca `SyncInspectionResultDto` albo jawny conflict payload.

Wspólne pure helpers:

- `inspection-snapshot.ts` do budowy Part 1, flag, progress i score distribution,
- `inspection-visibility.ts` do recompute widoczności i pruning,
- `inspection-note-document.ts` do one-way mirroring managed sections w global notes.

### Sposób scalenia mutacji

- `part1` powinno być traktowane jako patch i scalane na bieżącym kanonicznym Part 1,
- `runtimeFlags` powinny być patchowane na bieżących flagach,
- `answers` i `questionNotes` powinny działać jako patch-mapy; brak klucza nie oznacza usunięcia,
- `globalNotes` powinno być pełnym replacementem tekstowego dokumentu,
- usunięcia odpowiedzi i notatek wynikające ze zmiany widoczności są realizowane wyłącznie przez smart pruning,
- nie wolno próbować odtwarzać `questionNotes` z samego `globalNotes`.

### Źródła prawdy

- `public.inspections.snapshot` jest źródłem prawdy dla całego kanonicznego stanu,
- `questionBankVersion` z rekordu inspekcji musi determinować wersję artefaktów question banku używanych do recompute widoczności,
- `snapshotSchemaVersion` i `questionBankVersion` są niemutowalne na tym endpointcie,
- DB trigger powinien dalej odpowiadać za inkrementację `snapshotVersion` i `updatedAt`, a funkcja SQL nie powinna dublować tej logiki ręcznie.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Endpoint musi działać wyłącznie dla zalogowanego użytkownika ustalonego po stronie serwera.
- Nie wolno przyjmować `userId` z query, body ani headerów klienta.
- Ponieważ `public.inspections` ma wyłączone RLS, każdy odczyt i zapis musi zawierać jawny filtr `id + user_id`.
- Funkcja SQL musi re-walidować ownership wewnątrz transakcji, a nie polegać tylko na wcześniejszym odczycie serwera.

### Ochrona przed CSRF i nadużyciami

- Musi istnieć walidacja `Origin` i `Referer` dla wszystkich requestów mutujących stan.
- Session cookie powinno pozostać `HttpOnly`, `Secure` i `SameSite=Lax`.
- Ten endpoint jest szczególnie podatny na duże payloady offline, więc handler powinien mieć rozsądny limit rozmiaru body.
- Odpowiedzi nie mogą być publicznie cache'owane.

### Granice zaufania i dane wrażliwe

- Service-role / secret key może być użyty wyłącznie w Nitro server route albo serwisie w `server/utils`.
- Nie wolno logować tokenów, cookie, pełnych snapshotów ani payloadów z wrażliwymi treściami.
- `visibleGroupIds` i `visibleQuestionIds` są generowane na serwerze i nie mogą być źródłem danych od klienta.
- `questionId` musi mieć kanoniczny format `q_...`; legacy hyphenated identifiers nie powinny przechodzić walidacji.
- `client_wins` jest jedyną wspieraną strategią; brak drugiego strategy oznacza, że handler nie powinien pozostawiać furtki na niezwalidowane tryby.

### Logowanie błędów

- Rejestrować tylko metadane diagnostyczne: `requestId`, `userId`, `inspectionId`, `baseSnapshotVersion`, `strategy`, typ błędu, liczbę prunowanych elementów i wynik operacji.
- Nie rejestrować pełnego `mutation` ani zawartości notatek.
- Nie ma obecnie tabeli błędów w modelu bazy, więc aplikacyjne logi strukturalne są jedynym planowanym kanałem diagnostycznym.

## 6. Obsługa błędów

### Scenariusze błędów i statusy

| Scenariusz | Status | Kod błędu | Uwagi implementacyjne |
| --- | --- | --- | --- |
| Brak aktywnej sesji | `401` | `UNAUTHORIZED` | Zwrócić przewidywalny błąd bez szczegółów technicznych |
| `inspectionId` jest niepoprawnym UUID | `400` | `BAD_REQUEST` | Błąd syntaktyczny granicy wejścia |
| `strategy` ma inną wartość niż `client_wins` | `400` | `BAD_REQUEST` | Jedyny wspierany tryb to `client_wins` |
| Body nie jest JSON-em albo nie jest obiektem | `400` | `BAD_REQUEST` | Użyć `readBody` i jawnego sprawdzenia kształtu |
| `mutation` jest pusty | `422` | `VALIDATION_ERROR` | Co najmniej jeden top-level patch musi być obecny |
| Nieznany top-level lub nested key | `422` | `VALIDATION_ERROR` | `strictObject` po stronie schematu |
| Inspekcja nie istnieje albo należy do innego użytkownika | `404` | `NOT_FOUND` | Nie rozróżniać obu przypadków |
| `baseSnapshotVersion` jest przestarzały | `409` | `SYNC_CONFLICT` | Zwrócić `canonicalInspection` w `data` |
| Inspekcja jest w stanie wymagającym reopen | `409` | `INVALID_STATE` lub równoważny kod domenowy | Nie wolno cicho nadpisywać completed report |
| `part1` po scaleniach nie przechodzi walidacji domenowej | `422` | `VALIDATION_ERROR` | Np. `Electric` + `Manual`, błędny VIN, zły rok |
| `answers` lub `questionNotes` wskazują niepoprawne `questionId` | `422` | `VALIDATION_ERROR` | Dopuszczalne są wyłącznie canonical `q_...` keys |
| `questionNotes` przekracza 500 znaków albo `globalNotes` przekracza 10000 znaków | `422` | `VALIDATION_ERROR` | Walidować finalny wynik po merge, nie tylko request |
| Błąd bazy lub RPC | `500` | `INTERNAL_SERVER_ERROR` | Logować z requestId i userId, bez sekretów |
| Nieoczekiwany wyjątek w handlerze lub serwisie | `500` | `INTERNAL_SERVER_ERROR` | Zwrócić przewidywalną kopertę błędu |

### Strategia mapowania błędów

- `400` powinno pokrywać wyłącznie problemy syntaktyczne lub nieobsługiwany query param,
- `422` powinno pokrywać walidację semantyczną i business-rule violations,
- `409` powinno być używane dla rzeczywistych konfliktów wersji lub stanów wymagających reopen,
- `SYNC_CONFLICT` musi być użyty dla konfliktu wersji, razem z `canonicalInspection`,
- pozostałe błędy infrastrukturalne powinny kończyć się `500`.

### Rejestrowanie błędów

- Nie zapisujemy błędów do osobnej tabeli, ponieważ taki mechanizm nie istnieje w aktualnym modelu bazy.
- Jeżeli w przyszłości pojawi się tabela audytowa, endpoint powinien zapisywać wyłącznie metadane operacji i wynik, bez pełnych payloadów.
- W aktualnym planie błędy trafiają do strukturalnych logów Nitro / platformy hostingowej.

## 7. Wydajność

### Profil kosztu endpointu

Endpoint ma wysoki koszt logiczny, ale powinien mieć tylko jeden kosztowny zapis do bazy:

- jeden odczyt bieżącego rekordu inspekcji,
- jedno obliczenie merged canonical state w pamięci,
- jedna atomowa funkcja SQL przy realnej zmianie,
- brak sekwencyjnych zapisów per subresource.

### Zalecenia optymalizacyjne

- pobierać tylko potrzebne kolumny z `public.inspections`, a nie `select *`,
- używać pure helperów `inspection-snapshot.ts`, `inspection-visibility.ts` i `inspection-note-document.ts` zamiast duplikować logikę w serwisie,
- nie parsować question bank markdown per request; bazować na module-scope artefaktach repo,
- short-circuitować no-op po pełnej kanonikalizacji, aby nie bumpować `snapshotVersion` bez potrzeby,
- stosować jeden advisory lock per `(user_id, inspection_id)` w SQL, aby ograniczyć race condition i TOCTOU,
- limitować wielkość payloadu, bo sync może przenosić większe mapy odpowiedzi i notatek niż pojedyncze endpointy.

### Cache i SSR

- Odpowiedź powinna mieć `Cache-Control: private, no-store`.
- Nie stosować shared CDN cache dla odpowiedzi zależnych od sesji.
- Ewentualne metadane pomocnicze można cachować tylko w zakresie pojedynczego request lifecycle, jeśli to naprawdę potrzebne.

### Sygnały wydajnościowe do obserwacji

- liczba no-op synców,
- liczba konfliktów `SYNC_CONFLICT`,
- liczba prunowanych answer/note IDs,
- czas spędzony w atomowej funkcji SQL,
- rozmiar request body dla reconnect stormów offline.

## 8. Kroki implementacji

1. Rozszerzyć `shared/contracts/inspections.ts` o schema dla sync query, mutation, result i conflict response, tak aby runtime walidacja była dokładniejsza niż obecny transportowy typ w `app/types.ts`.
2. Doprecyzować sync input w `app/types.ts`, jeśli obecny `InspectionSyncMutationDto` nie rozróżnia patch semantics dla `part1` i map odpowiedzi/notatek.
3. Wydzielić lub ponownie wykorzystać pure helpery `inspection-snapshot.ts`, `inspection-visibility.ts` i `inspection-note-document.ts`, aby sync nie duplikował logiki renderowania canonical state.
4. Zaimplementować nowy serwis `server/utils/services/sync-inspection.ts`, który scala patch z bieżącą inspekcją, przelicza derived state i wywołuje jedną atomową funkcję SQL.
5. Dodać migrację SQL z funkcją `private.save_inspection_snapshot(...)` albo równoważnym service-role-only RPC, z advisory lock, recheckiem ownership i conflict detection wewnątrz transakcji.
6. Utworzyć handler `server/api/v1/inspections/[inspectionId]/sync.post.ts` z `assertMutationOrigin`, `getRequiredUserId`, `getValidatedRouterParams`, `getValidatedQuery` i `readBody` + `safeParse`.
7. Zaimplementować mapping błędów na `400`, `401`, `404`, `409`, `422` i `500`, w tym jawne `SYNC_CONFLICT` z `canonicalInspection` dla divergencji wersji.
8. Dodać testy `test/nuxt/inspection-sync-post.test.ts` dla sukcesu, no-op, invalid JSON, invalid query, 401, 404, 409 `SYNC_CONFLICT`, 422 validation errors i one-way note mirroring.
9. Zweryfikować, że sync zwraca dokładnie `SyncedInspectionDto` oraz że `smartPruning` raportuje tylko rzeczywiście usunięte answer/note IDs.
10. Uruchomić testy i sprawdzić, że nowy endpoint nie narusza istniejących kontraktów dla `part-1`, `runtime-flags`, `answers`, `notes`, `finalize` i `reopen`.
