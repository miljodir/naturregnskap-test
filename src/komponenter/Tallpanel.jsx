import { KL, app, nf, dekar, iTekst, gjeldende, OPPLOSNINGER } from '../motor/felles.js';
import { byttKlasse } from '../motor/start.js';
import { ingenPlan, byttPlanLag } from '../motor/plan.js';
import { utenPlan } from '../motor/egne.js';
import { tolkVann, etterPlan } from '../motor/tall.js';
import { NATURLAG, byttNatur } from '../motor/naturtema.js';
import { byttInon } from '../motor/inon.js';
import { byttGraa } from '../motor/graa.js';
import { NaturBlokk, InonBlokk, GraaBlokk } from './Tema.jsx';
import { Celle, Rute, MdAccordionItem } from './deler.jsx';

/* Én rad per tema, bygd likt: fargeruten viser temaet i kartet, og resten av raden er en MdAccordionItem som åpner detaljene.
   Raden svarer på det samme for alle temaene: hvor mye som finnes i kommunen, hvor stor del av landarealet det er, og hvor mye
   planlagt utbygging som ligger innenfor. Fargeruten ligger utenfor overskriften, så den ikke også åpner detaljene. */
function TemaRad({ id, navn, klasse, paa, vedBryter, tall, children }) {
  return (
    <div className={`row naturrad ${klasse}`} style={{ '--c': `var(--${id})` }}>
      <button
        type="button"
        className="lagknapp"
        id={id + 'knapp'}
        aria-pressed={String(paa)}
        aria-label={`Vis ${navn.toLowerCase()} i kartet`}
        onClick={vedBryter}
      >
        <span className="sw"></span>
      </button>
      <MdAccordionItem
        id={id + 'blokk'}
        theme="add"
        closeButtonText={`Lukk ${navn.toLowerCase()}`}
        headerContent={
          <div className="apne" id={id + 'apne'}>
            <span className="nm">{navn}</span>
            <span className="km">{tall.km}</span>
            <span className="pc">{tall.pc}</span>
            <span className="un">{tall.un}</span>
          </div>
        }
      >
        <div className="naturblokk">{children}</div>
      </MdAccordionItem>
    </div>
  );
}

/* Tallene for planlagt utbygging under arealklassene, og om kommunen har kommuneplan. */
function Forklaring() {
  const ingen = ingenPlan(),
    i = gjeldende(app.planInfo),
    navn = app.valgt ? app.valgt.navn : '',
    tilstand = app.planTall ? app.planTall.tilstand : 'tom',
    R = gjeldende(app.planRaster);
  const status = !i
    ? ''
    : i.tilstand === 'sjekker'
      ? 'Sjekker om DiBK har en kommuneplan for kommunen …'
      : i.tilstand === 'feil'
        ? 'Fikk ikke sjekket om DiBK har en kommuneplan for kommunen.'
        : ingen
          ? `DiBK har ingen kommuneplan for ${navn}. Planlagt utbygging kan derfor ikke vises eller regnes ut.`
          : `Kommuneplan hentet fra DiBK${i.kilde ? ': ' + i.kilde : ''}.${i.dekning < 0.6 ? ` Planen dekker ca. ${Math.round(i.dekning * 100)} % av kommunens flate, sjø medregnet.` : ''}`;
  let tn = '',
    tj = '',
    note = '',
    egnemerk = '';
  if (tilstand !== 'ok' || !R) {
    tn = tj = tilstand === 'regner' ? 'regner …' : '';
    note =
      tilstand === 'zoom'
        ? 'Zoom inn i kartet for å få et anslag. Arealet regnes ut for den delen av kommunen nettleseren har hentet kart for.'
        : tilstand === 'feil'
          ? 'Arealet kunne ikke regnes ut.'
          : '';
  } else {
    const m = OPPLOSNINGER[R.z] / 2,
      km2 = v => (v * m * m) / 1e6,
      pst = (a, b) => (b ? nf((a / b) * 100) : '0'),
      der = R.delvis ? ' i det hentede kartet' : '';
    const n = R.n,
      { rn, rj } = R.sum,
      basis = R.basis,
      antall = R.antallEgne;
    egnemerk = !antall
      ? ''
      : `Tallene for planlagt utbygging inkluderer ${antall === 1 ? 'ett eget område' : antall + ' egne områder'}. ${ingen ? 'Kommunen har ingen kommuneplan hos DiBK.' : basis.rn + basis.rj ? `Kommuneplanen alene: ca. ${iTekst(km2(basis.rn))} natur og ca. ${iTekst(km2(basis.rj))} jordbruk.` : 'Kommuneplanen alene setter ikke av natur eller jordbruk til utbygging' + der + '.'}`;
    tn = `ca. ${iTekst(km2(rn))}, ${pst(rn, n.nat)} % av naturen${der}${antall ? '' : ` (${iTekst(km2(n.pnat))} med smale striper)`}`;
    tj = `ca. ${iTekst(km2(rj))}, ${pst(rj, n.jor)} % av jordbruket${der}${antall ? '' : ` (${iTekst(km2(n.pjor))} med smale striper)`}`;
    const felles =
      'Smale striper er felt som ikke er bredere enn rundt 40 meter noe sted, ofte langs eksisterende bebyggelse. Smale deler av et større felt regnes med. Stripene vises ikke i kartet med mindre du slår dem på under Tekniske valg. Anslag til illustrasjon, ikke offisiell statistikk.';
    if (R.delvis) {
      const a = km2(n.beb + n.jor + n.nat);
      note = `Gjelder bare den delen av kommunen nettleseren har hentet kart for: ca. ${iTekst(a)} land${app.ssbSum ? ` av ${iTekst(app.ssbSum)} (${nf(Math.min(100, (a / app.ssbSum) * 100))} %)` : ''}. Zoom inn og flytt kartet for å få med mer. Regnet ut i nettleseren med piksler på ${R.rute} meter. ${felles}`;
    } else note = `Regnet ut i nettleseren fra ${R.fliser} kartfliser med piksler på ${R.rute} meter. ${felles}`;
  }
  const uten = utenPlan();
  return (
    <div className="forklaring">
      <p
        id="planstatus"
        role="status"
        className={ingen ? 'md-alert-message md-alert-message--warning md-alert-message--fullWidth' : undefined}
      >
        {status}
      </p>
      <div id="linje-pnat" hidden={uten}>
        <i style={{ background: 'var(--pnat)' }}></i>
        <p>
          Natur som kommuneplanen setter av til framtidig utbygging <b id="tall-pnat">{tn}</b>
        </p>
      </div>
      <div id="linje-pjor" hidden={uten}>
        <i style={{ background: 'var(--pjor)' }}></i>
        <p>
          Jordbruk som kommuneplanen setter av til framtidig utbygging <b id="tall-pjor">{tj}</b>
        </p>
      </div>
      <p id="egnemerk" className="md-alert-message md-alert-message--fullWidth" role="status">
        {egnemerk}
      </p>
      <p id="tallnote">{note}</p>
    </div>
  );
}

/* Anslått utvikling på tre tidspunkt: SSBs tall for 2017, SSBs nyeste tall, og nyeste tall med planlagt utbygging trukket fra natur
   og jordbruk og lagt til bebygd. */
function Utvikling() {
  const H = gjeldende(app.historie);
  if (!H)
    return (
      <div className="utvikling" id="utvikling" hidden>
        <h2>Anslått utvikling</h2>
        <table id="utvtab"></table>
        <p id="utvsum"></p>
        <p className="hint" id="utvnote"></p>
      </div>
    );
  if (H.endret)
    return (
      <div className="utvikling" id="utvikling">
        <h2>Anslått utvikling</h2>
        <table id="utvtab" hidden></table>
        <p id="utvsum">
          {`Kommunens flate er ikke den samme i SSBs tall for ${H.fra} og ${H.til}, trolig fordi grensen er flyttet. Tallene kan derfor ikke sammenlignes.`}
        </p>
        <p className="hint" id="utvnote"></p>
      </div>
    );
  const P = app.planSum && app.planSum.nr === app.valgt.nr && !utenPlan() ? app.planSum : null,
    etter = P ? etterPlan(H.a1, P) : null;
  const hele = km2 => nf(Math.round(km2 * 1000), 0),
    endr = km2 => {
      const d = Math.round(km2 * 1000);
      return d ? (d < 0 ? '−' : '+') + nf(Math.abs(d), 0) : '0';
    };
  const siden = KL.map(([, navn], i) => {
    const d = H.a1[i] - H.a0[i];
    return `${navn.toLowerCase()} ${Math.round(d * 1000) ? `${d < 0 ? 'ned' : 'opp'} ${iTekst(Math.abs(d))} (${H.a0[i] ? nf((Math.abs(d) / H.a0[i]) * 100) : '0'} %)` : 'uendret'}`;
  })
    .reverse()
    .join(', ');
  return (
    <div className="utvikling" id="utvikling">
      <h2>Anslått utvikling</h2>
      <table id="utvtab">
        <thead>
          <tr>
            {[
              'daa',
              H.fra,
              H.til,
              P && P.egne ? 'Med planlagt utbygging og egne områder' : 'Med planlagt utbygging'
            ].map(t => (
              <th scope="col" key={t}>
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KL.map(([id, navn], i) => (
            <tr key={id}>
              <th scope="row">
                <Rute id={id} />
                {navn}
              </th>
              <Celle tekst={hele(H.a0[i])} />
              <Celle tekst={hele(H.a1[i])} under={endr(H.a1[i] - H.a0[i])} />
              {etter ? <Celle tekst={hele(etter[i])} under={endr(etter[i] - H.a1[i])} /> : <Celle tekst="–" />}
            </tr>
          ))}
        </tbody>
      </table>
      <p id="utvsum">
        {`Fra ${H.fra} til ${H.til}: ${siden}.` +
          (P
            ? ` Bygges alt kommuneplanen setter av, går ca. ${iTekst(P.nat)} natur og ca. ${iTekst(P.jor)} jordbruk over til bebygd.${P.delvis ? ' Det gjelder bare den delen av kommunen nettleseren har hentet kart for.' : ''}`
            : utenPlan()
              ? ' DiBK har ingen kommuneplan for kommunen, så siste kolonne er tom.'
              : !app.oversikter[app.valgt.nr]
                ? ' Zoom inn i kartet for å få et anslag på planlagt utbygging i siste kolonne.'
                : ' Siste kolonne fylles ut når planlagt utbygging er regnet ut.')}
      </p>
      <p className="hint" id="utvnote">
        {`Anslag, ikke statistikk over endring. SSB skriver at tabellen ikke kan brukes til å beregne arealendringer mellom årganger, fordi datagrunnlaget blir mer fullstendig over tid. Noe av forskjellen fra ${H.fra} kan derfor skyldes bedre kartlegging. SSB har varslet egne tabeller for arealendringer. Planlagt utbygging er regnet ut i nettleseren uten smale striper.`}
      </p>
    </div>
  );
}

/* Land og vann: land, innsjø og elv er SSBs tall. Hav er regnet ut som kommunens flate minus land og ferskvann. */
function Vann() {
  const V = tolkVann(app.flate, app.ssbSum, app.ferskvann),
    sum = V ? V.deler.reduce((s, d) => s + d[2], 0) : 0;
  return (
    <div className="vann">
      <h2>Land og vann</h2>
      <div
        className="bar"
        id="bar2"
        role="img"
        aria-label={V ? V.deler.map(([, n, v]) => `${n} ${nf((v / sum) * 100)} prosent`).join(', ') : undefined}
      >
        {V
          ? V.deler.map(([id, navn, v]) => (
              <i key={id} style={{ flex: `${v} 1 0`, background: `var(--${id})` }} title={`${navn}: ${dekar(v)}`}></i>
            ))
          : null}
      </div>
      <div className="tegn" id="tegn2">
        {V
          ? V.deler.map(([id, navn, v]) => (
              <span key={id}>
                <i style={{ background: `var(--${id})` }}></i>
                {navn + ' '}
                <b>{`${id === 'hav' ? 'ca. ' : ''}${dekar(v)}`}</b>
              </span>
            ))
          : null}
      </div>
      <p className="hint" id="vannnote">
        {!V
          ? ''
          : V.hav
            ? 'Land, innsjø og elv er SSBs tall. Hav er regnet ut som kommunens flate (grensen fra Kartverket) minus land og ferskvann.'
            : 'Land, innsjø og elv er SSBs tall. Kommunen har ikke hav.'}
      </p>
    </div>
  );
}

/* Tallpanelet: arealet i kommunen fra SSB, arealklassene og temaene som kan vises i kartet, og forklaringer. */
export function Tallpanel() {
  const T = app.arealtall,
    ok = !!T && T.tilstand === 'ok',
    a = ok ? T.a : null,
    sum = ok ? a[0] + a[1] + a[2] : 0;
  return (
    <section className="nums" aria-label="Arealtall">
      <h2>
        Areal i kommunen, SSB <span id="aar">{ok ? T.aar : ''}</span>
      </h2>
      <div className="total">
        <b id="tot">{ok ? dekar(sum) : T && T.tilstand === 'feil' ? 'Tallene kunne ikke hentes' : 'Henter …'}</b>
        <span>land</span>
      </div>
      <div
        className="bar"
        id="bar"
        role="img"
        aria-label={ok ? KL.map(([, n], i) => `${n} ${nf((a[i] / sum) * 100)} prosent`).join(', ') : undefined}
      >
        {ok
          ? KL.map(([id, navn], i) => (
              <i
                key={id}
                style={{ flex: `${Math.max(a[i], 0.0001)} 1 0`, background: `var(--${id})` }}
                title={`${navn}: ${dekar(a[i])}, ${nf((a[i] / sum) * 100)} %`}
              ></i>
            ))
          : null}
      </div>
      <div className="rows" id="tallrader">
        {KL.map(([id, navn], i) => {
          const p = ok ? (a[i] / sum) * 100 : 0;
          return (
            <button
              type="button"
              className="row"
              id={'vis-' + id}
              key={id}
              style={{ '--c': `var(--${id})` }}
              aria-pressed={String(app.vis[id])}
              onClick={() => byttKlasse(id)}
            >
              <span className="sw"></span>
              <span className="nm">{navn}</span>
              <span className="km" id={'km-' + id}>
                {ok ? dekar(a[i]) : '–'}
              </span>
              <span className="pc" id={'pc-' + id}>
                {ok ? (p > 0 && p < 0.1 ? '< 0,1 %' : nf(p) + ' %') : '–'}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="row lag"
          id="planknapp"
          aria-pressed={String(app.planPaa)}
          onClick={byttPlanLag}
        >
          <span className="sw"></span>
          <span className="nm">Planlagt utbygging</span>
          <span className="km">{ingenPlan() ? 'ingen plan' : ''}</span>
          <span className="pc"></span>
        </button>
        <div className="temahode">
          <b>Tema</b>Areal i kommunen, andel av landarealet og planlagt utbygging innenfor. Fargeruten viser temaet i
          kartet. Trykk ellers på raden for detaljer.
        </div>
        {NATURLAG.map(t => {
          const B = NaturBlokk(t);
          return (
            <TemaRad
              key={t.id}
              id={t.id}
              navn={t.navn}
              klasse={t.flate ? 'flate' : ''}
              paa={t.paa}
              vedBryter={() => byttNatur(t)}
              tall={B.tall}
            >
              {B.innhold}
            </TemaRad>
          );
        })}
        {(B => (
          <TemaRad
            id="inon"
            navn="Inngrepsfri natur"
            klasse="flate inon"
            paa={app.inonPaa}
            vedBryter={byttInon}
            tall={B.tall}
          >
            {B.innhold}
          </TemaRad>
        ))(InonBlokk())}
        {(B => (
          <TemaRad
            id="graa"
            navn="Grått areal"
            klasse="flate graa"
            paa={app.graaPaa}
            vedBryter={byttGraa}
            tall={B.tall}
          >
            {B.innhold}
          </TemaRad>
        ))(GraaBlokk())}
      </div>
      <Forklaring />
      <Utvikling />
      <Vann />
      <p className="hint">
        Trykk på en arealklasse eller på planlagt utbygging for å skjule eller vise den i kartet. Lagene er uavhengige,
        så planlagt utbygging kan vises alene. Vann vises i kartet med grunnkartets farger og er ikke med i tallene for
        bebygd, jordbruk og natur. Planlaget er omtrentlig og bare til illustrasjon.
      </p>
    </section>
  );
}
