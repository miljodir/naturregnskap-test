#!/usr/bin/env python3
"""Lager lagrede oversiktsbilder: ett ferdig bilde per kommune av dagens arealklasser, vist når kartet er zoomet ut.

Bildet hentes fra NIBIOs grunnkart for arealanalyse i 2048 x 2048 piksler om gangen, med samme seks rene farger som
siden selv ber om, og regnes ned til høyst 2048 piksler på lengste side. Hver piksel lagres som en blanding av de to
klassene det er mest av, i sjettedeler, så bildet får en liten fargetabell og blir lite. Siden bytter ut fargetabellen
i nettleseren, på samme måte som for kartflisene.

Kjør fra roten av repoet:
    python3 verktoy/oversiktsbilde.py 5001 5021
    python3 verktoy/oversiktsbilde.py --fylke 50 --hentet "5. og 6. oktober 2026"

Bildene legges i oversikt/, og oversikt.json oppdateres. Kommuner som alt har bilde, hoppes over uten --paa-nytt.
Grunnkartet er lisensiert «Norge digitalt begrenset». Vær varsom med belastningen: en kommune koster 4 til 16 kall.

Trenger numpy, Pillow og shapely. Går nettet gjennom en proxy med eget sertifikat, leses det fra SSL_CERT_FILE.
"""
import argparse, io, json, math, os, ssl, sys, time, urllib.parse, urllib.request

import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import shape

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WMS = 'https://wms.nibio.no/cgi-bin/grunnkart_arealanalyse'
KV = 'https://api.kartverket.no/kommuneinfo/v1'
LENGSTE = 2048     # piksler på lengste side i det ferdige bildet
FLIS = 2048        # piksler per kall mot NIBIO
GRENSE = 17.0      # groveste oppløsning NIBIO tegner grunnkartet i (1:50 000), meter per piksel

# Rene farger fra NIBIO, de samme som i js/felles.js. Blandingen av to klasser kan ikke forveksles med blandingen av to andre.
FARGER = np.array([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 128, 255], [0, 128, 255], [255, 128, 128]], float)
KLASSER = [['bebygdOpparbeidetAreal'], ['dyrketmark', 'grasmark'],
           ['skog', 'heiBuskmark', 'liteVegetertMark', 'vatmark', 'kyststrenderSvabergDyner'],
           ['hav'], ['innsjoerVannmagasiner'], ['elverBekkerKanaler']]
NAVN = ['bebygd', 'jordbruk', 'natur', 'hav', 'innsjø', 'elv']

SSL = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))


def stil():
    regler = ''
    for farge, verdier in zip(FARGER, KLASSER):
        f = ''.join(f'<ogc:PropertyIsEqualTo><ogc:PropertyName>okosystemtypeniva1</ogc:PropertyName><ogc:Literal>{v}</ogc:Literal></ogc:PropertyIsEqualTo>' for v in verdier)
        if len(verdier) > 1:
            f = f'<ogc:Or>{f}</ogc:Or>'
        hex_ = ''.join('%02x' % int(c) for c in farge)
        regler += f'<Rule><ogc:Filter>{f}</ogc:Filter><PolygonSymbolizer><Fill><CssParameter name="fill">#{hex_}</CssParameter></Fill></PolygonSymbolizer></Rule>'
    return ('<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">'
            f'<NamedLayer><Name>okosystemtype</Name><UserStyle><FeatureTypeStyle>{regler}</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>')


def hent(url, forsok=6):
    """Henter en adresse, med flere forsøk og økende pause. Gir innhold, innholdstype og sekunder brukt."""
    siste = None
    for i in range(forsok):
        try:
            t = time.time()
            sp = urllib.request.Request(url, headers={'User-Agent': 'naturregnskap-demo (engangsbygg av oversiktsbilder)'})
            with urllib.request.urlopen(sp, timeout=150, context=SSL) as svar:
                return svar.read(), svar.headers.get('content-type', ''), time.time() - t
        except Exception as e:
            siste = e
            time.sleep(2 + 4 * i)
    raise siste


def maske(flate, minx, maxy, res, w, h, tett=2):
    """Kommunens flate som dekning per piksel, 0 til 1."""
    bilde = Image.new('L', (w * tett, h * tett), 0)
    tegn = ImageDraw.Draw(bilde)
    deler = flate.geoms if flate.geom_type == 'MultiPolygon' else [flate]
    px = lambda ring: [((x - minx) / res * tett, (maxy - y) / res * tett) for x, y in ring]
    for p in deler:
        tegn.polygon(px(p.exterior.coords), fill=255)
    for p in deler:
        for hull in p.interiors:
            tegn.polygon(px(hull.coords), fill=0)
    return np.asarray(bilde.resize((w, h), Image.BOX), dtype=np.float32) / 255


def andeler(farger):
    """Tolker hver farge som en blanding av de to klassene den ligger nærmest linjen mellom. (N,3) -> (N,6)."""
    c = farger.astype(float)
    best = np.full(len(c), 1e18)
    ut = np.zeros((len(c), 6), np.float32)
    for a in range(6):
        for b in range(a + 1, 6):
            d = FARGER[a] - FARGER[b]
            t = np.clip(((c - FARGER[b]) @ d) / (d @ d), 0, 1)
            avstand = ((c - (FARGER[b] + t[:, None] * d)) ** 2).sum(1)
            m = avstand < best
            best[m] = avstand[m]
            ut[m] = 0
            ut[m, a] = t[m]
            ut[m, b] = 1 - t[m]
    return ut


def bygg(nr, ut):
    """Lager oversikt/<nr>.png. Gir utsnittet bildet dekker og litt statistikk."""
    data, _, _ = hent(f'{KV}/kommuner/{nr}/omrade?utkoordsys=25833')
    flate = shape(json.loads(data)['omrade'])
    minx, miny, maxx, maxy = flate.bounds
    res = max(maxx - minx, maxy - miny) / LENGSTE          # meter per piksel i det ferdige bildet
    f = max(1, math.ceil(res / GRENSE))                    # kildebildet hentes f ganger så tett
    if f == 1 and res / 2 >= 4:
        f = 2
    kres = res / f
    w, h = math.ceil((maxx - minx) / res), math.ceil((maxy - miny) / res)
    kw, kh = w * f, h * f
    kilde = np.zeros((kh, kw, 4), dtype=np.uint8)
    kall, sek, sld = 0, 0.0, stil()
    for ty in range(0, kh, FLIS):
        for tx in range(0, kw, FLIS):
            tw, th = min(FLIS, kw - tx), min(FLIS, kh - ty)
            bbox = (minx + tx * kres, maxy - (ty + th) * kres, minx + (tx + tw) * kres, maxy - ty * kres)
            sp = dict(service='WMS', version='1.3.0', request='GetMap', layers='okosystemtype', styles='', crs='EPSG:25833',
                      bbox=','.join(f'{v:.2f}' for v in bbox), width=tw, height=th, format='image/png', transparent='true', sld_body=sld)
            data, type_, dt = hent(WMS + '?' + urllib.parse.urlencode(sp))
            if 'image' not in type_:
                raise RuntimeError(f'{nr}: uventet svar fra NIBIO ({type_}): {data[:200].decode("utf8", "replace")}')
            kilde[ty:ty + th, tx:tx + tw] = np.asarray(Image.open(io.BytesIO(data)).convert('RGBA'))
            kall += 1
            sek += dt
    flat = kilde.reshape(-1, 4)
    pakket = flat[:, 0].astype(np.uint32) << 16 | flat[:, 1].astype(np.uint32) << 8 | flat[:, 2]
    ulike, plass = np.unique(pakket, return_inverse=True)
    blanding = andeler(np.stack([ulike >> 16 & 255, ulike >> 8 & 255, ulike & 255], 1))
    alfa = flat[:, 3].astype(np.float32) / 255
    # andel av hver klasse per piksel i det ferdige bildet: snittet av f x f kildepiksler
    F = np.stack([(blanding[plass, c] * alfa).reshape(h, f, w, f).mean(axis=(1, 3)) for c in range(6)], -1)
    sum_ = F.sum(-1)
    inne = maske(flate, minx, maxy, res, w, h)
    orden = np.argsort(-F, -1)
    a, b = orden[..., 0], orden[..., 1]                    # de to klassene det er mest av
    fa = np.take_along_axis(F, a[..., None], -1)[..., 0]
    fb = np.take_along_axis(F, b[..., None], -1)[..., 0]
    q = np.round(6 * fa / np.maximum(fa + fb, 1e-6)).astype(int)   # andelen av den største, i sjettedeler
    farge = np.round((q[..., None] * FARGER[a] + (6 - q[..., None]) * FARGER[b]) / 6).astype(np.uint32)
    synlig = (inne >= 0.5) & (sum_ > 0.3)
    nokkel = np.where(synlig, (farge[..., 0] << 16 | farge[..., 1] << 8 | farge[..., 2]) + 1, 0)
    nokler, indeks = np.unique(nokkel, return_inverse=True)
    if len(nokler) > 256:
        raise RuntimeError(f'{nr}: {len(nokler)} farger, flere enn en fargetabell rommer')
    tabell, gjennomsiktig = [], []
    for k in nokler:
        if k == 0:
            tabell += [0, 0, 0]
            gjennomsiktig.append(0)
        else:
            k -= 1
            tabell += [int(k >> 16 & 255), int(k >> 8 & 255), int(k & 255)]
            gjennomsiktig.append(255)
    bilde = Image.fromarray(indeks.reshape(h, w).astype(np.uint8), 'P')
    bilde.putpalette(tabell + [0] * (768 - len(tabell)))
    os.makedirs(ut, exist_ok=True)
    fil = os.path.join(ut, f'{nr}.png')
    bilde.save(fil, transparency=bytes(gjennomsiktig), optimize=True)
    storst = np.where(synlig, a, -1)
    km2 = {NAVN[c]: round(float((storst == c).sum() * res * res / 1e6), 1) for c in range(6)}
    utsnitt = [round(minx, 1), round(maxy - h * res, 1), round(minx + w * res, 1), round(maxy, 1)]
    return utsnitt, dict(piksler=f'{w}x{h}', meter_per_piksel=round(res, 1), kall=kall, sekunder=round(sek, 1), kB=os.path.getsize(fil) // 1024, km2=km2)


def main():
    p = argparse.ArgumentParser(description='Lager lagrede oversiktsbilder for kommuner.')
    p.add_argument('kommuner', nargs='*', help='kommunenumre, for eksempel 5001')
    p.add_argument('--fylke', help='alle kommunene i et fylke, etter fylkesnummer i kommuner.json')
    p.add_argument('--paa-nytt', action='store_true', help='lag bildet også når kommunen har et fra før')
    p.add_argument('--hentet', help='tekst for når bildene er hentet, vises på siden')
    p.add_argument('--ut', default=os.path.join(ROT, 'oversikt'), help='mappe for bildene')
    p.add_argument('--register', default=os.path.join(ROT, 'oversikt.json'), help='registeret som oppdateres. Tom tekst for å la være')
    a = p.parse_args()
    numre = list(a.kommuner)
    if a.fylke:
        fylker = json.load(open(os.path.join(ROT, 'kommuner.json'), encoding='utf8'))
        numre += sorted(k[0] for f in fylker if f[0] == a.fylke for k in f[2])
    if not numre:
        p.error('oppgi kommunenumre eller --fylke')
    register = json.load(open(a.register, encoding='utf8')) if a.register and os.path.exists(a.register) else {'versjon': 'årsversjon 2025', 'hentet': '', 'kommuner': {}}
    for nr in numre:
        if not a.paa_nytt and nr in register['kommuner'] and os.path.exists(os.path.join(a.ut, f'{nr}.png')):
            print(nr, 'har bilde fra før')
            continue
        try:
            utsnitt, info = bygg(nr, a.ut)
        except Exception as e:
            print(nr, 'FEIL', repr(e)[:200], flush=True)
            continue
        register['kommuner'][nr] = utsnitt
        print(nr, json.dumps(info, ensure_ascii=False), flush=True)
        if a.register:   # lagres for hver kommune, så en avbrutt kjøring ikke mister det som er gjort
            if a.hentet:
                register['hentet'] = a.hentet
            json.dump(register, open(a.register, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
