{{conversation_summary}}
{{decisions}}
1. Produkt MVP rozwiązuje problem amatora kupującego używany samochód, który nie wie, na co patrzeć, jak interpretować usterki i potrzebuje prowadzenia krok po kroku podczas inspekcji.
2. Aplikacja jest skierowana do laików i językiem głównym MVP jest angielski.
3. Struktura produktu zostaje oparta na 5 Partach: Part 1 `Info about the car`, Part 2 `At a standstill`, Part 3 `Starting the engine`, Part 4 `Test drive`, Part 5 `Documents`.
4. Part 1 zawiera formularz konfiguracji auta i tylko pola `Make`, `Model`, `Fuel type`, `Transmission`, `Drive`, `Body type` są obowiązkowe; pola `Fuel type`, `Transmission`, `Drive` i `Body type` determinują zestaw pytań.
5. Lista pytań w dostarczonym pliku była bazą podstawową; pełna logika widoczności, normalizacja pytań oraz brakujące pytania dla konkretnych kategorii pojazdów zostały doprojektowane i rozpisane w pakiecie artefaktów `.ai/veriffica-questions-list/`.
6. Wszystkie pytania mają identyczną wagę. MVP nie przewiduje wag usterek ani systemu deal-breakerów.
7. Wynik nie jest pojedynczą oceną jakości auta. `Total Score` i wyniki sekcji to zawsze prosty wykres kolumnowy podzielony na trzy części: `Yes / No / Don't know`, np. `70% Yes / 10% No / 20% Don't know`.
8. Aplikacja ma działać w modelu `Offline-First` jako PWA, z lokalnym przechowywaniem danych i kolejką zmian synchronizowaną po odzyskaniu połączenia.
9. W MVP należy stosować dobre praktyki synchronizacji offline, w tym `IndexedDB`, strategię rozwiązywania konfliktów typu `Last Write Wins / Client Wins` oraz bezpieczne odnawianie sesji po odzyskaniu sieci.
10. W przypadku wygaśnięcia sesji podczas pracy offline użytkownik nie może zostać wylogowany; aplikacja ma utrzymywać lokalną sesję do czasu odzyskania połączenia.
11. Instrukcja z pliku `.ai/veriffica-instrukcja.md` ma być pokazywana jako pop-up przy każdym rozpoczęciu nowej inspekcji.
12. Pop-up z instrukcją powinien mieć opcję `Don't show again`.
13. Dashboard ma prezentować kafelki sesji w statusach `Draft` i `Completed`.
14. Nazwa kafelka sesji jest budowana z pól `Make`, `Model` oraz opcjonalnie `Year of production` i `Registration number`, jeśli zostały poprawnie wypełnione, i musi aktualizować się natychmiast po zmianie tych pól w Part 1.
15. Na koncie użytkownika w MVP mogą istnieć maksymalnie 2 inspekcje.
16. Użytkownik może usuwać inspekcje z dashboardu, a usunięcie zwalnia slot na nową inspekcję.
17. Usunięcie inspekcji ma być `Hard Delete`, czyli natychmiastowe i nieodwracalne, z dodatkowym potwierdzeniem.
18. Po osiągnięciu limitu 2 inspekcji aplikacja ma wyświetlać pop-up informujący o wykorzystaniu limitu.
19. Pusty Dashboard ma zawierać krótką wiadomość zachęcającą do rozpoczęcia pierwszej inspekcji oraz przycisk CTA.
20. Na `Stronie sesji` przyciski prowadzące do Part 2-5 muszą być nieaktywne, dopóki użytkownik nie wypełni wszystkich wymaganych pól w Part 1.
21. System pytań w Partach 2-5 ma działać jako pełnoekranowe karty zajmujące całą dostępną wysokość ekranu poza stałymi elementami layoutu.
22. Nawigacja między kartami pytań odbywa się poziomo lewo-prawo.
23. Przejście do następnej karty ma być zablokowane, dopóki użytkownik nie wybierze odpowiedzi `Yes / No / Don't know`.
24. Próba przejścia bez odpowiedzi powinna być wsparta zachowaniem walidacyjnym w UX, a cofanie powinno być możliwe gestem i widocznym przyciskiem `Back`.
25. Po zakończeniu każdego z Partów ma pojawiać się ekran przejściowy z komunikatem o zakończeniu tego Partu i przyciskiem `OK`, który odsyła użytkownika z powrotem do `Strony sesji`, skąd sam wybiera kolejny Part.
26. Każda karta pytania musi mieć ikonę `Notes`, która otwiera pop-up do zapisania notatki związanej z danym pytaniem.
27. Notatka z karty pytania po zapisaniu ma zostać dopisana do jednego globalnego, edytowalnego dokumentu notatek na `Stronie sesji`, wraz z treścią oryginalnego pytania jako nagłówek.
28. Limit notatki kontekstowej wynosi 500 znaków.
29. Limit globalnego dokumentu notatek wynosi 10000 znaków.
30. Lista pytań i odpowiedzi na `Summary` musi być edytowalna, a zmiana odpowiedzi ma następować bezpośrednio na liście, bez wracania do widoku karty.
31. Status `Completed` nie jest nadawany automatycznie; użytkownik musi kliknąć wyraźny przycisk `Zakończ inspekcję` na stronie `Summary`.
32. Dla ukończonej inspekcji rekomendowany jest tryb zamknięcia raportu z możliwością świadomego powrotu do edycji.
33. Walidacja formularza Part 1 ma być ścisła.
34. Motyw aplikacji ma domyślnie podążać za ustawieniami systemowymi urządzenia użytkownika.
35. Podpowiedzi edukacyjne pod ikoną `i` mają otwierać się w formie pop-upu.
36. Użytkownik w MVP nie dostaje eksportu raportu ani udostępniania linkiem; jeśli chce wynieść dane, musi zrobić screenshot lub ręcznie skopiować tekst.
37. Dopuszczalne są lekkie powiadomienia typu toast/snackbar dla prostych akcji systemowych.
38. W MVP wchodzi usuwanie profilu użytkownika i wszystkich jego danych.
39. W MVP nie narzucamy żadnego tech stacku; osobna sesja planistyczna ma zdecydować o technologiach.
40. W pierwszej fazie MVP rezygnujemy z monitorowania błędów i narzędzi typu Sentry/LogRocket.
41. MVP nie obejmuje PDF, link sharingu, zdjęć, zewnętrznej weryfikacji VIN, aplikacji natywnych, porównywarki i systemu automatycznej dyskwalifikacji auta.
42. System pytań został rozdzielony na trzy warstwy: `questionGroups` odpowiadają za widoczność i logikę warunkową, `questions` przechowują treść pytań, a `explanations` przechowują treści edukacyjne pod ikoną `i`.
43. `questionGroups` nie zawierają pytań w środku; pytania są linkowane przez `groupId`, a treści edukacyjne przez `explanationRef`.
44. Widoczność pytań zależy od addytywnej formuły `Base + fuelType + transmission + drive + bodyType` oraz od ograniczonego zestawu runtime flags: `chargingPortEquipped`, `evBatteryDocsAvailable`, `turboEquipped`, `mechanicalCompressorEquipped`, `importedFromEU`.
45. Zmiana pól mapujących `fuelType`, `transmission`, `drive`, `bodyType` albo aktywnej runtime flag wpływającej na widoczność uruchamia `Smart Pruning`, czyli usunięcie odpowiedzi należących do grup, które stały się niewidoczne, oraz natychmiastowe przeliczenie postępu i `Total Score`.
46. W modelu danych systemu pytań obowiązują stabilne identyfikatory `questionId`, `groupId` i `explanationRef`, a pole `order` rośnie co 10, aby umożliwić późniejsze wstawianie nowych pytań bez renumeracji całej listy.
{{/decisions}}

{{matched_recommendations}}
1. Oprzeć implementację o przygotowaną pełną matrycę logiki warunkowej, która mapuje konfigurację z Part 1 oraz runtime flags na zestaw pytań w Partach 2-5, w tym pytania dodatkowe dla petrol, diesel, hybrid, electric, manual, automatic, 4WD i innych wariantów.
2. Oprzeć przechowywanie offline na `IndexedDB`, a nie na `Local Storage`, oraz opisać mechanizm kolejki zmian i synchronizacji po odzyskaniu połączenia.
3. Przyjąć strategię rozwiązywania konfliktów danych typu `Last Write Wins / Client Wins` oraz opisać ją w PRD jako świadomą decyzję MVP.
4. Zachować sesję użytkownika podczas pracy offline i odnawiać ją dopiero po odzyskaniu połączenia, bez przerywania trwającej inspekcji.
5. Wprowadzić na dashboardzie przyklejone powiadomienie zachęcające do dokończenia draftu po zalogowaniu.
6. Zastosować licznik postępu w formacie `obecne pytanie / liczba pytań w danym Part`, zamiast klasycznego paska postępu.
7. Zaprojektować pełnoekranowe karty pytań z dużymi strefami dotyku oraz blokadą przejścia dalej bez odpowiedzi.
8. Dodać obsługę cofania zarówno poprzez gest, jak i widoczny przycisk `Back`.
9. Wprowadzić ekran przejściowy po każdym z Partów z komunikatem o przejściu do kolejnego etapu inspekcji oraz powrotem na `Stronę sesji`.
10. Utrzymać jeden globalny dokument notatek na `Stronie sesji`, uzupełniany notatkami kontekstowymi z kart pytań.
11. Dodać auto-save dla notatek, szczególnie przy dłuższej edycji dokumentu globalnego.
12. Wprowadzić `Smart Pruning` przy zmianie konfiguracji auta lub runtime flag wpływających na widoczność: zachowywać odpowiedzi nadal zgodne z konfiguracją, a usuwać tylko odpowiedzi osierocone, po wcześniejszym ostrzeżeniu użytkownika.
13. Zablokować wejście do Partów 2-5 do czasu poprawnego wypełnienia wszystkich pól wymaganych w Part 1.
14. Wprowadzić manualne finalizowanie inspekcji przez przycisk `Zakończ inspekcję` zamiast automatycznego zamykania raportu.
15. Zastosować jasne, precyzyjne komunikaty walidacyjne w Part 1, wskazujące konkretny błąd i pole wymagające poprawy.
16. Wprowadzić opcję `Don't show again` dla instrukcji wyświetlanej przy rozpoczęciu nowej inspekcji.
17. Dodać zachętę do instalacji PWA na ekranie głównym po pierwszym sensownym użyciu aplikacji.
18. Rozważyć użycie `Screen Wake Lock API` podczas aktywnej inspekcji, aby ekran nie wygasał w kluczowych momentach.
19. Dodać lekkie komunikaty typu toast dla potwierdzeń prostych akcji, np. zapisania notatki.
20. Utrzymać rozdzielenie warstwy widoczności i metadanych grup `questionGroups` od warstwy treści `questions`, łącząc je przez `groupId` zamiast osadzać pytania bezpośrednio w konfiguracji grup.
21. Utrzymać znormalizowane treści edukacyjne w słowniku `explanations`, do którego pytania odnoszą się przez `explanationRef`.
22. Używać stabilnych identyfikatorów i pola `order` zamiast wiązać logikę aplikacji z tekstem pytania lub jego pozycją w źródłowym markdownie.
23. Utrzymać ograniczony zestaw runtime flags wyłącznie dla wyjątków niewynikających bezpośrednio z Part 1, takich jak port ładowania, dokumenty baterii EV, turbo, `mechanicalCompressorEquipped` i import z UE.
{{/matched_recommendations}}

{{prd_planning_summary}}
**a. Główne wymagania funkcjonalne produktu**

Veriffica MVP to anglojęzyczna aplikacja PWA `Offline-First` dla laików kupujących używane auta. Główny przepływ składa się z: strony głównej, logowania społecznościowego Google/Apple, dashboardu z limitem maksymalnie 2 inspekcji, `Strony sesji`, formularza Part 1, systemu pytań w Partach 2-5, strony `Summary`, profilu użytkownika i ustawień.

Kluczowe funkcje obejmują:
1. Tworzenie i zarządzanie maksymalnie 2 inspekcjami na konto.
2. Dashboard z kafelkami. Po jednej kafelce dla każdej inspekcji. Możliwe statusy kafelek to  `Draft` i `Completed`, natychmiastowo aktualizowanymi po zmianach danych auta.
3. `Hard Delete` inspekcji z potwierdzeniem i zwalnianiem slotu.
4. `Stronę sesji` jako centralny ekran sesji, z przyciskami do Partów 1-5, wskaźnikiem wyniku, postępu i miejscem na globalny dokument notatek.
5. Part 1 jako ściśle walidowany formularz konfiguracji auta.
6. Dynamiczne wyznaczanie widocznych grup pytań i budowanie uporządkowanej listy pytań na podstawie konfiguracji auta oraz runtime flags.
7. Part 2-5 jako system pełnoekranowych kart z odpowiedziami `Yes / No / Don't know`.
8. Blokadę przejścia dalej bez udzielenia odpowiedzi.
9. Cofanie kart gestem i przyciskiem `Back`.
10. Pop-up z instrukcją przy każdym rozpoczęciu nowej inspekcji z opcją `Don't show again`.
11. Pop-upy edukacyjne pod ikoną `i`.
12. Notatki kontekstowe z poziomu każdej karty pytania, zapisywane do jednego globalnego dokumentu.
13. Edytowalną listę pytań i odpowiedzi na `Summary`, z możliwością szybkiej zmiany odpowiedzi bezpośrednio na liście.
14. Manualne zakończenie inspekcji przyciskiem `Zakończ inspekcję`.
15. Usuwanie profilu użytkownika i wszystkich danych.
16. Działanie offline z lokalnym przechowywaniem i późniejszą synchronizacją po odzyskaniu połączenia.
17. Znormalizowaną architekturę systemu pytań: `questionGroups` w configu odpowiadają za widoczność oraz metadane grup, takie jak `part`, `section`, `subsection` i `order`, `questions` w banku pytań za treść i kolejność pytań, a `explanations` za współdzielone treści edukacyjne.
18. Obsługę warunkowych grup pytań dla petrol, diesel, hybrid, electric, manual, automatic, 4WD, convertible, SUV, van i pickup.
19. Obsługę runtime-only grup zależnych od wyposażenia lub dokumentów poprzez runtime flags, a nie przez mnożenie wariantów konfiguracji w Part 1.
20. `Smart Pruning` odpowiedzi osieroconych po zmianie konfiguracji auta lub runtime flags wpływających na widoczność.
21. Natychmiastowe przeliczanie postępu i `Total Score` po zmianie odpowiedzi albo widoczności pytań.

**b. Kluczowe historie użytkownika i ścieżki korzystania**

Najważniejsza ścieżka użytkownika:
1. Użytkownik zakłada konto lub loguje się przez Google/Apple.
2. Trafia na pusty dashboard albo listę swoich inspekcji.
3. Rozpoczyna nową inspekcję, widzi instrukcję z `.ai/veriffica-instrukcja.md` w pop-upie.
4. Otwiera `Stronę sesji` i wypełnia Part 1.
5. Po poprawnym uzupełnieniu wymaganych pól `make`, `model`, `fuelType`, `transmission`, `drive` i `bodyType` odblokowują się Part 2-5, a system wylicza widoczne grupy pytań na podstawie addytywnej formuły `Base + fuelType + transmission + drive + bodyType` oraz runtime flags.
6. Użytkownik przechodzi przez pytania sekcjami, jedna karta na ekran, pozioma nawigacja, obowiązkowa odpowiedź; treść pytań pochodzi z `question-bank.json`, a ich widoczność z `question-mapping-config.json` poprzez stabilne `groupId`.
7. W razie potrzeby dodaje notatki do konkretnych pytań.
8. Po zakończeniu sekcji wraca na `Stronę sesji`, skąd wybiera kolejny Part.
9. Na `Summary` przegląda wykresy sekcyjne i globalny wykres odpowiedzi, edytuje odpowiedzi i finalizuje inspekcję.
10. Inspekcja trafia do statusu `Completed`.

Poboczne ścieżki:
1. Użytkownik wraca do draftu z dashboardu dzięki przypiętemu CTA.
2. Użytkownik zmienia konfigurację auta w Part 1 albo aktywną runtime flagę wpływającą na widoczność, a system ostrzega, że część odpowiedzi zostanie usunięta, wykonuje `Smart Pruning` i ponownie przelicza wynik.
3. Użytkownik pracuje offline, a aplikacja zapisuje zmiany lokalnie i synchronizuje je po odzyskaniu sieci.
4. Użytkownik osiąga limit 2 inspekcji i dostaje pop-up limitu.
5. Użytkownik usuwa starą inspekcję, aby zwolnić slot.
6. Użytkownik usuwa konto i wszystkie dane.

**c. Ważne kryteria sukcesu i sposoby ich mierzenia**

Zdefiniowane kryteria sukcesu:
1. 75% użytkowników kończy pełny proces inspekcji.
2. 100% skuteczność synchronizacji kolejki zmian po odzyskaniu połączenia.

Praktyczne sposoby mierzenia w PRD:
1. Mierzyć liczbę rozpoczętych inspekcji versus liczbę inspekcji oznaczonych przez użytkownika jako `Completed`.
2. Mierzyć liczbę draftów porzuconych przed wejściem do `Summary`.
3. Mierzyć liczbę przypadków przejścia Part 1 versus odblokowania Partów 2-5.
4. Mierzyć skuteczność zapisów offline i synchronizacji po powrocie sieci na poziomie operacji domenowych.
5. Mierzyć częstotliwość usuwania draftów i uderzania w limit 2 inspekcji jako sygnał przyszłej monetyzacji.
6. Mierzyć udział odpowiedzi `Don't know` na poziomie sekcji i całego procesu jako wskaźnik trudności checklisty dla laików.

Uwaga: z uwagi na decyzję o rezygnacji z monitoringu błędów w pierwszej fazie, PRD powinno zapisać te metryki jako cel biznesowo-produktowy, ale bez rozbudowanych wymagań narzędziowych dla MVP.

**d. Działanie systemu pytań**

System pytań został doprecyzowany na poziomie danych i logiki runtime:
1. Bramka wejściowa do systemu pytań wymaga poprawnego uzupełnienia pól `make`, `model`, `fuelType`, `transmission`, `drive` i `bodyType` w Part 1.
2. Warstwa widoczności jest opisana w `.ai/veriffica-questions-list/question-mapping-config.json`, gdzie każda grupa ma `id`, `part`, `order`, `section`, `subsection`, `dependsOnFields`, `visibleWhen` i opcjonalne `requiresEquipmentFlag`.
3. Warstwa treści jest opisana w `.ai/veriffica-questions-list/question-bank.json`, gdzie każde pytanie ma stabilne `id`, `groupId`, `part`, `section`, `subsection`, `label`, `order` i opcjonalne `explanationRef`.
4. Warstwa wyjaśnień jest znormalizowana w top-level sekcji `explanations`, dzięki czemu wiele pytań może współdzielić ten sam opis usterki lub wskazówki edukacyjnej.
5. Zakres mapowania obejmuje zarówno grupy bazowe, jak i warunki dla paliwa, skrzyni, napędu, nadwozia oraz runtime-only wyjątków związanych z wyposażeniem lub dokumentami.
6. Runtime flags rozwiązują przypadki graniczne i wyposażeniowe, np. port ładowania, dokumenty baterii EV, turbo, `mechanicalCompressorEquipped` czy dokumenty dla aut importowanych z UE.
7. Kolejność ewaluacji jest następująca: walidacja pól wymaganych Part 1, obliczenie widoczności grup według modelu addytywnego, zastosowanie runtime flags, złożenie uporządkowanej listy pytań z `question-bank.json`, pruning odpowiedzi osieroconych oraz przeliczenie postępu i `Total Score`.
8. Zmiana jednego z pól mapujących `fuelType`, `transmission`, `drive`, `bodyType` albo aktywnej runtime flag wpływającej na widoczność uruchamia pruning w trybie `remove_answers_for_now_hidden_groups`.
9. Odpowiedzi i notatki powinny odnosić się do stabilnych identyfikatorów, a nie do tekstów pytań, co upraszcza edycję odpowiedzi na `Summary`, przyszłe tłumaczenia i dalszy rozwój modelu danych.

**e. Nierozwiązane kwestie lub obszary wymagające dalszego wyjaśnienia**

Najważniejszy obszar do dalszego dopracowania przed implementacją to warstwa runtime systemu pytań:
1. Brakuje implementacji kodowej ewaluatora widoczności pytań oraz `Smart Pruning` zgodnych z przygotowanym configiem.
2. Brakuje finalnego schematu zapisu odpowiedzi i notatek oraz zasad serializacji offline dla warstwy domenowej systemu pytań.

Drugorzędne doprecyzowania do dopisania w PRD:
1. Dokładne reguły ścisłej walidacji wszystkich pól w Part 1, pole po polu.
2. Dokładna treść komunikatów limitu inspekcji, ostrzeżeń `Smart Pruning` i potwierdzeń `Hard Delete`.
3. Ostateczna definicja stanu raportu po kliknięciu `Zakończ inspekcję`, w tym czy i jak użytkownik może później wrócić do edycji.
4. Zachowanie aplikacji podczas pierwszego wejścia offline bez wcześniejszego cache aplikacji.
{{/prd_planning_summary}}

{{unresolved_issues}}
1. Brak implementacji kodowej ewaluatora widoczności pytań i `Smart Pruning` zgodnych z przygotowanym configiem.
2. Brak finalnego schematu odpowiedzi, notatek i storage modelu dla warstwy offline systemu pytań.
3. Brak szczegółowej specyfikacji walidacji dla wszystkich pól formularza Part 1.
4. Brak finalnych treści UX dla komunikatów błędów, limitów, ostrzeżeń i potwierdzeń.
5. Nieustalone zachowanie aplikacji przy pierwszej wizycie offline przed zainstalowaniem cache PWA.
6. Do osobnej sesji pozostaje decyzja o technologiach i stacku implementacyjnym.
{{/unresolved_issues}}
{{/conversation_summary}}