#!/bin/bash
# Headless look test for the Mail theme: Thunderbird with a throwaway profile and made-up mails, in a throwaway
# GNOME Shell 51 on a virtual monitor; one screenshot per style in out/ (light.png, dark.png).
#   run.sh [userChrome.css]   default: the kit's ../userChrome.css; "none" shows Thunderbird as it comes
#   MAIL_TEST_XPI="a.xpi b.xpi"   add-ons to install too (files named <add-on id>.xpi)
#   MAIL_TEST_SMTP=1   a mail server on 127.0.0.1:2525 that takes each message after 3 s
#   MAIL_TEST_POINTER="x,y x,y,click x,y,key:Control_L+z"   move the pointer (and click or press keys) after the
#     first shot: <style>-1.png, -2.png, ...
# Uses the snap's Thunderbird binary without the snap (the snap cannot reach the temporary dirs). Changes nothing
# outside its temporary directories and out/.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
css=${1:-$here/../userChrome.css}
tb=/snap/thunderbird/current/usr/lib/thunderbird/thunderbird-bin
[ -x "$tb" ] || { echo "Thunderbird snap not found ($tb)"; exit 1; }
out=$here/out; mkdir -p "$out"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/m.XXXX")   # short: the Wayland socket lives below it
[ -n "${MAIL_TEST_KEEP:-}" ] && echo "keeping $tmp" || trap 'rm -rf "$tmp" 2>/dev/null || true' EXIT

profile() {   # profile <dir> <dark 0|1>
    local p=$1
    mkdir -p "$p/Mail/pop.example.invalid" "$p/Mail/Local Folders" "$p/extensions" "$p/chrome"
    python3 -I "$here/gen-mails.py" "$p/Mail/pop.example.invalid/Inbox"
    python3 -I "$here/gen-calendar.py" "$p/cal.ics"
    (cd "$here/select" && zip -qr "$p/extensions/mbp115-mail-test@alexg-78.xpi" .)
    local x; for x in ${MAIL_TEST_XPI:-}; do cp "$x" "$p/extensions/"; done   # add-ons to try, named <id>.xpi
    [ "$css" = none ] || cp "$css" "$p/chrome/userChrome.css"
    [ "$css" = none ] || cp "$here/../userContent.css" "$p/chrome/userContent.css"
    cat > "$p/user.js" <<EOF
user_pref("mail.accountmanager.accounts", "account1,account2");
user_pref("mail.accountmanager.defaultaccount", "account1");
user_pref("mail.accountmanager.localfoldersserver", "server2");
user_pref("mail.account.account1.identities", "id1");
user_pref("mail.account.account1.server", "server1");
user_pref("mail.account.account2.server", "server2");
user_pref("mail.identity.id1.fullName", "Alex Example");
user_pref("mail.identity.id1.useremail", "me@example.com");
user_pref("mail.identity.id1.valid", true);
user_pref("mail.server.server1.type", "pop3");
user_pref("mail.server.server1.hostname", "pop.example.invalid");
user_pref("mail.server.server1.name", "Personal");
user_pref("mail.server.server1.userName", "me");
user_pref("mail.server.server1.directory-rel", "[ProfD]Mail/pop.example.invalid");
user_pref("mail.server.server1.login_at_startup", false);
user_pref("mail.smtpservers", "smtp1");
user_pref("mail.smtp.defaultserver", "smtp1");
user_pref("mail.smtpserver.smtp1.hostname", "127.0.0.1");
user_pref("mail.smtpserver.smtp1.port", 2525);
user_pref("mail.smtpserver.smtp1.authMethod", 1);
user_pref("mail.smtpserver.smtp1.try_ssl", 0);
user_pref("mail.identity.id1.smtpServer", "smtp1");
user_pref("mail.server.server1.check_new_mail", false);
user_pref("mail.server.server2.type", "none");
user_pref("mail.server.server2.hostname", "Local Folders");
user_pref("mail.server.server2.userName", "nobody");
user_pref("mail.server.server2.name", "Local Folders");
user_pref("mail.server.server2.directory-rel", "[ProfD]Mail/Local Folders");
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.autoDisableScopes", 0);
user_pref("mail.shell.checkDefaultClient", false);
user_pref("mailnews.start_page.enabled", false);
user_pref("mail.inappnotifications.enabled", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("app.update.auto", false);
user_pref("devtools.console.stdout.chrome", true);
user_pref("devtools.console.stdout.content", true);
user_pref("ui.systemUsesDarkTheme", $2);
user_pref("mailnews.default_view_flags", 0);   // folders shown flat, as in older profiles
user_pref("calendar.registry.kittest.type", "ics");
user_pref("calendar.registry.kittest.uri", "file://$p/cal.ics");
user_pref("calendar.registry.kittest.name", "Personal");
user_pref("calendar.registry.kittest.color", "#007aff");
user_pref("calendar.registry.kittest.readOnly", true);
user_pref("calendar.registry.kittest.calendar-main-in-composite", true);
user_pref("calendar.timezone.useSystemTimezone", true);
EOF
    [ "$css" = none ] && return 0
    cat "$here/../prefs.js" >> "$p/user.js"            # the kit's layout settings
    cp "$here/../xulstore.json" "$p/xulstore.json"     # toolbar, sidebar and message header layout
    (cd "$here/../addon" && zip -qr "$p/extensions/mbp115-quick-actions@alexg-78.xpi" .)   # Mail Quick Actions
}

[ -n "${MAIL_TEST_SMTP:-}" ] && { timeout 200 python3 -Ic "
import socket, time
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('127.0.0.1', 2525)); s.listen()
while True:
    c, _ = s.accept(); f = c.makefile('rwb', buffering=0); f.write(b'220 test\\r\\n'); body = False
    for l in f:
        if body:
            if l == b'.\\r\\n': time.sleep(3); f.write(b'250 ok\\r\\n'); body = False
        elif l[:4].upper() == b'DATA': body = True; f.write(b'354 go\\r\\n')
        elif l[:4].upper() == b'QUIT': f.write(b'221 bye\\r\\n'); break
        else: f.write(b'250 ok\\r\\n')
    c.close()" >/dev/null 2>&1 & }
ut=$(find "$HOME/.local/share/gnome-shell/extensions" -maxdepth 1 -name 'user-theme@*' 2>/dev/null | head -1)
rc=0
for style in ${MAIL_TEST_STYLES:-light dark}; do
    d=$tmp/$style; mkdir -p "$d/d/gnome-shell/extensions" "$d/c" "$d/k" "$d/r"; chmod 700 "$d/r"
    dark=0 gtk=MacTahoe-Light scheme=default
    [ $style = dark ] && dark=1 gtk=MacTahoe-Dark scheme=prefer-dark
    profile "$d/p" $dark
    cp -r "$here/mbp115-mail-shot@alexg-78" "$d/d/gnome-shell/extensions/"
    exts="'mbp115-mail-shot@alexg-78'"
    [ -n "$ut" ] && cp -r "$ut" "$d/d/gnome-shell/extensions/" && exts="$exts, '${ut##*/}'"
    [ -d "$HOME/.local/share/icons" ] && ln -s "$HOME/.local/share/icons" "$d/d/icons"
    look=""
    for key in icon-theme font-name accent-color; do
        look+="gsettings set org.gnome.desktop.interface $key \"$(gsettings get org.gnome.desktop.interface $key)\"; "
    done
    look+="gsettings set org.gnome.desktop.wm.preferences button-layout \"$(gsettings get org.gnome.desktop.wm.preferences button-layout)\"; "
    XDG_DATA_HOME=$d/d XDG_CONFIG_HOME=$d/c XDG_CACHE_HOME=$d/k XDG_RUNTIME_DIR=$d/r MAIL_TEST_OUT=$out/$style \
    MAIL_TEST_TB="MOZ_CRASHREPORTER_DISABLE=1 '$tb' -profile '$d/p' -no-remote >'$out/$style-tb.log' 2>&1" \
    dbus-run-session -- bash -c "
        gsettings set org.gnome.shell enabled-extensions \"[$exts]\"
        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
        gsettings set org.gnome.desktop.interface gtk-theme '$gtk'
        gsettings set org.gnome.desktop.interface color-scheme '$scheme'
        $look
        dconf write /org/gnome/shell/extensions/user-theme/name \"'MacTahoe-Dark'\"
        $(command -v gnutimeout || echo timeout) 90 gnome-shell --headless --wayland --no-x11 --virtual-monitor 1920x1200
    " >"$out/$style-shell.log" 2>&1 || true
    grep -h 'MAIL-TEST' "$out/$style-shell.log" "$out/$style-tb.log" 2>/dev/null || true
    [ -s "$out/$style.png" ] || { echo "$style: no screenshot, logs in $out"; rc=1; }
done
exit $rc
