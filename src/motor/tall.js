/* Tallene fra SSB: arealklasser, land og vann, og anslått utvikling. */
import { KL, VANN, SSB, M, app, endret, hent } from './felles.js';

/* Land og vann: land, innsjø og elv er SSBs tall. Hav har SSB ikke tall for per kommune, så det regnes ut som
   kommunens flate (grensen fra Kartverket) minus land og ferskvann. Tilstanden ligger i app: arealtall, ssbSum, ferskvann,
   flate, historie og planSum. */

/* Regning: funksjonene under tolker svar og regner ut tall. De leser ikke fra siden og skriver ikke til den. */
export function tolkAreal(j) {
  const ix = j.dimension.ArealKlasse.category.index,
    tid = j.dimension.Tid.category.index;
  const pos = Array.isArray(ix) ? Object.fromEntries(ix.map((c, i) => [c, i])) : ix;
  return {
    a: KL.map(x => x[3].reduce((s, c) => s + (j.value[pos[c]] || 0), 0)),
    aar: Array.isArray(tid) ? tid[0] : Object.keys(tid)[0],
    ferskvann: { inn: j.value[pos['22.01']] || 0, elv: j.value[pos['22.02']] || 0 }
  };
}
export function tolkHistorie(j, nr) {
  /* arealet per klasse i 2017 og i siste år, eller ingenting hvis serien ikke rekker tilbake til 2017 */
  const liste = x => (Array.isArray(x) ? x : Object.keys(x).sort((a, b) => x[a] - x[b])),
    kl = liste(j.dimension.ArealKlasse.category.index),
    aar = liste(j.dimension.Tid.category.index),
    nT = aar.length;
  const v = (c, t) => j.value[kl.indexOf(c) * nT + t] || 0,
    sum = t => KL.map(x => x[3].reduce((s, c) => s + v(c, t), 0)),
    alt = t => sum(t).reduce((s, x) => s + x, 0) + v('22.01', t) + v('22.02', t);
  const f = aar.indexOf('2017');
  if (f < 0 || nT - f < 2 || !alt(f) || !alt(nT - 1)) return null;
  return {
    nr,
    fra: aar[f],
    til: aar[nT - 1],
    a0: sum(f),
    a1: sum(nT - 1),
    endret: Math.abs(alt(nT - 1) - alt(f)) / alt(nT - 1) > 0.005
  };
}
export function tolkVann(flate, land, ferskvann) {
  /* delene av kommunens flate, i km². Hav er det som blir igjen. */
  if (!land || !ferskvann || !flate) return null;
  let hav = flate - land - ferskvann.inn - ferskvann.elv;
  if (hav < Math.max(0.5, flate * 0.005)) hav = 0; /* små avvik mellom grense og statistikk er ikke hav */
  return {
    hav,
    deler: [
      ['land', 'Land', land],
      ['inn', 'Innsjø', ferskvann.inn],
      ['elv', 'Elv', ferskvann.elv],
      ['hav', 'Hav', hav]
    ].filter(d => d[2] > 0)
  };
}
/* Arealet per klasse hvis alt planen setter av, bygges: natur og jordbruk går over til bebygd. */
export const etterPlan = (a, P) => [a[0] + P.nat + P.jor, a[1] - P.jor, a[2] - P.nat];

export function nullstillTall(tilstand) {
  /* ingen tall å vise: de hentes, eller hentingen feilet */
  app.ssbSum = 0;
  app.ferskvann = null;
  app.arealtall = { tilstand };
  endret();
}

/* SSB har to API-er til samme tabell. Det nye brukes først. Svarer det ikke, spørres det eldre om det samme.
   Det eldre tar spørringen som tekst i et POST-kall, og har ikke «fra og med år», så tidsserien kommer med alle år. */
const SSBKODER = [
  ...KL.flatMap(x => x[3]),
  ...VANN.map(x => x[3]).filter(Boolean)
]; /* arealklassene som hentes: de tre på land, og innsjø og elv */
const SSB0 = 'https://data.ssb.no/api/v0/no/table/09594';
async function hentSSB(hva, nytt, region, tid) {
  try {
    return await hent('SSB', hva, nytt);
  } catch (e) {}
  const valg = (code, filter, values) => ({ code, selection: { filter, values } });
  return hent(
    'SSB',
    hva + ', eldre API',
    SSB0,
    false,
    false,
    false,
    JSON.stringify({
      query: [
        valg('Region', ...region),
        valg('ArealKlasse', 'item', SSBKODER),
        valg('ContentsCode', 'item', ['Areal']),
        valg('Tid', ...tid)
      ],
      response: { format: 'json-stat2' }
    })
  );
}
export async function hentTall(k, mitt) {
  try {
    const j = await hentSSB(
      `Areal for ${k.navn}`,
      `${SSB}?lang=no&outputformat=json-stat2&valueCodes[Region]=${k.nr}&valueCodes[ArealKlasse]=${SSBKODER.join(',')}&valueCodes[ContentsCode]=Areal&valueCodes[Tid]=top(1)`,
      ['item', [k.nr]],
      ['top', ['1']]
    );
    if (mitt !== M.valgNr) return;
    const T = tolkAreal(j);
    app.ferskvann = T.ferskvann;
    app.arealtall = { tilstand: 'ok', a: T.a, aar: T.aar };
    app.ssbSum = T.a[0] + T.a[1] + T.a[2];
    endret();
  } catch (e) {
    if (mitt === M.valgNr) nullstillTall('feil');
  }
}
/* Anslått utvikling på tre tidspunkt: SSBs tall for 2017, SSBs nyeste tall, og nyeste tall med planlagt utbygging trukket fra natur
   og jordbruk og lagt til bebygd. SSB advarer mot å lese forskjeller mellom årganger som endring, så dette er et anslag og merkes slik.
   Tallene for 2017 hentes med SSBs sammenslåtte tidsserier, så de gjelder dagens kommune også der kommuner er slått sammen.
   Er kommunens samlede flate likevel en annen i 2017, er grensen flyttet, og da vises ingen sammenligning. */
export async function hentHistorie(k, mitt) {
  try {
    const j = await hentSSB(
      `Areal fra 2017 for ${k.navn}`,
      `${SSB}?lang=no&outputformat=json-stat2&codelist[Region]=agg_KommSummer&outputValues[Region]=aggregated&valueCodes[Region]=K-${k.nr}&valueCodes[ArealKlasse]=${SSBKODER.join(',')}&valueCodes[ContentsCode]=Areal&valueCodes[Tid]=from(2017)`,
      ['agg:KommSummer', ['K-' + k.nr]],
      ['all', ['*']]
    );
    if (mitt !== M.valgNr) return;
    const H = tolkHistorie(j, k.nr);
    if (!H) return;
    app.historie = H;
    endret();
  } catch (e) {} /* uten historiske tall vises ikke blokken */
}
