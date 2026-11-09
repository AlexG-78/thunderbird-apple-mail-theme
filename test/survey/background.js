// Headless test only: the survey starts once the test inbox is on screen and the first screenshot is taken.
setTimeout(() => messenger.mbp115Survey.run().catch(e => console.log('MAIL-TEST survey error', e)), 12000);
