import { app, finn } from '../motor/felles.js';
import { velg, velgFylke } from '../motor/start.js';

/* Toppen: navnet på siden og velgerne for fylke og kommune. */
export function Topp() {
  const valgt = app.valgt && finn(app.valgt.nr),
    fylke = valgt ? valgt[0] : null;
  return (
    <header className="top">
      <div className="brand">
        Bebygd, jordbruk, natur<small>Direkte fra åpne kilder, uten egen server</small>
      </div>
      <div className="pick">
        <label htmlFor="fylke">
          Fylke
          <select id="fylke" value={fylke ? fylke.nr : ''} onChange={e => velgFylke(e.target.value)}>
            {fylke ? (
              app.fylker.map(f => (
                <option key={f.nr} value={f.nr}>
                  {f.navn}
                </option>
              ))
            ) : (
              <option value="">Henter …</option>
            )}
          </select>
        </label>
        <label htmlFor="kommune">
          Kommune
          <select id="kommune" value={valgt ? app.valgt.nr : ''} onChange={e => velg(e.target.value)}>
            {fylke ? (
              fylke.kommuner.map(k => (
                <option key={k.nr} value={k.nr}>
                  {k.navn}
                </option>
              ))
            ) : (
              <option value="">Henter …</option>
            )}
          </select>
        </label>
      </div>
    </header>
  );
}

/* Navnet på kommunen som er valgt, med fylke og kommunenummer. */
export function Hode() {
  const valgt = app.valgt && finn(app.valgt.nr);
  return (
    <div className="head">
      <h1 id="navn">
        {app.kommunerFeil ? 'Kommunelisten kunne ikke hentes' : valgt ? valgt[1].navn : 'Henter kommuner …'}
      </h1>
      <p id="under">
        {app.kommunerFeil
          ? 'Sjekk nettforbindelsen og last siden på nytt.'
          : valgt
            ? `${valgt[0].navn} fylke · kommunenummer ${valgt[1].nr}`
            : ''}
      </p>
    </div>
  );
}
