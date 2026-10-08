import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { marked } from 'marked';
import fs from 'node:fs';
import path from 'node:path';

/* Utgavemerket settes når siden bygges, norsk tid. Merket står i adressen til de vanlige skriptene, så nettleseren ikke
   blander ny side med gammel kode, og teksten vises under «Vis teknisk informasjon». */
const UTGAVE = (() => {
  const del = Object.fromEntries(
    new Intl.DateTimeFormat('nb-NO', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(new Date())
      .map(d => [d.type, d.value])
  );
  const mnd = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', month: 'long' }).format(new Date());
  return {
    merke: `${del.year}${del.month}${del.day}${del.hour}${del.minute}`,
    tekst: `${Number(del.day)}. ${mnd} kl. ${del.hour}.${del.minute}`
  };
})();

/* METODE.md og AVHENGIGHETER.md legges ut som egne sider, så de kan leses uten tilgang til repoet. */
const DOKUMENTER = ['METODE', 'AVHENGIGHETER'];
const dokumentside = navn => {
  const md = fs.readFileSync(`${navn}.md`, 'utf8');
  const tittel = (md.match(/^# (.+)$/m) || [, navn])[1];
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tittel}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap">
<style>
body { font: 400 1rem/1.5 'Open Sans', sans-serif; color: #222; max-width: 76ch; margin: 0 auto; padding: 2rem 1rem 4rem; }
h1, h2, h3 { font-weight: 400; line-height: 1.3; }
a { color: #005e5d; }
table { border-collapse: collapse; width: 100%; font-size: 0.875rem; display: block; overflow-x: auto; }
th, td { text-align: left; vertical-align: top; padding: 0.5rem 0.75rem 0.5rem 0; border-bottom: 1px solid #d2d2d2; }
th { font-weight: 600; }
code { font-size: 0.9em; background: #f4f4f4; padding: 0 0.2em; }
</style>
</head>
<body>
<p><a href="./">Til siden</a></p>
${marked.parse(md)}
</body>
</html>
`;
};

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'dokumentsider',
      generateBundle() {
        for (const navn of DOKUMENTER)
          this.emitFile({ type: 'asset', fileName: `${navn}.html`, source: dokumentside(navn) });
      }
    }
  ],
  define: { __UTGAVE__: JSON.stringify(UTGAVE) },
  /* md-react er CommonJS og ville fått Ariakits CommonJS-utgave, som laster react dynamisk og ikke lar seg pakke. */
  resolve: {
    alias: [{ find: /^@ariakit\/react$/, replacement: path.resolve('node_modules/@ariakit/react/esm/index.js') }]
  }
});
