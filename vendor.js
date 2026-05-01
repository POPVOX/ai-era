const summary = window.HOUSE_EXPENDITURE_DATA;
const params = new URLSearchParams(window.location.search);
const slug = params.get('v') || '';
const vendor = summary.vendors.find((item) => item.slug === slug);

const els = {
  name: document.querySelector('#vendor-detail-name'),
  summary: document.querySelector('#vendor-detail-summary'),
  context: document.querySelector('#vendor-detail-context'),
  total: document.querySelector('#vendor-detail-total'),
  count: document.querySelector('#vendor-detail-count'),
  clients: document.querySelector('#vendor-detail-clients'),
  periods: document.querySelector('#vendor-detail-periods'),
  search: document.querySelector('#vendor-transaction-search'),
  clientSearch: document.querySelector('#vendor-client-search'),
  period: document.querySelector('#vendor-transaction-period'),
  sort: document.querySelector('#vendor-transaction-sort'),
  profile: document.querySelector('#vendor-detail-profile'),
  heading: document.querySelector('#vendor-transaction-heading'),
  visible: document.querySelector('#vendor-transaction-visible'),
  note: document.querySelector('#vendor-transaction-note'),
  body: document.querySelector('#vendor-transaction-body'),
  empty: document.querySelector('#vendor-transaction-empty'),
};

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-US');
let rows = [];
let filtered = [];

function money(value) {
  return moneyFmt.format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function miniBars(items, total) {
  if (!items?.length) return '<div class="empty-state">No detail available.</div>';
  const max = Math.max(...items.map((item) => Math.abs(item.amount)), 1);
  return `<div class="vendor-mini-bars">${items.map((item) => `
    <div>
      <span><strong>${escapeHtml(item.label)}</strong><em>${money(item.amount)}</em></span>
      <i><b style="width:${Math.max(3, Math.abs(item.amount) / max * 100)}%"></b></i>
    </div>
  `).join('')}</div>`;
}

function rowObject(row) {
  return {
    amount: row[0],
    date: row[1],
    period: row[2],
    organization: row[3],
    officeType: row[4],
    description: row[5],
    expenseKind: row[6],
    objectClass: row[7],
    document: row[8],
  };
}

async function fetchVendorRows(vendorSlug) {
  const quickPath = `assets/house-expenditure-vendors/${encodeURIComponent(vendorSlug)}.json`;
  try {
    const quickResponse = await fetch(quickPath, { cache: 'no-store' });
    if (quickResponse.ok) return quickResponse.json();
  } catch (error) {
    console.warn(`Falling back to full transaction bundle: ${error.message}`);
  }

  const data = await fetch('assets/house-expenditure-transactions.json', { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error(`Could not load transaction data: ${response.status}`);
    return response.json();
  });
  return data.vendors?.[vendorSlug] || [];
}

async function load() {
  if (!vendor) {
    els.name.innerHTML = 'Vendor not found<span>.</span>';
    els.summary.textContent = 'Return to the House Expenditure Explorer and choose a vendor.';
    return;
  }

  document.title = `POPVOX | ${vendor.vendor}`;
  els.name.innerHTML = `${escapeHtml(vendor.vendor)}<span>.</span>`;
  els.summary.textContent = `${numberFmt.format(vendor.count)} transaction rows across ${numberFmt.format(vendor.clientCount)} House clients.`;
  if (vendor.vendorNote) {
    els.context.innerHTML = `<div class="vendor-context-note"><strong>${escapeHtml(vendor.vendorType)}</strong><span>${escapeHtml(vendor.vendorNote)}</span></div>`;
  }
  els.total.textContent = money(vendor.amount);
  els.count.textContent = numberFmt.format(vendor.count);
  els.clients.textContent = numberFmt.format(vendor.clientCount);
  els.periods.textContent = numberFmt.format(vendor.periods.length);
  els.period.innerHTML = '<option value="">All periods</option>' + vendor.periods.map((period) => `<option value="${escapeHtml(period)}">${escapeHtml(period)}</option>`).join('');
  els.profile.innerHTML = `
    <p class="eyebrow">Vendor profile</p>
    <h2>${escapeHtml(vendor.vendor)}</h2>
    ${vendor.vendorType && vendor.vendorType !== 'Named vendor' ? `<div class="vendor-context-note"><strong>${escapeHtml(vendor.vendorType)}</strong><span>${escapeHtml(vendor.vendorNote)}</span></div>` : ''}
    <div class="vendor-profile-section"><h3>House clients</h3>${miniBars(vendor.topClients, vendor.amount)}</div>
    <div class="vendor-profile-section"><h3>Repeated descriptions</h3>${miniBars(vendor.topDescriptions, vendor.amount)}</div>
    <div class="vendor-profile-section"><h3>Exposure</h3><div class="vendor-chip-row">${[...vendor.officeTypes, ...vendor.expenseKinds.slice(0, 5)].map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div></div>
  `;

  els.heading.textContent = 'Loading transactions';
  els.visible.textContent = 'Loading';
  els.note.textContent = 'Loading transaction rows for this vendor.';
  els.empty.hidden = true;

  rows = (await fetchVendorRows(vendor.slug)).map(rowObject);
  applyFilters();
}

function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  const clientQuery = els.clientSearch.value.trim().toLowerCase();
  const period = els.period.value;
  const sort = els.sort.value;
  filtered = rows.filter((row) => {
    if (period && row.period !== period) return false;
    if (clientQuery && ![row.organization, row.officeType].join(' ').toLowerCase().includes(clientQuery)) return false;
    if (!query) return true;
    return [row.organization, row.officeType, row.description, row.expenseKind, row.objectClass, row.document, row.period].join(' ').toLowerCase().includes(query);
  });
  filtered.sort((a, b) => {
    if (sort === 'date') return String(b.date).localeCompare(String(a.date));
    if (sort === 'office') return a.organization.localeCompare(b.organization) || Math.abs(b.amount) - Math.abs(a.amount);
    return Math.abs(b.amount) - Math.abs(a.amount);
  });
  render();
}

function render() {
  els.heading.textContent = `${numberFmt.format(filtered.length)} transaction rows`;
  els.visible.textContent = `${numberFmt.format(Math.min(filtered.length, 1000))} shown`;
  els.note.textContent = filtered.length > 1000
    ? `Showing the first 1,000 of ${numberFmt.format(filtered.length)} matching rows for browser performance. Use search or period filters to narrow further.`
    : `Showing all ${numberFmt.format(filtered.length)} matching rows.`;
  els.empty.hidden = filtered.length > 0;
  els.body.innerHTML = filtered.slice(0, 1000).map((row) => `
    <tr>
      <td>${money(row.amount)}</td>
      <td>${escapeHtml(row.date)}<div>${escapeHtml(row.period)}</div></td>
      <td>${escapeHtml(row.organization)}<div>${escapeHtml(row.officeType)}</div></td>
      <td>${escapeHtml(row.description)}<div>${escapeHtml(row.expenseKind)} · ${escapeHtml(row.objectClass)}</div></td>
      <td>${escapeHtml(row.document || 'Not listed')}</td>
    </tr>
  `).join('');
}

[els.search, els.clientSearch, els.period, els.sort].forEach((input) => {
  input.addEventListener('input', applyFilters);
  input.addEventListener('change', applyFilters);
});

load().catch((error) => {
  console.error(error);
  els.summary.textContent = error.message;
});
