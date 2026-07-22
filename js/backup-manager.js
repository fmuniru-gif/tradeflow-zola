(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const BACKUP_HISTORY_LIMIT = 30;

  function getDatabase() {
    if (typeof DB !== 'undefined' && DB) return DB;
    return null;
  }

  function ensureBackupModel() {
    const database = getDatabase();
    if (!database) return null;

    if (!Array.isArray(database.backupHistory)) database.backupHistory = [];
    if (!database.backupSettings) {
      database.backupSettings = {
        autoBackupEnabled: false,
        schedule: 'manual',
        keepLocalBackups: BACKUP_HISTORY_LIMIT,
        cloudProvider: 'none',
        cloudConnected: false
      };
    }

    return database;
  }

  function timestamp() {
    const date = new Date();
    const padValue = (value) => String(value).padStart(2, '0');
    return date.getFullYear()
      + padValue(date.getMonth() + 1)
      + padValue(date.getDate())
      + '_'
      + padValue(date.getHours())
      + padValue(date.getMinutes())
      + padValue(date.getSeconds());
  }

  function createBackupFile(database) {
    // Keep the payload in the existing import/export format so a backup created
    // here can be restored through the application's current Import JSON screen.
    return new Blob([JSON.stringify(database, null, 2)], { type: 'application/json' });
  }

  function download(blob, fileName) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function addHistory(entry) {
    const database = ensureBackupModel();
    if (!database) return;

    database.backupHistory.unshift(entry);
    database.backupHistory = database.backupHistory.slice(0, BACKUP_HISTORY_LIMIT);
    saveDB();
  }

  function emit(name, data) {
    if (ZEZMS.events && typeof ZEZMS.events.emit === 'function') {
      ZEZMS.events.emit(name, data);
    }
  }

  function notify(message, type) {
    if (typeof toast === 'function') toast(message, type || 'ok');
    if (ZEZMS.log && typeof ZEZMS.log.info === 'function') ZEZMS.log.info(message);
  }

  function backupNow() {
    const database = ensureBackupModel();
    if (!database) {
      notify('Backup could not start because the local database is unavailable.', 'err');
      return false;
    }

    try {
      const blob = createBackupFile(database);
      const fileName = 'ZEZMS_Backup_' + timestamp() + '.json';
      download(blob, fileName);

      const entry = {
        id: 'BKP-' + timestamp(),
        createdAt: new Date().toISOString(),
        destination: 'browser-download',
        status: 'completed',
        fileName: fileName,
        size: blob.size,
        note: 'Manual local backup downloaded by the user.'
      };
      addHistory(entry);
      emit('backup:completed', entry);
      notify('Backup download created successfully.');
      return true;
    } catch (error) {
      console.error('Backup failed', error);
      emit('backup:failed', { message: error.message || String(error) });
      notify('Backup failed. Please try again.', 'err');
      return false;
    }
  }

  function saveSettings() {
    const database = ensureBackupModel();
    if (!database) return false;

    const enabled = document.getElementById('backupAutoEnabled');
    const schedule = document.getElementById('backupSchedule');
    const retention = document.getElementById('backupRetention');

    database.backupSettings.autoBackupEnabled = !!(enabled && enabled.checked);
    database.backupSettings.schedule = schedule ? schedule.value : 'manual';
    database.backupSettings.keepLocalBackups = Math.max(1, Math.min(BACKUP_HISTORY_LIMIT, Number(retention && retention.value) || BACKUP_HISTORY_LIMIT));
    saveDB();
    emit('backup:settings-saved', database.backupSettings);
    notify('Backup settings saved.');
    return true;
  }

  function historyRows(limit) {
    const database = ensureBackupModel();
    const items = database ? database.backupHistory.slice(0, limit || 5) : [];

    if (!items.length) {
      return '<tr><td colspan="4" class="empty">No backups created yet.</td></tr>';
    }

    return items.map((item) => {
      const when = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
      const bytes = Number(item.size) || 0;
      const size = bytes ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : '—';
      return '<tr><td>' + when + '</td><td>' + item.destination + '</td><td>' + item.status + '</td><td class="mono">' + size + '</td></tr>';
    }).join('');
  }

  function syncCardHtml() {
    const database = ensureBackupModel();
    const settings = database ? database.backupSettings : {};
    const last = database && database.backupHistory[0];
    const lastText = last ? new Date(last.createdAt).toLocaleString() : 'Never';
    const cloudText = settings && settings.cloudProvider !== 'none'
      ? 'Provider scaffold ready — not connected'
      : 'Not connected (cloud integration is a future milestone)';

    return '<div class="card">'
      + '<h3>Backup Manager</h3>'
      + '<p class="muted" style="font-size:13px">Create a safe local download now. Cloud and desktop adapters will use this same manager later.</p>'
      + '<div class="statline"><span>Last backup</span><b>' + lastText + '</b></div>'
      + '<div class="statline"><span>Cloud status</span><b>' + cloudText + '</b></div>'
      + '<button class="btn" onclick="backupNow()">☁ Backup Now</button>'
      + '<button class="btn ghost" style="margin-left:8px" onclick="nav(\'settings\')">Backup settings</button>'
      + '</div>';
  }

  function settingsHtml() {
    const database = ensureBackupModel();
    const settings = database ? database.backupSettings : {};
    const checked = settings && settings.autoBackupEnabled ? ' checked' : '';
    const schedule = settings && settings.schedule ? settings.schedule : 'manual';
    const retention = settings && settings.keepLocalBackups ? settings.keepLocalBackups : BACKUP_HISTORY_LIMIT;

    return '<div class="card" style="margin-top:12px">'
      + '<h3>Backup settings</h3>'
      + '<p class="muted" style="font-size:12px">Browser builds require a download for local backups. The settings below are saved now and will also support automatic backups when ZEZMS is packaged as a desktop app.</p>'
      + '<div class="field"><label><input id="backupAutoEnabled" type="checkbox"' + checked + '> Enable automatic backups</label></div>'
      + '<div class="grid g2">'
      + '<div class="field"><label>Schedule</label><select id="backupSchedule">'
      + '<option value="manual"' + (schedule === 'manual' ? ' selected' : '') + '>Manual only</option>'
      + '<option value="hourly"' + (schedule === 'hourly' ? ' selected' : '') + '>Hourly (desktop-ready)</option>'
      + '<option value="daily"' + (schedule === 'daily' ? ' selected' : '') + '>Daily (desktop-ready)</option>'
      + '</select></div>'
      + '<div class="field"><label>Keep history records (1–30)</label><input id="backupRetention" type="number" min="1" max="30" value="' + retention + '"></div>'
      + '</div>'
      + '<button class="btn" onclick="saveBackupSettings()">Save backup settings</button>'
      + '<button class="btn ghost" style="margin-left:8px" onclick="backupNow()">Backup Now</button>'
      + '<hr class="hr">'
      + '<h3>Recent backup history</h3>'
      + '<div class="table-wrap"><table><thead><tr><th>Created</th><th>Destination</th><th>Status</th><th class="right">Size</th></tr></thead><tbody>'
      + historyRows(10)
      + '</tbody></table></div>'
      + '<p class="muted" style="font-size:11px;margin-top:8px">Restore and cloud upload are intentionally not enabled in this first milestone. Existing Import JSON backup remains available under Sync.</p>'
      + '</div>';
  }

  ZEZMS.backup = {
    version: 1,
    adapters: {
      browserDownload: { supported: true, backup: backupNow },
      desktop: { supported: false, reason: 'Available when ZEZMS is packaged for desktop.' },
      cloud: { supported: false, reason: 'Cloud provider connection is a future milestone.' }
    },
    ensureModel: ensureBackupModel,
    backupNow: backupNow,
    saveSettings: saveSettings,
    syncCardHtml: syncCardHtml,
    settingsHtml: settingsHtml
  };

  window.backupNow = backupNow;
  window.saveBackupSettings = saveSettings;
}());
