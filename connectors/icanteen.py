"""Read the public iCanteen login-page menu without diner credentials."""
import re
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests

from connectors.strava import MenuError

HOST = 'strav.nasejidelna.cz'
MAX_BYTES = 2_000_000
DATE = re.compile(r'(?:(?:pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)\s+|Jídelníček na\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})', re.I)
GROUP = re.compile(r'^(?:Oběd\s*\d+|Přesnídávka|Svačina|Večeře(?:\s*\d+)?|Dieta|Polévka)$', re.I)
ALLERGENS = re.compile(r'(?:_?\{)?\s*[\[(]\s*(?:A\s*:\s*)?((?:\d{1,2}[a-z]?\s*[,;]?\s*)+)[\])]\s*(?:\})?\s*$', re.I)


class TextLines(HTMLParser):
    """Keep block boundaries; iCanteen renders menu text on its login page."""
    BLOCKS = {'div', 'p', 'li', 'tr', 'td', 'th', 'section', 'article', 'h1', 'h2', 'h3', 'br'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skipped = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skipped += 1
        if tag in self.BLOCKS:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.skipped:
            self.skipped -= 1
        if tag in self.BLOCKS:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skipped:
            self.parts.append(data)


def parse_menu(content):
    if len(content) > MAX_BYTES:
        raise MenuError('Jídelníček je příliš velký.')
    parser = TextLines()
    parser.feed(content.decode('utf-8', 'replace'))
    lines = [' '.join(line.split()) for line in ''.join(parser.parts).splitlines()]
    lines = [line for line in lines if line]
    if not any('iCanteen' in line for line in lines):
        raise MenuError('Stránka neobsahuje veřejný jídelníček iCanteen.')
    days = {}
    day = group = None
    for line in lines:
        match = DATE.fullmatch(line)
        if match:
            try:
                day = datetime(int(match[3]), int(match[2]), int(match[1])).date().isoformat()
            except ValueError:
                day = None
            group = None
            continue
        if day and GROUP.fullmatch(line):
            group = line
            continue
        if day and group and line and not line.startswith(('iCanteen ', '©')):
            if line in ('Přihlašovací jméno', 'Heslo'):
                group = None
                continue
            allergen = ALLERGENS.search(line)
            name = line[:allergen.start()].strip(' ,;') if allergen else line
            if name:
                meal = {'name': name, 'group': group, 'allergens': allergen.group(1).strip() if allergen else ''}
                meals = days.setdefault(day, [])
                if meal not in meals:
                    meals.append(meal)
            group = None
    return [{'date': date, 'meals': meals} for date, meals in sorted(days.items()) if meals]


class ICanteenConnector:
    id = 'icanteen'
    name = 'iCanteen'

    def fetch(self, canteen):
        if not re.fullmatch(r'\d{4,6}', canteen):
            raise MenuError('Kód jídelny iCanteen musí mít 4 až 6 číslic.')
        source = f'https://{HOST}/{canteen.zfill(4)}/login'
        current = source
        for _ in range(4):
            parsed = urlparse(current)
            if parsed.scheme != 'https' or parsed.hostname != HOST or parsed.port not in (None, 443):
                raise MenuError('Služba vrátila nepovolené přesměrování.')
            try:
                with requests.get(current, timeout=(4, 15), stream=True, allow_redirects=False,
                                  headers={'User-Agent': 'EduvizeMenu/1.0', 'Accept': 'text/html'}) as response:
                    if response.status_code in (301, 302, 303, 307, 308):
                        current = urljoin(current, response.headers.get('Location', ''))
                        continue
                    response.raise_for_status()
                    body = bytearray()
                    for chunk in response.iter_content(65536):
                        body.extend(chunk)
                        if len(body) > MAX_BYTES:
                            raise MenuError('Jídelníček je příliš velký.')
                return {'provider': self.id, 'canteen': canteen, 'source': source,
                        'days': parse_menu(bytes(body))}
            except requests.RequestException as error:
                raise MenuError('iCanteen je nyní nedostupný. Zkuste načtení později.') from error
        raise MenuError('Příliš mnoho přesměrování služby.')
