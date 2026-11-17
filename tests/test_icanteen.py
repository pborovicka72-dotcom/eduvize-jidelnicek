import unittest
from unittest.mock import patch
from connectors.icanteen import ICanteenConnector, parse_menu
from connectors.strava import MenuError
import app

HTML = '''<html><head><title>iCanteen</title><script>Oběd 99</script></head><body>
<div>pondělí&nbsp;16.11.2026</div><div>Oběd 1</div>
<div>Polévka, kuře s rýží (1, 7)</div>
<div>Oběd 2</div><div>Vegetariánské rizoto</div>
<div>úterý 17.11.2026</div><div>Svačina</div><div>Pečivo a čaj [1, 3]</div>
</body></html>'''.encode()

class ICanteenTests(unittest.TestCase):
    def test_public_menu_normalization(self):
        days = parse_menu(HTML)
        self.assertEqual([day['date'] for day in days], ['2026-11-16', '2026-11-17'])
        self.assertEqual(days[0]['meals'][0], {'name': 'Polévka, kuře s rýží', 'group': 'Oběd 1', 'allergens': '1, 7'})
        self.assertEqual(days[0]['meals'][1]['name'], 'Vegetariánské rizoto')

    def test_rejects_non_icanteen_page(self):
        with self.assertRaises(MenuError):
            parse_menu(b'<html><body>Obed 1</body></html>')

    def test_provider_is_registered(self):
        self.assertEqual(app.PROVIDERS['icanteen'].name, 'iCanteen')

    def test_canteen_code_is_validated(self):
        with self.assertRaises(MenuError):
            ICanteenConnector().fetch('../internal')

if __name__ == '__main__':
    unittest.main()
