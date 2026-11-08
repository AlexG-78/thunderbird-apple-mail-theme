// Thunderbird settings of the Mail look (tools/mail). install.sh lists them, asks, and writes them once;
// they stay the user's settings afterwards (Thunderbird's own settings change them).
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("mail.pane_config.dynamic", 2);
user_pref("mail.threadpane.listview", 0);
user_pref("mail.threadpane.cardsview.rowcount", 3);
user_pref("toolbar.unifiedtoolbar.buttonstyle", 2);
user_pref("mail.addressDisplayFormat", 2);
user_pref("mail.fixed_width_messages", false);
user_pref("mail.ui.display.dateformat.thisweek", 4);
// a double-clicked message opens in a new window, as in Mail
user_pref("mail.openMessageBehavior", 0);
// no progress window while sending, Mail has none; the status line shows it and errors still come as a dialog
user_pref("mailnews.show_send_progress", false);
