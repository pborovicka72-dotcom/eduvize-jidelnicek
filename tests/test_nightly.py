import json,tempfile,unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo
import app
import refresh_nightly as nightly
from connectors.strava import MenuError
ZONE=ZoneInfo('Europe/Prague')
class NightlyTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.sources=self.root/'sources.json';self.sources.write_text('[{"provider":"strava","canteen":"11592"}]')
  self.snapshot=self.root/'data'/'nightly-menu.json';self.now=datetime(2026,11,2,2,17,tzinfo=ZONE)
 def tearDown(self):self.temp.cleanup()
 def refresh(self,**kw):return nightly.refresh(now=self.now,snapshot=self.snapshot,sources_path=self.sources,sleep=lambda n:None,**kw)
 def test_once_per_local_day(self):
  with patch.object(app.PROVIDERS['strava'],'fetch',return_value={'days':[]}) as fetch:
   self.assertTrue(self.refresh());self.assertFalse(self.refresh());self.assertEqual(fetch.call_count,1)
 def test_before_two_is_skipped_and_manual_runs(self):
  self.now=self.now.replace(hour=1)
  with patch.object(app.PROVIDERS['strava'],'fetch',return_value={'days':[]}) as fetch:
   self.assertFalse(self.refresh());self.assertTrue(self.refresh(force=True));self.assertEqual(fetch.call_count,1)
 def test_dst_slots(self):
  for day in [(2026,3,29),(2026,10,25),(2026,7,1),(2026,11,2)]:
   local=[datetime(*day,h,17,tzinfo=ZoneInfo('UTC')).astimezone(ZONE) for h in [0,1,2]]
   first=next(n for n in local if nightly.due(n,{},json.loads(self.sources.read_text())))
   self.assertIn(first.hour,[2,3])
 def test_retry_and_failure_preserves_snapshot(self):
  with patch.object(app.PROVIDERS['strava'],'fetch',side_effect=[MenuError('offline'),{'days':[]}]):self.assertTrue(self.refresh())
  old=self.snapshot.read_bytes()
  with patch.object(app.PROVIDERS['strava'],'fetch',side_effect=MenuError('offline')) as fetch:
   with self.assertRaises(RuntimeError):self.refresh(force=True)
   self.assertEqual(fetch.call_count,4);self.assertEqual(self.snapshot.read_bytes(),old)
 def test_snapshot_age(self):
  with patch.object(app.PROVIDERS['strava'],'fetch',return_value={'days':[]}):self.refresh()
  with patch.object(app,'ROOT',self.root),patch.object(app.time,'time',return_value=self.now.timestamp()+100):self.assertEqual(app.read_snapshot('strava','11592')['days'],[])
  with patch.object(app,'ROOT',self.root),patch.object(app.time,'time',return_value=self.now.timestamp()+86401):self.assertIsNone(app.read_snapshot('strava','11592'))
