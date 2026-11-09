/* Headless test only (tools/mail/test/survey.sh, never installed): opens Thunderbird's windows, popups and views the
 * way a user reaches them, then every other window document, measures each against the Mail look and asks the test
 * shell for a picture. Writes <dir>/results.jsonl, one line per thing opened; <dir>/<name>.png. */
"use strict";
var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
var { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const DIR = Services.env.get("MAIL_TEST_SURVEY");
const ONLY = Services.env.get("MAIL_TEST_ONLY");   // a regular expression: only these window documents, no user paths
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => dump(`MAIL-TEST survey ${a.join(" ")}\n`);
const px = v => parseFloat(v) || 0;
const seen = new Set();

function* elements(root, depth = 0) {
  for (const e of root.querySelectorAll("*")) {
    yield e;
    if (e.shadowRoot) yield* elements(e.shadowRoot, depth);
    if (depth < 3 && /^(iframe|browser|editor)$/.test(e.localName)) {
      let d = null;
      try { d = e.contentDocument; } catch {}
      if (d?.documentElement) yield* elements(d, depth + 1);
    }
  }
}
const describe = e => `${e.localName}${e.id ? "#" + e.id : ""}${e.classList?.length ? "." + [...e.classList].slice(0, 2).join(".") : ""}`;

/* what the Mail look means, measured: capsule buttons and selects, rounded fields and lists, accent default button */
function audit(doc, scope) {
  const win = doc.defaultView, counts = {}, bad = [], vals = {};
  if (!win) return { note: "closed itself" };
  const note = (key, v) => { (vals[key] ??= {})[v] = (vals[key][v] ?? 0) + 1; };
  const probe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
  probe.style.color = "AccentColor";
  doc.documentElement.append(probe);
  const accent = win.getComputedStyle(probe).color;
  probe.remove();
  const fail = (kind, e, why) => bad.length < 40 && bad.push(`${kind}: ${describe(e)} ${why}`);
  for (const e of elements(scope ?? doc)) {
    if (!e.getBoundingClientRect) continue;
    const w = e.ownerDocument.defaultView, name = e.localName;
    const isControl = /^(button|menulist|select|input|textarea|richlistbox|listbox|tree|tab|groupbox|fieldset|panel|menupopup)$/.test(name);
    if (!isControl) continue;
    const cs = w.getComputedStyle(e);
    if (name === "panel" || name === "menupopup") {
      counts.popup = (counts.popup ?? 0) + 1;
      if (px(cs.getPropertyValue("--panel-border-radius")) < 10) fail("popup", e, `radius ${cs.getPropertyValue("--panel-border-radius") || "unset"}`);
      continue;
    }
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || cs.visibility !== "visible" || cs.display === "none") continue;
    const radius = px(cs.borderTopLeftRadius), borderless = px(cs.borderTopWidth) === 0 || cs.borderTopColor === "rgba(0, 0, 0, 0)";
    if (name === "button") {
      if (/titlebar|close-button|close-icon|scrollbutton|tree-|spinner|mbp115|icon-button|button-flat|plain-button|plain\b|handlerHeaderButton/.test(e.className) || e.closest?.("#unifiedToolbar, .titlebar-buttonbox")) continue;
      if (r.width < 28 && !e.textContent.trim()) continue;   // an icon
      counts.button = (counts.button ?? 0) + 1;
      note("buttonHeight", Math.round(r.height));
      note("buttonBg", cs.backgroundColor);
      if (radius < 10 && radius < r.height / 2 - 1) fail("button", e, `radius ${radius} height ${Math.round(r.height)}`);
      if ((e.hasAttribute("default") || e.classList.contains("primary")) && !e.disabled && !e.hasAttribute("disabled") && cs.backgroundColor !== accent) fail("default", e, `bg ${cs.backgroundColor}`);
      if (e.closest(".dialog-button-box") && (r.bottom > w.innerHeight + 1 || r.right > w.innerWidth + 1)) fail("clipped", e, `at ${Math.round(r.right)},${Math.round(r.bottom)} of ${w.innerWidth}x${w.innerHeight}`);
    } else if (name === "menulist" || name === "select") {
      counts.select = (counts.select ?? 0) + 1;
      if (radius < 6) fail("select", e, `radius ${radius}`);
    } else if (name === "input" || name === "textarea") {
      if (name === "input" && !/^(text|search|email|url|tel|password|number|)$/.test(e.type ?? "")) continue;
      if (e.closest("menulist, tree, .tree-input")) continue;
      counts.field = (counts.field ?? 0) + 1;
      if (radius < 5 && !borderless) fail("field", e, `radius ${radius}`);
    } else if (name === "tab") {
      if (e.closest("#tabmail-tabs, tabmail-tabs")) continue;
      counts.tab = (counts.tab ?? 0) + 1;
      if (radius < 5) fail("tab", e, `radius ${radius}`);
    } else {
      counts.box = (counts.box ?? 0) + 1;
      if (radius < 6 && !borderless) fail("box", e, `radius ${radius}`);
    }
  }
  const root = win.getComputedStyle(doc.documentElement);
  return { counts, bad, vals, bg: root.backgroundColor, font: `${root.fontFamily} ${root.fontSize}` };
}

async function picture(name) {
  await IOUtils.writeUTF8(`${DIR}/request.tmp`, name);
  await IOUtils.move(`${DIR}/request.tmp`, `${DIR}/request`);
  for (let i = 0; i < 100 && await IOUtils.exists(`${DIR}/request`); i++) await sleep(50);
}
async function record(name, kind, doc, extra = {}, scope) {
  const res = { name, kind, ...extra };
  try {
    if (doc) Object.assign(res, audit(doc, scope), { title: doc.title, url: doc.location?.href });
  } catch (e) { res.error = `audit: ${e}`; }
  await picture(name);
  await IOUtils.writeUTF8(`${DIR}/results.jsonl`, JSON.stringify(res) + "\n", { mode: "appendOrCreate" });
  log(name, res.error ?? "ok", (res.bad ?? []).length);
}
function failed(name, kind, e) {
  log(name, "FAILED", e);
  return IOUtils.writeUTF8(`${DIR}/results.jsonl`, JSON.stringify({ name, kind, error: String(e) }) + "\n", { mode: "appendOrCreate" });
}

/* runs action, returns the window it opened */
async function newWindow(action, ms = 6000) {
  const before = new Set(Services.wm.getEnumerator(null));
  await action();
  for (let t = 0; t < ms; t += 100) {
    for (const x of Services.wm.getEnumerator(null))
      if (!before.has(x) && x.document.readyState === "complete") { await sleep(900); return x; }
    await sleep(100);
  }
  return null;
}
async function windowStep(name, kind, action, after) {
  try {
    const win = await newWindow(action);
    if (!win) return failed(name, kind, "no window");
    await after?.(win);
    await record(name, kind, win.document);
    if (!win.closed) win.close();
    await sleep(200);
  } catch (e) { await failed(name, kind, e); }
}
async function popupStep(name, doc, popup, open) {
  try {
    if (!popup) return failed(name, "popup", "not found");
    let shown = false;
    popup.addEventListener("popupshown", () => (shown = true), { once: true });
    await (open ? open() : popup.openPopupAtScreen(420, 260, false));
    for (let t = 0; t < 1500 && !shown; t += 50) await sleep(50);
    await sleep(350);
    await record(name, "popup", doc, { shown }, popup);
    popup.hidePopup?.();
    await sleep(250);
  } catch (e) { await failed(name, "popup", e); }
}
/* a dialog inside a page (settings, contacts) */
async function subDialog(name, doc, open) {
  try {
    await open();
    await sleep(1300);
    const frames = doc.querySelectorAll(".dialogFrame");
    const frame = frames[frames.length - 1];
    await record(name, "dialog", frame?.contentDocument ?? doc, frame ? {} : { error: "no dialog" });
    frame?.contentWindow?.close();
    await sleep(350);
  } catch (e) { await failed(name, "dialog", e); }
}
async function tabStep(name, tabmail, open, after) {
  try {
    const tab = await open();
    let doc = null;
    for (let t = 0; t < 8000; t += 100) {
      doc = (tab?.browser ?? tabmail.currentTabInfo?.browser)?.contentDocument ?? null;
      if (doc?.readyState === "complete" && !doc.location.href.startsWith("about:blank")) break;
      await sleep(100);
    }
    await sleep(1200);
    await after?.(doc, tab);
    await record(name, "view", doc ?? tabmail.ownerDocument);
    tabmail.closeTab(tab ?? tabmail.currentTabInfo);
    await sleep(300);
  } catch (e) { await failed(name, "view", e); }
}

/* --- the paths a user takes */
async function userPaths(w) {
  const d = w.document, tabmail = d.getElementById("tabmail");
  const a3 = tabmail.currentAbout3Pane, am = a3.messageBrowser.contentWindow;
  await record("mail", "view", d);
  await record("mail-3pane", "view", a3.document);
  await record("mail-message", "view", am.document);

  // every context menu and panel that stands on its own
  for (const [label, doc] of [["main", d], ["pane", a3.document], ["msg", am.document]])
    for (const p of doc.querySelectorAll("menupopup[id], panel[id]"))
      if (p.parentElement.localName !== "menu" && !/appMenu|PopupAutoComplete|PopupGloda|DateTimePicker|notification-popup|customizeToolbarSheet/.test(p.id))
        await popupStep(`popup-${label}-${p.id}`, doc, p);

  // ≡ menu with its sub pages
  const pm = d.getElementById("appMenu-popup");
  await popupStep("appmenu", d, pm, () => w.PanelUI.show());
  for (const b of [...d.querySelectorAll("#appMenu-mainView toolbarbutton.subviewbutton-nav")]) {
    await popupStep(`appmenu-${b.id}`, d, pm, async () => {
      await w.PanelUI.show();
      await sleep(350);
      b.click();
      await sleep(500);
    });
  }

  // the message header
  const header = am.document;
  const contact = am.editContactInlineUI?.panel;
  await popupStep("edit-contact", header, contact, async () => {
    const b = header.querySelector(".recipient-address-book-button");
    b?.click();
    await sleep(900);
    if (contact?.state !== "open") { b?.click(); await sleep(700); }
  });
  await popupStep("header-customize", header, header.getElementById("messageHeaderCustomizationPanel"));
  await popupStep("header-security", header, header.getElementById("messageSecurityPanel"));

  // new message and what it opens
  const comp = await newWindow(() => w.MsgNewMessage(null), 9000);
  if (comp) {
    await sleep(1800);
    await record("compose", "window", comp.document);
    const cd = comp.document;
    for (const p of cd.querySelectorAll("menupopup[id], panel[id]"))
      if (p.parentElement.localName !== "menu" && !/PopupAutoComplete|DateTimePicker|customizeToolbarSheet/.test(p.id))
        await popupStep(`popup-compose-${p.id}`, cd, p);
    for (const e of ["LinkProps", "ImageProps", "HLineProps", "InsertTable", "TableProps", "NamedAnchorProps", "InsSrc", "InsertChars", "ListProps", "Replace", "SpellCheck", "Dictionary", "ColorProps", "ColorPicker", "AdvancedEdit", "InsertTOC", "InsertMath", "ConvertToTable"])
      await windowStep(`compose-${e}`, "user", () => comp.openDialog(`chrome://messenger/content/messengercompose/Ed${e}.xhtml`, "_blank", "chrome,close,titlebar,resizable=yes,dependent"));
    try {
      const k = cd.getElementById("keyAssistant");
      k?.showModal?.();
      await sleep(400);
      await record("compose-keys", "popup", cd, {}, k);
      k?.close?.();
    } catch (e) { await failed("compose-keys", "popup", e); }
    comp.close();
    await sleep(500);
  } else await failed("compose", "window", "no window");

  // message in its own window
  await windowStep("message-window", "user", () => w.goDoCommand("cmd_openMessage"));

  // calendar
  await tabStep("calendar", tabmail, async () => { w.switchToCalendarTab?.() ?? tabmail.openTab("calendar", {}); await sleep(900); return tabmail.currentTabInfo; }, null).catch(() => {});
  await windowStep("calendar-new-event", "user", () => w.createEventWithDialog(null, null, null, null, null, false));
  await windowStep("calendar-new-task", "user", () => w.createTodoWithDialog(null, null, null, null, null));
  await windowStep("calendar-new-calendar", "user", () => w.goDoCommand("calendar_new_calendar_command"));
  await tabStep("tasks", tabmail, async () => { w.switchToTaskTab?.() ?? tabmail.openTab("tasks", {}); await sleep(900); return tabmail.currentTabInfo; }, null).catch(() => {});
  const alarmArg = { wrappedJSObject: { window_onLoad() {} } };
  await windowStep("calendar-reminder", "user", () => w.openDialog("chrome://calendar/content/calendar-alarm-dialog.xhtml", "_blank", "chrome,dialog=yes,resizable,centerscreen", alarmArg), async dlg => {
    const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
    const { CalAlarm } = ChromeUtils.importESModule("resource:///modules/CalAlarm.sys.mjs");
    const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
    const item = new CalEvent();
    item.title = "Bin collection";
    item.startDate = cal.dtz.now();
    item.endDate = cal.dtz.now();
    item.calendar = cal.manager.getCalendars()[0];
    const alarm = new CalAlarm();
    alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
    alarm.offset = cal.createDuration("-PT15M");
    item.addAlarm(alarm);
    dlg.addWidgetFor(item, alarm);
    await sleep(500);
  });

  // contacts
  await tabStep("contacts", tabmail, async () => { w.toAddressBook(); await sleep(1200); return tabmail.currentTabInfo; }, async doc => {
    const ab = doc.defaultView;
    await record("contacts-list", "view", doc);
    ab.createContact();
    await sleep(900);
    await record("contacts-new", "view", doc);
    const edit = doc.getElementById("cancelEditButton");
    edit?.click();
    await sleep(300);
    await subDialog("contacts-new-book", doc, () => ab.createBook());
    await subDialog("contacts-new-list", doc, () => ab.createList());
  });

  // settings and its sub dialogs
  await tabStep("settings", tabmail, async () => { w.openPreferencesTab("paneGeneral"); await sleep(1500); return tabmail.currentTabInfo; }, async doc => {
    const pw = doc.defaultView;
    for (const p of ["paneCompose", "panePrivacy", "paneChat", "paneCalendar", "paneGeneral"]) {
      pw.gotoPref(p);
      await sleep(700);
      await record(`settings-${p}`, "view", doc);
    }
    for (const u of ["fonts", "connection", "notifications", "offline", "receipts", "permissions", "cookies", "passwordManager", "applicationManager", "attachmentReminder", "messengerLanguages"])
      await subDialog(`settings-dialog-${u}`, doc, () => pw.gSubDialog.open(`chrome://messenger/content/preferences/${u}.xhtml`));
  });
  await tabStep("accounts", tabmail, async () => { w.MsgAccountManager(null); await sleep(1800); return tabmail.currentTabInfo; }, async doc => {
    const tree = doc.getElementById("accounttree");
    for (let i = 0; i < Math.min(tree?.rowCount ?? 0, 12); i++) {
      tree.selectedIndex = i;
      await sleep(700);
      await record(`accounts-${i}`, "view", doc);
    }
  });
  for (const [n, url] of [["addons", "about:addons"], ["downloads", "about:downloads"], ["import", "about:import"], ["support", "about:support"], ["profiles", "about:profiles"], ["rights", "about:rights"], ["certificate", "about:certificate"]])
    await tabStep(`tab-${n}`, tabmail, async () => { w.openContentTab(url); await sleep(1000); return tabmail.currentTabInfo; });

  // questions
  for (const [n, f] of [["alert", win => Services.prompt.alert(win, "Connection", "The server could not be reached.")],
    ["confirm", win => Services.prompt.confirm(win, "Delete", "Delete this message for ever?")],
    ["prompt", win => Services.prompt.prompt(win, "Name", "Name of the folder", { value: "New" }, null, {})]])
    await windowStep(`question-${n}`, "user", () => { setTimeout(() => f(w), 0); }, null);

  // tools
  await windowStep("filters", "user", () => w.MsgFilters());
  await windowStep("activity", "user", () => w.openActivityMgr());
  await windowStep("about", "user", () => w.openAboutDialog());
}

/* --- every other window document */
const SKIP = /devtools|messengercompose\/Ed|about3Pane|aboutMessage|messenger\.xhtml|\/am-|multimessageview|win\.xhtml|dummy|backgroundPageThumbs|player\.xhtml|calendar-item-iframe|extensionPopup|glodaFacet|browserRequest|msgAccountCentral|alerts\/alert|newmailalert|aboutDialog|\/about[A-Z]|about-support|profileSelection|createProfileWizard|shutdownWindow|migrationProgress|resetProfileProgress|calendar-alarm-dialog/;
async function everyWindow(w) {
  const list = JSON.parse(await IOUtils.readUTF8(`${DIR}/windows.json`));
  for (const url of list.filter(u => (ONLY ? new RegExp(ONLY).test(u) : !SKIP.test(u)))) {
    const name = url.replace(/^chrome:\/\/|\/content|\.xhtml$/g, "").replace(/[^A-Za-z0-9-]+/g, "_");
    await windowStep(`win-${name}`, "window", () => w.openDialog(url, "_blank", "chrome,resizable,centerscreen,dialog=no"));
  }
}

this.mbp115Survey = class extends ExtensionCommon.ExtensionAPI {
  getAPI() {
    return { mbp115Survey: { async run() {
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      log("start", DIR);
      try {
        if (!ONLY) await userPaths(w);
      } catch (e) { log("user paths stopped", e, e.stack); }
      try {
        await everyWindow(w);
      } catch (e) { log("window list stopped", e); }
      await IOUtils.writeUTF8(`${DIR}/done`, "1");
      log("done");
    } } };
  }
};
