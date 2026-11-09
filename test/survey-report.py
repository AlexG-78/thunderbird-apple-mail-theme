#!/usr/bin/env python3
"""Summary of one survey run: survey-report.py <dir>: writes <dir>/report.txt, prints the totals; exit 1 on findings."""
import collections, json, os, sys
d = sys.argv[1]
rows = [json.loads(l) for l in open(f'{d}/results.jsonl')] if os.path.exists(f'{d}/results.jsonl') else []
# a window opened without its arguments has no sensible size: stock Thunderbird clips the same ones
for r in rows:
    if r.get('kind') == 'window' and r.get('bad'): r['bad'] = [b for b in r['bad'] if not b.startswith('clipped')]
out, kinds = [], collections.Counter()
errors = [r for r in rows if r.get('error')]
bad = [r for r in rows if r.get('bad')]
for r in bad:
    for b in r['bad']: kinds[b.split(':')[0]] += 1
out.append(f"{len(rows)} opened, {len(errors)} could not be opened or measured, {len(bad)} with the old look ({dict(kinds)})")
out.append('finished' if os.path.exists(f'{d}/done') else 'NOT finished (time limit)')
for key, label in (('bg', 'window background'), ('font', 'window font')):
    out.append(f'{label}: ' + ', '.join(f'{k} x{v}' for k, v in collections.Counter(r[key] for r in rows if r.get(key)).most_common(8)))
for key in ('buttonBg', 'buttonHeight'):
    c = collections.Counter()
    for r in rows:
        for k, v in r.get('vals', {}).get(key, {}).items(): c[k] += v
    out.append(f'{key}: ' + ', '.join(f'{k} x{v}' for k, v in c.most_common(10)))
out.append('')
for r in errors: out.append(f"ERROR {r['name']}: {r['error']}")
out.append('')
for r in bad:
    out.append(f"{r['name']}  ({r.get('url', '')})")
    out += [f'   {b}' for b in r['bad'][:12]]
open(f'{d}/report.txt', 'w').write('\n'.join(out) + '\n')
print(os.path.basename(d), '|', out[0], '|', out[1])
sys.exit(1 if bad or errors or not rows else 0)
