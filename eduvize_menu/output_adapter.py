"""Strict menu publication and bounded live data from the existing menu service.

The shared registry owns school/profile authorization, entitlements, publication,
revocation and themes. This adapter never accepts URLs or private profile IDs.
"""
from __future__ import annotations
import json
import math
import os
import re
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from typing import Annotated, Literal
from urllib.parse import urlencode, urlsplit
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class Payload(Model):
    provider: Literal['strava']
    canteen: Annotated[StrictStr, Field(pattern=r'^[0-9]{4,6}$')]
    name: Annotated[StrictStr, Field(max_length=120)]
    days: Annotated[StrictInt, Field(ge=1, le=10)]
    presentation: Literal['day', 'overview']
    allergens: StrictBool
    showTime: StrictBool

    def consistent(self):
        if self.presentation == 'day' and self.days != 1:
            raise ValueError('Daily menu must request one day')
        if self.presentation == 'overview' and self.days not in (3, 5, 10):
            raise ValueError('Unsupported overview duration')
        if any(ord(c) < 32 for c in self.name):
            raise ValueError('Invalid menu name')
        return self

class Meal(Model):
    name: Annotated[StrictStr, Field(min_length=1, max_length=2000)]
    group: Annotated[StrictStr, Field(max_length=100)]
    allergens: Annotated[StrictStr, Field(max_length=1000)]

class Day(Model):
    date: Annotated[StrictStr, Field(pattern=r'^\d{4}-\d{2}-\d{2}$')]
    meals: Annotated[list[Meal], Field(max_length=100)]


def validate(payload, presentation):
    from eduvize_admin.output_schemas import Presentation
    Presentation.model_validate(presentation)
    return Payload.model_validate(payload).consistent().model_dump()


def clean_menu(value, payload):
    """Construct, never forward, public provider data (including the source URL)."""
    if not isinstance(value, dict) or value.get('provider') != payload['provider'] or value.get('canteen') != payload['canteen']:
        raise ValueError('Mismatched menu service response')
    updated = value.get('updated')
    if isinstance(updated, bool) or not isinstance(updated, (int, float)) or not math.isfinite(updated):
        raise ValueError('Invalid menu timestamp')
    now = datetime.now(timezone.utc)
    if updated < 0 or updated > now.timestamp():
        raise ValueError('Invalid menu timestamp')
    today = value.get('today')
    date.fromisoformat(today)
    raw_days = value.get('days')
    if not isinstance(raw_days, list) or len(raw_days) > 100:
        raise ValueError('Invalid menu days')
    days = [Day.model_validate(day).model_dump() for day in raw_days]
    dates = [d['date'] for d in days]
    if dates != sorted(set(dates)):
        raise ValueError('Invalid menu day order')
    for day in days:
        date.fromisoformat(day['date'])
    stale = value.get('stale')
    if type(stale) is not bool:
        raise ValueError('Invalid freshness')
    result = dict(provider=payload['provider'], canteen=payload['canteen'],
                  source='https://www.strava.cz/strava5/Jidelnicky/XML?' + urlencode({'zarizeni': payload['canteen']}),
                  updated=updated, today=today, stale=stale,
                  days=[d for d in days if d['date'] >= today][:payload['days']])
    if stale:
        result['warning'] = 'Služba je nedostupná; zobrazuje se poslední načtený jídelníček.'
    return dict(schemaVersion=1, observedAt=datetime.fromtimestamp(updated, timezone.utc).isoformat(),
                fetchedAt=now.isoformat(), stale=stale, complete=True, data=result)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_menu(payload):
    # Deployment-owned endpoint only. No user URL, proxy, redirect or session header.
    base = os.environ.get('EDUVIZE_MENU_INTERNAL_URL', 'http://menu:8000')
    if base not in ('http://menu:8000', 'http://127.0.0.1:8107'):
        raise ValueError('Invalid internal menu service')
    url = base + '/api/menu?' + urlencode({'provider': payload['provider'], 'canteen': payload['canteen']})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(urllib.request.Request(url, headers={'Accept': 'application/json'}), timeout=8) as response:
        if response.status != 200 or response.headers.get_content_type() != 'application/json':
            raise ValueError('Menu source unavailable')
        body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError('Menu source too large')
    return json.loads(body)


def live(record, request):
    from eduvize_admin.output_registry import fail
    if request.query_params:
        fail(422, 'INVALID_PAYLOAD', 'Parametry zdroje jsou součástí uloženého výstupu.')
    try:
        snapshot = json.loads(record['snapshot'])
        payload = validate(snapshot['payload'], snapshot['presentation'])
        return clean_menu(fetch_menu(payload), payload)
    except (ValueError, TypeError, KeyError, OSError, urllib.error.URLError):
        fail(503, 'DEPENDENCY_UNAVAILABLE', 'Jídelníček nyní není dostupný. Zkuste to později.')


def validate_live(value):
    from eduvize_admin.output_schemas import LiveData
    return LiveData.model_validate(value).model_dump()


def get_output_adapters():
    from eduvize_admin.output_registry import Adapter
    return {'menu': Adapter(validate, '/jidelnicek/published.html', live_response=live, live_validate=validate_live)}
