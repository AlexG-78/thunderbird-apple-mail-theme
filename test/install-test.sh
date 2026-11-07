#!/bin/bash
# Sandbox test for tools/mail/install.sh and profile.py: a fake snap profile with the user's own settings and
# userChrome.css; install, a later change by the user, install again, remove. Changes nothing outside its temp dir.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd); inst=$here/../install.sh
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export HOME=$tmp/home XDG_CONFIG_HOME=$tmp/home/.config
mkdir -p "$tmp/bin"; printf '#!/bin/sh\n[ -e "%s/tb-runs" ]\n' "$tmp" > "$tmp/bin/pgrep"; chmod +x "$tmp/bin/pgrep"
export PATH=$tmp/bin:$PATH   # a running Thunderbird is simulated: the real one may run while this test does
base=$HOME/snap/thunderbird/common/.thunderbird; P=$base/abc.default-esr
mkdir -p "$P/chrome" "$XDG_CONFIG_HOME"
printf '[Install1234]\nDefault=abc.default-esr\nLocked=1\n\n[Profile0]\nName=default-esr\nIsRelative=1\nPath=abc.default-esr\nDefault=1\n' > "$base/profiles.ini"
printf '// Mozilla User Preferences\nuser_pref("mail.threadpane.cardsview.rowcount", 2);\nuser_pref("mail.identity.id1.fullName", "A \\"quoted\\" name");\n' > "$P/prefs.js"
echo '{"chrome://messenger/content/messenger.xhtml":{"folderTree":{"mode":"all","compact":"true"},"messengerWindow":{"width":"900"}}}' > "$P/xulstore.json"
printf '/* my own rule */\n#folderPane { color: red; }' > "$P/chrome/userChrome.css"   # no newline at the end
mkdir -p "$HOME/.themes/MacTahoe-Light/gtk-3.0/assets" "$HOME/snap/thunderbird/common"   # MacTahoe's GTK theme for the snap
echo '/* theme */' > "$HOME/.themes/MacTahoe-Light/gtk-3.0/gtk.css"; touch "$HOME/.themes/MacTahoe-Light/index.theme"

n=0 fail=0
check() { n=$((n + 1)); if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=$((fail + 1)); fi; }
pref() { python3 -I -c 'import re,sys
for l in open(sys.argv[1]):
    m = re.match(r"user_pref\(\"([^\"]+)\", (.*)\);", l)
    if m and m.group(1) == sys.argv[2]: print(m.group(2))' "$P/prefs.js" "$1"; }
xul() { python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1]))["chrome://messenger/content/messenger.xhtml"]; print(d.get(sys.argv[2],{}).get(sys.argv[3],"-"))' "$P/xulstore.json" "$1" "$2"; }
run() { script -qec "bash '$inst' $*" /dev/null; }   # install asks: it needs a terminal

check "profile found in profiles.ini" '[ "$(python3 -I "$here/../profile.py" find)" = "$P" ]'
check "status before: not applied" '! bash "$inst" status'
check "no terminal: asks nothing, changes nothing (exit 3)" 'bash "$inst" </dev/null >/dev/null; [ $? = 3 ] && ! grep -q mbp115-mail "$P/chrome/userChrome.css"'
touch "$tmp/tb-runs"; echo y | run >/dev/null; rc=$?; rm "$tmp/tb-runs"
check "Thunderbird running, no answer: stops, nothing changed" '[ $rc = 3 ] && ! grep -q mbp115-mail "$P/chrome/userChrome.css"'
echo n | run >/dev/null
check "declined: nothing changed" '! grep -q mbp115-mail "$P/chrome/userChrome.css" && [ "$(pref mail.threadpane.cardsview.rowcount)" = 2 ]'
echo y | run >/dev/null
check "install: status applied" 'bash "$inst" status'
check "install: own CSS kept, block appended on its own line" 'grep -q "my own rule" "$P/chrome/userChrome.css" && grep -qx "/\* mbp115-mail begin \*/" "$P/chrome/userChrome.css"'
check "install: address book look in userContent.css" 'grep -q "about:addressbook" "$P/chrome/userContent.css"'
check "install: settings written" '[ "$(pref mail.threadpane.cardsview.rowcount)" = 3 ] && [ "$(pref toolbar.unifiedtoolbar.buttonstyle)" = 2 ]'
check "install: other prefs untouched (quotes kept)" 'grep -qF "A \\\"quoted\\\" name" "$P/prefs.js"'
check "install: layout written, other window data kept" '[ "$(xul folderTree mode)" = smart ] && [ "$(xul folderTree compact)" = true ] && [ "$(xul messengerWindow width)" = 900 ]'
check "install: add-on in the profile" '[ -s "$P/extensions/mbp115-quick-actions@alexg-78.xpi" ] && python3 -I "$here/../profile.py" addon same "$P"'
check "install: backup saved" '[ -s "$XDG_CONFIG_HOME/mbp115/mail.backup.json" ]'
check "install: GTK theme copied for the snap" '[ -s "$HOME/snap/thunderbird/common/.themes/MacTahoe-Light/gtk-3.0/gtk.css" ] && [ -e "$HOME/snap/thunderbird/common/.themes/MacTahoe-Light/.mbp115-mail" ]'
check "install: sender names formatted again" '[ "$(pref mail.displayname.version)" = 1 ]'

# the user changes two settings in Thunderbird afterwards
sed -i 's/"toolbar.unifiedtoolbar.buttonstyle", 2/"toolbar.unifiedtoolbar.buttonstyle", 0/' "$P/prefs.js"
python3 -I -c 'import json,sys; f=sys.argv[1]; d=json.load(open(f)); d["chrome://messenger/content/messenger.xhtml"]["folderTree"]["mode"]="all,favorite"; json.dump(d,open(f,"w"))' "$P/xulstore.json"
check "user change: still counts as applied" 'bash "$inst" status'
echo y | run >/dev/null
check "install again: the user's changes stay" '[ "$(pref toolbar.unifiedtoolbar.buttonstyle)" = 0 ] && [ "$(xul folderTree mode)" = all,favorite ]'
check "install again: one block only" '[ "$(grep -c "mbp115-mail begin" "$P/chrome/userChrome.css")" = 1 ]'
# an older kit wrote rowcount 9: the profile still has it, the kit now says 3
python3 -I -c 'import json,sys; f=sys.argv[1]; d=json.load(open(f)); d["keys"]["pref:mail.threadpane.cardsview.rowcount"]["kit"]="9"; json.dump(d,open(f,"w"))' "$XDG_CONFIG_HOME/mbp115/mail.backup.json"
sed -i 's/"mail.threadpane.cardsview.rowcount", 3/"mail.threadpane.cardsview.rowcount", 9/' "$P/prefs.js"
check "kit update: status not applied" '! bash "$inst" status'
echo y | run >/dev/null
check "kit update: new value written, the user's changes stay" '[ "$(pref mail.threadpane.cardsview.rowcount)" = 3 ] && [ "$(pref toolbar.unifiedtoolbar.buttonstyle)" = 0 ] && [ "$(xul folderTree mode)" = all,favorite ]'

run remove >/dev/null
check "remove: no userContent.css left" '[ ! -e "$P/chrome/userContent.css" ]'
check "remove: block gone, own CSS kept" '! grep -q mbp115-mail "$P/chrome/userChrome.css" && grep -q "my own rule" "$P/chrome/userChrome.css"'
check "remove: settings back" '[ "$(pref mail.threadpane.cardsview.rowcount)" = 2 ] && [ -z "$(pref mail.fixed_width_messages)" ]'
check "remove: the user's later changes stay" '[ "$(pref toolbar.unifiedtoolbar.buttonstyle)" = 0 ] && [ "$(xul folderTree mode)" = all,favorite ]'
check "remove: layout back" '[ "$(xul spacesToolbar hidden)" = - ] && [ "$(xul messengerWindow width)" = 900 ]'
check "remove: sender names formatted again" '[ "$(pref mail.displayname.version)" -ge 2 ]'
check "remove: add-on gone" '[ ! -e "$P/extensions/mbp115-quick-actions@alexg-78.xpi" ]'
check "remove: GTK theme copy gone" '[ ! -e "$HOME/snap/thunderbird/common/.themes" ]'
check "remove: backup gone" '[ ! -e "$XDG_CONFIG_HOME/mbp115/mail.backup.json" ]'

rm "$P/chrome/userChrome.css"; echo y | run >/dev/null; run remove >/dev/null
check "remove without own CSS: no empty userChrome.css left" '[ ! -e "$P/chrome/userChrome.css" ]'
echo "mail off" > "$XDG_CONFIG_HOME/mbp115/ui-choices"
check "switched off: status ok, install does nothing" 'bash "$inst" status && bash "$inst" </dev/null | grep -q "switched off"'
rm -rf "$base"; rm -f "$XDG_CONFIG_HOME/mbp115/ui-choices"
check "no profile: status 4" 'bash "$inst" status; [ $? = 4 ]'
echo "$((n - fail))/$n passed"
[ $fail = 0 ]
