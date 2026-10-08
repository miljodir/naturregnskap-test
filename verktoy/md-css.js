/* Lager md.css: delene av Miljødirektoratets designsystem (@miljodirektoratet/md-css) som siden bruker, samlet i én fil.
   Siden har ikke noe byggesteg, så filen ligger i repoet og lastes som den er. Kjør etter npm install når versjonen
   i package.json endres, eller når siden tar i bruk en ny komponent fra designsystemet.

   Kjør fra roten av repoet:  npm run md-css */
const fs = require('fs'),
  path = require('path');

const ROT = path.resolve(__dirname, '..');
const PAKKE = path.join(ROT, 'node_modules', '@miljodirektoratet', 'md-css');
const DELER = [
  'tokens/variables.css',
  'tokens/color-variables.css',
  'tokens/tokens.css',
  'typography.css',
  'button/button.css',
  'link/link.css',
  'formElements/checkbox/checkbox.css',
  'messages/alertMessage.css'
];

const { version, license } = JSON.parse(fs.readFileSync(path.join(PAKKE, 'package.json'), 'utf8'));
const innhold = DELER.map(d => `/* ${d} */\n` + fs.readFileSync(path.join(PAKKE, 'src', d), 'utf8').trim()).join(
  '\n\n'
);
fs.writeFileSync(
  path.join(ROT, 'md.css'),
  `/* @miljodirektoratet/md-css ${version}, lisens ${license}, https://github.com/miljodir/md-components\n` +
    `   Laget av verktoy/md-css.js. Endres ikke for hånd. */\n\n${innhold}\n`
);
console.log(`md.css: md-css ${version}, ${DELER.length} deler`);
