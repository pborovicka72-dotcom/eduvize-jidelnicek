import unittest
from unittest.mock import patch
from connectors.strava import parse_menu,MenuError
import app
XML=b'<jidelnicky><den datum="02-11-2026"><jidlo druh="Obed 1 " nazev="Rizoto" alergeny="07 -Mleko"/></den></jidelnicky>'
class Tests(unittest.TestCase):
 def test_meals(self):
  d=parse_menu(XML);self.assertEqual(d[0]['date'],'2026-11-02');self.assertEqual(d[0]['meals'][0]['allergens'],'07 -Mleko')
 def test_entity_rejected(self):
  with self.assertRaises(MenuError):parse_menu(b'<!DOCTYPE x><jidelnicky/>')
 def test_invalid_id(self):
  with self.assertRaises(MenuError):app.load_menu('strava','../../etc')
 def test_unknown_provider(self):
  with self.assertRaises(MenuError):app.load_menu('unknown','11592')
 def test_cached(self):
  app.CACHE.clear()
  with patch.object(app,'read_snapshot',return_value=None),patch.object(app.PROVIDERS['strava'],'fetch',return_value={'days':parse_menu(XML)}) as fetch:
   app.load_menu('strava','11592');self.assertTrue(app.load_menu('strava','11592')['cached']);self.assertEqual(fetch.call_count,1)
 def test_last_good_on_failure(self):
  app.CACHE[('strava','11592')]={'days':parse_menu(XML),'updated':app.time.time()-1000}
  with patch.object(app.PROVIDERS['strava'],'fetch',side_effect=MenuError('offline')):
   self.assertTrue(app.load_menu('strava','11592')['stale'])
if __name__=='__main__':unittest.main()
