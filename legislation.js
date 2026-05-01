const state = {
  bills: [],
  filtered: [],
  view: 'cards',
};

const els = {
  status: document.querySelector('#legislation-api-status'),
  resultNote: document.querySelector('#legislation-result-note'),
  grid: document.querySelector('#legislation-grid'),
  table: document.querySelector('#legislation-table'),
  tableBody: document.querySelector('#legislation-table-body'),
  empty: document.querySelector('#legislation-empty-state'),
  search: document.querySelector('#legislation-search'),
  type: document.querySelector('#bill-type-filter'),
  statusFilter: document.querySelector('#bill-status-filter'),
  sponsor: document.querySelector('#bill-sponsor-filter'),
  committee: document.querySelector('#bill-committee-filter'),
  topStatus: document.querySelector('#top-bill-status-filter'),
  topCommittee: document.querySelector('#top-bill-committee-filter'),
  sort: document.querySelector('#bill-sort-filter'),
  clear: document.querySelector('#clear-legislation-button'),
  refresh: document.querySelector('#refresh-legislation-button'),
  export: document.querySelector('#export-legislation-button'),
  statBills: document.querySelector('#stat-bills'),
  statSponsors: document.querySelector('#stat-sponsors'),
  statCommittees: document.querySelector('#stat-committees'),
  statVisible: document.querySelector('#stat-visible-bills'),
};

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.documents)) return payload.documents;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function firstValue(raw, keys, fallback = '') {
  for (const key of keys) {
    const value = key.split('.').reduce((cursor, part) => cursor?.[part], raw);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function normalizeBill(raw) {
  const number = String(firstValue(raw, [
    'bill_number',
    'billNumber',
    'number',
    'document_number',
    'documentNumber',
    'identifier',
    'name',
  ], '')).trim();
  const type = normalizeType(firstValue(raw, ['bill_type', 'billType', 'type', 'document_type.code', 'documentType.code', 'document_type.name', 'documentType.name', 'document_type', 'documentType'], number));
  const title = String(firstValue(raw, [
    'title',
    'short_title',
    'shortTitle',
    'official_title',
    'officialTitle',
    'description',
    'display_title',
    'displayTitle',
  ], number || 'Untitled bill')).trim();
  const sponsor = normalizeSponsor(firstValue(raw, [
    'sponsor',
    'sponsor_name',
    'sponsorName',
    'primary_sponsor',
    'primarySponsor',
    'member',
    'author',
  ], ''));
  const status = String(firstValue(raw, [
    'status',
    'current_status',
    'currentStatus',
    'stage',
    'latest_action.text',
    'latestAction.text',
    'latest_action',
    'latestAction',
  ], 'Status pending')).trim();
  const introducedDate = normalizeDate(firstValue(raw, [
    'introduced_at',
    'introducedAt',
    'introduced_date',
    'introducedDate',
    'date_introduced',
    'dateIntroduced',
    'document_date',
    'documentDate',
    'created_at',
    'createdAt',
    'date',
  ], ''));
  const latestDate = normalizeDate(firstValue(raw, [
    'latest_action.date',
    'latestAction.date',
    'updated_at',
    'updatedAt',
    'last_action_date',
    'lastActionDate',
    'action_date',
    'actionDate',
  ], introducedDate));
  const committees = normalizeStringList(firstValue(raw, [
    'committees',
    'committee_names',
    'committeeNames',
    'referred_committees',
    'referredCommittees',
    'committee',
  ], []));
  const subjects = normalizeStringList(firstValue(raw, [
    'subjects',
    'policy_areas',
    'policyAreas',
    'topics',
    'keywords',
    'terms',
  ], [])).slice(0, 5);
  const url = String(firstValue(raw, [
    'url',
    'html_url',
    'htmlUrl',
    'congress_url',
    'congressUrl',
    'source_url',
    'sourceUrl',
    'file_download_url',
    'fileDownloadUrl',
  ], '')).trim();
  const textUrl = String(firstValue(raw, [
    'file_download_url',
    'fileDownloadUrl',
    'pdf_url',
    'pdfUrl',
    'text_url',
    'textUrl',
    'xml_url',
    'xmlUrl',
  ], '')).trim();
  const id = String(firstValue(raw, ['id', 'uuid', 'document_id', 'documentId'], number || title)).trim();

  return {
    id,
    number: formatBillNumber(number),
    type,
    title,
    sponsor,
    status,
    introducedDate,
    latestDate,
    committees,
    subjects,
    url,
    textUrl,
    raw,
  };
}

function normalizeType(value) {
  const raw = typeof value === 'object' && value
    ? (value.code ?? value.name ?? '')
    : value;
  const text = String(raw || '').toUpperCase().replace(/\./g, '').replace(/\s+/g, '');
  if (text === 'BILL') return 'HR';
  if (text.includes('HJRES')) return 'HJRES';
  if (text.includes('HCONRES')) return 'HCONRES';
  if (text.includes('HRES')) return 'HRES';
  if (text.includes('HR')) return 'HR';
  return text || 'Bill';
}

function formatBillNumber(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(h(?:r|res|jres|conres|conres)?)[\s.-]*(\d+)$/i);
  if (!match) return text;
  const prefix = ({
    hr: 'H.R.',
    hres: 'H.Res.',
    hjres: 'H.J.Res.',
    hconres: 'H.Con.Res.',
  })[match[1].toLowerCase()] || match[1].toUpperCase();
  return `${prefix} ${match[2]}`;
}

function normalizeSponsor(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  return String(value.full_name ?? value.fullName ?? value.name ?? value.display_name ?? value.displayName ?? '').trim();
}

function normalizeStringList(value) {
  const rows = Array.isArray(value) ? value : [value];
  return rows.map((item) => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return item.name ?? item.title ?? item.committee_name ?? item.committeeName ?? item.label ?? '';
  }).filter(Boolean);
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function formatDate(value) {
  if (!value) return 'Date pending';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

function displayNumber(bill) {
  if (bill.number) return bill.number;
  return bill.type && bill.type !== 'Bill' ? bill.type : 'Bill';
}

function billPageHref(label) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  const match = text.match(/^H\.?\s*(Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*(\d+)$/i);
  if (!match) return '';
  const kind = match[1].replace(/\s+/g, ' ').toLowerCase();
  const normalized = ({
    r: 'H.R.',
    res: 'H.Res.',
    'j. res': 'H.J.Res.',
    jres: 'H.J.Res.',
    'con. res': 'H.Con.Res.',
    conres: 'H.Con.Res.',
  })[kind] || `H.${match[1]}.`;
  return `bills/${`${normalized} ${match[2]}`.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-')}.html`;
}

function linkBillRefs(value) {
  const pattern = /\bH\.?\s*(?:Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*\d+\b/gi;
  return escapeHtml(value).replace(pattern, (match) => {
    const href = billPageHref(match);
    return href ? `<a class="bill-ref" href="${escapeHtml(href)}">${escapeHtml(match)}</a>` : escapeHtml(match);
  });
}

function linkBillTitle(title, href) {
  const value = String(title || '');
  if (/\bH\.?\s*(?:Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*\d+\b/i.test(value)) return linkBillRefs(value);
  return href ? `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>` : escapeHtml(value);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function fillSelect(select, values, label) {
  const current = select.value;
  select.innerHTML = `<option value="">${label}</option>`;
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  select.value = values.includes(current) ? current : '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function hydrateFilters() {
  fillSelect(els.type, unique(state.bills.map((bill) => bill.type)), 'All types');
  fillSelect(els.statusFilter, unique(state.bills.map((bill) => bill.status)).slice(0, 80), 'Any status');
  fillSelect(els.topStatus, unique(state.bills.map((bill) => bill.status)).slice(0, 80), 'Any status');
  fillSelect(els.sponsor, unique(state.bills.map((bill) => bill.sponsor)).slice(0, 120), 'Any sponsor');
  const committees = unique(state.bills.flatMap((bill) => bill.committees));
  fillSelect(els.committee, committees, 'Any committee');
  fillSelect(els.topCommittee, committees, 'Any committee');
}

function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  const type = els.type.value;
  const status = els.statusFilter.value || els.topStatus.value;
  const sponsor = els.sponsor.value;
  const committee = els.committee.value || els.topCommittee.value;
  const sort = els.sort.value;

  state.filtered = state.bills.filter((bill) => {
    const haystack = [
      bill.number,
      bill.type,
      bill.title,
      bill.sponsor,
      bill.status,
      bill.introducedDate,
      bill.latestDate,
      ...bill.committees,
      ...bill.subjects,
    ].join(' ').toLowerCase();

    return (!query || haystack.includes(query))
      && (!type || bill.type === type)
      && (!status || bill.status === status)
      && (!sponsor || bill.sponsor === sponsor)
      && (!committee || bill.committees.includes(committee));
  }).sort((a, b) => {
    if (sort === 'number') return displayNumber(a).localeCompare(displayNumber(b), undefined, { numeric: true }) || a.title.localeCompare(b.title);
    if (sort === 'sponsor') return a.sponsor.localeCompare(b.sponsor) || displayNumber(a).localeCompare(displayNumber(b), undefined, { numeric: true });
    if (sort === 'status') return a.status.localeCompare(b.status) || String(b.latestDate).localeCompare(String(a.latestDate));
    return String(b.latestDate || b.introducedDate).localeCompare(String(a.latestDate || a.introducedDate)) || displayNumber(a).localeCompare(displayNumber(b), undefined, { numeric: true });
  });

  render();
}

function render() {
  els.statBills.textContent = state.bills.length.toLocaleString();
  els.statSponsors.textContent = unique(state.bills.map((bill) => bill.sponsor)).length.toLocaleString();
  els.statCommittees.textContent = unique(state.bills.flatMap((bill) => bill.committees)).length.toLocaleString();
  els.statVisible.textContent = state.filtered.length.toLocaleString();
  els.resultNote.textContent = `Showing ${state.filtered.length.toLocaleString()} of ${state.bills.length.toLocaleString()} loaded bill records.`;

  els.empty.hidden = state.filtered.length > 0;
  els.grid.hidden = state.view !== 'cards';
  els.table.style.display = state.view === 'table' ? 'table' : 'none';

  els.grid.innerHTML = state.filtered.slice(0, 240).map(billCard).join('');
  els.tableBody.innerHTML = state.filtered.slice(0, 500).map(billRow).join('');
}

function billCard(bill) {
  const number = displayNumber(bill);
  const href = billPageHref(number);
  const subjects = bill.subjects.length
    ? `<div class="member-focus">${bill.subjects.map((item) => `<span class="focus-chip">${escapeHtml(item)}</span>`).join('')}</div>`
    : '';
  const committees = bill.committees.length
    ? `<p class="bill-committees">${escapeHtml(bill.committees.slice(0, 3).join(' · '))}</p>`
    : '';
  const links = [
    bill.url ? `<a class="link-button" href="${escapeHtml(bill.url)}" target="_blank" rel="noopener">Source</a>` : '',
    bill.textUrl ? `<a class="link-button muted" href="${escapeHtml(bill.textUrl)}" target="_blank" rel="noopener">Text</a>` : '',
  ].filter(Boolean).join('');

  return `
    <article class="bill-card">
      <div class="bill-card-top">
        ${href ? `<a class="bill-number" href="${escapeHtml(href)}">${escapeHtml(number)}</a>` : `<span class="bill-number">${escapeHtml(number)}</span>`}
        <span class="bill-date">${escapeHtml(formatDate(bill.latestDate || bill.introducedDate))}</span>
      </div>
      <h3>${linkBillTitle(bill.title, href)}</h3>
      <p class="bill-sponsor">${escapeHtml(bill.sponsor || 'Sponsor pending')}</p>
      <p class="bill-status">${linkBillRefs(bill.status || 'Status pending')}</p>
      ${committees}
      ${subjects}
      <div class="bill-card-footer">
        ${links || '<span class="link-button muted">Detail page planned</span>'}
      </div>
    </article>
  `;
}

function billRow(bill) {
  const number = displayNumber(bill);
  const href = billPageHref(number);
  return `
    <tr>
      <td>${href ? `<a class="link-button" href="${escapeHtml(href)}">${escapeHtml(number)}</a>` : escapeHtml(number)}</td>
      <td>${linkBillTitle(bill.title, href)}</td>
      <td>${escapeHtml(bill.sponsor || 'Sponsor pending')}</td>
      <td>${linkBillRefs(bill.status || 'Status pending')}</td>
      <td>${escapeHtml(formatDate(bill.latestDate || bill.introducedDate))}</td>
      <td>${bill.url ? `<a class="link-button" href="${escapeHtml(bill.url)}" target="_blank" rel="noopener">Source</a>` : ''}</td>
    </tr>
  `;
}

async function loadLegislation() {
  els.status.textContent = 'Loading';

  try {
    const apiUrl = window.location.protocol === 'file:'
      ? 'http://127.0.0.1:8771/api/legislation'
      : '/api/legislation';
    const response = await fetch(apiUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    state.bills = asArray(payload).map(normalizeBill);
    state.filtered = [...state.bills];
    hydrateFilters();
    applyFilters();
    els.status.textContent = `${state.bills.length.toLocaleString()} loaded`;
  } catch (error) {
    els.status.textContent = 'API unavailable';
    els.resultNote.textContent = `Could not load CongressLink legislation data: ${error.message}. Run through the local POPVOX server with the API token configured.`;
    els.empty.hidden = false;
    console.error(error);
  }
}

function bindEvents() {
  [els.search, els.type, els.statusFilter, els.sponsor, els.committee, els.topStatus, els.topCommittee, els.sort].forEach((input) => {
    input.addEventListener('input', applyFilters);
    input.addEventListener('change', applyFilters);
  });

  document.querySelectorAll('[data-filter="type"]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-filter="type"]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      els.type.value = button.dataset.value || '';
      applyFilters();
    });
  });

  document.querySelectorAll('[data-bill-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.billView;
      document.querySelectorAll('[data-bill-view]').forEach((item) => item.classList.toggle('active', item.dataset.billView === state.view));
      render();
    });
  });

  els.clear.addEventListener('click', () => {
    els.search.value = '';
    els.type.value = '';
    els.statusFilter.value = '';
    els.sponsor.value = '';
    els.committee.value = '';
    els.topStatus.value = '';
    els.topCommittee.value = '';
    document.querySelectorAll('[data-filter="type"]').forEach((item) => item.classList.toggle('active', !item.dataset.value));
    applyFilters();
  });

  els.refresh.addEventListener('click', loadLegislation);

  els.export.addEventListener('click', () => {
    const rows = state.filtered.map((bill) => ({
      bill: displayNumber(bill),
      title: bill.title,
      sponsor: bill.sponsor,
      status: bill.status,
      latestDate: bill.latestDate,
      committees: bill.committees.join('; '),
      source: bill.url,
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'popvox-legislation-explorer-export.json';
    link.click();
    URL.revokeObjectURL(url);
  });
}

bindEvents();
loadLegislation();
