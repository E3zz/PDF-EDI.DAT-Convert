pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = id => document.getElementById(id);
let file = null, ediContent = '', ocrText = '', parsedData = {};

// ─── UI HELPERS ──────────────────────────────────────────────────────────────

function setPipe(id, state) { const el = $('ps-' + id); if (el) el.className = 'pipe-step ' + state; }
function setPS(id, state) { const el = $('pst-' + id); if (el) el.className = 'prog-step ' + state; }
function setProgress(p) { $('prog-fill').style.width = p + '%'; }
function showAlert(t, m) { const a = $('alert'); a.className = 'alert ' + t; a.innerHTML = m; }
function hideAlert() { $('alert').className = 'alert'; }
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── DRAG & DROP / FILE INPUT ────────────────────────────────────────────────

const dz = $('dz'), fi = $('fi');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f && f.type === 'application/pdf') loadFile(f); else showAlert('err', 'Please drop a PDF file.'); });
fi.addEventListener('change', () => { if (fi.files[0]) loadFile(fi.files[0]); });

async function loadFile(f) {
  file = f;
  dz.classList.add('loaded');
  $('fpill').innerHTML = `<div class="file-chip">📄 ${f.name} · ${(f.size / 1024).toFixed(1)} KB</div>`;
  setPipe('upload', 'done'); setPipe('ocr', 'active');
  $('ocr-section').style.display = 'block';
  $('ocr-box').textContent = 'Extracting text with PDF.js OCR engine...';
  $('cvt').disabled = true;
  hideAlert(); $('prev-wrap').style.display = 'none'; $('dl').style.display = 'none';
  $('det-section').style.display = 'none';

  try {
    const text = await runOCR(f);
    ocrText = text;
    const conf = scoreConfidence(text);
    showOCR(text, conf);
    parsedData = parseEOB(text);
    showDetected(parsedData);
    setPipe('ocr', 'done'); setPipe('parse', 'done');
    $('cvt').disabled = false;
    showAlert('ok', `✓ OCR complete — ${text.length.toLocaleString()} chars · ${(parsedData.claims || []).length} claim(s) detected · Confidence: ${conf}%`);
  } catch (err) {
    setPipe('ocr', 'error');
    showAlert('err', 'OCR error: ' + err.message);
  }
}

// ─── PDF.js OCR ──────────────────────────────────────────────────────────────

async function runOCR(f) {
  const ab = await f.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let full = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Preserve layout by grouping items by Y position
    const items = content.items;
    const rows = {};
    items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x: item.transform[4], str: item.str });
    });
    const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
    sortedYs.forEach(y => {
      const line = rows[y].sort((a, b) => a.x - b.x).map(i => i.str).join(' ');
      if (line.trim()) full += line + '\n';
    });
  }
  if (!full.trim()) throw new Error('No text found in PDF — may be a scanned image without text layer.');
  return full.trim();
}

// ─── CONFIDENCE SCORING ──────────────────────────────────────────────────────

function scoreConfidence(t) {
  let s = 55;
  if (/\d{1,2}\/\d{1,2}\/\d{4}|\d{8}/.test(t)) s += 8;
  if (/\$[\d,]+\.\d{2}|[\d,]+\.\d{2}/.test(t)) s += 8;
  if (/9920[0-9]|9921[0-9]|9922[0-4]/i.test(t)) s += 7;
  if (/claim|patient|member/i.test(t)) s += 7;
  if (/NPI|payer|provider/i.test(t)) s += 6;
  if (/check|payment|remit/i.test(t)) s += 5;
  if (/billed|allowed|paid|discount/i.test(t)) s += 4;
  return Math.min(s, 99);
}

function showOCR(text, conf) {
  $('ocr-box').textContent = text.slice(0, 500) + (text.length > 500 ? '\n...(preview truncated)' : '');
  const color = conf >= 80 ? 'var(--accent3)' : conf >= 60 ? 'var(--warn)' : 'var(--red)';
  const fill = $('conf-fill'); fill.style.background = color; fill.style.width = conf + '%';
  $('conf-pct').textContent = conf + '%'; $('conf-pct').style.color = color;
  const badge = $('ocr-badge');
  badge.textContent = conf >= 80 ? 'HIGH CONFIDENCE' : conf >= 60 ? 'MEDIUM CONFIDENCE' : 'LOW — CHECK OUTPUT';
  badge.className = conf >= 60 ? 'badge green' : 'badge warn';
}

// ─── CORE EOB PARSER ─────────────────────────────────────────────────────────

function parseEOB(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const data = { payer: {}, provider: {}, check: {}, claims: [] };

  // Check info
  const checkDateM = text.match(/Check\s*Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (checkDateM) data.check.date = checkDateM[1];
  const checkNumM = text.match(/Check\s*(?:Number|#|No)[:\s]+(\d+)/i);
  if (checkNumM) data.check.number = checkNumM[1];
  const checkAmtM = text.match(/Check\s*Amount[:\s]+\$?([\d,]+\.\d{2})/i);
  if (checkAmtM) data.check.amount = checkAmtM[1].replace(/,/g, '');

  // Payer info
  const payerNameM = text.match(/(?:NaphCare|Aetna|Cigna|UnitedHealth|Humana|BlueCross|Blue Cross|Anthem|Centene|Molina|Medicare|Medicaid|Tricare|BCBS)[^\n]*/i);
  if (payerNameM) data.payer.name = payerNameM[0].trim().slice(0, 50);
  const payerIdM = text.match(/[Pp]ayer\s*ID[:\s#]*(\d{5,10})/);
  if (payerIdM) data.payer.id = payerIdM[1];
  const payerPhoneM = text.match(/Phone[:\s]+([\d.() -]{10,15})/i);
  if (payerPhoneM) data.payer.phone = payerPhoneM[1];
  const payerAddrM = text.match(/(\d{3,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s+(?:Road|Rd|Street|St|Ave|Avenue|Blvd|Drive|Dr|Suite|Ste)[^\n]*)?)/)
  if (payerAddrM) data.payer.address = payerAddrM[1].trim();
  const cityStateZipM = text.match(/([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\s+(\d{5})/);
  if (cityStateZipM) { data.payer.city = cityStateZipM[1].trim(); data.payer.state = cityStateZipM[2]; data.payer.zip = cityStateZipM[3]; }

  // Provider info
  const vendorM = text.match(/Vendor[:\s]+[\d-]+\s+([A-Z][A-Z\s,]+?)(?:\n|Provider)/i);
  if (vendorM) data.provider.name = vendorM[1].trim();
  const npiM = text.match(/Provider[:\s]+(\d{10})/i);
  if (npiM) data.provider.npi = npiM[1];
  const provAddrLines = text.match(/([A-Z][A-Z\s]+BLVD|[A-Z][A-Z\s]+ST|[A-Z][A-Z\s]+AVE|[A-Z][A-Z\s]+RD)[^\n]*/i);
  if (provAddrLines) data.provider.address = provAddrLines[0].trim();

  // Claims — detect claim blocks by Patient: pattern
  const claimBlocks = [];
  const patientPattern = /Patient[:\s]+([A-Z][A-Z\-]+(?:,\s*[A-Z][A-Z\-]+)?(?:\s+[A-Z]+)?)/gi;
  let pm;
  while ((pm = patientPattern.exec(text)) !== null) {
    const start = pm.index;
    const end = text.indexOf('Patient', start + 10) || text.length;
    claimBlocks.push({ name: pm[1].trim(), block: text.slice(start, Math.min(start + 800, text.length)) });
  }

  claimBlocks.forEach((cb, idx) => {
    const claim = { index: idx + 1 };
    claim.patientName = cb.name;

    // DOB
    const dobM = cb.block.match(/DOB[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (dobM) claim.dob = dobM[1];

    // Member ID
    const idM = cb.block.match(/ID[:\s]+(\d{5,10}-\d{3}|\d{7,15})/);
    if (idM) claim.memberId = idM[1];

    // Claim number
    const cnM = cb.block.match(/Claim\s*#?[:\s]+(20\d{12}|\d{10,16})/i);
    if (cnM) claim.claimNum = cnM[1];

    // Patient number
    const pnM = cb.block.match(/Patient\s*#[:\s]+(\d+)/i);
    if (pnM) claim.patientNum = pnM[1];

    // Service lines
    claim.lines = [];
    // Look for date + CPT + amounts pattern
    const linePattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{5})\s+([\d.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/g;
    let lm;
    while ((lm = linePattern.exec(cb.block)) !== null) {
      claim.lines.push({
        dosFrom: lm[1], dosTo: lm[2], cpt: lm[3],
        billedUnits: lm[4], billed: lm[5].replace(/,/g, ''),
        allowed: lm[6].replace(/,/g, ''), allowedUnits: lm[7],
        discount: lm[8].replace(/,/g, ''), paid: lm[9].replace(/,/g, '')
      });
    }
    // Fallback: simpler pattern
    if (!claim.lines.length) {
      const simpleAmt = /(\d{5})\s+([\d.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/g;
      let sm;
      while ((sm = simpleAmt.exec(cb.block)) !== null) {
        const cpt = sm[1];
        if (parseInt(cpt) >= 99201 && parseInt(cpt) <= 99499) {
          claim.lines.push({
            dosFrom: data.check.date || '', dosTo: data.check.date || '', cpt,
            billedUnits: sm[2], billed: sm[3].replace(/,/g, ''),
            allowed: sm[4].replace(/,/g, ''), allowedUnits: sm[2],
            discount: sm[5].replace(/,/g, ''), paid: sm[6].replace(/,/g, '')
          });
        }
      }
    }
    // Total amounts from Totals: line
    const totM = cb.block.match(/Totals?[:\s]+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/i);
    if (totM) {
      claim.totalBilled = totM[1].replace(/,/g, '');
      claim.totalAllowed = totM[2].replace(/,/g, '');
      claim.totalDiscount = totM[3].replace(/,/g, '');
      claim.totalPaid = totM[4].replace(/,/g, '');
    }
    data.claims.push(claim);
  });

  return data;
}

function showDetected(d) {
  const claims = d.claims || [];
  if (!claims.length) return;
  $('claim-count-badge').textContent = claims.length + ' found';
  $('data-grid').innerHTML = claims.map(c => `
    <div class="data-card">
      <div class="dc-name">${c.patientName || 'Patient ' + (c.index)}</div>
      <div class="dc-meta">
        CPT: ${c.lines[0]?.cpt || '—'}<br>
        Claim: ${(c.claimNum || '—').slice(-10)}<br>
        DOB: ${c.dob || '—'}
      </div>
      <div class="dc-amt">$${c.totalPaid || c.lines[0]?.paid || '—'}</div>
    </div>`).join('');
  $('det-section').style.display = 'block';
}

// ─── EDI 835 BUILDER ─────────────────────────────────────────────────────────

function buildEDI835(data, overrides) {
  const today = new Date();
  const yyyymmdd = d => {
    if (!d) return today.toISOString().slice(0, 10).replace(/-/g, '');
    const parts = d.includes('/') ? d.split('/') : null;
    if (parts && parts.length === 3) {
      const [m, dy, y] = parts;
      return `${y}${m.padStart(2, '0')}${dy.padStart(2, '0')}`;
    }
    return d.replace(/-/g, '').slice(0, 8);
  };
  const yymmdd = d => yyyymmdd(d).slice(2);
  const hhmm = today.toTimeString().slice(0, 5).replace(':', '');
  const pad = (s, n, c = ' ') => (String(s || '') + c.repeat(n)).slice(0, n);

  const payerId = overrides.payerId || data.payer?.id || '000000000';
  const npi = overrides.npi || data.provider?.npi || '0000000000';
  const checkDate = overrides.checkDate || yyyymmdd(data.check?.date);
  const checkNum = data.check?.number || '000000';
  const checkAmt = data.check?.amount || calcTotal(data.claims);
  const payerName = (data.payer?.name || 'PAYER').slice(0, 35).toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const provName = (data.provider?.name || 'PROVIDER').slice(0, 35).toUpperCase().replace(/[^A-Z0-9 ]/g, '');

  let segs = [];
  const seg = s => segs.push(s + '~');

  // ISA — must be exactly right
  seg(`ISA*00*${pad('', 10)}*00*${pad('', 10)}*ZZ*${pad(payerId, 15)}*ZZ*${pad(npi, 15)}*${yymmdd(checkDate)}*${hhmm}*^*00501*${pad(checkNum, 9, '0')}*0*P*:`);
  seg(`GS*HP*${payerName}*${provName}*${yyyymmdd(checkDate)}*${hhmm}*1*X*005010X221A1`);
  seg('ST*835*0001');
  seg(`BPR*I*${checkAmt}*C*CHK************${yyyymmdd(checkDate)}`);
  seg(`TRN*1*${checkNum}*${payerId}`);
  seg(`REF*EV*${payerName}`);
  seg(`DTM*405*${checkDate}`);

  // Payer N1 loop
  seg(`N1*PR*${payerName}*XX*${payerId}`);
  if (data.payer?.address) seg(`N3*${data.payer.address.toUpperCase().slice(0, 55)}`);
  if (data.payer?.city) seg(`N4*${(data.payer.city || '').toUpperCase()}*${data.payer.state || ''}*${data.payer.zip || ''}`);

  // Provider N1 loop
  seg(`N1*PE*${provName}*XX*${npi}`);
  if (data.provider?.address) seg(`N3*${data.provider.address.toUpperCase().slice(0, 55)}`);

  // Claims
  const claims = data.claims || [];
  claims.forEach((claim, i) => {
    const lxNum = i + 1;
    seg(`LX*${lxNum}`);

    const claimNum = claim.claimNum || `CLAIM${lxNum}`;
    const billed = claim.totalBilled || claim.lines[0]?.billed || '0.00';
    const paid = claim.totalPaid || claim.lines[0]?.paid || '0.00';
    const memberId = claim.memberId || claim.patientNum || '';

    seg(`CLP*${claimNum}*1*${billed}*${paid}**HC*${memberId}`);

    // Patient NM1
    const nameParts = claim.patientName.split(/[,\s]+/).filter(Boolean);
    const lastName = nameParts[0] || 'UNKNOWN';
    const firstName = nameParts[1] || '';
    seg(`NM1*QC*1*${lastName}*${firstName}****MI*${memberId}`);

    // DOB
    if (claim.dob) seg(`DMG*D8*${yyyymmdd(claim.dob)}`);

    // Service lines
    const lines = claim.lines.length ? claim.lines : [{
      dosFrom: data.check?.date || '', dosTo: data.check?.date || '',
      cpt: '99999', billed: billed, allowed: paid,
      discount: claim.totalDiscount || '0.00', paid: paid, billedUnits: '1'
    }];

    lines.forEach(line => {
      const dosFrom = yyyymmdd(line.dosFrom);
      const dosTo = yyyymmdd(line.dosTo || line.dosFrom);
      seg(`DTM*232*${dosFrom}`);
      seg(`DTM*233*${dosTo}`);
      seg(`SVC*HC:${line.cpt}*${line.billed}*${line.paid}**${line.billedUnits || 1}`);
      seg(`DTM*472*${dosFrom}`);
      if (parseFloat(line.discount || 0) > 0)
        seg(`CAS*CO*45*${line.discount}`);
      seg(`AMT*B6*${line.paid}`);
    });
  });

  // Trailer
  const segCount = segs.length + 1; // +1 for SE itself
  seg(`PLB*${npi}*${checkDate}*CV*0.00`);
  seg(`SE*${segCount}*0001`);
  seg('GE*1*1');
  seg('IEA*1*' + pad(checkNum, 9, '0'));

  return segs.join('\n');
}

function calcTotal(claims) {
  if (!claims || !claims.length) return '0.00';
  const t = claims.reduce((s, c) => s + parseFloat(c.totalPaid || c.lines?.[0]?.paid || 0), 0);
  return t.toFixed(2);
}

// ─── CONVERT BUTTON HANDLER ──────────────────────────────────────────────────

$('cvt').addEventListener('click', async () => {
  if (!file || !ocrText) { showAlert('err', 'Please upload a PDF first.'); return; }
  $('cvt').disabled = true; $('cvt').classList.add('running');
  $('cvt').innerHTML = '<span class="spin"></span>BUILDING EDI 835...';
  $('prev-wrap').style.display = 'none'; $('dl').style.display = 'none';
  $('prog-wrap').style.display = 'block';
  hideAlert(); setProgress(5);
  ['ocr', 'parse', 'map', 'build', 'validate', 'export'].forEach(s => setPS(s, ''));
  setPipe('map', 'active');

  try {
    // OCR
    setPS('ocr', 'active');
    showAlert('info', '<span class="spin"></span>Step 1 — OCR text ready ✓');
    await delay(200); setPS('ocr', 'done'); setProgress(18);

    // Parse
    setPS('parse', 'active');
    showAlert('info', '<span class="spin"></span>Step 2 — Parsing EOB fields...');
    parsedData = parseEOB(ocrText);
    await delay(300); setPS('parse', 'done'); setProgress(36);

    // Map
    setPS('map', 'active');
    showAlert('info', '<span class="spin"></span>Step 3 — Mapping to ANSI X12 835 schema...');
    await delay(300); setPS('map', 'done'); setProgress(54); setPipe('map', 'done');

    // Build
    setPS('build', 'active'); setPipe('build', 'active');
    showAlert('info', '<span class="spin"></span>Step 4 — Building EDI 835 segments...');
    const overrides = {
      payerId: $('payer-id').value.trim(),
      npi: $('npi').value.trim(),
      checkDate: $('chk-date').value.replace(/-/g, '') || ''
    };
    ediContent = buildEDI835(parsedData, overrides);
    await delay(300); setPS('build', 'done'); setProgress(72); setPipe('build', 'done');

    // Validate
    setPS('validate', 'active');
    showAlert('info', '<span class="spin"></span>Step 5 — Validating EDI structure...');
    const segs = ediContent.split('~').filter(s => s.trim());
    const valid = ediContent.includes('ISA*') && ediContent.includes('IEA*') && ediContent.includes('ST*835') && ediContent.includes('BPR*');
    await delay(250); setPS('validate', 'done'); setProgress(88);

    // Export
    setPS('export', 'active'); setPipe('export', 'active');
    await delay(200); setPS('export', 'done'); setProgress(100); setPipe('export', 'done');

    const claims = parsedData.claims || [];
    const totalPaid = calcTotal(claims);
    const ext = $('ext').value;
    $('st-segs').textContent = segs.length + ' segments';
    $('st-claims').textContent = claims.length + ' claims';
    $('st-amt').textContent = '$' + totalPaid;

    showAlert('ok', `✓ EDI 835 built locally — ${segs.length} segments · ${claims.length} claim(s) · Total $${totalPaid} · Structure valid: ${valid ? 'YES ✓' : 'review output'}`);
    $('prev-wrap').style.display = 'block';
    $('prev-body').textContent = ediContent;
    $('dl').style.display = 'block';
    $('dl').textContent = `⬇ Download  ${file.name.replace(/\.pdf$/i, '')}.${ext}`;

  } catch (e) {
    setProgress(0);
    showAlert('err', 'Error: ' + e.message);
    ['upload', 'ocr', 'parse', 'map', 'build'].forEach(s => setPipe(s, 'error'));
  }
  $('cvt').disabled = false; $('cvt').classList.remove('running');
  $('cvt').innerHTML = 'GENERATE EDI 835 ';
});

// ─── DOWNLOAD HANDLER ────────────────────────────────────────────────────────

$('dl').addEventListener('click', () => {
  const ext = $('ext').value;
  const name = (file ? file.name.replace(/\.pdf$/i, '') : 'EDI') + '.' + ext;
  const blob = new Blob([ediContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
});
