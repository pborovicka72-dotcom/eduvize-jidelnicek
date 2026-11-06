# Eduvize · Jídelníček

První konektor: veřejný XML jídelníček Strava.cz. Ověřená jídelna: **11592**.
Nepracuje s účty strávníků ani s objednáváním jídel.

## Spuštění

Python 3.9+; `pip install -r requirements.txt`, potom `python app.py --port 8790`.
Administrace: http://127.0.0.1:8790/config.html

Výstupy: `index.html?canteen=11592&viewMode=web` (responzivní bez stránkování),
`viewMode=kiosk` (ruční stránkování), `viewMode=nsp` (automatické střídání).
Společný design a výběr segmentů se načítají z centrálního repozitáře Eduvize.

Konektory implementují `id`, `name`, `fetch(canteen)` a vracejí normalizované dny,
jídla, skupiny a původní údaje o alergenech. Registr je v `app.py`.
Cache 15 minut, souběžné dotazy na stejnou jídelnu sdílejí stažení. Při výpadku
se nejvýše 24 hodin použijí poslední data s viditelným upozorněním. Cache je
v paměti procesu; po restartu ji může naplnit poslední platný noční snímek.

Dokumentace poskytovatele:
https://www.strava.cz/strava/napoveda/cz/prilohy/Odkaz_na_XML_jidelnicek.pdf

## Prezentace jídelníčku

`presentation=day` zobrazí nejbližší celý den. `presentation=overview&days=5`
zobrazí první dva dny společně, pokud se vejdou; zbývající dny se řadí po 1–3.
Malé segmenty mají jeden celý den na stránku. Staré odkazy s `days=1` zůstávají platné.

Stránkuje se výhradně po celých denních nabídkách. Zůstávají všechny hlavní varianty
(i tři menu), polévka, doplňky, nápoje i další druhy jídel dodané poskytovatelem.
Počet karet se řídí skutečnými rozměry a měřeným obsahem. Kiosek stránkuje ručně,
NSP automaticky bez tlačítek; běžná stránka má přirozený tok. Obnovení stejných dat
nezmění otevřenou stránku. Změna rozměrů zachovává aktuální den.

Grafika a pravidla velikostí jsou ve sdílených komponentách `meal-board.css` a
`meal-board.js` centrálního design systému. Hlavička používá jeho společné metriky.
Ikony se neřadí do textu jídel. Alergeny doplňku jsou označené jako společné;
jednotlivým částem doplňku se nepřiřazují odhadované alergeny.

## Ověření

`python -m unittest discover -s tests -v`

## Veřejné nasazení

Administrace: https://eduvize-jidelnicek.onrender.com/config.html

Běžná stránka: https://eduvize-jidelnicek.onrender.com/index.html?viewMode=web&canteen=11592

Repozitář: https://github.com/pborovicka72-dotcom/eduvize-jidelnicek

Služba běží na Renderu (Free, Frankfurt). Správa aplikací i katalog kiosku
používají tuto veřejnou adresu. Staré lokální odkazy na portu 8790 kiosek
rozpozná a převede na veřejný výstup se zachováním parametrů jídelny.
Lokální běh zůstává dostupný pro vývoj.

Nastavení lze uložit v prohlížeči, přenášet odkazem i uložit na OneDrive do
společného profilu Eduvize. Profil uchovává jídelnu, volby zobrazení a segment.

## Noční obnova

Workflow `.github/workflows/nightly-menu.yml` stahuje jídelníčky nezávisle na otevřené
stránce, obvykle kolem 02:17 Europe/Prague. Čas spuštění GitHub Actions může být
opožděný. UTC sloty 00:17, 01:17 a 02:17 spolu s kontrolou českého data pokrývají
letní/zimní čas; při jarním přeskočení 02:00 proběhne obnova po 03:00.
Další sloty jsou opakováním při selhání, každé stažení má navíc čtyři pokusy.
Po úspěchu se uloží veřejný snímek `data/nightly-menu.json` a Render jej automaticky
nasadí. Selhání zdroje starý snímek nepřepíše. Platnost zálohy je nejvýše 24 hodin.
Přes den zůstává obnova stránky po 5 minutách a zdroje po 15 minutách.

Seznam automaticky načítaných jídelen je v `nightly-sources.json`, nyní Strava.cz
11592. Jiné číslo zadané pouze v odkazu se do tohoto seznamu samo nezapíše.
Při přidání další školy je nutné doplnit i tento seznam.
Workflow lze spustit ručně tlačítkem Run workflow (vynutí stažení i mimo noční čas).


## Stálý cloudový výstup

Po uložení do Eduvize tlačítka Kopírovat odkaz a Otevřít výstup používají
`output.html?edu-menu=<profil>&edu-profile=<profil>&edu-link=1`. Každý profil má
v této verzi jedno uložené nastavení Jídelníčku; různé sestavy vyžadují různé
profily. Odkaz zůstává stejný při úpravě jídelny, vzhledu, obsahu i segmentu.
Otevřený výstup kontroluje publikované nastavení každých 15 sekund bez přihlášení.
Při nedostupnosti nastavení ponechá poslední zobrazený výstup. Nové otevření
potřebuje dostupné veřejné API. Aktualizace samotné nabídky dál běží po 5 minutách.

Uložení nastavuje `publicOutput: true`; veřejné API vrací pouze povolená pole
jídelníčku. Nezveřejňuje celý profil, ostatní aplikace ani školní identitu.
Soukromá starší konfigurace se bez nového uložení nezveřejňuje. Neuložené změny
je nutné před kopírováním stálého odkazu uložit. Staré `index.html?...` odkazy
včetně `days=1` zůstávají parametrické a zachovávají svůj původní význam.

Vyžaduje společnou administraci s `/api/public/menu-outputs/{profile_id}`.
Vydávat společně se změnou eduvize-admin a podporou nové domény v eduvize-styly.
