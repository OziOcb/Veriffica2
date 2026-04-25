# Aplikacja - Veriffica (MVP)

## Główny problem
Inspekcja samochodu przed zakupem dla amatora jest stresująca i skomplikowana. Kupujący nie wiedzą, na co patrzeć, jak interpretować usterki i często gubią się w chaosie informacji. Veriffica upraszcza ten proces, oferując spersonalizowaną, interaktywną listę kontrolną, która prowadzi użytkownika za rękę i porządkuje odpowiedzi oraz obserwacje z inspekcji.

## Najmniejszy zestaw funkcjonalności
- Język angielski jako główny jezyk aplikacji
- Strona główna: Strona z opisem produktu, przyciskami do logowania/rejestracji
- Dashboard użytkownika: Kafelkowy podgląd sesji (Draft vs Completed) z automatycznym nazewnictwem (Marka/Model/Rok) i możliwością wznowienia pracy w dowolnym momencie.
- Strona sesji: Strona widoczna po kliknięciu w kafelek z Dashboardu. Widać na niej nazwę kafelka, przyciski przenoszące uzytkownika do Partów 1 do 5, Total Score danego samochodu, wskaźnik ukończenia inspekcji, miejsce na notaki uzytkownika odnosnie danego samochodu
- Formularz konfiguracji (Part 1): Forma, w której użytkownik podaje dane dotyczące samochodu. Pola silnik, skrzynia, napęd, nadwozie są obowiązkowe, ponieważ na ich podstawie generowana zostaje spersonalizowana lista pytań dopasowana do konkretnego egzemplarza.
- System pytań (Party 2 do 5): System pytań oparty na przesuwanych kartach (jedno pytanie na ekran) z blokadą przejścia dalej bez udzielenia odpowiedzi (Tak/Nie/Nie wiem).
- Interfejs edukacyjny: System podpowiedzi ("i") przy pytaniu które posiada taką podpowiedz w bazie danych
- Strona Summary: Strona podsumowująca daną inspekcję. Zawiera:
	1. Wykresy podsumowujące każdą z sekcji. Każdy wykres to prosty wskaznik pokazujący procentowy stosunek odpowiedzi "Tak/Nie/Nie wiem" względem wszystkich pytań w danej sekcji.
	2. Total Score: Wskaznik pokazujący procentowy stosunek odpowiedzi "Tak/Nie/Nie wiem" względem wszystkich pytań w całym procesie inspekcji
	3. Listę wszystkich pytań i udzielonych odpowiedzi. Lista musi dać sie edytować w każdej chwili
- Strona profilowa: Strona profilu użytkownika na ktorej widoczne sa dane o uzytkowniku
- Strona z ustawieniami aplikacji: Strona z ustawieniami takimi jak wielkość czcionki, theme (dark/light) itd.
- System kont: Rejestracja i logowanie przy użyciu adresu e-mail i hasła, oparte na Supabase Auth, umożliwiające szybki dostęp i trwałe przechowywanie raportów.
- Tryb Offline-First (PWA): Wykorzystanie IndexedDB i "Kolejki Zmian" do pracy bez dostępu do internetu oraz automatyczna synchronizacja danych w tle.

## Co NIE wchodzi w zakres MVP
- Wybór innych jezyków dla aplikacji
- System zdięć: Robienie własnych zdjeć lub uploadowanie ich przez użytkownika
- Eksport i udostępnianie: Generowanie plików PDF oraz wysyłanie raportów linkiem do innych osób.
- Weryfikacja zewnętrzna: Sprawdzanie historii pojazdu po numerze VIN.
- Natywne aplikacje: Publikacja w App Store i Google Play (MVP działa wyłącznie jako PWA w przeglądarce).
- Porównywarka: Funkcja zestawiania dwóch lub więcej raportów obok siebie na jednym ekranie.
- System "Deal-breakerów": Automatyczna dyskwalifikacja auta przy wykryciu krytycznej usterki bezpieczeństwa.

## Kryteria sukcesu
- 75% użytkowników kończy pełny proces inspekcji (przejście przez wszystkie 5 sekcji: Info, Standstill, Engine, Drive, Documents).
- Retencja danych: 100% skuteczność synchronizacji "Kolejki Zmian" po odzyskaniu połączenia sieciowego.