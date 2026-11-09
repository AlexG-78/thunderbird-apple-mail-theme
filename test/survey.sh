#!/bin/bash
# UI/UX and user test of the Mail look: opens every window, popup and view of a throwaway Thunderbird (the paths a user
# takes, then each window document in Thunderbird's omni.ja), measures each against the look and takes a picture.
#   survey.sh [light|dark ...]   default both; results in out/survey/<style>/ (report.txt, results.jsonl, <name>.png)
#   MAIL_TEST_ONLY=<regexp>   only the window documents that match, no user paths; MAIL_TEST_CSS=none   as Thunderbird comes
# Exit 0: nothing measured as the old look and every step opened. Changes nothing outside its temporary directories and out/.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 -I - "$tmp/windows.json" <<'P'
import json, re, sys, zipfile
z = zipfile.ZipFile('/snap/thunderbird/current/usr/lib/thunderbird/omni.ja')
urls = []
for n in z.namelist():
    if not n.endswith('.xhtml'): continue
    m = re.match(r'chrome/(?:messenger|toolkit|pippki|openpgp|chat|newsblog)/content/([^/]+)/(.+)', n)
    if m: urls.append(f'chrome://{m[1]}/content/{m[2]}')
    elif n.startswith('chrome/calendar/content/'): urls.append('chrome://calendar/content/' + n[len('chrome/calendar/content/'):])
json.dump(sorted(urls), open(sys.argv[1], 'w'))
P
(cd "$here/survey" && zip -qr "$tmp/mbp115-mail-survey@alexg-78.xpi" .)
styles=${*:-light dark}
MAIL_TEST_SURVEY=$tmp/windows.json MAIL_TEST_XPI=$tmp/mbp115-mail-survey@alexg-78.xpi MAIL_TEST_STYLES=$styles MAIL_TEST_TIME=${MAIL_TEST_TIME:-900} \
    bash "$here/run.sh" ${MAIL_TEST_CSS:-} >"$tmp/run.log" 2>&1
grep -E 'FAILED|stopped|no screenshot' "$tmp/run.log" | cut -c1-200 | head -40
rc=0
for s in $styles; do python3 -I "$here/survey-report.py" "$here/out/survey/$s" || rc=1; done
exit $rc
