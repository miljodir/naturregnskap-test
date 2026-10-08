/* Regresjonstest for siden. Kjører et fast sett handlinger i en mobilnettleser (Chromium via Playwright), og lagrer
   tallene siden viser og skjermbilder av kartet. To kjøringer kan sammenlignes, så en endring i koden kan sjekkes
   mot en tidligere utgave. Tallene kommer fra åpne tjenester og endrer seg over tid, så en referanse må tas samme dag.

   Kjør:        node verktoy/regresjon.js ut/ny
   Mot git:     node verktoy/regresjon.js ut/ny --mot HEAD~1
   Sammenlign:  node verktoy/regresjon.js --sammenlign ut/gammel ut/ny
   Bare noen:   node verktoy/regresjon.js ut/ny --bare trondheim,oslo

   Trenger pakken playwright og en Chromium. Stien til Chromium kan settes med CHROMIUM, ellers brukes Playwrights egen.
   Går nettet gjennom en proxy, leses den fra HTTPS_PROXY. Siden bygges med Vite før den testes. */
const { chromium } = require('playwright');
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  { execSync } = require('child_process');

const ROT = path.resolve(__dirname, '..');
const TYPER = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.geojson': 'application/geo+json'
};
const TESTPLAN = path.join(__dirname, 'testdata', 'testplan-bygg.geojson');

/* Bygger siden i kilde og gir mappen med det ferdige bygget. En utgave fra før byggesteget testes som den er. En utpakket
   git-utgave låner node_modules fra arbeidskopien. */
function bygg(kilde) {
  if (!fs.existsSync(path.join(kilde, 'vite.config.mjs'))) return kilde;
  if (!fs.existsSync(path.join(kilde, 'node_modules')))
    fs.symlinkSync(path.join(ROT, 'node_modules'), path.join(kilde, 'node_modules'), 'junction');
  const ut = fs.mkdtempSync(path.join(os.tmpdir(), 'regresjon-bygg-'));
  execSync(`npx vite build --outDir "${ut}" --emptyOutDir --logLevel warn`, { cwd: kilde, stdio: 'inherit' });
  return ut;
}

async function startNettleser() {
  const valg = {};
  if (process.env.CHROMIUM) valg.executablePath = process.env.CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) valg.executablePath = '/opt/pw-browsers/chromium';
  if (process.env.HTTPS_PROXY) valg.proxy = { server: process.env.HTTPS_PROXY };
  return chromium.launch(valg);
}

/* En side som serverer filene i kilde på http://demo.test/. Kartet gjøres tilgjengelig som window.kart, så testen kan flytte det. */
async function nySide(nettleser, kilde, feil) {
  const ctx = await nettleser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  });
  const p = await ctx.newPage();
  let iGang = 0,
    sist = Date.now();
  const ferdig = () => {
    iGang = Math.max(0, iGang - 1);
    sist = Date.now();
  };
  p.on('request', () => {
    iGang++;
    sist = Date.now();
  });
  p.on('requestfinished', ferdig);
  p.on('requestfailed', ferdig);
  p.on('pageerror', e => feil.push('sidefeil: ' + e.message));
  await p.route('http://demo.test/**', r => {
    const fil = path.join(
        kilde,
        decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/+/, '') || 'index.html'
      ),
      type = TYPER[path.extname(fil)];
    if (!fil.startsWith(kilde) || !fs.existsSync(fil)) return r.fulfill({ status: 404, body: 'finnes ikke' });
    if (type === 'text/html' || type === 'text/javascript')
      return r.fulfill({
        contentType: type,
        body: fs.readFileSync(fil, 'utf8').replace('const kart = new ol.Map(', 'const kart = window.kart = new ol.Map(')
      });
    return r.fulfill({ path: fil, contentType: type });
  });
  /* Venter til det ikke har gått noen kall på en stund og siden selv ikke henter kart, og litt til for utregningene som følger. */
  p.rolig = async (stille = 1300, maks = 45000) => {
    const t0 = Date.now();
    await p.waitForTimeout(400); /* kartet rekker å be om det det trenger */
    while (Date.now() - t0 < maks) {
      if (!iGang && Date.now() - sist >= stille && (await p.evaluate(() => document.getElementById('laster').hidden)))
        break;
      await p.waitForTimeout(150);
    }
    await p.waitForTimeout(500);
  };
  p.flytt = async (x, y, res) => {
    await p.evaluate(
      ([x, y, res]) => {
        const v = kart.getView();
        if (x !== null) v.setCenter([x, y]);
        v.setResolution(res);
      },
      [x, y, res]
    );
    await p.rolig();
  };
  p.tekst = sel =>
    p.evaluate(
      sel =>
        [...document.querySelectorAll(sel)]
          .map(e => e.innerText.replace(/\s*\n\s*/g, ' | ').trim())
          .filter(Boolean)
          .join('\n'),
      sel
    );
  p.tabell = sel =>
    p.evaluate(
      sel =>
        [...document.querySelectorAll(sel + ' tr')]
          .map(r => [...r.cells].map(c => c.innerText.replace(/\n/g, ' / ')).join(' | '))
          .join('\n'),
      sel
    );
  return p;
}

const TEMA = ['vern', 'rein', 'verdi', 'inon', 'graa'];
async function tallpanel(p) {
  const ut = {};
  ut.total = await p.tekst('.total');
  ut.aar = await p.tekst('#aar');
  ut.klasser = await p.tekst('#tallrader > button.row');
  ut.planstatus = await p.tekst('#planstatus');
  ut.planinfo = await p.tekst('#planinfo');
  ut.natur = await p.tekst('#tall-pnat');
  ut.jordbruk = await p.tekst('#tall-pjor');
  ut.tallnote = await p.tekst('#tallnote');
  ut.egnemerk = await p.tekst('#egnemerk');
  ut.utvikling = await p.tabell('#utvtab');
  ut.utvsum = await p.tekst('#utvsum');
  ut.vann = await p.tekst('#tegn2');
  for (const t of TEMA) {
    ut['rad-' + t] = await p.tekst(`#${t}apne`);
    ut['blokk-' + t] = await p.evaluate(id => {
      const b = document.getElementById(id);
      const skjult = b.hidden;
      b.hidden = false;
      const tekst = b.innerText.replace(/\s*\n\s*/g, ' | ').trim();
      b.hidden = skjult;
      return tekst;
    }, t + 'blokk');
  }
  return ut;
}
const egne = async p => ({
  kort: await p.evaluate(() =>
    [...document.querySelectorAll('#egneliste li')]
      .map(
        l =>
          [...l.querySelectorAll(':scope > h3, :scope > p')].map(x => x.innerText).join(' | ') +
          '\n' +
          [...l.querySelectorAll('tr')]
            .map(r => '   ' + [...r.cells].map(c => c.innerText.replace(/\n/g, ' / ')).join(' | '))
            .join('\n')
      )
      .join('\n')
  ),
  samlet: await p.tabell('#egnesamlet'),
  status: await p.tekst('#egnestatus')
});
const trykk = async (p, sel, vent = 1200) => {
  await p.locator(sel).click();
  await p.waitForTimeout(vent);
  await p.rolig(600);
};
/* Velger fylke og så kommune: med MdSelect og MdComboBox, eller med vanlige select-elementer i eldre utgaver. */
async function velgKommune(p, [fylke, fylkeNavn], [kommune, kommuneNavn]) {
  if (await p.locator('select#fylke').count()) {
    await p.selectOption('#fylke', fylke);
    await p.waitForTimeout(500);
    await p.selectOption('#kommune', kommune);
    return;
  }
  await p.locator('#fylkevelger .md-select__button').click();
  await p.getByRole('option', { name: fylkeNavn, exact: true }).click();
  await p.waitForTimeout(500);
  await p.locator('#kommunevelger input').fill(kommuneNavn);
  await p.getByRole('option', { name: kommuneNavn, exact: true }).click();
}

const SCENARIER = {
  /* Kommune med lagret oversiktsbilde: alt regnes ut for hele kommunen når siden åpnes. */
  async trondheim(p, R) {
    await p.goto('http://demo.test/index.html#5001');
    await p
      .waitForFunction(
        () =>
          /^ca\./.test(document.getElementById('tall-pnat').textContent) &&
          /kartlagt/.test(document.getElementById('verdigap').textContent) &&
          /grått areal/.test(document.querySelector('#graaapne .un').textContent),
        null,
        { timeout: 70000 }
      )
      .catch(() => R.feil.push('trondheim: ble ikke ferdig utregnet'));
    await p.rolig();
    R.tekst.start = await tallpanel(p);
    await p.locator('#kartflate').scrollIntoViewIfNeeded();
    await R.bilde('1-oversikt');
    await trykk(p, '#vernknapp');
    await trykk(p, '#verdiknapp');
    await R.bilde('2-vern-verdi');
    await trykk(p, '#vernknapp');
    await trykk(p, '#verdiknapp');
    await trykk(p, '#inonknapp');
    await R.bilde('3-inon');
    await trykk(p, '#inonknapp');
    await trykk(p, '#graaknapp');
    await R.bilde('4-graa');
    await p.flytt(270500, 7031500, 10.58);
    await R.bilde('5-graa-inne');
    await trykk(p, '#graaknapp');
    await trykk(p, '#verdiknapp');
    await R.bilde('6-plan-verdi-inne');
    await p.locator('#kartflate').tap({ position: { x: 150, y: 300 } });
    await p.waitForTimeout(900);
    R.tekst.punkt = await p.tekst('#probe');
    await trykk(p, '#verdiknapp');
    /* eget område tegnet i kartet */
    await p.flytt(270500, 7031500, 21.16);
    await p.locator('#tegnknapp').click();
    await p.waitForTimeout(300);
    for (const [x, y] of [
      [90, 150],
      [300, 130],
      [320, 380],
      [110, 420]
    ]) {
      await p.locator('#kartflate').tap({ position: { x, y } });
      await p.waitForTimeout(350);
    }
    await trykk(p, '#tegnferdig', 2500);
    await p.rolig();
    R.tekst.tegnet = {
      ...(await egne(p)),
      natur: await p.tekst('#tall-pnat'),
      utvikling: await p.tabell('#utvtab'),
      graa: await p.tekst('#graaapne')
    };
    await p.locator('#kartflate').scrollIntoViewIfNeeded();
    await R.bilde('7-eget');
    await p.locator('#egneliste li button', { hasText: 'Ikke utbygging' }).click();
    await p.waitForTimeout(2500);
    await p.rolig();
    R.tekst.tegnetFri = { ...(await egne(p)), natur: await p.tekst('#tall-pnat') };
    await p.locator('#kartflate').scrollIntoViewIfNeeded();
    await R.bilde('8-eget-fri');
    await p.locator('#egneliste li button', { hasText: 'Slett' }).click();
    await p.waitForTimeout(2000);
    await p.rolig();
    /* opplastet plan */
    await p.setInputFiles('#planfil', TESTPLAN);
    await p.waitForTimeout(4000);
    await p.rolig();
    R.tekst.opplastet = {
      ...(await egne(p)),
      natur: await p.tekst('#tall-pnat'),
      jordbruk: await p.tekst('#tall-pjor'),
      egnemerk: await p.tekst('#egnemerk'),
      utvikling: await p.tabell('#utvtab'),
      verdi: await p.tekst('#verdiapne'),
      graa: await p.tekst('#graablokk')
    };
    await p.flytt(270500, 7031500, 84.6);
    await p.locator('#kartflate').scrollIntoViewIfNeeded();
    await R.bilde('9-opplastet');
    await p.locator('#egneliste li button', { hasText: 'Slett' }).click();
    await p.waitForTimeout(2000);
    await p.rolig();
    R.tekst.etterSletting = { natur: await p.tekst('#tall-pnat'), egnemerk: await p.tekst('#egnemerk') };
    /* ett verneområde vist i kartet fra listen */
    await p.locator('#vernapne').click();
    await p.locator('#vernliste li button').first().click();
    await p.waitForTimeout(1500);
    await p.rolig();
    R.tekst.vist = await p.tekst('#vistmerke');
    await p.locator('#kartflate').scrollIntoViewIfNeeded();
    await R.bilde('10-vist');
  },
  /* Kommune uten lagret oversiktsbilde: kartet og tallene bygges av det som hentes når man zoomer inn. */
  async surnadal(p, R) {
    await p.goto('http://demo.test/index.html#1566');
    await p
      .waitForFunction(
        () =>
          /daa/.test(document.querySelector('#inonapne').textContent) &&
          /daa/.test(document.getElementById('tot').textContent),
        null,
        { timeout: 60000 }
      )
      .catch(() => R.feil.push('surnadal: ble ikke ferdig'));
    await p.rolig();
    R.tekst.start = await tallpanel(p);
    const [x, y, res] = await p.evaluate(() => [...kart.getView().getCenter(), kart.getView().getResolution()]);
    await p.locator('#kartflate').scrollIntoViewIfNeeded();
    await trykk(p, '#inonknapp');
    await p.flytt(x, y, 12);
    await R.bilde('1-inne');
    R.tekst.inne = await tallpanel(p);
    await p.flytt(x + 2500, y, 12);
    await p.flytt(x, y, 60);
    await R.bilde('2-ute-60');
    await p.flytt(x, y, res);
    await R.bilde('3-ute-start');
    await trykk(p, '#inonknapp');
    await trykk(p, '#graaknapp');
    await R.bilde('4-graa-ute');
    R.tekst.tilSlutt = await tallpanel(p);
  },
  /* Kommune uten kommuneplan hos DiBK. */
  async oslo(p, R) {
    await p.goto('http://demo.test/index.html#0301');
    await p
      .waitForFunction(
        () =>
          /ingen kommuneplan/.test(document.getElementById('planstatus').textContent) &&
          /daa/.test(document.querySelector('#graaapne').textContent),
        null,
        { timeout: 60000 }
      )
      .catch(() => R.feil.push('oslo: ble ikke ferdig'));
    await p.rolig();
    R.tekst.start = await tallpanel(p);
    await p.locator('#kartflate').scrollIntoViewIfNeeded();
    await R.bilde('1-oversikt');
    /* bytt kommune med velgeren, og tilbake igjen */
    await velgKommune(p, ['50', 'Trøndelag'], ['5031', 'Malvik']);
    await p.waitForTimeout(6000);
    await p.rolig();
    R.tekst.malvik = await tallpanel(p);
    await p.locator('#kartflate').scrollIntoViewIfNeeded();
    await R.bilde('2-malvik');
  }
};

async function kjor(kilde, ut, bare) {
  fs.mkdirSync(ut, { recursive: true });
  kilde = bygg(kilde);
  const nettleser = await startNettleser(),
    resultat = {};
  for (const navn of Object.keys(SCENARIER)) {
    if (bare && !bare.includes(navn)) continue;
    const t0 = Date.now(),
      R = { tekst: {}, feil: [] },
      p = await nySide(nettleser, kilde, R.feil);
    R.bilde = async n => {
      await p.locator('#kartflate').screenshot({ path: path.join(ut, `${navn}-${n}.png`) });
    };
    try {
      await SCENARIER[navn](p, R);
    } catch (e) {
      R.feil.push('avbrutt: ' + String(e.message).split('\n')[0]);
    }
    resultat[navn] = { tekst: R.tekst, feil: R.feil };
    await p.context().close();
    console.log(
      `${navn}: ${((Date.now() - t0) / 1000).toFixed(0)} s${R.feil.length ? ', FEIL: ' + R.feil.join('; ') : ''}`
    );
  }
  await nettleser.close();
  fs.writeFileSync(path.join(ut, 'resultat.json'), JSON.stringify(resultat, null, 1));
  return resultat;
}

/* Sammenligner to kjøringer: all tekst skal være lik, og skjermbildene sammenlignes piksel for piksel. */
async function sammenlign(a, b, toleranse = 0.002) {
  const A = JSON.parse(fs.readFileSync(path.join(a, 'resultat.json'), 'utf8')),
    B = JSON.parse(fs.readFileSync(path.join(b, 'resultat.json'), 'utf8'));
  let avvik = 0;
  const flat = (o, pre = '', ut = {}) => {
    for (const k in o) {
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) flat(o[k], pre + k + '.', ut);
      else ut[pre + k] = JSON.stringify(o[k]);
    }
    return ut;
  };
  const fa = flat(A),
    fb = flat(B);
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    if (fa[k] === fb[k]) continue;
    avvik++;
    console.log(`TEKST ${k}\n   a: ${String(fa[k]).slice(0, 700)}\n   b: ${String(fb[k]).slice(0, 700)}`);
  }
  const nettleser = await startNettleser(),
    p = await nettleser.newPage();
  const bilder = fs
    .readdirSync(a)
    .filter(f => f.endsWith('.png'))
    .sort();
  for (const f of bilder) {
    if (!fs.existsSync(path.join(b, f))) {
      avvik++;
      console.log(`BILDE ${f}: mangler i b`);
      continue;
    }
    const les = m => 'data:image/png;base64,' + fs.readFileSync(path.join(m, f)).toString('base64');
    const r = await p.evaluate(
      async ([ua, ub]) => {
        const last = u =>
          new Promise((ok, feil) => {
            const i = new Image();
            i.onload = () => ok(i);
            i.onerror = feil;
            i.src = u;
          });
        const [ia, ib] = await Promise.all([last(ua), last(ub)]);
        if (ia.width !== ib.width || ia.height !== ib.height)
          return { ulik: 1, storst: 255, str: `${ia.width}x${ia.height} mot ${ib.width}x${ib.height}` };
        const data = i => {
          const c = document.createElement('canvas');
          c.width = i.width;
          c.height = i.height;
          const g = c.getContext('2d');
          g.drawImage(i, 0, 0);
          return g.getImageData(0, 0, c.width, c.height).data;
        };
        const da = data(ia),
          db = data(ib);
        let n = 0,
          storst = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
          if (d > 12) n++;
          if (d > storst) storst = d;
        }
        return { ulik: n / (da.length / 4), storst };
      },
      [les(a), les(b)]
    );
    const ok = r.ulik <= toleranse;
    if (!ok) avvik++;
    console.log(
      `${ok ? 'ok   ' : 'BILDE'} ${f}: ${(r.ulik * 100).toFixed(3)} % av pikslene er ulike${r.str ? ' (' + r.str + ')' : ''}`
    );
  }
  await nettleser.close();
  console.log(avvik ? `\n${avvik} avvik.` : '\nIngen avvik.');
  return avvik;
}

(async () => {
  const arg = process.argv.slice(2),
    valg = n => {
      const i = arg.indexOf(n);
      return i < 0 ? null : arg.splice(i, 2)[1];
    };
  if (arg[0] === '--sammenlign') process.exit((await sammenlign(arg[1], arg[2])) ? 1 : 0);
  const mot = valg('--mot'),
    bareTekst = valg('--bare'),
    bare = bareTekst ? bareTekst.split(',') : null,
    kildeValg = valg('--kilde'),
    ut = arg[0];
  if (!ut) {
    console.log('Bruk: node verktoy/regresjon.js <ut-mappe> [--mot <git-ref>] [--kilde <mappe>] [--bare a,b]');
    process.exit(2);
  }
  await kjor(kildeValg ? path.resolve(kildeValg) : ROT, ut, bare);
  if (mot) {
    const gammel = fs.mkdtempSync(path.join(os.tmpdir(), 'regresjon-')),
      utGammel = ut.replace(/\/+$/, '') + '-' + mot.replace(/[^\w.-]/g, '_');
    execSync(`git -C "${ROT}" archive ${mot} | tar -x -C "${gammel}"`);
    await kjor(gammel, utGammel, bare);
    process.exit((await sammenlign(utGammel, ut)) ? 1 : 0);
  }
})();
