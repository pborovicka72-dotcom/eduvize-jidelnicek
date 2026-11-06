"""Eduvize Jídelníček: provider registry and public normalized menu API."""
import argparse
import json
import re
import threading
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from zoneinfo import ZoneInfo
from connectors.strava import StravaConnector,MenuError
ROOT=Path(__file__).resolve().parent
PROVIDERS={'strava':StravaConnector()}
CACHE={}
LOCKS=[threading.Lock() for _ in range(16)]
TTL=900

def read_snapshot(provider, canteen):
    try:
        payload=json.loads((ROOT/'data'/'nightly-menu.json').read_text())
        record=payload['menus'][provider+':'+canteen]
        age=time.time()-record['updated']
        if 0<=age<86400 and isinstance(record['days'],list):return record
    except (OSError,ValueError,KeyError,TypeError):
        pass
    return None

def load_menu(provider,canteen):
    if provider not in PROVIDERS:raise MenuError('Vyberte podporovanou službu jídelníčku.')
    if not re.fullmatch(r'\d{4,6}',canteen):raise MenuError('Číslo jídelny musí mít 4 až 6 číslic.')
    key=(provider,canteen)
    with LOCKS[hash(key)%len(LOCKS)]:
        cached=CACHE.get(key);now=time.time()
        if cached is None:
            cached=read_snapshot(provider,canteen)
            if cached:CACHE[key]=cached
        if cached and now-cached['updated']<TTL:return {**cached,'cached':True,'stale':False}
        try:
            data={**PROVIDERS[provider].fetch(canteen),'updated':now}
            if len(CACHE)>=100:CACHE.pop(next(iter(CACHE)),None)
            CACHE[key]=data
            return {**data,'cached':False,'stale':False}
        except MenuError:
            if cached and now-cached['updated']<86400:return {**cached,'cached':True,'stale':True,'warning':'Služba je nedostupná; zobrazuje se poslední načtený jídelníček.'}
            raise

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def send_json(self,value,status=200):
        body=json.dumps(value,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        u=urlparse(self.path);q=parse_qs(u.query)
        if u.path=='/api/providers':return self.send_json([{'id':p.id,'name':p.name} for p in PROVIDERS.values()])
        if u.path=='/health':return self.send_json({'status':'ok','version':'2026.11.02.1'})
        if u.path=='/api/menu':
            try:
                data=load_menu(q.get('provider',['strava'])[0],q.get('canteen',[''])[0]);today=datetime.now(ZoneInfo('Europe/Prague')).date().isoformat()
                data={**data,'today':today,'days':[d for d in data['days'] if d['date']>=today]}
                return self.send_json(data)
            except MenuError as error:return self.send_json({'detail':str(error)},422)
        allowed={'/':'index.html','/index.html':'index.html','/config':'config.html','/config.html':'config.html','/meal-model.js':'meal-model.js','/menu.js':'menu.js','/menu.css':'menu.css','/config.js':'config.js','/output.html':'output.html','/public-output.js':'public-output.js','/favicon.svg':'favicon.svg'}
        if u.path not in allowed:return self.send_error(404)
        self.path='/'+allowed[u.path]
        super().do_GET()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',default=8790,type=int);args=p.parse_args()
    ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()

