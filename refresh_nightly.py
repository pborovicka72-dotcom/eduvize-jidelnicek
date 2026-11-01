"""Persist public menus before the school day, independently of running displays."""
import argparse
import json
import re
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from app import PROVIDERS, ROOT
from connectors.strava import MenuError

SNAPSHOT = ROOT / 'data' / 'nightly-menu.json'
SOURCES = ROOT / 'nightly-sources.json'
ZONE = ZoneInfo('Europe/Prague')

def due(now, records, sources):
    if now.hour < 2:
        return False
    today = now.date()
    for source in sources:
        record = records.get(source['provider'] + ':' + source['canteen'], {})
        stamp = record.get('updated', 0)
        if datetime.fromtimestamp(stamp, ZONE).date() != today:
            return True
    return False

def refresh(*, force=False, now=None, snapshot=SNAPSHOT, sources_path=SOURCES, sleep=time.sleep):
    now = now or datetime.now(ZONE)
    sources = json.loads(sources_path.read_text())
    try:
        records = json.loads(snapshot.read_text()).get('menus', {})
    except (OSError, ValueError):
        records = {}
    if not force and not due(now, records, sources):
        print('No nightly refresh due; snapshot already current or before 02:00 Prague.')
        return False
    updated = dict(records)
    failures = []
    for source in sources:
        provider, canteen = source['provider'], source['canteen']
        if provider not in PROVIDERS or not re.fullmatch(r'\d{4,6}', canteen):
            raise ValueError('Invalid nightly menu source')
        for attempt in range(4):
            try:
                data = PROVIDERS[provider].fetch(canteen)
                updated[provider + ':' + canteen] = {**data, 'updated': now.timestamp()}
                break
            except MenuError as error:
                if attempt == 3:
                    failures.append(provider + ':' + canteen + ': ' + str(error))
                else:
                    sleep((15, 45, 120)[attempt])
    # Publish an intact snapshot only when every configured source succeeded.
    if failures:
        raise RuntimeError('; '.join(failures))
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    temporary = snapshot.with_suffix('.tmp')
    temporary.write_text(json.dumps({'schemaVersion':1, 'menus':updated}, ensure_ascii=False, indent=2)+'\n')
    temporary.replace(snapshot)
    print('Nightly menus refreshed:', len(sources), now.isoformat())
    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    refresh(force=args.force)
