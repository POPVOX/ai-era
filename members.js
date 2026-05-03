const state = {
  members: [],
  filtered: [],
  view: 'cards',
};

const els = {
  status: document.querySelector('#api-status'),
  resultNote: document.querySelector('#result-note'),
  grid: document.querySelector('#member-grid'),
  table: document.querySelector('#member-table'),
  tableBody: document.querySelector('#member-table-body'),
  empty: document.querySelector('#empty-state'),
  search: document.querySelector('#member-search'),
  party: document.querySelector('#party-filter'),
  memberState: document.querySelector('#state-filter'),
  chamber: document.querySelector('#chamber-filter'),
  committee: document.querySelector('#committee-filter'),
  topCommittee: document.querySelector('#top-committee-filter'),
  sort: document.querySelector('#sort-filter'),
  clear: document.querySelector('#clear-button'),
  refresh: document.querySelector('#refresh-button'),
  export: document.querySelector('#export-button'),
  statMembers: document.querySelector('#stat-members'),
  statStates: document.querySelector('#stat-states'),
  statParties: document.querySelector('#stat-parties'),
  statFiltered: document.querySelector('#stat-filtered'),
};

function asArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.members)) {
    return payload.members;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
}

function normalizeMember(raw) {
  const firstName = raw.first_name ?? raw.firstName ?? raw.given_name ?? '';
  const lastName = raw.last_name ?? raw.lastName ?? raw.family_name ?? '';
  const fullName = raw.full_name ?? raw.fullName ?? raw.name ?? [firstName, lastName].filter(Boolean).join(' ');
  const party = raw.party?.name ?? raw.party?.abbreviation ?? raw.party?.code ?? raw.party_name ?? raw.party ?? raw.current_party ?? '';
  const stateValue = raw.state ?? raw.constituency_state ?? raw.constituency?.state ?? parseState(raw.constituency ?? raw.district ?? '');
  const district = raw.district ?? raw.constituency ?? raw.role?.district ?? '';
  const chamber = raw._popvox_chamber ?? raw.chamber ?? raw.current_role?.chamber ?? raw.role?.chamber ?? raw.gov_body?.name ?? '';
  const role = inferRole(raw.title ?? raw.current_role?.title ?? raw.role?.title ?? raw.preferred_form_of_address ?? '', fullName, chamber);
  const image = raw.avatar_url ?? raw.image_url ?? raw.photo_url ?? raw.image?.url ?? null;
  const website = raw.website_url ?? raw.website ?? raw.url ?? null;
  const bioguide = raw.bioguide_id ?? raw.bioguideId ?? raw.external_id ?? raw.id ?? '';
  const focus = raw.policy_focus_area ?? raw.subject_areas ?? raw.focus ?? [];
  const committees = normalizeCommittees(raw.committees ?? raw.current_committees ?? raw.committee_roles ?? raw.committee_memberships ?? []);

  return {
    id: raw.id ?? bioguide ?? fullName,
    firstName,
    lastName,
    fullName: fullName || 'Unnamed member',
    party: normalizeParty(party),
    state: String(stateValue || '').trim(),
    district: String(district || '').trim(),
    chamber: String(chamber || '').trim(),
    role: String(role || '').trim(),
    image,
    website,
    bioguide: String(bioguide || '').trim(),
    focus: Array.isArray(focus) ? focus.filter(Boolean).slice(0, 4) : [],
    committees,
    raw,
  };
}

function normalizeParty(party) {
  const text = String(party || '').trim();
  const lower = text.toLowerCase();

  if (lower.startsWith('r') || lower.includes('republican')) {
    return 'Republican';
  }

  if (lower.startsWith('d') || lower.includes('democrat')) {
    return 'Democrat';
  }

  if (lower.startsWith('i') || lower.includes('independent')) {
    return 'Independent';
  }

  return text;
}

function normalizeCommittees(committees) {
  if (!Array.isArray(committees)) {
    return [];
  }

  return committees.map((committee) => {
    if (typeof committee === 'string') {
      return committee;
    }

    return committee.name
      ?? committee.committee_name
      ?? committee.committee?.name
      ?? committee.title
      ?? committee.code
      ?? '';
  }).filter(Boolean);
}

function inferRole(rawRole, fullName, chamber) {
  const role = String(rawRole || '').trim();
  const name = String(fullName || '').trim();
  const chamberText = String(chamber || '').toLowerCase();

  if (/^sen\.?\s/i.test(name) || chamberText.includes('senate')) {
    return 'Senator';
  }

  if (/^rep\.?\s/i.test(name) || chamberText.includes('house')) {
    return 'Representative';
  }

  if (/senator/i.test(role)) {
    return 'Senator';
  }

  if (/representative|member of congress/i.test(role)) {
    return 'Representative';
  }

  return role;
}

function parseState(value) {
  const match = String(value).match(/\b[A-Z]{2}\b/);
  return match ? match[0] : '';
}

function initials(member) {
  const parts = member.fullName.replace(/^(Rep\.|Sen\.|Hon\.)\s+/i, '').split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? 'M') + (parts.at(-1)?.[0] ?? '');
}

function partyClass(party) {
  const text = party.toLowerCase();
  if (text.startsWith('r')) return 'party-r';
  if (text.startsWith('d')) return 'party-d';
  return 'party-i';
}

function partyShort(party) {
  const text = party.toLowerCase();
  if (text.startsWith('r')) return 'R';
  if (text.startsWith('d')) return 'D';
  if (text.startsWith('i')) return 'I';
  return party ? party.slice(0, 1).toUpperCase() : '—';
}

function avatarClass(party) {
  const text = party.toLowerCase();
  if (text.startsWith('r')) return 'republican';
  if (!text.startsWith('d')) return 'independent';
  return '';
}

function displayDistrict(member) {
  return [member.state || member.district, member.chamber].filter(Boolean).join(' · ') || 'Jurisdiction pending';
}

function memberProfileUrl(member) {
  const id = member.bioguide || member.id || member.fullName;
  return `member.html?id=${encodeURIComponent(id)}`;
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
  fillSelect(els.party, unique(state.members.map((member) => member.party)), 'All parties');
  fillSelect(els.memberState, unique(state.members.map((member) => member.state)), 'All states');
  fillSelect(els.chamber, unique(state.members.map((member) => member.chamber)), 'All chambers');
  const committees = unique(state.members.flatMap((member) => member.committees));
  fillSelect(els.committee, committees, 'Any committee');
  fillSelect(els.topCommittee, committees, 'Any committee');
}

function applyInitialUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const search = params.get('search') || params.get('q') || '';
  const party = params.get('party') || '';
  const chamber = params.get('chamber') || '';
  const memberState = params.get('state') || '';
  const committee = params.get('committee') || '';

  if (search) els.search.value = search;
  if (party && [...els.party.options].some((option) => option.value === party)) els.party.value = party;
  if (chamber && [...els.chamber.options].some((option) => option.value === chamber)) els.chamber.value = chamber;
  if (memberState && [...els.memberState.options].some((option) => option.value === memberState)) els.memberState.value = memberState;
  if (committee && [...els.committee.options].some((option) => option.value === committee)) els.committee.value = committee;
}

function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  const party = els.party.value;
  const memberState = els.memberState.value;
  const chamber = els.chamber.value;
  const committee = els.committee.value || els.topCommittee.value;
  const sort = els.sort.value;

  state.filtered = state.members.filter((member) => {
    const haystack = [
      member.fullName,
      member.party,
      member.state,
      member.district,
      member.chamber,
      member.role,
      member.bioguide,
      ...member.committees,
      ...member.focus,
    ].join(' ').toLowerCase();

    return (!query || haystack.includes(query))
      && (!party || member.party === party)
      && (!memberState || member.state === memberState)
      && (!chamber || member.chamber === chamber)
      && (!committee || member.committees.includes(committee));
  }).sort((a, b) => {
    if (sort === 'state') return a.state.localeCompare(b.state) || a.lastName.localeCompare(b.lastName);
    if (sort === 'party') return a.party.localeCompare(b.party) || a.lastName.localeCompare(b.lastName);
    return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  });

  render();
}

function render() {
  if (els.statMembers) els.statMembers.textContent = state.members.length.toLocaleString();
  if (els.statStates) els.statStates.textContent = unique(state.members.map((member) => member.state)).length.toLocaleString();
  if (els.statParties) els.statParties.textContent = unique(state.members.map((member) => member.party)).length.toLocaleString();
  if (els.statFiltered) els.statFiltered.textContent = state.filtered.length.toLocaleString();
  els.resultNote.textContent = `Showing ${state.filtered.length.toLocaleString()} of ${state.members.length.toLocaleString()} loaded member profiles.`;

  els.empty.hidden = state.filtered.length > 0;
  els.grid.hidden = state.view !== 'cards';
  els.table.style.display = state.view === 'table' ? 'table' : 'none';

  els.grid.innerHTML = state.filtered.map(memberCard).join('');
  els.tableBody.innerHTML = state.filtered.map(memberRow).join('');
}

function memberCard(member) {
  const focus = member.focus.length
    ? `<div class="member-focus">${member.focus.map((item) => `<span class="focus-chip">${escapeHtml(String(item))}</span>`).join('')}</div>`
    : '';

  const avatar = member.image
    ? `<img class="avatar image" src="${escapeAttr(member.image)}" alt="">`
    : `<div class="avatar ${avatarClass(member.party)}">${escapeHtml(initials(member))}</div>`;

  const profileUrl = memberProfileUrl(member);
  const officialLink = member.website
    ? `<a class="link-button secondary-link" href="${escapeAttr(member.website)}" target="_blank" rel="noreferrer">Official site</a>`
    : '';

  return `
    <article class="member-card ${partyClass(member.party)}-card">
      <div class="member-top">
        ${avatar}
        <div>
          <h3 class="member-name"><a href="${escapeAttr(profileUrl)}">${escapeHtml(member.fullName)}</a></h3>
          <p class="member-district">${escapeHtml(displayDistrict(member))}</p>
        </div>
        <span class="party-marker ${partyClass(member.party)}" aria-label="${escapeAttr(member.party || 'Party unknown')}">${escapeHtml(partyShort(member.party))}</span>
      </div>
      <div class="member-meta">
        ${member.party ? `<span class="pill ${partyClass(member.party)}">${escapeHtml(member.party)}</span>` : ''}
        ${member.role ? `<span class="pill">${escapeHtml(member.role)}</span>` : ''}
        ${member.district || member.state ? `<span class="pill">${escapeHtml(member.district || member.state)}</span>` : ''}
      </div>
      ${focus}
      <div class="member-footer">
        <div class="signal"><i style="height:35%"></i><i style="height:65%"></i><i style="height:45%"></i><i style="height:80%"></i></div>
        <div class="member-card-actions">
          <a class="link-button" href="${escapeAttr(profileUrl)}">Open profile →</a>
          ${officialLink}
        </div>
      </div>
    </article>
  `;
}

function memberRow(member) {
  const profileUrl = memberProfileUrl(member);
  return `
    <tr>
      <td><a href="${escapeAttr(profileUrl)}">${escapeHtml(member.fullName)}</a></td>
      <td>${escapeHtml(member.party || '—')}</td>
      <td>${escapeHtml(member.district || member.state || '—')}</td>
      <td>${escapeHtml(member.chamber || '—')}</td>
      <td>${escapeHtml(member.role || '—')}</td>
      <td>
        <a href="${escapeAttr(profileUrl)}">Profile</a>
        ${member.website ? ` · <a href="${escapeAttr(member.website)}" target="_blank" rel="noreferrer">Website</a>` : ''}
      </td>
    </tr>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

async function loadMembers() {
  els.status.textContent = 'Loading';
  els.status.classList.remove('error');
  els.resultNote.textContent = 'Loading CongressLink member data...';

  try {
    const apiUrl = window.location.protocol === 'file:'
      ? 'http://127.0.0.1:8771/api/members'
      : '/api/members';
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`local proxy returned ${response.status}`);
    const payload = await response.json();

    state.members = (payload.data || []).map(normalizeMember);
    hydrateFilters();
    applyInitialUrlFilters();
    applyFilters();
    els.status.textContent = `Live · ${state.members.length} members`;
  } catch (error) {
    console.error('CongressLink API error:', error);
    els.status.textContent = 'API error';
    els.status.classList.add('error');
    els.resultNote.textContent = `Could not reach CongressLink API (${error.message}). Showing demo data.`;
    state.members = demoMembers();
    hydrateFilters();
    applyFilters();
  }
}

function demoMembers() {
  return [
    { firstName: 'Alexandra', lastName: 'Morgan', fullName: 'Rep. Alexandra Morgan', party: 'Democrat', state: 'CA', district: 'CA-12', chamber: 'House', role: 'Representative', bioguide: 'DEMO001', focus: ['AI', 'Modernization', 'Infrastructure'] },
    { firstName: 'James', lastName: 'Sutton', fullName: 'Rep. James Sutton', party: 'Republican', state: 'TX', district: 'TX-21', chamber: 'House', role: 'Representative', bioguide: 'DEMO002', focus: ['Energy', 'Permitting', 'Defense'] },
    { firstName: 'Elena', lastName: 'Cruz', fullName: 'Sen. Elena Cruz', party: 'Democrat', state: 'NY', district: 'New York', chamber: 'Senate', role: 'Senator', bioguide: 'DEMO003', focus: ['Courts', 'Privacy', 'Civil rights'] },
    { firstName: 'Mark', lastName: 'Reeves', fullName: 'Rep. Mark Reeves', party: 'Republican', state: 'TN', district: 'TN-07', chamber: 'House', role: 'Representative', bioguide: 'DEMO004', focus: ['Taxes', 'Rural health', 'Trade'] },
    { firstName: 'Priya', lastName: 'Shah', fullName: 'Rep. Priya Shah', party: 'Democrat', state: 'WA', district: 'WA-09', chamber: 'House', role: 'Representative', bioguide: 'DEMO005', focus: ['Workforce', 'Transit', 'Child care'] },
    { firstName: 'Thomas', lastName: 'Blake', fullName: 'Sen. Thomas Blake', party: 'Republican', state: 'OH', district: 'Ohio', chamber: 'Senate', role: 'Senator', bioguide: 'DEMO006', focus: ['Manufacturing', 'Health', 'Telecom'] },
  ].map(normalizeMember);
}

function exportCsv() {
  const rows = [['Name', 'Party', 'State', 'District', 'Chamber', 'Role', 'Bioguide']];
  state.filtered.forEach((member) => rows.push([
    member.fullName,
    member.party,
    member.state,
    member.district,
    member.chamber,
    member.role,
    member.bioguide,
  ]));

  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'popvox-members.csv';
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll('.view-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    state.view = button.dataset.view;
    document.querySelectorAll('.view-toggle').forEach((item) => item.classList.toggle('active', item === button));
    render();
  });
});

[els.search, els.party, els.memberState, els.chamber, els.committee, els.topCommittee, els.sort].forEach((input) => {
  input.addEventListener('input', applyFilters);
});

document.querySelectorAll('.segment').forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    const value = button.dataset.value;
    const select = filter === 'party' ? els.party : els.chamber;

    select.value = value;
    document.querySelectorAll(`.segment[data-filter="${filter}"]`).forEach((item) => {
      item.classList.toggle('active', item === button);
    });

    applyFilters();
  });
});

els.clear.addEventListener('click', () => {
  els.search.value = '';
  els.party.value = '';
  els.memberState.value = '';
  els.chamber.value = '';
  els.committee.value = '';
  els.topCommittee.value = '';
  els.sort.value = 'last_name';
  document.querySelectorAll('.segment').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === '');
  });
  applyFilters();
});

els.refresh.addEventListener('click', loadMembers);
els.export.addEventListener('click', exportCsv);

loadMembers();
