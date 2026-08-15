/* ZEZMS Owner Edition v3.11.0 - branded offline PDF exports */
(function () {
  'use strict';

  window.ZEZMS = window.ZEZMS || {};
  const BUILD = '20260814-sales-channel-capture-r43';
  const DOCUMENT_WATERMARK_ASSET = 'assets/zez-document-watermark.jpg';
  const DOCUMENT_WATERMARK_OPACITY = 0.10;
  const A4 = { width: 595, height: 842 };
  const A5 = { width: 419.53, height: 595.28 };
  const A5_MARGIN = 28.35;
  let watermarkAssetPromise = null;

  function ascii(value) {
    let result = String(value == null ? '' : value)
      .replace(/GH₵/g, 'GHS ')
      .replace(/[–—−]/g, '-')
      .replace(/·/g, '-')
      .replace(/…/g, '...');
    try { result = result.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    return result.replace(/[^\x20-\x7E\n]/g, '?');
  }

  function pdfEscape(value) {
    return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function number(value) {
    return (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function dateText(value, withTime) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return ascii(value);
    return withTime
      ? date.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: '2-digit' });
  }

  function safeFileName(value) {
    const cleaned = ascii(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return (cleaned || 'ZEZMS-document') + '.pdf';
  }

  function jpegDetails(bytes) {
    let offset = 2;
    if (!bytes || bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      throw new Error('The document watermark is not a valid JPEG image.');
    }
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xFF) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
      const length = (bytes[offset] << 8) + bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7)
        || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
        return {
          height: (bytes[offset + 3] << 8) + bytes[offset + 4],
          width: (bytes[offset + 5] << 8) + bytes[offset + 6],
          components: bytes[offset + 7]
        };
      }
      offset += length;
    }
    throw new Error('The document watermark JPEG dimensions could not be read.');
  }

  function bytesToHex(bytes) {
    const digits = '0123456789ABCDEF';
    let result = '';
    for (let index = 0; index < bytes.length; index += 1) {
      const value = bytes[index];
      result += digits[value >> 4] + digits[value & 15];
    }
    return result;
  }

  function loadDocumentWatermark() {
    if (!watermarkAssetPromise) {
      watermarkAssetPromise = fetch(DOCUMENT_WATERMARK_ASSET, { cache: 'force-cache' })
        .then(function (response) {
          if (!response.ok) throw new Error('Watermark asset returned HTTP ' + response.status + '.');
          return response.arrayBuffer();
        })
        .then(function (buffer) {
          const bytes = new Uint8Array(buffer);
          return Object.assign({ bytes: bytes, opacity: DOCUMENT_WATERMARK_OPACITY }, jpegDetails(bytes));
        })
        .catch(function (error) {
          console.warn('ZEZMS document watermark is unavailable; generating the document without it.', error);
          return null;
        });
    }
    return watermarkAssetPromise;
  }

  class SimplePDF {
    constructor(size, options) {
      const opts = options || {};
      this.width = (size || A4).width;
      this.height = (size || A4).height;
      this.margin = opts.margin == null ? 36 : Number(opts.margin);
      this.bottom = 42;
      this.watermark = opts.watermark || null;
      this.pages = [];
      this.current = -1;
      this.y = this.margin;
      this.addPage();
    }

    addPage() {
      this.pages.push([]);
      this.current = this.pages.length - 1;
      this.y = this.margin;
    }

    command(value) {
      this.pages[this.current].push(value);
    }

    baseline(top, size) {
      return this.height - top - size;
    }

    estimatedWidth(value, size) {
      return ascii(value).length * size * 0.56;
    }

    drawText(value, x, top, size, bold, align) {
      const content = ascii(value).replace(/\n/g, ' ');
      const fontSize = Number(size) || 10;
      let position = Number(x) || 0;
      if (align === 'right') position -= this.estimatedWidth(content, fontSize);
      if (align === 'center') position -= this.estimatedWidth(content, fontSize) / 2;
      this.command('BT /' + (bold ? 'F2' : 'F1') + ' ' + fontSize.toFixed(2) + ' Tf '
        + position.toFixed(2) + ' ' + this.baseline(top, fontSize).toFixed(2) + ' Td (' + pdfEscape(content) + ') Tj ET');
    }

    line(x1, top1, x2, top2, grey) {
      const shade = grey == null ? 0 : Number(grey);
      this.command(shade.toFixed(2) + ' G ' + Number(x1).toFixed(2) + ' ' + (this.height - top1).toFixed(2)
        + ' m ' + Number(x2).toFixed(2) + ' ' + (this.height - top2).toFixed(2) + ' l S 0 G');
    }

    rect(x, top, width, height, fillGrey, strokeGrey) {
      const y = this.height - top - height;
      if (fillGrey != null) {
        this.command(Number(fillGrey).toFixed(2) + ' g ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' '
          + width.toFixed(2) + ' ' + height.toFixed(2) + ' re f 0 g');
      }
      if (strokeGrey != null) {
        this.command(Number(strokeGrey).toFixed(2) + ' G ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' '
          + width.toFixed(2) + ' ' + height.toFixed(2) + ' re S 0 G');
      }
    }

    ensureSpace(height) {
      if (this.y + height > this.height - this.bottom) this.addPage();
    }

    wrap(value, width, size) {
      const source = ascii(value).replace(/\r/g, '').split('\n');
      const maxChars = Math.max(1, Math.floor(width / ((Number(size) || 10) * 0.51)));
      const lines = [];
      source.forEach(function (paragraph) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) { lines.push(''); return; }
        let line = '';
        words.forEach(function (word) {
          while (word.length > maxChars) {
            if (line) { lines.push(line); line = ''; }
            lines.push(word.slice(0, maxChars));
            word = word.slice(maxChars);
          }
          const candidate = line ? line + ' ' + word : word;
          if (candidate.length > maxChars && line) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        });
        if (line) lines.push(line);
      });
      return lines.length ? lines : [''];
    }

    paragraph(value, options) {
      const opts = options || {};
      const size = opts.size || 10;
      const width = opts.width || (this.width - this.margin * 2);
      const x = opts.x == null ? this.margin : opts.x;
      const lineHeight = opts.lineHeight || size * 1.3;
      const lines = this.wrap(value, width, size);
      this.ensureSpace(lines.length * lineHeight + 2);
      lines.forEach((line, index) => {
        let textX = x;
        if (opts.align === 'center') textX = x + width / 2;
        if (opts.align === 'right') textX = x + width;
        this.drawText(line, textX, this.y + index * lineHeight, size, !!opts.bold, opts.align);
      });
      this.y += lines.length * lineHeight + (opts.after == null ? 4 : opts.after);
      return lines.length * lineHeight;
    }

    heading(value, size) {
      this.ensureSpace((size || 18) + 12);
      this.drawText(value, this.margin, this.y, size || 18, true);
      this.y += (size || 18) + 8;
    }

    keyValue(label, value) {
      this.ensureSpace(15);
      this.drawText(label, this.margin, this.y, 9, true);
      this.drawText(value, this.margin + 105, this.y, 9, false);
      this.y += 14;
    }

    table(headers, rows, widths, aligns) {
      const fontSize = 8;
      const lineHeight = 9.5;
      const padding = 3;
      const startX = this.margin;
      const totalWidth = widths.reduce(function (sum, width) { return sum + width; }, 0);
      const drawRow = (cells, header) => {
        const wrapped = cells.map((cell, index) => this.wrap(cell, widths[index] - padding * 2, fontSize));
        const height = Math.max(header ? 20 : 17, Math.max.apply(null, wrapped.map(function (lines) { return lines.length; })) * lineHeight + padding * 2);
        if (this.y + height > this.height - this.bottom) {
          this.addPage();
          if (!header) drawRow(headers, true);
        }
        let x = startX;
        cells.forEach((cell, index) => {
          this.rect(x, this.y, widths[index], height, header ? 0.90 : null, 0.65);
          wrapped[index].forEach((line, lineIndex) => {
            const align = aligns && aligns[index] ? aligns[index] : 'left';
            let textX = x + padding;
            if (align === 'right') textX = x + widths[index] - padding;
            if (align === 'center') textX = x + widths[index] / 2;
            this.drawText(line, textX, this.y + padding + lineIndex * lineHeight, fontSize, header, align);
          });
          x += widths[index];
        });
        this.y += height;
      };
      if (Math.abs(totalWidth - (this.width - this.margin * 2)) > 1) throw new Error('PDF table widths do not match the printable width.');
      drawRow(headers, true);
      rows.forEach((row) => drawRow(row, false));
      this.y += 8;
    }

    summary(rows) {
      const width = Math.min(235, this.width - this.margin * 2);
      const x = this.width - this.margin - width;
      const rowHeight = 17;
      this.ensureSpace(rows.length * rowHeight + 10);
      rows.forEach((row, index) => {
        const strong = !!row.strong;
        this.rect(x, this.y, width, rowHeight, strong ? 0.90 : null, 0.72);
        this.drawText(row.label, x + 5, this.y + 4, strong ? 9 : 8.5, strong);
        this.drawText(row.value, x + width - 5, this.y + 4, strong ? 9 : 8.5, true, 'right');
        this.y += rowHeight;
      });
      this.y += 8;
    }

    approvedStamp(x, top, width, height) {
      const stampWidth = width || 74;
      const stampHeight = height || 21;
      const stampY = this.height - top - stampHeight;
      const label = 'APPROVED';
      const labelSize = 10;
      const labelX = x + (stampWidth - this.estimatedWidth(label, labelSize)) / 2;
      const labelTop = top + (stampHeight - labelSize) / 2 - 0.5;
      this.command('q 0.06 0.43 0.29 RG 0.06 0.43 0.29 rg 1.25 w '
        + x.toFixed(2) + ' ' + stampY.toFixed(2) + ' ' + stampWidth.toFixed(2) + ' ' + stampHeight.toFixed(2)
        + ' re S BT /F2 ' + labelSize.toFixed(2) + ' Tf ' + labelX.toFixed(2) + ' '
        + this.baseline(labelTop, labelSize).toFixed(2) + ' Td (' + label + ') Tj ET Q');
    }

    signatures(left, right, options) {
      const opts = options || {};
      this.ensureSpace(opts.approved ? 78 : 62);
      const half = (this.width - this.margin * 2 - 35) / 2;
      if (opts.approved) this.approvedStamp(this.margin + (half - 74) / 2, this.y + 2, 74, 21);
      this.y += opts.approved ? 43 : 34;
      this.line(this.margin, this.y, this.margin + half, this.y, 0.15);
      this.line(this.margin + half + 35, this.y, this.width - this.margin, this.y, 0.15);
      this.drawText(left, this.margin + half / 2, this.y + 4, 8.5, false, 'center');
      this.drawText(right, this.margin + half + 35 + half / 2, this.y + 4, 8.5, false, 'center');
      this.y += 22;
    }

    finish() {
      this.pages.forEach((commands, index) => {
        const footer = 'ZEZMS TradeFlow - Page ' + (index + 1) + ' of ' + this.pages.length;
        commands.push('BT /F1 7.50 Tf ' + (this.width / 2 - footer.length * 1.9).toFixed(2) + ' 20.00 Td (' + pdfEscape(footer) + ') Tj ET');
      });

      const objects = [];
      const pageIds = [];
      objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
      objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
      objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
      let nextId = 5;
      let graphicsStateId = 0;
      let watermarkId = 0;
      if (this.watermark && this.watermark.bytes) {
        graphicsStateId = nextId;
        watermarkId = nextId + 1;
        nextId += 2;
        const opacity = Math.max(0, Math.min(1, Number(this.watermark.opacity) || DOCUMENT_WATERMARK_OPACITY));
        objects[graphicsStateId] = '<< /Type /ExtGState /ca ' + opacity.toFixed(2) + ' /CA ' + opacity.toFixed(2) + ' /BM /Normal >>';
        const imageHex = bytesToHex(this.watermark.bytes) + '>'; 
        const colourSpace = Number(this.watermark.components) === 1 ? '/DeviceGray' : (Number(this.watermark.components) === 4 ? '/DeviceCMYK' : '/DeviceRGB');
        objects[watermarkId] = '<< /Type /XObject /Subtype /Image /Width ' + Number(this.watermark.width)
          + ' /Height ' + Number(this.watermark.height) + ' /ColorSpace ' + colourSpace
          + ' /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ' + imageHex.length
          + ' >>\nstream\n' + imageHex + '\nendstream';
      }
      this.pages.forEach((commands, index) => {
        const contentId = nextId + index * 2;
        const pageId = contentId + 1;
        const watermarkCommand = watermarkId
          ? 'q /GS1 gs ' + this.width.toFixed(2) + ' 0 0 ' + this.height.toFixed(2) + ' 0 0 cm /WM Do Q\n'
          : '';
        const stream = watermarkCommand + commands.join('\n') + '\n';
        objects[contentId] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream';
        objects[pageId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + this.width + ' ' + this.height + '] '
          + '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> '
          + (watermarkId ? '/ExtGState << /GS1 ' + graphicsStateId + ' 0 R >> /XObject << /WM ' + watermarkId + ' 0 R >> ' : '')
          + '>> /Contents ' + contentId + ' 0 R >>';
        pageIds.push(pageId);
      });
      objects[2] = '<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] /Count ' + pageIds.length + ' >>';

      let output = '%PDF-1.4\n%ZEZMS\n';
      const offsets = [0];
      for (let id = 1; id < objects.length; id += 1) {
        offsets[id] = output.length;
        output += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
      }
      const xref = output.length;
      output += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
      for (let id = 1; id < objects.length; id += 1) {
        output += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
      }
      output += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
      return new TextEncoder().encode(output);
    }
  }

  function businessHeader(pdf, title, numberText, dateValue, status) {
    const biz = DB.business || BUSINESS;
    const compact = pdf.width < 500;
    const businessNameSize = compact ? 12.5 : 16;
    pdf.drawText(ascii(biz.name || 'ZEZMS TradeFlow'), pdf.margin, pdf.y, businessNameSize, true);
    const titleSize = compact ? (ascii(title).length >= 14 ? 13 : 16) : (ascii(title).length >= 14 ? 16 : 20);
    pdf.drawText(title, pdf.width - pdf.margin, pdf.y, titleSize, true, 'right');
    pdf.y += 22;
    pdf.drawText(ascii(biz.address || ''), pdf.margin, pdf.y, 8.5, false);
    pdf.drawText(numberText, pdf.width - pdf.margin, pdf.y, 9, true, 'right');
    pdf.y += 12;
    pdf.drawText('Tel: ' + ascii(biz.tel || ''), pdf.margin, pdf.y, 8.5, false);
    pdf.drawText('Date: ' + dateText(dateValue, false), pdf.width - pdf.margin, pdf.y, 8.5, false, 'right');
    pdf.y += 12;
    if (status) pdf.drawText('Status: ' + ascii(status), pdf.width - pdf.margin, pdf.y, 8.5, true, 'right');
    pdf.y += 13;
    pdf.line(pdf.margin, pdf.y, pdf.width - pdf.margin, pdf.y, 0.1);
    pdf.y += 12;
  }

  function normalizeReceipt(source) {
    const channels = ['Walk-in','WhatsApp','Facebook','TikTok','Instagram','Phone Call','Referral','Corporate/B2B','Other'];
    const rawChannel = String(source.salesChannel || '').trim();
    const salesChannel = channels.find(function (channel) { return channel.toLowerCase() === rawChannel.toLowerCase(); }) || '';
    const salesChannelOther = salesChannel === 'Other' ? String(source.salesChannelOther || '').trim().slice(0, 100) : '';
    const lines = (source.lines || []).map(function (line) {
      return {
        product: line.product || line.name || '', qty: Number(line.qty) || 0,
        unitPrice: Number(line.uPrice != null ? line.uPrice : line.price) || 0,
        discount: Number(line.disc) || 0,
        total: Number(line.total != null ? line.total : line.amount) || 0
      };
    });
    const total = Number(source.total != null ? source.total : source.totalAmount) || 0;
    const subtotal = Number(source.subtotal != null ? source.subtotal : lines.reduce(function (sum, line) { return sum + line.total; }, 0)) || 0;
    const vat = Number(source.vatAmount != null ? source.vatAmount : total - subtotal) || 0;
    const paid = Number(source.paid != null ? source.paid : source.amountPaid) || 0;
    const balance = source.balance != null ? Number(source.balance) || 0 : Math.max(0, total - paid);
    return {
      receiptNo: source.receiptNo || source.id || '', customer: source.customer || source.customerName || '',
      contact: source.contact || '', location: source.location || '', date: source.date,
      cashier: source.cashier || '', lines: lines, subtotal: subtotal,
      vatRate: Number(source.vatRate) || (subtotal > 0 ? vat / subtotal * 100 : 0), vat: vat,
      total: total, paid: paid, balance: balance,
      salesSource: salesChannel ? (salesChannel === 'Other' && salesChannelOther ? salesChannel + ' - ' + salesChannelOther : salesChannel) : '',
      status: source.voided || source.status === 'VOID' || source.status === 'UNDONE' ? 'VOID' : (balance > 0 ? 'CREDIT' : 'PAID')
    };
  }

  function buildReceiptPDF(source, watermark) {
    const receipt = normalizeReceipt(source);
    const pdf = new SimplePDF(A5, { margin: A5_MARGIN, watermark: watermark });
    businessHeader(pdf, 'SALES RECEIPT', 'Receipt No: ' + receipt.receiptNo, receipt.date, receipt.status);
    pdf.keyValue('Customer', receipt.customer || '-');
    pdf.keyValue('Location', receipt.location || '-');
    pdf.keyValue('Telephone', receipt.contact || '-');
    pdf.keyValue('Cashier', receipt.cashier || '-');
    if (receipt.salesSource) pdf.keyValue('Sales Source', receipt.salesSource);
    pdf.y += 4;
    pdf.table(
      ['Product', 'Qty', 'Unit price', 'Discount', 'Total'],
      receipt.lines.map(function (line) { return [line.product, number(line.qty), number(line.unitPrice), number(line.discount), number(line.total)]; }),
      [142, 34, 65, 58, 64], ['left', 'right', 'right', 'right', 'right']
    );
    pdf.summary([
      { label: 'Subtotal', value: 'GHS ' + number(receipt.subtotal) },
      { label: 'VAT (' + number(receipt.vatRate) + '%)', value: 'GHS ' + number(receipt.vat) },
      { label: 'Grand total', value: 'GHS ' + number(receipt.total), strong: true },
      { label: 'Amount paid', value: 'GHS ' + number(receipt.paid) },
      { label: 'Balance owed', value: 'GHS ' + number(receipt.balance), strong: receipt.balance > 0 }
    ]);
    pdf.signatures('Cashier signature', 'Customer signature', { approved: true });
    pdf.paragraph('Thank you for your business.', { align: 'center', bold: true, size: 11 });
    return pdf.finish();
  }

  function buildInvoicePDF(record, watermark) {
    const pdf = new SimplePDF(A5, { margin: A5_MARGIN, watermark: watermark });
    businessHeader(pdf, 'INVOICE', 'Invoice No: ' + (record.invoiceNo || record.id || ''), record.date, record.status || 'OPEN');
    pdf.keyValue('Customer', record.customer || '-');
    pdf.keyValue('Location', record.location || '-');
    pdf.keyValue('Telephone', record.contact || '-');
    pdf.keyValue('TIN / Customer ID', record.tin || '-');
    pdf.keyValue('Reference', record.reference || '-');
    pdf.keyValue('Due date', dateText(record.dueDate, false));
    pdf.y += 4;
    pdf.table(
      ['#', 'Product ID', 'Product', 'Qty', 'Unit price', 'Discount', 'Total'],
      (record.lines || []).map(function (line, index) {
        return [String(index + 1), line.productId || '-', line.product || '', number(line.qty), number(line.unitPrice), number(line.discount || 0), number(line.total)];
      }),
      [16, 45, 100, 33, 56, 49, 64], ['center', 'left', 'left', 'right', 'right', 'right', 'right']
    );
    const subtotal = Number(record.subtotal) || 0;
    const vat = Number(record.vatAmount != null ? record.vatAmount : record.vat) || 0;
    pdf.summary([
      { label: 'Subtotal', value: 'GHS ' + number(subtotal) },
      { label: 'VAT (' + number(record.vatRate) + '%)', value: 'GHS ' + number(vat) },
      { label: 'Grand total', value: 'GHS ' + number(record.total), strong: true }
    ]);
    if (record.terms) pdf.paragraph('Terms: ' + record.terms, { size: 8.5 });
    if (record.notes) pdf.paragraph('Notes: ' + record.notes, { size: 8.5 });
    pdf.signatures('For ' + ascii((DB.business || BUSINESS).name), 'Customer signature', { approved: true });
    return pdf.finish();
  }

  function buildWaybillPDF(record, watermark) {
    const pdf = new SimplePDF(A5, { margin: A5_MARGIN, watermark: watermark });
    businessHeader(pdf, 'WAYBILL', 'Waybill No: ' + (record.waybillNo || record.id || ''), record.date, record.status || 'ACTIVE');
    pdf.keyValue('Consignee', record.consignee || '-');
    pdf.keyValue('Location', record.location || '-');
    pdf.keyValue('Telephone', record.contact || '-');
    pdf.keyValue('Reference', record.reference || '-');
    pdf.keyValue('Vehicle number', record.vehicleNo || '-');
    pdf.keyValue('Driver / delivery person', record.driver || '-');
    pdf.y += 4;
    pdf.table(
      ['#', 'Product ID', 'Product description', 'Qty', 'Unit', 'Remarks'],
      (record.lines || []).map(function (line, index) {
        return [String(index + 1), line.productId || '-', line.product || '', number(line.qty), line.unit || 'pcs', line.remarks || ''];
      }),
      [16, 48, 125, 40, 38, 96], ['center', 'left', 'left', 'right', 'left', 'left']
    );
    if (record.notes) pdf.paragraph('Delivery notes: ' + record.notes, { size: 8.5 });
    pdf.signatures('Goods issued by', 'Goods received by', { approved: true });
    pdf.paragraph('The recipient confirms that the goods listed above were received in the stated quantities and apparent condition.', { size: 8 });
    return pdf.finish();
  }

  function buildPurchaseOrderPDF(record) {
    const pdf = new SimplePDF(A4);
    businessHeader(pdf, 'PURCHASE ORDER', 'PO No: ' + (record.poNo || record.id || ''), record.date, record.status || 'OPEN');
    pdf.keyValue('Supplier', record.supplierName || '-');
    pdf.keyValue('Contact', record.supplierContact || '-');
    pdf.keyValue('Supplier reference', record.supplierReference || '-');
    pdf.keyValue('Expected delivery', dateText(record.expectedDate, false));
    pdf.keyValue('Prepared by', record.cashier || '-');
    pdf.y += 4;
    pdf.table(
      ['#', 'Product ID', 'Product', 'Qty', 'Unit cost', 'Total'],
      (record.lines || []).map(function (line, index) {
        return [String(index + 1), line.productId || '-', line.product || '', number(line.qty), number(line.unitCost), number(line.total)];
      }),
      [20, 70, 200, 55, 85, 93], ['center', 'left', 'left', 'right', 'right', 'right']
    );
    pdf.summary([
      { label: 'Order total', value: 'GHS ' + number(record.total) },
      { label: 'Amount paid', value: 'GHS ' + number(record.amountPaid) },
      { label: 'Supplier balance', value: 'GHS ' + number(record.outstanding), strong: true }
    ]);
    if (record.notes) pdf.paragraph('Notes: ' + record.notes, { size: 8.5 });
    pdf.signatures('Authorised by', 'Supplier acknowledgement');
    return pdf.finish();
  }

  function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = safeFileName(filename.replace(/\.pdf$/i, ''));
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
  }

  window.downloadStoredReceiptPDF = async function (receiptNo) {
    const receipt = (DB.receipts || []).find(function (item) { return String(item.receiptNo) === String(receiptNo); });
    if (!receipt) { toast('Receipt not found.', 'err'); return; }
    const watermark = await loadDocumentWatermark();
    downloadBytes(buildReceiptPDF(receipt, watermark), 'Receipt-' + receipt.receiptNo);
    toast('Receipt PDF downloaded.');
  };

  window.downloadStoredCommercialDocumentPDF = async function (type, id) {
    const list = type === 'invoice' ? DB.invoices : DB.waybills;
    const record = (list || []).find(function (item) {
      return String(item.id) === String(id) || String(item.invoiceNo || item.waybillNo) === String(id);
    });
    if (!record) { toast('Document not found.', 'err'); return; }
    const watermark = await loadDocumentWatermark();
    const bytes = type === 'invoice' ? buildInvoicePDF(record, watermark) : buildWaybillPDF(record, watermark);
    const numberText = type === 'invoice' ? (record.invoiceNo || record.id) : (record.waybillNo || record.id);
    downloadBytes(bytes, (type === 'invoice' ? 'Invoice-' : 'Waybill-') + numberText);
    toast((type === 'invoice' ? 'Invoice' : 'Waybill') + ' PDF downloaded.');
  };

  window.downloadPurchaseOrderPDF = function (id) {
    const finder = ZEZMS.ownerMaintenance && ZEZMS.ownerMaintenance.findPurchaseOrder;
    const record = finder ? finder(id) : (DB.purchaseOrders || []).find(function (item) { return String(item.id) === String(id); });
    if (!record) { toast('Purchase order not found.', 'err'); return; }
    downloadBytes(buildPurchaseOrderPDF(record), 'Purchase-Order-' + (record.poNo || record.id));
    toast('Purchase order PDF downloaded.');
  };

  function makeButton(label, action, key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn sm ghost';
    button.textContent = label;
    button.dataset.pdfExport = key;
    button.addEventListener('click', action);
    return button;
  }

  function installRegisterButtons() {
    document.querySelectorAll('button[onclick^="printStoredReceipt("]').forEach(function (button) {
      const match = String(button.getAttribute('onclick') || '').match(/printStoredReceipt\('([^']+)'\)/);
      if (!match || button.parentElement.querySelector('[data-pdf-export="receipt-' + CSS.escape(match[1]) + '"]')) return;
      button.insertAdjacentElement('afterend', makeButton('PDF', function () { downloadStoredReceiptPDF(match[1]); }, 'receipt-' + match[1]));
    });
    document.querySelectorAll('button[onclick^="printStoredCommercialDocument("]').forEach(function (button) {
      const match = String(button.getAttribute('onclick') || '').match(/printStoredCommercialDocument\('([^']+)'\s*,\s*'([^']+)'\)/);
      if (!match) return;
      const key = match[1] + '-' + match[2];
      if (button.parentElement.querySelector('[data-pdf-export="' + CSS.escape(key) + '"]')) return;
      button.insertAdjacentElement('afterend', makeButton('PDF', function () { downloadStoredCommercialDocumentPDF(match[1], match[2]); }, key));
    });
  }

  const previousRender = render;
  render = function () {
    const result = previousRender.apply(this, arguments);
    installRegisterButtons();
    return result;
  };

  installRegisterButtons();
  ZEZMS.pdfExport = {
    version: '3.11.0', build: BUILD, SimplePDF: SimplePDF,
    buildReceiptPDF: buildReceiptPDF, buildInvoicePDF: buildInvoicePDF,
    buildWaybillPDF: buildWaybillPDF, buildPurchaseOrderPDF: buildPurchaseOrderPDF,
    loadDocumentWatermark: loadDocumentWatermark,
    documentWatermarkAsset: DOCUMENT_WATERMARK_ASSET,
    documentWatermarkOpacity: DOCUMENT_WATERMARK_OPACITY,
    installRegisterButtons: installRegisterButtons
  };
}());
