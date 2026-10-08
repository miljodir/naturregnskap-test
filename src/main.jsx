import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@miljodirektoratet/md-css';
import 'ol/ol.css';
import './stil.css';
import App from './App.jsx';

createRoot(document.getElementById('rot')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
