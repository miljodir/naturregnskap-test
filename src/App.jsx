import { useSyncExternalStore } from 'react';
import { lytt, versjonNa } from './motor/felles.js';
import { Topp, Hode } from './komponenter/Topp.jsx';
import { Kartpanel } from './komponenter/Kartpanel.jsx';
import { Tallpanel } from './komponenter/Tallpanel.jsx';
import { Notater } from './komponenter/Notater.jsx';

/* Hele siden. Komponentene leser tilstanden i motoren, og siden tegnes på nytt hver gang motoren melder at noe er endret. */
export default function App() {
  useSyncExternalStore(lytt, versjonNa);
  return (
    <div className="wrap">
      <Topp />
      <Hode />
      <div className="main">
        <Kartpanel />
        <Tallpanel />
      </div>
      <Notater />
    </div>
  );
}
