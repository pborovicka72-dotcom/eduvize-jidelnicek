"""Exercise the real shared HTTP registry with the menu adapter; no provider writes."""
import copy
import json
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from eduvize_admin.output_api import router
from eduvize_admin.output_registry import OutputRegistry, Actor, OutputError
from eduvize_menu.output_adapter import get_output_adapters
from test_output_adapter import P, WEB, menu

class Connection:
    def __init__(self,path):
        self.c=sqlite3.connect(path);self.c.execute('BEGIN IMMEDIATE')
    def execute(self,sql,args=()):
        return self.c.execute('SELECT 1') if 'pg_advisory_xact_lock' in sql else self.c.execute(sql.replace('%s','?'),args)
    def __enter__(self):return self
    def __exit__(self,t,v,b):
        self.c.rollback() if t else self.c.commit();self.c.close()

class MenuRegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=str(Path(self.temp.name)/'outputs.db')
        self.profile='b'*32;self.enabled=True
        actor=Actor('school-a','test-user',frozenset(['read','create','save','publish','revoke']))
        def authorize(header):
            if header!='Bearer test-school':raise HTTPException(401,'Unauthorized')
            return actor
        def licensed(school,app):
            self.assertEqual((school,app),('school-a','menu'))
            if not self.enabled:raise OutputError(403,'FORBIDDEN','License disabled')
        theme={'schemaVersion':1,'colors':{k:'#112233' for k in ['background','text','muted','surface','primary','primaryText','secondary','secondaryText','accent','border']},'controls':{'heightPx':40,'radiusPx':10},'cards':{'radiusPx':10},'icons':{'radiusPx':10}}
        registry=OutputRegistry(lambda:Connection(self.path),get_output_adapters(),lambda p:'school-a' if p==self.profile else 'other','https://test.skola.eduvize.cz',lambda p:theme,licensed)
        app=FastAPI();app.include_router(router(registry,authorize));self.client=TestClient(app)
        a=self.call('POST','/api/v1/output-assemblies',{'schemaVersion':1,'appId':'menu','profileId':self.profile}).json()
        self.draft={'schemaVersion':1,'payloadVersion':1,'payload':copy.deepcopy(P),'presentation':copy.deepcopy(WEB)}
        r=self.call('POST','/api/v1/outputs',{'schemaVersion':1,'appId':'menu','profileId':self.profile,'assemblyId':a['id'],'draft':self.draft})
        self.assertEqual(r.status_code,201,r.text);self.id=r.json()['id'];self.public='/api/public/v1/outputs/'+self.id
    def tearDown(self):self.temp.cleanup()
    def call(self,method,path,body=None,key=None):
        return self.client.request(method,path,json=body,headers={'Authorization':'Bearer test-school','Idempotency-Key':key or uuid.uuid4().hex})
    def publish(self,revision=0):
        r=self.call('POST','/api/v1/outputs/'+self.id+'/publish',{'expectedRevision':revision});self.assertEqual(r.status_code,200,r.text);return r.json()
    def test_real_anonymous_resolver_snapshot_theme_and_live_data(self):
        self.assertEqual(self.client.get(self.public).status_code,404)
        link=self.publish()['url'];resolved=self.client.get('/o/'+self.id,follow_redirects=False)
        self.assertEqual(resolved.status_code,307);self.assertEqual(resolved.headers['location'],'/jidelnicek/published.html?edu-output='+self.id)
        self.assertEqual(self.client.get(self.public).json()['payload'],P)
        self.assertEqual(self.client.get(self.public+'/theme').json()['colors']['background'],'#112233')
        with patch('eduvize_menu.output_adapter.fetch_menu',return_value=menu()):
            live=self.client.get(self.public+'/data');self.assertEqual(live.status_code,200,live.text)
            self.assertIn('rizoto',live.json()['data']['days'][0]['meals'][0]['name'])
            self.assertEqual(self.client.get(self.public+'/data?canteen=12345').status_code,422)
        self.assertNotIn('profileId',self.client.get(self.public).json())
    def test_save_only_keeps_public_content_and_update_keeps_url(self):
        link=self.publish()['url'];draft=copy.deepcopy(self.draft);draft['payload']['name']='Změněná jídelna'
        r=self.call('PUT','/api/v1/outputs/'+self.id+'/draft',{'expectedRevision':1,'draft':draft});self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.client.get(self.public).json()['payload']['name'],P['name'])
        self.assertEqual(self.publish(2)['url'],link)
        self.assertEqual(self.client.get(self.public).json()['payload']['name'],'Změněná jídelna')
    def test_auth_school_ownership_and_live_license_guards(self):
        self.publish()
        self.assertEqual(self.client.get('/api/v1/outputs/'+self.id).status_code,401)
        self.assertEqual(self.client.post('/api/v1/outputs/'+self.id+'/publish',json={'expectedRevision':1}).status_code,401)
        r=self.call('POST','/api/v1/output-assemblies',{'schemaVersion':1,'appId':'menu','profileId':'c'*32});self.assertEqual(r.status_code,404)
        self.enabled=False
        with patch('eduvize_menu.output_adapter.fetch_menu') as fetch:
            for suffix in ['', '/data','/theme']:self.assertEqual(self.client.get(self.public+suffix).status_code,403)
            fetch.assert_not_called()
    def test_revoked_link_and_dependency_failure_do_not_expose_private_context(self):
        self.publish()
        with patch('eduvize_menu.output_adapter.fetch_menu',side_effect=OSError('private secret')):
            r=self.client.get(self.public+'/data');self.assertEqual(r.status_code,503);self.assertNotIn('private secret',r.text)
        self.assertEqual(self.client.get(self.public).status_code,200)
        self.call('POST','/api/v1/outputs/'+self.id+'/revoke',{'expectedRevision':1})
        for suffix in ['', '/data','/theme']:self.assertEqual(self.client.get(self.public+suffix).status_code,410)

if __name__=='__main__':unittest.main()
