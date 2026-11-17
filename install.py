#!/usr/bin/env python3
"""Thunderbird like Apple's Mail - puts the look into a Thunderbird profile (Windows, macOS, Linux).

  python install.py            show the planned changes, ask, then apply them to the default profile
  python install.py remove     take the look out and put the settings from before back
  python install.py status     exit 0 if applied, 1 if not, 4 = no Thunderbird profile
  --profile DIR                work on that profile instead of the default one
  --yes                        do not ask

Thunderbird must be closed: it writes prefs.js and xulstore.json when it quits.
In the profile: a marked block in chrome/userChrome.css and chrome/userContent.css (the files here, each followed by
controls.css), the settings of prefs.js here, the layout of xulstore.json here (toolbar, sidebar, message header) and
the add-on Mail Quick Actions (addon/ here) in the extensions folder; Thunderbird asks once to turn it on.
The values before are saved once in the profile's mail-look.backup.json; revert puts a saved value back unless the
user changed the setting since.
"""
import argparse
import configparser
import json
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ADDON = "mbp115-quick-actions@alexg-78"
BEGIN, END = "/* mbp115-mail begin */", "/* mbp115-mail end */"
PREF = re.compile(r'^\s*user_pref\("((?:[^"\\]|\\.)*)",\s*(.*?)\);\s*$')
CHANGES = """\
   Look: grey sidebar, a plain message list with blue unread dots, rounded selection, coloured window buttons
   Layout: three columns, weekday dates this week, names instead of addresses; a message opened by double-click
        opens in its own window, as in Mail
   Toolbar like Mail 26, line icons in capsules: New | Reply, Reply All, Forward | Archive, Delete, Junk | Move |
        Flag, and a round search field
   Sidebar: one Inbox for all accounts (Unified Folders), no 'New Message' bar, the Spaces bar hidden
        (the button at the bottom left brings it back; Calendar and Contacts also stay in the app menu)
   Message header: a card with the picture, the sender's name and the subject under it
   Contacts like macOS Contacts, Calendar like macOS Calendar, compose window like Mail's (the formatting bar
        behind Aa, the menu bar behind Alt); every dialog, popup and settings page in one look
   Add-on Mail Quick Actions: read/unread, flag, archive and delete on the message under the pointer, Backspace
        deletes in the list, a pinch zooms the message, conversations, contact pictures or initials, two-line
        previews. Nothing is loaded from the internet; each part can be switched off in the add-on's settings
   Thunderbird's own settings can change each of these later. Undo: python install.py remove"""


def find():
    """The default profile: the one of this installation, else the one marked Default in profiles.ini."""
    home = os.path.expanduser("~")
    if sys.platform == "win32":
        bases = [os.path.join(os.environ.get("APPDATA", f"{home}/AppData/Roaming"), "Thunderbird")]
    elif sys.platform == "darwin":
        bases = [f"{home}/Library/Thunderbird"]
    else:   # snap, flatpak, package
        bases = [f"{home}/snap/thunderbird/common/.thunderbird", f"{home}/.var/app/org.mozilla.Thunderbird/.thunderbird",
                 f"{home}/.thunderbird"]
    for base in bases:
        ini = configparser.ConfigParser(interpolation=None)
        if not ini.read(f"{base}/profiles.ini", encoding="utf-8"):
            continue
        paths = [ini[s]["Default"] for s in ini.sections() if s.startswith("Install") and "Default" in ini[s]]
        paths += [ini[s]["Path"] for s in ini.sections() if s.startswith("Profile") and ini[s].get("Default") == "1"]
        for p in paths:
            p = os.path.normpath(p if os.path.isabs(p) else f"{base}/{p}")
            if os.path.isfile(f"{p}/prefs.js"):
                return p
    return None


def running(profile):
    """True while a Thunderbird has the profile open (its lock on the profile is held)."""
    try:
        if sys.platform == "win32":   # held open without sharing, deleted when Thunderbird quits
            open(f"{profile}/parent.lock", "rb").close()
        else:
            import fcntl
            with open(f"{profile}/.parentlock", "r+b") as f:
                fcntl.lockf(f, fcntl.LOCK_EX | fcntl.LOCK_NB)   # released again when the file closes
    except FileNotFoundError:
        return False
    except OSError:
        return True
    return False


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def atomic(path, text):
    tmp = f"{path}.mail-look-tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)


# --- the style sheets: a marked block, the user's own rules around it stay
def kit_css(name):
    return read(f"{HERE}/{name}") + read(f"{HERE}/controls.css")


def css_split(path):
    """(the text without the block, the block's content or None); only with both markers, in order."""
    text = read(path) if os.path.exists(path) else ""
    b, e = text.find(BEGIN), text.find(END)
    if b < 0 or e < b:
        return text, None
    return text[:b] + text[e + len(END):].lstrip("\n"), text[b + len(BEGIN):e].strip("\n")


def css_set(path, kit):   # kit: the rules to put in, None = take the block out
    rest, _ = css_split(path)
    if kit is not None:
        if rest and not rest.endswith("\n"):
            rest += "\n"   # the marker must start a line
        os.makedirs(os.path.dirname(path), exist_ok=True)
        atomic(path, f"{rest}{BEGIN}\n{kit.strip(chr(10))}\n{END}\n")
    elif not rest.strip():
        if os.path.exists(path):
            os.remove(path)
    else:
        atomic(path, rest)


def css_same(path, kit):
    return css_split(path)[1] == kit.strip("\n")


# --- settings (prefs.js) and layout (xulstore.json)
def read_prefs(path):
    prefs = {}
    if os.path.exists(path):
        for line in read(path).splitlines():
            m = PREF.match(line)
            if m:
                prefs[m.group(1)] = m.group(2)
    return prefs


def write_prefs(path, changes):   # changes: name -> value, None = remove the line
    lines = read(path).splitlines() if os.path.exists(path) else []
    out, done = [], set()
    for line in lines:
        m = PREF.match(line)
        if m and m.group(1) in changes:
            done.add(m.group(1))
            if changes[m.group(1)] is not None:
                out.append(f'user_pref("{m.group(1)}", {changes[m.group(1)]});')
            continue
        out.append(line)
    out += [f'user_pref("{k}", {v});' for k, v in changes.items() if k not in done and v is not None]
    atomic(path, "\n".join(out) + "\n")


def kit_values():
    """key -> value: "pref:<name>" (prefs.js syntax) and "xul:<doc>|<id>|<attr>" (string)."""
    vals = {f"pref:{k}": v for k, v in read_prefs(f"{HERE}/prefs.js").items()}
    for doc, ids in json.loads(read(f"{HERE}/xulstore.json")).items():
        for i, attrs in ids.items():
            for a, v in attrs.items():
                vals[f"xul:{doc}|{i}|{a}"] = v
    return vals


class Profile:
    def __init__(self, path):
        self.path = path
        self.prefs = read_prefs(f"{path}/prefs.js")
        xs = f"{path}/xulstore.json"
        self.xul = json.loads(read(xs)) if os.path.exists(xs) else {}

    def get(self, key):
        kind, k = key.split(":", 1)
        if kind == "pref":
            return self.prefs.get(k)
        doc, i, a = k.split("|")
        return self.xul.get(doc, {}).get(i, {}).get(a)

    def save(self, changes, names=False):   # key -> value or None; names: let Thunderbird format the senders again
        prefs = {k[5:]: v for k, v in changes.items() if k.startswith("pref:")}
        if names or "pref:mail.addressDisplayFormat" in changes:
            # Thunderbird keeps the sender names it formatted in its folder files; a new version renews them
            prefs["mail.displayname.version"] = str(int(self.prefs.get("mail.displayname.version", "0")) + 1)
        if prefs:
            write_prefs(f"{self.path}/prefs.js", prefs)
        xul = {k[4:]: v for k, v in changes.items() if k.startswith("xul:")}
        if xul:
            for k, v in xul.items():
                doc, i, a = k.split("|")
                attrs = self.xul.setdefault(doc, {}).setdefault(i, {})
                if v is None:
                    attrs.pop(a, None)
                else:
                    attrs[a] = v
            atomic(f"{self.path}/xulstore.json", json.dumps(self.xul))


def settings(cmd, profile, backup_path):
    """apply saves each value it replaces, once, with the value it wrote; revert puts it back unless changed since."""
    prof = Profile(profile)
    saved = json.loads(read(backup_path))["keys"] if os.path.exists(backup_path) else {}
    kit = kit_values()   # saved: key -> {"orig": value or None, "kit": value written}
    if cmd == "status":
        return all(saved.get(k, {}).get("kit") == v for k, v in kit.items())
    if cmd == "apply":
        changes = {}
        for k, v in kit.items():
            cur = prof.get(k)
            if k in saved:
                mine = cur == saved[k]["kit"]
                saved[k]["kit"] = v
                if not mine:
                    continue   # changed by the user after the kit set it: leave it
            else:
                saved[k] = {"orig": cur, "kit": v}
            if cur != v:
                changes[k] = v
        names = not os.path.exists(backup_path)
        atomic(backup_path, json.dumps({"keys": saved}, indent=1))   # first: changes without a record could never be restored
        prof.save(changes, names=names)
    if cmd == "revert":
        prof.save({k: s["orig"] for k, s in saved.items() if prof.get(k) == s["kit"] and s["orig"] != s["kit"]})
        if os.path.exists(backup_path):
            os.remove(backup_path)
    return True


# --- the add-on
def addon(cmd, profile):
    """Thunderbird finds an .xpi in the profile's extensions folder at its next start and asks once to turn it on."""
    src, xpi = f"{HERE}/addon", f"{profile}/extensions/{ADDON}.xpi"
    files = sorted(os.path.relpath(os.path.join(d, f), src).replace(os.sep, "/") for d, _, fs in os.walk(src) for f in fs)
    if cmd == "same":
        try:
            with zipfile.ZipFile(xpi) as z:
                return sorted(z.namelist()) == files and all(z.read(f) == open(f"{src}/{f}", "rb").read() for f in files)
        except (OSError, zipfile.BadZipFile):
            return False
    if cmd == "install":
        os.makedirs(os.path.dirname(xpi), exist_ok=True)
        with zipfile.ZipFile(f"{xpi}.mail-look-tmp", "w", zipfile.ZIP_DEFLATED) as z:
            for f in files:
                z.write(f"{src}/{f}", f)
        os.replace(f"{xpi}.mail-look-tmp", xpi)
    if cmd == "remove" and os.path.exists(xpi):
        os.remove(xpi)
    return True


def ask(prompt):
    """The answer in lower case; None without a terminal (Windows takes the null device for one: input() ends)."""
    if not sys.stdin.isatty():
        return None
    try:
        return input(prompt).strip().lower()
    except EOFError:
        print()
        return None


def main():
    ap = argparse.ArgumentParser(description="Thunderbird like Apple's Mail")
    ap.add_argument("command", nargs="?", default="install", choices=["install", "remove", "status"])
    ap.add_argument("--profile", help="the Thunderbird profile folder (default: the default profile)")
    ap.add_argument("--yes", action="store_true", help="do not ask")
    args = ap.parse_args()
    prof = args.profile or find()
    if not prof or not os.path.isdir(prof):
        print("No Thunderbird profile found - start Thunderbird once, then run this again.")
        return 4
    chrome, ucontent, backup = f"{prof}/chrome/userChrome.css", f"{prof}/chrome/userContent.css", f"{prof}/mail-look.backup.json"

    def applied():
        return (css_same(chrome, kit_css("userChrome.css")) and css_same(ucontent, kit_css("userContent.css"))
                and settings("status", prof, backup) and addon("same", prof))

    if args.command == "status":
        return 0 if applied() else 1
    if args.command == "install":
        if applied():
            print("Thunderbird already looks like Mail.")
            return 0
        print(f"Thunderbird like Mail (profile {prof}):\n{CHANGES}")
        if not args.yes:
            a = ask("   Apply these changes? [Y/n] ")
            if a is None:
                print("Not asking without a terminal - nothing changed (--yes applies without asking).")
                return 3
            if a[:1] not in ("", "y", "j"):
                print("Nothing changed.")
                return 3
    while running(prof):
        a = ask("   Please quit Thunderbird first, then press Enter (or type q to stop) ")
        if a is None:
            print("Thunderbird is running: quit it, then run this again. Nothing changed.")
        if a is None or a == "q":
            return 3
    if args.command == "install":
        settings("apply", prof, backup)
        css_set(chrome, kit_css("userChrome.css"))
        css_set(ucontent, kit_css("userContent.css"))
        addon("install", prof)
        if not applied():
            print("Some changes could not be made.")
            return 1
        print("Done - start Thunderbird to see it. Turn on the quick actions once: app menu > Add-ons and Themes >\n"
              "   Extensions > Mail Quick Actions (Thunderbird keeps add-ons copied into the profile off until you do).")
    else:
        css_set(chrome, None)
        css_set(ucontent, None)
        addon("remove", prof)
        settings("revert", prof, backup)
        print("Thunderbird looks and works as before (settings you changed since are kept).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
