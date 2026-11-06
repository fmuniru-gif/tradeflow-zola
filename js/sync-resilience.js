/* Bounded operation transport. Existing operation IDs, permissions and queue ownership remain authoritative. */
(function () {
  'use strict';
  const transientStatus = new Set([408, 429, 502, 503, 504, 520, 521, 522, 523, 524]);
  function transient(error) {
    if (!error) return false;
    const message = String(error.message || error.details || error);
    if (/ZEZMS_|permission|unauthorized|forbidden|JWT|invalid.*token|row.level.security/i.test(message)) return false;
    return transientStatus.has(Number(error.status)) || ['TimeoutError', 'AbortError'].includes(error.name)
      || /failed to fetch|fetch failed|networkerror|network request failed|load failed|connection (?:reset|closed)|timed? ?out|aborterror/i.test(message);
  }
  // Bind a response to the Cloud identity and client that requested it. Token
  // refresh may replace the session object; the authenticated user must match.
  function captureContext(current) {
    const first = current(), originalClient = first.client;
    function signature(value) {
      const state = value.state || {}, session = value.session;
      return JSON.stringify([String(value.ownerId || ''), String(session && session.user && session.user.id || ''),
        ...['deviceId','deviceAccessMode','syncOwnerId','businessId','branchId','supabaseUrl','publishableKey','deviceAccessStatus','lifecycleState'].map(key=>String(state[key] == null ? '' : state[key])),
        !!state.initialized]);
    }
    const expected = signature(first);
    return Object.freeze({client:originalClient, ownerId:String(first.ownerId || ''), valid() {
      const next = current();
      return !!(originalClient && next.client === originalClient && next.session && next.session.user
        && signature(next) === expected);
    }});
  }
  function requireContext(valid) {
    if (valid && !valid()) throw new Error('ZEZMS_SYNC_CONTEXT_CHANGED: Cloud context changed; stale results were not accepted.');
  }
  function create(options) {
    const opts = options || {}, timeout = opts.timeout || 15000;
    const sleep = opts.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    async function once(factory) {
      const controller = new AbortController();
      let timer;
      const expired = new Promise((_, reject) => {
        timer = setTimeout(() => { const error = new Error('Sync request timed out; the operation remains queued until Cloud acknowledgement is verified.'); error.name = 'TimeoutError'; controller.abort(); reject(error); }, timeout);
      });
      try {
        const response = await Promise.race([Promise.resolve().then(() => {
          const request = factory(controller.signal);
          // The pinned SDK also retries GETs. Keep one bounded retry policy
          // here so nested SDK/application attempts cannot multiply.
          if (request && typeof request.retry === 'function') request.retry(false);
          return request;
        }), expired]);
        if (!response || typeof response !== 'object') throw new Error('ZEZMS_RESPONSE_INVALID');
        if (response.error) { const error = Object.assign(new Error(response.error.message || response.error.details || 'Cloud request failed'), response.error); error.status = response.status || error.status; throw error; }
        return response;
      } finally { clearTimeout(timer); }
    }
    async function read(factory, options) {
      const valid = options && options.contextValid;
      for (let attempt = 0; ; attempt++) {
        requireContext(valid);
        try { const response = await once(factory); requireContext(valid); return response; }
        catch (error) { requireContext(valid); if (attempt >= 2 || !transient(error)) throw error; await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 200)); }
      }
    }
    async function push(io) {
      const operation = io.operation;
      const expected = io.hash(operation);
      if (operation.payloadHash && operation.payloadHash !== expected) throw new Error('ZEZMS_OPERATION_HASH_MISMATCH: outgoing operation changed.');
      function verify(response, acknowledged) {
        if (io.contextValid && !io.contextValid()) throw new Error('ZEZMS_SYNC_CONTEXT_CHANGED: acknowledgement held for the original device and owner.');
        const row = response.data;
        if (!row) return null;
        if (!Number.isSafeInteger(Number(row.seq)) || Number(row.seq) <= 0 || String(row.op_id) !== String(operation.opId)
          || (acknowledged && Number(row.seq) !== Number(acknowledged.server_seq))) throw new Error('ZEZMS_ACK_NOT_DURABLE: Cloud operation identity or sequence differs.');
        const payload = row.payload || {};
        const actual = io.hash(payload);
        if (String(payload.opId || '') !== String(operation.opId) || actual !== expected || (payload.payloadHash && payload.payloadHash !== actual))
          throw new Error('ZEZMS_OPERATION_PAYLOAD_CONFLICT: Cloud contains a different payload for this operation.');
        return Object.assign({}, acknowledged || {}, {server_seq:Number(row.seq), created_at:row.created_at, payloadHash:actual});
      }
      for (let attempt = 0; ; attempt++) {
        requireContext(io.contextValid);
        if (io.allowed && !io.allowed()) throw new Error('ZEZMS_RETRY_DEFERRED: sync context changed; the operation remains queued.');
        let acknowledged;
        try {
          const sent = await once(io.send);
          acknowledged = (Array.isArray(sent.data) ? sent.data[0] : sent.data) || null;
          if (!acknowledged || !Number.isSafeInteger(Number(acknowledged.server_seq)) || Number(acknowledged.server_seq) <= 0) throw new Error('ZEZMS_ACK_INVALID: Cloud did not return a durable sequence.');
          const verified = verify(await read(io.read, {contextValid:io.contextValid}), acknowledged);
          if (!verified) throw new Error('ZEZMS_ACK_NOT_DURABLE: acknowledged operation was not found.');
          return verified;
        } catch (error) {
          // A missing response can follow a committed POST. Read back its exact
          // immutable ID and complete payload before considering another POST.
          if (!transient(error)) throw error;
          if (acknowledged) throw error; // Read-back already used its bounded retry budget.
          const recovered = verify(await read(io.read, {contextValid:io.contextValid}), acknowledged);
          if (recovered) return recovered;
          if (attempt >= 2) throw error;
          if (io.allowed && !io.allowed()) throw new Error('ZEZMS_RETRY_DEFERRED: sync context changed; the operation remains queued.');
          await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 200));
        }
      }
    }
    return Object.freeze({read, push});
  }
  function operationPage(rows, cursor) {
    if (!Array.isArray(rows)) throw new Error('ZEZMS_OPERATION_PAGE_INVALID: expected an operation array.');
    let previous = Number(cursor); const ids = new Set();
    if (!Number.isSafeInteger(previous) || previous < 0) throw new Error('ZEZMS_CURSOR_INVALID');
    for (const row of rows) {
      const seq = Number(row && row.seq), id = String(row && row.op_id || '');
      if (!Number.isSafeInteger(seq) || seq <= previous || !id || ids.has(id) || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload))
        throw new Error('ZEZMS_OPERATION_PAGE_INVALID: invalid identity, sequence, ordering or payload; cursor not advanced.');
      if (row.payload.opId && String(row.payload.opId) !== id) throw new Error('ZEZMS_OPERATION_ID_MISMATCH');
      previous = seq; ids.add(id);
    }
    return rows;
  }
  function sameCorrection(current, incoming) {
    // Reversal changes these four fields without changing the original event.
    const lifecycle = new Set(['status', 'reversedAt', 'reversedBy', 'reversalCorrectionId']);
    function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])); return value; }
    const event = value => Object.fromEntries(Object.keys(value).filter(k => !lifecycle.has(k)).map(k => [k, value[k]]));
    if (JSON.stringify(canonical(event(current))) !== JSON.stringify(canonical(event(incoming)))) throw new Error('ZEZMS_STOCK_CORRECTION_ID_CONFLICT: an existing correction has different event data.');
    return true;
  }
  window.ZEZMS = window.ZEZMS || {};
  ZEZMS.syncResilience = Object.freeze({build:'20261106-sync-context-r1', create, captureContext, operationPage, sameCorrection, transient, transport:create()});
}());
