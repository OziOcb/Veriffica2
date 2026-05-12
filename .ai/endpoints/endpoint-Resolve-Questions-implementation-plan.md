# API Endpoint Implementation Plan: GET /api/v1/inspections/{inspectionId}/parts/{partId}/questions

## 1. Przegląd punktu końcowego

Endpoint `GET /api/v1/inspections/{inspectionId}/parts/{partId}/questions` zwraca kanoniczne karty pytań dla Parts 2-5 po wyliczeniu widoczności na podstawie Part 1 oraz runtime flags zapisanych w snapshotcie inspekcji. To endpoint wyłącznie do odczytu, przeznaczony do ekranu sesji, który łączy dane z repozytorium question banku z kanonicznym stanem konkretnej inspekcji.

Zakres odpowiedzialności endpointu:

- potwierdzenie aktywnej sesji Supabase utrzymywanej w cookie SSR,
- walidacja `inspectionId`, `partId` i opcjonalnego `include`,
- pobranie kanonicznego snapshotu inspekcji należącej do bieżącego użytkownika,
- odrzucenie inspekcji bez poprawnego Part 1 jako stanu niegotowego do rozwiązywania pytań,
- wyliczenie widocznych grup i pytań z wykorzystaniem wspólnego resolvera visibility,
- złożenie odpowiedzi z katalogu pytań, odpowiedzi i notatek z opcjonalnymi ekspansjami,
- zwrócenie standardowej koperty sukcesu bez żadnej mutacji stanu.

Docelowe lokalizacje implementacji:

| Rola | Ścieżka |
|---|---|
| Handler HTTP | `server/api/v1/inspections/[inspectionId]/parts/[partId]/questions.get.ts` |
| Serwis domenowy | `server/utils/services/get-inspection-part-questions.ts` |
| Wspólny helper snapshotu | `server/utils/services/inspection-snapshot.ts` albo równoważny wspólny moduł |
| Wspólny resolver widoczności | `server/utils/services/inspection-visibility.ts` |
| Katalog pytań | rozszerzenie `server/utils/question-bank.ts` albo wydzielony adapter katalogu |
| Kontrakty Zod | `shared/contracts/inspections.ts` |

Najważniejsza decyzja architektoniczna: nie parsować question banku per request i nie opierać się na niezwalidowanym wejściu klienta. Katalog pytań powinien być przygotowany jako build-time / module-scope artefakt, a serwis ma jedynie scalić go z kanonicznym snapshotem inspekcji.

## 2. Szczegóły żądania

- Metoda HTTP: `GET`
- URL: `/api/v1/inspections/{inspectionId}/parts/{partId}/questions`
- Auth: wymagana aktywna sesja Supabase SSR
- Request body: brak

### Parametry path

| Parametr | Wymagany | Typ / zakres | Uwagi |
|---|---|---|---|
| `inspectionId` | tak | UUID | Identyfikuje inspekcję należącą do bieżącego użytkownika |
| `partId` | tak | `part2` \| `part3` \| `part4` \| `part5` | Endpoint nie obsługuje `part1` |

### Parametry query

| Parametr | Wymagany | Typ / zakres | Uwagi |
|---|---|---|---|
| `include` | nie | comma-separated `explanations`, `answers`, `notes` | Steruje opcjonalnymi ekspansjami odpowiedzi |

Rekomendowana semantyka `include`:

- `include=explanations` dodaje słownik wyjaśnień dla referencji użytych przez widoczne pytania,
- `include=answers` dodaje pole `answer` w kartach pytań,
- `include=notes` dodaje pole `questionNote` w kartach pytań,
- brak `include` oznacza minimalny payload strukturalny,
- nieznane wartości w `include` powinny kończyć się `400 Bad Request`.

### Wymagane typy DTO i modele

Istniejące typy z `app/types.ts`, które pasują do tego endpointu:

- `InspectionPartRouteParams`,
- `GetInspectionPartQuestionsQuery`,
- `ResolvedQuestionGroupDto`,
- `ResolvedQuestionDto`,
- `QuestionExplanationDto`,
- `QuestionExplanationDictionaryDto`,
- `GetInspectionPartQuestionsResultDto`,
- `GetInspectionPartQuestionsResponseDto`,
- `ApiMetaDto`,
- `ApiSuccessResponseDto<TData>`.

Model command nie jest potrzebny, ponieważ endpoint jest tylko do odczytu.

### Wymagane kontrakty runtime w Zod

W `shared/contracts/inspections.ts` warto dodać lub uzupełnić:

- `InspectionPartRouteParamsSchema` albo równoważny schema object dla `inspectionId` + `partId`,
- `QuestionExpansionSchema` z wartościami `explanations`, `answers`, `notes`,
- `GetInspectionPartQuestionsQuerySchema` z parsowaniem `include` z CSV do tablicy,
- `ResolvedQuestionGroupSchema`,
- `ResolvedQuestionSchema`,
- `QuestionExplanationSchema`,
- `QuestionExplanationDictionarySchema`,
- `GetInspectionPartQuestionsResultSchema`,
- `GetInspectionPartQuestionsResponseSchema`.

Typy TypeScript powinny być wyprowadzone z tych schematów przez `z.infer`, a nie utrzymywane ręcznie obok nich.

### Walidacja wejścia

Walidacja na granicy handlera powinna obejmować:

- `inspectionId` jako UUID,
- `partId` jako jeden z `part2`-`part5`,
- `include` jako opcjonalną listę tylko z dozwolonych ekspansji,
- brak request body,
- brak jakichkolwiek nieznanych pól w query/route modelu.

Jeżeli `inspectionId` lub `include` są syntaktycznie niepoprawne, handler może zakończyć się `400 Bad Request`. Jeżeli `partId` jest spoza dozwolonego zakresu lub Part 1 nie jest jeszcze gotowy do rozwiązywania pytań, odpowiedzią powinno być `422 Unprocessable Entity` zgodnie ze specyfikacją endpointu.

## 3. Szczegóły odpowiedzi

### Sukces: `200 OK`

Odpowiedź powinna mieć standardową kopertę sukcesu:

```json
{
  "data": {
    "inspectionId": "uuid",
    "part": "part2",
    "questionBankVersion": "2026-05-01",
    "groups": [
      {
        "id": "base_body",
        "order": 10,
        "title": "Body",
        "questionIds": ["q_p2_body_panel_gaps"]
      }
    ],
    "questions": [
      {
        "id": "q_p2_body_panel_gaps",
        "groupId": "base_body",
        "order": 10,
        "text": "Do the body panel gaps look even?",
        "allowedAnswers": ["yes", "no", "dont_know"],
        "explanationRef": "exp_body_panel_gaps",
        "answer": "yes",
        "questionNote": "Looks consistent."
      }
    ],
    "explanations": {
      "exp_body_panel_gaps": {
        "title": "Why panel gaps matter",
        "content": "Uneven gaps can suggest prior body repair."
      }
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:55:00Z"
  }
}
```

Zasady mapowania odpowiedzi:

- `questionBankVersion` powinno pochodzić z kanonicznego rekordu inspekcji i być użyte do wyboru właściwego katalogu pytań,
- `groups` i `questions` muszą być posortowane kanonicznie według `order`, a nie według kolejności wpisania do odpowiedzi,
- `groups` zawiera wyłącznie widoczne grupy, a `questionIds` zawiera wyłącznie widoczne pytania,
- `questions` zawiera tylko pytania widoczne dla danego Part i nie powinno zwracać ukrytych kart jako placeholderów,
- pole `answer` pojawia się tylko, gdy klient poprosił o `include=answers`,
- pole `questionNote` pojawia się tylko, gdy klient poprosił o `include=notes`,
- `explanations` pojawia się tylko, gdy klient poprosił o `include=explanations`, a słownik powinien zawierać tylko referencje użyte przez widoczne pytania.

### Kody odpowiedzi

- `200 OK` — poprawny odczyt,
- `400 Bad Request` — niepoprawne dane syntaktyczne w route/query,
- `401 Unauthorized` — brak ważnej sesji Supabase,
- `404 Not Found` — inspekcja nie istnieje albo nie należy do bieżącego użytkownika,
- `422 Unprocessable Entity` — niepoprawny `partId` albo Part 1 nie jest jeszcze gotowy do wyliczenia pytań,
- `500 Internal Server Error` — błąd bazy, katalogu pytań albo nieoczekiwany wyjątek mapowania.

## 4. Przepływ danych

### Logika wykonania

1. Żądanie trafia do `server/api/v1/inspections/[inspectionId]/parts/[partId]/questions.get.ts`.
2. Handler pobiera `requestId` i runtime config przez `useRuntimeConfig(event)`.
3. Handler ustala zalogowanego użytkownika przez helper auth, np. `getRequiredUserId(event)`.
4. Handler waliduje route params i query przez kontrakty Zod.
5. Handler wywołuje serwis `getInspectionPartQuestions(event, userId, inspectionId, partId, include, requestId)`.
6. Serwis pobiera z `public.inspections` tylko minimalny zestaw kolumn potrzebny do odczytu kanonicznego snapshotu, zawsze z jawnym filtrem `id = inspectionId` i `user_id = userId`.
7. Jeżeli rekord nie istnieje albo nie należy do użytkownika, serwis zwraca `404 Not Found` bez rozróżniania tych dwóch przypadków.
8. Serwis odtwarza canonical Part 1 i runtime flags z inspekcji, najlepiej przez wspólny helper snapshotu lub istniejące fragmenty logiki z `get-inspection-detail.ts`.
9. Jeżeli Part 1 jest niekompletny lub niepoprawny, serwis kończy się `422 Unprocessable Entity`, ponieważ nie da się poprawnie wyliczyć widoczności pytań.
10. Serwis wywołuje wspólny pure helper visibility, np. `resolveVisibility(part1, runtimeFlags)`, aby otrzymać widoczne grupy i pytania.
11. Serwis pobiera kanoniczny katalog pytań z in-memory / build-time adaptera question banku.
12. Serwis filtruje katalog do wskazanego `partId`, widocznych grup i widocznych pytań, zachowując oryginalny order z banku.
13. Jeżeli klient poprosił o ekspansje, serwis dołącza odpowiednio `answer`, `questionNote` i `explanations`.
14. Handler zwraca `200 OK` z `ApiSuccessResponseDto<GetInspectionPartQuestionsResultDto>`.

### Podział odpowiedzialności

Handler HTTP powinien:

- obsługiwać autoryzację i walidację granicy,
- nie zawierać logiki budowania karty pytań,
- nie parsować question banku,
- jedynie mapować błędy na statusy HTTP i budować kopertę odpowiedzi.

Serwis `get-inspection-part-questions.ts` powinien:

- pobierać rekord inspekcji przez `serverSupabaseServiceRole(event)` z jawnym filtrem właściciela,
- odtwarzać canonical Part 1 i runtime flags,
- reuse'ować wspólny resolver visibility,
- scalać snapshot z katalogiem pytań i opcjonalnymi ekspansjami,
- ukrywać szczegóły źródeł danych przed handlerem.

Wspólny katalog pytań powinien:

- zostać załadowany raz na proces Nitro,
- zawierać grupy, pytania, allowed answers, explanation refs oraz tekst pytań,
- nie wymagać parsowania markdown per request,
- korzystać z artefaktów `.ai/veriffica-questions-list` jako źródła prawdy dla build-time danych.

### Źródła danych

- `public.inspections.snapshot` jest źródłem prawdy dla Part 1, runtime flags, answers i notes,
- `.ai/veriffica-questions-list/question-mapping-config.json` dostarcza mapowania widoczności grup,
- `.ai/veriffica-questions-list/question-bank.json` dostarcza identyfikatory pytań, order, allowed answers i explanation refs,
- `.ai/veriffica-questions-list/list-of-questions.md` jest źródłem tekstu pytań i powinien zostać znormalizowany do stabilnego artefaktu build-time lub importu pomocniczego,
- `questionBankVersion` w inspekcji służy do spójnego wyboru odpowiedniego katalogu.

## 5. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

- Endpoint musi działać wyłącznie dla zalogowanego użytkownika ustalonego po stronie serwera.
- Nie wolno przyjmować żadnych identyfikatorów właściciela od klienta.
- Ponieważ `public.inspections` ma wyłączone RLS, każdy odczyt musi zawierać jawny filtr `id + user_id`; nie wolno polegać na samej sesji ani samym `inspectionId`.
- Serwis powinien zwracać `404` dla obcych inspekcji zamiast ujawniać, że dany rekord istnieje.

### Granice zaufania

- Katalog pytań jest artefaktem repo i należy go traktować jako trusted build input, ale nadal trzeba walidować wejście HTTP.
- Odpowiedź powinna zawierać tylko kanoniczne pola kontraktu, bez surowego snapshotu, bez dodatkowych kolumn bazy i bez detali infrastruktury.
- Nie należy zwracać danych, które mogłyby ujawnić hidden bank entries poza bieżącym `partId` i widocznością wynikającą z Part 1.

### Cache i prywatność

- Odpowiedź nie powinna być publicznie cache'owana.
- Zalecane jest ustawienie `Cache-Control: private, no-store` albo równoważnego nagłówka dla prywatnego response.
- Nie używać shared cache CDN dla odpowiedzi zależnych od sesji.

### Logowanie bezpieczeństwa

- Logi powinny zawierać tylko kontekst diagnostyczny: `requestId`, `userId`, `inspectionId`, `partId`, typ błędu i ewentualnie `include`.
- Nie logować cookie, tokenów, pełnego snapshotu, pełnego payloadu question banku ani całych odpowiedzi z Supabase.

## 6. Obsługa błędów

### Scenariusze błędów i statusy

| Scenariusz | Status | Uwagi |
|---|---|---|
| Brak aktywnej sesji | `401` | Zwrócić przewidywalny błąd auth bez szczegółów technicznych |
| `inspectionId` nie jest poprawnym UUID lub query nie daje się zinterpretować | `400` | Błąd syntaktyczny granicy wejścia |
| `partId` jest spoza `part2`-`part5` | `422` | Niepoprawny zasób domenowy dla tego endpointu |
| `include` zawiera nieznaną ekspansję | `400` | Preferowane spójne mapowanie przez schema validation; ważne, aby błąd był kontrolowany i jawny |
| Inspekcja nie istnieje albo należy do innego użytkownika | `404` | Nie rozróżniać obu przypadków |
| Part 1 nie jest jeszcze poprawnie uzupełniony | `422` | Wymagany warunek domenowy do wyliczenia pytań |
| Błąd zapytania do bazy | `500` | Logować z kontekstem requestId i inspectionId |
| Błąd ładowania / mapowania katalogu pytań | `500` | Dotyczy brakującego lub niespójnego artefaktu build-time |
| Nieoczekiwany wyjątek w mapperze | `500` | Zwrócić przewidywalną kopertę błędu |

### Strategia obsługi błędów

- Używać `createError` dla błędów oczekiwanych.
- Walidację wejścia robić przez `safeParse`/`readValidated...` i mapować na statusy 400/422 bez wypuszczania surowego `ZodError` do klienta.
- Nie próbować zapisywać błędów do osobnej tabeli błędów, ponieważ bieżący model bazy nie definiuje takiej tabeli ani audytowego write path dla tego endpointu.
- Jeżeli w przyszłości pojawi się centralny system audytu, zapisywać jedynie metadane operacji, nie payload ani dane prywatne.

### Minimalny zakres logowania

Logować:

- `requestId`,
- nazwę endpointu,
- `userId`,
- `inspectionId`,
- `partId`,
- rodzaj błędu (`auth`, `validation`, `ownership`, `part-state`, `catalog`, `unexpected`).

Nie logować:

- tokenów, cookie i surowych nagłówków auth,
- pełnego obiektu użytkownika z Supabase,
- pełnego snapshotu inspekcji,
- pełnego katalogu pytań.

## 7. Wydajność

### Profil kosztu endpointu

To bardzo lekki endpoint odczytowy:

- jedno zapytanie do `public.inspections`,
- jedna in-memory analiza snapshotu,
- jedno wyliczenie visibility,
- jedno złożenie odpowiedzi z prekompilowanego katalogu pytań.

### Zalecenia optymalizacyjne

- pobierać z bazy tylko kolumny potrzebne do odtworzenia snapshotu i ownership check,
- nie parsować markdown per request; tekst pytań powinien być prekompilowany do stabilnego artefaktu,
- utrzymywać katalog pytań i mapy `questionId -> metadata` w module scope,
- budować słownik `explanations` tylko wtedy, gdy klient o niego poprosił,
- nie wykonywać dodatkowych odczytów `profiles`, `user_preferences` ani innych tabel, bo endpoint nie potrzebuje ich do odpowiedzi.

### Cache i lokalne precomputy

- `QUESTION_GROUPS`, `QUESTIONS` i mapy lookup powinny być ładowane raz na proces,
- jeżeli repo wprowadzi wiele wersji question banku, lookup powinien być cache'owany po `questionBankVersion`,
- jeśli question text nadal pochodzi z markdown, należy go przekształcić do generowanego JSON/TS artefaktu na etapie builda, a nie w runtime.

## 8. Kroki implementacji

1. Rozszerzyć `shared/contracts/inspections.ts` o schematy route params, query `include`, odpowiedź oraz pomocnicze schematy resolved questions i explanations.
2. Upewnić się, że `GetInspectionPartQuestionsQuery` i powiązane DTO w `app/types.ts` pozostają zgodne z nowym kontraktem runtime albo są bezpośrednio od niego pochodne.
3. Rozszerzyć istniejący katalog question banku w `server/utils/question-bank.ts` albo wyodrębnić z niego adapter, który udostępni grupy, pytania, allowed answers, explanation refs i tekst pytań jako prekompilowany lookup.
4. Wyodrębnić lub współdzielić logikę canonical snapshot parsing z `server/utils/services/get-inspection-detail.ts`, aby nowy serwis nie dublował dekodowania snapshotu i Part 1.
5. Zaimplementować `server/utils/services/get-inspection-part-questions.ts` z jawnym filtrem `id + user_id`, reuse'm `resolveVisibility` i warunkowym dodawaniem `answers`, `notes` oraz `explanations`.
6. Dodać handler `server/api/v1/inspections/[inspectionId]/parts/[partId]/questions.get.ts`, który obsłuży auth, walidację wejścia i mapowanie błędów na `400` / `401` / `404` / `422` / `500`.
7. Dodać testy dla sukcesu bez ekspansji oraz z każdą ekspansją, a także dla `401`, `404` i `422` przy niegotowym Part 1 lub niepoprawnym `partId`.
8. Zweryfikować, że odpowiedź nie zwraca ukrytych pytań, surowego snapshotu ani pełnego katalogu pytań, a wszystkie listy są deterministycznie posortowane.