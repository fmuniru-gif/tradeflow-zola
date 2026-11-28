/* Generates a document from a temporary form. No customer data is written to TradeFlow storage. */
(function () {
  'use strict';

  const formId = 'bnplUndertakingForm';
  const money = new Intl.NumberFormat('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra'
  });
  const formatDate = date => dateFormat.format(new Date(date + 'T00:00:00Z'));
  const amount = pesewas => money.format(pesewas / 100);
  function canGenerate() {
    if (!session.cashier) return false;
    const auth = ZEZMS.staffAuth;
    const role = auth?.getContext().role;
    return (role === 'OWNER' || role === 'ADMIN') && auth.can('MANAGE_DOCUMENTS');
  }

  function cents(value) {
    return value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : NaN;
  }

  function paymentTerms(fields) {
    const date = fields.date.value;
    const agreement = new Date(date + 'T00:00:00Z');
    const total = cents(fields.total.value);
    const initial = cents(fields.initial.value);
    const minimum = Math.round(total * 0.60);
    const maximum = Math.round(total * 0.70);
    const dueDate = Number.isFinite(agreement.getTime())
      ? new Date(Date.UTC(agreement.getUTCFullYear(), agreement.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
      : '';
    return { date, dueDate, day: agreement.getUTCDate(), total, initial, minimum, maximum, balance: total - initial };
  }

  function field(name, label, attributes) {
    const id = 'bnpl-' + name;
    return `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" ${attributes}></div>`;
  }

  function currentProductNames() {
    const period = getLatestMonth();
    const names = new Set();
    for (const row of DB.stockRows || []) {
      if (!row || Number(row.year) !== Number(period.year) || Number(row.month) !== Number(period.month)) continue;
      const product = currentProductMasterForStockRow(row);
      if (product?.name) names.add(product.name);
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  }

  function productOptionsHTML(names) {
    return names.map(name => `<option value="${escAttr(name)}"></option>`).join('');
  }

  function refreshProducts(form) {
    const list = form.elements.product.list;
    const names = currentProductNames();
    if (list.options.length !== names.length || names.some((name, index) => name !== list.options[index].value)) {
      list.innerHTML = productOptionsHTML(names);
    }
  }

  function viewHTML() {
    if (!canGenerate()) return '';
    return `<section class="card" style="max-width:850px">
      <form id="${formId}" autocomplete="off" method="dialog">
        <p class="muted">For customers on a regular payroll. The offer opens on the 20th. Pay 60–70% upfront and the balance by the last day of the same month.</p>
        <h3>Customer details</h3>
        <div class="grid g2">
          ${field('customer', 'Full name', 'maxlength="100" required')}
          ${field('phone', 'Telephone number', 'type="tel" maxlength="30" required')}
          ${field('employer', 'Employer / place of work', 'maxlength="120" required')}
          ${field('card', 'Ghana Card number', 'maxlength="30" spellcheck="false" required')}
        </div>
        <h3>Product and payment</h3>
        <div class="grid g2">
          ${field('product', 'Product / model', 'list="bnpl-products" maxlength="120" required')}
          <datalist id="bnpl-products">${productOptionsHTML(currentProductNames())}</datalist>
          ${field('serial', 'Serial number (optional)', 'maxlength="65" spellcheck="false"')}
          ${field('date', 'Agreement date', `type="date" min="2000-01-01" max="9998-12-31" value="${new Date().toISOString().slice(0, 10)}" required`)}
          ${field('receipt', 'Sale receipt reference (optional)', 'maxlength="65" spellcheck="false"')}
          ${field('total', 'Regular selling price / agreed total (GH₵)', 'type="number" min="0.01" max="99999999.99" step="0.01" required')}
          ${field('initial', 'Upfront payment (GH₵)', 'type="number" min="0.01" max="99999999.99" step="0.01" required')}
        </div>
        <p class="muted">Choose a product from the open month to load its selling price. You can edit the amount to match the regular price agreed at the shop.</p>
        <p data-bnpl-payment aria-live="polite"></p>
        <p class="muted">Customer details appear in the PDF and are kept only in this form until you generate it or leave the page. Store the signed copies securely.</p>
        <div class="row">
          <button class="btn" type="submit">Generate A4 PDF</button>
          <button class="btn ghost" type="reset">Clear form</button>
        </div>
        <p data-bnpl-status role="status"></p>
      </form>
    </section>`;
  }

  function updatePayment(form) {
    const terms = paymentTerms(form.elements);
    const parts = [];
    if (terms.total > 0) parts.push('Upfront range GH₵ ' + amount(terms.minimum) + ' to ' + amount(terms.maximum));
    if (terms.initial > 0 && terms.balance >= 0) parts.push('Balance GH₵ ' + amount(terms.balance));
    if (terms.dueDate) parts.push('Due ' + formatDate(terms.dueDate));
    form.querySelector('[data-bnpl-payment]').textContent = parts.join(' · ');
  }

  function readAgreement(fields) {
    const details = Object.fromEntries(['customer', 'phone', 'employer', 'card', 'product', 'serial', 'receipt'].map(
      fieldName => [fieldName, fields[fieldName].value.trim().replace(/\s+/g, ' ')]
    ));
    if (['customer', 'phone', 'employer', 'card', 'product'].some(key => !details[key])) {
      throw Error('Enter the customer’s full name, telephone, workplace, Ghana Card number and product.');
    }
    const digits = details.phone.replace(/\D/g, '');
    if (!/^\+?[\d() -]+$/.test(details.phone) || digits.length < 7 || digits.length > 15) {
      throw Error('Enter a valid telephone number.');
    }
    const terms = paymentTerms(fields);
    if (!terms.dueDate || terms.day < 20) throw Error('Set the agreement date from the 20th through the last day of the offer month.');
    if (!(terms.total > 0) || !(terms.initial > 0 && terms.balance > 0 &&
        terms.initial >= terms.minimum && terms.initial <= terms.maximum)) {
      throw Error('Set the upfront payment within 60–70% of the selling price.');
    }
    const ref = 'BNPL-' + terms.date.replace(/-/g, '') + '-' + crypto.randomUUID().slice(0, 13).replace('-', '').toUpperCase();
    return { ...details, ...terms, ref, representative: session.cashier };
  }

  async function buildPDF(agreement) {
    const { SimplePDF, loadDocumentWatermark } = ZEZMS.pdfExport;
    const brand = ZEZMS.documentBranding;
    const watermark = await loadDocumentWatermark();
    const pdf = new SimplePDF({ width: 595.28, height: 841.89 }, { margin: 40, watermark });
    const measure = document.createElement('canvas').getContext('2d');
    const nativeDraw = pdf.drawText.bind(pdf);
    const unicode = /[^\x20-\x7E]/;
    const font = (size, bold) => (bold ? 'bold ' : '') + size + 'px Arial, sans-serif';
    function widthOf(line, size, bold) {
      if (!unicode.test(line)) return brand.pdfTextWidth(line, size, bold);
      measure.font = font(size, bold);
      return measure.measureText(line).width;
    }
    // Keep names intact where the standard PDF fonts cannot represent the spelling.
    pdf.drawText = function (value, x, top, size, bold, align) {
      const line = String(value);
      if (!unicode.test(line)) return nativeDraw(line, x, top, size, bold, align);
      const scale = 4;
      const canvas = document.createElement('canvas');
      const width = Math.ceil(widthOf(line, size, bold) + 4);
      const height = Math.ceil(size * 1.5);
      canvas.width = Math.ceil(width * scale / 8) * 8;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.font = font(size, bold);
      ctx.fillText(line, 2, size);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const mask = [];
      for (let index = 3; index < pixels.length; index += 32) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | (pixels[index + 4 * bit] >= 128 ? 1 : 0);
        mask.push(byte.toString(16).padStart(2, '0'));
      }
      const actualText = 'FEFF' + line.split('').map(char => char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
      const aligned = align === 'center' ? x - (width - 4) / 2 : align === 'right' ? x - (width - 4) : x;
      // The invisible text anchor lets PDF readers extract the value in ActualText.
      pdf.command('/Span << /ActualText <' + actualText + '> >> BDC\nq BT /F1 ' + size
        + ' Tf 3 Tr ' + aligned + ' ' + pdf.baseline(top, size) + ' Td (x) Tj ET Q\nEMC\nq 0 g '
        + (canvas.width / scale) + ' 0 0 ' + height + ' ' + (aligned - 2) + ' ' + (pdf.height - top - height)
        + ' cm\nBI /W ' + canvas.width + ' /H ' + canvas.height + ' /IM true /D [1 0] /F /AHx ID\n'
        + mask.join('') + '>\nEI\nQ');
    };
    const left = pdf.margin;
    const right = pdf.width - left;
    const span = right - left;

    function write(value, x = left, maxWidth = span, size = 10, bold = false) {
      let line = '';
      for (const character of String(value)) {
        if (line && widthOf(line + character, size, bold) > maxWidth) {
          const split = line.lastIndexOf(' ');
          pdf.drawText(split < 0 ? line : line.slice(0, split), x, pdf.y, size, bold);
          pdf.y += size + 3;
          line = split < 0 ? '' : line.slice(split + 1);
        }
        if (line || character !== ' ') line += character;
      }
      if (line) {
        pdf.drawText(line, x, pdf.y, size, bold);
        pdf.y += size + 3;
      }
    }

    function item(label, value) {
      pdf.drawText(label, left, pdf.y, 10, true);
      write(value, left + 122, span - 122);
      pdf.y += 3;
    }

    const business = DB.business || BUSINESS;
    brand.pdfHeader(pdf);
    write(business.name || 'ZOLA ELECTRONICS ZONE', left, span, 14, true);
    write([business.address, business.tel].filter(Boolean).join('  |  '), left, span, 9);
    pdf.y += 8;
    pdf.line(left, pdf.y, right, pdf.y, 0.24);
    pdf.y += 12;
    pdf.heading('BUY NOW, PAY LATER UNDERTAKING', 18);
    item('Undertaking reference', agreement.ref);
    item('Agreement date', formatDate(agreement.date));
    pdf.y += 7;
    pdf.heading('Customer and goods', 12);
    item('Full name', agreement.customer);
    item('Telephone', agreement.phone);
    item('Employer / workplace', agreement.employer);
    item('Ghana Card number', agreement.card);
    item('Product / model', agreement.product);
    if (agreement.serial) item('Serial number', agreement.serial);
    if (agreement.receipt) item('Sale receipt reference', agreement.receipt);
    pdf.y += 8;
    pdf.heading('Payment schedule', 12);
    pdf.table(['Regular price (GHS)', 'Upfront payment (GHS)', 'Balance due (GHS)', 'Pay balance by'],
      [[amount(agreement.total), amount(agreement.initial), amount(agreement.balance), formatDate(agreement.dueDate)]],
      [span / 4, span / 4, span / 4, span / 4]);

    const terms = [
      'The customer confirms the details above and that they are on a regular payroll. The customer agrees to pay the upfront amount before taking the goods and to pay the remaining balance to Zola Electronics Zone by the due date shown above.',
      'Zola Electronics Zone agrees to release the goods after receiving the upfront payment. The total is the regular selling price, split into two payments with no extra charge for using the offer.',
      'This undertaking records the agreement. Keep the signed undertaking and the separate receipts for payments made. Each party should retain a signed copy.'
    ];
    terms.forEach(term => { write(term); pdf.y += 6; });
    pdf.y += 9;
    write(agreement.representative, left, (span - 35) / 2, 9, true);
    pdf.signatures('For Zola Electronics Zone', 'Customer signature', { approved: true });
    const half = (span - 35) / 2;
    pdf.drawText('Date: ______________________', left + half / 2, pdf.y + 2, 8.5, false, 'center');
    pdf.drawText('Date: ______________________', right - half / 2, pdf.y + 2, 8.5, false, 'center');
    return pdf.finish();
  }

  function clearForm() {
    document.getElementById(formId)?.closest('section')?.remove();
  }

  document.addEventListener('input', event => {
    const form = event.target.form;
    if (form?.id !== formId || !canGenerate()) return;
    if (event.target === form.elements.product) {
      const name = event.target.value;
      if (Array.from(event.target.list.options).some(option => option.value === name)) {
        const price = getBaseUnitPrice(name);
        form.elements.total.value = price > 0 ? price.toFixed(2) : '';
      }
    }
    updatePayment(form);
  });

  document.addEventListener('reset', event => {
    if (event.target.id !== formId) return;
    event.target.querySelector('[data-bnpl-status]').textContent = '';
    queueMicrotask(() => updatePayment(event.target));
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.id !== formId) return;
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled || !canGenerate() || currentView !== 'bnpl-undertaking') return;
    const status = form.querySelector('[data-bnpl-status]');
    button.disabled = true;
    try {
      const agreement = readAgreement(form.elements);
      const bytes = await buildPDF(agreement);
      if (!form.isConnected || !canGenerate() || currentView !== 'bnpl-undertaking') return;
      const href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = agreement.ref + '.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
      form.reset();
      status.textContent = 'PDF generated. Open the downloaded file and print it on A4 paper for both parties to sign.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  ZEZMS.bnplUndertaking = Object.freeze({ canGenerate, viewHTML, refreshProducts, clearForm });
}());
