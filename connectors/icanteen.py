"""Read the public iCanteen login-page menu without diner credentials."""
import ipaddress
import re
import socket
import ssl
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlunparse

import certifi
import urllib3


from connectors.strava import MenuError

HOST = 'strav.nasejidelna.cz'
MAX_BYTES = 2_000_000
DATE = re.compile(r'(?:(?:pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)\s+|Jídelníček na\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})', re.I)
GROUP = re.compile(r'^(?:Oběd(?:\s*(?:\d+|[A-Z]{2,4}))?|Dop\.\s*svačina|Odp\.\s*svačina|Přesnídávka|Svačina|Večeře(?:\s*\d+)?|Dieta|Polévka)$', re.I)
INLINE_ALLERGENS = re.compile(r'\bA\s*:\s*((?:\d{1,2}\s*,?\s*)+)', re.I)
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
            self.parts.append(' '.join(data.split()) + ' ')


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
        match = DATE.search(line) if len(line) < 80 else None
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
            codes = re.findall(r'\d{1,2}', allergen.group(1)) if allergen else []
            for item in INLINE_ALLERGENS.finditer(name):
                codes.extend(re.findall(r'\d{1,2}', item.group(1)))
            name = INLINE_ALLERGENS.sub('', name).strip(' ,;')
            if name:
                meal = {'name': name, 'group': group, 'allergens': ', '.join(dict.fromkeys(codes))}
                meals = days.setdefault(day, [])
                if meal not in meals:
                    meals.append(meal)
            group = None
    return [{'date': date, 'meals': meals} for date, meals in sorted(days.items()) if meals]


def source_url(value):
    """Accept a hosted canteen ID or its HTTPS login/base URL."""
    value = str(value or '').strip()
    if re.fullmatch(r'\d{4,6}', value):
        return f'https://{HOST}/{value.zfill(4)}/login'
    if not value or len(value) > 250:
        raise MenuError('Zadejte kód jídelny nebo její HTTPS adresu.')
    parsed = urlparse(value)
    hostname = parsed.hostname
    try:
        port = parsed.port
    except ValueError as error:
        raise MenuError('Neplatná HTTPS adresa iCanteen.') from error
    if (parsed.scheme != 'https' or not hostname or parsed.username or parsed.password
            or port not in (None, 443) or parsed.query or parsed.fragment
            or not re.fullmatch(r'[A-Za-z0-9.-]+', hostname)
            or hostname.startswith('.') or '..' in hostname
            or len(hostname.split('.')) < 2 or len(hostname.rsplit('.', 1)[-1]) < 2
            or hostname.rsplit('.', 1)[-1] in ('local', 'localhost', 'internal', 'test', 'invalid', 'example')):
        raise MenuError('Zadejte platnou veřejnou HTTPS adresu iCanteen bez parametrů.')
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise MenuError('Adresa jídelny musí obsahovat veřejnou doménu.')
    path = parsed.path.rstrip('/')
    if not path or not (path.endswith('/login') or path.endswith('.jsp')):
        path += '/login'
    if not re.fullmatch(r'/[A-Za-z0-9_./%-]+', path) or '/../' in path + '/':
        raise MenuError('Neplatná cesta přihlášení iCanteen.')
    return urlunparse(('https', hostname.lower(), path, '', '', ''))


def public_address(hostname):
    """Resolve before connecting and pin a public IP for the HTTPS request."""
    try:
        records = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
        addresses = [item[4][0] for item in records]
    except OSError as error:
        raise MenuError('Adresu iCanteen se nepodařilo najít.') from error
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise MenuError('Adresa iCanteen nesměřuje na veřejný server.')
    return addresses[0]


class ICanteenConnector:
    id = 'icanteen'
    name = 'iCanteen'

    def fetch(self, canteen):
        source = source_url(canteen)
        current = source
        for _ in range(4):
            parsed = urlparse(current)
            # Revalidate each redirect and pin the checked address to prevent DNS rebinding.
            current = source_url(current)
            parsed = urlparse(current)
            address = public_address(parsed.hostname)
            path = parsed.path or '/'
            pool = urllib3.HTTPSConnectionPool(
                address, port=443, server_hostname=parsed.hostname,
                assert_hostname=parsed.hostname, cert_reqs=ssl.CERT_REQUIRED,
                ca_certs=certifi.where(), timeout=urllib3.Timeout(connect=4, read=15),
                maxsize=1, block=True)
            try:
                with pool.request('GET', path, headers={
                        'Host': parsed.hostname, 'User-Agent': 'EduvizeMenu/1.0',
                        'Accept': 'text/html'}, redirect=False, preload_content=False,
                        retries=False) as response:
                    if response.status in (301, 302, 303, 307, 308):
                        target = response.headers.get('Location', '')
                        if not target:
                            raise MenuError('iCanteen vrátil neplatné přesměrování.')
                        current = urljoin(current, target)
                        continue
                    if response.status >= 400:
                        raise MenuError('iCanteen nyní jídelníček neposkytuje.')
                    body = bytearray()
                    for chunk in response.stream(65536):
                        body.extend(chunk)
                        if len(body) > MAX_BYTES:
                            raise MenuError('Jídelníček je příliš velký.')
                return {'provider': self.id, 'canteen': canteen, 'source': source,
                        'days': parse_menu(bytes(body))}
            except (urllib3.exceptions.HTTPError, OSError) as error:
                raise MenuError('iCanteen je nyní nedostupný. Zkuste načtení později.') from error
            finally:
                pool.close()
        raise MenuError('Příliš mnoho přesměrování služby.')
