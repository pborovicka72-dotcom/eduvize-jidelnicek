const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../meal-model.js'),'utf8'),context);
const model=context.EduvizeMeals;
test('provider meal groups distinguish courses and menu variants',()=>{
 for(const [group,kind]of [['Snídaně','breakfast'],['Oběd 1','lunch'],['Menu 2','lunch'],['Večeře','dinner'],['Polévka','soup'],['Nápoje','drinks'],['Dezert','dessert'],['Ovoce','fruit'],['Svačina','snack']])assert.equal(model.kind(group),kind);
 const meal=model.expand({group:'Oběd 2',name:'Špagety, omáčka a sýr',allergens:'01,07'})[0];assert.equal(meal.variant,'2');assert.equal(meal.name,'Špagety, omáčka a sýr');
});
test('supplement categories preserve source allergens and their whole-supplement scope',()=>{
 const meals=model.expand({group:'Doplněk',name:'Čaj ovocný, Mléko, Ovoce, Zelenina',allergens:'07 -Mléko'});
 assert.equal(meals.length,3);assert.equal(meals[0].name,'Čaj ovocný, Mléko');
 assert.deepEqual(Array.from(meals,x=>x.type),['drinks','fruit','vegetables']);
 for(const meal of meals){assert.equal(meal.allergens,'07 -Mléko');assert.equal(meal.sharedAllergens,true);}
});
test('unknown meal descriptions stay in Other without rewriting food names',()=>{
 const meal=model.expand({group:'Doplněk',name:'Překvapení kuchaře',allergens:''})[0];assert.equal(meal.type,'other');assert.equal(meal.name,'Překvapení kuchaře');assert.equal(model.kind('Oběd','Mléko a pečivo'),'lunch');
});
test('structured iCanteen courses use the same groups as Strava and keep diet variants',()=>{
 const courses=model.expand({group:'Oběd BLP',name:'Původní celý text',allergens:'1,7',components:[
  {group:'Polévka',name:'Vývar',variant:'BLP',sourceGroup:'Oběd BLP',allergens:'9',allergenScope:'course'},
  {group:'Oběd BLP',name:'Kuře, rýže',variant:'BLP',sourceGroup:'Oběd BLP',allergens:'7',allergenScope:'section'},
  {group:'Doplněk',name:'Ovoce',variant:'BLP',sourceGroup:'Oběd BLP',allergens:'7',allergenScope:'section'}]});
 assert.deepEqual(Array.from(courses,x=>x.type),['soup','lunch','fruit']);
 assert.deepEqual(Array.from(courses,x=>x.label),['Polévka · BLP','Oběd · BLP','Ovoce · BLP']);
 assert.equal(courses[0].allergens,'9');assert.equal(courses[1].name,'Kuře, rýže');assert.equal(courses[2].allergenScope,'section');
});
test('a full-menu allergen list is never promoted to per-course certainty',()=>{
 const result=model.expand({group:'Oběd1',name:'Menu',components:[{group:'Polévka',name:'Zelná',variant:'1',allergenScope:'menu',allergens:'1,7'},{group:'Oběd1',name:'Rizoto',variant:'1',allergenScope:'menu',allergens:'1,7'}]});
 assert.deepEqual(Array.from(result,x=>x.type),['soup','lunch']);
 assert.ok(result.every(x=>x.allergenScope==='menu'));assert.equal(result[0].label,'Polévka · menu 1');
});
