// Headless test driver: starts Thunderbird with the test profile, maximizes it, takes one screenshot.
// Run through ../run.sh, never install it.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot');

const OUT = GLib.getenv('MAIL_TEST_OUT');
const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

export default class MailShot extends Extension {
    enable() {
        if (Main.layoutManager._startingUp)
            Main.layoutManager.connectObject('startup-complete', () => this._start(), this);
        else
            this._start();
    }

    disable() {
        Main.layoutManager.disconnectObject(this);
    }

    _start() {
        this._run().catch(e => console.log(`MAIL-TEST error: ${e}\n${e.stack}`)).finally(() => global.context.terminate());
    }

    async _run() {
        Main.overview.hide();
        Gio.Subprocess.new(['bash', '-c', GLib.getenv('MAIL_TEST_TB')], Gio.SubprocessFlags.NONE);
        let win = null;
        for (let i = 0; i < 120 && !win; i++) {
            await wait(250);
            win = global.get_window_actors().map(a => a.meta_window).find(w => w.get_wm_class()?.toLowerCase().includes('thunderbird'));
        }
        if (!win)
            throw new Error('no Thunderbird window');
        try {
            win.maximize(Meta.MaximizeFlags.BOTH);
        } catch {
            win.maximize();
        }
        await wait(Number(GLib.getenv('MAIL_TEST_WAIT') || 9000));
        await this._shot('');
        // MAIL_TEST_POINTER="x,y[,click|,rclick|,swipe:<dx>|,key:<keys>] ...": move the pointer there and click, swipe two
        // fingers sideways (20 steps of dx) or press keys (Clutter key names, "+" for a combination: Control_L+z);
        // one screenshot after each step, a swipe also one while the fingers are down
        const seat = global.backend?.get_default_seat?.() ?? global.stage.context.get_backend().get_default_seat();
        const dev = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const kbd = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        let n = 0;
        for (const step of (GLib.getenv('MAIL_TEST_POINTER') || '').split(' ').filter(Boolean)) {
            const [x, y, what = ''] = step.split(',');
            dev.notify_absolute_motion(GLib.get_monotonic_time(), Number(x), Number(y));
            await wait(150);
            dev.notify_absolute_motion(GLib.get_monotonic_time(), Number(x) + 1, Number(y));
            n++;
            if (what === 'click' || what === 'rclick') {
                const b = what === 'click' ? Clutter.BUTTON_PRIMARY : Clutter.BUTTON_SECONDARY;
                await wait(300);
                dev.notify_button(GLib.get_monotonic_time(), b, Clutter.ButtonState.PRESSED);
                dev.notify_button(GLib.get_monotonic_time(), b, Clutter.ButtonState.RELEASED);
            } else if (what.startsWith('key:')) {
                const keys = what.slice(4).split('+').map(k => Clutter[`KEY_${k}`]);
                for (const k of keys)
                    kbd.notify_keyval(GLib.get_monotonic_time(), k, Clutter.KeyState.PRESSED);
                for (const k of keys.reverse())
                    kbd.notify_keyval(GLib.get_monotonic_time(), k, Clutter.KeyState.RELEASED);
            } else if (what.startsWith('swipe:')) {
                await wait(300);
                for (let i = 0; i < 20; i++) {
                    dev.notify_scroll_continuous(GLib.get_monotonic_time(), Number(what.slice(6)), 0,
                        Clutter.ScrollSource.FINGER, Clutter.ScrollFinishFlags.NONE);
                    await wait(16);
                }
                await this._shot(`-${n}-fingers`);
                dev.notify_scroll_continuous(GLib.get_monotonic_time(), 0, 0, Clutter.ScrollSource.FINGER,
                    Clutter.ScrollFinishFlags.HORIZONTAL | Clutter.ScrollFinishFlags.VERTICAL);
            }
            await wait(1200);
            await this._shot(`-${n}`);
        }
    }

    async _shot(suffix) {
        const stream = Gio.File.new_for_path(`${OUT}${suffix}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
        await new Shell.Screenshot().screenshot(false, stream);
        stream.close(null);
        console.log(`MAIL-TEST shot ${OUT}${suffix}.png`);
    }
}
