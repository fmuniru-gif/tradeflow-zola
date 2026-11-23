'use strict';

// Direct Print passes an embedded logo and watermark to produce offline HTML.
// The installed bridge rejects URL schemes even in a branding hyperlink.
function edits() {
  const beforeAddress = "      + '<a data-zezms-website href=\"' + website + '\" style=\"font:10px/1.4 Arial,Helvetica,sans-serif;color:#111;text-decoration:none\">' + displayWebsite + '</a></div>'";
  const afterAddress = "      + '<' + websiteTag + ' data-zezms-website' + websiteHref + ' style=\"font:10px/1.4 Arial,Helvetica,sans-serif;color:#111;text-decoration:none\">' + displayWebsite + '</' + websiteTag + '></div>'";
  const beforeHeader = "    const original = brand.headerHTML(embeddedLogo);";
  const afterHeader = beforeHeader + [
    "",
    "    const websiteTag = /^data:image\\//i.test(embeddedLogo || '') ? 'span' : 'a';",
    "    const websiteHref = websiteTag === 'a' ? ' href=\"' + website + '\"' : '';"
  ].join('\n');
  const beforeTitle = "    openModal('<h3>Direct Print unavailable.</h3><p>' + esc(error.message || String(error)) + '</p>'";
  const afterTitle = "    var rejectedDocument = error.status === 400 && error.code === 'unsafe-html';\n"
    + "    var title = rejectedDocument ? 'Print Bridge rejected this document.' : 'Direct Print unavailable.';\n"
    + "    openModal('<h3>' + title + '</h3><p>' + esc(error.message || String(error)) + '</p>'";
  const beforeRetry = "      + '<div class=\"row\"><button class=\"btn\" onclick=\"ZEZPrint.retryFallback(\\'' + id + '\\')\">Retry</button>'";
  const afterRetry = "      + '<div class=\"row\">' + (rejectedDocument ? '' : '<button class=\"btn\" onclick=\"ZEZPrint.retryFallback(\\'' + id + '\\')\">Retry</button>')";
  const catchConnection = "        runtime.connection = error.status === 401 ? 'Pairing required' : 'Bridge unavailable';";
  const afterConnection = catchConnection
    + "\n        if (error.status === 400 && error.code === 'unsafe-html') runtime.connection = 'Connected';";
  return [
    ['choose passive website label', beforeHeader, afterHeader],
    ['render website label', beforeAddress, afterAddress],
    ['document rejection heading', beforeTitle, afterTitle],
    ['omit retry on document rejection', beforeRetry, afterRetry],
    ['retain bridge connection on document rejection', catchConnection, afterConnection]
  ];
}

function transformDirectPrintCompatibility(html, changes) {
  for (const [name, before, after] of changes) {
    if (html.split(before).length !== 2) throw Error('DIRECT_PRINT_COMPATIBILITY_MARKER: ' + name);
    html = html.replace(before, () => after);
  }
  return html;
}

function withoutDirectPrintCompatibility(html) {
  html = require('./creditor-wallet-settlement-transform.cjs').withoutCreditorWalletSettlement(html);
  if (!html.includes("var title = rejectedDocument ? 'Print Bridge rejected this document.'")) return html;
  const reverse = edits().reverse().map(([name, before, after]) => [name, after, before]);
  return transformDirectPrintCompatibility(html, reverse);
}

module.exports = { edits, transformDirectPrintCompatibility, withoutDirectPrintCompatibility };
