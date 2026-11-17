#!/usr/bin/env python3
"""Sandbox test for install.py: a made-up profile with the user's own settings and userChrome.css; install, a later
change by the user, install again, remove. Changes nothing outside its temporary directory.   python test/test_install.py"""
import json
import os
import subprocess
import sys
import tempfile

INST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "install.py")
DOC = "chrome://messenger/content/messenger.xhtml"
OWN = '/* my own rule */\n#folderPane { color: red; }'   # no newline at the end


def run(p, *args):
    return subprocess.run([sys.executable, "-I", INST, *args, "--profile", p], capture_output=True, text=True, stdin=subprocess.DEVNULL)


def text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


with tempfile.TemporaryDirectory() as p:
    chrome = f"{p}/chrome/userChrome.css"
    os.mkdir(f"{p}/chrome")
    with open(f"{p}/prefs.js", "w", encoding="utf-8") as f:
        f.write('// Mozilla User Preferences\nuser_pref("mail.threadpane.cardsview.rowcount", 2);\n'
                'user_pref("mail.identity.id1.fullName", "A \\"quoted\\" name");\n')
    with open(f"{p}/xulstore.json", "w", encoding="utf-8") as f:
        json.dump({DOC: {"folderTree": {"mode": "all", "compact": "true"}, "messengerWindow": {"width": "900"}}}, f)
    with open(chrome, "w", encoding="utf-8") as f:
        f.write(OWN)
    xul = lambda i, a: json.loads(text(f"{p}/xulstore.json"))[DOC].get(i, {}).get(a)

    assert run(p, "status").returncode == 1, "status before: not applied"
    assert run(p).returncode == 3 and "mbp115-mail" not in text(chrome), "no terminal, no --yes: nothing changed"
    r = run(p, "--yes")
    assert r.returncode == 0, r.stdout + r.stderr
    assert run(p, "status").returncode == 0, "status after install"
    prefs = text(f"{p}/prefs.js")
    assert 'user_pref("mail.threadpane.cardsview.rowcount", 3);' in prefs and 'A \\"quoted\\" name' in prefs
    assert xul("folderTree", "mode") == "smart" and xul("folderTree", "compact") == "true" and xul("messengerWindow", "width") == "900"
    assert text(chrome).startswith(OWN + "\n/* mbp115-mail begin */\n"), "the user's own rule stays, the block starts a line"
    assert os.path.exists(f"{p}/chrome/userContent.css") and os.path.exists(f"{p}/extensions/mbp115-quick-actions@alexg-78.xpi")

    # the user changes a setting afterwards: a second install leaves it, remove keeps it
    with open(f"{p}/prefs.js", "w", encoding="utf-8") as f:
        f.write(prefs.replace('"mail.pane_config.dynamic", 2', '"mail.pane_config.dynamic", 1'))
    assert run(p, "--yes").returncode == 0 and '"mail.pane_config.dynamic", 1' in text(f"{p}/prefs.js")
    assert text(chrome).count("mbp115-mail begin") == 1, "one block after a second install"

    assert run(p, "remove").returncode == 0
    prefs = text(f"{p}/prefs.js")
    assert 'user_pref("mail.threadpane.cardsview.rowcount", 2);' in prefs and '"mail.pane_config.dynamic", 1' in prefs
    assert "mail.openMessageBehavior" not in prefs, "a setting that was not there before is gone again"
    assert xul("folderTree", "mode") == "all" and xul("spacesToolbar", "hidden") is None
    assert text(chrome) == OWN + "\n" and not os.path.exists(f"{p}/chrome/userContent.css")
    assert not os.path.exists(f"{p}/extensions/mbp115-quick-actions@alexg-78.xpi") and not os.path.exists(f"{p}/mail-look.backup.json")
print("ok")
