# Dokument wymagań produktu (PRD) - Veriffica

## 1. Przegląd produktu

Veriffica to progresywna aplikacja internetowa (PWA) zaprojektowana, aby wspierać amatorów w procesie samodzielnej inspekcji używanego samochodu przed zakupem. Aplikacja przeprowadza użytkownika przez ustrukturyzowany proces kontroli, od sprawdzenia dokumentów po jazdę próbną, oferując jasne instrukcje i system oceny stanu technicznego. Dzięki podejściu Mobile-First i funkcjonalności Offline-first, narzędzie jest zoptymalizowane do pracy w trudnych warunkach (place komisowe, garaże podziemne).

Kluczowe cechy:
- Dynamicznie generowana lista kontrolna na podstawie typu pojazdu.
- System oceniania oparty na logice Traffic Lights.
- Możliwość dokumentacji fotograficznej z kompresją danych.
- Pełna obsługa trybu offline z synchronizacją w tle.
- Interfejs w języku angielskim dla zapewnienia uniwersalności terminologii motoryzacyjnej.

## 2. Problem użytkownika

Zakup używanego samochodu jest dla przeciętnego użytkownika procesem stresującym i obarczonym dużym ryzykiem finansowym. Amatorzy często nie wiedzą:
- Na co zwrócić uwagę podczas oględzin.
- Jak interpretować konkretne usterki.
- Jak zachować obiektywizm pod presją sprzedającego.
- Jak usystematyzować zebrane informacje o kilku oglądanych pojazdach.

Obecne rozwiązania to albo drogie raporty ekspertów, albo skomplikowane arkusze PDF, które są niewygodne w użyciu na smartfonie podczas inspekcji. Veriffica rozwiązuje te problemy, zamieniając chaos w prostą listę zadań krok po kroku.

## 3. Wymagania funkcjonalne

### 3.1. Konfiguracja i Personalizacja (Part 1)
- System musi umożliwiać zdefiniowanie parametrów auta: marka, model, rok, numer rejestracyjny (opcjonalny).
- Wybór filtrów logicznych za pomocą interfejsu kafelkowego: typ silnika (ICE/EV/Hybrid), skrzynia biegów (Manual/Auto), napęd (2WD/4WD), typ nadwozia.
- Zmiana tych parametrów po rozpoczęciu inspekcji musi skutkować wyświetleniem ostrzeżenia o resecie postępów.

### 3.2. Proces Inspekcji
- Podział na 5 sekcji: Info, Standstill (Postój), Starting Engine (Uruchomienie), Test Drive (Jazda próbna), Documents (Dokumenty).
- Nawigacja oparta na kartach (jeden obszar/pytanie na ekran).
- Blokada przejścia do kolejnej karty bez udzielenia odpowiedzi (Tak / Nie / Nie wiem).
- Dynamiczne generowanie pytań w oparciu o filtry z sekcji Part 1.

### 3.3. System Oceniania i Raportowania
- Wyliczanie Total Score według wzoru: (Liczba odpowiedzi Nie / Wszystkie pytania w talii) * 100%.
- System Traffic Lights:
  - Zielony: Brak usterek.
  - Czerwony: Wykryta usterka.
  - Szary: Nie wiem / Nie sprawdzono.
- Prezentacja Dashboardu z kafelkami zapisanych sesji, sortowanych od najnowszych.

### 3.4. Zarządzanie Mediami
- Limit 20 zdjęć na całą sesję inspekcji.
- Automatyczna kompresja zdjęć po stronie klienta przed zapisem/wysyłką.
- Możliwość przypisania zdjęcia bezpośrednio do pytania (pojawia się przy wyborze opcji wskazującej usterkę) lub jako zdjęcie ogólne.

### 3.5. Architektura i Synchronizacja
- PWA (Progressive Web App) z obsługą Service Workers.
- Mechanizm Offline-first: zapis danych w Local Storage i kolejkowanie zmian (Sync Queue).
- Soft Re-authentication: możliwość dokończenia sesji po wygaśnięciu tokena i prośba o login przy próbie finalnej synchronizacji.

## 4. Granice produktu

### 4.1. Wchodzi w zakres MVP
- System kont użytkowników z Social Login (Google/Facebook).
- Kompletny proces 5 kroków inspekcji.
- Lokalny zapis danych i synchronizacja z serwerem.
- Podstawowe ustawienia (Dark/Light mode, wielkość czcionki).
- Dashboard z historią sprawdzonych aut.

### 4.2. Poza zakresem MVP
- Weryfikacja numeru VIN w zewnętrznych bazach danych.
- Udostępnianie raportów innym użytkownikom (linki publiczne).
- Natywne aplikacje iOS/Android (tylko wersja Web/PWA).
- Wsparcie dla wielu języków (tylko język angielski).
- Eksport raportu do formatu PDF.

## 5. Historyjki użytkowników

### 5.1. Uwierzytelnianie i profil

ID: US-001
Tytuł: Rejestracja i logowanie użytkownika
Opis: Jako nowy użytkownik, chcę założyć konto za pomocą adresu e-mail lub konta społecznościowego, aby móc zapisywać historię moich inspekcji.
Kryteria akceptacji:
1. Użytkownik może zarejestrować się przy użyciu e-maila i hasła.
2. Użytkownik może zalogować się za pomocą Google lub Facebook.
3. Po poprawnym zalogowaniu użytkownik trafia na pusty Dashboard (jeśli to pierwszy raz) lub listę sesji.
4. Sesja użytkownika jest utrzymywana w trybie offline.

ID: US-002
Tytuł: Ustawienia interfejsu
Opis: Jako użytkownik, chcę dostosować wygląd aplikacji, aby móc wygodnie korzystać z niej w różnych warunkach oświetleniowych.
Kryteria akceptacji:
1. Użytkownik może przełączać między trybem Dark a Light.
2. Użytkownik może wybrać jeden z trzech rozmiarów czcionki (Small, Medium, Large).
3. Ustawienia są zapamiętywane dla profilu użytkownika.

### 5.2. Przygotowanie inspekcji

ID: US-003
Tytuł: Definiowanie parametrów pojazdu (Part 1)
Opis: Jako użytkownik, chcę określić podstawowe dane pojazdu, aby aplikacja dostosowała pytania do konkretnego modelu.
Kryteria akceptacji:
1. Użytkownik musi wprowadzić Markę, Model i Rok produkcji.
2. Użytkownik wybiera typ silnika, skrzyni, napędu i nadwozia za pomocą dużych, czytelnych kafelków.
3. System blokuje przejście do inspekcji, jeśli wymagane kafelki nie zostały zaznaczone.
4. Wprowadzenie numeru rejestracyjnego jest opcjonalne.

ID: US-004
Tytuł: Edycja filtrów w trakcie inspekcji
Opis: Jako użytkownik, chcę mieć możliwość zmiany filtrów auta, jeśli pomyliłem się na początku, ze świadomością konsekwencji.
Kryteria akceptacji:
1. Próba powrotu do Part 1 i zmiany kluczowych filtrów (np. silnik) wyświetla modal z ostrzeżeniem.
2. Zatwierdzenie zmiany powoduje zresetowanie udzielonych odpowiedzi w pozostałych 4 krokach.

### 5.3. Realizacja inspekcji

ID: US-005
Tytuł: Odpowiadanie na pytania w trybie kart
Opis: Jako użytkownik, chcę przechodzić przez pytania jedno po drugim, aby nie pominąć żadnego istotnego elementu.
Kryteria akceptacji:
1. Każde pytanie wyświetla się na osobnej karcie.
2. Przycisk Next jest nieaktywny, dopóki użytkownik nie wybierze jednej z opcji: Yes, No, I don't know.
3. Aplikacja wyświetla pasek postępu (np. Part 2: 5/15).

ID: US-006
Tytuł: Dokumentacja fotograficzna usterki
Opis: Jako użytkownik, chcę zrobić zdjęcie wykrytej usterki, aby móc ją później przeanalizować.
Kryteria akceptacji:
1. Przy wyborze odpowiedzi oznaczającej usterkę (Czerwony), pojawia się ikona aparatu.
2. Wykonane zdjęcie jest automatycznie tagowane nazwą aktualnego pytania.
3. Zdjęcie podlega kompresji po stronie przeglądarki przed zapisem w kolejce synchronizacji.

ID: US-007
Tytuł: Limit zdjęć w sesji
Opis: Jako użytkownik, chcę wiedzieć, ile jeszcze zdjęć mogę wykonać, aby nie przekroczyć limitu MVP.
Kryteria akceptacji:
1. Na ekranie robienia zdjęcia wyświetla się licznik (np. 15/20).
2. Po osiągnięciu 20 zdjęć, przycisk aparatu staje się nieaktywny.
3. Wyświetla się komunikat informujący o osiągnięciu limitu zdjęć dla tej sesji.

### 5.4. Praca w terenie (Offline)

ID: US-008
Tytuł: Praca bez dostępu do sieci
Opis: Jako użytkownik, chcę kontynuować inspekcję w garażu bez internetu, aby nie przerywać pracy.
Kryteria akceptacji:
1. Każda udzielona odpowiedź jest natychmiast zapisywana w Local Storage.
2. Brak połączenia z siecią nie blokuje interfejsu ani nawigacji między kartami.
3. Po odzyskaniu połączenia, aplikacja automatycznie przesyła zakolejkowane dane na serwer.

ID: US-009
Tytuł: Wygaśnięcie sesji w trybie offline
Opis: Jako użytkownik, nie chcę zostać wyrzucony z formularza, jeśli moja sesja wygaśnie podczas braku zasięgu.
Kryteria akceptacji:
1. Aplikacja pozwala na dokończenie wszystkich kroków inspekcji offline nawet po wygaśnięciu tokena.
2. Przy próbie przejścia do podsumowania (Summary) wymagającego finalnej synchronizacji, użytkownik jest proszony o ponowne zalogowanie (jeśli jest online).

### 5.5. Podsumowanie i historia

ID: US-010
Tytuł: Przegląd raportu końcowego
Opis: Jako użytkownik, chcę zobaczyć wynik punktowy i listę wykrytych wad, aby podjąć decyzję o zakupie.
Kryteria akceptacji:
1. Wyświetlenie Total Score zgodnie ze wzorem matematycznym.
2. Wyświetlenie legendy wyjaśniającej kolory Traffic Lights oraz wpływ odpowiedzi I don't know na wynik.
3. Lista pytań z odpowiedziami pogrupowana według 5 głównych sekcji.
4. Galeria wszystkich 20 zdjęć wykonanych podczas sesji.

ID: US-011
Tytuł: Zarządzanie historią inspekcji (Dashboard)
Opis: Jako użytkownik, chcę widzieć listę wszystkich sprawdzonych aut, aby móc je porównać.
Kryteria akceptacji:
1. Widok Dashboard prezentuje kafelki z nazwą (Marka Model) i datą inspekcji.
2. Kafelki wyświetlają Total Score bez konieczności wchodzenia w szczegóły.
3. Kliknięcie w kafelek otwiera pełne podsumowanie danej sesji.

## 6. Metryki sukcesu

- Współczynnik ukończenia (Completion Rate): Minimum 75% użytkowników, którzy rozpoczęli Part 1, musi dotrzeć do ekranu Summary (wszystkie 5 sekcji).
- Stabilność synchronizacji: 100% danych zakolejkowanych w trybie offline musi zostać poprawnie zsynchronizowanych po powrocie użytkownika do trybu online.