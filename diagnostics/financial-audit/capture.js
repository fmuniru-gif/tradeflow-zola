/* Standalone evidence export: no TradeFlow application imports or network API. */
(() => {
  'use strict';
  const KEYS = Object.freeze([
    'tradeflow_v321_zola', 'zezms_cloud_sync_m4_state', 'zezms_cloud_sync_m4_queue',
    'zezms_cloud_sync_m4_failed_v2', 'zezms_cloud_sync_m4_rejected',
    'zezms_cloud_sync_m4_applied_v2', 'zezms_cloud_sync_m4_apply_journal_v2'
  ]);
  const button = document.getElementById('capture');
  const status = document.getElementById('status');
  const passphrase = document.getElementById('passphrase');
  const encoder = new TextEncoder();
  const base64 = bytes => {
    let text = '';
    for (let i = 0; i < bytes.length; i += 16384)
      text += String.fromCharCode.apply(null, bytes.subarray(i, i + 16384));
    return btoa(text);
  };
  const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const read = () => Object.fromEntries(KEYS.map(key => [key, localStorage.getItem(key)]));
  const parse = value => { try { return JSON.parse(value); } catch (_) { return null; } };
  const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
  async function capture() {
    button.disabled = true;
    try {
      if (passphrase.value.length < 20 || passphrase.value.length > 1024) throw Error('Use a passphrase of 20–1024 characters.');
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')
        throw Error('A secure same-origin page is required.');
      const first = read();
      const db = parse(first.tradeflow_v321_zola);
      const state = parse(first.zezms_cloud_sync_m4_state);
      if (!db || !db.cashBalances || !Array.isArray(db.cashLog) || !state || !state.deviceId)
        throw Error('TradeFlow database or device state is unavailable; no file was created.');
      if (!Array.isArray(parse(first.zezms_cloud_sync_m4_queue)))
        throw Error('The active queue is unavailable; no file was created.');
      const bytes = JSON.stringify(first);
      const firstHash = await digest(bytes);
      if (JSON.stringify(read()) !== bytes) throw Error('TradeFlow changed during capture; retry when idle.');
      const payload = JSON.stringify({format:'ZEZMS_FINANCIAL_EVIDENCE_V1',capturedAt:new Date().toISOString(),
        origin:location.origin,raw:first,rawSha256:firstHash});
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const root = await crypto.subtle.importKey('raw',encoder.encode(passphrase.value),'PBKDF2',false,['deriveKey']);
      const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},root,
        {name:'AES-GCM',length:256},false,['encrypt']);
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(payload)));
      if (JSON.stringify(read()) !== bytes) throw Error('TradeFlow changed during encryption; no file was created.');
      const envelope = {format:'ZEZMS_FINANCIAL_EVIDENCE_ENCRYPTED_V1',kdf:'PBKDF2-SHA256',iterations:600000,
        cipher:'AES-256-GCM',salt:base64(salt),iv:base64(iv),ciphertext:base64(ciphertext)};
      const blob = new Blob([JSON.stringify(envelope)],{type:'application/json'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'TradeFlow-financial-evidence-'+String(state.deviceId).replace(/[^a-zA-Z0-9-]/g,'')+'.json';
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url),60000); }
      status.textContent = 'Encrypted snapshot downloaded. Verify its file SHA-256 and keep the passphrase separately.';
    } catch (error) {
      status.textContent = 'STOP: '+(error && error.message || 'Capture failed.');
    } finally {
      passphrase.value = '';
      button.disabled = false;
    }
  }
  button.addEventListener('click',capture);
})();
