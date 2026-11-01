"""Public, read-only Strava.cz XML connector. No diner credentials."""
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import urljoin, urlparse
import requests

class MenuError(ValueError):
    pass

def parse_menu(content):
    if len(content)>2_000_000 or re.search(br'<!DOCTYPE|<!ENTITY',content,re.I):
        raise MenuError('Nepodporovaný nebo příliš velký jídelníček.')
    try:
        root=ET.fromstring(content)
    except ET.ParseError as error:
        raise MenuError('Služba neposlala platný XML jídelníček.') from error
    if root.tag!='jidelnicky':
        raise MenuError('Služba neposlala očekávaný jídelníček.')
    days={}
    for node in root.findall('den'):
        try:
            date=datetime.strptime(node.get('datum',''),'%d-%m-%Y').date().isoformat()
        except ValueError:
            continue
        meals=days.setdefault(date,[])
        for meal in node.findall('jidlo'):
            title=' '.join(meal.get('nazev','').split())
            if not title: continue
            record={'name':title,'group':' '.join(meal.get('druh','Jídlo').split()),'allergens':meal.get('alergeny','').strip()}
            if record not in meals: meals.append(record)
    return [{'date':day,'meals':meals} for day,meals in sorted(days.items()) if meals]

class StravaConnector:
    id='strava'
    name='Strava.cz'
    def fetch(self,canteen):
        if not re.fullmatch(r'\d{4,6}',canteen):
            raise MenuError('Číslo jídelny musí mít 4 až 6 číslic.')
        source='https://www.strava.cz/strava5/Jidelnicky/XML?zarizeni='+canteen
        current=source
        for _ in range(4):
            parsed=urlparse(current)
            if parsed.scheme!='https' or parsed.hostname not in ('www.strava.cz','strava.cz') or parsed.port not in (None,443):
                raise MenuError('Služba vrátila nepovolené přesměrování.')
            try:
                with requests.get(current,timeout=(4,15),stream=True,allow_redirects=False,headers={'User-Agent':'EduvizeMenu/1.0','Accept':'application/xml,text/xml'}) as response:
                    if response.status_code in (301,302,303,307,308):
                        current=urljoin(current,response.headers.get('Location',''));continue
                    response.raise_for_status()
                    body=bytearray()
                    for chunk in response.iter_content(65536):
                        body.extend(chunk)
                        if len(body)>2_000_000:raise MenuError('Jídelníček je příliš velký.')
                return {'provider':self.id,'canteen':canteen,'source':source,'days':parse_menu(bytes(body))}
            except requests.RequestException as error:
                raise MenuError('Strava.cz je nyní nedostupná. Zkuste načtení později.') from error
        raise MenuError('Příliš mnoho přesměrování služby.')
