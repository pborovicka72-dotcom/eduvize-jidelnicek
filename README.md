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
v paměti procesu, po restartu se data stáhnou znovu.

Dokumentace poskytovatele:
https://www.strava.cz/strava/napoveda/cz/prilohy/Odkaz_na_XML_jidelnicek.pdf

## Ověření

`python -m unittest discover -s tests -v`

## Stav

Lokální prototyp; nastavení lze uložit v prohlížeči a přenášet odkazem.
Repozitář: https://github.com/pborovicka72-dotcom/eduvize-jidelnicek

Aplikace je zařazena do správy aplikací a katalogu kiosku s lokální adresou
na portu 8790. Služba musí běžet na počítači, kde se kiosek zobrazuje.
`render.yaml` připravuje veřejnou službu na bezplatném plánu. Zbývá dokončit
přihlášení k Renderu, službu nasadit a přepnout odkazy z lokální na veřejnou
adresu. Ukládání nastavení na OneDrive zatím není připojeno.
