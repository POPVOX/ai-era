const reportsData = window.POPVOX_CONGRESSIONAL_REPORTS || { reports: [], filters: {}, stats: {} };

const state = {
  search: '',
  congress: '',
  agency: '',
  committee: '',
  authority: '',
  status: '',
  sort: 'recent',
  view: 'cards',
};

const els = {
  dataStatus: document.querySelector('#reports-data-status'),
  statsReports: document.querySelector('#stat-reports'),
  statsReceived: document.querySelector('#stat-received'),
  statsLate: document.querySelector('#stat-late'),
  statsVisible: document.querySelector('#stat-visible-reports'),
  search: document.querySelector('#reports-search'),
  congress: document.querySelector('#report-congress-filter'),
  agency: document.querySelector('#report-agency-filter'),
  topAgency: document.querySelector('#top-report-agency-filter'),
  committee: document.querySelector('#report-committee-filter'),
  topCommittee: document.querySelector('#top-report-committee-filter'),
  authority: document.querySelector('#report-authority-filter'),
  status: document.querySelector('#report-status-filter'),
  sort: document.querySelector('#report-sort-filter'),
  clear: document.querySelector('#clear-reports-button'),
  export: document.querySelector('#export-reports-button'),
  resultNote: document.querySelector('#reports-result-note'),
  empty: document.querySelector('#reports-empty-state'),
  grid: document.querySelector('#reports-grid'),
  table: document.querySelector('#reports-table'),
  tableBody: document.querySelector('#reports-table-body'),
};

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function optionList(select, values, placeholder) {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>${(values || [])
    .map((value) => `<option value="${escapeAttr(String(value))}">${escapeHtml(String(value))}</option>`)
    .join('')}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function escapeAttr(value = '') {
  return escapeHtml(value);
}

function shortCommittee(report) {
  return report.committees?.[0]?.label || report.reportSubmittedTo || 'Congress';
}

function matchesStatus(report) {
  if (!state.status) return true;
  if (state.status === 'received') return Boolean(report.submittedToCongress);
  if (state.status === 'late') return !report.isOnTime;
  if (state.status === 'on-time') return report.isOnTime;
  return true;
}

function reportSearchText(report) {
  return [
    report.title,
    report.agency,
    report.organization,
    report.legalAuthority,
    report.natureOfReport,
    report.whenExpected,
    report.category,
    report.reportSubmittedTo,
    report.subjects?.join(' '),
    report.committees?.map((committee) => committee.label).join(' '),
  ].join(' ').toLowerCase();
}

function filteredReports() {
  const q = state.search.trim().toLowerCase();
  const rows = reportsData.reports
    .filter((report) => !q || reportSearchText(report).includes(q))
    .filter((report) => !state.congress || String(report.congress) === state.congress)
    .filter((report) => !state.agency || report.agency === state.agency)
    .filter((report) => !state.committee || report.committees?.some((committee) => committee.label === state.committee))
    .filter((report) => !state.authority || report.sourceKind === state.authority)
    .filter(matchesStatus);

  return rows.sort((a, b) => {
    if (state.sort === 'agency') return a.agency.localeCompare(b.agency) || a.title.localeCompare(b.title);
    if (state.sort === 'committee') return shortCommittee(a).localeCompare(shortCommittee(b)) || a.title.localeCompare(b.title);
    if (state.sort === 'late') return Number(a.isOnTime) - Number(b.isOnTime) || String(b.submittedToCongress).localeCompare(String(a.submittedToCongress));
    return String(b.submittedToCongress || b.publicationDate).localeCompare(String(a.submittedToCongress || a.publicationDate));
  });
}

function statusBadge(report) {
  const kind = report.isOnTime ? 'on-time' : 'late';
  const label = report.isOnTime ? 'On time to GPO' : 'Late / unknown to GPO';
  return `<span class="report-status-badge ${kind}">${label}</span>`;
}

function receivedBadge(report) {
  return `<span class="report-status-badge received">${report.submittedToCongress ? 'Received by Congress' : 'No receipt date'}</span>`;
}

function renderCard(report) {
  const committees = report.committees?.slice(0, 3) || [];
  const remainingCommittees = Math.max((report.committees?.length || 0) - committees.length, 0);
  const subjects = report.subjects?.slice(0, 3) || [];
  const delta = typeof report.gpoDeltaDays === 'number'
    ? report.gpoDeltaDays <= 0
      ? `${Math.abs(report.gpoDeltaDays)} days early`
      : `${report.gpoDeltaDays} days late to GPO`
    : 'GPO timing unknown';

  return `
    <article class="report-card">
      <div class="report-card-top">
        <div>
          <p class="report-agency">${escapeHtml(report.agency)}</p>
          <h3>${escapeHtml(report.title)}</h3>
        </div>
        <div class="report-badges">
          ${receivedBadge(report)}
          ${statusBadge(report)}
        </div>
      </div>

      <dl class="report-facts">
        <div><dt>Expected</dt><dd>${escapeHtml(report.whenExpected || 'Not specified')}</dd></div>
        <div><dt>Received</dt><dd>${formatDate(report.submittedToCongress)}</dd></div>
        <div><dt>GPO due</dt><dd>${formatDate(report.requiredToGpo)}</dd></div>
        <div><dt>GPO timing</dt><dd>${escapeHtml(delta)}</dd></div>
      </dl>

      <div class="authority-block">
        <span>${escapeHtml(report.sourceKind)}</span>
        <p>${escapeHtml(report.legalAuthority || 'No legal authority text provided.')}</p>
      </div>

      <div class="committee-chip-row" aria-label="Receiving committees">
        ${committees.map((committee) => `<span class="committee-chip">${escapeHtml(committee.label)}</span>`).join('')}
        ${remainingCommittees ? `<span class="committee-chip muted">+${remainingCommittees} more</span>` : ''}
        ${!committees.length ? '<span class="committee-chip muted">No committee metadata</span>' : ''}
      </div>

      ${report.natureOfReport ? `<p class="report-nature">${escapeHtml(report.natureOfReport)}</p>` : ''}

      <div class="subject-row">
        ${subjects.map((subject) => `<span>${escapeHtml(subject)}</span>`).join('')}
      </div>

      <div class="report-links">
        ${report.detailsLink ? `<a href="${escapeAttr(report.detailsLink)}" target="_blank" rel="noopener">GovInfo details</a>` : ''}
        ${report.pdfLink ? `<a href="${escapeAttr(report.pdfLink)}" target="_blank" rel="noopener">PDF${report.pdfSize ? ` (${escapeHtml(report.pdfSize)})` : ''}</a>` : ''}
      </div>
    </article>
  `;
}

function renderTableRow(report) {
  const committee = shortCommittee(report);
  return `
    <tr>
      <td><strong>${escapeHtml(report.title)}</strong><span>${escapeHtml(report.congress)}th Congress</span></td>
      <td>${escapeHtml(report.agency)}</td>
      <td>${escapeHtml(committee)}</td>
      <td>${escapeHtml(report.sourceKind)}<span>${escapeHtml(report.legalAuthority || 'No authority text')}</span></td>
      <td>Due: ${formatDate(report.requiredToGpo)}<span>Received: ${formatDate(report.submittedToCongress)}</span></td>
      <td>${report.isOnTime ? 'On time' : 'Late / unknown'}</td>
    </tr>
  `;
}

function render() {
  const rows = filteredReports();
  els.statsVisible.textContent = formatNumber(rows.length);
  els.resultNote.textContent = `${formatNumber(rows.length)} of ${formatNumber(reportsData.reports.length)} reports shown`;
  els.empty.hidden = rows.length > 0;
  els.grid.hidden = state.view !== 'cards' || rows.length === 0;
  els.table.style.display = state.view === 'table' && rows.length > 0 ? 'table' : 'none';

  els.grid.innerHTML = rows.slice(0, 120).map(renderCard).join('');
  els.tableBody.innerHTML = rows.slice(0, 400).map(renderTableRow).join('');

  if (state.view === 'cards' && rows.length > 120) {
    els.grid.insertAdjacentHTML('beforeend', `<p class="result-limit-note">Showing the first 120 matching reports. Narrow the filters to inspect more precisely.</p>`);
  }
}

function setStatus(value) {
  state.status = value;
  els.status.value = value;
  document.querySelectorAll('[data-report-filter="status"]').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === value);
  });
  render();
}

function syncSelectPair(primary, secondary, key, value) {
  state[key] = value;
  if (primary) primary.value = value;
  if (secondary) secondary.value = value;
  render();
}

function exportVisibleReports() {
  const rows = filteredReports();
  const header = ['Report', 'Agency', 'Committee', 'Authority', 'Expected', 'Due to GPO', 'Received by Congress', 'Status', 'GovInfo'];
  const body = rows.map((report) => [
    report.title,
    report.agency,
    shortCommittee(report),
    report.legalAuthority,
    report.whenExpected,
    report.requiredToGpo,
    report.submittedToCongress,
    report.isOnTime ? 'On time to GPO' : 'Late or unknown to GPO',
    report.detailsLink,
  ]);
  const csv = [header, ...body]
    .map((row) => row.map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'popvox-congressional-reports.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function init() {
  els.dataStatus.textContent = 'Loaded';
  els.statsReports.textContent = formatNumber(reportsData.stats.reports);
  els.statsReceived.textContent = formatNumber(reportsData.stats.receivedByCongress);
  els.statsLate.textContent = formatNumber(reportsData.stats.lateOrUnknown);

  optionList(els.congress, reportsData.filters.congresses, 'All congresses');
  optionList(els.agency, reportsData.filters.agencies, 'Any agency');
  optionList(els.topAgency, reportsData.filters.agencies, 'Any agency');
  optionList(els.committee, reportsData.filters.committees, 'Any committee');
  optionList(els.topCommittee, reportsData.filters.committees, 'Any committee');
  optionList(els.authority, reportsData.filters.sourceKinds, 'Any authority');

  els.search.addEventListener('input', (event) => {
    state.search = event.target.value;
    render();
  });
  els.congress.addEventListener('change', (event) => {
    state.congress = event.target.value;
    render();
  });
  els.agency.addEventListener('change', (event) => syncSelectPair(els.agency, els.topAgency, 'agency', event.target.value));
  els.topAgency.addEventListener('change', (event) => syncSelectPair(els.agency, els.topAgency, 'agency', event.target.value));
  els.committee.addEventListener('change', (event) => syncSelectPair(els.committee, els.topCommittee, 'committee', event.target.value));
  els.topCommittee.addEventListener('change', (event) => syncSelectPair(els.committee, els.topCommittee, 'committee', event.target.value));
  els.authority.addEventListener('change', (event) => {
    state.authority = event.target.value;
    render();
  });
  els.status.addEventListener('change', (event) => setStatus(event.target.value));
  els.sort.addEventListener('change', (event) => {
    state.sort = event.target.value;
    render();
  });
  els.clear.addEventListener('click', () => {
    Object.assign(state, { search: '', congress: '', agency: '', committee: '', authority: '', status: '', sort: 'recent' });
    els.search.value = '';
    els.congress.value = '';
    els.agency.value = '';
    els.topAgency.value = '';
    els.committee.value = '';
    els.topCommittee.value = '';
    els.authority.value = '';
    els.status.value = '';
    els.sort.value = 'recent';
    setStatus('');
  });
  els.export.addEventListener('click', exportVisibleReports);
  document.querySelectorAll('[data-report-filter="status"]').forEach((button) => {
    button.addEventListener('click', () => setStatus(button.dataset.value));
  });
  document.querySelectorAll('[data-reports-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.reportsView;
      document.querySelectorAll('[data-reports-view]').forEach((item) => item.classList.toggle('active', item === button));
      render();
    });
  });

  render();
}

init();
