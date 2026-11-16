/* Print presentation only. Fixed website QR, generated offline with Q error correction and a four-module white quiet zone. */
(function () {
  'use strict';
  const brand = ZEZMS.documentBranding;
  const website = 'https://zolaelectronicszone.com/';
  const displayWebsite = 'zolaelectronicszone.com';
  const rows = ["0000000000000000000000000000000000000", "0000000000000000000000000000000000000", "0000000000000000000000000000000000000", "0000000000000000000000000000000000000", "0000111111100011011001101011111110000", "0000100000100101010100010010000010000", "0000101110101110011001001010111010000", "0000101110100111010100100010111010000", "0000101110101000100101100010111010000", "0000100000101011001111010010000010000", "0000111111101010101010101011111110000", "0000000000000001101001011000000000000", "0000010010101011110101001101101000000", "0000100110000011010110100111111110000", "0000001110111110011101000100101010000", "0000111001001111110111111101010110000", "0000111010110110001111001001010010000", "0000000111001001111110100010101110000", "0000011111101001011110000110100010000", "0000000001000101110101110001010110000", "0000100101110001110101001100000100000", "0000101111011011111000100111100010000", "0000000111101111001101101000011010000", "0000000011001011001001111001110110000", "0000110110100000100101001111110000000", "0000000000001011101111101000101110000", "0000111111100001110100111010100010000", "0000100000100001100101111000110000000", "0000101110101100010001011111100000000", "0000101110100111110101100001000010000", "0000101110100010100101111100001110000", "0000100000101010110101001101010110000", "0000111111100111111101001010110100000", "0000000000000000000000000000000000000", "0000000000000000000000000000000000000", "0000000000000000000000000000000000000", "0000000000000000000000000000000000000"];
  const qrImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASgAAAEoAQAAAADDfFG0AAABrklEQVR4nO2Z22oEMQxDj8r+/y+rD3YuM21hH9qJC84uewmCEcFRJEfmjfHxDqhRjWpUox5FvQAUvw3CwgjLa7Ys+0PrhQEEssCykddsXfbHUJIAIYOivubsSV61UQaBc1PW4VUI9dr/ZHVNQfuTJ/5vVK7XqKYQe2F5my3L/tR6rXqyjGVZ3marsn8epVseitLSTcCqsj+FEihf4SliW4o+H79Dxd4zQ7OUpjXW7ByvgqgXRDGliJlN7TVcflX2h/RLsTi5+2YQiuXqPLSP6b80bWrKV+h919d1jPPxXmJm7Maur68oTf1KG+EhZz7Kqx5q+a8sKZhl1fr1A0rx3jyqLYXB8EFedVGayRHkbBpKrff3sek909h7WLDxXZX9OZSZm4/R0ZGGF6vO/jnULKOsJCJt+3JalmV/uD+RxyMsB9b+6zr2duqIRhm/5dlvrcr+VB5aN0FLvcKBtZ+4jsyPGp0JIxusjJGneFVFXe47HN0uZdpeH1XZn0Y5m4Zx9egMlud5lUPZU7ZWztY8PYuzfxB1uR8K1drahXR+vI37/dDfP7FRjWpUo34H9QnrxapmjTbDkQAAAABJRU5ErkJggg==';
  function headerHTML(embeddedLogo) {
    const original = brand.headerHTML(embeddedLogo);
    return '<div data-zezms-website-header style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;width:100%;min-height:24mm;margin:0 0 8px;break-inside:avoid;box-sizing:border-box;color:#111;text-align:left">'
      + '<div style="min-width:0;padding-top:4px">' + original
      + '<a data-zezms-website href="' + website + '" style="font:10px/1.4 Arial,Helvetica,sans-serif;color:#111;text-decoration:none">' + displayWebsite + '</a></div>'
      + '<img data-zezms-website-qr src="' + qrImage + '" alt="Scan to visit Zola Electronics Zone website" width="91" height="91" style="display:block;width:24mm;height:24mm;flex:0 0 24mm;margin:0;background:#fff;image-rendering:pixelated"></div>';
  }
  function pdfHeader(pdf) {
    brand.pdfHeader(pdf);
    pdf.drawText(displayWebsite, pdf.margin, pdf.margin + 39, 9, false);
    const size = 68.04, cell = size / rows.length, left = pdf.width - pdf.margin - size;
    // An opaque white background protects scan contrast from the document watermark.
    pdf.rect(left, pdf.margin, size, size, 1, null);
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (rows[y][x] === '1') pdf.rect(left + x * cell, pdf.margin + y * cell, cell, cell, 0, null);
      }
    }
    pdf.y = pdf.margin + size + 9;
  }
  async function ready(doc) {
    await brand.ready(doc);
    await Promise.all(Array.from(doc.querySelectorAll('img[data-zezms-website-qr]')).map(async image => {
      await image.decode();
      if (!image.naturalWidth) throw new Error('The website QR code could not be loaded.');
    }));
  }
  ZEZMS.documentBranding = Object.freeze(Object.assign({}, brand, {build:'20261116-print-website-qr-r1',website,displayWebsite,qrImage,headerHTML,pdfHeader,ready}));
}());
