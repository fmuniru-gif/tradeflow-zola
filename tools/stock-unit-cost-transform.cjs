'use strict';

function edits() {
  const find = '  function applyPatch(patch, operation) {';
  const helpers = `  function stockUnitCostPatch(patch) {
    return patch && patch.action === 'update' && patch.collection === 'stockRows' && !patch.fallback
      && patch.before && patch.before.id === patch.key && Array.isArray(patch.changes) && patch.changes.length === 1
      && patch.changes[0].field === 'uCost' && patch.changes[0].mode === 'set';
  }

  function stockUnitCostEvent(operation) {
    return operation.patches.find(function (patch) {
      return patch.action === 'insert' && patch.collection === 'stockCorrections'
        && patch.value && patch.value.correctionType === 'Adjust Unit Cost' && patch.value.costAdjustment;
    });
  }

  function inverseStockUnitCostPatches(operation) {
    const patches = operation.patches.slice().reverse().map(inversePatch).filter(Boolean);
    const event = stockUnitCostEvent(operation);
    if (!event) return patches;
    const cost = event.value.costAdjustment;
    const history = getDatabase().stockCorrections.filter(function (record) {
      const adjustment = record.costAdjustment;
      return adjustment && adjustment.stockRowId === cost.stockRowId
        && adjustment.year === cost.year && adjustment.month === cost.month;
    });
    const index = history.findIndex(function (record) { return record.correctionId === event.value.correctionId; });
    if (index < 0 || index !== history.length - 1) return patches.filter(function (patch) { return !stockUnitCostPatch(patch); });
    if (index > 0) patches.find(stockUnitCostPatch).changes[0].value = history[index - 1].costAdjustment.afterUnitCost;
    return patches;
  }

`;
  const diff = '    diffRoot(before, after, patches);';
  const encode = `
    const costEvent = patches.some(function (patch) { return patch.collection === 'stockCorrections'; })
      && stockUnitCostEvent({ patches: patches });
    if (costEvent) {
      const cost = costEvent.value.costAdjustment;
      const layer = patches.find(function (patch) { return patch.collection === 'stockRows' && patch.key === cost.stockRowId; });
      if (patches.length !== 2 || !layer || layer.action !== 'update' || layer.changes.length !== 1
        || layer.changes[0].field !== 'uCost' || layer.changes[0].mode !== 'set'
        || layer.changes[0].value !== cost.afterUnitCost || Number(layer.changes[0].before) !== cost.beforeUnitCost) {
        throw Error('Unit cost adjustment must contain exactly one identified batch cost and its audit entry.');
      }
      // Use native update evidence without a fallback that could recreate deleted stock.
      layer.before = { id:layer.key, year:cost.year, month:cost.month };
      delete layer.fallback;
    }`;
  const missing = "      if (!found.item) {\n        if (!patch.fallback) throw new Error('Missing record ' + patch.collection + '/' + patch.key);";
  const inverse = "        fallback: null,\n        changes: patch.changes.map(function (change) {";
  const correctionLookup = "    if (correctionInsert) {\n      const database = getDatabase();";
  const duplicate = "        observedSnapshot = cleanSnapshot(database);\n        return true;\n      }\n    }\n    const durableDatabase = getDatabase();";
  const patches = '      operation.patches.forEach(function (patch) { applyPatch(patch, operation); });';
  const pull = '              if (bootstrapReplayPlan.shouldApply) {\n                writeApplyJournal(row, bootstrapReplayPlan.operation);\n                applyJournalWritten = true;\n                applyOperation(bootstrapReplayPlan.operation, { silent: true });';
  const invert = "    inverse.patches = operation.patches.slice().reverse().map(inversePatch).filter(Boolean);";
  function inverseEdit(kind) {
    const lead = "    inverse.kind = '" + kind + "';\n";
    return [lead + invert, lead + "    inverse.patches = inverseStockUnitCostPatches(operation);"];
  }
  return [
    [diff, diff + encode],
    [find, helpers + find],
    [missing, "      if (stockUnitCostPatch(patch)) {\n        if (!found.item) return;\n        if (Number(found.item.year) !== patch.before.year || Number(found.item.month) !== patch.before.month) {\n          throw Error('ZEZMS_STOCK_CONFLICT: unit cost batch period does not match.');\n        }\n      }\n" + missing],
    [inverse, "        fallback: null,\n        ...(stockUnitCostPatch(patch) ? { before:clone(patch.before) } : {}),\n        changes: patch.changes.map(function (change) {"],
    [correctionLookup, "    const orderedStockCost = options && options.orderedStockCost;\n    let verifiedLocalCorrection = false;\n" + correctionLookup],
    [duplicate, `        if (!orderedStockCost) {
          observedSnapshot = cleanSnapshot(database);
          return true;
        }
        verifiedLocalCorrection = true;
      }
    }
    const durableDatabase = getDatabase();`],
    [patches, `      operation.patches.forEach(function (patch) {
        // Keep the local audit after sameCorrection verifies its event data.
        if (!orderedStockCost || stockUnitCostPatch(patch) || (patch === correctionInsert && !verifiedLocalCorrection)) {
          applyPatch(patch, operation);
        }
      });
      if (orderedStockCost && correctionInsert) {
        // A locally saved adjustment takes its authoritative place on acknowledgement.
        const found = findEntity('stockCorrections', correctionInsert.key, correctionInsert.value);
        if (found.index >= 0) found.list.push(found.list.splice(found.index, 1)[0]);
      }`],
    [pull, "              const orderedStockCost = !bootstrapReplayPlan.active && !alreadyApplied && !!stockUnitCostEvent(operation);\n              if (bootstrapReplayPlan.shouldApply || orderedStockCost) {\n                writeApplyJournal(row, bootstrapReplayPlan.operation);\n                applyJournalWritten = true;\n                applyOperation(bootstrapReplayPlan.operation, { silent:true, orderedStockCost:orderedStockCost });"],
    inverseEdit('LOCAL_REBASE_ROLLBACK'),
    inverseEdit('LOCAL_ROLLBACK')
  ];
}

function transformStockUnitCost(html, changes, source) {
  for (const [before, after] of changes) {
    if (html.split(before).length !== 2) throw Error('STOCK_UNIT_COST_MARKER: ' + before.slice(0, 90));
    html = html.replace(before, () => after);
  }
  if (!source) return html;
  const tag = '<script src="js/stock-corrections-v3150.js?v=20261024-ui-stock-review-r1"></script>';
  if (html.split(tag).length !== 2) throw Error('STOCK_UNIT_COST_SCRIPT_MARKER');
  return html.replace(tag, () => '<script data-zezms-stock-unit-cost>\n' + source + '\n</script>');
}

function withoutStockUnitCost(html) {
  const script = /<script data-zezms-stock-unit-cost>\n[\s\S]*?\n<\/script>/;
  if (!script.test(html)) return html;
  const tag = '<script src="js/stock-corrections-v3150.js?v=20261024-ui-stock-review-r1"></script>';
  const reverse = edits().reverse().map(([before, after]) => [after, before]);
  return transformStockUnitCost(html.replace(script, tag), reverse);
}

module.exports = { edits, transformStockUnitCost, withoutStockUnitCost };
