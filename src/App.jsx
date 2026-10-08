import { useState } from 'react';
/* Hver komponent hentes fra sin egen fil. md-react er CommonJS, så hovedfilen drar med seg hele biblioteket. */
import MdButton from '@miljodirektoratet/md-react/dist/button/MdButton';
import MdCheckbox from '@miljodirektoratet/md-react/dist/formElements/MdCheckbox';
import MdLink from '@miljodirektoratet/md-react/dist/link/MdLink';

/* MdCheckbox setter aria-checked fra checked, så valget må styres her. start.js lytter på change som før. */
function SmaleValg() {
  const [paa, settPaa] = useState(false);
  return (
    <MdCheckbox
      id="smale"
      className="valg"
      checked={paa}
      onChange={e => settPaa(e.target.checked)}
      label="Vis smale striper i planlagt utbygging. Det er felt som ikke er bredere enn rundt 40 meter noe sted, ofte grøntdrag og kanter langs eksisterende bebyggelse. Smale deler av et større felt vises alltid."
    />
  );
}

/* Siden slik den ser ut før skriptene i public/js har fylt den. Skriptene finner elementene på id og skriver tekst og innhold
   i dem selv. Elementer skriptene skriver tekst i, er vanlige elementer med md-klasser, så React og skriptene ikke eier det
   samme innholdet. Siden tegnes én gang. Bare valget av smale striper har tilstand i React. */
export default function App() {
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          Bebygd, jordbruk, natur<small>Direkte fra åpne kilder, uten egen server</small>
        </div>
        <div className="pick">
          <label htmlFor="fylke">
            Fylke
            <select id="fylke">
              <option>Henter …</option>
            </select>
          </label>
          <label htmlFor="kommune">
            Kommune
            <select id="kommune">
              <option>Henter …</option>
            </select>
          </label>
        </div>
      </header>

      <div className="head">
        <h1 id="navn">Henter kommuner …</h1>
        <p id="under"></p>
      </div>

      <div className="main">
        <section className="map" aria-label="Kart">
          <div className="stage">
            <div id="kartflate"></div>
            <div className="chip" id="laster" hidden>
              Henter kart …
            </div>
            <button type="button" className="bytt md-button" id="byttknapp" hidden></button>
            <div className="chip" id="zoomet" role="status" hidden>
              Siden er forstørret. Knip sammen for å zoome ut, så virker kartet igjen.
            </div>
            <div className="chip" id="vistmerke" hidden>
              <b></b>
              <MdButton theme="tertiary" mode="small" id="vistliste">
                Til listen
              </MdButton>
              <MdButton theme="tertiary" mode="small" id="vistlukk" aria-label="Fjern markeringen i kartet">
                ×
              </MdButton>
            </div>
            <div className="chip" id="ute" hidden>
              Zoom inn for å se arealklassene. NIBIO tegner grunnkartet først fra 1:50 000.
            </div>
          </div>
          <div className="mapfoot">
            <div
              id="planinfo"
              className="md-alert-message md-alert-message--warning md-alert-message--fullWidth"
              role="status"
              hidden
            ></div>
            <div className="probe" id="probe">
              Trykk i kommunen for å se klassen, eller utenfor for å bytte kommune.
            </div>
            <div id="siste" className="tek"></div>
          </div>
          <div className="egne" id="egnedel">
            <div className="knapper">
              <MdButton theme="secondary" id="tegnknapp">
                Tegn eget område
              </MdButton>
              <MdButton theme="secondary" id="lastknapp">
                Last opp plan
              </MdButton>
              <input type="file" id="planfil" accept=".geojson,.json,application/geo+json,application/json" hidden />
              <MdButton theme="secondary" id="tegnangre" hidden>
                Angre punkt
              </MdButton>
              <MdButton id="tegnferdig" hidden>
                Ferdig
              </MdButton>
              <MdButton theme="tertiary" id="tegnavbryt" hidden>
                Avbryt
              </MdButton>
            </div>
            <p className="hint" id="tegnhjelp">
              Tegn et område i kartet, eller last opp en plan som GeoJSON i samme format som DiBKs nedlasting av
              plandata. Innenfor flatene erstatter tegningen eller filen kommuneplanen. Ingenting lagres eller sendes
              fra nettleseren.
            </p>
            <p id="egnestatus" role="status"></p>
            <ul id="egneliste"></ul>
            <div id="egnesamlet" className="samlet" hidden></div>
          </div>
        </section>

        <section className="nums" aria-label="Arealtall">
          <h2>
            Areal i kommunen, SSB <span id="aar"></span>
          </h2>
          <div className="total">
            <b id="tot">–</b>
            <span>land</span>
          </div>
          <div className="bar" id="bar" role="img"></div>
          <div className="rows" id="tallrader"></div>
          {/* Innholdet i detaljene for de to temaene som hentes som bilder av hele kommunen. start.js flytter det inn i radene. */}
          <div id="mal-inon" hidden>
            <p id="inonsum"></p>
            <p id="inonmerk"></p>
            <ul id="inonliste"></ul>
            <p id="inonplan" hidden>
              <b>Inngrepsfri natur kan ikke krysses med planlagt utbygging slik de andre temaene kan.</b> Sonene følger
              avstanden til nærmeste tyngre tekniske inngrep. Et nytt inngrep kan derfor flytte sonegrensene flere
              kilometer unna, også når det ikke ligger i en sone selv.
            </p>
            <p className="hint">
              Kilde: Miljødirektoratet, inngrepsfrie naturområder, nyeste status (2023). Sonene hentes som ett bilde av
              hele kommunen når kommunen velges, og både kartlaget og arealet lages av det i nettleseren. Arealet
              gjelder alt innenfor sonene, også innsjøer, så andelen av landarealet er et omtrentlig mål. I kartet er
              det bare klassen natur som får sonefarge.
            </p>
          </div>
          <div id="mal-graa" hidden>
            <p id="graasum"></p>
            <ul id="graaliste"></ul>
            <p id="graaplan" role="status"></p>
            <p id="graamerk" hidden>
              <b>Grått betyr ikke ledig.</b> Kartet skiller ikke mellom et boligområde i bruk og en nedlagt
              industritomt, og sier ikke noe om hva som kan bygges om. Det må leses sammen med lokal kunnskap.
            </p>
            <p className="hint">
              Kilde: Kart over grå arealer, Miljødirektoratet, Kartverket, NIBIO og SSB (testversjon 1, 2025), hentet
              fra NIBIO som to bilder av hele kommunen, og som fliser når kartet er zoomet inn. Arealene er regnet ut i
              nettleseren. Andel bygninger er ikke med, fordi tjenesten foreløpig oppgir 0 for alle flater vi har slått
              opp. I kartet er lysere grått mer vegetasjon, og blågrønt er grønt i bebygd område. Det blågrønne er
              regnet ut som bebygd areal i grunnkartet som ikke er grått. I en stikkprøve på 140 punkter i Trondheim var
              133 det grunnkartet kaller grønne arealer.
            </p>
          </div>
          <div className="forklaring">
            <p id="planstatus" role="status"></p>
            <div id="linje-pnat">
              <i style={{ background: 'var(--pnat)' }}></i>
              <p>
                Natur som kommuneplanen setter av til framtidig utbygging <b id="tall-pnat"></b>
              </p>
            </div>
            <div id="linje-pjor">
              <i style={{ background: 'var(--pjor)' }}></i>
              <p>
                Jordbruk som kommuneplanen setter av til framtidig utbygging <b id="tall-pjor"></b>
              </p>
            </div>
            <p id="egnemerk" className="md-alert-message md-alert-message--fullWidth" role="status"></p>
            <p id="tallnote"></p>
          </div>
          <div className="utvikling" id="utvikling" hidden>
            <h2>Anslått utvikling</h2>
            <table id="utvtab"></table>
            <p id="utvsum"></p>
            <p className="hint" id="utvnote"></p>
          </div>
          <div className="vann">
            <h2>Land og vann</h2>
            <div className="bar" id="bar2" role="img"></div>
            <div className="tegn" id="tegn2"></div>
            <p className="hint" id="vannnote"></p>
          </div>
          <p className="hint">
            Trykk på en arealklasse eller på planlagt utbygging for å skjule eller vise den i kartet. Lagene er
            uavhengige, så planlagt utbygging kan vises alene. Vann vises i kartet med grunnkartets farger og er ikke
            med i tallene for bebygd, jordbruk og natur. Planlaget er omtrentlig og bare til illustrasjon.
          </p>
        </section>
      </div>

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
              <tbody id="kallogg"></tbody>
            </table>
          </div>
          <p>
            Viser de siste kallene nettleseren din har gjort. Kartfliser nettleseren allerede har, hentes ikke på nytt.
            Grenser, tall, plansjekk, verneområder og villreinområder huskes også så lenge siden er åpen.
            Bakgrunnskartet er ferdige fliser fra Kartverket og er ikke med i listen.
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
            Inndelingen sendes som en stil i hvert kall, så NIBIO tegner seks klasser i stedet for elleve: de tre på
            land, og hav, innsjø og elv. Fargene settes i nettleseren og er hentet fra grunnkartets egen tegnforklaring:
            bebygd og opparbeidet areal, dyrket mark og skog, og grunnkartets tre farger for vann.
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
            Alt hentes direkte i nettleseren når du velger kommune: grensen fra Kartverket, arealtallene fra SSB og
            kartet fra NIBIO. Bare listen over fylker og kommuner ligger lagret sammen med siden.
          </p>
          <p id="omoversikt" hidden></p>
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
          <button type="button" className="md-button md-button--secondary" id="tekknapp" aria-expanded="false">
            Vis teknisk informasjon
          </button>
          <p id="versjon" className="tek"></p>
          <p id="maaling" className="tek" role="status">
            Flytt kartet for å måle hvor jevnt det går.
          </p>
          <SmaleValg />
        </section>
      </div>
    </div>
  );
}
