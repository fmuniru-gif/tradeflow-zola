(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};

  const BACKUP_HISTORY_LIMIT = 30;
  const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const GIS_URL = 'https://accounts.google.com/gsi/client';
  const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  let googleTokenClient = null;
  let googleAccessToken = '';
  let googleTokenExpiresAt = 0;
  let gisLoadPromise = null;

  function getDatabase() {
    if (typeof DB !== 'undefined' && DB) return DB;
    return null;
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

  function download(blob, fileName) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  function makeEntry(type, destination, status, details) {
    return Object.assign({
      id: type.toUpperCase() + '-' + timestamp() + '-' + Math.random().toString(36).slice(2, 7),
      type: type,
      createdAt: new Date().toISOString(),
      destination: destination,
      status: status
    }, details || {});
  }

  function backupNow(options) {
    const database = ensureBackupModel();
    if (!database) {
      notify('Backup could not start because the local database is unavailable.', 'err');
      return false;
    }

    try {
      const blob = createBackupBlob(database);
      const fileName = (options && options.fileName) || ('ZEZMS_Backup_' + timestamp() + '.json');
      download(blob, fileName);

      if (!(options && options.silentHistory)) {
        const entry = makeEntry('backup', 'browser-download', 'completed', {
          fileName: fileName,
          size: blob.size,
          note: (options && options.note) || 'Manual local backup downloaded by the user.'
        });
        addHistory(entry);
        emit('backup:completed', entry);
      }

      if (!(options && options.silentNotify)) notify('Backup download created successfully.');
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

    const expectedArrays = ['products', 'stockRows', 'sales', 'receipts'];
    const present = expectedArrays.filter((key) => Array.isArray(data[key]));
    if (present.length < 2) {
      throw new Error('This JSON file does not contain the expected ZEZMS business records.');
    }

    if (data.backupHistory && !Array.isArray(data.backupHistory)) {
      throw new Error('The backup history structure is invalid.');
    }

    return true;
  }

  function safetyBackup() {
    const database = ensureBackupModel();
    if (!database) throw new Error('Current database is unavailable.');
    const blob = createBackupBlob(database);
    download(blob, 'ZEZMS_PreRestore_Safety_' + timestamp() + '.json');
    return blob.size;
  }

  function applyRestoreData(data, source, fileName) {
    validateBackup(data);
    const previousSettings = ensureBackupModel().backupSettings;
    const safetySize = safetyBackup();

    if (typeof defaultDB !== 'function') {
      throw new Error('The database initialization service is unavailable.');
    }

    DB = Object.assign(defaultDB(), data);
    ensureBackupModel();

    // Preserve local cloud configuration unless the imported backup explicitly has it.
    DB.backupSettings = Object.assign(defaultSettings(), previousSettings || {}, data.backupSettings || {});
    DB.backupSettings.lastRestoreAt = new Date().toISOString();

    const entry = makeEntry('restore', source, 'completed', {
      fileName: fileName || 'Cloud backup',
      size: 0,
      note: 'Database restored after creating a pre-restore safety download (' + safetySize + ' bytes).'
    });
    DB.backupHistory.unshift(entry);
    DB.backupHistory = DB.backupHistory.slice(0, Number(DB.backupSettings.keepLocalBackups) || BACKUP_HISTORY_LIMIT);
    saveDatabase();
    emit('backup:restored', entry);
    notify('Restore completed successfully. A pre-restore safety backup was downloaded.');
    if (typeof render === 'function') render();
    return true;
  }

  function restoreFromLocal() {
    const input = document.getElementById('restoreBackupFile');
    const file = input && input.files && input.files[0];
    if (!file) {
      notify('Choose a ZEZMS JSON backup first.', 'err');
      return false;
    }

    if (!confirm('Restore this backup and replace ALL current data on this device? A safety backup of the current data will be downloaded first.')) {
      return false;
    }

    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        applyRestoreData(data, 'local-file', file.name);
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
        existing.addEventListener('error', function () { reject(new Error('Google sign-in library failed to load.')); }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = GIS_URL;
      script.async = true;
      script.defer = true;
      script.dataset.zezmsGis = 'true';
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Google sign-in library failed to load. Check your internet connection.')); };
      document.head.appendChild(script);
    });

    return gisLoadPromise;
  }

  async function requestGoogleToken(promptMode) {
    if (!navigator.onLine) throw new Error('Internet connection is required for Google Drive.');

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
    if (googleAccessToken && Date.now() < googleTokenExpiresAt - 60000) return googleAccessToken;
    return requestGoogleToken(interactive ? 'consent' : '');
  }

  async function connectGoogleDrive() {
    try {
      await getValidGoogleToken(true);
      notify('Google Drive connected for this session.');
      if (typeof render === 'function') render();
      setTimeout(refreshCloudBackups, 50);
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
        message = payload.error && payload.error.message ? payload.error.message : message;
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
    ]);
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
      const fileName = 'ZEZMS_Cloud_Backup_' + timestamp() + '.json';
      const multipart = createMultipartBody({
        name: fileName,
        parents: ['appDataFolder'],
        description: 'ZEZMS encrypted-ready JSON backup'
      }, blob);

      const response = await driveFetch(DRIVE_UPLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + multipart.boundary },
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
    const query = encodeURIComponent("name contains 'ZEZMS_Cloud_Backup_' and trashed = false");
    const fields = encodeURIComponent('files(id,name,size,createdTime,modifiedTime)');
    const response = await driveFetch(
      DRIVE_FILES_URL + '?spaces=appDataFolder&q=' + query + '&orderBy=createdTime desc&pageSize=20&fields=' + fields
    );
    const result = await response.json();
    return Array.isArray(result.files) ? result.files : [];
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
      const files = await listCloudBackups();
      if (!files.length) {
        body.innerHTML = '<tr><td colspan="4" class="empty">No Google Drive backups found.</td></tr>';
        return true;
      }

      body.innerHTML = files.map(function (file) {
        const when = file.createdTime ? new Date(file.createdTime).toLocaleString() : '';
        return '<tr>'
          + '<td>' + escapeHtml(when) + '</td>'
          + '<td>' + escapeHtml(file.name) + '</td>'
          + '<td class="mono">' + escapeHtml(formatBytes(file.size)) + '</td>'
          + '<td><button class="btn sm warn" onclick="restoreCloudBackup(\'' + escapeHtml(file.id) + '\',\'' + escapeHtml(file.name) + '\')">Restore</button></td>'
          + '</tr>';
      }).join('');
      return true;
    } catch (error) {
      console.error('Cloud list failed', error);
      body.innerHTML = '<tr><td colspan="4" class="empty">Could not load cloud backups: ' + escapeHtml(error.message || error) + '</td></tr>';
      return false;
    }
  }

  async function restoreCloudBackup(fileId, fileName) {
    if (!fileId) return false;
    if (!confirm('Restore "' + fileName + '" from Google Drive and replace ALL current data? A safety backup will be downloaded first.')) {
      return false;
    }

    try {
      const response = await driveFetch(DRIVE_FILES_URL + '/' + encodeURIComponent(fileId) + '?alt=media');
      const data = await response.json();
      applyRestoreData(data, 'google-drive', fileName);
      return true;
    } catch (error) {
      console.error('Cloud restore failed', error);
      addHistory(makeEntry('restore', 'google-drive', 'failed', {
        fileName: fileName,
        cloudFileId: fileId,
        note: error.message || String(error)
      }));
      notify('Cloud restore failed: ' + (error.message || error), 'err');
      return false;
    }
  }

  function disconnectGoogleDrive() {
    if (googleAccessToken && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(googleAccessToken, function () {}); } catch (_) {}
    }
    googleAccessToken = '';
    googleTokenExpiresAt = 0;
    const database = ensureBackupModel();
    database.backupSettings.cloudConnected = false;
    saveDatabase();
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
    database.backupSettings.googleClientId = clientId ? clientId.value.trim() : database.backupSettings.googleClientId;
    database.backupSettings.cloudProvider = 'google-drive';
    saveDatabase();
    emit('backup:settings-saved', database.backupSettings);
    notify('Backup settings saved.');
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
      return '<tr>'
        + '<td>' + escapeHtml(when) + '</td>'
        + '<td>' + escapeHtml(item.type || 'backup') + '</td>'
        + '<td>' + escapeHtml(item.destination) + '</td>'
        + '<td>' + escapeHtml(item.status) + '</td>'
        + '<td class="mono">' + escapeHtml(formatBytes(item.size)) + '</td>'
        + '</tr>';
    }).join('');
  }

  function syncCardHtml() {
    const database = ensureBackupModel();
    const settings = database ? database.backupSettings : {};
    const last = database && database.backupHistory[0];
    const lastText = last ? new Date(last.createdAt).toLocaleString() : 'Never';
    const cloudText = googleAccessToken
      ? 'Connected for this browser session'
      : (settings.googleClientId ? 'Configured — connect to use' : 'Client ID required');

    return '<div class="card">'
      + '<h3>Backup & Restore Manager</h3>'
      + '<p class="muted" style="font-size:13px">Download a local backup, restore safely, or upload a private backup to Google Drive.</p>'
      + '<div class="statline"><span>Last activity</span><b>' + escapeHtml(lastText) + '</b></div>'
      + '<div class="statline"><span>Google Drive</span><b>' + escapeHtml(cloudText) + '</b></div>'
      + '<button class="btn" onclick="backupNow()">⬇ Backup Now</button>'
      + '<button class="btn ghost" style="margin-left:8px" onclick="uploadCloudBackup()">☁ Upload to Drive</button>'
      + '<button class="btn ghost" style="margin-left:8px" onclick="nav(\'settings\')">Backup settings</button>'
      + '<hr class="hr">'
      + '<h3>Restore local backup</h3>'
      + '<p class="muted" style="font-size:12px">The file is validated first. A safety backup of the current database is downloaded before replacement.</p>'
      + '<input type="file" id="restoreBackupFile" accept="application/json,.json,.tradeflow.json">'
      + '<div class="row" style="margin-top:10px"><button class="btn warn" onclick="restoreFromLocal()">Restore selected backup</button></div>'
      + '</div>';
  }

  function settingsHtml() {
    const database = ensureBackupModel();
    const settings = database ? database.backupSettings : {};
    const checked = settings.autoBackupEnabled ? ' checked' : '';
    const schedule = settings.schedule || 'manual';
    const retention = settings.keepLocalBackups || BACKUP_HISTORY_LIMIT;
    const clientId = settings.googleClientId || '';
    const connected = !!googleAccessToken;

    return '<div class="card" style="margin-top:12px">'
      + '<h3>Backup settings</h3>'
      + '<p class="muted" style="font-size:12px">Local browser backups download to the user’s Downloads folder. Google Drive backups use the private application-data folder and remain separate from ordinary Drive files.</p>'
      + '<div class="field"><label><input id="backupAutoEnabled" type="checkbox"' + checked + '> Enable automatic backups when supported by the installed edition</label></div>'
      + '<div class="grid g2">'
      + '<div class="field"><label>Schedule</label><select id="backupSchedule">'
      + '<option value="manual"' + (schedule === 'manual' ? ' selected' : '') + '>Manual only</option>'
      + '<option value="hourly"' + (schedule === 'hourly' ? ' selected' : '') + '>Hourly (desktop-ready)</option>'
      + '<option value="daily"' + (schedule === 'daily' ? ' selected' : '') + '>Daily (desktop-ready)</option>'
      + '</select></div>'
      + '<div class="field"><label>Keep history records (1–30)</label><input id="backupRetention" type="number" min="1" max="30" value="' + escapeHtml(retention) + '"></div>'
      + '</div>'
      + '<hr class="hr">'
      + '<h3>Google Drive</h3>'
      + '<div class="field"><label>Google OAuth Client ID</label><input id="googleDriveClientId" value="' + escapeHtml(clientId) + '" placeholder="1234567890-abc.apps.googleusercontent.com"></div>'
      + '<p class="muted" style="font-size:11px">Create a Web application OAuth client and add your GitHub Pages address under Authorized JavaScript origins. The Client ID is public configuration; never place a client secret in this app.</p>'
      + '<button class="btn" onclick="saveBackupSettings()">Save backup settings</button>'
      + '<button class="btn ghost" style="margin-left:8px" onclick="connectGoogleDrive()">Connect Google Drive</button>'
      + (connected ? '<button class="btn ghost" style="margin-left:8px" onclick="disconnectGoogleDrive()">Disconnect</button>' : '')
      + '<button class="btn ghost" style="margin-left:8px" onclick="uploadCloudBackup()">Upload backup now</button>'
      + '<hr class="hr">'
      + '<h3>Google Drive backups</h3>'
      + '<button class="btn sm ghost" onclick="refreshCloudBackups()">Refresh list</button>'
      + '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Created</th><th>File</th><th>Size</th><th>Action</th></tr></thead><tbody id="cloudBackupRows">'
      + '<tr><td colspan="4" class="empty">Connect Google Drive, then refresh this list.</td></tr>'
      + '</tbody></table></div>'
      + '<hr class="hr">'
      + '<h3>Recent backup & restore history</h3>'
      + '<div class="table-wrap"><table><thead><tr><th>Created</th><th>Type</th><th>Destination</th><th>Status</th><th class="right">Size</th></tr></thead><tbody>'
      + historyRows(15)
      + '</tbody></table></div>'
      + '</div>';
  }

  ZEZMS.backup = {
    version: 2,
    adapters: {
      browserDownload: { supported: true, backup: backupNow, restore: restoreFromLocal },
      desktop: { supported: false, reason: 'Available when ZEZMS is packaged for desktop.' },
      googleDrive: {
        supported: true,
        connect: connectGoogleDrive,
        upload: uploadCloudBackup,
        list: listCloudBackups,
        restore: restoreCloudBackup
      }
    },
    ensureModel: ensureBackupModel,
    backupNow: backupNow,
    restoreFromLocal: restoreFromLocal,
    uploadCloudBackup: uploadCloudBackup,
    refreshCloudBackups: refreshCloudBackups,
    restoreCloudBackup: restoreCloudBackup,
    connectGoogleDrive: connectGoogleDrive,
    disconnectGoogleDrive: disconnectGoogleDrive,
    saveSettings: saveSettings,
    syncCardHtml: syncCardHtml,
    settingsHtml: settingsHtml
  };

  window.backupNow = backupNow;
  window.restoreFromLocal = restoreFromLocal;
  window.uploadCloudBackup = uploadCloudBackup;
  window.refreshCloudBackups = refreshCloudBackups;
  window.restoreCloudBackup = restoreCloudBackup;
  window.connectGoogleDrive = connectGoogleDrive;
  window.disconnectGoogleDrive = disconnectGoogleDrive;
  window.saveBackupSettings = saveSettings;
}());
