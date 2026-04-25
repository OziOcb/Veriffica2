# Dokument wymagań produktu (PRD) - Veriffica

## 1. Przegląd produktu

Veriffica to anglojęzyczna aplikacja PWA typu Offline-First, która prowadzi osoby bez doświadczenia mechanicznego przez inspekcję używanego samochodu przed zakupem. Produkt ma uprościć oględziny pojazdu, uporządkować proces podejmowania decyzji i ograniczyć ryzyko pominięcia ważnych usterek lub dokumentów.

Główne założenia produktu:

- Produkt jest skierowany do laików kupujących używany samochód.
- Główny język interfejsu MVP to English.
- Główny przepływ produktu składa się z: strony głównej, ekranu logowania i rejestracji, dashboardu, strony sesji, formularza Part 1, systemu pytań w Partach 2-5, strony Summary, profilu użytkownika i ustawień.
- Proces inspekcji jest podzielony na 5 części: `Part 1 - Info about the car`, `Part 2 - At a standstill`, `Part 3 - Starting the engine`, `Part 4 - Test drive`, `Part 5 - Documents`.
- Wynik inspekcji nie jest pojedynczą oceną jakości auta. Aplikacja prezentuje wyłącznie rozkład odpowiedzi `Yes / No / Don't know` dla każdej sekcji i dla całej inspekcji.
- Wszystkie pytania mają taką samą wagę. MVP nie zawiera wag usterek ani automatycznego systemu deal-breakerów.
- Produkt ma działać offline po wcześniejszym załadowaniu aplikacji, zapisywać dane lokalnie i synchronizować je po odzyskaniu połączenia.
- Użytkownik może mieć maksymalnie 2 inspekcje na koncie jednocześnie.

Docelowe doświadczenie użytkownika:

1. Użytkownik trafia na stronę główną, rejestruje konto lub loguje się przy użyciu adresu e-mail i hasła.
2. Po uwierzytelnieniu przechodzi na dashboard i rozpoczyna nową inspekcję albo wznawia istniejącą.
3. Przy rozpoczęciu nowej inspekcji widzi instrukcję korzystania z checklisty (tekst do instrukcji znajduje się w pliku `.ai/veriffica-instrukcja.md`).
4. Na stronie sesji wypełnia Part 1, co odblokowuje Parts 2-5.
5. Użytkownik przechodzi przez pełnoekranowe karty pytań, zapisuje odpowiedzi i opcjonalne notatki.
6. Po zakończeniu każdego Partu wraca na stronę sesji i sam wybiera kolejny etap.
7. Na stronie Summary przegląda wykresy, listę pytań i odpowiedzi, wprowadza ewentualne korekty i ręcznie finalizuje inspekcję.

## 2. Problem użytkownika

Zakup używanego samochodu przez osobę bez doświadczenia jest stresujący, chaotyczny i obarczony wysokim ryzykiem błędnej decyzji. Użytkownik nie wie:

- na co patrzeć podczas oględzin,
- które objawy są istotne,
- jak interpretować znalezione nieprawidłowości,
- jakie dokumenty zweryfikować,
- jak zapamiętać wszystkie obserwacje podczas wizyty u sprzedawcy.

Aktualne alternatywy, takie jak niestrukturalne notatki, przypadkowe porady z internetu lub pamięciowe sprawdzanie auta, nie rozwiązują problemu w wystarczający sposób, ponieważ:

- nie prowadzą użytkownika krok po kroku w naturalnej kolejności oględzin,
- nie dopasowują listy kontrolnej do typu pojazdu,
- nie wspierają działania offline w miejscu inspekcji,
- nie pomagają utrzymać spójnych notatek i odpowiedzi,
- nie dają prostego podsumowania gotowego do omówienia po zakończeniu oględzin.

Główny problem do rozwiązania można opisać następująco:

- Gdy laik ogląda używany samochód, chce otrzymać prosty, uporządkowany i dopasowany do pojazdu przewodnik krok po kroku, aby móc ocenić auto z większą pewnością i bez pomijania kluczowych punktów.
- Gdy użytkownik zauważa nieprawidłowość, chce dostać krótkie wyjaśnienie i możliwość zapisania notatki, aby później łatwo wrócić do obserwacji.
- Gdy połączenie internetowe jest słabe lub znika, użytkownik chce kontynuować inspekcję bez utraty danych i bez przymusowego wylogowania.

## 3. Wymagania funkcjonalne

### 3.1 Dostęp, konto i bezpieczeństwo

- FR-001. Aplikacja musi udostępniać publiczną stronę główną z opisem produktu i akcjami logowania/rejestracji.
- FR-002. Aplikacja musi umożliwiać rejestrację konta i logowanie przy użyciu adresu e-mail i hasła.
- FR-003. Po udanej rejestracji lub logowaniu użytkownik musi zostać przekierowany na dashboard.
- FR-004. Dashboard, strony sesji, Summary, profil i ustawienia muszą być dostępne wyłącznie dla uwierzytelnionego użytkownika.
- FR-005. Użytkownik może widzieć i modyfikować wyłącznie własne inspekcje, notatki i dane konta.
- FR-006. Profil użytkownika musi prezentować podstawowe informacje o koncie.
- FR-007. Aplikacja musi udostępniać stronę ustawień z co najmniej kontrolą rozmiaru czcionki i motywu wizualnego.
- FR-008. Domyślny motyw aplikacji musi podążać za ustawieniami systemowymi urządzenia użytkownika do momentu ewentualnego ręcznego nadpisania w ustawieniach.
- FR-009. Użytkownik musi mieć możliwość wylogowania się z aplikacji.
- FR-010. Użytkownik musi mieć możliwość trwałego usunięcia profilu i wszystkich swoich danych po dodatkowym potwierdzeniu operacji.

### 3.2 Dashboard i cykl życia inspekcji

- FR-011. Dashboard musi prezentować kafelki inspekcji w statusach `Draft` i `Completed`.
- FR-012. Jeśli użytkownik nie ma żadnych inspekcji, dashboard musi pokazywać pusty stan z krótką wiadomością i wyraźnym przyciskiem CTA do rozpoczęcia pierwszej inspekcji.
- FR-013. Na jednym koncie mogą istnieć maksymalnie 2 inspekcje jednocześnie, niezależnie od statusu.
- FR-014. Po osiągnięciu limitu 2 inspekcji aplikacja musi zablokować utworzenie kolejnej i pokazać pop-up informujący o wykorzystaniu limitu.
- FR-015. Rozpoczęcie nowej inspekcji musi utworzyć nową sesję w statusie `Draft`.
- FR-016. Przy każdym rozpoczęciu nowej inspekcji aplikacja musi wyświetlić instrukcję pochodzącą z pliku `.ai/veriffica-instrukcja.md` oraz umożliwić jej zamknięcie.
- FR-017. Pop-up z instrukcją musi mieć opcję `Don't show again`, która wyłącza wyświetlanie instrukcji przy kolejnych nowych inspekcjach dla tego użytkownika.
- FR-018. Nazwa kafelka sesji musi być budowana na podstawie pól `Make` i `Model` oraz opcjonalnie `Year of production` i `Registration number`, jeśli zostały poprawnie wypełnione, i aktualizować się natychmiast po zmianie tych pól w Part 1.
- FR-019. Użytkownik musi mieć możliwość otwarcia dowolnej istniejącej inspekcji z dashboardu i wznowienia pracy w dowolnym momencie.
- FR-020. Użytkownik musi mieć możliwość usunięcia inspekcji z dashboardu.
- FR-021. Usunięcie inspekcji musi być `Hard Delete`, natychmiastowe i nieodwracalne, wymagać potwierdzenia oraz zwalniać slot na nową inspekcję.

### 3.3 Strona sesji i Part 1

- FR-022. Strona sesji musi być centralnym ekranem danej inspekcji i pokazywać: nazwę sesji, przyciski prowadzące do Parts 1-5, bieżący `Total Score`, wskaźnik ukończenia inspekcji oraz globalny dokument notatek.
- FR-023. Strona sesji musi umożliwiać użytkownikowi samodzielny wybór kolejnego Partu po powrocie z poprzedniego etapu.
- FR-024. Part 1 musi zawierać pola: `Price`, `Make`, `Model`, `Year of production`, `Registration number`, `VIN number`, `Mileage`, `Fuel type`, `Transmission`, `Drive`, `Color`, `Body type`, `No of doors`, `Address`, `Notes`.
- FR-025. Pola `Make`, `Model`, `Fuel type`, `Transmission`, `Drive` i `Body type` są obowiązkowe.
- FR-026. Pola `Price`, `Year of production`, `Registration number`, `VIN number`, `Mileage`, `Color`, `No of doors`, `Address` i `Notes` są opcjonalne, ale jeśli zostaną wypełnione, muszą przejść pełną walidację.
- FR-027. Walidacja Part 1 musi być ścisła i zgodna z poniższymi regułami:
- FR-028. `Price`: opcjonalne pole dziesiętne z wartością od `0` do `10000000` i maksymalnie 2 miejscami po przecinku.
- FR-029. `Make`: wymagane, po przycięciu od 1 do 50 znaków.
- FR-030. `Model`: wymagane, po przycięciu od 1 do 60 znaków.
- FR-031. `Year of production`: opcjonalne, ale jeśli podane, musi zawierać dokładnie 4 cyfry i wartość od `1886` do `current year + 1`.
- FR-032. `Registration number`: opcjonalne, ale jeśli podane, musi po normalizacji zawierać od 2 do 15 znaków; dopuszczalne są litery, cyfry, spacje i myślnik.
- FR-033. `VIN number`: opcjonalne, ale jeśli podane, musi zawierać dokładnie 17 znaków i spełniać regex `^[A-HJ-NPR-Z0-9]{17}$`.
- FR-034. `Mileage`: opcjonalne, ale jeśli podane, musi być liczbą całkowitą od `0` do `9999999`.
- FR-035. `Fuel type`: wymagane, jedna z wartości `Petrol`, `Diesel`, `Hybrid`, `Electric`.
- FR-036. `Transmission`: wymagane, jedna z wartości `Manual`, `Automatic`.
- FR-037. `Drive`: wymagane, jedna z wartości `2WD`, `4WD`.
- FR-038. `Color`: opcjonalne, po przycięciu od 1 do 40 znaków.
- FR-039. `Body type`: wymagane, jedna z wartości `Sedan`, `Hatchback`, `SUV`, `Coupe`, `Convertible`, `Van`, `Pickup`, `Other`.
- FR-040. `No of doors`: opcjonalne, ale jeśli podane, musi być liczbą całkowitą od 1 do 9.
- FR-041. `Address`: opcjonalne, po przycięciu od 5 do 150 znaków.
- FR-042. `Notes`: opcjonalne, maksymalnie 1000 znaków.
- FR-043. Przed zapisem aplikacja musi normalizować dane Part 1 bez zmiany znaczenia wpisu, w szczególności przez przycięcie spacji, zamianę wybranych pól na uppercase lub wartości enum oraz ujednolicenie wielokrotnych spacji.
- FR-044. Walidacja Part 1 musi działać w następujących momentach: miękkie podpowiedzi podczas wpisywania, walidacja inline po opuszczeniu pola, pełna blokująca walidacja podczas próby opuszczenia Part 1 lub zapisu.
- FR-045. W przypadku błędu formularza aplikacja musi pokazać komunikat pod nieprawidłowym polem, przewinąć do pierwszego błędnego pola i ustawić na nim fokus.
- FR-046. Komunikaty walidacyjne muszą być napisane prostym językiem angielskim.
- FR-047. Walidacja między polami musi blokować zapis konfiguracji `fuelType = Electric` oraz `transmission != Automatic` i wyświetlać komunikat `Electric cars must use Automatic transmission.`.
- FR-048. Parts 2-5 muszą być nieaktywne, dopóki wszystkie wymagane pola Part 1, czyli `Make`, `Model`, `Fuel type`, `Transmission`, `Drive` i `Body type`, nie są poprawne.
- FR-049. Po poprawnym zapisie Part 1 aplikacja musi zapisać znormalizowane dane lokalnie, odblokować Parts 2-5 i zaktualizować nazwę sesji.

### 3.4 System pytań w Partach 2-5

- FR-050. System pytań musi być znormalizowany do trzech warstw danych: `questionGroups` dla widoczności i logiki warunkowej, `questions` dla treści pytań oraz `explanations` dla treści edukacyjnych; warstwa danych musi być utrzymywana jako spójny pakiet artefaktów źródłowych, kontraktu typów i schematów walidacyjnych.
- FR-051. `questionGroups` nie mogą przechowywać pytań wewnątrz siebie; pytania muszą być linkowane przez stabilne `groupId`.
- FR-052. Treści edukacyjne muszą być linkowane do pytań przez stabilne `explanationRef`.
- FR-053. Każde pytanie i każda grupa muszą mieć stabilny identyfikator oraz pole `order`, którego wartości rosną co 10, aby umożliwić późniejsze rozszerzenia bez renumeracji całego banku pytań.
- FR-054. Widoczność grup pytań musi być modelowana addytywnie według formuły `Base + fuelType + transmission + drive + bodyType`, a runtime flags mogą być używane wyłącznie dla wyjątków nieinferowalnych z obowiązkowych pól Part 1. Aktualny zestaw runtime flags to: `chargingPortEquipped`, `evBatteryDocsAvailable`, `turboEquipped`, `mechanicalCompressorEquipped`, `importedFromEU`.
- FR-055. Aplikacja musi zawsze pokazywać bazowe grupy pytań dla nadwozia, śladów napraw, struktury komory silnika, przedniego zawieszenia, opon, wnętrza, układu kierowniczego na postoju i po uruchomieniu silnika, reakcji zawieszenia, reakcji układu kierowniczego, innych zjawisk podczas jazdy, hamulców, numerów VIN oraz bazowych dokumentów: `Service booklet`, `Registration certificate` i `Vehicle card`.
- FR-056. Dla `Petrol` aplikacja musi pokazywać wspólne grupy dla aut spalinowych, pytania o świece zapłonowe, pytania o czarny dym z silnika benzynowego oraz grupy zależne od `turboEquipped` i `mechanicalCompressorEquipped`, jeśli odpowiednie flagi są aktywne.
- FR-057. Dla `Diesel` aplikacja musi pokazywać wspólne grupy dla aut spalinowych, sekcje `diesel-only` w Part 2-4 oraz opcjonalne grupy zależne od `turboEquipped` i `mechanicalCompressorEquipped`; nie może pokazywać pytań o świece zapłonowe ani sekcji czarnego dymu z silnika benzynowego.
- FR-058. Jedna grupa pytań może należeć do wielu addytywnych bucketów w ramach osi `fuelType`, jeśli ta sama logika i treść pytania są poprawne dla więcej niż jednego wariantu paliwa, na przykład wspólnie dla `Petrol`, `Diesel` i `Hybrid`.
- FR-059. Dla `Hybrid` aplikacja musi pokazywać grupy bazowe, wspólne grupy dla aut spalinowych, pytania o świece zapłonowe, pytania o czarny dym z silnika benzynowego, sekcje `high-voltage` oraz sekcje zależne od `chargingPortEquipped`, `evBatteryDocsAvailable`, `turboEquipped` i `mechanicalCompressorEquipped`, gdy odpowiednie flagi są aktywne.
- FR-060. Dla `Electric` aplikacja musi ukrywać grupy zależne od oleju silnikowego, wydechu, świec zapłonowych, rozruchu silnika spalinowego, sprzęgła i spalania paliwa oraz pokazywać sekcje `high-voltage`, `power-up`, `drive behavior` oraz sekcje zależne od `chargingPortEquipped` i `evBatteryDocsAvailable`, gdy odpowiednie flagi są aktywne.
- FR-061. Dla `Manual` aplikacja musi pokazywać pytania o sprzęgło i zachowanie manualnej skrzyni oraz ukrywać pytania automatic-only.
- FR-062. Dla `Automatic` aplikacja musi ukrywać pytania o ruszanie z trzeciego biegu i pytania clutch-specific oraz pokazywać pytania automatic-only.
- FR-063. Dla `2WD` aplikacja nie może dodawać żadnych dodatkowych grup drive-specific i musi ukrywać pytania `4WD-only`.
- FR-064. Dla `4WD` aplikacja musi pokazywać bazowe pytania jezdne oraz dodatkowe pytania o układ 4WD.
- FR-065. Dla `SUV`, `Convertible`, `Van` i `Pickup` aplikacja musi pokazywać dodatkowe grupy pytań związane z odpowiednim typem nadwozia; dla `Sedan`, `Hatchback`, `Coupe` i `Other` aktualny bank pytań nie definiuje dodatkowych grup nadwoziowych.
- FR-066. Parts 2-5 muszą działać jako pełnoekranowe karty pytań zajmujące całą dostępną wysokość ekranu poza stałymi elementami layoutu.
- FR-067. Na ekranie może być widoczne tylko jedno pytanie jednocześnie.
- FR-068. Nawigacja między kartami pytań musi odbywać się poziomo lewo-prawo.
- FR-069. Próba przejścia do następnej karty bez wybranej odpowiedzi musi być blokowana i wsparta czytelnym zachowaniem walidacyjnym w UX.
- FR-070. Każde pytanie musi oferować trzy odpowiedzi: `Yes`, `No`, `Don't know`.
- FR-071. Cofanie musi być możliwe zarówno gestem, jak i przez widoczny przycisk `Back`.
- FR-072. Zapisana odpowiedź musi pozostać widoczna po powrocie do wcześniejszej karty.
- FR-073. Każda karta pytania, która posiada `explanationRef`, musi wyświetlać ikonę `i`, a kliknięcie ikony musi otwierać edukacyjny pop-up.
- FR-074. Każda karta pytania musi wyświetlać ikonę `Notes`, która otwiera pop-up do zapisania notatki kontekstowej.
- FR-075. Limit pojedynczej notatki kontekstowej wynosi 500 znaków.
- FR-076. Po zapisaniu notatki kontekstowej aplikacja musi dopisać ją do jednego globalnego, edytowalnego dokumentu notatek na stronie sesji wraz z treścią oryginalnego pytania jako nagłówkiem.
- FR-077. Limit globalnego dokumentu notatek wynosi 10000 znaków.
- FR-078. Po zakończeniu każdego Partu aplikacja musi pokazać ekran przejściowy z komunikatem o zakończeniu Partu oraz przyciskiem `OK`, który odsyła użytkownika na stronę sesji.
- FR-079. Zmiana pól `fuelType`, `transmission`, `drive`, `bodyType` lub aktywnej runtime flag wpływającej na widoczność po udzieleniu odpowiedzi musi uruchamiać `Smart Pruning`.
- FR-080. `Smart Pruning` musi ostrzec użytkownika o usunięciu odpowiedzi, zachować tylko odpowiedzi powiązane z grupami nadal widocznymi po przeliczeniu konfiguracji, usunąć odpowiedzi osierocone i natychmiast przeliczyć postęp oraz `Total Score`.

### 3.5 Summary, wynik i finalizacja inspekcji

- FR-081. Strona sesji musi na bieżąco pokazywać wskaźnik ukończenia inspekcji oraz `Total Score`.
- FR-082. `Total Score` oraz wyniki sekcji muszą być prezentowane wyłącznie jako prosty rozkład `Yes / No / Don't know`, bez pojedynczej oceny jakości auta.
- FR-083. Strona `Summary` musi zawierać wykres dla każdego Partu oraz globalny wykres odpowiedzi dla całej inspekcji.
- FR-084. Na stronie `Summary` musi być widoczna pełna lista pytań i odpowiedzi dla aktualnie obowiązującego zestawu pytań.
- FR-085. Lista pytań i odpowiedzi na `Summary` musi być edytowalna bez wracania do widoku kart.
- FR-086. Zmiana odpowiedzi na `Summary` musi natychmiast aktualizować wykresy, postęp i `Total Score`.
- FR-087. Status `Completed` nie może być nadawany automatycznie po przejściu wszystkich Partów.
- FR-088. Użytkownik musi ręcznie zakończyć inspekcję wyraźnym przyciskiem finalizacji na stronie `Summary`.
- FR-089. Po ręcznej finalizacji status kafelka na dashboardzie musi zmienić się na `Completed`.
- FR-090. Inspekcja ukończona musi domyślnie otwierać się w trybie zamkniętego raportu, który ogranicza przypadkową edycję.
- FR-091. Powrót do edycji ukończonej inspekcji musi wymagać świadomej akcji użytkownika i potwierdzenia.
- FR-092. Po ponownym wejściu w edycję ukończonej inspekcji status ma wrócić do `Draft`, a użytkownik musi ponownie ręcznie zakończyć inspekcję, aby odzyskać status `Completed`.

### 3.6 Offline-First, zapis lokalny i synchronizacja

- FR-093. MVP musi działać w modelu `Offline-First` jako PWA.
- FR-094. Głównym mechanizmem lokalnego przechowywania danych domenowych musi być `IndexedDB`, a nie `Local Storage`.
- FR-095. Aplikacja musi zapisywać lokalnie co najmniej: dane Part 1, odpowiedzi, notatki kontekstowe, globalny dokument notatek, status sesji, postęp i kolejkę zmian.
- FR-096. Zmiany wprowadzone offline muszą trafiać do lokalnej kolejki zmian i czekać na synchronizację po odzyskaniu połączenia.
- FR-097. Po odzyskaniu połączenia aplikacja musi automatycznie wznowić synchronizację w tle.
- FR-098. Strategia rozwiązywania konfliktów danych w MVP musi być oparta na `Last Write Wins / Client Wins`.
- FR-099. Jeśli sesja użytkownika wygaśnie podczas pracy offline, aplikacja nie może go wylogować ani przerwać trwającej inspekcji.
- FR-100. Odnowienie sesji uwierzytelniającej musi nastąpić po odzyskaniu połączenia, bez utraty lokalnego stanu inspekcji.
- FR-101. Proste akcje systemowe, takie jak zapis notatki lub usunięcie inspekcji, mogą być potwierdzane lekkimi powiadomieniami typu toast/snackbar.

## 4. Granice produktu

### 4.1 W zakresie MVP

- Webowa aplikacja PWA działająca na urządzeniach mobilnych i desktopowych.
- Angielski jako jedyny język interfejsu w MVP.
- Rejestracja i logowanie przy użyciu adresu e-mail i hasła.
- Maksymalnie 2 inspekcje na konto.
- Jeden globalny dokument notatek na sesję.
- Dynamiczny system pytań oparty o model addytywny `Base + fuelType + transmission + drive + bodyType` oraz ograniczony zestaw runtime flags dla wyjątków.
- Manualne zakończenie inspekcji przez użytkownika.
- Wynik w formie rozkładu odpowiedzi `Yes / No / Don't know` dla sekcji i całości.
- Tryb offline po wcześniejszym załadowaniu aplikacji oraz późniejsza synchronizacja kolejki zmian.

### 4.2 Poza zakresem MVP

- Dodatkowe języki interfejsu.
- Robienie zdjęć, upload zdjęć lub galerie dla inspekcji.
- Eksport PDF.
- Udostępnianie raportu linkiem.
- Zewnętrzna weryfikacja VIN.
- Natywne aplikacje na iOS i Android.
- Porównywarka wielu raportów.
- System automatycznej dyskwalifikacji auta lub deal-breakerów.
- Wagi usterek i algorytm ważonego scoringu.
- Narzędzia typu Sentry, LogRocket lub rozbudowany monitoring błędów w pierwszej fazie MVP.

### 4.3 Ograniczenia i decyzje brzegowe

- PRD nie narzuca konkretnego stacku technologicznego; decyzja implementacyjna pozostaje poza zakresem tego dokumentu.
- Model danych systemu pytań musi opierać się na stabilnych identyfikatorach, a nie na tekstach pytań.
- Źródłem prawdy dla checklisty MVP jest pakiet artefaktów w `.ai/veriffica-questions-list/`: `list-of-questions.md`, `question-mapping-config.json`, `question-bank.json`, `question-mapping.types.ts` oraz odpowiadające im JSON Schemas.
- Treść instrukcji startowej dla nowej inspekcji pochodzi z pliku `.ai/veriffica-instrukcja.md`.
- Zestaw enumów i widoczności pytań musi pozostawać zsynchronizowany z aktualnym kontraktem danych oraz bankiem pytań MVP.
- Pierwsza wizyta użytkownika całkowicie offline, bez wcześniejszego pobrania zasobów PWA, nie jest gwarantowanym scenariuszem MVP i wymaga wsparcia cache po pierwszym wejściu online.
- Produkt nie ma zastępować profesjonalnego przeglądu technicznego; instrukcja startowa musi jasno komunikować, że checklistę należy traktować jako narzędzie pomocnicze.

## 5. Historyjki użytkowników

### US-001

ID: US-001

Tytuł: Zobaczenie strony głównej i wejście do rejestracji/logowania

Opis: Jako potencjalny użytkownik chcę zobaczyć publiczną stronę główną z jasnym opisem wartości produktu i możliwością rozpoczęcia rejestracji lub logowania, abym mógł szybko zacząć korzystać z aplikacji.

Kryteria akceptacji:

- Niezalogowany użytkownik widzi publiczną stronę główną.
- Strona główna wyjaśnia, że aplikacja prowadzi przez 5-częściową inspekcję używanego samochodu.
- Strona główna zawiera wyraźne akcje logowania lub rejestracji.
- Wybranie akcji logowania lub rejestracji prowadzi użytkownika do formularza uwierzytelniania opartego na adresie e-mail i haśle.

### US-002

ID: US-002

Tytuł: Rejestracja i logowanie przy użyciu adresu e-mail i hasła

Opis: Jako nowy lub powracający użytkownik chcę zarejestrować konto lub zalogować się przy użyciu adresu e-mail i hasła, aby bezpiecznie uzyskać dostęp do swoich inspekcji.

Kryteria akceptacji:

- Użytkownik może założyć konto przy użyciu adresu e-mail i hasła.
- Użytkownik może zalogować się przy użyciu adresu e-mail i hasła.
- Po udanej rejestracji lub logowaniu użytkownik trafia na dashboard.
- Po nieudanej rejestracji lub logowaniu użytkownik pozostaje poza strefą chronioną i dostaje czytelny komunikat o błędzie.
- Po odświeżeniu strony aktywna sesja użytkownika pozostaje zachowana do momentu wylogowania lub usunięcia konta.

### US-003

ID: US-003

Tytuł: Dostęp tylko do własnych danych

Opis: Jako uwierzytelniony użytkownik chcę mieć dostęp wyłącznie do swoich danych i chronionych ekranów, aby moje inspekcje były bezpieczne.

Kryteria akceptacji:

- Użytkownik niezalogowany nie może otworzyć dashboardu, stron sesji, Summary, profilu ani ustawień.
- Próba wejścia na chronioną trasę bez sesji kończy się przekierowaniem do logowania lub strony głównej.
- Użytkownik widzi wyłącznie własne inspekcje i notatki.
- Próba uzyskania dostępu do zasobu innego użytkownika jest blokowana.

### US-004

ID: US-004

Tytuł: Zarządzanie profilem, ustawieniami i wylogowaniem

Opis: Jako zalogowany użytkownik chcę zobaczyć profil, ustawić preferencje aplikacji i wylogować się, aby kontrolować swoje konto oraz sposób korzystania z produktu.

Kryteria akceptacji:

- Użytkownik może otworzyć ekran profilu z podstawowymi danymi konta.
- Użytkownik może otworzyć ekran ustawień z opcjami co najmniej rozmiaru czcionki i motywu.
- Przy pierwszym użyciu motyw aplikacji podąża za ustawieniem systemowym urządzenia.
- Użytkownik może ręcznie zmienić motyw i rozmiar czcionki.
- Użytkownik może się wylogować i po wylogowaniu traci dostęp do chronionych ekranów.

### US-005

ID: US-005

Tytuł: Trwałe usunięcie konta i danych

Opis: Jako użytkownik chcę móc usunąć swoje konto i wszystkie dane, aby zachować pełną kontrolę nad prywatnością.

Kryteria akceptacji:

- Na koncie dostępna jest akcja usunięcia profilu.
- Operacja wymaga dodatkowego potwierdzenia.
- Usunięcie konta usuwa wszystkie inspekcje i dane użytkownika w sposób nieodwracalny.
- Po usunięciu konta użytkownik zostaje wylogowany.

### US-006

ID: US-006

Tytuł: Zobaczenie pustego dashboardu

Opis: Jako nowy użytkownik chcę zobaczyć pusty dashboard z zachętą do rozpoczęcia pierwszej inspekcji, aby od razu wiedzieć, co zrobić dalej.

Kryteria akceptacji:

- Jeśli użytkownik nie ma żadnych inspekcji, dashboard nie pokazuje pustej listy kafelków.
- Dashboard wyświetla krótką wiadomość zachęcającą do rozpoczęcia pierwszej inspekcji.
- Dashboard wyświetla wyraźny przycisk CTA do utworzenia nowej inspekcji.
- Kliknięcie CTA rozpoczyna przepływ tworzenia nowej inspekcji, o ile limit nie został osiągnięty.

### US-007

ID: US-007

Tytuł: Przegląd istniejących inspekcji na dashboardzie

Opis: Jako użytkownik chcę widzieć wszystkie swoje inspekcje w postaci kafelków, aby szybko wznowić pracę lub otworzyć gotowy raport.

Kryteria akceptacji:

- Dashboard pokazuje osobny kafelek dla każdej inspekcji użytkownika.
- Każdy kafelek pokazuje status `Draft` albo `Completed`.
- Nazwa kafelka korzysta z pól `Make` i `Model` oraz opcjonalnie `Year of production` i `Registration number`, jeśli są dostępne i poprawne.
- Po zmianie tych pól w Part 1 nazwa kafelka aktualizuje się natychmiast.
- Kliknięcie kafelka otwiera odpowiednią stronę sesji.

### US-008

ID: US-008

Tytuł: Rozpoczęcie nowej inspekcji z instrukcją

Opis: Jako użytkownik chcę przy rozpoczęciu nowej inspekcji zobaczyć instrukcję korzystania z checklisty, aby zrozumieć, jak interpretować odpowiedzi i dokumenty.

Kryteria akceptacji:

- Rozpoczęcie nowej inspekcji tworzy sesję w statusie `Draft`.
- Po rozpoczęciu nowej inspekcji pojawia się pop-up z instrukcją.
- Pop-up zawiera treść z pliku `.ai/veriffica-instrukcja.md`, opisującą cel checklisty, podział na sekcje i znaczenie odpowiedzi.
- Zamknięcie pop-upu przenosi użytkownika do strony sesji nowej inspekcji.

### US-009

ID: US-009

Tytuł: Wyłączenie instrukcji przy kolejnych inspekcjach

Opis: Jako użytkownik chcę móc wyłączyć ponowne wyświetlanie instrukcji startowej, aby nie oglądać tego samego komunikatu przy każdej nowej inspekcji.

Kryteria akceptacji:

- Pop-up instrukcji zawiera opcję `Don't show again`.
- Zaznaczenie tej opcji powoduje, że przy kolejnych nowych inspekcjach instrukcja nie jest pokazywana.
- Preferencja zachowuje się po ponownym uruchomieniu aplikacji i ponownym zalogowaniu.
- Jeśli opcja nie została zaznaczona, instrukcja nadal pojawia się przy każdej nowej inspekcji.

### US-010

ID: US-010

Tytuł: Ograniczenie do 2 inspekcji na konto

Opis: Jako użytkownik chcę otrzymać jasną informację o limicie aktywnych inspekcji, aby rozumieć, dlaczego nie mogę utworzyć kolejnej sesji.

Kryteria akceptacji:

- Jeśli na koncie istnieją już 2 inspekcje, utworzenie trzeciej jest blokowane.
- Przy próbie utworzenia trzeciej inspekcji pojawia się pop-up wyjaśniający limit.
- Po usunięciu jednej inspekcji użytkownik może ponownie utworzyć nową sesję.
- Limit obejmuje inspekcje w statusie `Draft` i `Completed`.

### US-011

ID: US-011

Tytuł: Nieodwracalne usunięcie inspekcji

Opis: Jako użytkownik chcę móc usunąć niepotrzebną inspekcję, aby zwolnić miejsce na nową i utrzymać porządek na dashboardzie.

Kryteria akceptacji:

- Z poziomu dashboardu dostępna jest akcja usunięcia inspekcji.
- Operacja wymaga wyraźnego potwierdzenia.
- Po potwierdzeniu inspekcja znika natychmiast i nie da się jej przywrócić.
- Usunięcie inspekcji zwalnia slot na nową sesję.
- Po udanym usunięciu użytkownik dostaje lekkie potwierdzenie systemowe.

### US-012

ID: US-012

Tytuł: Otworzenie i wznowienie strony sesji

Opis: Jako użytkownik chcę wejść do wybranej inspekcji i zobaczyć jej centralny ekran, aby móc kontynuować pracę od dowolnego miejsca.

Kryteria akceptacji:

- Strona sesji pokazuje nazwę sesji, przyciski Parts 1-5, postęp, `Total Score` i globalny dokument notatek.
- Użytkownik może wejść do zapisanej inspekcji z dashboardu w dowolnym momencie.
- Po wznowieniu widoczne są wcześniej zapisane odpowiedzi i notatki.
- Stan ukończenia poszczególnych Partów jest zgodny z zapisanym postępem inspekcji.

### US-013

ID: US-013

Tytuł: Wypełnienie Part 1 ze ścisłą walidacją

Opis: Jako użytkownik chcę wypełnić konfigurację auta w Part 1 i dostać precyzyjne komunikaty walidacyjne, aby poprawnie skonfigurować dalszą checklistę.

Kryteria akceptacji:

- Part 1 zawiera wszystkie zdefiniowane pola formularza.
- Jako obowiązkowe oznaczone są wyłącznie pola `Make`, `Model`, `Fuel type`, `Transmission`, `Drive` i `Body type`.
- Pola obowiązkowe nie pozwalają na poprawny zapis, jeśli są puste lub nieprawidłowe.
- Pola opcjonalne mogą zostać puste, ale jeśli są wypełnione, muszą spełnić swoje reguły walidacyjne.
- Błędy pojawiają się pod odpowiednimi polami prostym językiem angielskim.
- Przy próbie zapisu z błędami formularz przewija do pierwszego błędnego pola i ustawia na nim fokus.
- Konfiguracja `Electric` oraz `Manual` jest blokowana komunikatem `Electric cars must use Automatic transmission.`.

### US-014

ID: US-014

Tytuł: Odblokowanie Parts 2-5 dopiero po poprawnym Part 1

Opis: Jako użytkownik chcę, aby dalsze części inspekcji odblokowywały się dopiero po poprawnym uzupełnieniu Part 1, aby uniknąć błędnego zestawu pytań.

Kryteria akceptacji:

- Przyciski prowadzące do Parts 2-5 są nieaktywne, dopóki pola `Make`, `Model`, `Fuel type`, `Transmission`, `Drive` i `Body type` nie są poprawne.
- Po poprawnym zapisie wymaganych pól przyciski do Parts 2-5 odblokowują się bez potrzeby odświeżania strony.
- Jeśli późniejsza zmiana w Part 1 unieważni wymagane dane, Parts 2-5 ponownie stają się zablokowane.
- Stan blokady jest spójny na stronie sesji i po wznowieniu inspekcji.

### US-015

ID: US-015

Tytuł: Natychmiastowa aktualizacja tytułu sesji

Opis: Jako użytkownik chcę, aby tytuł sesji od razu odzwierciedlał wpisane dane auta, abym mógł łatwo rozpoznać raport na dashboardzie.

Kryteria akceptacji:

- Po zmianie poprawnych wartości pól `Make`, `Model`, `Year of production` lub `Registration number` tytuł sesji aktualizuje się natychmiast.
- Zmiana jest widoczna zarówno na stronie sesji, jak i na dashboardzie.
- Tytuł korzysta z wartości znormalizowanych przed zapisem.
- Jeśli `Year of production` lub `Registration number` nie są wypełnione albo są nieprawidłowe, nie są dodawane do tytułu sesji.

### US-016

ID: US-016

Tytuł: Otrzymanie zestawu pytań dopasowanego do samochodu

Opis: Jako użytkownik chcę widzieć tylko pytania właściwe dla mojego auta, aby inspekcja była trafna i krótsza.

Kryteria akceptacji:

- Widoczność grup pytań zależy od addytywnej formuły `Base + fuelType + transmission + drive + bodyType` oraz runtime flags `chargingPortEquipped`, `evBatteryDocsAvailable`, `turboEquipped`, `mechanicalCompressorEquipped`, `importedFromEU`.
- Pytania bazowe są widoczne dla wszystkich odpowiednich inspekcji.
- Pytania specyficzne dla `Petrol`, `Diesel`, `Hybrid`, `Electric`, `Manual`, `Automatic`, `4WD`, `Convertible`, `SUV`, `Van`, `Pickup` oraz dokumentów dla aut importowanych z UE pojawiają się wyłącznie wtedy, gdy są zasadne.
- Grupy zależne od wyposażenia lub dokumentów runtime-only pojawiają się tylko wtedy, gdy odpowiednia flaga ma wartość prawda.
- Jedna grupa pytań może być współdzielona przez wiele wariantów paliwa, jeśli logika widoczności i treść pozostają takie same.
- System opiera się na stabilnych identyfikatorach grup, pytań i wyjaśnień, a nie na tekście pytań.

### US-017

ID: US-017

Tytuł: Bezpieczne przycinanie odpowiedzi po zmianie konfiguracji auta

Opis: Jako użytkownik chcę, aby po zmianie kluczowych parametrów auta lub flag wpływających na widoczność aplikacja zachowała nadal poprawne odpowiedzi i usunęła tylko osierocone dane, abym nie stracił więcej informacji niż to konieczne.

Kryteria akceptacji:

- Zmiana `fuelType`, `transmission`, `drive`, `bodyType` albo runtime flag używanych do widoczności po udzieleniu odpowiedzi uruchamia `Smart Pruning`.
- Przed zastosowaniem `Smart Pruning` użytkownik otrzymuje ostrzeżenie, że część odpowiedzi może zostać usunięta.
- Odpowiedzi nadal zgodne z nową konfiguracją pozostają zachowane.
- Odpowiedzi należące do ukrytych grup są usuwane.
- Po zakończeniu operacji postęp i `Total Score` są przeliczane natychmiast.

### US-018

ID: US-018

Tytuł: Odpowiadanie na pytania na pełnoekranowych kartach

Opis: Jako użytkownik chcę przechodzić przez pytania jedno po drugim na pełnym ekranie, aby zachować skupienie podczas inspekcji.

Kryteria akceptacji:

- W danym momencie na ekranie widoczne jest jedno pytanie.
- Karta pytania zajmuje całą dostępną wysokość ekranu poza stałymi elementami layoutu.
- Użytkownik może wybrać odpowiedź `Yes`, `No` albo `Don't know`.
- Przycisk przejścia dalej jest blokowany do czasu wybrania jednej odpowiedzi.
- Po powrocie do wcześniej odwiedzonej karty poprzednio zapisana odpowiedź jest nadal widoczna.

### US-019

ID: US-019

Tytuł: Nawigacja wstecz w trakcie pytania

Opis: Jako użytkownik chcę mieć możliwość cofnięcia się do poprzedniego pytania gestem lub przyciskiem, aby poprawiać odpowiedzi bez gubienia kontekstu.

Kryteria akceptacji:

- Na każdej karcie pytania dostępny jest widoczny przycisk `Back`.
- Użytkownik może wrócić do poprzedniej karty także gestem.
- Cofnięcie nie usuwa wcześniej zapisanej odpowiedzi.
- Po cofnięciu użytkownik wraca dokładnie do poprzedniego pytania w tym samym Part.

### US-020

ID: US-020

Tytuł: Otwieranie edukacyjnego wyjaśnienia do pytania

Opis: Jako użytkownik chcę otworzyć krótkie wyjaśnienie pod ikoną `i`, aby lepiej zrozumieć znaczenie danego objawu lub usterki.

Kryteria akceptacji:

- Ikona `i` jest widoczna tylko przy pytaniach posiadających powiązane wyjaśnienie.
- Kliknięcie ikony `i` otwiera pop-up z treścią edukacyjną.
- Zamknięcie pop-upu przywraca użytkownika do tej samej karty bez utraty odpowiedzi.
- Treść wyjaśnienia jest pobierana ze słownika `explanations`.

### US-021

ID: US-021

Tytuł: Dodanie notatki kontekstowej z karty pytania

Opis: Jako użytkownik chcę zapisać notatkę do konkretnego pytania, aby odnotować szczegóły obserwacji przy samochodzie.

Kryteria akceptacji:

- Każda karta pytania ma ikonę `Notes`.
- Kliknięcie ikony otwiera pop-up do wpisania notatki.
- Pojedyncza notatka kontekstowa ma limit 500 znaków.
- Po zapisaniu notatka zostaje dopisana do globalnego dokumentu notatek razem z nagłówkiem zawierającym treść pytania.
- Po zapisaniu użytkownik otrzymuje lekkie potwierdzenie systemowe.

### US-022

ID: US-022

Tytuł: Zarządzanie globalnym dokumentem notatek

Opis: Jako użytkownik chcę mieć jeden wspólny dokument notatek dla całej sesji, aby zebrać wszystkie obserwacje w jednym miejscu.

Kryteria akceptacji:

- Strona sesji zawiera jeden globalny, edytowalny dokument notatek.
- Notatki zapisane z poziomu kart pytań pojawiają się w tym dokumencie.
- Użytkownik może samodzielnie edytować treść dokumentu.
- Limit całego dokumentu wynosi 10000 znaków.
- Dokument notatek pozostaje dostępny po wznowieniu sesji i podczas pracy offline.

### US-023

ID: US-023

Tytuł: Zakończenie Partu i powrót do strony sesji

Opis: Jako użytkownik chcę po ukończeniu danego Partu zobaczyć wyraźne potwierdzenie zakończenia etapu i wrócić na stronę sesji, aby samodzielnie wybrać kolejny krok.

Kryteria akceptacji:

- Po odpowiedzi na ostatnie pytanie w danym Part pojawia się ekran przejściowy.
- Ekran informuje, że dany Part został ukończony.
- Ekran zawiera przycisk `OK`.
- Kliknięcie `OK` odsyła użytkownika z powrotem na stronę sesji.

### US-024

ID: US-024

Tytuł: Podgląd postępu i wyniku na stronie sesji

Opis: Jako użytkownik chcę na bieżąco widzieć postęp inspekcji i rozkład odpowiedzi, aby wiedzieć, ile pracy zostało i jaki jest aktualny obraz auta.

Kryteria akceptacji:

- Strona sesji pokazuje bieżący postęp inspekcji.
- Strona sesji pokazuje `Total Score` w formie rozkładu `Yes / No / Don't know`.
- Zmiana odpowiedzi, edycja na Summary albo `Smart Pruning` aktualizują postęp i wynik natychmiast.
- Interfejs nie prezentuje pojedynczej zbiorczej oceny jakości auta.

### US-025

ID: US-025

Tytuł: Przegląd strony Summary

Opis: Jako użytkownik chcę zobaczyć podsumowanie całej inspekcji, aby ocenić wyniki sekcji i przejrzeć wszystkie odpowiedzi przed finalizacją.

Kryteria akceptacji:

- Strona `Summary` zawiera wykres dla każdego Partu.
- Strona `Summary` zawiera globalny wykres odpowiedzi dla całej inspekcji.
- Każdy wykres pokazuje wyłącznie proporcje `Yes / No / Don't know`.
- Strona `Summary` pokazuje pełną listę pytań i odpowiedzi dla aktualnego zestawu pytań inspekcji.

### US-026

ID: US-026

Tytuł: Edycja odpowiedzi bezpośrednio na Summary

Opis: Jako użytkownik chcę poprawić odpowiedź bez wracania do widoku kart, aby szybciej skorygować raport przed zakończeniem.

Kryteria akceptacji:

- Każda pozycja listy odpowiedzi na `Summary` może zostać edytowana inline.
- Zmiana odpowiedzi nie wymaga otwierania odpowiedniego Partu.
- Po zmianie odpowiedzi wykresy, postęp i `Total Score` aktualizują się natychmiast.
- Zmieniona odpowiedź zostaje zapisana lokalnie i w razie potrzeby trafia do kolejki synchronizacji.

### US-027

ID: US-027

Tytuł: Ręczne zakończenie inspekcji

Opis: Jako użytkownik chcę samodzielnie zdecydować, kiedy raport jest gotowy, aby uniknąć przypadkowego oznaczenia niepełnej inspekcji jako ukończonej.

Kryteria akceptacji:

- Inspekcja pozostaje w statusie `Draft`, dopóki użytkownik nie użyje wyraźnego przycisku finalizacji na stronie `Summary`.
- Przycisk finalizacji jest dostępny dopiero na stronie `Summary`.
- Po finalizacji status inspekcji zmienia się na `Completed`.
- Dashboard odzwierciedla zmianę statusu bez potrzeby ręcznego odświeżania.

### US-028

ID: US-028

Tytuł: Świadomy powrót do edycji ukończonego raportu

Opis: Jako użytkownik chcę otwierać ukończony raport w trybie bezpiecznym i wracać do edycji tylko świadomie, aby nie nadpisać finalnej wersji przez pomyłkę.

Kryteria akceptacji:

- Inspekcja ze statusem `Completed` otwiera się domyślnie w trybie zamkniętego raportu.
- Aby rozpocząć edycję, użytkownik musi użyć osobnej akcji `Edit report` lub równoważnej.
- Powrót do edycji wymaga potwierdzenia.
- Po wejściu w edycję status raportu wraca do `Draft`.
- Po zakończeniu zmian użytkownik musi ponownie ręcznie sfinalizować raport, aby odzyskać status `Completed`.

### US-029

ID: US-029

Tytuł: Kontynuowanie inspekcji offline

Opis: Jako użytkownik chcę móc kontynuować inspekcję bez internetu, aby nie przerywać pracy podczas oględzin auta.

Kryteria akceptacji:

- Jeśli aplikacja została wcześniej załadowana, użytkownik może pracować bez połączenia z internetem.
- Podczas pracy offline użytkownik może edytować Part 1, odpowiedzi, notatki i Summary.
- Zmiany dokonane offline zapisują się lokalnie w `IndexedDB`.
- Utrata połączenia nie wylogowuje użytkownika i nie przerywa aktywnej inspekcji.

### US-030

ID: US-030

Tytuł: Synchronizacja zmian po odzyskaniu połączenia

Opis: Jako użytkownik chcę, aby wszystkie lokalne zmiany zsynchronizowały się po powrocie internetu, abym nie musiał powtarzać pracy wykonanej offline.

Kryteria akceptacji:

- Zmiany wykonane offline trafiają do kolejki zmian.
- Po odzyskaniu połączenia aplikacja automatycznie rozpoczyna synchronizację w tle.
- Konflikty danych są rozwiązywane według strategii `Last Write Wins / Client Wins`.
- Jeśli sesja uwierzytelniająca wygasła w czasie pracy offline, aplikacja odnawia ją po odzyskaniu połączenia bez utraty lokalnego stanu inspekcji.
- Nieudane operacje synchronizacji pozostają możliwe do ponowienia.

## 6. Metryki sukcesu

### 6.1 Główne metryki sukcesu

- MS-001. Inspection completion rate: co najmniej 75% rozpoczętych inspekcji kończy się statusem `Completed` nadanym ręcznie przez użytkownika.
- MS-002. Offline sync success rate: 100% operacji domenowych zapisanych do kolejki zmian synchronizuje się poprawnie po odzyskaniu połączenia.

### 6.2 Metryki wspierające

- MS-003. Part 1 unlock rate: odsetek inspekcji, w których użytkownik poprawnie kończy Part 1 i odblokowuje Parts 2-5.
- MS-004. Summary reach rate: odsetek rozpoczętych inspekcji, które docierają do strony `Summary`.
- MS-005. Draft abandonment rate: odsetek inspekcji pozostawionych w statusie `Draft` bez manualnej finalizacji.
- MS-006. `Don't know` share: udział odpowiedzi `Don't know` na poziomie Partów i całej inspekcji jako wskaźnik trudności checklisty dla laików.
- MS-007. Limit hit frequency: liczba prób utworzenia trzeciej inspekcji na konto jako sygnał potencjalnego zapotrzebowania na przyszły model płatny lub rozszerzony.
- MS-008. Draft deletion frequency: liczba usuniętych draftów jako sygnał jakości przepływu i użyteczności produktu.

### 6.3 Definicje pomiaru

- Rozpoczęta inspekcja to każda nowa sesja utworzona w statusie `Draft`.
- Ukończona inspekcja to wyłącznie sesja, której status został zmieniony na `Completed` przez świadome użycie akcji finalizacji.
- Skuteczna synchronizacja oznacza poprawne zapisanie każdej oczekującej operacji z kolejki zmian po odzyskaniu połączenia.
- Metryki powinny być liczone na poziomie zdarzeń produktowych, ale szczegółowy wybór narzędzia analitycznego pozostaje poza zakresem MVP.