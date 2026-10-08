import { app, nf, dekar, iTekst, gjeldende, RUTE, OPPLOSNINGER } from '../motor/felles.js';
import { utenPlan } from '../motor/egne.js';
import { byggNaturTall, settSlor, visIKartet } from '../motor/naturtema.js';
import { INONSONER } from '../motor/inon.js';
import { GRAATRINN } from '../motor/graa.js';
import { MdButton, MdCheckbox, Fargelinje } from './deler.jsx';

const andelTekst = p => (p > 0 && p < 0.1 ? '< 0,1 %' : nf(p) + ' %');
/* Fra antall ruter på 21 meter, brukes i setninger. */
const ruteKm2 = n => (n * (OPPLOSNINGER[9] / 2) ** 2) / 1e6,
  daa = n => iTekst(ruteKm2(n));
/* Tallene i raden for et tema som hentes som ett bilde av kommunen: areal og andel av landarealet, eller hvorfor de mangler. */
const radTall = (D, har) => ({
  km: !D || D.tilstand === 'henter' ? '' : D.tilstand === 'feil' ? 'ikke hentet' : har ? dekar(D.sum) : 'ingen',
  pc: har && app.ssbSum ? andelTekst((D.sum / app.ssbSum) * 100) : ''
});
const Kart = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 14.5s4.5-4.2 4.5-7.7a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.7 4.5 7.7z" />
    <circle cx="8" cy="6.7" r="1.6" />
  </svg>
);
const Ut = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.5 3.5h-3v9h9v-3M9.5 3.5h3v3M12.5 3.5l-5.5 5.5" />
  </svg>
);

/* En stripe som viser hvordan et areal fordeler seg. Delene er navn, farge og areal. En farge som begynner med -- er en
   variabel, ellers en klasse i stilarket. */
function Stripe({ deler, hva }) {
  const synlige = deler.filter(d => d[2] > 0),
    sum = deler.reduce((s, x) => s + x[2], 0);
  return (
    <div
      className="bar"
      role="img"
      aria-label={hva + ': ' + synlige.map(d => `${d[0]} ${nf((d[2] / sum) * 100)} prosent`).join(', ')}
    >
      {synlige.map(([navn, stil, v]) =>
        stil.startsWith('--') ? (
          <i key={navn} style={{ flex: `${v} 1 0`, background: `var(${stil})` }} title={`${navn}: ${dekar(v)}`}></i>
        ) : (
          <i key={navn} className={stil} style={{ flex: `${v} 1 0` }} title={`${navn}: ${dekar(v)}`}></i>
        )
      )}
    </div>
  );
}
const Forklar = ({ deler }) => (
  <div className="tegn">
    {deler.map(([navn, stil, tall]) => (
      <span key={navn}>
        <i className={stil}></i>
        {navn + ' '}
        <b>{tall}</b>
      </span>
    ))}
  </div>
);

/* Helhetsbildet for verdsatt natur: landarealet delt i kartlagt og ikke kartlagt, og så hver del for seg med verdsatt natur etter
   verdi. Det vi ikke vet noe om, tegnes som en tom ramme. Slik skilles «ingenting funnet» fra «ikke lett». */
function Helhet({ t, H, E }) {
  const { L, K, U, inne, ute, si, su } = H,
    pst = (a, b) => (b > 0 ? nf((a / b) * 100) : '0'),
    verdier = a => t.klasser.map(([navn, id], v) => [navn, '--' + id, a[v]]);
  return (
    <>
      <h3>Helhetsbildet: verdsatt natur og kartlegging</h3>
      <Stripe
        deler={[
          ['Kartlagt', 'kjent', K],
          ['Ikke kartlagt', 'tom', U]
        ]}
        hva="Landarealet"
      />
      <Forklar
        deler={[
          ['Kartlagt', 'kjent', `${dekar(K)} (${pst(K, L)} %)`],
          ['Ikke kartlagt', 'tom', `${dekar(U)} (${pst(U, L)} %)`]
        ]}
      />
      <h4>Der det er kartlagt</h4>
      <Stripe
        deler={[...verdier(inne), ['Ingen verdsatt natur registrert', 'kjent', Math.max(0, K - si)]]}
        hva="Det kartlagte"
      />
      <p>{`${pst(si, K)} % har verdsatt natur (${dekar(si)}).`}</p>
      <h4>Der det ikke er kartlagt</h4>
      <Stripe deler={[...verdier(ute), ['Ukjent', 'tom', Math.max(0, U - su)]]} hva="Det som ikke er kartlagt" />
      <p>
        {su > 0
          ? `${pst(su, U)} % har registrert verdsatt natur (${dekar(su)}), fra eldre kartlegging og utvalgte naturtyper. For resten finnes det ikke noe kart over hvor det er lett.`
          : 'Ingen verdsatt natur er registrert her, og det finnes ikke noe kart over hvor det er lett.'}
      </p>
      <p className="hint">
        {`Fargene er de samme som i tabellen over. Lave tall der det ikke er kartlagt, kan bety at det ikke er lett, ikke at naturen mangler verdi. Det kartlagte er ikke et tilfeldig utvalg av kommunen, så andelen derfra kan ikke overføres direkte til resten.${E.fra ? ` Kartlagt etter Miljødirektoratets instruks ${E.fra === E.til ? E.fra : E.fra + '–' + E.til}.` : ''}`}
      </p>
    </>
  );
}

/* Et naturtema fra Miljødirektoratet: tallene i raden og innholdet i detaljene. */
export function NaturBlokk(t) {
  const D = t.data,
    ok = !!D && !!app.valgt && D.nr === app.valgt.nr,
    o = ok ? D.omrader : [],
    sum = ok ? D.sum || 0 : 0,
    E = ok ? D.ekstra : null,
    kartlagt = ok && !!E && E.km2 > 0,
    hint = `Kilde: ${t.kildetekst}. Arealet gjelder den delen av hvert område som ligger i kommunen, og er regnet ut i nettleseren.${t.vann ? ' Verneområder kan også ligge i sjø og innsjøer, så andelen av landarealet er et omtrentlig mål.' : ''}`;
  const tall = {
    km: !ok ? '' : D.feil ? 'ikke hentet' : o.length ? dekar(sum) : 'ingen',
    pc: ok && !D.feil && o.length && app.ssbSum ? andelTekst((sum / app.ssbSum) * 100) : '',
    un: ''
  };
  const slor = t.dekning ? (
    <div hidden={!kartlagt}>
      <MdCheckbox
        id={t.id + 'slor'}
        className="valg"
        checked={app.slorPaa}
        onChange={e => settSlor(t, e.target.checked)}
        label="Legg et lyst slør over det som ikke er kartlagt, når laget er på."
      />
    </div>
  ) : null;
  if (!ok)
    return {
      tall,
      innhold: (
        <>
          <p id={t.id + 'sum'}>{app.valgt ? 'Henter …' : ''}</p>
          <ul id={t.id + 'tegn'}></ul>
          <div id={t.id + 'helhet'} className="helhet" hidden></div>
          <p id={t.id + 'merk'}></p>
          {slor}
          <p id={t.id + 'plan'} role="status"></p>
          <p id={t.id + 'gap'} role="status"></p>
          <ul id={t.id + 'liste'}></ul>
          <p className="hint">{hint}</p>
        </>
      )
    };
  const N = byggNaturTall(D, t.klasser, !!t.dekning, !!t.samlet, app.ssbSum),
    uten = utenPlan(),
    der = app.ov && app.ov.dynamisk ? ' i den delen av kommunen det er hentet kart for' : '',
    helhet = !!t.dekning && !!N.helhet;
  const sumTekst = D.feil
    ? `${t.navn} kunne ikke hentes fra Miljødirektoratet.`
    : !o.length
      ? `Miljødirektoratet har ingen ${t.fl} registrert i kommunen.`
      : `${nf(o.length, 0)} ${o.length === 1 ? t.en + ' dekker' : t.fl + ' dekker'} ca. ${iTekst(sum)} av kommunen${app.ssbSum ? `, ${nf((sum / app.ssbSum) * 100)} % av landarealet` : ''}.${D.ufullstendig ? ' Tjenesten ga ikke alle lokalitetene i ett svar, så tallet er for lavt.' : ''}${t.klasser && D.klasser && o.length ? ` Ca. ${iTekst(D.klasser[0] + D.klasser[1])} har stor eller svært stor verdi.` : ''}`;
  const merk =
    !E || helhet
      ? ''
      : !(E.km2 > 0)
        ? 'Kommunen er ikke kartlagt etter Miljødirektoratets instruks. Laget viser da bare eldre registreringer og utvalgte naturtyper.'
        : `Ca. ${app.ssbSum ? nf(Math.min(100, (E.km2 / app.ssbSum) * 100)) + ' % av landarealet' : iTekst(E.km2)} er kartlagt etter Miljødirektoratets instruks${E.fra ? ` (${E.fra === E.til ? E.fra : E.fra + '–' + E.til})` : ''}. Utenfor det kartlagte kan det finnes verdifull natur som ikke er registrert.`;
  const { plan, smal } = N;
  let planInnhold = null;
  if (o.length) {
    if (uten)
      planInnhold = 'Kommunen har ingen kommuneplan hos DiBK, så påvirkning fra planlagt utbygging kan ikke vurderes.';
    else if (!D.regnet) planInnhold = 'Påvirkning fra planlagt utbygging regnes ut når kartet er hentet.';
    else {
      const ant = N.berort;
      planInnhold = (
        <>
          <b>
            {plan
              ? `Ca. ${daa(plan)} planlagt utbygging ligger innenfor ${ant === 1 ? 'ett ' + t.en : ant + ' ' + t.fl}${der}.`
              : `Ingen planlagt utbygging innenfor ${t.best}${der}.`}
          </b>
          {smal
            ? ` I tillegg kommer ca. ${daa(smal)} i smale striper, som oftest der grensene ikke er tegnet helt likt.`
            : null}
        </>
      );
    }
  }
  const G = t.dekning && D.gap && D.gap.nat && D.regnet && !uten ? D.gap : null;
  tall.un = !o.length
    ? ''
    : (t.dekning && E && app.ssbSum
        ? (E.km2 > 0
            ? `${nf(Math.min(100, (E.km2 / app.ssbSum) * 100), 0)} % av landarealet er kartlagt`
            : 'ikke kartlagt etter dagens instruks') + '\n'
        : '') +
      (uten
        ? 'ingen kommuneplan å krysse med'
        : !D.regnet
          ? 'planlagt utbygging ikke regnet ut ennå'
          : (plan ? `ca. ${dekar(ruteKm2(plan))} planlagt utbygging innenfor` : 'ingen planlagt utbygging innenfor') +
            (app.ov && app.ov.dynamisk ? ', i hentet kart' : ''));
  const maks = t.samlet ? 15 : 40,
    vises = N.vises;
  return {
    tall,
    innhold: (
      <>
        <p id={t.id + 'sum'}>{sumTekst}</p>
        <ul id={t.id + 'tegn'}>
          {N.klasser
            ? t.klasser.map(([navn, id], v) => {
                const { antall, plan: pl } = N.klasser[v];
                return (
                  <Fargelinje
                    key={id}
                    id={id}
                    navn={navn}
                    tall={dekar(D.klasser[v])}
                    under={`${nf(antall, 0)} ${antall === 1 ? 'lokalitet' : 'lokaliteter'}`}
                    ekstra={pl && D.regnet && !uten ? ` · ca. ${daa(pl)} planlagt utbygging` : null}
                  />
                );
              })
            : null}
        </ul>
        <div id={t.id + 'helhet'} className="helhet" hidden={!helhet}>
          {helhet ? <Helhet t={t} H={N.helhet} E={E} /> : null}
        </div>
        <p id={t.id + 'merk'}>{merk}</p>
        {slor}
        <p id={t.id + 'plan'} role="status">
          {planInnhold}
        </p>
        <p id={t.id + 'gap'} role="status">
          {G ? (
            <>
              <b>{`Av ca. ${daa(G.nat)} planlagt utbygging på natur${der} ligger ca. ${daa(G.ukjent)} (${nf((G.ukjent / G.nat) * 100, 0)} %) i områder som ikke er kartlagt.`}</b>
              {' Der vet vi ikke om det finnes verdifull natur. Smale striper er ikke med.'}
            </>
          ) : null}
        </p>
        <ul id={t.id + 'liste'}>
          {vises.slice(0, maks).map(x => {
            const liId = `${t.id}-omr-${o.indexOf(x)}`;
            return (
              <li id={liId} key={liId}>
                <b>{x.navn}</b>
                <span>{dekar(x.km2)}</span>
                <small>
                  {x.under || ''}
                  {x.plan ? <b>{` · ca. ${daa(x.plan)} planlagt utbygging`}</b> : null}
                </small>
                <div className="gjor">
                  <MdButton
                    theme="secondary"
                    mode="small"
                    aria-label={`Vis ${x.navn} i kartet`}
                    onClick={() => visIKartet(t, x, liId)}
                  >
                    <Kart />
                    Vis i kartet
                  </MdButton>
                  {x.url ? (
                    <a
                      className="md-button md-button--secondary md-button--small"
                      href={x.url}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Åpne faktaark for ${x.navn} hos Miljødirektoratet, i ny fane`}
                      title="Åpnes i ny fane"
                    >
                      Åpne faktaark
                      <Ut />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
          {vises.length > maks ? <li>{`… og ${vises.length - maks} til`}</li> : null}
        </ul>
        <p className="hint">{hint}</p>
      </>
    )
  };
}

/* Inngrepsfri natur: tallene i raden og innholdet i detaljene. */
export function InonBlokk() {
  const D = gjeldende(app.inon),
    ok = !!D && D.tilstand === 'ok',
    har = ok && D.sum > 0;
  const tekst =
    !D || D.tilstand === 'henter'
      ? app.valgt
        ? 'Henter …'
        : ''
      : !ok
        ? 'Inngrepsfri natur kunne ikke hentes fra Miljødirektoratet.'
        : !har
          ? 'Kommunen har ingen inngrepsfri natur: alt ligger nærmere enn én kilometer fra tyngre tekniske inngrep, som veier, kraftlinjer og regulerte vassdrag.'
          : `Ca. ${iTekst(D.sum)} av kommunen${app.ssbSum ? `, ${nf((D.sum / app.ssbSum) * 100)} % av landarealet,` : ''} ligger minst én kilometer fra tyngre tekniske inngrep, som veier, kraftlinjer og regulerte vassdrag.`;
  const merk = !har
    ? ''
    : !app.vis.nat
      ? 'Laget følger klassen natur, som er slått av i kartet nå.'
      : app.inonPaa
        ? 'I kartet vises naturen nå i fire grønntoner:'
        : 'Når laget er på, vises naturen i kartet i fire grønntoner:';
  return {
    tall: { ...radTall(D, har), un: har ? 'krysses ikke med planlagt utbygging' : '' },
    innhold: (
      <>
        <p id="inonsum">{tekst}</p>
        <p id="inonmerk">{merk}</p>
        <ul id="inonliste">
          {har ? (
            <>
              <Fargelinje id="nat" navn="Annen natur" tall="" under="Nærmere enn 1 km fra inngrep" />
              {[2, 1, 0].map(i => (
                <Fargelinje
                  key={i}
                  id={INONSONER[i][1]}
                  navn={INONSONER[i][4]}
                  tall={dekar(D.soner[i])}
                  under={INONSONER[i][3]}
                />
              ))}
            </>
          ) : null}
        </ul>
        <p id="inonplan" hidden={!har}>
          <b>Inngrepsfri natur kan ikke krysses med planlagt utbygging slik de andre temaene kan.</b> Sonene følger
          avstanden til nærmeste tyngre tekniske inngrep. Et nytt inngrep kan derfor flytte sonegrensene flere kilometer
          unna, også når det ikke ligger i en sone selv.
        </p>
        <p className="hint">
          Kilde: Miljødirektoratet, inngrepsfrie naturområder, nyeste status (2023). Sonene hentes som ett bilde av hele
          kommunen når kommunen velges, og både kartlaget og arealet lages av det i nettleseren. Arealet gjelder alt
          innenfor sonene, også innsjøer, så andelen av landarealet er et omtrentlig mål. I kartet er det bare klassen
          natur som får sonefarge.
        </p>
      </>
    )
  };
}

/* Grått areal: tallene i raden og innholdet i detaljene. */
export function GraaBlokk() {
  const D = gjeldende(app.graa),
    ok = !!D && D.tilstand === 'ok',
    har = ok && D.sum > 0,
    K = gjeldende(app.graaKryss);
  const tekst =
    !D || D.tilstand === 'henter'
      ? app.valgt
        ? 'Henter …'
        : ''
      : !ok
        ? 'Grått areal kunne ikke hentes fra NIBIO.'
        : !har
          ? 'Kartet over grå arealer har ingen flater i kommunen.'
          : `Ca. ${iTekst(D.sum)} av kommunen${app.ssbSum ? `, ${nf((D.sum / app.ssbSum) * 100)} % av landarealet,` : ''} er grått areal: tatt i bruk eller sterkt påvirket av bygge- og anleggsaktivitet. Mye av det grå er likevel grønt. Tabellen viser arealet etter hvor stor del av hver flate som er vegetasjon.`;
  let plan = null;
  if (har) {
    if (K && K.S.tot) {
      const S = K.S,
        dk = n => iTekst(n * RUTE);
      plan = (
        <>
          <b>{`Av ca. ${dk(S.tot)} planlagt utbygging på land${K.delvis ? ' i hentet kart' : ''} ligger ca. ${dk(S.graa)} (${nf((S.graa / S.tot) * 100, 0)} %) på grått areal.`}</b>
          {` Det er gjenbruk av areal som alt er tatt i bruk. Ca. ${dk(S.gron)} av dette er flater med minst halvparten vegetasjon, så også gjenbruk kan ta grønt.${S.gront ? ` I tillegg ligger ca. ${dk(S.gront)} på grønt i bebygd område.` : ''}${K.antallEgne ? ' Tallene inkluderer egne områder.' : ''} Her er all planlagt utbygging med, også på bebygd areal og i smale striper.`}
        </>
      );
    } else
      plan = utenPlan()
        ? 'Kommunen har ingen kommuneplan hos DiBK å krysse med.'
        : 'Planlagt utbygging på grått areal regnes ut når kartet er hentet.';
  }
  return {
    tall: {
      ...radTall(D, har),
      un:
        har && K && K.S.tot
          ? `${nf((K.S.graa / K.S.tot) * 100, 0)} % av planlagt utbygging ligger på grått areal${K.delvis ? ', i hentet kart' : ''}`
          : ''
    },
    innhold: (
      <>
        <p id="graasum">{tekst}</p>
        <ul id="graaliste">
          {har ? (
            <>
              {GRAATRINN.map(([id, navn], i) => (
                <Fargelinje key={id} id={id} navn={navn} tall={dekar(D.trinn[i + 1])} />
              ))}
              {D.trinn[6] > 0 ? (
                <Fargelinje id="graa0" navn="Uten oppgitt andel, som veier" tall={dekar(D.trinn[6])} />
              ) : null}
              <Fargelinje
                id="gront"
                navn="Grønt i bebygd område"
                tall={K ? (K.delvis ? 'minst ' : '') + dekar(K.gront * RUTE) : ''}
                under="Ikke grått areal. Parker, idrettsanlegg, golfbaner og lignende, som grunnkartet regner som bebygd og opparbeidet. Det er grønt, men telles ikke som natur."
              />
            </>
          ) : null}
        </ul>
        <p id="graaplan" role="status">
          {plan}
        </p>
        <p id="graamerk" hidden={!har}>
          <b>Grått betyr ikke ledig.</b> Kartet skiller ikke mellom et boligområde i bruk og en nedlagt industritomt, og
          sier ikke noe om hva som kan bygges om. Det må leses sammen med lokal kunnskap.
        </p>
        <p className="hint">
          Kilde: Kart over grå arealer, Miljødirektoratet, Kartverket, NIBIO og SSB (testversjon 1, 2025), hentet fra
          NIBIO som to bilder av hele kommunen, og som fliser når kartet er zoomet inn. Arealene er regnet ut i
          nettleseren. Andel bygninger er ikke med, fordi tjenesten foreløpig oppgir 0 for alle flater vi har slått opp.
          I kartet er lysere grått mer vegetasjon, og blågrønt er grønt i bebygd område. Det blågrønne er regnet ut som
          bebygd areal i grunnkartet som ikke er grått. I en stikkprøve på 140 punkter i Trondheim var 133 det
          grunnkartet kaller grønne arealer.
        </p>
      </>
    )
  };
}
