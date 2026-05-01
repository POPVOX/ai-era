const billDataNode = document.querySelector('#bill-data');

const billState = {
  data: billDataNode ? JSON.parse(billDataNode.textContent) : {},
  detail: null,
};

const billEls = {
  sponsor: document.querySelector('#bill-sponsor'),
  cosponsors: document.querySelector('#bill-cosponsors'),
  committees: document.querySelector('#bill-committees'),
  introduced: document.querySelector('#bill-introduced'),
  summary: document.querySelector('#bill-summary'),
  messages: document.querySelector('#bill-chat-messages'),
  form: document.querySelector('#bill-chat-form'),
  input: document.querySelector('#bill-chat-input'),
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function memberLabel(member) {
  if (!member) return '';
  const role = member.current_role?.title || member.role || '';
  const constituency = member.constituency || member.state || '';
  return [role, member.full_name || member.name, constituency].filter(Boolean).join(' ');
}

function readableSummary() {
  const summary = billState.detail?.description || billState.detail?.summary || billState.data.summary;
  if (summary) return summary;
  const shortTitle = billState.data.shortTitle || billState.data.title || '';
  if (shortTitle && shortTitle !== billState.data.label) return shortTitle;
  return 'A summary is not available yet. The page is ready to attach official summaries, bill text, and generated plain-language explanations as those fields arrive.';
}

function normalizeCommittees(detail) {
  const values = [
    ...(detail?.mentioned_committees || []),
    ...(detail?.committees || []),
    ...(detail?.attributes?.committees || []),
  ];
  return values.map((item) => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return item.name || item.label || item.title || item.committee_name || '';
  }).filter(Boolean);
}

function hydrateDetail(detailPayload) {
  const detail = detailPayload?.data || detailPayload;
  billState.detail = detail;

  const sponsor = memberLabel(detail?._popvox_sponsor)
    || detail?.sponsor?.name
    || detail?.attributes?.sponsor_bioguide_id
    || billState.data.sponsor
    || 'Sponsor metadata pending';
  const cosponsors = detail?._popvox_cosponsors || [];
  const cosponsorCount = detail?.attributes?.cosponsors_count ?? billState.data.cosponsorCount;
  const committees = normalizeCommittees(detail);
  const introduced = detail?.attributes?.introduced_date || detail?.document_date || billState.data.introducedDate;

  if (billEls.sponsor) billEls.sponsor.textContent = sponsor;
  if (billEls.cosponsors) {
    billEls.cosponsors.textContent = cosponsors.length
      ? cosponsors.map(memberLabel).join('; ')
      : `${Number(cosponsorCount || 0).toLocaleString()} cosponsor${Number(cosponsorCount || 0) === 1 ? '' : 's'}`;
  }
  if (billEls.committees) billEls.committees.textContent = committees.length ? committees.join(' · ') : 'Referral metadata pending';
  if (billEls.introduced) billEls.introduced.textContent = introduced || 'Date pending';
  if (billEls.summary) billEls.summary.textContent = readableSummary();
}

async function loadBillDetail() {
  if (!billState.data.id) {
    if (billEls.summary) billEls.summary.textContent = readableSummary();
    return;
  }

  try {
    const response = await fetch(`../api/bill/${encodeURIComponent(billState.data.id)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    hydrateDetail(await response.json());
  } catch (error) {
    if (billEls.summary) billEls.summary.textContent = readableSummary();
    console.warn('Bill detail unavailable:', error);
  }
}

function addMessage(role, html) {
  if (!billEls.messages) return;
  const node = document.createElement('article');
  node.className = `rules-message ${role}`;
  if (role === 'user') {
    node.innerHTML = `<div>${escapeHtml(html)}</div>`;
  } else {
    node.innerHTML = `<span class="rules-avatar">PV</span><div class="rules-answer">${html}</div>`;
  }
  billEls.messages.append(node);
  billEls.messages.scrollTop = billEls.messages.scrollHeight;
}

function connectedText() {
  const contexts = billState.data.contexts || [];
  if (!contexts.length) return 'No connected committee, vote, Journal, CBO, or markup records have been captured yet.';
  const groups = new Map();
  for (const context of contexts) {
    const key = context.bucket || 'Related record';
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups.entries()].map(([label, count]) => `${label}: ${count}`).join('; ');
}

function answerQuestion(question) {
  const q = question.toLowerCase();
  const detail = billState.detail || {};
  const sponsor = billEls.sponsor?.textContent || 'Sponsor metadata pending';
  const cosponsors = billEls.cosponsors?.textContent || 'Cosponsor metadata pending';
  const committees = billEls.committees?.textContent || 'Committee referral metadata pending';
  const summary = readableSummary();
  const status = detail.status || billState.data.status || 'Status pending';
  const introduced = detail.attributes?.introduced_date || detail.document_date || billState.data.introducedDate || 'Date pending';

  if (q.includes('sponsor') || q.includes('cosponsor')) {
    return `<p><strong>${escapeHtml(billState.data.label)}</strong> is sponsored by ${escapeHtml(sponsor)}.</p><p>Cosponsor information: ${escapeHtml(cosponsors)}.</p>`;
  }
  if (q.includes('committee') || q.includes('markup') || q.includes('action')) {
    return `<p><strong>Committee/referral status:</strong> ${escapeHtml(committees)}.</p><p><strong>Connected records:</strong> ${escapeHtml(connectedText())}</p>`;
  }
  if (q.includes('where') || q.includes('related') || q.includes('journal') || q.includes('vote') || q.includes('cbo')) {
    return `<p><strong>Related records found so far:</strong> ${escapeHtml(connectedText())}</p><p>As CBO scores, votes, committee markups, and official actions are connected, they can appear in this same record graph.</p>`;
  }
  if (q.includes('text') || q.includes('read')) {
    const url = billState.data.textUrl || billState.data.congressGovUrl;
    return url
      ? `<p>The best available text link for this prototype is <a href="${escapeHtml(url)}" target="_blank" rel="noopener">the bill text/source page</a>.</p>`
      : '<p>A bill text link is not available in the current data yet.</p>';
  }
  return `<p><strong>${escapeHtml(billState.data.label)}</strong> is currently marked <strong>${escapeHtml(status)}</strong> and was introduced on ${escapeHtml(introduced)}.</p><p>${escapeHtml(summary)}</p>`;
}

function bindChat() {
  addMessage('assistant', '<p><strong>Ask about this bill.</strong> This preview answers from the bill metadata and connected POPVOX records already on the page. Later, this can use embeddings over bill text, reports, testimony, markups, votes, and Journal actions.</p>');

  document.querySelectorAll('[data-bill-question]').forEach((button) => {
    button.addEventListener('click', () => {
      const question = button.dataset.billQuestion;
      addMessage('user', question);
      addMessage('assistant', answerQuestion(question));
    });
  });

  billEls.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = billEls.input.value.trim();
    if (!question) return;
    billEls.input.value = '';
    addMessage('user', question);
    addMessage('assistant', answerQuestion(question));
  });
}

bindChat();
loadBillDetail();
