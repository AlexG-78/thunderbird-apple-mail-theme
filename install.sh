#!/bin/bash
# Thunderbird like Apple's Mail - run as a REGULAR user, with Thunderbird closed.
#   bash tools/mail/install.sh            show the planned changes, ask, then apply them to the default profile
#   bash tools/mail/install.sh remove     take the look out and put the settings from before back
#   bash tools/mail/install.sh status     exit 0 if applied (or switched off); 4 = no Thunderbird profile
# In the profile: a marked block in chrome/userChrome.css (userChrome.css here), the settings of prefs.js here written
# into the profile's prefs.js, and the layout of xulstore.json here (toolbar, sidebar, message header). The values
# before are saved once in ~/.config/mbp115/mail.backup.json; a setting the user changes later is left alone. The
# kit's add-on Mail Quick Actions (addon/ here: buttons on the message under the pointer, two-finger swipes) goes
# into the profile's extensions folder; Thunderbird asks once to turn it on.
# Switched off in MacBook Pro Control's settings (page Changes, mbp115-ui mail), install and status leave it alone.
# MBP115_MAIL_PROFILE=<dir> works on that profile instead (tests: no check for a running Thunderbird).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../answer.sh
. "$here/../answer.sh"
CONF=${XDG_CONFIG_HOME:-$HOME/.config}/mbp115
BACKUP=$CONF/mail.backup.json
[ "$(id -u)" -ne 0 ] || { echo "Run without sudo (this is your Thunderbird profile)"; exit 1; }

prof=${MBP115_MAIL_PROFILE:-$(python3 -I "$here/profile.py" find)} || prof=
css=$prof/chrome/userChrome.css       # the windows
ucss=$prof/chrome/userContent.css    # the address book (a content page)
off() { grep -qx "mail off" "$CONF/ui-choices" 2>/dev/null; }
block() { sed -n '\|^/\* mbp115-mail begin|,\|^/\* mbp115-mail end|p' "${1:-$css}" 2>/dev/null | sed '1d;$d'; }
# Dock and app grid: Thunderbird with MacTahoe's Mail-style icon (internet-mail). The snap's desktop file names a fixed
# picture, so no icon theme reaches it; a copy in ~/.local/share/applications (marked X-Mbp115=mail) replaces it.
APPS=${XDG_DATA_HOME:-$HOME/.local/share}/applications
ICON=internet-mail
icon_src() {
    local f
    [ -f "${XDG_DATA_HOME:-$HOME/.local/share}/icons/MacTahoe/apps/scalable/$ICON.svg" ] || return 1
    for f in /var/lib/snapd/desktop/applications/thunderbird_thunderbird.desktop \
             /usr/share/applications/org.mozilla.Thunderbird.desktop /usr/share/applications/thunderbird.desktop; do
        [ -f "$f" ] && { echo "$f"; return 0; }
    done
    return 1
}
# StartupWMClass: the window's class is "thunderbird", and Ubuntu's hidden thunderbird.desktop (transitional deb) took
# it, so the pinned dock entry never showed Thunderbird as running
icon_body() {
    sed -e "s|^Icon=.*|Icon=$ICON|" -e '/^StartupWMClass=/d' \
        -e '/^\[Desktop Entry\]/a X-Mbp115=mail\nStartupWMClass=thunderbird' "$1"
}
icon_ours() { grep -qx 'X-Mbp115=mail' "$1" 2>/dev/null; }
icon_ok() {   # no MacTahoe or no Thunderbird entry: nothing to do; a copy of the user's own is left alone
    local s f; s=$(icon_src) || return 0; f=$APPS/${s##*/}
    [ -e "$f" ] && ! icon_ours "$f" && return 0
    [ "$(icon_body "$s")" = "$(cat "$f" 2>/dev/null)" ]
}
icon_set() {   # icon_set add|del
    local s f; s=$(icon_src) || s=/var/lib/snapd/desktop/applications/thunderbird_thunderbird.desktop
    f=$APPS/${s##*/}
    if [ "$1" = add ]; then
        icon_ok && return 0
        mkdir -p "$APPS" && icon_body "$s" > "$f.new" && mv "$f.new" "$f"
    else
        for f in "$APPS"/thunderbird_thunderbird.desktop "$APPS"/org.mozilla.Thunderbird.desktop "$APPS"/thunderbird.desktop; do
            icon_ours "$f" && rm -f "$f"
        done
    fi
    return 0
}
# Windows Thunderbird does not draw itself (a message opened on its own, a new mail) get their title bar from GTK and
# its theme. The snap cannot read ~/.themes, so they showed Adwaita's buttons (x - []); MacTahoe's GTK 3 theme is
# copied into the snap's own home (~/snap/thunderbird/common/.themes, kept across snap updates), marked .mbp115-mail.
# Both names get MacTahoe-Light's files, which hold both variants: with Thunderbird on Light and the desktop on Dark,
# Gecko needs a light variant of the desktop's theme or it falls back to Adwaita, and MacTahoe-Dark has none.
SNAPTHEMES=$HOME/snap/thunderbird/common/.themes
GTKSRC=$HOME/.themes/MacTahoe-Light/gtk-3.0
gtk_themes() { [ -d "${SNAPTHEMES%/.themes}" ] && [ -f "$GTKSRC/gtk.css" ] && ls -d "$HOME"/.themes/MacTahoe-Light "$HOME"/.themes/MacTahoe-Dark 2>/dev/null; }
gtk_ok() {
    local t
    for t in $(gtk_themes); do
        diff -rq "$GTKSRC" "$SNAPTHEMES/${t##*/}/gtk-3.0" >/dev/null 2>&1 || return 1
    done
}
gtk_set() {   # gtk_set add|del
    local t
    if [ "$1" = add ]; then
        for t in $(gtk_themes); do
            [ -e "$SNAPTHEMES/${t##*/}" ] && [ ! -e "$SNAPTHEMES/${t##*/}/.mbp115-mail" ] && continue   # the user's own copy
            rm -rf "$SNAPTHEMES/${t##*/}" && mkdir -p "$SNAPTHEMES/${t##*/}" \
                && cp -r "$GTKSRC" "$t/index.theme" "$SNAPTHEMES/${t##*/}/" && touch "$SNAPTHEMES/${t##*/}/.mbp115-mail"
        done
    else
        for t in "$SNAPTHEMES"/*/; do
            [ -e "$t.mbp115-mail" ] && rm -rf "$t"
        done
        rmdir "$SNAPTHEMES" 2>/dev/null
    fi
    return 0
}
applied() {
    [ "$(block)" = "$(cat "$here/userChrome.css")" ] && [ "$(block "$ucss")" = "$(cat "$here/userContent.css")" ] && python3 -I "$here/profile.py" status "$prof" "$BACKUP" \
        && python3 -I "$here/profile.py" addon same "$prof" && icon_ok && gtk_ok
}
running() {   # Thunderbird writes prefs.js and xulstore.json when it quits: change them only while it is closed
    [ -z "${MBP115_MAIL_PROFILE:-}" ] && pgrep -u "$(id -u)" -x 'thunderbird|thunderbird-bin' >/dev/null
}
css_block() {   # css_block add|del [profile file] [kit file]
    local f=${2:-$css} src=${3:-$here/userChrome.css}
    [ -f "$f" ] && sed -i '\|^/\* mbp115-mail begin|,\|^/\* mbp115-mail end|d' "$f"
    if [ "$1" = add ]; then
        mkdir -p "${f%/*}"
        [ -s "$f" ] && [ -n "$(tail -c1 "$f")" ] && echo >> "$f"   # the marker must start a line
        printf '/* mbp115-mail begin */\n%s\n/* mbp115-mail end */\n' "$(cat "$src")" >> "$f"
    elif [ -f "$f" ] && [ -z "$(tr -d '[:space:]' < "$f")" ]; then rm -f "$f"; fi
}

case ${1:-install} in
  install)
    off && { echo "The Mail look is switched off in MacBook Pro Control's settings (page Changes)."; exit 0; }
    [ -n "$prof" ] || { echo "No Thunderbird profile found - start Thunderbird once, then run this again."; exit 4; }
    applied && { echo "Thunderbird already looks like Mail."; exit 0; }
    echo "Thunderbird like Mail (profile $prof):"
    echo "   Look: grey sidebar, a plain message list with blue unread dots, rounded selection, coloured window buttons"
    echo "   Layout: three columns, weekday dates this week, names instead of addresses; a message opened by double-click"
    echo "        opens in its own window, as in Mail"
    icon_src >/dev/null && echo "   Dock and app grid: Thunderbird with the icon theme's Mail-style icon"
    echo "   Toolbar like Mail 26, the kit's own icons in capsules: New | Reply, Reply All, Forward |"
    echo "        Archive, Delete, Junk | Move | Flag, and a round search field"
    echo "   Sidebar: one Inbox for all accounts (Unified Folders), no 'New Message' bar, the Spaces bar hidden"
    echo "        (the button at the bottom left brings it back; Calendar and Contacts also stay in the ≡ menu)"
    echo "   Message header: a card with the picture, the sender's name and the subject under it; under the pointer"
    echo "        Delete | Reply, Reply All, Forward and beside it the attachments (count, Save); menus like macOS;"
    echo "        plain-text mails in the normal font"
    echo "   Contacts like macOS Contacts (names only, a centred card); Calendar like macOS Calendar (light events"
    echo "        with a colour bar, today in red, no event list above the week)"
    echo "   A message in its own window: Mail's actions in capsules (Reply, Reply All, Forward | Archive, Delete, Junk |"
    echo "        Move | Flag), the menu bar behind Alt"
    [ -n "$(gtk_themes)" ] && echo "   Its title bar (and the compose window's) with MacTahoe's coloured buttons: the theme is copied for the snap"
    echo "   Compose and reply window like Mail's: Send and the actions in capsules, plain To/Subject/From rows,"
    echo "        the formatting bar behind Aa, attachments as tiles, no progress window while sending, the menu bar behind Alt"
    echo "   Kit add-on Mail Quick Actions: read/unread, flag, archive and delete on the message under the pointer;"
    echo "        ⌫ deletes the selected messages in the list; a pinch zooms the message (level shown, click: 100 %);"
    echo "        dates like Mail (time, Yesterday, weekday);"
    echo "        conversations (threads, collapsed, with their names, count, flag and paperclip); contact pictures or initials"
    echo "        (address book only); two lines of each message under the subject; the mailbox in the unified Inbox;"
    echo "        toolbar actions over the message; the kit's line icons in place of Thunderbird's own everywhere.
        Nothing is loaded from the internet; each part can be switched off"
    echo "   Thunderbird's own settings can change each of these later. Undo: bash tools/mail/install.sh remove"
    if ! answered; then   # with --answers the user chose it in MacBook Pro Setup
        [ -t 0 ] || { echo "Not asking without a terminal - nothing changed."; exit 3; }
        read -r -p "   Apply these changes? [Y/n] " a
        [[ ${a:-y} =~ ^[YyJj] ]] || { echo "Nothing changed."; exit 3; }
    fi
    while running; do
        [ -t 0 ] || { echo "Thunderbird is running: quit it, then run this step again. Nothing changed."; exit 3; }
        read -r -p "   Please quit Thunderbird first, then press Enter (or type q to stop) " a && [ "$a" != q ] \
            || { echo "Nothing changed."; exit 3; }
    done
    python3 -I "$here/profile.py" apply "$prof" "$BACKUP" || { echo "The settings could not be written."; exit 1; }
    css_block add
    css_block add "$ucss" "$here/userContent.css"
    python3 -I "$here/profile.py" addon install "$prof" || { echo "The add-on could not be copied."; exit 1; }
    icon_set add
    gtk_set add
    applied || { echo "Some changes could not be made."; exit 1; }
    echo "Done - start Thunderbird to see it. Turn on the quick actions once: ≡ menu > Add-ons and Themes >"
    echo "   Extensions > Mail Quick Actions (Thunderbird keeps add-ons copied into the profile off until you do)."
    ;;
  remove)
    [ -n "$prof" ] || { echo "No Thunderbird profile found - nothing to remove."; exit 0; }
    while running; do
        [ -t 0 ] || { echo "Thunderbird is running - quit it first."; exit 1; }
        read -r -p "Please quit Thunderbird first, then press Enter (or type q to stop) " a && [ "$a" != q ] || exit 1
    done
    css_block del
    css_block del "$ucss"
    python3 -I "$here/profile.py" addon remove "$prof"
    icon_set del
    gtk_set del
    [ -f "$BACKUP" ] && python3 -I "$here/profile.py" revert "$prof" "$BACKUP"
    echo "Thunderbird looks and works as before (settings you changed since are kept)."
    ;;
  status) off && exit 0; [ -n "$prof" ] || exit 4; applied ;;
  *) echo "Usage: $0 [install|remove|status]"; exit 2 ;;
esac
