/* ZEZMS TradeFlow Owner Edition v3.13.0
   Native placeholder defaults with explicit calculation-time fallbacks. */
(function () {
  'use strict';

  var VERSION = '3.13.0';
  var BUILD = '20260820-customer-retention-r47';

  function rawValue(input) {
    if (input == null) return '';
    if (typeof input === 'string' || typeof input === 'number') return String(input).trim();
    return String(input.value == null ? '' : input.value).trim();
  }

  function readNumberWithDefault(input, fallback) {
    var raw = rawValue(input);
    if (raw === '') return Number(fallback);
    var value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  }

  function injectStyles() {
    if (document.getElementById('inputDefaultsV3130Styles')) return;
    var style = document.createElement('style');
    style.id = 'inputDefaultsV3130Styles';
    style.textContent = 'input[data-semantic-default]::placeholder{color:#94a3b8;opacity:.78}';
    document.head.appendChild(style);
  }

  window.ZEZMS = window.ZEZMS || {};
  window.ZEZMS.inputDefaults = Object.freeze({
    version: VERSION,
    build: BUILD,
    readNumberWithDefault: readNumberWithDefault,
    _test: Object.freeze({ rawValue: rawValue })
  });
  injectStyles();
}());
