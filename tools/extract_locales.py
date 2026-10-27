#!/usr/bin/env python3
"""Write the keys the fork added to each locale as overlay files.

extract_locales.py REPO OLD_BASE OLD_TIP NEW_BASE OUTDIR
Reports keys whose value the fork changed (not only added) and keys that
NEW_BASE already has.
"""
import json, os, subprocess, sys
repo, base, tip, new_base, out = sys.argv[1:]

def show(rev, path):
    r = subprocess.run(['git', '-C', repo, 'show', f'{rev}:{path}'], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else None

def added(old, new, path=()):
    result = {}
    for key, value in new.items():
        if key not in old:
            result[key] = value
        elif isinstance(value, dict) and isinstance(old[key], dict):
            sub = added(old[key], value, path + (key,))
            if sub:
                result[key] = sub
        elif old[key] != value:
            print('CHANGED', '.'.join(path + (key,)), file=sys.stderr)
    return result

def clashes(overlay, target, path=()):
    for key, value in overlay.items():
        if key in target:
            if isinstance(value, dict) and isinstance(target[key], dict):
                clashes(value, target[key], path + (key,))
            else:
                print('EXISTS', '.'.join(path + (key,)), file=sys.stderr)

langs = subprocess.run(['git', '-C', repo, 'ls-tree', '--name-only', tip, 'locales/'], capture_output=True, text=True).stdout.split()
for d in langs:
    lang = os.path.basename(d)
    old, new = show(base, f'{d}/common.json'), show(tip, f'{d}/common.json')
    if new is None:
        continue
    overlay = added(old or {}, new)
    if not overlay:
        continue
    target = show(new_base, f'{d}/common.json')
    if target is None:
        print('NO UPSTREAM LOCALE', lang, file=sys.stderr)
    else:
        clashes(overlay, target)
    os.makedirs(f'{out}/{lang}', exist_ok=True)
    with open(f'{out}/{lang}/common.json', 'w') as f:
        json.dump(overlay, f, ensure_ascii=False, indent=2)
        f.write('\n')
