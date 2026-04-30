{{conversation_summary}}
{{decisions}}
1. Źródłem tożsamości użytkownika będzie Supabase Auth, dokładniej auth.users, bez własnej tabeli haseł i bez duplikowania e-maila poza warstwą auth.
2. Model danych MVP ma opierać się na trzech głównych tabelach aplikacyjnych: profiles, user_preferences i inspections, powiązanych z auth.users.
3. Rekordy profiles i user_preferences mają być tworzone automatycznie po rejestracji użytkownika.
4. Tabela profiles ma pozostać minimalna i w MVP zawierać wyłącznie user_id, created_at i updated_at.
5. Tabela user_preferences ma być tabelą 1:1 z użytkownikiem, z user_id jako kluczem głównym, i przechowywać tylko theme, font_scale, hide_inspection_intro, created_at i updated_at.
6. Ustawienie theme ma przyjmować tylko wartości system, light, dark, a font_scale tylko small, medium, large.
7. Główną encją domenową ma być tabela inspections z relacyjnym rdzeniem i snapshotem JSONB, bez osobnych tabel inspection_answers, inspection_notes i inspection_events.
8. Wszystkie klucze główne mają używać UUID, a profiles, user_preferences i inspections mają mieć klucze obce do auth.users(id) z kasowaniem kaskadowym.
9. Tabela inspections ma przechowywać także zdenormalizowane pola potrzebne do dashboardu i reguł biznesowych: title, status, make, model, year_of_production, registration_number, vin_number, fuel_type, transmission, drive, body_type, price, mileage, color, number_of_doors, address oraz wersje question_bank_version i snapshot_schema_version.
10. Tytuł inspekcji ma być przechowywany w bazie, ale zawsze generowany po stronie serwera z znormalizowanych danych Part 1; ma mieć limit długości.
11. Status biznesowy inspekcji ma mieć tylko dwa stany: draft i completed.
12. Ukończenie inspekcji ma ustawiać completed_at, a powrót do edycji ma zmieniać status z powrotem na draft i czyścić completed_at bez tworzenia nowego rekordu.
13. Pytania, grupy pytań, wyjaśnienia i instrukcja startowa nie mają być przechowywane w bazie; źródłem prawdy pozostaje repozytorium, a baza przechowuje tylko wersję question banku i stan konkretnej inspekcji.
14. Wersja question banku ma być zapisywana per inspekcja jako prosty tekst, na przykład mvp-v1, i ma być niemutowalna po utworzeniu rekordu.
15. Snapshot JSONB ma mieć jawny i stabilny układ: part_1, runtime_flags, answers, question_notes, global_notes, visible_group_ids oraz visible_question_ids.
16. Odpowiedzi mają być przechowywane jako obiekt mapowany po question_id, z wartościami tylko yes, no i dont_know.
17. Notatki kontekstowe mają być przechowywane osobno od globalnych notatek, również mapowane po question_id; usunięcie notatki ma usuwać wpis z obiektu zamiast zostawiać pustą wartość.
18. Runtime flags mają być osobnym obiektem i mogą zawierać tylko pięć znanych flag z PRD, bez dowolnych dodatkowych kluczy.
19. Visible_group_ids i visible_question_ids mają być przechowywane jako uporządkowane listy stringów, aby raport dało się odtworzyć bez odwołania do bieżącej wersji checklisty.
20. Model synchronizacji ma używać snapshot_version, client_updated_at i serwerowego updated_at; nie będzie osobnej kolumny server_updated_at ani last_synced_at.
21. Snapshot_version ma startować od 1 i rosnąć przy każdym rzeczywistym zapisie; updated_at ma zmieniać się tylko przy realnej zmianie danych.
22. W razie konfliktu synchronizacji starszy zapis klienta ma być odrzucony lub zignorowany, a serwer ma zwrócić jawny błąd konfliktu wraz z aktualnym rekordem kanonicznym.
23. Postęp i rozkład odpowiedzi nie mają być przechowywane jako osobne kolumny; mają być wyliczane ze snapshotu.
24. Limit maksymalnie 2 inspekcji na konto ma obejmować wszystkie statusy i ma być egzekwowany atomowo po stronie serwera, najlepiej przez prywatną funkcję SQL lub transakcję.
25. Usunięcie inspekcji ma być hard delete i ma przechodzić przez bezpieczny endpoint serwerowy.
26. Usunięcie konta ma być wykonywane przez bezpieczny flow serwerowy, który usuwa użytkownika z auth.users, a dane aplikacyjne mają zniknąć dzięki zależnościom cascade.
27. Nie będą stosowane unikalne ograniczenia na VIN, numer rejestracyjny ani kombinacje danych auta; użytkownik może mieć dwie inspekcje tego samego pojazdu.
28. Dane użytkownika wpisywane ręcznie, zwłaszcza VIN i registration_number, mają być zapisywane wyłącznie w postaci znormalizowanej; normalizacja ma dziać się w aplikacji lub endpointzie, nie w triggerach bazy.
29. Typy słownikowe, takie jak status, theme, font_scale, fuel_type, transmission, drive i body_type, mają być modelowane jako tekst z ograniczeniami check, a nie jako PostgreSQL enum.
30. Price ma być przechowywane jako typ numeryczny dokładny bez osobnej waluty, a year_of_production, mileage, number_of_doors i długości pól tekstowych mają mieć twarde ograniczenia w bazie.
31. Wszystkie prywatne tabele w publicznym schemacie mają mieć włączone RLS i jawne polityki dla select, insert, update i delete.
32. Podstawowa zasada RLS ma opierać się na auth.uid() = user_id; profiles, user_preferences i inspections mają być dostępne tylko właścicielowi.
33. RLS ma dodatkowo ograniczać insert i update tak, aby user_id nie dało się podmienić, a rekord inspections mógł powstać tylko jako własny i w statusie draft.
34. Delete na profiles ma być zablokowany dla zwykłego użytkownika; delete na user_preferences z poziomu klienta nie jest potrzebny; dodatkowe reguły biznesowe mają być utrzymywane po stronie serwera.
35. Operacje wrażliwe, takie jak tworzenie inspekcji z limitem 2, usuwanie inspekcji, usuwanie konta i upsert snapshotu, mają przechodzić przez bezpieczne endpointy lub prywatne funkcje SQL, a funkcje security definer mają być używane oszczędnie i poza schematem publicznym.
36. Dashboard ma sortować inspekcje po updated_at malejąco.
37. Na starcie mają istnieć indeksy na user_id + updated_at oraz user_id + status; nie będzie osobnego indeksu tylko po updated_at ani indeksu GIN na snapshot JSONB.
38. W MVP nie będzie partycjonowania, serwerowej kolejki synchronizacji, tabel analitycznych ani publicznych tabel anonimowych.
39. Wszystkie znaczniki czasu mają być typu timestamptz w UTC, a updated_at ma być utrzymywany przez prosty trigger.
40. Materiał został uznany za wystarczająco doprecyzowany, aby przejść do kolejnego etapu: przygotowania konkretnego schematu SQL, constraints, indeksów, funkcji i polityk RLS.
{{/decisions}}

{{matched_recommendations}}
1. Utrzymanie modelu Supabase Auth + relacyjny rdzeń + JSONB snapshot zostało w pełni potwierdzone i jest główną decyzją architektoniczną dla MVP.
2. Rekomendacja, aby źródło prawdy dla checklisty i instrukcji pozostawić w repozytorium, została zaakceptowana; baza ma przechowywać tylko stan inspekcji i wersje artefaktów.
3. Rekomendacja minimalnego modelu danych została przyjęta: brak osobnych tabel dla pytań, odpowiedzi, notatek, eventów, analityki i historii zmian.
4. Rekomendacja denormalizacji tylko wybranych pól Part 1 do tabeli inspections została zaakceptowana jako kompromis między prostotą snapshotu a wydajnością dashboardu.
5. Rekomendacja użycia tekstu z ograniczeniami check zamiast PostgreSQL enum została zaakceptowana dla lepszej elastyczności migracji.
6. Rekomendacja trzymania title jako wartości pochodnej generowanej po stronie serwera została zaakceptowana dla spójności danych.
7. Rekomendacja rozdzielenia globalnych notatek i notatek kontekstowych oraz mapowania ich po question_id została zaakceptowana.
8. Rekomendacja, aby postęp, score i inne dane pochodne wyliczać ze snapshotu zamiast zapisywać jako osobne kolumny, została zaakceptowana.
9. Rekomendacja wersjonowania synchronizacji przez snapshot_version, client_updated_at i updated_at oraz zwracania jawnego błędu konfliktu została zaakceptowana.
10. Rekomendacja atomowego egzekwowania limitu 2 inspekcji przez prywatną funkcję SQL lub transakcję serwerową została zaakceptowana.
11. Rekomendacja stosowania ścisłego RLS na wszystkich tabelach prywatnych oraz jawnych polityk per operacja została zaakceptowana.
12. Rekomendacja pozostawienia operacji wrażliwych po stronie serwera, mimo istnienia RLS, została zaakceptowana.
13. Rekomendacja utrzymywania normalizacji danych wejściowych w aplikacji lub endpointach, a nie w triggerach bazy, została zaakceptowana.
14. Rekomendacja unikania przedwczesnej optymalizacji, czyli braku partycjonowania, braku indeksów GIN i braku dodatkowych tabel infrastrukturalnych, została zaakceptowana.
15. Rekomendacja utrzymywania minimalnych tabel profiles i user_preferences oraz auto-provisioningu obu rekordów po rejestracji została zaakceptowana.
{{/matched_recommendations}}

{{database_planning_summary}}
**Główne wymagania dotyczące schematu bazy danych**

Schemat ma wspierać MVP offline-first dla aplikacji Nuxt 4 + Supabase, w której użytkownik loguje się przez e-mail i hasło, może posiadać maksymalnie 2 inspekcje i pracuje na danych prywatnych dostępnych wyłącznie dla właściciela. Baza ma przechowywać tylko to, co jest potrzebne do konta, preferencji i stanu inspekcji; pytania i instrukcja pozostają poza bazą. Model ma być prosty, ale odporny na synchronizację offline, konflikt zapisu, hard delete inspekcji i trwałe usuwanie konta.

Istotne wymagania domenowe, które bezpośrednio wpływają na schemat, to: manualne przejście draft do completed, możliwość powrotu do edycji bez tworzenia nowej wersji rekordu, limit 2 inspekcji na konto, przechowywanie wersji checklisty użytej dla inspekcji, możliwość odtworzenia raportu bez bieżącej wersji repo oraz zgodność z PRD dla walidacji i normalizacji Part 1.

**Kluczowe encje i ich relacje**

Model docelowy to auth.users jako system of record dla tożsamości, z relacjami 1:1 do profiles i user_preferences oraz relacją 1:N do inspections. Tabele aplikacyjne mają odnosić się do auth.users przez user_id z kasowaniem kaskadowym.

Profiles ma pozostać minimalne i pełnić rolę technicznego rekordu użytkownika. User_preferences ma przechowywać ustawienia aplikacyjne synchronizowane między urządzeniami. Inspections jest główną tabelą domenową i łączy dwa podejścia: zdenormalizowane kolumny potrzebne do listowania, filtrowania i reguł biznesowych oraz snapshot JSONB zawierający pełen stan inspekcji.

Snapshot został doprecyzowany jako kontener na part_1, runtime_flags, answers, question_notes, global_notes, visible_group_ids i visible_question_ids. Odpowiedzi i notatki kontekstowe są mapowane po stabilnych question_id z repo. Dzięki temu model jest zgodny z architekturą repo-driven question bank i jednocześnie wystarcza do odtwarzania raportu konkretnej inspekcji niezależnie od zmian w przyszłych wersjach checklisty.

**Ważne kwestie bezpieczeństwa i skalowalności**

Bezpieczeństwo ma opierać się na dwóch warstwach. Pierwsza to RLS na wszystkich prywatnych tabelach, z politykami select, insert, update i delete rozpisanymi jawnie i opartymi o auth.uid() = user_id. Druga to warstwa serwerowa, która pilnuje reguł biznesowych, operacji wrażliwych oraz konfliktów synchronizacji. Oznacza to, że tworzenie inspekcji, usuwanie inspekcji, usuwanie konta i zapis snapshotu nie powinny być pozostawione samym bezpośrednim mutacjom klienta.

Skalowalność została potraktowana pragmatycznie. Na MVP nie ma potrzeby partycjonowania, indeksów GIN po JSONB, tabel historii ani tabel eventowych. Wystarczające są indeksy wspierające RLS i dashboard, czyli przede wszystkim user_id + updated_at oraz user_id + status. Model pozostaje prosty, tani w utrzymaniu i dobrze dopasowany do małej liczby rekordów per użytkownik oraz strategii snapshot sync.

**Stan przygotowania do kolejnego etapu**

Rozmowa doprowadziła do spójnego, niemal kompletnego zestawu decyzji projektowych. Na tej podstawie można już przygotować konkretną propozycję schematu PostgreSQL dla MVP: definicje tabel, kolumn, typów, check constraints, foreign keys, triggera dla updated_at, prywatnych funkcji SQL do tworzenia inspekcji i zapisu snapshotu oraz pełnego zestawu polityk RLS. Wejście do kolejnego etapu jest uzasadnione, bo kluczowe wybory domenowe, bezpieczeństwa, synchronizacji i wydajności zostały już podjęte.
{{/database_planning_summary}}

{{unresolved_issues}}
1. Brak krytycznych nierozwiązanych kwestii produktowych; rozmowa doprowadziła do wystarczająco precyzyjnego modelu wejściowego dla projektu schematu SQL.
2. Do doprecyzowania na etapie implementacyjnym pozostają tylko szczegóły techniczne: dokładne nazwy kolumn, nazw prywatnego schematu dla funkcji SQL, finalny pusty szkielet snapshotu oraz dokładny kontrakt odpowiedzi błędu konfliktu synchronizacji.
3. W następnym kroku warto już nie wracać do pytań ogólnych, tylko przełożyć ustalenia na konkretny DDL PostgreSQL, indeksy, funkcje serwerowe i polityki RLS.
{{/unresolved_issues}}
{{/conversation_summary}}