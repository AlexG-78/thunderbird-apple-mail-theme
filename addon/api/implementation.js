/* Mail Quick Actions (mbp115 kit, tools/mail, MIT): Apple Mail's message list in Thunderbird's.
 * Hover: four buttons on the message under the pointer (read/unread, flag, archive, delete), one floating bar per
 * message list (about:3pane) moved to the row under the pointer.
 * Conversations: every folder shown is grouped by thread (collapsed, like Mail's conversations), unless switched off.
 * Pictures: each card gets the sender's picture from the address book, else a grey circle with the initials.
 * Conversation size: a collapsed thread shows its number of messages (Thunderbird writes "2 replies").
 * Preview: two lines of the message text under the subject. Thunderbird keeps a short text per message (the
 * "preview" its new-mail alerts show) once fetchMsgPreviewText has read the stored message (local or offline copy;
 * nothing is downloaded); the cards get one line more for it.
 * Dates as Mail writes them: the time today, "Yesterday", the weekday within a week, else the short date; a closed
 * conversation shows its newest message's date and the names of everyone in it ("A Klein & M Muster").
 * Backspace (and Ctrl+Backspace, which is ⌘⌫ under the kit's keyd) deletes the selected messages while the message
 * list has the focus, as in Mail and Thunderbird for Mac; never in a text field, the folder list or the message.
 * Pinch: a two-finger pinch on the message zooms it, smoothly, by the pinch's own scale (see pinchZoom).
 * Zoom level: a capsule in the message header shows it while it is not 100 %; a click goes back to 100 %.
 * Mailbox: in a folder of several folders (the unified Inbox) each card names its mailbox, like Mail's "Inbox - iCloud".
 * Toolbar: the window's toolbar gets the sidebar's width and the message pane's position as CSS variables, so the
 * Mail look draws the grey sidebar up to the top and puts the action buttons over the message, as Mail does.
 * Thunderbird recycles its rows while scrolling: the bar is not part of them, the picture is refreshed in fillRow. */
"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
var { ExtensionSupport } = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs");

const KEY = "mbp115QuickActions";

// Icons: the kit's line icons in every window. resource://mbp115mail/ points into the add-on and its user sheet
// (icons/icons.css) replaces Thunderbird's icon variables; only chrome and resource pictures may use Thunderbird's
// colours (context-stroke), so they cannot live in userChrome.css as files or data: pictures.
const ICON_SHEET = "resource://mbp115mail/icons/icons.css";
let iconsOn = false;
function icons(on, extension) {
  const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
  const res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
  const uri = Services.io.newURI(ICON_SHEET);
  if (on && !iconsOn) {
    res.setSubstitution("mbp115mail", extension.rootURI);
    sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
  } else if (!on && iconsOn) {
    if (sss.sheetRegistered(uri, sss.USER_SHEET))
      sss.unregisterSheet(uri, sss.USER_SHEET);
    res.setSubstitution("mbp115mail", null);
  }
  iconsOn = on;
}
const ACTIONS = ["read", "flag", "archive", "delete"];
// colours on hover as in Mail's swipe actions; the icons are Thunderbird's own, the flag (Mail's, not a star) the kit's
const flag = (colour, filled) => `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' \
fill='none' stroke='${colour}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M5 17V3.75'/>\
<path d='M5 4.25h9.5l-2.25 3.5 2.25 3.5H5z'${filled ? ` fill='${colour}'` : ""}/></svg>")`;
const CSS = `
#threadPane { position: relative; }
#${KEY} {
  position: absolute; z-index: 5; display: flex; gap: 2px; padding: 2px;
  border-radius: 9px; background: light-dark(rgba(255, 255, 255, .97), rgba(50, 50, 52, .97));
  box-shadow: 0 1px 4px rgba(0, 0, 0, .2), 0 0 0 .5px rgba(0, 0, 0, .1);
}
#${KEY}[hidden] { display: none; }
#${KEY} > button {
  appearance: none; border: none; margin: 0; padding: 0; min-width: 0; min-height: 0;
  inline-size: 26px; block-size: 22px; border-radius: 6px; cursor: default;
  background: transparent center / 16px no-repeat;
  -moz-context-properties: fill, stroke; fill: transparent; stroke: currentColor;
  color: light-dark(#6e6e73, #aeaeb2);
}
#${KEY} > button:hover { background-color: light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .1)); }
#${KEY} .${KEY}-read { background-image: var(--icon-mail); }
#${KEY} .${KEY}-read:is(:hover, .unread) { color: AccentColor; }
#${KEY} .${KEY}-flag { background-image: ${flag("%236e6e73")}; }
@media (prefers-color-scheme: dark) { #${KEY} .${KEY}-flag { background-image: ${flag("%23aeaeb2")}; } }
#${KEY} .${KEY}-flag:is(:hover, .flagged) { background-image: ${flag("%23ff3b30", true)}; }
#${KEY} .${KEY}-archive { background-image: var(--icon-archive); }
#${KEY} .${KEY}-archive:hover { color: #af52de; }
#${KEY} .${KEY}-delete { background-image: var(--icon-trash); }
#${KEY} .${KEY}-delete:hover { color: #ff3b30; }
:root[${KEY}-pictures] #threadTree .card-container { grid-template-columns: auto auto 1fr !important; }
.${KEY}-picture {
  align-self: center; inline-size: 32px; block-size: 32px; margin-inline-end: 10px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  font-size: 13px; font-weight: 600; color: #ffffff; letter-spacing: .02em;
  background: linear-gradient(light-dark(#b4b4b9, #8e8e93), light-dark(#8e8e93, #636366)) center / cover;
}
:root:not([${KEY}-pictures]) .${KEY}-picture { display: none; }
:root[${KEY}-preview] #threadTree:not(.cards-row-compact) .thread-card-dynamic-row {
  grid-template: "subject info" auto "preview button" 1fr / 1fr auto !important;
  align-items: start !important;
}
.${KEY}-preview {
  grid-area: preview; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
  white-space: normal; overflow-wrap: anywhere; line-height: 1.3; font-size: .95em; opacity: .6; font-weight: 400 !important;
  padding-inline-start: 3px;
}
:root:not([${KEY}-preview]) .${KEY}-preview, .${KEY}-preview:empty { display: none; }
.${KEY}-box { font-weight: 400 !important; }
.${KEY}-box {
  flex: 0 1 auto; max-inline-size: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-inline-end: 10px; font-size: .85rem; opacity: .6;
}
.${KEY}-box:empty { display: none; }
#threadTree .card-layout:hover .${KEY}-box { visibility: hidden; }
`;
// A message in its own window: Thunderbird's toolbar there has no reply, archive or delete buttons, so the add-on adds
// Mail's (after New Message), plus Thunderbird's own Move button. The window passes the commands to the message.
const WINDOW_ACTIONS = [["reply", "cmd_reply", "--icon-reply"], ["replyAll", "cmd_replyall", "--icon-reply-all"],
  ["forward", "cmd_forward", "--icon-forward"], ["archive", "cmd_archive", "--icon-archive"],
  ["delete", "cmd_delete", "--icon-trash"], ["junk", "cmd_markAsJunk", "--icon-spam"], "move",
  ["flag", "cmd_markAsFlagged", "--icon-star"]];
const MESSAGE_WINDOW = "mbp115QuickActions-messageWindow";
let windowLabels = null;
function messageWindowAdd(win) {
  const doc = win.document;
  const bar = doc.getElementById("mail-bar3");
  if (!bar || doc.querySelector(`[${KEY}-added]`))
    return;
  let before = doc.getElementById("button-newmsg")?.nextSibling ?? bar.firstChild;
  for (const a of WINDOW_ACTIONS) {
    let item;
    if (a === "move") {
      if (doc.getElementById("button-file"))
        continue;   // the user has it in the toolbar already
      item = bar.insertItem?.("button-file", before);
    } else {
      const [name, command, icon] = a;
      item = doc.createXULElement("toolbarbutton");
      item.id = `${KEY}-${name}`;
      item.className = "toolbarbutton-1";
      item.setAttribute("label", windowLabels?.[name] ?? name);
      item.setAttribute("tooltiptext", windowLabels?.[name] ?? name);
      item.style.listStyleImage = `var(${icon})`;
      item.addEventListener("command", () => win.goDoCommand(command));
      bar.insertBefore(item, before);
    }
    item?.setAttribute(`${KEY}-added`, "");
  }
  pinchZoom(win, true);
  zoomPill(doc.getElementById("messageBrowser"), windowLabels?.zoomReset);
  watchFlag(doc.getElementById("messageBrowser"), on => {
    // a data: picture is not drawn here; the add-on's own red flag is
    const flag = doc.getElementById(`${KEY}-flag`);
    flag?.style.setProperty("list-style-image", on ? 'url("resource://mbp115mail/icons/flag-red.svg")' : "var(--icon-star)");
  });
}
// the shown message's flag, from Thunderbird's own (hidden) star button in the message header: it is set on every
// message shown and on every change. browser: an about:message browser; set(on) on each change.
function watchFlag(browser, set, tries = 40) {
  const star = browser?.contentDocument?.getElementById("starMessageButton");
  if (!star) {
    if (tries > 0)
      browser?.ownerGlobal?.setTimeout(() => watchFlag(browser, set, tries - 1), 250);
    return null;
  }
  const update = () => set(star.getAttribute("aria-pressed") === "true" && !star.closest("[hidden]"));
  const observer = new browser.contentWindow.MutationObserver(update);
  observer.observe(star, { attributes: true, attributeFilter: ["aria-pressed"] });
  update();
  return observer;
}
function messageWindowRemove(win) {
  for (const el of win.document.querySelectorAll(`[${KEY}-added]`))
    el.remove();
  pinchZoom(win, false);
}

// Pinch to zoom the message. Gecko turns a touchpad pinch into Ctrl+wheel steps but marks them as handled by its async
// zoom, which finds nothing to zoom in Thunderbird's message pane (it is not in its own process), so nothing happened.
// A real Ctrl+wheel step zooms through DoZoomEnlarge/DoZoomReduce, one per DOMMouseScroll, posted while the wheel event
// is handled: a step without one is a pinch. Its DOMMouseScroll detail is the change of the pinch's scale (which counts
// from 1 at the gesture's start) x 100 in device pixels, so the message follows the fingers instead of jumping 10 % per
// step. Headless test (scratchpad pinchtest): pinch 1 -> 1.8 gave zoom 1.81, 1 -> 0.5 gave 0.52, Ctrl+wheel x3 still 1.3.
// The message's zoom level, which Thunderbird does not show anywhere (bug 512956): like Firefox's in its address bar, a
// capsule at the right of the header card's last row while the message is not at 100 % (pinch, Ctrl+wheel, ⌘+ ⌘-,
// the View menu); a click goes back to 100 %, as ⌘0 does. The zoom stays when the next message is shown.
const zoomPills = new Map();   // about:message window -> its remover
const ZOOM_CSS = `
#messageHeader { position: relative; }
#${KEY}-zoom {
  position: absolute; z-index: 2; inset-block-end: 8px; inset-inline-end: 12px;
  appearance: none; margin: 0; padding: 0 10px; min-width: 0; min-height: 0; block-size: 26px;
  border-radius: 13px; border: 1px solid light-dark(rgba(0, 0, 0, .12), rgba(255, 255, 255, .14));
  background: var(--mail-bg, light-dark(#ffffff, #2c2c2e)); color: light-dark(#6e6e73, #aeaeb2);
  font: inherit; font-size: .9em; font-variant-numeric: tabular-nums; cursor: default;
}
#${KEY}-zoom:hover { background: light-dark(#ececee, #3a3a3c); color: light-dark(#1d1d1f, #f5f5f7); }
#${KEY}-zoom[hidden] { display: none; }
`;
function zoomPill(browser, label, tries = 40) {
  const am = browser?.contentWindow;
  const doc = am?.document;
  const header = doc?.getElementById("messageHeader");
  const mp = doc?.getElementById("messagepane");
  if (!header || !mp || !am.top.ZoomManager) {
    if (tries > 0)
      browser?.ownerGlobal?.setTimeout(() => zoomPill(browser, label, tries - 1), 250);
    return;
  }
  if (zoomPills.has(am))
    return;
  const zm = am.top.ZoomManager;
  const style = doc.createElement("style");
  style.textContent = ZOOM_CSS;
  (doc.head ?? doc.documentElement).append(style);
  const pill = doc.createElement("button");
  pill.id = `${KEY}-zoom`;
  pill.title = label ?? "Actual Size";
  const percent = new Intl.NumberFormat(Services.locale.appLocaleAsBCP47, { style: "percent" });
  const update = () => {
    const z = zm.getZoomForBrowser(mp);
    pill.hidden = Math.round(z * 100) === 100;
    pill.textContent = percent.format(z);
  };
  pill.addEventListener("click", () => zm.reset(mp));
  header.append(pill);
  am.addEventListener("FullZoomChange", update, true);
  am.addEventListener("TextZoomChange", update, true);
  update();
  am.addEventListener("unload", () => zoomPills.delete(am), { once: true });
  zoomPills.set(am, () => {
    am.removeEventListener("FullZoomChange", update, true);
    am.removeEventListener("TextZoomChange", update, true);
    pill.remove();
    style.remove();
    zoomPills.delete(am);
  });
}

const pinchWindows = new Map();
function pinchZoom(win, on) {
  if (!on) {
    pinchWindows.get(win)?.();
    pinchWindows.delete(win);
    return;
  }
  if (pinchWindows.has(win))
    return;
  const steps = [];
  let gesture = null;   // { browser, start: zoom at the start, sum: of the details, last: time }
  const zoom = (browser, detail) => {
    const zm = win.ZoomManager;   // Thunderbird's, also for its "Zoom Text Only"
    if (!zm)
      return;
    const now = Date.now();
    if (gesture?.browser !== browser || now - gesture.last > 300)   // updates come every ~10 ms during a pinch
      gesture = { browser, start: zm.getZoomForBrowser(browser), sum: 0 };
    gesture.last = now;
    gesture.sum += detail;
    const z = gesture.start * (1 - gesture.sum / (100 * win.devicePixelRatio));
    zm.setZoomForBrowser(browser, Math.min(zm.MAX, Math.max(zm.MIN, z)));
  };
  const step = e => {
    if (!e.ctrlKey || e.axis !== e.VERTICAL_AXIS || !e.detail)
      return;
    // the message, or a frame in it (ownerGlobal is undefined on these nodes here)
    let bc = e.target.ownerDocument?.defaultView?.browsingContext;
    while (bc && bc.embedderElement?.id !== "messagepane")
      bc = bc.parent;
    const browser = bc?.embedderElement;
    if (!browser)
      return;
    const s = { browser, detail: e.detail, gecko: false };
    steps.push(s);
    // twice: the first runs before Gecko's zoom event (posted after this listener), the second after it
    Services.tm.dispatchToMainThread(() => Services.tm.dispatchToMainThread(() => {
      steps.splice(steps.indexOf(s), 1);
      if (!s.gecko)
        zoom(s.browser, s.detail);
    }));
  };
  const geckoZoom = () => {
    const s = steps.find(x => !x.gecko);
    if (s)
      s.gecko = true;
  };
  win.addEventListener("DOMMouseScroll", step, true);
  win.addEventListener("DoZoomEnlarge", geckoZoom, true);
  win.addEventListener("DoZoomReduce", geckoZoom, true);
  win.addEventListener("unload", () => pinchWindows.delete(win), { once: true });
  pinchWindows.set(win, () => {
    win.removeEventListener("DOMMouseScroll", step, true);
    win.removeEventListener("DoZoomEnlarge", geckoZoom, true);
    win.removeEventListener("DoZoomReduce", geckoZoom, true);
  });
}
function messageWindows(on) {
  if (on) {
    ExtensionSupport.registerWindowListener(MESSAGE_WINDOW, {
      chromeURLs: ["chrome://messenger/content/messageWindow.xhtml"],
      onLoadWindow: messageWindowAdd,
    });
  } else {
    ExtensionSupport.unregisterWindowListener(MESSAGE_WINDOW);
    for (const win of Services.wm.getEnumerator("mail:messageWindow"))
      messageWindowRemove(win);
  }
}

// the add-on's settings page: conversations and pictures on or off
const options = { threads: true, pictures: true, preview: true, backspaceDelete: true };
const windows = new Set();

// the sender's picture from the address book (cached; cardForEmailAddress has its own cache too)
const photos = new Map();
function photoOf(email) {
  if (!photos.has(email)) {
    if (photos.size > 1000)
      photos.clear();
    let url = null;
    try {
      url = MailServices.ab.cardForEmailAddress(email)?.photoURL || null;
    } catch {}
    photos.set(email, url);
  }
  return photos.get(email);
}
// "Anna Klein" -> "A Klein": several names fit into one line, as in Mail's conversations
function shortName(name) {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? `${words[0][0]} ${words.at(-1)}` : name;
}
function initials(name, email) {
  const words = (name || "").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length > 1)
    return (words[0][0] + words.at(-1)[0]).toUpperCase();
  return (words[0]?.[0] ?? email?.[0] ?? "?").toUpperCase();
}

function setup(w, labels) {
  const doc = w.document;
  const pane = doc.getElementById("threadPane");
  const tree = doc.getElementById("threadTree");
  const style = doc.createElement("style");
  style.textContent = CSS;
  doc.head.append(style);
  const bar = doc.createElement("div");
  bar.id = KEY;
  bar.hidden = true;
  const button = {};
  for (const a of ACTIONS) {
    button[a] = doc.createElement("button");
    button[a].className = `${KEY}-${a}`;
    button[a].dataset.action = a;
    button[a].tabIndex = -1;
    bar.append(button[a]);
  }
  pane.append(bar);
  doc.documentElement.setAttribute("mbp115-quick-actions", "");   // the Mail look's CSS then leaves the row buttons hidden

  // --- hover buttons
  let row = null;
  const hdrOf = r => {
    try {
      return r.isConnected && !r.dataset.properties?.includes("dummy") ? w.gDBView?.getMsgHdrAt(r.index) : null;
    } catch {
      return null;   // the row was just removed or the view changed
    }
  };
  const hide = () => {
    bar.hidden = true;
    row = null;
  };
  const show = r => {
    const hdr = hdrOf(r);
    if (!hdr) {
      hide();
      return;
    }
    row = r;
    button.read.title = hdr.isRead ? labels.unread : labels.read;
    button.read.classList.toggle("unread", !hdr.isRead);
    button.flag.title = hdr.isFlagged ? labels.unflag : labels.flag;
    button.flag.classList.toggle("flagged", hdr.isFlagged);
    button.archive.title = labels.archive;
    button.delete.title = labels.delete;
    bar.hidden = false;
    const p = pane.getBoundingClientRect(), b = r.getBoundingClientRect();
    bar.style.top = `${b.top - p.top + 3}px`;   // on the first line, over the date: the conversation button stays free
    bar.style.insetInlineEnd = `${p.right - b.right + 12}px`;
  };
  const over = e => {
    const r = e.target.closest?.("tr.card-layout, tr.table-layout");
    if (r) {
      if (r !== row || bar.hidden)
        show(r);
    } else {
      hide();
    }
  };
  const act = (a, r) => {
    const hdr = hdrOf(r);
    if (!hdr)
      return;
    if (a === "read")
      hdr.folder.markMessagesRead([hdr], !hdr.isRead);
    else if (a === "flag")
      hdr.folder.markMessagesFlagged([hdr], !hdr.isFlagged);
    else {   // Thunderbird's own commands work on the selection: trash or delete, archive settings, undo
      w.threadTree.selectedIndex = r.index;
      w.commandController.doCommand(a === "delete" ? "cmd_delete" : "cmd_archive");
    }
  };
  const click = e => {
    const a = e.target.closest("button")?.dataset.action;
    if (!a || !row)
      return;
    e.stopPropagation();
    const r = row;
    act(a, r);
    w.setTimeout(() => (a === "read" || a === "flag") && r.isConnected ? show(r) : hide(), 60);
  };
  const keepFocus = e => e.preventDefault();   // a click on the bar must not take the focus from the list

  // --- conversations: Thunderbird keeps the view per folder; a folder shown flat is switched to threads
  // (the sort order stays: Thunderbird's own "sort by thread" would sort oldest first)
  // The folder shown at start is opened before the add-on runs and its view loads later: wait for it (up to 15 s).
  let threadTimer = 0;
  const threads = (tries = 60) => {
    w.clearTimeout(threadTimer);
    threadTimer = w.setTimeout(() => {
      const v = w.gViewWrapper;
      if (!options.threads)
        return;
      if (!v?.dbView) {
        if (tries > 0)
          threads(tries - 1);
        return;
      }
      if (!v.showThreaded && !v.showGroupedBySort) {
        w.threadPane?.updateListRole?.(false);   // as Thunderbird's own switch to threads does
        v.showThreaded = true;
        w.commandController.doCommand("cmd_collapseAllThreads");   // conversations closed, as in Mail
      }
    }, 250);
  };
  const folderChanged = () => threads();

  // --- pictures: added to each card when Thunderbird fills it
  const Card = w.customElements.get("thread-card");
  const fillRow = Card.prototype.fillRow;
  Card.prototype.fillRow = function () {
    fillRow.call(this);
    try {
      picture(this);
      size(this);
      dateAndNames(this);
      mailbox(this);
      preview(this);
    } catch (e) {
      console.error(e);
    }
  };
  function picture(card) {
    const container = card.querySelector(".card-container");
    let pic = container.querySelector(`.${KEY}-picture`);
    if (!pic) {
      pic = doc.createElement("span");
      pic.className = `${KEY}-picture`;
      container.insertBefore(pic, container.querySelector(".read-status-column")?.nextSibling ?? null);
    }
    const hdr = !card.dataset.properties?.includes("dummy") && card.view?.getMsgHdrAt(card._index);
    if (!hdr) {
      pic.style.visibility = "hidden";
      return;
    }
    pic.style.visibility = "";
    // outgoing folders show the recipient, like the card's own name
    const outgoing = card.classList.contains("outgoing") || card.dataset.properties?.includes("outgoing");
    const header = outgoing ? hdr.mime2DecodedRecipients : hdr.mime2DecodedAuthor;
    const [who] = MailServices.headerParser.parseDecodedHeader(header || "");
    const email = who?.email?.toLowerCase() ?? "";
    const url = email && photoOf(email);
    pic.style.backgroundImage = url ? `url("${url.replace(/"/g, "%22")}")` : "";
    pic.textContent = url ? "" : initials(who?.name, email);
  }
  function size(card) {
    const twisty = card.querySelector("button.twisty");
    if (!twisty)
      return;
    let n = twisty.querySelector(`.${KEY}-count`);
    if (!n) {
      n = doc.createElement("span");
      n.className = `${KEY}-count`;
      twisty.append(n);
    }
    const replies = card.replies && doc.l10n.getAttributes(card.replies).args?.count;
    n.textContent = replies > 0 ? String(replies + 1) : "";
  }
  // a closed conversation also shows a flag or a paperclip when one of its messages has it (the Mail look draws them)
  function dateAndNames(card) {
    card.removeAttribute(`${KEY}-flagged`);
    card.removeAttribute(`${KEY}-attach`);
    const hdr = !card.dataset.properties?.includes("dummy") && card.view?.getMsgHdrAt(card._index);
    if (!hdr)
      return;
    const closed = card.classList.contains("children") && card.classList.contains("collapsed");
    const thread = closed ? card.view.getThreadContainingIndex(card._index) : null;
    card.dateLine.textContent = mailDate(thread?.newestMsgDate ? thread.newestMsgDate * 1000 : hdr.date / 1000);
    if (!thread || thread.numChildren < 2)
      return;
    const names = new Map();
    for (let k = 0; k < thread.numChildren; k++) {
      const h = thread.getChildHdrAt(k);
      if (h?.isFlagged)
        card.setAttribute(`${KEY}-flagged`, "");
      if (h && h.flags & Ci.nsMsgMessageFlags.Attachment)
        card.setAttribute(`${KEY}-attach`, "");
      const [who] = MailServices.headerParser.parseDecodedHeader(h?.mime2DecodedAuthor || "");
      const name = who?.name || who?.email;
      if (name)
        names.set((who.email || name).toLowerCase(), shortName(name));
    }
    const list = [...names.values()];
    if (list.length > 1)
      card.senderLine.textContent = `${list.slice(0, -1).join(", ")} & ${list.at(-1)}`;
  }
  function mailDate(ms) {
    const locale = w.Services.locale.appLocaleAsBCP47;
    const d = new Date(ms), now = new Date();
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((day(now) - day(d)) / 864e5);
    if (days <= 0)
      return d.toLocaleTimeString(locale, { timeStyle: "short" });
    if (days === 1) {
      const s = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day");
      return s[0].toLocaleUpperCase(locale) + s.slice(1);
    }
    if (days < 7)
      return d.toLocaleDateString(locale, { weekday: "long" });
    return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "2-digit" });
  }
  // --- preview: read for the rows on screen, in batches per folder
  const asked = new Set();
  let pending = new Map(), previewTimer = 0;
  function preview(card) {
    const row = card.querySelector(".thread-card-dynamic-row");
    if (!row)
      return;
    let p = row.querySelector(`.${KEY}-preview`);
    if (!p) {
      p = doc.createElement("span");
      p.className = `${KEY}-preview`;
      row.append(p);
    }
    const hdr = options.preview && !card.dataset.properties?.includes("dummy") && card.view?.getMsgHdrAt(card._index);
    const text = hdr ? hdr.getStringProperty("preview") : "";
    p.textContent = text;
    if (hdr && !text)
      request(hdr);
  }
  function request(hdr) {
    const id = `${hdr.folder.URI}#${hdr.messageKey}`;
    if (asked.has(id))
      return;   // asked once: an online-only IMAP message has no stored text
    if (asked.size > 5000)
      asked.clear();
    asked.add(id);
    if (!pending.has(hdr.folder))
      pending.set(hdr.folder, []);
    pending.get(hdr.folder).push(hdr.messageKey);
    w.clearTimeout(previewTimer);
    previewTimer = w.setTimeout(() => {
      const batch = pending;
      pending = new Map();
      const done = () => w.threadTree?.invalidate?.();
      for (const [folder, keys] of batch) {
        try {
          if (!folder.fetchMsgPreviewText(keys, { OnStartRunningUrl() {}, OnStopRunningUrl: done }))
            done();
        } catch (e) {
          console.error(e);
        }
      }
    }, 150);
  }
  // the cards get one line more for the preview: Thunderbird sizes them in threadPane.densityChange
  const densityChange = w.threadPane.densityChange;
  w.threadPane.densityChange = async function (...args) {
    await densityChange.apply(this, args);
    if (options.preview && this.rowCount > 2)
      Card.ROW_HEIGHT += Math.round(Card.ROW_HEIGHT / 4);
  };
  const resizeCards = () => w.threadPane.updateThreadItemSize?.();

  function mailbox(card) {
    const row = card.querySelector(".thread-card-row");
    let box = row?.querySelector(`.${KEY}-box`);
    if (!row)
      return;
    if (!box) {
      box = doc.createElement("span");
      box.className = `${KEY}-box`;
      row.insertBefore(box, row.querySelector(".date"));
    }
    const v = w.gViewWrapper;
    const hdr = (v?.isMultiFolder || v?.isVirtual) && !card.dataset.properties?.includes("dummy")
      && card.view?.getMsgHdrAt(card._index);
    box.textContent = hdr ? `${hdr.folder.localizedName} – ${hdr.folder.server.prettyName}` : "";
  }

  // --- toolbar: where the sidebar ends and the message pane starts, in the main window
  const top = w.browsingContext.topChromeWindow;
  const frame = w.browsingContext.embedderElement;
  // the Mail look applies both only while this mail tab is in front ([mbp115QuickActions-mail] on the main window).
  // Measured only while the mail toolbar is shown: in another tab its buttons have no size, and measuring then made
  // the shift grow on every call until the buttons and the ≡ menu left the window.
  const tabmail = top.document.getElementById("tabmail");
  const place = () => {
    const root = top.document.documentElement;
    const info = tabmail?.currentTabInfo;
    if (info?.mode?.name !== "mail3PaneTab") {
      root.removeAttribute(`${KEY}-mail`);
      return;
    }
    if ((info.chromeBrowser ?? frame) !== frame)
      return;   // another mail tab in front: it places itself
    root.setAttribute(`${KEY}-mail`, "");
    const f = frame?.getBoundingClientRect();
    const folder = doc.getElementById("folderPane")?.getBoundingClientRect();
    const message = doc.getElementById("messagePane")?.getBoundingClientRect();
    // each space (mail, address book, calendar) gets its own toolbar with the same id: take the one on screen
    const content = [...top.document.querySelectorAll("#unifiedToolbarContent")].find(c => c.clientWidth > 0);
    const first = content?.querySelector(":scope > li:not(.spacer, [hidden])");   // a spacer can lead after a tab switch
    const r = first?.getBoundingClientRect();
    if (!f?.width || !frame.isConnected || !message?.width || !r?.width || !content)
      return;   // not laid out yet: keep the last values
    root.style.setProperty(`--${KEY}-sidebar-end`, `${folder?.width ? Math.round(f.left + folder.right) : 0}px`);
    const start = r.left - (parseFloat(top.getComputedStyle(first).marginInlineStart) || 0);
    let shift = Math.min(Math.max(0, Math.round(f.left + message.left + 8 - start)), content.clientWidth);
    root.style.setProperty(`--${KEY}-toolbar-shift`, `${shift}px`);
    const over = content.scrollWidth - content.clientWidth;   // never push the search field and ≡ out of the window
    if (over > 0) {
      shift = Math.max(0, shift - over);
      root.style.setProperty(`--${KEY}-toolbar-shift`, `${shift}px`);
    }
  };
  // the toolbar's flag (main window) follows the message shown in this tab
  let flagged = false;
  const showFlag = () => {
    const info = tabmail?.currentTabInfo;
    if (info?.mode?.name === "mail3PaneTab" && (info.chromeBrowser ?? frame) === frame)
      top.document.documentElement.toggleAttribute(`${KEY}-flagged`, flagged && !w.messageBrowser?.hidden);
  };
  let flagObserver = null;
  w.setTimeout(() => {
    flagObserver = watchFlag(w.messageBrowser, on => {
      flagged = on;
      showFlag();
    });
    zoomPill(w.messageBrowser, labels.zoomReset);
  }, 0);
  const placeSoon = () => {
    showFlag();
    w.setTimeout(place, 60);
    w.setTimeout(place, 400);
  };
  const resize = new w.ResizeObserver(() => place());
  for (const id of ["folderPane", "threadPane", "messagePane"]) {
    const el = doc.getElementById(id);
    if (el)
      resize.observe(el);
  }
  top.addEventListener("resize", place);
  top.addEventListener("TabSelect", placeSoon);   // with the panes' size changes below, which also follow a tab switch

  const showPictures = () => {
    doc.documentElement.toggleAttribute(`${KEY}-pictures`, options.pictures);
    doc.documentElement.toggleAttribute(`${KEY}-preview`, options.preview);
    w.threadTree?.invalidate?.();
  };
  showPictures();
  resizeCards();
  threads();
  w.setTimeout(place, 500);

  // ⌫ deletes like Delete (Trash, undo with Ctrl+Z); ⇧⌫ is left alone: Shift+Delete deletes for good
  const backspace = e => {
    if (!options.backspaceDelete || e.key !== "Backspace" || e.shiftKey || e.altKey || e.metaKey || e.defaultPrevented
        || e.target.closest?.("input, textarea, [contenteditable]") || e.target.isContentEditable)
      return;
    if (!w.gDBView?.numSelected)
      return;
    e.preventDefault();
    w.commandController.doCommand("cmd_delete");
  };
  tree.addEventListener("keydown", backspace);
  tree.addEventListener("mouseover", over);
  pane.addEventListener("mouseleave", hide);
  tree.addEventListener("scroll", hide, true);
  bar.addEventListener("mousedown", keepFocus);
  bar.addEventListener("click", click);
  w.addEventListener("folderURIChanged", folderChanged);
  return {
    update() {
      showPictures();
      resizeCards();
      threads();
    },
    remove() {
      tree.removeEventListener("keydown", backspace);
      tree.removeEventListener("mouseover", over);
      pane.removeEventListener("mouseleave", hide);
      tree.removeEventListener("scroll", hide, true);
      w.removeEventListener("folderURIChanged", folderChanged);
      w.clearTimeout(threadTimer);
      resize.disconnect();
      top.removeEventListener("resize", place);
      top.removeEventListener("TabSelect", placeSoon);
      flagObserver?.disconnect();
      zoomPills.get(w.messageBrowser?.contentWindow)?.();
      top.document.documentElement.removeAttribute(`${KEY}-flagged`);
      top.document.documentElement.removeAttribute(`${KEY}-mail`);
      for (const v of ["sidebar-end", "toolbar-shift"])
        top.document.documentElement.style.removeProperty(`--${KEY}-${v}`);
      Card.prototype.fillRow = fillRow;
      w.threadPane.densityChange = densityChange;
      w.clearTimeout(previewTimer);
      for (const el of doc.querySelectorAll(`.${KEY}-picture, .${KEY}-count, .${KEY}-box, .${KEY}-preview`))
        el.remove();
      for (const el of doc.querySelectorAll(`[${KEY}-flagged], [${KEY}-attach]`)) {
        el.removeAttribute(`${KEY}-flagged`);
        el.removeAttribute(`${KEY}-attach`);
      }
      bar.remove();
      style.remove();
      doc.documentElement.removeAttribute("mbp115-quick-actions");
      doc.documentElement.removeAttribute(`${KEY}-pictures`);
      doc.documentElement.removeAttribute(`${KEY}-preview`);
      resizeCards();
      delete w[KEY];
    },
  };
}

var quickActions = class extends ExtensionCommon.ExtensionAPI {
  onShutdown(isAppShutdown) {
    if (isAppShutdown)
      return;
    for (const w of windows)
      w[KEY]?.remove();
    windows.clear();
    for (const win of [...pinchWindows.keys()])
      pinchZoom(win, false);
    for (const remove of [...zoomPills.values()])
      remove();
    icons(false);
    if (windowLabels)
      messageWindows(false);
  }

  getAPI(context) {
    try {
      icons(true, context.extension);
    } catch (e) {
      console.error(e);
    }
    return {
      quickActions: {
        setOptions(o) {
          Object.assign(options, o);
          photos.clear();
          for (const w of windows)
            w[KEY]?.update();
        },
        async attach(tabId, labels) {
          if (!windowLabels) {
            windowLabels = labels;
            try {
              messageWindows(true);
            } catch (e) {
              console.error(e);
            }
          }
          const w = context.extension.tabManager.get(tabId)?.nativeTab?.chromeBrowser?.contentWindow;
          if (!w || w.location.href !== "about:3pane")
            return;
          if (w.document.readyState !== "complete")
            await new Promise(r => w.addEventListener("load", r, { once: true }));
          pinchZoom(w.browsingContext.topChromeWindow, true);
          if (w[KEY] || !w.document.getElementById("threadTree"))
            return;
          w[KEY] = setup(w, labels);
          windows.add(w);
          w.addEventListener("unload", () => windows.delete(w), { once: true });
        },
      },
    };
  }
};
