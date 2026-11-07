// Settings page: conversations and pictures on or off, saved in storage.local (background.js passes them on).
const DEFAULTS = {threads: true, pictures: true, preview: true, backspaceDelete: true};
for (const el of document.querySelectorAll('[data-i18n]'))
    el.textContent = messenger.i18n.getMessage(el.dataset.i18n);
messenger.storage.local.get(DEFAULTS).then(o => {
    for (const [k, v] of Object.entries(o)) {
        const box = document.getElementById(k);
        box.checked = v;
        box.addEventListener('change', () => messenger.storage.local.set({[k]: box.checked}));
    }
});
