// Every mail tab gets the quick actions: the ones open now and the ones opened later.
const labels = Object.fromEntries(['read', 'unread', 'flag', 'unflag', 'archive', 'delete', 'reply', 'replyAll', 'forward', 'junk', 'zoomReset', 'format', 'newMessage']
    .map(k => [k, messenger.i18n.getMessage(k)]));
const attach = tab => tab.type === 'mail' && messenger.quickActions.attach(tab.id, labels).catch(console.error);
messenger.tabs.query({}).then(tabs => tabs.forEach(attach));
messenger.tabs.onCreated.addListener(attach);
messenger.tabs.onUpdated.addListener((id, info, tab) => info.status === 'complete' && attach(tab));

// the settings page's options, now and whenever they change
messenger.storage.local.get({threads: true, pictures: true, preview: true, backspaceDelete: true}).then(o => messenger.quickActions.setOptions(o));
messenger.storage.onChanged.addListener((changes, area) => area === 'local' && messenger.quickActions.setOptions(
    Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.newValue]))));
