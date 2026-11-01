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
