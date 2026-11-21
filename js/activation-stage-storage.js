/* Save the exact verified stage separately from the working database. */
(function () {
  'use strict';
  const stageKey = 'zezms_m5a4_safe_bootstrap_stage_v1';
  const archiveName = 'zezms-verified-activation';
  const storeName = 'stages';
  const markerPrefix = '{"version":1,"activationArchive":';
  let hydrated = null;

  function marker(raw) {
    if (!raw || !raw.startsWith(markerPrefix)) return null;
    const value = JSON.parse(raw);
    if (!/^[a-f0-9]{64}$/.test(value.activationArchive)) throw Error('Invalid activation storage reference.');
    return value;
  }

  async function checksum(raw) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function openArchive() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(archiveName, 1);
      let timedOut = false;
      const deadline = setTimeout(() => {
        timedOut = true;
        reject(Error('Safari did not open the activation storage. Reload and retry the same setup.'));
      }, 10000);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onerror = () => { clearTimeout(deadline); reject(request.error); };
      request.onsuccess = () => {
        clearTimeout(deadline);
        if (timedOut) request.result.close();
        else resolve(request.result);
      };
    });
  }

  async function transact(mode, work) {
    const database = await openArchive();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode, { durability:mode === 'readwrite' ? 'strict' : 'default' });
        const request = work(transaction.objectStore(storeName));
        const deadline = setTimeout(() => {
          try { transaction.abort(); } catch (_) {}
          reject(Error('Safari did not finish reading or saving the activation data. Retry the same setup.'));
        }, 10000);
        transaction.oncomplete = () => { clearTimeout(deadline); resolve(request.result); };
        transaction.onabort = () => {
          clearTimeout(deadline);
          reject(transaction.error || Error('Activation storage transaction interrupted.'));
        };
      });
    } finally {
      database.close();
    }
  }

  function readRaw() {
    const raw = localStorage.getItem(stageKey);
    if (!marker(raw)) return raw;
    if (hydrated && hydrated.pointer === raw) return hydrated.raw;
    throw Error('The saved activation data is awaiting verification.');
  }

  async function hydrate() {
    const pointer = localStorage.getItem(stageKey);
    const reference = marker(pointer);
    if (!reference || (hydrated && hydrated.pointer === pointer)) return;
    const raw = await transact('readonly', store => store.get(reference.activationArchive));
    if (typeof raw !== 'string' || await checksum(raw) !== reference.activationArchive) {
      throw Error('Safari could not verify the saved activation data.');
    }
    const stage = JSON.parse(raw);
    if (!stage || stage.version !== 1 || stage.deviceId !== reference.deviceId ||
        stage.lifecycleId !== reference.lifecycleId || stage.cursor !== reference.cursor ||
        localStorage.getItem(stageKey) !== pointer) throw Error('The activation setup changed.');
    hydrated = { pointer, raw };
  }

  async function archive(stage) {
    if (!navigator.locks || !window.indexedDB || !window.crypto?.subtle) return;
    const existing = localStorage.getItem(stageKey);
    const raw = readRaw();
    if (!raw || JSON.stringify(JSON.parse(raw)) !== JSON.stringify(stage)) throw Error('The activation setup changed.');
    if (marker(existing)) return;
    const hash = await checksum(raw);
    await transact('readwrite', store => store.put(raw, hash));
    const saved = await transact('readonly', store => store.get(hash));
    if (saved !== raw || localStorage.getItem(stageKey) !== existing) {
      throw Error('Safari could not verify the saved activation data. Your setup is still pending.');
    }
    // The empty candidate keeps the older app's bootstrap guards locked. It
    // has no fingerprint and can only be activated using the verified archive.
    const pointer = JSON.stringify({ version:1, activationArchive:hash, candidate:{},
      deviceId:stage.deviceId, lifecycleId:stage.lifecycleId, cursor:stage.cursor });
    localStorage.setItem(stageKey, pointer);
    if (localStorage.getItem(stageKey) !== pointer) throw Error('The activation setup changed.');
    hydrated = { pointer, raw };
  }

  async function run(work) {
    if (!navigator.locks) {
      if (marker(localStorage.getItem(stageKey))) throw Error('Use the Safari profile where this device setup was verified.');
      return work();
    }
    return navigator.locks.request(archiveName, { ifAvailable:true }, async lock => {
      if (!lock) throw Error('Activation is already running in another TradeFlow tab.');
      await hydrate();
      try { return await work(); }
      catch (error) {
        if (error?.name === 'QuotaExceededError' || /^the quota has been exceeded\.?$/i.test(String(error?.message || ''))) {
          throw Error('Safari ran out of local storage while saving TradeFlow. Keep this setup and its site data.');
        }
        throw error;
      }
    });
  }

  function clear() {
    const reference = marker(localStorage.getItem(stageKey));
    localStorage.removeItem(stageKey);
    if (localStorage.getItem(stageKey) !== null) throw Error('Safari could not finish clearing the activation marker.');
    hydrated = null;
    if (reference) transact('readwrite', store => store.delete(reference.activationArchive)).catch(() => {});
  }

  async function refreshStage() {
    try {
      await hydrate();
      window.ZEZMS.preloginVerifiedActivation?.refresh();
    } catch (_) {
      const status = document.getElementById('sharedLoginStatus');
      if (status) status.textContent = 'Safari could not open the saved activation data. Reload this tab and keep its site data.';
    }
  }

  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.activationStageStorage = Object.freeze({ readRaw, archive, run, clear });
  document.addEventListener('DOMContentLoaded', refreshStage, { once:true });
  window.addEventListener('storage', event => {
    if (event.key === stageKey) refreshStage();
  });
}());
