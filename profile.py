#!/usr/bin/env python3
"""Thunderbird profile changes of the Mail look (tools/mail/install.sh runs it; Thunderbird must be closed).

  profile.py find                          the default profile of the snap or the deb Thunderbird (exit 4: none)
  profile.py apply|revert|status <profile> <backup.json>
  profile.py addon install|remove|same <profile>   the kit's add-on Mail Quick Actions (addon/ here) in the profile


The kit's values are prefs.js (settings) and xulstore.json (toolbar, sidebar and header layout) next to this file.
apply saves each value it replaces in the backup, once, together with the value it wrote; revert puts the saved
value back unless the user changed it since. status: exit 0 when every kit value was applied once.
"""
import configparser
import json
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ADDON = "mbp115-quick-actions@alexg-78"
PREF = re.compile(r'^\s*user_pref\("((?:[^"\\]|\\.)*)",\s*(.*?)\);\s*$')


def find():
    home = os.path.expanduser("~")
    for base in (f"{home}/snap/thunderbird/common/.thunderbird", f"{home}/.thunderbird"):
        ini = configparser.ConfigParser(interpolation=None)
        if not ini.read(f"{base}/profiles.ini"):
            continue
        paths = [ini[s]["Default"] for s in ini.sections() if s.startswith("Install") and "Default" in ini[s]]
        paths += [ini[s]["Path"] for s in ini.sections() if s.startswith("Profile") and ini[s].get("Default") == "1"]
        for p in paths:
            p = p if os.path.isabs(p) else f"{base}/{p}"
            if os.path.isfile(f"{p}/prefs.js"):
                print(p)
                return 0
    return 4


def read_prefs(path):
    prefs = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            m = PREF.match(line)
            if m:
                prefs[m.group(1)] = m.group(2)
    return prefs


def write_prefs(path, changes):   # changes: name -> value, None = remove the line
    lines = open(path, encoding="utf-8").read().splitlines() if os.path.exists(path) else []
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


def atomic(path, text):
    tmp = f"{path}.mbp115-tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def kit_values():
    """key -> value: "pref:<name>" (prefs.js syntax) and "xul:<doc>|<id>|<attr>" (string)."""
    vals = {f"pref:{k}": v for k, v in read_prefs(f"{HERE}/prefs.js").items()}
    for doc, ids in json.load(open(f"{HERE}/xulstore.json")).items():
        for i, attrs in ids.items():
            for a, v in attrs.items():
                vals[f"xul:{doc}|{i}|{a}"] = v
    return vals


class Profile:
    def __init__(self, path):
        self.path = path
        self.prefs = read_prefs(f"{path}/prefs.js")
        xs = f"{path}/xulstore.json"
        self.xul = json.load(open(xs, encoding="utf-8")) if os.path.exists(xs) else {}

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


def addon(cmd, profile):
    """Thunderbird finds an .xpi in the profile's extensions folder at its next start and asks once to turn it on."""
    src, xpi = f"{HERE}/addon", f"{profile}/extensions/{ADDON}.xpi"
    files = sorted(os.path.relpath(os.path.join(d, f), src) for d, _, fs in os.walk(src) for f in fs)
    if cmd == "same":
        try:
            with zipfile.ZipFile(xpi) as z:
                return 0 if sorted(z.namelist()) == files and all(
                    z.read(f) == open(f"{src}/{f}", "rb").read() for f in files) else 1
        except (OSError, zipfile.BadZipFile):
            return 1
    if cmd == "install":
        os.makedirs(os.path.dirname(xpi), exist_ok=True)
        with zipfile.ZipFile(f"{xpi}.mbp115-tmp", "w", zipfile.ZIP_DEFLATED) as z:
            for f in files:
                z.write(f"{src}/{f}", f)
        os.replace(f"{xpi}.mbp115-tmp", xpi)
        return 0
    if cmd == "remove":
        if os.path.exists(xpi):
            os.remove(xpi)
        return 0
    return 2


def main():
    cmd = sys.argv[1]
    if cmd == "find":
        return find()
    if cmd == "addon":
        return addon(sys.argv[2], sys.argv[3])
    prof, backup_path = Profile(sys.argv[2]), sys.argv[3]
    backup = json.load(open(backup_path)) if os.path.exists(backup_path) else {"profile": prof.path, "keys": {}}
    saved = backup["keys"]   # key -> {"orig": value or None, "kit": value written}
    kit = kit_values()
    if cmd == "status":
        return 0 if all(saved.get(k, {}).get("kit") == v for k, v in kit.items()) else 1
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
        prof.save(changes, names=not backup.get("names"))   # installs before this fix kept the old names
        backup["names"] = 1
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)
        atomic(backup_path, json.dumps(backup, indent=1))
        return 0
    if cmd == "revert":
        changes = {k: s["orig"] for k, s in saved.items() if prof.get(k) == s["kit"] and s["orig"] != s["kit"]}
        prof.save(changes)
        if os.path.exists(backup_path):
            os.remove(backup_path)
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
