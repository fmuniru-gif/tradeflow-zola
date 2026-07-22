(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const VERSION = '2.0.0';
  const BACKUP_HISTORY_LIMIT = 30;
  const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const GIS_URL = 'https://accounts.google.com/gsi/client';
  const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  let googleTokenClient = null;
  let googleAccessToken = '';
  let googleTokenExpiresAt = 0;
  let gisLoadPromise = null;
  let cloudFilesCache = [];

  function getDatabase() {
    return (typeof DB !== 'undefined' && DB) ? DB : null;
  }

  function defaultSettings() {
    const configuredId = window.ZEZMS_CONFIG
      && ZEZMS_CONFIG.cloud
      && ZEZMS_CONFIG.cloud.googleDrive
      && ZEZMS_CONFIG.cloud.googleDrive.clientId;

    return {
      autoBackupEnabled: false,
      schedule: 'manual',
      keepLocalBackups: BACKUP_HISTORY_LIMIT,
      cloudProvider: 'google-drive',
      cloudConnected: false,
      googleClientId: configuredId || '',
      lastCloudBackupAt: '',
      lastRestoreAt: ''
    };
  }

  function ensureBackupModel() {
    const database = getDatabase();
    if (!database) return null;

    if (!Array.isArray(database.backupHistory)) database.backupHistory = [];
    database.backupSettings = Object.assign(defaultSettings(), database.backupSettings || {});
    database.backupSettings.cloudConnected = !!googleAccessToken;
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

  function createBackupBlob(database) {
    return new Blob([JSON.stringify(database, null, 2)], { type: 'application/json' });
  }

  function downloadBlob(blob, fileName) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function notify(message, type) {
    if (typeof toast === 'function') toast(message, type || 'ok');
    if (ZEZMS.log && typeof ZEZMS.log.info === 'function') ZEZMS.log.info(message);
  }

  function emit(name, data) {
    if (ZEZMS.events && typeof ZEZMS.events.emit === 'function') {
      ZEZMS.events.emit(name, data);
    }
  }

  function saveDatabase() {
    if (typeof saveDB !== 'function') {
      throw new Error('The database save service is unavailable.');
    }
    saveDB();
  }

  function makeEntry(type, destination, status, details) {
    return Object.assign({
      id: type.toUpperCase() + '-' + timestamp() + '-' + Math.random().toString(36).slice(2, 7),
      type: type,
      createdAt: new Date().toISOString(),
      destination: destination,
      status: status
    }, details || {});
  }

  function addHistory(entry) {
    const database = ensureBackupModel();
    if (!database) return;

    const retention = Math.max(
      1,
      Math.min(BACKUP_HISTORY_LIMIT, Number(database.backupSettings.keepLocalBackups) || BACKUP_HISTORY_LIMIT)
    );
    database.backupHistory.unshift(entry);
    database.backupHistory = database.backupHistory.slice(0, retention);
    saveDatabase();
  }

  function backupNow(options) {
    const database = ensureBackupModel();
    if (!database) {
      notify('Backup could not start because the local database is unavailable.', 'err');
      return false;
    }

    try {
      const blob = createBackupBlob(database);
      const fileName = (options && options.fileName) || ('ZEZMS_Backup_' + timestamp() + '.tradeflow.json');
      downloadBlob(blob, fileName);

      if (!(options && options.skipHistory)) {
        const entry = makeEntry('backup', 'browser-download', 'completed', {
          fileName: fileName,
          size: blob.size,
          note: (options && options.note) || 'Manual local backup downloaded by the user.'
        });
        addHistory(entry);
        emit('backup:completed', entry);
      }

      if (!(options && options.silent)) notify('Local backup downloaded successfully.');
      return true;
    } catch (error) {
      console.error('Backup failed', error);
      emit('backup:failed', { message: error.message || String(error) });
      notify('Backup failed: ' + (error.message || error), 'err');
      return false;
    }
  }

  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The selected file is not a valid ZEZMS backup.');
    }

    const requiredArrays = ['products', 'stockRows', 'sales'];
    const missing = requiredArrays.filter(function (key) { return !Array.isArray(data[key]); });
    if (missing.length) {
      throw new Error('The backup is missing required records: ' + missing.join(', ') + '.');
    }

    if (data.backupHistory != null && !Array.isArray(data.backupHistory)) {
      throw new Error('The backup history structure is invalid.');
    }

    if (data.backupSettings != null && typeof data.backupSettings !== 'object') {
      throw new Error('The backup settings structure is invalid.');
    }

    return true;
  }

  function createSafetyBackup(reason) {
    const database = ensureBackupModel();
    if (!database) throw new Error('The current database is unavailable.');

    const blob = createBackupBlob(database);
    const fileName = 'ZEZMS_PreRestore_Safety_' + timestamp() + '.tradeflow.json';
    downloadBlob(blob, fileName);

    const entry = makeEntry('backup', 'pre-restore-safety', 'completed', {
      fileName: fileName,
      size: blob.size,
      note: 'Safety backup created before ' + (reason || 'restore') + '.'
    });
    addHistory(entry);
    return entry;
  }

  function normalizeRestoredDatabase(data, localSettings) {
    if (typeof defaultDB !== 'function') {
      throw new Error('The database initialization service is unavailable.');
    }

    const restored = Object.assign(defaultDB(), data);
    const arrayKeys = [
      'products', 'stockRows', 'sales', 'saleLines', 'debtors', 'creditors',
      'depositors', 'debtorsMonthly', 'creditorsMonthly', 'depositorsMonthly',
      'accountTxns', 'cashLog', 'expenses', 'kpiHistory', 'receipts',
      'undoLog', 'backupHistory'
    ];
    arrayKeys.forEach(function (key) {
      if (!Array.isArray(restored[key])) restored[key] = [];
    });

    restored.backupSettings = Object.assign(
      defaultSettings(),
      data.backupSettings || {},
      {
        // OAuth configuration belongs to this deployed app/device.
        googleClientId: (localSettings && localSettings.googleClientId) || (data.backupSettings && data.backupSettings.googleClientId) || '',
        cloudConnected: false,
        lastRestoreAt: new Date().toISOString()
      }
    );

    return restored;
  }

  function applyRestoreData(data, source, fileName, safetyEntry) {
    validateBackup(data);

    const current = ensureBackupModel();
    const localSettings = current ? Object.assign({}, current.backupSettings) : defaultSettings();

    DB = normalizeRestoredDatabase(data, localSettings);

    const entry = makeEntry('restore', source, 'completed', {
      fileName: fileName || 'Cloud backup',
      size: 0,
      note: 'Database restored. Safety file: ' + ((safetyEntry && safetyEntry.fileName) || 'created before restore') + '.'
    });
    DB.backupHistory.unshift(entry);
    DB.backupHistory = DB.backupHistory.slice(
      0,
      Math.max(1, Math.min(BACKUP_HISTORY_LIMIT, Number(DB.backupSettings.keepLocalBackups) || BACKUP_HISTORY_LIMIT))
    );

    saveDatabase();
    emit('backup:restored', entry);
    notify('Restore completed. Reloading ZEZMS…');

    setTimeout(function () {
      location.reload();
    }, 900);
    return true;
  }

  function restoreFromLocal() {
    const input = document.getElementById('restoreBackupFile');
    const file = input && input.files && input.files[0];

    if (!file) {
      notify('Choose a ZEZMS JSON backup first.', 'err');
      return false;
    }

    if (!confirm(
      'Restore this backup and replace ALL current data on this device?\n\n'
      + 'ZEZMS will first download a safety backup of the current data.'
    )) {
      return false;
    }

    let safetyEntry;
    try {
      safetyEntry = createSafetyBackup('local restore');
    } catch (error) {
      notify('Restore stopped because the safety backup could not be created: ' + (error.message || error), 'err');
      return false;
    }

    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        applyRestoreData(data, 'local-file', file.name, safetyEntry);
      } catch (error) {
        console.error('Restore failed', error);
        addHistory(makeEntry('restore', 'local-file', 'failed', {
          fileName: file.name,
          note: error.message || String(error)
        }));
        notify('Restore failed: ' + (error.message || error), 'err');
      }
    };
    reader.onerror = function () {
      notify('The selected backup file could not be read.', 'err');
    };
    reader.readAsText(file);
    return true;
  }

  function getGoogleClientId() {
    const database = ensureBackupModel();
    const field = document.getElementById('googleDriveClientId');
    const fieldValue = field && field.value ? field.value.trim() : '';
    return fieldValue || (database && database.backupSettings.googleClientId) || '';
  }

  function loadGoogleIdentityServices() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisLoadPromise) return gisLoadPromise;

    gisLoadPromise = new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-zezms-gis="true"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', function () {
          reject(new Error('Google sign-in library failed to load.'));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = GIS_URL;
      script.async = true;
      script.defer = true;
      script.dataset.zezmsGis = 'true';
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('Google sign-in library failed to load. Check your internet connection.'));
      };
      document.head.appendChild(script);
    });

    return gisLoadPromise;
  }

  async function requestGoogleToken(promptMode) {
    if (!navigator.onLine) {
      throw new Error('Internet connection is required for Google Drive.');
    }

    const clientId = getGoogleClientId();
    if (!clientId) {
      throw new Error('Enter and save a Google OAuth Client ID in Backup settings first.');
    }

    await loadGoogleIdentityServices();

    return new Promise(function (resolve, reject) {
      try {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_SCOPE,
          callback: function (response) {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }

            googleAccessToken = response.access_token;
            googleTokenExpiresAt = Date.now() + ((Number(response.expires_in) || 3500) * 1000);

            const database = ensureBackupModel();
            database.backupSettings.cloudConnected = true;
            database.backupSettings.cloudProvider = 'google-drive';
            saveDatabase();
            resolve(googleAccessToken);
          },
          error_callback: function (error) {
            reject(new Error((error && error.message) || 'Google authorization was cancelled.'));
          }
        });

        googleTokenClient.requestAccessToken({ prompt: promptMode || '' });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function getValidGoogleToken(interactive) {
    if (googleAccessToken && Date.now() < googleTokenExpiresAt - 60000) {
      return googleAccessToken;
    }
    return requestGoogleToken(interactive ? 'select_account' : '');
  }

  async function connectGoogleDrive() {
    try {
      await getValidGoogleToken(true);
      notify('Google Drive connected for this browser session.');
      if (typeof render === 'function') render();
      setTimeout(function () { refreshCloudBackups(); }, 50);
      return true;
    } catch (error) {
      console.error('Google Drive connection failed', error);
      notify('Google Drive connection failed: ' + (error.message || error), 'err');
      return false;
    }
  }

  async function driveFetch(url, options) {
    const token = await getValidGoogleToken(false);
    const requestOptions = Object.assign({}, options || {});
    requestOptions.headers = Object.assign({}, requestOptions.headers || {}, {
      Authorization: 'Bearer ' + token
    });

    const response = await fetch(url, requestOptions);
    if (response.status === 401) {
      googleAccessToken = '';
      googleTokenExpiresAt = 0;
    }

    if (!response.ok) {
      let message = response.status + ' ' + response.statusText;
      try {
        const payload = await response.json();
        if (payload.error && payload.error.message) message = payload.error.message;
      } catch (_) {}
      throw new Error(message);
    }
    return response;
  }

  function createMultipartBody(metadata, blob) {
    const boundary = '-------zezms_' + Math.random().toString(36).slice(2);
    const body = new Blob([
      '--' + boundary + '\r\n',
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n--' + boundary + '\r\n',
      'Content-Type: application/json\r\n\r\n',
      blob,
      '\r\n--' + boundary + '--'
    ], { type: 'multipart/related; boundary=' + boundary });

    return { boundary: boundary, body: body };
  }

  async function uploadCloudBackup() {
    const database = ensureBackupModel();
    if (!database) {
      notify('The local database is unavailable.', 'err');
      return false;
    }

    try {
      const blob = createBackupBlob(database);
      const fileName = 'ZEZMS_Cloud_Backup_' + timestamp() + '.tradeflow.json';
      const multipart = createMultipartBody({
        name: fileName,
        parents: ['appDataFolder'],
        description: 'ZEZMS Cloud Backup & Restore M2',
        appProperties: {
          application: 'ZEZMS',
          backupFormat: 'tradeflow-json',
          milestone: 'M2'
        }
      }, blob);

      const response = await driveFetch(DRIVE_UPLOAD_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/related; boundary=' + multipart.boundary
        },
        body: multipart.body
      });
      const uploaded = await response.json();

      database.backupSettings.lastCloudBackupAt = new Date().toISOString();
      const entry = makeEntry('backup', 'google-drive', 'completed', {
        fileName: fileName,
        size: blob.size,
        cloudFileId: uploaded.id,
        note: 'Uploaded to the private Google Drive application-data folder.'
      });
      addHistory(entry);
      emit('backup:cloud-uploaded', entry);
      notify('Backup uploaded to Google Drive successfully.');
      await refreshCloudBackups();
      return true;
    } catch (error) {
      console.error('Cloud upload failed', error);
      addHistory(makeEntry('backup', 'google-drive', 'failed', {
        note: error.message || String(error)
      }));
      notify('Cloud upload failed: ' + (error.message || error), 'err');
      return false;
    }
  }

  async function listCloudBackups() {
    const query = encodeURIComponent('trashed = false');
    const fields = encodeURIComponent('files(id,name,size,createdTime,modifiedTime,description,appProperties)');
    const response = await driveFetch(
      DRIVE_FILES_URL
      + '?spaces=appDataFolder&q=' + query
      + '&orderBy=createdTime desc&pageSize=30&fields=' + fields
    );
    const result = await response.json();
    const files = Array.isArray(result.files) ? result.files : [];

    return files.filter(function (file) {
      return String(file.name || '').indexOf('ZEZMS_Cloud_Backup_') === 0;
    });
  }

  async function downloadCloudBackupAt(index) {
    const file = cloudFilesCache[Number(index)];
    if (!file) {
      notify('The selected cloud backup is unavailable. Refresh the list.', 'err');
      return false;
    }

    try {
      const response = await driveFetch(DRIVE_FILES_URL + '/' + encodeURIComponent(file.id) + '?alt=media');
      const blob = await response.blob();
      downloadBlob(blob, file.name);
      addHistory(makeEntry('backup', 'google-drive-download', 'completed', {
        fileName: file.name,
        size: blob.size,
        cloudFileId: file.id,
        note: 'Downloaded from Google Drive without changing local data.'
      }));
      notify('Cloud backup downloaded.');
      return true;
    } catch (error) {
      console.error('Cloud download failed', error);
      notify('Cloud download failed: ' + (error.message || error), 'err');
      return false;
    }
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (!value) return '—';
    return Math.max(1, Math.round(value / 1024)) + ' KB';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  async function refreshCloudBackups() {
    const body = document.getElementById('cloudBackupRows');
    if (!body) return false;

    body.innerHTML = '<tr><td colspan="4" class="empty">Loading Google Drive backups…</td></tr>';

    try {
      cloudFilesCache = await listCloudBackups();

      if (!cloudFilesCache.length) {
        body.innerHTML = '<tr><td colspan="4" class="empty">No Google Drive backups found.</td></tr>';
        return true;
      }

      body.innerHTML = cloudFilesCache.map(function (file, index) {
        const when = file.createdTime ? new Date(file.createdTime).toLocaleString() : '';
        return '<tr>'
          + '<td>' + escapeHtml(when) + '</td>'
          + '<td>' + escapeHtml(file.name) + '</td>'
          + '<td class="mono">' + escapeHtml(formatBytes(file.size)) + '</td>'
          + '<td><div class="row">'
          + '<button class="btn sm ghost" onclick="downloadCloudBackupAt(' + index + ')">Download</button>'
          + '<button class="btn sm warn" onclick="restoreCloudBackupAt(' + index + ')">Restore</button>'
          + '</div></td>'
          + '</tr>';
      }).join('');
      return true;
    } catch (error) {
      console.error('Cloud list failed', error);
      body.innerHTML = '<tr><td colspan="4" class="empty">Could not load cloud backups: '
        + escapeHtml(error.message || error) + '</td></tr>';
      return false;
    }
  }

  async function restoreCloudBackupAt(index) {
    const file = cloudFilesCache[Number(index)];
    if (!file) {
      notify('The selected cloud backup is unavailable. Refresh the list.', 'err');
      return false;
    }

    if (!confirm(
      'Restore "' + file.name + '" from Google Drive and replace ALL current data?\n\n'
      + 'ZEZMS will first download a safety backup of the current data.'
    )) {
      return false;
    }

    let safetyEntry;
    try {
      safetyEntry = createSafetyBackup('Google Drive restore');
    } catch (error) {
      notify('Restore stopped because the safety backup could not be created: ' + (error.message || error), 'err');
      return false;
    }

    try {
      const response = await driveFetch(DRIVE_FILES_URL + '/' + encodeURIComponent(file.id) + '?alt=media');
      const data = await response.json();
      applyRestoreData(data, 'google-drive', file.name, safetyEntry);
      return true;
    } catch (error) {
      console.error('Cloud restore failed', error);
      addHistory(makeEntry('restore', 'google-drive', 'failed', {
        fileName: file.name,
        cloudFileId: file.id,
        note: error.message || String(error)
      }));
      notify('Cloud restore failed: ' + (error.message || error), 'err');
      return false;
    }
  }

  function disconnectGoogleDrive() {
    if (googleAccessToken && window.google && google.accounts && google.accounts.oauth2) {
      try {
        google.accounts.oauth2.revoke(googleAccessToken, function () {});
      } catch (_) {}
    }

    googleAccessToken = '';
    googleTokenExpiresAt = 0;
    cloudFilesCache = [];

    const database = ensureBackupModel();
    if (database) {
      database.backupSettings.cloudConnected = false;
      saveDatabase();
    }

    notify('Google Drive disconnected.');
    if (typeof render === 'function') render();
  }

  function saveSettings() {
    const database = ensureBackupModel();
    if (!database) return false;

    const enabled = document.getElementById('backupAutoEnabled');
    const schedule = document.getElementById('backupSchedule');
    const retention = document.getElementById('backupRetention');
    const clientId = document.getElementById('googleDriveClientId');

    database.backupSettings.autoBackupEnabled = !!(enabled && enabled.checked);
    database.backupSettings.schedule = schedule ? schedule.value : 'manual';
    database.backupSettings.keepLocalBackups = Math.max(
      1,
      Math.min(BACKUP_HISTORY_LIMIT, Number(retention && retention.value) || BACKUP_HISTORY_LIMIT)
    );
    database.backupSettings.googleClientId = clientId
      ? clientId.value.trim()
      : database.backupSettings.googleClientId;
    database.backupSettings.cloudProvider = 'google-drive';
    database.backupSettings.cloudConnected = !!googleAccessToken;

    saveDatabase();
    emit('backup:settings-saved', database.backupSettings);
    notify('Backup settings saved.');
    if (typeof render === 'function') render();
    return true;
  }

  function historyRows(limit) {
    const database = ensureBackupModel();
    const items = database ? database.backupHistory.slice(0, limit || 5) : [];

    if (!items.length) {
      return '<tr><td colspan="5" class="empty">No backup or restore activity yet.</td></tr>';
    }

    return items.map(function (item) {
      const when = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
      const inferredType = item.type || (item.destination === 'browser-download' ? 'backup' : 'activity');
      return '<tr>'
        + '<td>' + escapeHtml(when) + '</td>'
        + '<td>' + escapeHtml(inferredType) + '</td>'
        + '<td>' + escapeHtml(item.destination || '—') + '</td>'
        + '<td>' + escapeHtml(item.status || '—') + '</td>'
        + '<td class="mono">' + escapeHtml(formatBytes(item.size)) + '</td>'
        + '</tr>';
    }).join('');
  }

  function connectionText(settings) {
    if (googleAccessToken) return 'Connected for this browser session';
    if (settings && settings.googleClientId) return 'Configured — connect to use';
    return 'OAuth Client ID required';
  }

  function cloudTableHtml() {
    return '<div class="table-wrap" style="margin-top:8px;max-height:330px">'
      + '<table><thead><tr><th>Created</th><th>Cloud backup</th><th>Size</th><th>Action</th></tr></thead>'
      + '<tbody id="cloudBackupRows">'
      + '<tr><td colspan="4" class="empty">Connect Google Drive, then select Refresh cloud list.</td></tr>'
      + '</tbody></table></div>';
  }

  function syncCardHtml() {
    const database = ensureBackupModel();
    const settings = database ? database.backupSettings : {};
    const last = database && database.backupHistory[0];
    const lastText = last ? new Date(last.createdAt).toLocaleString() : 'Never';

    return '<div class="card" style="grid-column:1/-1;border-color:rgba(20,184,166,.65)">'
      + '<div class="row" style="justify-content:space-between;margin-bottom:8px">'
      + '<h3 style="margin:0;color:var(--teal2)">Cloud Backup & Restore</h3>'
      + '<span class="badge ok">M2 ACTIVE</span>'
      + '</div>'
      + '<p class="muted" style="font-size:13px">Create local safety copies, restore a validated backup, or keep private backups in Google Drive.</p>'
      + '<div class="grid g3" style="margin:10px 0">'
      + '<div class="statline"><span>Last activity</span><b>' + escapeHtml(lastText) + '</b></div>'
      + '<div class="statline"><span>Google Drive</span><b>' + escapeHtml(connectionText(settings)) + '</b></div>'
      + '<div class="statline"><span>Restore safety</span><b>Automatic safety download</b></div>'
      + '</div>'
      + '<div class="row">'
      + '<button class="btn" onclick="backupNow()">⬇ Local Backup</button>'
      + '<button class="btn ghost" onclick="connectGoogleDrive()">🔗 Connect Google Drive</button>'
      + '<button class="btn ghost" onclick="uploadCloudBackup()">☁ Upload to Drive</button>'
      + '<button class="btn ghost" onclick="refreshCloudBackups()">↻ Refresh cloud list</button>'
      + '<button class="btn ghost" onclick="nav(\'settings\')">⚙ Backup settings</button>'
      + '</div>'
      + '<hr class="hr">'
      + '<div class="grid g2">'
      + '<div>'
      + '<h3>Restore from this device</h3>'
      + '<p class="muted" style="font-size:12px">The selected file is validated. Current data is downloaded as a safety backup before replacement.</p>'
      + '<input type="file" id="restoreBackupFile" accept="application/json,.json,.tradeflow.json">'
      + '<div class="row" style="margin-top:10px">'
      + '<button class="btn warn" onclick="restoreFromLocal()">Restore selected backup</button>'
      + '</div>'
      + '</div>'
      + '<div>'
      + '<h3>Google Drive backups</h3>'
      + '<p class="muted" style="font-size:12px">Cloud backups are stored privately in Google Drive’s application-data folder.</p>'
      + cloudTableHtml()
      + '</div>'
      + '</div>'
      + '</div>';
  }

  function settingsHtml() {
    const database = ensureBackupModel();
    const settings = database ? database.backupSettings : defaultSettings();
    const checked = settings.autoBackupEnabled ? ' checked' : '';
    const schedule = settings.schedule || 'manual';
    const retention = settings.keepLocalBackups || BACKUP_HISTORY_LIMIT;
    const clientId = settings.googleClientId || '';
    const connected = !!googleAccessToken;

    return '<div class="card" style="margin-top:12px;border-color:rgba(20,184,166,.45)">'
      + '<div class="row" style="justify-content:space-between">'
      + '<h3 style="color:var(--teal2)">Backup & Restore settings</h3>'
      + '<span class="badge ok">M2</span>'
      + '</div>'
      + '<p class="muted" style="font-size:12px">Local backups work immediately. Google Drive requires a Web application OAuth Client ID configured for the exact GitHub Pages origin.</p>'
      + '<div class="field"><label><input id="backupAutoEnabled" type="checkbox"' + checked + '> Enable automatic backups when supported by a future desktop edition</label></div>'
      + '<div class="grid g2">'
      + '<div class="field"><label>Schedule</label><select id="backupSchedule">'
      + '<option value="manual"' + (schedule === 'manual' ? ' selected' : '') + '>Manual only</option>'
      + '<option value="hourly"' + (schedule === 'hourly' ? ' selected' : '') + '>Hourly (desktop-ready)</option>'
      + '<option value="daily"' + (schedule === 'daily' ? ' selected' : '') + '>Daily (desktop-ready)</option>'
      + '</select></div>'
      + '<div class="field"><label>Keep activity records (1–30)</label>'
      + '<input id="backupRetention" type="number" min="1" max="30" value="' + escapeHtml(retention) + '"></div>'
      + '</div>'
      + '<hr class="hr">'
      + '<h3>Google Drive configuration</h3>'
      + '<div class="field"><label>Google OAuth Client ID</label>'
      + '<input id="googleDriveClientId" value="' + escapeHtml(clientId) + '" '
      + 'placeholder="1234567890-abc.apps.googleusercontent.com"></div>'
      + '<p class="muted" style="font-size:11px;line-height:1.5">'
      + 'Google Cloud setup: enable the Drive API, create an OAuth Client ID of type Web application, '
      + 'and add your exact GitHub Pages origin under Authorized JavaScript origins. '
      + 'Never place a client secret in this browser app.</p>'
      + '<div class="row">'
      + '<button class="btn" onclick="saveBackupSettings()">Save settings</button>'
      + '<button class="btn ghost" onclick="connectGoogleDrive()">Connect Google Drive</button>'
      + (connected ? '<button class="btn ghost" onclick="disconnectGoogleDrive()">Disconnect</button>' : '')
      + '<button class="btn ghost" onclick="uploadCloudBackup()">Upload backup now</button>'
      + '<button class="btn ghost" onclick="refreshCloudBackups()">Refresh cloud list</button>'
      + '</div>'
      + cloudTableHtml()
      + '<hr class="hr">'
      + '<h3>Recent backup & restore history</h3>'
      + '<div class="table-wrap"><table><thead><tr><th>Created</th><th>Type</th><th>Destination</th><th>Status</th><th class="right">Size</th></tr></thead><tbody>'
      + historyRows(15)
      + '</tbody></table></div>'
      + '</div>';
  }

  ZEZMS.backup = {
    version: VERSION,
    milestone: 'M2',
    adapters: {
      browserDownload: {
        supported: true,
        backup: backupNow,
        restore: restoreFromLocal
      },
      desktop: {
        supported: false,
        reason: 'Available when ZEZMS is packaged for desktop.'
      },
      googleDrive: {
        supported: true,
        connect: connectGoogleDrive,
        upload: uploadCloudBackup,
        list: listCloudBackups,
        download: downloadCloudBackupAt,
        restore: restoreCloudBackupAt
      }
    },
    ensureModel: ensureBackupModel,
    validateBackup: validateBackup,
    backupNow: backupNow,
    restoreFromLocal: restoreFromLocal,
    connectGoogleDrive: connectGoogleDrive,
    disconnectGoogleDrive: disconnectGoogleDrive,
    uploadCloudBackup: uploadCloudBackup,
    listCloudBackups: listCloudBackups,
    refreshCloudBackups: refreshCloudBackups,
    downloadCloudBackupAt: downloadCloudBackupAt,
    restoreCloudBackupAt: restoreCloudBackupAt,
    saveSettings: saveSettings,
    syncCardHtml: syncCardHtml,
    settingsHtml: settingsHtml
  };

  window.backupNow = backupNow;
  window.restoreFromLocal = restoreFromLocal;
  window.connectGoogleDrive = connectGoogleDrive;
  window.disconnectGoogleDrive = disconnectGoogleDrive;
  window.uploadCloudBackup = uploadCloudBackup;
  window.refreshCloudBackups = refreshCloudBackups;
  window.downloadCloudBackupAt = downloadCloudBackupAt;
  window.restoreCloudBackupAt = restoreCloudBackupAt;
  window.saveBackupSettings = saveSettings;
}());
