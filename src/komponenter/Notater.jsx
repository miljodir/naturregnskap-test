import { useEffect, useState } from 'react';
import { app, finn, VERSJON } from '../motor/felles.js';
import { visSmaleStriper } from '../motor/plan.js';
import { MdCheckbox, MdLink } from './deler.jsx';

/* Teknisk informasjon til feilsøking: utgave, måling av hvor jevnt kartet går, siste kall under kartet og listen over kall.
   Skjult til vanlig. Valget lagres ikke i nettleseren, men står i adressen (?teknisk), så siden kan åpnes med det slått på. */
function useTeknisk() {
  const [paa, settPaa] = useState(() => new URLSearchParams(location.search).has('teknisk'));
  useEffect(() => {
    document.documentElement.classList.toggle('teknisk', paa);
  }, [paa]);
  const bytt = () => {
    const ny = !paa;
    settPaa(ny);
    try {
      const u = new URL(location.href);
      if (ny) u.searchParams.set('teknisk', '');
      else u.searchParams.delete('teknisk');
      history.replaceState(null, '', u.pathname + u.search.replace(/=(&|$)/g, '$1') + u.hash);
    } catch (e) {}
  };
  return [paa, bytt];
}

/* Notatene under kartet og tallene: kall-loggen, hvordan klassene er satt sammen, om siden og tekniske valg. */
export function Notater() {
  const [teknisk, byttTeknisk] = useTeknisk();
  const medBilde = Object.keys(app.oversikter).filter(nr => finn(nr)),
    reg = app.register;
  return (
    <div className="notes">
      <section className="tek" id="teknisk">
        <h2>Kall mot åpne kilder</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Kilde</th>
                <th>Hva</th>
                <th className="r">Tid</th>
                <th className="r">Størrelse</th>
              </tr>
            </thead>
            <tbody id="kallogg">
              {app.kall.map((r, n) => (
                <tr key={n}>
                  {r.slice(0, 4).map((v, i) => (
                    <td key={i} className={i > 1 ? 'r' + (r[4] ? ' feil' : '') : undefined}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Viser de siste kallene nettleseren din har gjort. Kartfliser nettleseren allerede har, hentes ikke på nytt.
          Grenser, tall, plansjekk, verneområder og villreinområder huskes også så lenge siden er åpen. Bakgrunnskartet
          er ferdige fliser fra Kartverket og er ikke med i listen.
        </p>
      </section>
      <section>
        <h2>Slik er klassene satt sammen</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Klasse</th>
                <th>Kart: økosystemtype</th>
                <th>Tall: arealklasse</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Bebygd</td>
                <td>Bebygd og opparbeidet areal</td>
                <td>01–14</td>
              </tr>
              <tr>
                <td>Jordbruk</td>
                <td>Dyrket mark og grasmark</td>
                <td>15–16</td>
              </tr>
              <tr>
                <td>Natur</td>
                <td>Skog, hei, lite vegetert mark, våtmark og strand</td>
                <td>17–21 og 24</td>
              </tr>
              <tr>
                <td>Vann</td>
                <td>Innsjøer, elver og hav</td>
                <td>22.01 og 22.02. Hav er regnet ut.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Inndelingen sendes som en stil i hvert kall, så NIBIO tegner seks klasser i stedet for elleve: de tre på land,
          og hav, innsjø og elv. Fargene settes i nettleseren og er hentet fra grunnkartets egen tegnforklaring: bebygd
          og opparbeidet areal, dyrket mark og skog, og grunnkartets tre farger for vann.
        </p>
        <p>
          Planlagt endring hentes fra kommuneplanens arealdel hos DiBK: arealformål i 1000- og 2000-serien (bebyggelse
          og anlegg, samferdsel og teknisk infrastruktur) med status framtidig. Nettleseren legger dette oppå dagens
          klasser og viser bare det som i dag er natur eller jordbruk, med koksgrå for natur og brun for jordbruk.
          Finnes det ingen kommuneplan for kommunen hos DiBK, står det under kartet og ved kartlaget. Laget kan vises
          alene, uavhengig av de tre klassene.
        </p>
      </section>
      <section>
        <h2>Om siden</h2>
        <p>
          Alt hentes direkte i nettleseren når du velger kommune: grensen fra Kartverket, arealtallene fra SSB og kartet
          fra NIBIO. Bare listen over fylker og kommuner ligger lagret sammen med siden.
        </p>
        <p id="omoversikt" hidden={!medBilde.length || !reg}>
          {medBilde.length && reg
            ? `For ${medBilde.length === 1 ? finn(medBilde[0])[1].navn : medBilde.length + ' kommuner'} ligger også et ferdig oversiktsbilde lagret (${reg.versjon}, hentet ${reg.hentet}). Det vises når kartet er zoomet ut, og fliser fra NIBIO tar over når du zoomer inn.`
            : ''}
        </p>
        <p>
          Hvordan hvert tall er hentet eller regnet ut, står i <MdLink href="METODE.html">metodebeskrivelsen</MdLink>.
          Biblioteker og tjenester siden bruker, står i{' '}
          <MdLink href="AVHENGIGHETER.html">oversikten over avhengigheter</MdLink>.
        </p>
        <p>
          Kart: Nasjonalt grunnkart for arealanalyse, årsversjon 2025, NIBIO. Tall: SSB, tabell 09594. Kommuneplan:
          DiBK. Verneområder, villreinområder, naturtyper og inngrepsfri natur: Miljødirektoratet. Grått areal:
          Miljødirektoratet, Kartverket, NIBIO og SSB. Grenser og bakgrunnskart: Kartverket.
        </p>
      </section>
      <section>
        <h2>Tekniske valg</h2>
        <button
          type="button"
          className="md-button md-button--secondary"
          id="tekknapp"
          aria-expanded={String(teknisk)}
          onClick={byttTeknisk}
        >
          {teknisk ? 'Skjul teknisk informasjon' : 'Vis teknisk informasjon'}
        </button>
        <p id="versjon" className="tek">{`Utgave: ${VERSJON}.`}</p>
        <p id="maaling" className="tek" role="status">
          {app.maaling || 'Flytt kartet for å måle hvor jevnt det går.'}
        </p>
        <MdCheckbox
          id="smale"
          className="valg"
          checked={app.visSmale}
          onChange={e => visSmaleStriper(e.target.checked)}
          label="Vis smale striper i planlagt utbygging. Det er felt som ikke er bredere enn rundt 40 meter noe sted, ofte grøntdrag og kanter langs eksisterende bebyggelse. Smale deler av et større felt vises alltid."
        />
      </section>
    </div>
  );
}
