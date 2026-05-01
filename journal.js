const sampleJournalLedger = [
  {
    date: '2026-04-29',
    time: '10:00 AM',
    type: 'procedure',
    title: 'The House convened for legislative business',
    text: 'The Speaker called the House to order and the Chaplain offered the opening prayer.',
    chamber: 'House',
  },
  {
    date: '2026-04-29',
    time: '12:18 PM',
    type: 'bill',
    title: 'H.R. 8575 was introduced',
    text: "A bill was introduced to strengthen public-private partnerships and policy efforts of the Department of State to advance women's economic security in South and Central Asia.",
    bill: 'H.R. 8575',
  },
  {
    date: '2026-04-29',
    time: '2:07 PM',
    type: 'vote',
    title: 'Recorded vote ordered',
    text: 'The House ordered a recorded vote, meaning Members would have their individual votes recorded rather than deciding the question by voice vote.',
    result: 'Vote ordered',
  },
  {
    date: '2026-04-29',
    time: '5:42 PM',
    type: 'procedure',
    title: 'The House adjourned',
    text: 'The House ended its legislative day and set the next meeting time.',
    result: 'Adjourned',
  },
];

const state = {
  actions: [],
  filtered: [],
  view: 'cards',
};

const els = {
  dataStatus: document.querySelector('#journal-data-status'),
  summaryTitle: document.querySelector('#journal-summary-title'),
  summary: document.querySelector('#journal-summary'),
  resultNote: document.querySelector('#journal-result-note'),
  grid: document.querySelector('#journal-grid'),
  timeline: document.querySelector('#journal-timeline'),
  empty: document.querySelector('#journal-empty-state'),
  search: document.querySelector('#journal-search'),
  topSearch: document.querySelector('#top-journal-search'),
  type: document.querySelector('#journal-type-filter'),
  date: document.querySelector('#journal-date-filter'),
  topDate: document.querySelector('#top-journal-date-filter'),
  sort: document.querySelector('#journal-sort-filter'),
  clear: document.querySelector('#clear-journal-button'),
  refresh: document.querySelector('#refresh-journal-button'),
  export: document.querySelector('#export-journal-button'),
  statActions: document.querySelector('#stat-actions'),
  statDays: document.querySelector('#stat-days'),
  statVotes: document.querySelector('#stat-votes'),
  statVisible: document.querySelector('#stat-visible-actions'),
};

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.actions)) return payload.actions;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.entries)) return payload.entries;
  if (Array.isArray(payload?.ledger)) return payload.ledger;
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

function normalizeAction(raw, index) {
  const text = String(firstValue(raw, [
    'plain_text',
    'plainText',
    'description',
    'action_text',
    'actionText',
    'text',
    'body',
    'summary',
  ], '')).trim();
  const title = String(firstValue(raw, [
    'title',
    'heading',
    'action',
    'label',
  ], text.slice(0, 120) || `House action ${index + 1}`)).trim();
  const type = inferType(firstValue(raw, ['type', 'action_type', 'actionType', 'category'], `${title} ${text}`));
  const date = normalizeDate(firstValue(raw, ['date', 'action_date', 'actionDate', 'journal_date', 'journalDate', 'legislative_day', 'legislativeDay'], ''));
  const time = String(firstValue(raw, ['time', 'action_time', 'actionTime'], '')).trim();
  const bill = String(firstValue(raw, ['bill', 'bill_number', 'billNumber', 'measure', 'measure_number', 'measureNumber'], '')).trim() || findBill(`${title} ${text}`);
  const result = String(firstValue(raw, ['result', 'vote_result', 'voteResult', 'disposition', 'status'], '')).trim();
  const sourceUrl = String(firstValue(raw, ['url', 'source_url', 'sourceUrl', 'journal_url', 'journalUrl'], '')).trim();
  const explanation = String(firstValue(raw, ['plain_language', 'plainLanguage', 'explanation', 'explainer'], '')).trim()
    || explainAction({ title, text, type, bill, result });

  return {
    id: String(firstValue(raw, ['id', 'uuid', 'sequence', 'number'], index + 1)),
    date,
    time,
    type,
    title,
    text,
    bill,
    result,
    sourceUrl,
    explanation,
    raw,
  };
}

function inferType(value) {
  const text = String(value || '').toLowerCase();
  if (/yeas|nays|recorded vote|roll call|rollcall|vote|agreed to|passed|failed|rejected/.test(text)) return 'vote';
  if (/h\.?\s*r\.?|h\.?\s*res\.?|h\.?\s*j\.?\s*res\.?|bill|resolution|measure|amendment/.test(text)) return 'bill';
  if (/motion|ordered|rule|quorum|adjourn|recess|speaker|chair|committee of the whole|previous question/.test(text)) return 'procedure';
  if (/communication|message|senate|president|executive/.test(text)) return 'communication';
  return text.trim() || 'action';
}

function findBill(value) {
  const match = String(value || '').match(/\bH\.?\s*(?:R|Res|J\.?\s*Res|Con\.?\s*Res)\.?\s*\d+\b/i);
  return match ? match[0].replace(/\s+/g, ' ') : '';
}

function explainAction(action) {
  const text = `${action.title || ''} ${action.text || ''}`.toLowerCase();
  if (action.type === 'vote') {
    if (/agreed to|passed/.test(text)) return 'Members took a recorded or formal vote, and the question was approved.';
    if (/failed|rejected|not agreed/.test(text)) return 'Members took a recorded or formal vote, and the question was not approved.';
    return 'The House moved into a voting step, where Members’ positions may be formally recorded.';
  }
  if (action.type === 'bill') {
    return action.bill
      ? `${action.bill} moved through a floor or referral step. This is part of how a measure advances, changes, or is formally considered.`
      : 'A bill or resolution moved through a floor or referral step in the House.';
  }
  if (action.type === 'procedure') {
    if (/adjourn/.test(text)) return 'The House ended its legislative day or paused until the next scheduled meeting.';
    if (/recess/.test(text)) return 'The House temporarily paused proceedings without ending the legislative day.';
    if (/motion/.test(text)) return 'The House handled a procedural motion, which shapes how debate, voting, or consideration proceeds.';
    return 'The House handled a procedural step that organizes the day’s floor business.';
  }
  if (action.type === 'communication') {
    return 'The House received or transmitted an official communication as part of the congressional record.';
  }
  return 'This entry records an official action on the House floor.';
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function normalizeBillRef(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const match = text.match(/^H\.?\s*(Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*(\d+)$/i);
  if (!match) return '';
  const kind = match[1].replace(/\s+/g, ' ').toLowerCase();
  const label = ({
    r: 'H.R.',
    res: 'H.Res.',
    'j. res': 'H.J.Res.',
    jres: 'H.J.Res.',
    'con. res': 'H.Con.Res.',
    conres: 'H.Con.Res.',
  })[kind] || `H.${match[1]}.`;
  return `${label} ${match[2]}`;
}

function billPageHref(label) {
  const normalized = normalizeBillRef(label);
  if (!normalized) return '';
  return `bills/${normalized.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-')}.html`;
}

function linkBillRefs(value) {
  const pattern = /\bH\.?\s*(?:Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*\d+\b/gi;
  return escapeHtml(value).replace(pattern, (match) => {
    const href = billPageHref(match);
    return href ? `<a class="bill-ref" href="${escapeHtml(href)}">${escapeHtml(match)}</a>` : escapeHtml(match);
  });
}

function titleCase(value) {
  return String(value || 'action').replace(/[-_]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
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

function hydrateFilters() {
  fillSelect(els.type, unique(state.actions.map((action) => action.type)), 'All action types');
  const dates = unique(state.actions.map((action) => action.date)).sort((a, b) => b.localeCompare(a));
  fillSelect(els.date, dates, 'Any date');
  fillSelect(els.topDate, dates, 'Any date');
}

function applyFilters() {
  const query = [els.search.value, els.topSearch.value].filter(Boolean).join(' ').trim().toLowerCase();
  const type = els.type.value;
  const date = els.date.value || els.topDate.value;
  const sort = els.sort.value;

  state.filtered = state.actions.filter((action) => {
    const haystack = [
      action.date,
      action.time,
      action.type,
      action.title,
      action.text,
      action.explanation,
      action.bill,
      action.result,
    ].join(' ').toLowerCase();

    return (!query || haystack.includes(query))
      && (!type || action.type === type)
      && (!date || action.date === date);
  }).sort((a, b) => {
    if (sort === 'oldest') return String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time));
    if (sort === 'type') return a.type.localeCompare(b.type) || String(b.date).localeCompare(String(a.date));
    return String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time));
  });

  render();
}

function render() {
  els.statActions.textContent = state.actions.length.toLocaleString();
  els.statDays.textContent = unique(state.actions.map((action) => action.date)).length.toLocaleString();
  els.statVotes.textContent = state.actions.filter((action) => action.type === 'vote').length.toLocaleString();
  els.statVisible.textContent = state.filtered.length.toLocaleString();
  els.resultNote.textContent = `Showing ${state.filtered.length.toLocaleString()} of ${state.actions.length.toLocaleString()} ledger actions.`;
  els.empty.hidden = state.filtered.length > 0;
  els.grid.hidden = state.view !== 'cards';
  els.timeline.hidden = state.view !== 'timeline';
  els.grid.innerHTML = state.filtered.slice(0, 240).map(actionCard).join('');
  els.timeline.innerHTML = renderTimeline(state.filtered.slice(0, 300));
  renderSummary();
}

function renderSummary() {
  const visible = state.filtered;
  if (!visible.length) {
    els.summaryTitle.textContent = 'No visible House actions';
    els.summary.textContent = 'Clear filters to rebuild a plain-language readout from the ledger.';
    return;
  }

  const dates = unique(visible.map((action) => action.date));
  const votes = visible.filter((action) => action.type === 'vote').length;
  const bills = visible.filter((action) => action.type === 'bill').length;
  const procedures = visible.filter((action) => action.type === 'procedure').length;
  const topBills = unique(visible.map((action) => action.bill)).slice(0, 4);

  els.summaryTitle.textContent = `${visible.length.toLocaleString()} visible actions across ${dates.length.toLocaleString()} session day${dates.length === 1 ? '' : 's'}`;
  els.summary.textContent = [
    `In plain language: the visible ledger shows ${votes} voting action${votes === 1 ? '' : 's'}, ${bills} bill or resolution action${bills === 1 ? '' : 's'}, and ${procedures} procedural step${procedures === 1 ? '' : 's'}.`,
    topBills.length ? `Measures appearing in this view include ${topBills.join(', ')}.` : '',
    'Use the filters to narrow the record to a date, floor action type, bill number, motion, or keyword.',
  ].filter(Boolean).join(' ');
}

function actionCard(action) {
  const billHref = billPageHref(action.bill);
  return `
    <article class="journal-card">
      <div class="journal-card-top">
        <span class="journal-type ${escapeHtml(action.type)}">${escapeHtml(titleCase(action.type))}</span>
        <span>${escapeHtml([formatDate(action.date), action.time].filter(Boolean).join(' · '))}</span>
      </div>
      <h3>${linkBillRefs(action.title)}</h3>
      ${action.text ? `<p class="journal-raw">${linkBillRefs(action.text)}</p>` : ''}
      <div class="journal-explanation">
        <p class="eyebrow">Plain English</p>
        <p>${linkBillRefs(action.explanation)}</p>
      </div>
      <div class="journal-card-footer">
        ${action.bill ? (billHref ? `<a class="link-button" href="${escapeHtml(billHref)}">${escapeHtml(action.bill)}</a>` : `<span>${escapeHtml(action.bill)}</span>`) : ''}
        ${action.result ? `<span>${escapeHtml(action.result)}</span>` : ''}
        ${action.sourceUrl ? `<a class="link-button" href="${escapeHtml(action.sourceUrl)}" target="_blank" rel="noopener">Source</a>` : ''}
      </div>
    </article>
  `;
}

function renderTimeline(actions) {
  if (!actions.length) return '';
  return actions.map((action) => `
    <article class="journal-timeline-item">
      <div><span></span></div>
      <section>
        <p>${escapeHtml([formatDate(action.date), action.time, titleCase(action.type)].filter(Boolean).join(' · '))}</p>
        <h3>${linkBillRefs(action.title)}</h3>
        <p>${linkBillRefs(action.explanation)}</p>
      </section>
    </article>
  `).join('');
}

async function loadLedger() {
  els.dataStatus.textContent = 'Loading';

  try {
    const embedded = window.HOUSE_JOURNAL_LEDGER;
    let rows = asArray(embedded);

    if (!rows.length) {
      const response = await fetch('assets/house-journal-ledger.json', { cache: 'no-store' });
      if (response.ok) rows = asArray(await response.json());
    }

    if (!rows.length) {
      rows = sampleJournalLedger;
      els.dataStatus.textContent = 'Sample data';
    } else {
      els.dataStatus.textContent = `${rows.length.toLocaleString()} loaded`;
    }

    state.actions = rows.map(normalizeAction);
    state.filtered = [...state.actions];
    hydrateFilters();
    applyFilters();
  } catch (error) {
    state.actions = sampleJournalLedger.map(normalizeAction);
    state.filtered = [...state.actions];
    hydrateFilters();
    applyFilters();
    els.dataStatus.textContent = 'Sample data';
    console.warn(error);
  }
}

function bindEvents() {
  [els.search, els.topSearch, els.type, els.date, els.topDate, els.sort].forEach((input) => {
    input.addEventListener('input', applyFilters);
    input.addEventListener('change', applyFilters);
  });

  document.querySelectorAll('[data-journal-filter="type"]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-journal-filter="type"]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      els.type.value = button.dataset.value || '';
      applyFilters();
    });
  });

  document.querySelectorAll('[data-journal-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.journalView;
      document.querySelectorAll('[data-journal-view]').forEach((item) => item.classList.toggle('active', item.dataset.journalView === state.view));
      render();
    });
  });

  els.clear.addEventListener('click', () => {
    els.search.value = '';
    els.topSearch.value = '';
    els.type.value = '';
    els.date.value = '';
    els.topDate.value = '';
    document.querySelectorAll('[data-journal-filter="type"]').forEach((item) => item.classList.toggle('active', !item.dataset.value));
    applyFilters();
  });

  els.refresh.addEventListener('click', loadLedger);

  els.export.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'popvox-house-journal-explorer-export.json';
    link.click();
    URL.revokeObjectURL(url);
  });
}

bindEvents();
loadLedger();
