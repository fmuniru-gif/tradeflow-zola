'use strict';

function edits(source) {
  const stageRead = "  function stageRead() { try { var value=JSON.parse(localStorage.getItem(STAGE_KEY) || 'null');";
  const stageClear = '  function stageClear() { try { localStorage.removeItem(STAGE_KEY); } catch (_) {} }';
  const activate = '    await s.activateVerifiedBootstrapR70M(staged.candidate, { cursor:staged.cursor, context:context });';
  const finish = 'finishPromise=finishIfActivated().catch';
  return [
    ['stage storage module', '<script>\n/* Phase A only. No queue disposition, lifecycle transition or activation. */',
      '<script>\n'+source+'\n/* Phase A only. No queue disposition, lifecycle transition or activation. */', 1],
    ['phase guards', '    try { raw=localStorage.getItem(KEY); } catch (_) { return {pending:true,status:\'UNREADABLE\',stage:null}; }',
      "    try { raw=ZEZMS.activationStageStorage.readRaw(); } catch (_) { return {pending:true,status:'UNREADABLE',stage:null}; }", 2],
    ['replay stage', "var stage = JSON.parse(localStorage.getItem(R70K_STAGE_KEY) || 'null');",
      "var stage = JSON.parse(ZEZMS.activationStageStorage.readRaw() || 'null');", 1],
    ['replay gate', '  return !!r70kReadStage();',
      '  return ZEZMS.bootstrapPhaseA.pending();', 1],
    ['managed stage', stageRead,
      "  function stageRead() { try { var value=JSON.parse(ZEZMS.activationStageStorage.readRaw() || 'null');", 1],
    ['verified copy before commit', activate,
      '    await ZEZMS.activationStageStorage.archive(staged);\n'+
      "    var current=state(), sessionNow=s.getSession();\n"+
      "    if (!sessionNow || !sessionNow.user || String(sessionNow.user.id) !== String(pair.session.user.id) ||\n"+
      "        String(current.deviceId || '') !== staged.deviceId || String(current.deviceAccessMode || '').toUpperCase() !== 'PAIRED' ||\n"+
      "        String(current.businessId || '') !== String(pair.state.businessId || '') ||\n"+
      "        String(current.syncOwnerId || '') !== String(pair.state.syncOwnerId || ''))\n"+
      "      throw new Error('The paired Cloud session changed. Reopen TradeFlow and retry activation.');\n"+activate, 1],
    ['clean up verified copy', stageClear, '  function stageClear() { ZEZMS.activationStageStorage.clear(); }', 1],
    ['one active tab', finish, 'finishPromise=ZEZMS.activationStageStorage.run(finishIfActivated).catch', 1]
  ];
}

function transformActivationStorage(html, changes) {
  for (const [name, before, after, count] of changes) {
    const parts = html.split(before);
    if (parts.length !== count+1) throw Error('ACTIVATION_STORAGE_MARKER: '+name);
    html = parts.join(after);
  }
  return html;
}

function withoutActivationStorage(html) {
  if (!html.includes("const archiveName = 'zezms-verified-activation';")) return html;
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname,'../js/activation-stage-storage.js'), 'utf8').replace(/\r\n/g,'\n');
  return transformActivationStorage(html, edits(source).reverse().map(([name, before, after, count]) => [name, after, before, count]));
}

module.exports = { edits, transformActivationStorage, withoutActivationStorage };
