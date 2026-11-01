/* Meal semantics shared by all output modes; the provider's meal text remains intact. */
(function(root){
 const paths={
 breakfast:'<path d="M5 12a7 7 0 0 1 14 0M3 12h18M6 16h12v5H6zM12 2v3M4 5l2 2m14-2-2 2"/>',
 lunch:'<circle cx="13" cy="12" r="7"/><circle cx="13" cy="12" r="4"/><path d="M2 3v7m3-7v7M2 7h3m-1.5 3v11M23 3v18"/>',
 dinner:'<path d="M20 9A8 8 0 0 1 8 3a8 8 0 1 0 12 6ZM4 20h16"/>',
 soup:'<path d="M3 12h18a9 9 0 0 1-18 0ZM6 21h12M7 3c-3 3 3 3 0 6m5-6c-3 3 3 3 0 6m5-6c-3 3 3 3 0 6"/>',
 drinks:'<path d="M5 7h14l-2 14H7ZM5 11h14M13 7l2-5h5"/>',
 fruit:'<path d="M12 7c-7-5-12 5-6 12 2 3 4 2 6 1 2 1 4 2 6-1 6-7 1-17-6-12ZM12 7c0-4 2-5 5-5-1 3-2 4-5 5Z"/>',
 dessert:'<path d="M3 12h18v9H3ZM3 16c3 4 3-4 6 0s3-4 6 0 3-4 6 0M6 12V8h12v4M12 8V5m0-3v1"/>',
 vegetables:'<path d="m5 21 5-13 6 6-11 7ZM12 8l3-5m0 8 6-3m-6 3 3-7M8 13l3 2"/>',
 snack:'<path d="M3 16 12 5l9 11H3Zm0 0v4h18v-4M8 15l4-5 4 5"/>',
 other:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>'
 };
 function kind(group,name=''){
  const g=String(group).toLocaleLowerCase('cs'),n=String(name).toLocaleLowerCase('cs');
  if(/snídan|snidan/.test(g))return 'breakfast';
  if(/polév|polev/.test(g))return 'soup';
  if(/oběd|obed|menu/.test(g))return 'lunch';
  if(/večeř|vecer/.test(g))return 'dinner';
  if(/nápoj|napoj|pití/.test(g))return 'drinks';
  if(/dezert|mouční|moucni|zákus|zakus/.test(g))return 'dessert';
  if(/ovoce/.test(g))return 'fruit';
  if(/zelenin/.test(g))return 'vegetables';
  if(/svačin|svacin/.test(g))return 'snack';
  if(/doplněk|doplnek|ostatní/.test(g)){
   if(/^(čaj|caj|mléko|mleko|ochucené mléko|voda|džus|dzus|šťáv|stáv|kakao|nápoj)/.test(n))return 'drinks';
   if(/ovoce|jablk|banán|pomeranč|hrušk/.test(n))return 'fruit';
   if(/zelenin|salát/.test(n))return 'vegetables';
   if(/dezert|mouční|bucht|puding|jogurt|koláč|zákus/.test(n))return 'dessert';
  }
  return 'other';
 }
 const labels={breakfast:'Snídaně',lunch:'Oběd',dinner:'Večeře',soup:'Polévka',drinks:'Nápoje',fruit:'Ovoce',dessert:'Dezert',vegetables:'Zelenina',snack:'Svačina',other:'Ostatní'};
 function expand(meal){
  const supplement=/^(doplněk|doplnek|ostatní)$/i.test(meal.group.trim());
  const groups=new Map();
  for(const name of supplement?meal.name.split(',').map(x=>x.trim()).filter(Boolean):[meal.name]){
   const type=kind(meal.group,name),variant=String(meal.group).match(/(?:oběd|obed|menu)\s*(\d+)/i)?.[1]||'';
   const key=type+variant;
   if(!groups.has(key))groups.set(key,{...meal,type,variant,label:supplement?labels[type]:variant?'Oběd · menu '+variant:meal.group,names:[]});
   groups.get(key).names.push(name);
  }
  return [...groups.values()].map(x=>({...x,name:x.names.join(', '),sharedAllergens:supplement}));
 }
 root.EduvizeMeals=Object.freeze({paths,kind,expand,labels});
})(typeof window==='undefined'?globalThis:window);
