import copy
import json
import math
import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch
from eduvize_menu import output_adapter as m
from eduvize_admin.output_registry import OutputError

P={'provider':'strava','canteen':'11592','name':'Školní jídelna','days':3,'presentation':'overview','allergens':False,'showTime':False}
WEB={'mode':'web','geometry':None,'interaction':'display'}
def menu():
    today=datetime.now(timezone.utc).date().isoformat()
    return {'provider':'strava','canteen':'11592','source':'https://attacker.invalid/?token=secret','updated':datetime.now(timezone.utc).timestamp()-10,'today':today,'stale':False,'days':[{'date':today,'meals':[{'name':'Polévka a rizoto','group':'Oběd','allergens':'07'}]}],'token':'private'}

class AdapterTests(unittest.TestCase):
    def test_strict_payload_and_all_presentations(self):
        for presentation in [WEB,{'mode':'nsp','geometry':{'registryId':'nsp-4k','registryVersion':1,'orientation':'landscape','layoutId':1,'segmentId':1},'interaction':'display'},{'mode':'kiosk','geometry':{'registryId':'kiosk-viewport','registryVersion':1,'orientation':'portrait','width':1080,'height':1920},'interaction':'interactive','kioskLayout':'menu'}]:
            self.assertEqual(m.validate(P,presentation),P)
    def test_rejects_private_fields_urls_and_coercion(self):
        for value in [{**P,'profileId':'a'*32},{**P,'url':'https://example.org'},{**P,'provider':'unknown'},{**P,'canteen':'../../etc'},{**P,'days':'3'},{**P,'allergens':'false'},{**P,'days':True},{**P,'name':'x'*121},{**P,'name':'a\nb'}]:
            with self.subTest(value=value),self.assertRaises(ValueError):m.validate(value,WEB)
    def test_daily_and_overview_bounds(self):
        self.assertEqual(m.validate({**P,'presentation':'day','days':1},WEB)['days'],1)
        for change in [{'presentation':'day','days':3},{'days':2},{'days':11}]:
            with self.assertRaises(ValueError):m.validate({**P,**change},WEB)
    def test_presentation_cannot_claim_bad_geometry(self):
        with self.assertRaises(ValueError):m.validate(P,{**WEB,'geometry':{'registryId':'kiosk-viewport'}})
    def test_live_uses_saved_settings_not_query(self):
        record={'snapshot':json.dumps({'payload':P,'presentation':WEB})}
        with patch.object(m,'fetch_menu',return_value=menu()) as fetch:
            result=m.live(record,SimpleNamespace(query_params={}))
            self.assertEqual(fetch.call_args.args[0],P)
            self.assertEqual(result['data']['days'][0]['meals'][0]['name'],'Polévka a rizoto')
            self.assertNotIn('token',result['data']);self.assertNotIn('attacker',result['data']['source'])
            self.assertEqual(m.validate_live(result),result)
        with patch.object(m,'fetch_menu') as fetch:
            with self.assertRaises(OutputError) as e:m.live(record,SimpleNamespace(query_params={'canteen':'12345'}))
            self.assertEqual(e.exception.status,422);fetch.assert_not_called()
    def test_dependency_failure_is_503(self):
        with patch.object(m,'fetch_menu',side_effect=OSError()):
            with self.assertRaises(OutputError) as e:m.live({'snapshot':json.dumps({'payload':P,'presentation':WEB})},SimpleNamespace(query_params={}))
            self.assertEqual(e.exception.status,503)
    def test_provider_mismatch_and_bad_timestamps(self):
        for change in [{'canteen':'12345'},{'provider':'other'},{'updated':math.inf},{'updated':True},{'today':'bad'},{'days':[{'date':'2026-99-99','meals':[]}]},{'stale':'false'}]:
            with self.subTest(change=change),self.assertRaises((ValueError,TypeError)):m.clean_menu({**menu(),**change},P)
    def test_stale_is_explicit_and_no_provider_warning_forwarded(self):
        v=m.clean_menu({**menu(),'stale':True,'warning':'token=secret'},P)
        self.assertTrue(v['stale']);self.assertNotIn('secret',json.dumps(v))
    def test_untrusted_deployment_url_rejected_before_network(self):
        for url in ['https://example.org','http://169.254.169.254','http://menu:8000/private']:
            with patch.dict(os.environ,{'EDUVIZE_MENU_INTERNAL_URL':url}),self.assertRaises(ValueError):m.fetch_menu(P)
    def test_adapter_fixed_renderer_and_hooks(self):
        a=m.get_output_adapters()['menu'];self.assertEqual(a.renderer,'/jidelnicek/published.html');self.assertIs(a.live_response,m.live);self.assertIsNone(a.prepare)

if __name__=='__main__':unittest.main()
