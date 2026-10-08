import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '@miljodirektoratet/md-css';
import './stil.css';
import App from './App.jsx';

/* De vanlige skriptene i public/js, i rekkefølgen de må lastes. De deler ett navnerom og finner elementene på id. */
const SKRIPT = [
  'felles',
  'farger',
  'fliser',
  'oversikt',
  'plan',
  'naturtema',
  'inon',
  'graa',
  'egne',
  'kart',
  'tall',
  'start'
];

document.documentElement.dataset.utgave = __UTGAVE__.tekst;
const rot = createRoot(document.getElementById('rot'));
/* Skriptene leter etter elementene når de lastes, så siden må være tegnet først. */
flushSync(() =>
  rot.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
);
for (const navn of SKRIPT) {
  const s = document.createElement('script');
  s.src = `${import.meta.env.BASE_URL}js/${navn}.js?v=${__UTGAVE__.merke}`;
  s.async = false;
  document.body.appendChild(s);
}
