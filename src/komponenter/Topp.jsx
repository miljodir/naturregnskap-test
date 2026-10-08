import { app, finn } from '../motor/felles.js';
import { velg, velgFylke } from '../motor/start.js';
import MdSelect from '@miljodirektoratet/md-react/dist/formElements/MdSelect';
import MdComboBox from '@miljodirektoratet/md-react/dist/formElements/MdComboBox';

/* Toppen: navnet på siden og velgerne for fylke og kommune. Kommunene i fylket kan filtreres ved å skrive i feltet. */
export function Topp() {
  const valgt = app.valgt && finn(app.valgt.nr),
    fylke = valgt ? valgt[0] : null;
  return (
    <header className="top">
      <div className="brand">
        Bebygd, jordbruk, natur<small>Direkte fra åpne kilder, uten egen server</small>
      </div>
      <div className="pick">
        <div className="velger" id="fylkevelger">
          <MdSelect
            id="fylke"
            label="Fylke"
            placeholder="Henter …"
            options={app.fylker.map(f => ({ value: f.nr, text: f.navn }))}
            value={fylke ? fylke.nr : ''}
            onSelectOption={nr => nr && velgFylke(nr)}
          />
        </div>
        <div className="velger" id="kommunevelger">
          <MdComboBox
            id="kommune"
            label="Kommune"
            placeholder={fylke ? 'Søk etter kommune' : 'Henter …'}
            options={fylke ? fylke.kommuner.map(k => ({ value: k.nr, text: k.navn })) : []}
            value={valgt ? app.valgt.nr : ''}
            onSelectOption={nr => nr && velg(nr)}
          />
        </div>
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
