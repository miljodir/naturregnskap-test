/* Sjekker at regning og tegning holdes fra hverandre. Funksjoner som regner, skal kunne flyttes til en annen løsning uten å ta
   med seg siden: de får alt de trenger som argumenter og gir svaret tilbake. De skal derfor ikke lese eller skrive sidens
   innhold, ikke røre kartet, ikke hente fra nettet og ikke bruke delt tilstand (app, og variabler på toppnivå laget med let).

   En funksjon regnes som regning når navnet begynner med tolk, kryss, bygg, tell eller les, eller står i listen under.
   Kjør: node verktoy/sjekk-regning.js */
const acorn = require('acorn'),
  walk = require('acorn-walk'),
  fs = require('fs'),
  path = require('path');
const MAPPE = path.resolve(__dirname, '..', 'public', 'js');
const REGNING = /^(tolk|kryss|bygg|tell|les)[A-ZÆØÅ]/;
const OGSAA = [
  'ryddStriper',
  'etterPlan',
  'klasseAreal',
  'naturMaske',
  'rutenett',
  'utm33',
  'jevn',
  'graaTrinn',
  'inonSone',
  'finnProjeksjon',
  'tilFarge',
  'klasseAv'
];
const FORBUDT = ['app', '$', 'document', 'window', 'kart', 'view', 'hent', 'fetch', 'logg', 'friskOpp'];
const TEGNING = /^vis[A-ZÆØÅ]/;

const monster = (p, ut) => {
  if (!p) return;
  if (p.type === 'Identifier') ut.add(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => monster(q.value || q.argument, ut));
  else if (p.type === 'ArrayPattern') p.elements.forEach(q => monster(q, ut));
  else if (p.type === 'AssignmentPattern') monster(p.left, ut);
  else if (p.type === 'RestElement') monster(p.argument, ut);
};
const filer = fs.readdirSync(MAPPE).filter(f => f.endsWith('.js')),
  tilstand = new Set(),
  funksjoner = [];
for (const f of filer) {
  const tre = acorn.parse(fs.readFileSync(path.join(MAPPE, f), 'utf8'), { ecmaVersion: 2022, locations: true });
  for (const n of tre.body) {
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) {
        if (n.kind === 'let') monster(d.id, tilstand);
        if (d.id.type === 'Identifier' && d.init && /Function/.test(d.init.type))
          funksjoner.push([f, d.id.name, d.init]);
      }
    } else if (n.type === 'FunctionDeclaration') funksjoner.push([f, n.id.name, n]);
  }
}
let feil = 0,
  antall = 0;
for (const [fil, navn, node] of funksjoner) {
  if (!REGNING.test(navn) && !OGSAA.includes(navn)) continue;
  antall++;
  const egne = new Set(),
    brukt = new Map();
  walk.full(node, n => {
    if (/Function/.test(n.type)) n.params.forEach(p => monster(p, egne));
    if (n.type === 'VariableDeclarator') monster(n.id, egne);
    if (n.type === 'CatchClause') monster(n.param, egne);
  });
  walk.ancestor(node, {
    Identifier(n, forfedre) {
      const over = forfedre[forfedre.length - 2];
      if (over && over.type === 'MemberExpression' && over.property === n && !over.computed)
        return; /* x.navn er ikke en variabel */
      if (over && over.type === 'Property' && over.key === n && !over.computed && over.value !== n)
        return; /* nøkkel i et objekt */
      if (!brukt.has(n.name)) brukt.set(n.name, n.loc.start.line);
    }
  });
  for (const [n, linje] of brukt) {
    if (egne.has(n)) continue;
    const hvorfor = FORBUDT.includes(n)
      ? 'rører siden, kartet eller nettet'
      : TEGNING.test(n)
        ? 'tegner'
        : tilstand.has(n)
          ? 'bruker delt tilstand'
          : null;
    if (hvorfor) {
      feil++;
      console.log(`${fil}:${linje} ${navn} bruker ${n} (${hvorfor})`);
    }
  }
}
console.log(feil ? `\n${feil} brudd i ${antall} regnefunksjoner.` : `${antall} regnefunksjoner sjekket, ingen brudd.`);
process.exit(feil ? 1 : 0);
