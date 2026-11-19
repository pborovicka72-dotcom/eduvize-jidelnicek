import unittest
from connectors.menu_structure import structure_meal
from connectors.icanteen import parse_menu


class MenuStructureTests(unittest.TestCase):
    def test_zskomtu_soup_main_and_trailing_extras_keep_menu_variant(self):
        raw='Pol. slovenská zelná, kaše z ovesných vloček s medem a ovocem, mléko, mrkvový salát _{(1, 7, 8)}'
        meal=structure_meal('Oběd BLP',raw)
        self.assertEqual(meal['sourceText'],raw)
        self.assertEqual([c['group'] for c in meal['components']],['Polévka','Oběd BLP','Doplněk','Doplněk'])
        self.assertEqual(meal['components'][1]['name'],'kaše z ovesných vloček s medem a ovocem')
        self.assertTrue(all(c['variant']=='BLP' and c['allergenScope']=='menu' for c in meal['components']))

    def test_0463_allergen_markers_separate_unpunctuated_soup_and_main(self):
        meal=structure_meal('Oběd BL','polévka falešná dršťková z hlívy ústřičné A: 16 treska, maštěné brambory, mrkvový salát A: 4;')
        soup,main,extra=meal['components']
        self.assertEqual(soup['name'],'polévka falešná dršťková z hlívy ústřičné')
        self.assertEqual(soup['allergens'],'16');self.assertEqual(soup['allergenScope'],'course')
        self.assertEqual(main['name'],'treska, maštěné brambory');self.assertEqual(main['allergens'],'4')
        self.assertEqual(extra['name'],'mrkvový salát');self.assertEqual(extra['allergenScope'],'section')
        empty=structure_meal('Oběd KMB','Kulajda A: Gnocchi se špenátem A: 3;')
        self.assertEqual(empty['components'][0]['allergens'],'')
        self.assertEqual(empty['components'][1]['name'],'Gnocchi se špenátem')

    def test_0316_number_without_space_drinks_and_full_breakfast(self):
        meal=structure_meal('Oběd1','Polévka čočková, hovězí po myslivecku, bramborový knedlík, nápoj, voda, čaj (1, 3)')
        self.assertEqual(meal['components'][1]['name'],'hovězí po myslivecku, bramborový knedlík')
        self.assertEqual([c['name'] for c in meal['components'][2:]],['nápoj','voda','čaj'])
        html='<title>iCanteen</title><div>18.11.2026</div><div>Snídaně1</div><div>Houska, máslo, čaj (1,7)</div><div>Dop. svač.</div><div>Kefír, piškoty (1,7)</div>'
        self.assertEqual([m['group'] for m in parse_menu(html.encode())[0]['meals']],['Snídaně1','Dop. svač.'])

    def test_0248_ingredient_commas_and_course_allergens_are_not_lost(self):
        raw='Bramboračka se zeleninou, houbami a kroupami (1, 9), Zeleninové rizoto s quinoou sypané sýrem (7)'
        meal=structure_meal('Oběd VEGE',raw)
        self.assertEqual(meal['components'][0]['name'],'Bramboračka se zeleninou, houbami a kroupami')
        self.assertEqual(meal['components'][0]['allergens'],'1, 9')
        self.assertEqual(meal['components'][1]['allergens'],'7')
        raw='Finská rybí polévka s bramborem, mrkví, koprem a smetanou (4, 7), Luštěninový kotlík (čočka, fazole, mrkev), chléb (1, 6, 9)'
        main=structure_meal('Oběd',raw)['components'][1]['name']
        self.assertEqual(main,'Luštěninový kotlík (čočka, fazole, mrkev), chléb')

    def test_0022_dash_and_supplement_before_garnish_preserve_all_foods(self):
        meal=structure_meal('Oběd 1','Polévka žampionový krém - Vepřové rizoto, červená řepa, sýr (1, 3, 7, 9)')
        self.assertEqual(meal['components'][0]['name'],'Polévka žampionový krém')
        # A comma is not sufficient evidence to move a side dish out of the main course.
        self.assertEqual(meal['components'][1]['name'],'Vepřové rizoto, červená řepa, sýr')

    def test_salad_main_unknown_prose_and_non_lunch_meals_are_not_guessed(self):
        raw='Ceasar salát s grilovaným sýrem Haloumi, corn rohlík (1, 7)'
        self.assertNotIn('components',structure_meal('Oběd 2',raw))
        raw='Tortilly plněné kuřecím masem, zeleninou a dresinkem, mrkvový salát (1, 3, 7)'
        self.assertEqual(structure_meal('Oběd 2',raw)['components'][0]['name'],'Tortilly plněné kuřecím masem, zeleninou a dresinkem')
        for group,raw in [('Oběd','Překvapení kuchaře'),('Oběd','STÁTNÍ SVÁTEK ZAVŘENO'),('Dop. svač.','Ovocný kefír, piškoty, ovoce (1,3,7)')]:
            self.assertNotIn('components',structure_meal(group,raw))
        shared=structure_meal('Oběd','Polévka zeleninová, kuře s rýží (1,7), ovoce')
        self.assertEqual(shared['components'][0]['name'],'Polévka zeleninová')
        self.assertEqual(shared['components'][1]['name'],'kuře s rýží')
        self.assertTrue(all(c['allergenScope']=='menu' for c in shared['components']))
