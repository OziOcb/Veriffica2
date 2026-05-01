# Plan Schematu Bazy Danych PostgreSQL - Veriffica MVP

## Założenie bazowe: Supabase Auth

W tym projekcie używamy `Supabase Auth` jako jedynego systemu uwierzytelniania i źródła tożsamości użytkownika.

- `auth.users` jest kanonicznym źródłem danych logowania, tożsamości i cyklu życia konta.
- Tabele aplikacyjne `public.profiles`, `public.user_preferences` i `public.inspections` są podporządkowane modelowi użytkownika z `Supabase Auth` i wiążą się z nim przez `user_id`.
- Nie projektujemy osobnej tabeli użytkowników ani własnego mechanizmu logowania poza `Supabase Auth`.

## 1. Lista tabel z ich kolumnami, typami danych i ograniczeniami

### `public.profiles`

Tabela techniczna 1:1 z `auth.users`. Nie duplikuje e-maila ani danych logowania.

| Kolumna | Typ | Ograniczenia / opis |
| --- | --- | --- |
| `user_id` | `uuid` | `PRIMARY KEY`, `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`; utrzymywane przez trigger `updated_at` tylko przy rzeczywistej zmianie wiersza |

Uwagi implementacyjne:

- Rekord jest tworzony automatycznie po rejestracji użytkownika przez zaufany trigger po stronie bazy.
- Tabela pozostaje read-only dla zwykłego użytkownika aplikacji.

### `public.user_preferences`

Tabela 1:1 z `auth.users` przechowująca tylko ustawienia aplikacyjne współdzielone między urządzeniami.

| Kolumna | Typ | Ograniczenia / opis |
| --- | --- | --- |
| `user_id` | `uuid` | `PRIMARY KEY`, `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `theme` | `text` | `NOT NULL DEFAULT 'system'`; `CHECK (theme IN ('system', 'light', 'dark'))` |
| `font_scale` | `text` | `NOT NULL DEFAULT 'medium'`; `CHECK (font_scale IN ('small', 'medium', 'large'))` |
| `hide_inspection_intro` | `boolean` | `NOT NULL DEFAULT false` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`; utrzymywane przez trigger `updated_at` tylko przy rzeczywistej zmianie wiersza |

Uwagi implementacyjne:

- Rekord jest tworzony automatycznie po rejestracji użytkownika przez ten sam zaufany mechanizm co `profiles`.
- Brak wspieranego `DELETE` z poziomu klienta.
- Aktualizacje mają przechodzić przez zaufaną ścieżkę serwerową lub wąski kontrakt RPC, nie przez ogólny `UPDATE` po tabeli.

### `public.inspections`

Główna tabela domenowa. Łączy relacyjny rdzeń właścicielski z kanonicznym snapshotem JSONB jednej inspekcji.

| Kolumna | Typ | Ograniczenia / opis |
| --- | --- | --- |
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` |
| `user_id` | `uuid` | `NOT NULL`, `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `title` | `text` | `NOT NULL`; `CHECK (char_length(title) BETWEEN 1 AND 120)`; kanoniczna wartość generowana po stronie serwera przez współdzielony builder tytułu |
| `status` | `text` | `NOT NULL DEFAULT 'draft'`; `CHECK (status IN ('draft', 'completed'))` |
| `question_bank_version` | `text` | `NOT NULL`; `CHECK (char_length(question_bank_version) BETWEEN 1 AND 50)`; ustawiane przy tworzeniu inspekcji i potem niemutowalne |
| `snapshot_schema_version` | `text` | `NOT NULL`; `CHECK (char_length(snapshot_schema_version) BETWEEN 1 AND 50)`; ustawiane przy tworzeniu inspekcji i potem niemutowalne |
| `snapshot` | `jsonb` | `NOT NULL`; pełny kanoniczny stan inspekcji; minimalny top-level shape walidowany w DB, pełna semantyka walidowana w zaufanej ścieżce zapisu |
| `snapshot_version` | `bigint` | `NOT NULL DEFAULT 1`; `CHECK (snapshot_version >= 1)` |
| `client_updated_at` | `timestamptz` | `NOT NULL`; czas lokalnego commitu po stronie klienta używany w strategii LWW / Client Wins |
| `make` | `text` | `NULL`; `CHECK (make IS NULL OR char_length(make) BETWEEN 1 AND 50)` |
| `model` | `text` | `NULL`; `CHECK (model IS NULL OR char_length(model) BETWEEN 1 AND 60)` |
| `year_of_production` | `integer` | `NULL`; 4 cyfry; zakres `1886..current UTC year + 1`; dynamiczny górny limit egzekwowany w zaufanej ścieżce zapisu lub triggerze walidującym |
| `registration_number` | `text` | `NULL`; wartość znormalizowana do uppercase; `CHECK (registration_number IS NULL OR (char_length(registration_number) BETWEEN 2 AND 15 AND registration_number ~ '^[A-Z0-9 -]+$'))` |
| `vin_number` | `text` | `NULL`; `CHECK (vin_number IS NULL OR vin_number ~ '^[A-HJ-NPR-Z0-9]{17}$')` |
| `fuel_type` | `text` | `NULL`; `CHECK (fuel_type IS NULL OR fuel_type IN ('Petrol', 'Diesel', 'Hybrid', 'Electric'))` |
| `transmission` | `text` | `NULL`; `CHECK (transmission IS NULL OR transmission IN ('Manual', 'Automatic'))` |
| `drive` | `text` | `NULL`; `CHECK (drive IS NULL OR drive IN ('2WD', '4WD'))` |
| `body_type` | `text` | `NULL`; `CHECK (body_type IS NULL OR body_type IN ('Sedan', 'Hatchback', 'SUV', 'Coupe', 'Convertible', 'Van', 'Pickup', 'Other'))` |
| `price` | `numeric(10,2)` | `NULL`; `CHECK (price IS NULL OR (price >= 0 AND price <= 10000000.00))` |
| `mileage` | `integer` | `NULL`; `CHECK (mileage IS NULL OR (mileage >= 0 AND mileage <= 9999999))` |
| `color` | `text` | `NULL`; `CHECK (color IS NULL OR char_length(color) BETWEEN 1 AND 40)` |
| `number_of_doors` | `smallint` | `NULL`; `CHECK (number_of_doors IS NULL OR number_of_doors BETWEEN 1 AND 9)` |
| `address` | `text` | `NULL`; `CHECK (address IS NULL OR char_length(address) BETWEEN 5 AND 150)` |
| `completed_at` | `timestamptz` | `NULL`; ustawiane wyłącznie przy świadomej finalizacji inspekcji |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`; zmienia się tylko przy zaakceptowanej, rzeczywistej zmianie stanu |

Tabela `public.inspections` powinna mieć dodatkowo następujące ograniczenia tabelowe:

- `CHECK ((status = 'draft' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL))`
- `CHECK (fuel_type IS DISTINCT FROM 'Electric' OR transmission IS NULL OR transmission = 'Automatic')`
- `CHECK (jsonb_typeof(snapshot) = 'object')`
- `CHECK (snapshot ? 'part_1' AND snapshot ? 'runtime_flags' AND snapshot ? 'answers' AND snapshot ? 'question_notes' AND snapshot ? 'global_notes' AND snapshot ? 'visible_group_ids' AND snapshot ? 'visible_question_ids')`
- `CHECK (jsonb_typeof(snapshot->'part_1') IN ('object', 'null'))`
- `CHECK (jsonb_typeof(snapshot->'runtime_flags') = 'object')`
- `CHECK (jsonb_typeof(snapshot->'answers') = 'object')`
- `CHECK (jsonb_typeof(snapshot->'question_notes') = 'object')`
- `CHECK (jsonb_typeof(snapshot->'global_notes') = 'string')`
- `CHECK (jsonb_typeof(snapshot->'visible_group_ids') = 'array')`
- `CHECK (jsonb_typeof(snapshot->'visible_question_ids') = 'array')`

### Oczekiwany kształt `public.inspections.snapshot`

| Klucz JSON | Typ | Reguła domenowa |
| --- | --- | --- |
| `part_1` | `object` lub `null` | Kanoniczna, znormalizowana reprezentacja Part 1; zawiera także pole `notes`; to jest jedyne źródło prawdy dla pełnego payloadu Part 1 |
| `runtime_flags` | `object` | Dokładnie 5 znanych kluczy boolean: `chargingPortEquipped`, `evBatteryDocsAvailable`, `turboEquipped`, `mechanicalCompressorEquipped`, `importedFromEU`; brakujące klucze normalizowane do `false`, dodatkowe odrzucane |
| `answers` | `object` | Mapa `question_id -> 'yes' | 'no' | 'dont_know'`; akceptowane tylko dla pytań należących do przypiętej wersji question banku i aktualnego `visible_question_ids` |
| `question_notes` | `object` | Mapa `question_id -> string`; maksymalnie 500 znaków na wpis; usunięcie notatki usuwa klucz z obiektu |
| `global_notes` | `string` | Jeden wspólny dokument notatek dla całej sesji; maksymalnie 10000 znaków |
| `visible_group_ids` | `array<string>` | Uporządkowana, kanonicznie wyliczana po stronie serwera lista grup widocznych dla danej inspekcji |
| `visible_question_ids` | `array<string>` | Uporządkowana, kanonicznie wyliczana po stronie serwera lista pytań widocznych dla danej inspekcji |

Minimalny pusty snapshot startowy rekomendowany przy tworzeniu inspekcji:

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

## 2. Relacje między tabelami

- `auth.users (1) -> (1) public.profiles`
- `auth.users (1) -> (1) public.user_preferences`
- `auth.users (1) -> (N) public.inspections`
- Nie występują relacje wiele-do-wielu i nie są potrzebne żadne tabele łączące.
- `ON DELETE CASCADE` z `auth.users` usuwa rekordy `profiles`, `user_preferences` i `inspections`, co wspiera hard delete konta.
- `public.inspections` celowo łączy normalizację właścicielską z kontrolowaną denormalizacją: kolumny projekcyjne są pochodną `snapshot.part_1`, a nie drugim źródłem prawdy.

## 3. Indeksy

### Klucze główne

- `profiles_pkey` na `public.profiles(user_id)`
- `user_preferences_pkey` na `public.user_preferences(user_id)`
- `inspections_pkey` na `public.inspections(id)`

### Indeksy wtórne

- `inspections_user_updated_idx` na `public.inspections(user_id, updated_at DESC)`
  Uzasadnienie: wspiera RLS-owner filter oraz dashboard sortowany po `updated_at DESC`.

- `inspections_user_status_idx` na `public.inspections(user_id, status)`
  Uzasadnienie: wspiera filtrowanie po właścicielu i statusie (`Draft`, `Completed`).

### Świadome decyzje o braku indeksów

- Brak osobnego indeksu tylko po `updated_at`.
- Brak indeksu GIN na `snapshot` w MVP.
- Brak unikalności na `vin_number`, `registration_number` lub kombinacjach pól pojazdu.
- Brak partycjonowania i brak tabel historii zmian lub event sourcingu.

## 4. Zasady PostgreSQL

### RLS

RLS ma być włączone na wszystkich tabelach w `public` przechowujących prywatne dane aplikacyjne:

- `ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY`
- `ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY`
- `ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY`

### Polityki dla `public.profiles`

- `profiles_select_own`
  `FOR SELECT TO authenticated`
  `USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)`

- `profiles_insert_denied`
  `FOR INSERT TO authenticated`
  `WITH CHECK (false)`

- `profiles_update_denied`
  `FOR UPDATE TO authenticated`
  `USING (false) WITH CHECK (false)`

- `profiles_delete_denied`
  `FOR DELETE TO authenticated`
  `USING (false)`

### Polityki dla `public.user_preferences`

- `user_preferences_select_own`
  `FOR SELECT TO authenticated`
  `USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)`

- `user_preferences_insert_denied`
  `FOR INSERT TO authenticated`
  `WITH CHECK (false)`

- `user_preferences_update_denied`
  `FOR UPDATE TO authenticated`
  `USING (false) WITH CHECK (false)`

- `user_preferences_delete_denied`
  `FOR DELETE TO authenticated`
  `USING (false)`

### Polityki dla `public.inspections`

- `inspections_select_own`
  `FOR SELECT TO authenticated`
  `USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)`

- `inspections_insert_denied`
  `FOR INSERT TO authenticated`
  `WITH CHECK (false)`

- `inspections_update_denied`
  `FOR UPDATE TO authenticated`
  `USING (false) WITH CHECK (false)`

- `inspections_delete_denied`
  `FOR DELETE TO authenticated`
  `USING (false)`

### Zasady write-path

- Bezpośredni `INSERT/UPDATE/DELETE` z przeglądarki do `public.inspections` nie jest wspierany.
- Bezpośredni `INSERT/UPDATE/DELETE` z przeglądarki do `public.user_preferences` nie jest wspierany.
- Wszystkie mutacje biznesowe mają przechodzić przez zaufaną ścieżkę serwerową w Nitro oraz, tam gdzie to uzasadnione, przez wąskie funkcje SQL lub transakcje po stronie bazy.
- Reguła limitu maksymalnie 2 inspekcji na konto musi być egzekwowana atomowo po stronie serwera lub prywatnej funkcji SQL, nigdy tylko po stronie klienta.
- Operacje usunięcia inspekcji, finalizacji raportu, powrotu do edycji i usunięcia konta muszą być wykonywane wyłącznie przez zaufany flow serwerowy.

## 5. Wszelkie dodatkowe uwagi lub wyjaśnienia dotyczące decyzji projektowych

- Schemat jest znormalizowany do relacyjnego rdzenia 1:1 i 1:N; jedyną świadomą denormalizacją jest projekcja pól z `snapshot.part_1` do `public.inspections`, uzasadniona dashboardem, RLS-owner filtering, sortowaniem i regułami biznesowymi.
- Pytania, grupy pytań, wyjaśnienia i instrukcja startowa nie są przechowywane w bazie. Źródłem prawdy pozostaje repozytorium, a baza trzyma wyłącznie stan konkretnej inspekcji oraz identyfikatory wersji potrzebne do historycznej interpretacji.
- `question_bank_version` i `snapshot_schema_version` powinny być ustawiane tylko podczas tworzenia nowej inspekcji i pozostawać niemutowalne w dalszym cyklu życia rekordu.
- `title` nie jest zaufanym wejściem z klienta. Wartość musi być liczona po stronie serwera na podstawie znormalizowanego `snapshot.part_1`, z fallbackiem dla pustej inspekcji.
- `updated_at` musi być utrzymywane przez wspólny trigger `BEFORE UPDATE`, który aktualizuje kolumnę wyłącznie wtedy, gdy `NEW IS DISTINCT FROM OLD`.
- `snapshot_version` i `updated_at` nie mogą się zmieniać przy zapisie no-op, czyli gdy kanoniczny stan rekordu nie ulega zmianie.
- Serwer przy każdym zaakceptowanym zapisie ma obowiązek ponownie wyliczyć `visible_group_ids` i `visible_question_ids`, a następnie przyciąć lub odrzucić `answers` oraz `question_notes` poza kanonicznym zbiorem pytań widocznych.
- Konflikt synchronizacji nie może kończyć się cichym ignorowaniem payloadu. Zaufana ścieżka zapisu musi zwrócić jawny conflict response zawierający aktualny rekord kanoniczny.
- Rekordy `profiles` i `user_preferences` powinny być auto-provisionowane przez trigger `AFTER INSERT ON auth.users` uruchamiający prywatną funkcję w osobnym, nieeksponowanym schemacie, na przykład `private.handle_new_auth_user()`.
- Rekomendowane jest utworzenie prywatnego schematu pomocniczego, na przykład `private`, dla funkcji i triggerów niewystawianych przez API, w szczególności:
  - `private.touch_updated_at()`
  - `private.handle_new_auth_user()`
  - `private.create_inspection(...)`
  - `private.save_inspection_snapshot(...)`
  - `private.finalize_inspection(...)`
  - `private.reopen_inspection(...)`
  - `private.delete_inspection(...)`
- Usunięcie konta powinno docelowo usuwać rekord z `auth.users` przez zaufany serwerowy flow administracyjny; kaskady FK usuną wtedy dane w `public`.