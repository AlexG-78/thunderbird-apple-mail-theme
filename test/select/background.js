// Headless test only: open the test account's inbox and select its newest message.
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(what, f) {   // the account's folders and the mail tab are ready a moment after startup
    for (let i = 0; ; i++) {
        try {
            const r = await f();
            if (r !== undefined)
                return r;
        } catch (e) {
            if (i >= 30)
                throw new Error(`${what}: ${e}`);
        }
        await sleep(500);
    }
}
// every compose window of the test: a recipient, a subject and two made-up attachments
messenger.tabs.onCreated.addListener(async tab => {
    if (tab.type !== 'messageCompose')
        return;
    await messenger.compose.setComposeDetails(tab.id, {to: ['anna@example.org'], subject: 'Photos from the trip'});
    for (const [name, size] of [['Itinerary.pdf', 240000], ['Packing list.txt', 900]])
        await messenger.compose.addAttachment(tab.id, {file: new File(['x'.repeat(size)], name)});
});
// made-up contacts in the personal address book (once per profile)
const PEOPLE = [["Anna", "Klein", "anna@example.org", "+49 30 1234567", "Example Ltd."], ["Jonas", "Weber", "jonas@example.net", "+49 170 7654321", ""],
    ["Lena", "Hoffmann", "lena@example.org", "", ""], ["Mia", "Schulz", "mia@example.org", "+49 89 555123", ""],
    ["Paul", "Becker", "paul@example.net", "", "Bike Shop"], ["Sophie", "Wagner", "sophie@example.org", "+49 40 998877", ""],
    ["Max", "Fischer", "max@example.net", "", ""]];
(async () => {
    const book = (await messenger.addressBooks.list()).find(b => !b.readOnly && !b.remote);
    if (book && !(await messenger.contacts.list(book.id)).length)
        for (const [first, last, mail, tel, org] of PEOPLE)
            await messenger.contacts.create(book.id, {FirstName: first, LastName: last, DisplayName: `${first} ${last}`,
                PrimaryEmail: mail, CellularNumber: tel, Company: org});
})().catch(e => console.log('MAIL-TEST contacts error', e));
(async () => {
    const inbox = await retry('inbox', async () => (await messenger.accounts.list(true))
        .flatMap(a => a.rootFolder?.subFolders ?? a.folders ?? []).find(f => f.type === 'inbox'));
    // the unified Inbox, as the Mail look's sidebar shows it (Thunderbird 128+), else the account's
    const shown = (await messenger.folders.getUnifiedFolder?.('inbox').catch(() => null)) ?? inbox;
    const tab = await retry('tab', async () => (await messenger.mailTabs.query({active: true, currentWindow: true}))[0]);
    const show = folder => retry('show', async () => {
        await messenger.mailTabs.update(tab.id, {displayedFolder: folder});
        return true;
    });
    await show(inbox);   // Thunderbird reads the test mbox when its folder is shown
    const msgs = (await retry('list', () => messenger.messages.list(inbox.id))).messages.sort((a, b) => b.date - a.date);
    await show(shown);
    await retry('select', async () => {
        await messenger.mailTabs.setSelectedMessages(tab.id, [msgs[0].id]);
        return true;
    });
    console.log('MAIL-TEST selected', msgs.length, 'messages, showing', shown.id);
})().catch(e => console.log('MAIL-TEST error', e));
