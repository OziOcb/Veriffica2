{{conversation_summary}}
{{decisions}}
1. Źródłem tożsamości użytkownika będzie Supabase Auth, dokładniej auth.users, bez własnej tabeli haseł i bez duplikowania e-maila poza warstwą auth.
2. Model danych MVP ma opierać się na trzech głównych tabelach aplikacyjnych: profiles, user_preferences i inspections, powiązanych z auth.users.
3. Rekordy profiles i user_preferences mają być tworzone automatycznie po rejestracji użytkownika przez zaufany mechanizm serwerowy, a nie przez bezpośredni insert z klienta.
4. Tabela profiles ma pozostać minimalna i w MVP zawierać wyłącznie user_id, created_at i updated_at.
5. Tabela user_preferences ma być tabelą 1:1 z użytkownikiem, z user_id jako kluczem głównym, i przechowywać tylko theme, font_scale, hide_inspection_intro, created_at i updated_at.
6. Ustawienie theme ma przyjmować tylko wartości system, light, dark, a font_scale tylko small, medium, large.
7. Główną encją domenową ma być tabela inspections z relacyjną projekcją i snapshotem JSONB, bez osobnych tabel inspection_answers, inspection_notes i inspection_events.
8. Wszystkie klucze główne mają używać UUID, a profiles, user_preferences i inspections mają mieć klucze obce do auth.users(id) z kasowaniem kaskadowym.
9. snapshot.part_1 ma być kanoniczną, utrwalaną reprezentacją Part 1 dla pojedynczej inspekcji, a relacyjne kolumny inspections mają być wyłącznie serwerowo utrzymywaną projekcją znormalizowanego snapshot.part_1 do potrzeb dashboardu, filtrów i reguł biznesowych.
10. Tabela inspections ma przechowywać projekcyjne pola potrzebne do dashboardu i reguł biznesowych: title, status, make, model, year_of_production, registration_number, vin_number, fuel_type, transmission, drive, body_type, price, mileage, color, number_of_doors, address oraz wersje question_bank_version i snapshot_schema_version.
11. Tytuł inspekcji ma być przechowywany w bazie jako wartość kanoniczna generowana po stronie serwera w tej samej transakcji z znormalizowanych danych snapshot.part_1; ma mieć limit długości. Ten sam deterministyczny builder tytułu ma istnieć także w kodzie współdzielonym klient-serwer dla UX offline i optimistic UI, ale wartość policzona po stronie klienta nigdy nie jest zaufanym wejściem do bazy.
12. Status biznesowy inspekcji ma mieć tylko dwa stany: draft i completed. Przejście do completed może nastąpić wyłącznie przez jawną akcję finalizacji, a powrót do draft wyłącznie przez jawną, potwierdzoną akcję wejścia ponownie w edycję.
13. Ukończenie inspekcji ma ustawiać completed_at, a powrót do edycji ma zmieniać status z powrotem na draft i czyścić completed_at bez tworzenia nowego rekordu.
14. Pytania, grupy pytań, wyjaśnienia i instrukcja startowa nie mają być przechowywane w bazie; źródłem prawdy pozostaje repozytorium, a baza przechowuje tylko stan konkretnej inspekcji oraz identyfikatory wersji artefaktów użytych do jej interpretacji.
15. Wersja question banku ma być zapisywana per inspekcja jako niemutowalny, nieprzezroczysty identyfikator, na przykład mvp-v1, który musi mapować do niezmiennego i dostępnego w runtime artefaktu question banku zarówno po stronie klienta, jak i serwera.
16. snapshot_schema_version ma być zapisywana per inspekcja i wersjonowana niezależnie od question_bank_version.
17. Snapshot JSONB ma mieć jawny i stabilny układ: part_1, runtime_flags, answers, question_notes, global_notes, visible_group_ids oraz visible_question_ids.
18. part_1 ma zawierać pełny, znormalizowany payload Part 1, łącznie z polem notes. Każdy zaakceptowany zapis ma przechodzić przez wspólny kontrakt walidacji i normalizacji używany przez klienta i serwer, przy czym walidacja po stronie klienta jest wyłącznie warstwą UX, a serwer zawsze waliduje ponownie.
19. Runtime flags mają być osobnym obiektem boolean o dokładnie pięciu znanych kluczach z PRD; brakujące klucze mają być normalizowane do false, a dodatkowe klucze mają być odrzucane.
20. Odpowiedzi mają być przechowywane jako obiekt mapowany po question_id, z wartościami tylko yes, no i dont_know. Serwer może zaakceptować wyłącznie question_id należące do przypiętej wersji question banku i do aktualnie kanonicznego zbioru visible_question_ids dla tej inspekcji.
21. question_notes mają być przechowywane jako obiekt mapowany po question_id, z limitem 500 znaków na wpis; usunięcie notatki ma usuwać wpis z obiektu zamiast zostawiać pustą wartość.
22. global_notes ma być jednym, samodzielnym, edytowalnym dokumentem tekstowym z limitem 10000 znaków i nie może być modelowany jako mapa po question_id.
23. Zapis notatki kontekstowej z karty pytania ma być skoordynowaną mutacją warstwy aplikacyjnej i serwerowej: aktualizuje question_notes oraz aktualizuje global_notes jako zwykły dokument tekstowy tak, aby spełnić wymaganie UX dopisania notatki do wspólnego dokumentu. Baza nie może próbować dwukierunkowo parsować semantyki między global_notes i question_notes; ręczna edycja global_notes nie propaguje się z powrotem do question_notes.
24. visible_group_ids i visible_question_ids mają być przechowywane jako uporządkowane listy stringów wyliczane kanonicznie po stronie serwera z przypiętej wersji question banku, znormalizowanego part_1 i runtime_flags, aby raport dało się odtworzyć historycznie bez odwołania do bieżącej wersji checklisty.
25. Serwer musi przy każdym zaakceptowanym zapisie ponownie wyliczyć visibility i odrzucić albo przyciąć answers oraz question_notes, które odwołują się do pytań spoza kanonicznego zbioru visible_question_ids dla danej inspekcji.
26. Model synchronizacji ma używać snapshot_version, client_updated_at i serwerowego updated_at; nie będzie osobnej kolumny server_updated_at ani last_synced_at.
27. snapshot_version ma startować od 1 i rosnąć przy każdym zaakceptowanym rzeczywistym zapisie. client_updated_at ma reprezentować czas lokalnego commitu snapshotu po stronie klienta i brać udział w strategii Last Write Wins / Client Wins. updated_at ma reprezentować wyłącznie czas zaakceptowanego zapisu po stronie serwera.
28. updated_at i snapshot_version nie mogą zmieniać się przy zapisie, który nie zmienia kanonicznego stanu inspekcji.
29. W razie konfliktu synchronizacji serwer nigdy nie może po cichu ignorować zapisu. Przyjmuje on pełny snapshot tylko wtedy, gdy przychodzący zapis jest zwycięzcą według ustalonej strategii Last Write Wins / Client Wins opartej o snapshot_version i client_updated_at; w przeciwnym razie zwraca jawny błąd konfliktu wraz z aktualnym rekordem kanonicznym.
30. Kontrakt sync API ma opierać się na pełnym zapisie snapshotu per inspection, a nie na bezpośrednich częściowych mutacjach kolumn tabeli inspections, aby projekcja relacyjna, visibility i pruning były deterministyczne.
31. Postęp i rozkład odpowiedzi nie mają być przechowywane jako osobne kolumny; mają być wyliczane ze snapshotu i kanonicznego visible set.
32. Limit maksymalnie 2 inspekcji na konto ma obejmować wszystkie statusy i ma być egzekwowany atomowo w zaufanej ścieżce zapisu po stronie serwera, najlepiej przez prywatną funkcję SQL lub transakcję wywoływaną z Nitro, a nie przez bezpośredni insert klienta.
33. Usunięcie inspekcji ma być hard delete i ma przechodzić wyłącznie przez potwierdzony, bezpieczny flow serwerowy.
34. Usunięcie konta ma być wykonywane przez bezpieczny flow serwerowy wymagający potwierdzonej intencji użytkownika oraz sprawdzenia aktualnej sesji; flow usuwa użytkownika z auth.users, a dane aplikacyjne mają zniknąć dzięki zależnościom cascade.
35. Nie będą stosowane unikalne ograniczenia na VIN, numer rejestracyjny ani kombinacje danych auta; użytkownik może mieć dwie inspekcje tego samego pojazdu.
36. Dane użytkownika wpisywane ręcznie, zwłaszcza VIN i registration_number, mają być zapisywane wyłącznie w postaci znormalizowanej; normalizacja i walidacja mają być realizowane przez wspólny kontrakt oraz zaufaną ścieżkę zapisu po stronie serwera, a nie przez triggery bazy.
37. Typy słownikowe, takie jak status, theme, font_scale, fuel_type, transmission, drive i body_type, mają być modelowane jako tekst z ograniczeniami check, a nie jako PostgreSQL enum.
38. Price ma być przechowywane jako typ numeryczny dokładny bez osobnej waluty, a year_of_production, mileage, number_of_doors i długości pól tekstowych mają mieć twarde ograniczenia w bazie zgodne z PRD.
39. Wszystkie prywatne tabele w publicznym schemacie mają mieć włączone RLS.
40. Podstawowa zasada izolacji odczytu w RLS ma opierać się na auth.uid() = user_id; użytkownik ma widzieć wyłącznie własne rekordy. Dostęp odczytowy może korzystać z RLS, ale prawa zapisu dla danych aplikacyjnych nie mogą być wystawione jako ogólny, bezpośredni DML z przeglądarki.
41. Zaufaną ścieżką zapisu mają być Nitro server routes oraz, tam gdzie to uzasadnione, wąsko zakresowane prywatne funkcje SQL lub RPC helpers. Rola kliencka nie może mieć otwartych uprawnień insert/update/delete do inspections.
42. profiles ma pozostać read-only dla zwykłego użytkownika. user_preferences mogą być zmieniane wyłącznie przez zaufaną ścieżkę aplikacyjną albo równoważny, wąsko zdefiniowany kontrakt; delete na profiles i user_preferences z poziomu klienta nie jest wspierany.
43. Dashboard ma sortować inspekcje po updated_at malejąco.
44. Na starcie mają istnieć indeksy na user_id + updated_at oraz user_id + status; nie będzie osobnego indeksu tylko po updated_at ani indeksu GIN na snapshot JSONB.
45. W MVP nie będzie partycjonowania, serwerowej kolejki synchronizacji, tabel analitycznych ani publicznych tabel anonimowych.
46. Wszystkie znaczniki czasu mają być typu timestamptz w UTC, a updated_at ma być utrzymywany przez prosty trigger lub równoważny mechanizm aktualizujący kolumnę wyłącznie przy rzeczywistej zmianie wiersza.
47. Materiał został doprecyzowany w stopniu wystarczającym do przejścia do kolejnego etapu: przygotowania konkretnego schematu SQL, constraints, indeksów, zaufanych ścieżek zapisu, funkcji Supabase i polityk RLS oraz kontraktów API.
{{/decisions}}

{{matched_recommendations}}
1. Utrzymanie modelu Supabase Auth + minimalne tabele aplikacyjne + inspections jako projekcja relacyjna z kanonicznym snapshotem JSONB zostało potwierdzone jako główna decyzja architektoniczna dla MVP.
2. Rekomendacja, aby źródło prawdy dla checklisty i instrukcji pozostawić w repozytorium, została zaakceptowana; baza ma przechowywać tylko stan inspekcji i identyfikatory wersji artefaktów potrzebnych do historycznej interpretacji.
3. Rekomendacja minimalnego modelu danych została przyjęta: brak osobnych tabel dla pytań, odpowiedzi, eventów, analityki i historii zmian.
4. Rekomendacja denormalizacji tylko wybranych pól Part 1 do tabeli inspections została zaakceptowana jako projekcja utrzymywana po stronie serwera, a nie jako drugie źródło prawdy obok snapshotu.
5. Rekomendacja użycia tekstu z ograniczeniami check zamiast PostgreSQL enum została zaakceptowana dla lepszej elastyczności migracji.
6. Rekomendacja trzymania title jako wartości pochodnej generowanej po stronie serwera została zaakceptowana, z dodatkowym wymogiem współdzielonego deterministycznego buildera dla UX offline.
7. Rekomendacja rozdzielenia question_notes i global_notes została zaakceptowana, przy czym question_notes są strukturą mapowaną po question_id, a global_notes pozostaje jednym samodzielnym dokumentem tekstowym.
8. Rekomendacja, aby walidacja i normalizacja Part 1 były współdzielonym kontraktem klient-serwer, została zaakceptowana; walidacja po stronie klienta jest UX, a serwer zawsze waliduje ponownie.
9. Rekomendacja, aby visibility było wyliczane kanonicznie po stronie serwera z question_bank_version, znormalizowanego Part 1 i runtime_flags, została zaakceptowana wraz z serwerowym pruningiem niedozwolonych answers i question_notes.
10. Rekomendacja wersjonowania synchronizacji przez snapshot_version, client_updated_at i updated_at oraz zwracania jawnego błędu konfliktu bez cichego ignorowania zapisu została zaakceptowana.
11. Rekomendacja pełnego snapshot sync per inspection została zaakceptowana zamiast bezpośrednich częściowych mutacji tabeli inspections.
12. Rekomendacja atomowego egzekwowania limitu 2 inspekcji przez prywatną funkcję SQL lub transakcję serwerową została zaakceptowana.
13. Rekomendacja stosowania RLS jako warstwy izolacji odczytu i ochrony właścicielskiej została zaakceptowana, ale bez otwierania ogólnego direct DML z klienta do inspections.
14. Rekomendacja pozostawienia operacji wrażliwych, inspekcyjnych write-pathów i delete flow po stronie serwera została zaakceptowana.
15. Rekomendacja utrzymywania minimalnych tabel profiles i user_preferences oraz auto-provisioningu obu rekordów po rejestracji została zaakceptowana.
16. Rekomendacja unikania przedwczesnej optymalizacji, czyli braku partycjonowania, braku indeksów GIN i braku dodatkowych tabel infrastrukturalnych, została zaakceptowana.
{{/matched_recommendations}}

{{database_planning_summary}}
**Główne wymagania dotyczące schematu bazy danych**

Schemat ma wspierać MVP offline-first dla aplikacji Nuxt 4 + Supabase, w której użytkownik loguje się przez e-mail i hasło, może posiadać maksymalnie 2 inspekcje i pracuje na danych prywatnych dostępnych wyłącznie dla właściciela. Baza ma przechowywać tylko to, co jest potrzebne do konta, preferencji i kanonicznego stanu inspekcji; pytania i instrukcja pozostają poza bazą. Model ma być prosty, ale odporny na synchronizację offline, konflikt zapisu, hard delete inspekcji i trwałe usuwanie konta.

Istotne wymagania domenowe, które bezpośrednio wpływają na schemat, to: manualne przejście draft do completed, możliwość powrotu do edycji bez tworzenia nowej wersji rekordu, limit 2 inspekcji na konto, przechowywanie wersji checklisty użytej dla inspekcji, możliwość odtworzenia raportu bez bieżącej wersji repo, pełna serwerowa rewalidacja zapisów oraz zgodność z PRD dla walidacji i normalizacji Part 1.

**Kluczowe encje i ich relacje**

Model docelowy to auth.users jako system of record dla tożsamości, z relacjami 1:1 do profiles i user_preferences oraz relacją 1:N do inspections. Tabele aplikacyjne mają odnosić się do auth.users przez user_id z kasowaniem kaskadowym.

Profiles ma pozostać minimalne i pełnić rolę technicznego rekordu użytkownika. User_preferences ma przechowywać ustawienia aplikacyjne synchronizowane między urządzeniami. Inspections jest główną tabelą domenową i łączy dwa podejścia: kanoniczny snapshot JSONB zawierający pełen stan inspekcji oraz relacyjną projekcję utrzymywaną po stronie serwera do listowania, filtrowania, sortowania i reguł biznesowych.

Snapshot został doprecyzowany jako kontener na part_1, runtime_flags, answers, question_notes, global_notes, visible_group_ids i visible_question_ids. snapshot.part_1 jest stanem kanonicznym, a relacyjne kolumny inspections są wyłącznie jego projekcją. Odpowiedzi i question_notes są mapowane po stabilnych question_id z przypiętej wersji repo-driven question banku, global_notes pozostaje jednym dokumentem tekstowym, a visible_group_ids i visible_question_ids są kanonicznie wyliczane po stronie serwera i utrwalane do historycznej rekonstrukcji raportu.

**Ważne kwestie bezpieczeństwa i skalowalności**

Bezpieczeństwo ma opierać się na dwóch warstwach. Pierwsza to RLS na wszystkich prywatnych tabelach, używane przede wszystkim do izolacji danych właściciela przy odczycie. Druga to zaufana warstwa serwerowa w Nitro oraz ewentualnie wąsko zakresowane prywatne funkcje SQL/RPC, która egzekwuje reguły biznesowe, write-path, limity, title generation, rewalidację Part 1, visibility recompute, pruning i konflikt synchronizacji. Oznacza to, że tworzenie inspekcji, usuwanie inspekcji, usuwanie konta i zapis snapshotu nie mogą być pozostawione bezpośrednim mutacjom klienta do tabeli inspections.

Synchronizacja została doprecyzowana jako pełny snapshot sync per inspection. Serwer przyjmuje pełny snapshot, ponownie waliduje payload, wylicza visibility z przypiętej wersji question banku i zapisuje zwycięski stan zgodnie ze strategią Last Write Wins / Client Wins opartą o snapshot_version i client_updated_at; przegrany zapis dostaje jawny conflict response z rekordem kanonicznym. Model pozostaje prosty, tani w utrzymaniu i dobrze dopasowany do małej liczby rekordów per użytkownik.

Skalowalność została potraktowana pragmatycznie. Na MVP nie ma potrzeby partycjonowania, indeksów GIN po JSONB, tabel historii ani tabel eventowych. Wystarczające są indeksy wspierające RLS i dashboard, czyli przede wszystkim user_id + updated_at oraz user_id + status.

**Stan przygotowania do kolejnego etapu**

Rozmowa doprowadziła do spójnego zestawu decyzji projektowych. Na tej podstawie można już przygotować konkretną propozycję schematu PostgreSQL dla MVP: definicje tabel, kolumn, typów, check constraints, triggera dla updated_at, zaufanych ścieżek zapisu, prywatnych funkcji SQL/RPC do tworzenia inspekcji i zapisu snapshotu, kontraktu conflict response oraz pełnego zestawu polityk RLS. Wejście do kolejnego etapu jest uzasadnione, bo kluczowe wybory domenowe, bezpieczeństwa, synchronizacji i odpowiedzialności klient-serwer zostały już podjęte.
{{/database_planning_summary}}

{{unresolved_issues}}
1. Brak blokujących, nierozwiązanych kwestii produktowych lub architektonicznych przed etapem projektowania SQL schema, constraints, indeksów, funkcji Supabase, polityk RLS i kontraktów API.
2. Kolejny etap powinien już przełożyć ustalenia na konkretny DDL PostgreSQL, prywatne funkcje SQL/RPC, Zod contracts, testy RLS i testy synchronizacji, zamiast wracać do pytań o model odpowiedzialności lub kanoniczny kształt danych.
3. Pozostałe doprecyzowania mają charakter implementacyjny, a nie decyzyjny: dokładne nazwy kolumn, nazw prywatnego schematu, finalny literal pustego szkieletu snapshotu i nazwy pól w conflict response.
{{/unresolved_issues}}
{{/conversation_summary}}