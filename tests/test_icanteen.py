import unittest
from unittest.mock import patch
from connectors.icanteen import ICanteenConnector, parse_menu, source_url, public_address
from connectors.strava import MenuError
import app

HTML = '''<html><head><title>iCanteen</title><script>Oběd 99</script></head><body>
<div>pondělí&nbsp;16.11.2026</div><div>Oběd 1</div>
<div>Polévka,\n kuře s rýží\n (1, 7)</div>
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

    def test_hosted_id_and_custom_url(self):
        self.assertEqual(source_url('0340'), 'https://strav.nasejidelna.cz/0340/login')
        self.assertEqual(source_url('https://englisova.skolnijidelny.cz'),
                         'https://englisova.skolnijidelny.cz/login')
        self.assertEqual(source_url('https://strav.nasejidelna.cz/0340'),
                         'https://strav.nasejidelna.cz/0340/login')

    def test_unsafe_sources_are_rejected(self):
        for value in ('http://example.cz/login', 'https://127.0.0.1/login',
                      'https://user:secret@example.cz/login',
                      'https://example.cz/login?token=secret', 'https://localhost/login',
                      'https://example.cz/../admin'):
            with self.subTest(value=value), self.assertRaises(MenuError):
                source_url(value)

    def test_private_dns_is_rejected(self):
        with patch('connectors.icanteen.socket.getaddrinfo',
                   return_value=[(None, None, None, None, ('127.0.0.1', 443))]):
            with self.assertRaises(MenuError):
                public_address('example.cz')

    def test_provider_is_registered(self):
        self.assertEqual(app.PROVIDERS['icanteen'].name, 'iCanteen')

    def test_canteen_code_is_validated(self):
        with self.assertRaises(MenuError):
            ICanteenConnector().fetch('../internal')

if __name__ == '__main__':
    unittest.main()
