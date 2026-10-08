import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { app, dekar, nf, RUTE, iTekst, rolig } from '../motor/felles.js';
import { ui, plasserBytt, byttTil } from '../motor/kart.js';
import { startKart } from '../motor/start.js';
import { fjernMerket } from '../motor/naturtema.js';
import { ingenPlan } from '../motor/plan.js';
import {
  mine,
  egneRader,
  startTegning,
  sluttTegning,
  angrePunkt,
  ferdigTegning,
  lastOppPlan,
  settType,
  slettEget,
  visEgetIKartet
} from '../motor/egne.js';
import { MdButton, Celle, Rute } from './deler.jsx';

const fokus = id => setTimeout(() => document.getElementById(id)?.focus(), 0);

/* Kartet med det som ligger over og under det, og egne områder. */
export function Kartpanel() {
  const flate = useRef(null),
    [slipp, settSlipp] = useState(false);
  useEffect(() => {
    startKart(flate.current);
  }, []);
  useLayoutEffect(plasserBytt, [app.bytt]);
  useEffect(() => {
    const tast = e => {
      if (e.key === 'Escape' && app.tegner) sluttTegning();
    };
    document.addEventListener('keydown', tast);
    return () => document.removeEventListener('keydown', tast);
  }, []);
  const tilListen = () => {
    if (!app.vist) return;
    const { t, liId } = app.vist,
      blokk = document.getElementById(t.id + 'blokk');
    if (blokk) blokk.open = true;
    setTimeout(() => {
      const li = document.getElementById(liId) || blokk;
      if (!li) return;
      li.scrollIntoView({ behavior: rolig() ? 'auto' : 'smooth', block: 'center' });
      const kn = li.querySelector('button');
      if (kn) kn.focus({ preventScroll: true });
    }, 0);
  };
  const ingen = ingenPlan();
  return (
    <section className="map" aria-label="Kart">
      <div
        className={'stage' + (slipp ? ' slipp' : '')}
        onDragOver={e => {
          e.preventDefault();
          settSlipp(true);
        }}
        onDragLeave={() => settSlipp(false)}
        onDrop={e => {
          e.preventDefault();
          settSlipp(false);
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (f) lastOppPlan(f);
        }}
      >
        <div id="kartflate" ref={flate}></div>
        <div className="chip" id="laster" hidden={!app.laster}>
          Henter kart …
        </div>
        <button
          type="button"
          className="bytt md-button"
          id="byttknapp"
          hidden={!app.bytt}
          ref={el => {
            ui.bytt = el;
          }}
          onClick={byttTil}
        >
          {app.bytt ? `Bytt til ${app.bytt.navn}` : ''}
        </button>
        <div className="chip" id="zoomet" role="status" hidden={!app.sidezoom}>
          Siden er forstørret. Knip sammen for å zoome ut, så virker kartet igjen.
        </div>
        <div className="chip" id="vistmerke" hidden={!app.vist}>
          <b>{app.vist ? app.vist.navn : ''}</b>
          <MdButton theme="tertiary" mode="small" id="vistliste" onClick={tilListen}>
            Til listen
          </MdButton>
          <MdButton
            theme="tertiary"
            mode="small"
            id="vistlukk"
            aria-label="Fjern markeringen i kartet"
            onClick={fjernMerket}
          >
            ×
          </MdButton>
        </div>
        <div className="chip" id="ute" hidden={!app.ute}>
          Zoom inn for å se arealklassene. NIBIO tegner grunnkartet først fra 1:50 000.
        </div>
      </div>
      <div className="mapfoot">
        <div
          id="planinfo"
          className="md-alert-message md-alert-message--warning md-alert-message--fullWidth"
          role="status"
          hidden={!ingen}
        >
          {ingen ? `DiBK har ingen kommuneplan for ${app.valgt.navn}. Planlagt utbygging vises derfor ikke.` : ''}
        </div>
        <div className="probe" id="probe">
          {app.probe.fet ? (
            <>
              Valgt punkt: <b>{app.probe.fet}</b>
            </>
          ) : (
            app.probe.tekst
          )}
        </div>
        <div id="siste" className="tek">
          {app.siste}
        </div>
      </div>
      <Egne />
    </section>
  );
}

/* En tabell som sammenligner kommuneplanen alene med planen der egne områder erstatter den. */
function EgenTabell({ rader, navnPlan, navnNy }) {
  const tall = n => (n ? dekar(n * RUTE).replace(' daa', '') : '0'),
    endr = d => (!d ? '0' : (d < 0 ? '−' : '+') + tall(Math.abs(d)));
  const kropp = [];
  let gruppe = '';
  rader.forEach(([navn, farge, plan, ny, av, gr], i) => {
    if (gr !== gruppe) {
      gruppe = gr;
      kropp.push(
        <tr className="gruppe" key={'g' + i}>
          <th colSpan={4} scope="colgroup">
            {gr}
          </th>
        </tr>
      );
    }
    const andel = n => (av ? `${nf((n / av) * 100)} %` : '');
    kropp.push(
      <tr key={i}>
        <th scope="row">
          {farge ? <Rute id={farge} /> : null}
          {navn}
        </th>
        <Celle tekst={plan === null ? '–' : tall(plan)} under={plan === null ? '' : andel(plan)} />
        <Celle tekst={tall(ny)} under={andel(ny)} />
        <Celle tekst={endr(ny - (plan || 0))} />
      </tr>
    );
  });
  return (
    <div className="utvikling sml">
      <table>
        <thead>
          <tr>
            {['Planlagt utbygging på, daa', navnPlan, navnNy, 'Endring'].map(t => (
              <th scope="col" key={t}>
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{kropp}</tbody>
      </table>
    </div>
  );
}

const ramse = deler => {
  const d = deler.filter(Boolean);
  return d.length > 1 ? d.slice(0, -1).join(', ') + ' og ' + d[d.length - 1] : d[0] || '';
};

/* Ett eget område: hva som ligger der i dag, og hva det betyr mot kommuneplanen. */
function EgetOmrade({ g, nr, R }) {
  const T = R ? g.tall : null,
    dk = n => iTekst(n * RUTE),
    kjent = T ? T.nat + T.jor + T.beb + T.vann : 0;
  return (
    <li>
      <h3>
        {g.navn}
        <span>{dekar(g.km2)}</span>
      </h3>
      {g.kilde === 'tegnet' ? (
        <div className="knapper">
          {[
            ['bygg', 'Utbygging'],
            ['fri', 'Ikke utbygging']
          ].map(([type, navn]) => (
            <MdButton
              key={type}
              theme="secondary"
              mode="small"
              aria-pressed={String(g.deler[0].type === type)}
              onClick={() => settType(g, type)}
            >
              {navn}
            </MdButton>
          ))}
        </div>
      ) : (
        <p>
          {g.utenFormal
            ? `Opplastet fil med ${nf(g.deler.length, 0)} flater. Filen har ingen arealformål, så alle flatene regnes som utbygging.`
            : `Opplastet plan${g.planid ? ' ' + g.planid : ''} med ${nf(g.deler.length, 0)} flater: ${nf(g.bygg, 0)} regnes som utbygging (framtidig bebyggelse, anlegg og samferdsel) og ${nf(g.annet, 0)} som ikke utbygging. Innenfor flatene erstatter filen kommuneplanen.`}
        </p>
      )}
      {!T ? (
        <p>{ingenPlan() || app.ov ? 'Regner …' : 'Zoom inn over området, så regnes det ut.'}</p>
      ) : (
        <>
          <p>
            {kjent
              ? `I dag ligger det ${ramse([T.nat ? dk(T.nat) + ' natur' : '', T.jor ? dk(T.jor) + ' jordbruk' : '', T.beb ? dk(T.beb) + ' bebygd' : '', T.vann ? dk(T.vann) + ' vann' : ''])} her.`
              : 'Kartet er ikke hentet for dette området ennå.'}
          </p>
          {T.ukjent && kjent ? (
            <p>
              {`For ca. ${dk(T.ukjent)} er kartet ikke hentet, eller området ligger utenfor kommunen. Zoom inn over området for å få med mer.`}
            </p>
          ) : null}
          {kjent ? (
            <EgenTabell
              rader={egneRader(nr).filter((r, i) => i < 2 || r[2] || r[3] || r[0] === 'Grått areal')}
              navnPlan="Planen her"
              navnNy={g.kilde === 'fil' ? 'Opplastet' : 'Tegningen'}
            />
          ) : null}
          {g.kilde === 'tegnet' && g.deler[0].type === 'bygg' && T.nat + T.jor && !(T.nnat + T.njor) ? (
            <p>Området er smalere enn rundt 40 meter og regnes som en smal stripe, så det gir ikke utslag.</p>
          ) : null}
        </>
      )}
      <div className="knapper">
        <MdButton theme="secondary" mode="small" onClick={() => visEgetIKartet(g)}>
          Vis i kartet
        </MdButton>
        <MdButton
          theme="secondary"
          mode="small"
          aria-label={`Slett ${g.navn}`}
          onClick={() => {
            slettEget(g);
            fokus('tegnknapp');
          }}
        >
          Slett
        </MdButton>
      </div>
    </li>
  );
}

/* Egne områder: tegning, opplasting, listen over områdene og tabellen for hele kommunen. */
function Egne() {
  const E = mine(),
    R =
      app.planRaster &&
      app.valgt &&
      app.planRaster.nr === app.valgt.nr &&
      app.planRaster.eget &&
      app.planRaster.antallEgne === E.length
        ? app.planRaster
        : null,
    fil = useRef(null);
  return (
    <div className="egne" id="egnedel">
      <div className="knapper">
        <MdButton theme="secondary" id="tegnknapp" hidden={app.tegner} onClick={startTegning}>
          Tegn eget område
        </MdButton>
        <MdButton theme="secondary" id="lastknapp" hidden={app.tegner} onClick={() => fil.current.click()}>
          Last opp plan
        </MdButton>
        <input
          type="file"
          id="planfil"
          ref={fil}
          accept=".geojson,.json,application/geo+json,application/json"
          hidden
          onChange={e => {
            const f = e.target.files[0];
            e.target.value = '';
            lastOppPlan(f);
          }}
        />
        <MdButton theme="secondary" id="tegnangre" hidden={!app.tegner} onClick={angrePunkt}>
          Angre punkt
        </MdButton>
        <MdButton id="tegnferdig" hidden={!app.tegner} onClick={ferdigTegning}>
          Ferdig
        </MdButton>
        <MdButton
          theme="tertiary"
          id="tegnavbryt"
          hidden={!app.tegner}
          onClick={() => {
            sluttTegning();
            fokus('tegnknapp');
          }}
        >
          Avbryt
        </MdButton>
      </div>
      <p className="hint" id="tegnhjelp">
        {app.tegner
          ? 'Trykk i kartet for hvert hjørne. Avslutt med å trykke på første punkt, eller på Ferdig når du har minst tre punkter.'
          : 'Tegn et område i kartet, eller last opp en plan som GeoJSON i samme format som DiBKs nedlasting av plandata. Innenfor flatene erstatter tegningen eller filen kommuneplanen. Ingenting lagres eller sendes fra nettleseren.'}
      </p>
      <p id="egnestatus" role="status">
        {app.egneStatus}
      </p>
      <ul id="egneliste">
        {E.map((g, nr) => (
          <EgetOmrade key={g.id} g={g} nr={nr} R={R} />
        ))}
      </ul>
      <div id="egnesamlet" className="samlet" hidden={!E.length || !R}>
        {E.length && R ? (
          <>
            <h3>Samlet for kommunen</h3>
            <EgenTabell
              rader={egneRader(null)}
              navnPlan="Planen"
              navnNy={E.length === 1 && E[0].kilde === 'fil' ? 'Med opplastet' : 'Med egne'}
            />
            <p className="hint">
              {`Planen er kommuneplanen fra DiBK alene. Prosenten under tallene er andelen av dagens natur eller jordbruk i kommunen${app.ov && app.ov.dynamisk ? ', i den delen nettleseren har hentet kart for' : ''}. Endring er forskjellen fra planen. Grått areal er planlagt utbygging på areal som alt er tatt i bruk. Smale striper er ikke med for natur og jordbruk. Inngrepsfri natur er ikke med, fordi et inngrep virker på avstand.`}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
