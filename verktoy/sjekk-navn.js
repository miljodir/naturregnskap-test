/* Sjekker navnene i skriptene. De er vanlige skript som deler ett navnerom, så feil som moduler ville fanget, må sjekkes her:
   - et navn på toppnivå som er definert i to filer
   - et navn på toppnivå som er likt en id på siden, i index.html eller i komponentene i src (eldre Safari nektet å laste slike skript)
   - et navn som brukes, men ikke er definert noe sted, for eksempel en skrivefeil eller en variabel som er flyttet
   Kjør: node verktoy/sjekk-navn.js */
const acorn = require('acorn'),
  { analyze } = require('eslint-scope'),
  fs = require('fs'),
  path = require('path');
const ROT = path.resolve(__dirname, '..'),
  MAPPE = path.join(ROT, 'public', 'js');
/* Det nettleseren og bibliotekene gir. Språkets egne navn (Math, Map, Promise og så videre) hentes fra Node. */
const NETTLESER = [
  'window',
  'document',
  'location',
  'history',
  'performance',
  'fetch',
  'URL',
  'URLSearchParams',
  'Blob',
  'Image',
  'Option',
  'createImageBitmap',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'matchMedia',
  'getComputedStyle',
  'MutationObserver',
  'ol',
  'proj4',
  'polygonClipping'
];
const definert = new Map(),
  brukt = [];
for (const f of fs.readdirSync(MAPPE).filter(x => x.endsWith('.js'))) {
  const tre = acorn.parse(fs.readFileSync(path.join(MAPPE, f), 'utf8'), {
    ecmaVersion: 2022,
    ranges: true,
    locations: true
  });
  const sm = analyze(tre, { ecmaVersion: 2022, sourceType: 'script' });
  for (const v of sm.globalScope.variables) {
    if (!definert.has(v.name)) definert.set(v.name, []);
    definert.get(v.name).push(f);
  }
  for (const r of sm.globalScope.through) brukt.push([r.identifier.name, f, r.identifier.loc.start.line]);
}
let feil = 0;
const meld = t => {
  feil++;
  console.log(t);
};
for (const [navn, filer] of definert)
  if (filer.length > 1) meld(`${navn} er definert i flere filer: ${filer.join(', ')}`);
const sider = [
  'index.html',
  ...fs
    .readdirSync(path.join(ROT, 'src'))
    .filter(f => f.endsWith('.jsx'))
    .map(f => path.join('src', f))
];
for (const side of sider)
  for (const [, id] of fs.readFileSync(path.join(ROT, side), 'utf8').matchAll(/\bid="([^"]+)"/g))
    if (definert.has(id)) meld(`${id} er både en id i ${side} og et navn i ${definert.get(id)[0]}`);
const meldt = new Set();
for (const [navn, fil, linje] of brukt) {
  if (definert.has(navn) || NETTLESER.includes(navn) || navn in globalThis || meldt.has(navn + fil)) continue;
  meldt.add(navn + fil);
  meld(`${fil}:${linje} bruker ${navn}, som ikke er definert noe sted`);
}
console.log(
  feil
    ? `\n${feil} feil.`
    : `${definert.size} navn på toppnivå i ${new Set([...definert.values()].flat()).size} filer, ingen feil.`
);
process.exit(feil ? 1 : 0);
