#!/usr/bin/env python3
"""Headless look test on this machine's Thunderbird (Windows, macOS, Linux): a throwaway profile with made-up mails,
the look installed by install.py, one screenshot taken over Marionette. No window opens; nothing outside the
temporary directory changes; a running Thunderbird is left alone.

  python test/shot.py out.png [--dark] [--plain] [--js FILE [--new-window]]
  --plain        Thunderbird as it comes, without the look
  --js FILE      run this script in the main window first (its return value is printed)
  --new-window   the script opened a window (compose, a message): take that one
THUNDERBIRD=<binary> names another Thunderbird (a snap's cannot reach the temporary directory: see run.sh).
"""
import argparse
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 28281
ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--dark", action="store_true")
ap.add_argument("--plain", action="store_true")
ap.add_argument("--js")
ap.add_argument("--new-window", action="store_true")
args = ap.parse_args()
tb = os.environ.get("THUNDERBIRD") or {
    "win32": os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Mozilla Thunderbird", "thunderbird.exe"),
    "darwin": "/Applications/Thunderbird.app/Contents/MacOS/thunderbird"}.get(sys.platform) or shutil.which("thunderbird")
if not tb or not os.path.exists(tb):
    sys.exit("Thunderbird not found (THUNDERBIRD=<binary>)")

tmp = tempfile.mkdtemp(prefix="tbshot")
p = os.path.join(tmp, "p")
for d in ("Mail/pop.example.invalid", "Mail/Local Folders", "extensions"):
    os.makedirs(f"{p}/{d}")
subprocess.run([sys.executable, "-I", f"{HERE}/gen-mails.py", f"{p}/Mail/pop.example.invalid/Inbox"], check=True)
subprocess.run([sys.executable, "-I", f"{HERE}/gen-calendar.py", f"{p}/cal.ics"], check=True)
with zipfile.ZipFile(f"{p}/extensions/mbp115-mail-test@alexg-78.xpi", "w") as z:   # shows the inbox, selects a message
    for f in os.listdir(f"{HERE}/select"):
        z.write(f"{HERE}/select/{f}", f)
with open(f"{p}/prefs.js", "w") as f:
    f.write("// Mozilla User Preferences\n")
if not args.plain:
    subprocess.run([sys.executable, "-I", f"{HERE}/../install.py", "--yes", "--profile", p], check=True, stdout=subprocess.DEVNULL)
prefs = {
    "mail.accountmanager.accounts": "account1,account2", "mail.accountmanager.defaultaccount": "account1",
    "mail.accountmanager.localfoldersserver": "server2", "mail.account.account1.identities": "id1",
    "mail.account.account1.server": "server1", "mail.account.account2.server": "server2",
    "mail.identity.id1.fullName": "Alex Example", "mail.identity.id1.useremail": "me@example.com",
    "mail.identity.id1.valid": True, "mail.server.server1.type": "pop3",
    "mail.server.server1.hostname": "pop.example.invalid", "mail.server.server1.name": "Personal",
    "mail.server.server1.userName": "me", "mail.server.server1.directory-rel": "[ProfD]Mail/pop.example.invalid",
    "mail.server.server1.login_at_startup": False, "mail.server.server1.check_new_mail": False,
    "mail.server.server2.type": "none", "mail.server.server2.hostname": "Local Folders",
    "mail.server.server2.userName": "nobody", "mail.server.server2.name": "Local Folders",
    "mail.server.server2.directory-rel": "[ProfD]Mail/Local Folders",
    "toolkit.legacyUserProfileCustomizations.stylesheets": True, "xpinstall.signatures.required": False,
    "extensions.autoDisableScopes": 0,   # the add-ons copied into the profile are on at once
    "mail.shell.checkDefaultClient": False, "mailnews.start_page.enabled": False,
    "mail.inappnotifications.enabled": False, "datareporting.policy.dataSubmissionPolicyBypassNotification": True,
    "mail.rights.version": 1, "app.update.auto": False, "ui.systemUsesDarkTheme": int(args.dark),
    "mailnews.default_view_flags": 0,   # folders shown flat, as in older profiles
    "calendar.registry.kittest.type": "ics", "calendar.registry.kittest.uri": "file:///" + f"{p}/cal.ics".replace("\\", "/").lstrip("/"),
    "calendar.registry.kittest.name": "Personal", "calendar.registry.kittest.color": "#007aff",
    "calendar.registry.kittest.readOnly": True, "calendar.registry.kittest.calendar-main-in-composite": True,
    "marionette.port": PORT,
}
with open(f"{p}/user.js", "w", encoding="utf-8") as f:
    f.writelines(f'user_pref("{k}", {json.dumps(v)});\n' for k, v in prefs.items())

mid = 0


def recv(s):   # a message is <length>:<json>
    buf = b""
    while not buf.endswith(b":"):
        c = s.recv(1)
        if not c:
            raise EOFError
        buf += c
    n, data = int(buf[:-1]), b""
    while len(data) < n:
        data += s.recv(n - len(data))
    return json.loads(data)


def cmd(s, name, params=None):
    global mid
    mid += 1
    m = json.dumps([0, mid, name, params or {}]).encode()
    s.sendall(str(len(m)).encode() + b":" + m)
    r = recv(s)
    if r[2]:
        raise RuntimeError(f"{name}: {r[2].get('message')}")
    return r[3]


proc = subprocess.Popen([tb, "--headless", "-no-remote", "-profile", p, "--marionette"], stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL, env=dict(os.environ, MOZ_CRASHREPORTER_DISABLE="1", MOZ_REMOTE_ALLOW_SYSTEM_ACCESS="1"))
try:
    for _ in range(120):
        try:
            s = socket.create_connection(("127.0.0.1", PORT), timeout=90)
            break
        except OSError:
            time.sleep(0.5)
    else:
        sys.exit("Thunderbird did not start")
    recv(s)
    cmd(s, "WebDriver:NewSession", {"capabilities": {}})
    cmd(s, "Marionette:SetContext", {"value": "chrome"})
    cmd(s, "WebDriver:SetWindowRect", {"width": 1500, "height": 950})
    time.sleep(12)   # the test add-on opens the inbox and selects a message, the look's add-on places the toolbar
    if args.js:
        with open(args.js, encoding="utf-8") as f:
            print(json.dumps(cmd(s, "WebDriver:ExecuteScript", {"script": f.read(), "args": []}).get("value"), indent=1))
        time.sleep(5)
        if args.new_window:
            here = cmd(s, "WebDriver:GetWindowHandle")["value"]
            other = [h for h in cmd(s, "WebDriver:GetWindowHandles") if h != here]
            cmd(s, "WebDriver:SwitchToWindow", {"handle": other[-1]})
    with open(args.out, "wb") as f:
        f.write(base64.b64decode(cmd(s, "WebDriver:TakeScreenshot", {"full": True, "hash": False})["value"]))
    try:
        cmd(s, "Marionette:Quit", {"flags": ["eForceQuit"]})
    except (RuntimeError, OSError):
        pass
finally:
    try:
        proc.wait(20)
    except subprocess.TimeoutExpired:
        proc.kill()
    time.sleep(1)
    shutil.rmtree(tmp, ignore_errors=True)
