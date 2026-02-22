/* -*- mode: js; js-indent-level: 4 -*- */
const { Gio, GLib, St, GObject } = imports.gi;
const Main = imports.ui.main;
const QuickSettings = imports.ui.quickSettings;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.extendtodroid';
const KEY_SERIALS = 'allowed-serials';
const KEY_PORT = 'tcp-port';

let _settings, _refreshButton, _dialog, _timeoutId;

/* ---------- Utilidades ---------- */
function _runAsync (cmd) {
    try { GLib.spawn_command_line_async (cmd); }
    catch (e) { log (`Error ejecutando "${cmd}": ${e}`); }
}

/* ---------- Lógica principal ---------- */
function _checkAndApply () {
    // 1. Obtener lista de dispositivos ADB
    let [ok, out] = GLib.spawn_command_line_sync ('adb devices -l');
    if (!ok) return;

    let output = out.toString ();
    let connected = [];
    for (let line of output.split('\n')) {
        let m = line.match (/^([A-F0-9]+)\s+device/);
        if (m) connected.push (m[1]);
    }

    // 2. Actualizar UI (checkboxes) si está abierto
    if (_dialog) _dialog._updateDeviceList (connected);

    // 3. Ver si alguno está permitido
    let allowed = _settings.get_strv (KEY_SERIALS);
    let match = connected.find (s => allowed.includes (s));
    if (!match) return;          // ninguno permitido

    // 4. Ejecutar adb reverse
    let port = _settings.get_int (KEY_PORT);
    _runAsync (`adb reverse tcp:${port} tcp:${port}`);

    // 5. Asegurar modo RDP extend
    let [rc, cur] = GLib.spawn_command_line_sync (
        'gsettings get org.gnome.desktop.remote-desktop.rdp screen-share-mode'
    );
    if (rc && cur.toString ().trim () !== `'extend'`) {
        _runAsync ('gsettings set org.gnome.desktop.remote-desktop.rdp screen-share-mode extend');
    }
}

/* ---------- Diálogo de configuración ---------- */
var ConfigDialog = GObject.registerClass(
class ConfigDialog extends St.BoxLayout {
    _init () {
        super._init ({ vertical: true, style_class: 'extendtodroid-dialog', spacing: 6 });

        /* Puerto */
        this._portEntry = new St.Entry ({
            text: _settings.get_int (KEY_PORT).toString (),
            style_class: 'extendtodroid-port-entry',
            hint_text: 'Puerto TCP',
        });
        this._portEntry.clutter_text.connect ('changed', () => {
            let val = parseInt (this._portEntry.text, 10);
            if (!isNaN (val) && val > 0) _settings.set_int (KEY_PORT, val);
        });
        this.add_child (new St.Label ({ text: 'Puerto TCP:' }));
        this.add_child (this._portEntry);

        /* Lista de dispositivos */
        this._listBox = new St.BoxLayout ({ vertical: true, style_class: 'extendtodroid-device-list' });
        this.add_child (new St.Label ({ text: 'Dispositivos conectados:' }));
        this.add_child (this._listBox);

        /* Botón Refresh now (lista + acción) */
        this._refreshBtn = new St.Button ({
            label: 'Refresh now',
            style_class: 'extendtodroid-refresh-button',
            reactive: true,
            can_focus: true,
        });
        this._refreshBtn.connect ('clicked', () => {
            _checkAndApply ();                 // ejecuta reverse y RDP
            this._populateDeviceList ();       // refresca la lista visual
        });
        this.add_child (this._refreshBtn);
    }

    /* Construye la lista de checkboxes a partir de los seriales conectados */
    _populateDeviceList () {
        this._listBox.destroy_all_children ();

        let [ok, out] = GLib.spawn_command_line_sync ('adb devices -l');
        if (!ok) return;

        let output = out.toString ();
        let devices = [];
        for (let line of output.split('\n')) {
            let m = line.match (/^([A-F0-9]+)\s+device/);
            if (m) devices.push (m[1]);
        }

        let allowed = _settings.get_strv (KEY_SERIALS);
        devices.forEach (serial => {
            let chk = new St.CheckBox ({ checked: allowed.includes (serial) });
            chk.connect ('toggled', () => {
                let cur = _settings.get_strv (KEY_SERIALS);
                if (chk.checked) {
                    if (!cur.includes (serial)) cur.push (serial);
                } else {
                    cur = cur.filter (s => s !== serial);
                }
                _settings.set_strv (KEY_SERIALS, cur);
            });
            let row = new St.BoxLayout ({ vertical: false, style_class: 'extendtodroid-device-row' });
            row.add_child (chk);
            row.add_child (new St.Label ({ text: serial }));
            this._listBox.add_child (row);
        });
    }

    /* Llamado desde la extensión para actualizar la UI sin cerrar el diálogo */
    _updateDeviceList (connectedSerials) {
        // Mantener sincronía entre UI y GSettings
        let allowed = _settings.get_strv (KEY_SERIALS);
        this._listBox.destroy_all_children ();

        connectedSerials.forEach (serial => {
            let chk = new St.CheckBox ({ checked: allowed.includes (serial) });
            chk.connect ('toggled', () => {
                let cur = _settings.get_strv (KEY_SERIALS);
                if (chk.checked) {
                    if (!cur.includes (serial)) cur.push (serial);
                } else {
                    cur = cur.filter (s => s !== serial);
                }
                _settings.set_strv (KEY_SERIALS, cur);
            });
            let row = new St.BoxLayout ({ vertical: false });
            row.add_child (chk);
            row.add_child (new St.Label ({ text: serial }));
            this._listBox.add_child (row);
        });
    }
});

/* ---------- Toggle en Quick Settings ---------- */
var ADBReverseToggle = GObject.registerClass(
class ADBReverseToggle extends QuickSettings.SystemIndicator {
    _init () {
        super._init ();

        this._toggle = new QuickSettings.QuickToggle ({
            title: 'ADB Reverse',
            subtitle: '',
            iconName: 'network-wired-symbolic',
            toggleMode: false,
        });
        this._toggle.connect ('clicked', () => this._showConfig ());
        this.add_child (this._toggle);
    }

    _showConfig () {
        if (_dialog) {
            Main.layoutManager.removeChrome (_dialog);
            _dialog.destroy ();
            _dialog = null;
            return;
        }

        _dialog = new ConfigDialog ();
        _dialog._populateDeviceList ();
        Main.layoutManager.addChrome (_dialog);
        _dialog.set_position (Main.layoutManager.primaryMonitor.x + 20,
                               Main.layoutManager.primaryMonitor.y + 80);
    }
});

/* ---------- Lifecycle ---------- */
function init () {
    const GioSSS = Gio.SettingsSchemaSource;
    let schemaSource = GioSSS.get_default ();
    let schemaObj = schemaSource.lookup (SETTINGS_SCHEMA, true);
    _settings = new Gio.Settings ({ settings_schema: schemaObj });
}

function enable () {
    _toggle = new ADBReverseToggle ();
    Main.panel.statusArea.quickSettings.addItem (_toggle);
    // Chequeo periódico (5 s) por si el usuario no pulsa Refresh
    _timeoutId = GLib.timeout_add_seconds (GLib.PRIORITY_DEFAULT, 5, () => {
        _checkAndApply ();
        return GLib.SOURCE_CONTINUE;
    });
}

function disable () {
    if (_toggle) {
        Main.panel.statusArea.quickSettings.removeItem (_toggle);
        _toggle.destroy ();
        _toggle = null;
    }
    if (_timeoutId) {
        GLib.source_remove (_timeoutId);
        _timeoutId = null;
    }
    if (_dialog) {
        Main.layoutManager.removeChrome (_dialog);
        _dialog.destroy ();
        _dialog = null;
    }
}
