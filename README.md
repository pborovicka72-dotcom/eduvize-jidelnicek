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

`presentation=day` zobrazí nejbližší den. `presentation=overview&days=5` vytvoří
přehled po dnech. Staré odkazy s `days=1` nadále volí denní nabídku.
Ikony rozlišují snídani, polévku, oběd a jeho varianty, večeři, svačinu,
nápoje, ovoce, zeleninu, dezert a ostatní. Rozdělení doplňku zachovává původní
rozsah alergenů. Malé segmenty zobrazují jejich číselné kódy.

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

Nastavení lze uložit v prohlížeči a přenášet odkazem. Ukládání nastavení na
OneDrive zatím není připojeno.

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
