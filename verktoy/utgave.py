#!/usr/bin/env python3
"""Setter nytt utgavemerke før en endring legges ut.

Siden består av flere filer, og nettleseren husker dem en stund. Hver fil hentes derfor med utgaven i adressen
(?v=...), så en ny index.html aldri blandes med gammel kode. Skriptet setter klokkeslettet nå, norsk tid, begge steder:
teksten som vises under «Vis teknisk informasjon» (VERSJON i js/felles.js), og ?v= i index.html.

Kjør fra roten av repoet:  python3 verktoy/utgave.py
"""
import os, re
from datetime import datetime
from zoneinfo import ZoneInfo

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MND = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']
na = datetime.now(ZoneInfo('Europe/Oslo'))
tekst, merke = f'{na.day}. {MND[na.month - 1]} kl. {na:%H.%M}', f'{na:%Y%m%d%H%M}'


def bytt(fil, monster, ny):
    sti = os.path.join(ROT, fil)
    s = open(sti, encoding='utf8').read()
    s, n = re.subn(monster, ny, s)
    if not n:
        raise SystemExit(f'Fant ikke utgavemerket i {fil}')
    open(sti, 'w', encoding='utf8').write(s)
    return n


bytt('js/felles.js', r"const VERSJON =\s*'[^']*'", f"const VERSJON = '{tekst}'")
n = bytt('index.html', r'\?v=\d+', f'?v={merke}')
print(f'Utgave: {tekst} ({n} adresser i index.html)')
