const params = new URLSearchParams(window.location.search);
const requestedId = params.get('id') || params.get('m') || '';

const els = {
  avatar: document.querySelector('#member-profile-avatar'),
  name: document.querySelector('#member-profile-name'),
  role: document.querySelector('#member-profile-role'),
  district: document.querySelector('#member-profile-district'),
  badges: document.querySelector('#member-profile-badges'),
  summary: document.querySelector('#member-profile-summary'),
  links: document.querySelector('#member-profile-links'),
  sourceList: document.querySelector('#member-source-list'),
  committeeGrid: document.querySelector('#member-committee-grid'),
  relatedGrid: document.querySelector('#member-related-grid'),
  statChamber: document.querySelector('#member-stat-chamber'),
  statParty: document.querySelector('#member-stat-party'),
  statState: document.querySelector('#member-stat-state'),
  statCommittees: document.querySelector('#member-stat-committees'),
};

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.members)) return payload.members;
  if (Array.isArray(payload?.results)) return payload.results;
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
  const committees = normalizeCommittees(raw.committees ?? raw.current_committees ?? raw.committee_roles ?? raw.committee_memberships ?? []);

  return {
    id: raw.id ?? bioguide ?? fullName,
    firstName,
    lastName,
    fullName: fullName || 'Unnamed lawmaker',
    party: normalizeParty(party),
    state: String(stateValue || '').trim(),
    district: String(district || '').trim(),
    chamber: String(chamber || '').trim(),
    role: String(role || '').trim(),
    image,
    website,
    bioguide: String(bioguide || '').trim(),
    committees,
    raw,
  };
}

function normalizeParty(party) {
  const text = String(party || '').trim();
  const lower = text.toLowerCase();

  if (lower.startsWith('r') || lower.includes('republican')) return 'Republican';
  if (lower.startsWith('d') || lower.includes('democrat')) return 'Democrat';
  if (lower.startsWith('i') || lower.includes('independent')) return 'Independent';
  return text;
}

function normalizeCommittees(committees) {
  if (!Array.isArray(committees)) return [];

  return committees.map((committee) => {
    if (typeof committee === 'string') {
      return { name: committee, role: '' };
    }

    return {
      name: committee.name
        ?? committee.committee_name
        ?? committee.committee?.name
        ?? committee.title
        ?? committee.code
        ?? '',
      role: committee.role
        ?? committee.member_type
        ?? committee.rank
        ?? committee.position
        ?? committee.title
        ?? '',
    };
  }).filter((committee) => committee.name);
}

function inferRole(rawRole, fullName, chamber) {
  const role = String(rawRole || '').trim();
  const name = String(fullName || '').trim();
  const chamberText = String(chamber || '').toLowerCase();

  if (/^sen\.?\s/i.test(name) || chamberText.includes('senate')) return 'Senator';
  if (/^rep\.?\s/i.test(name) || chamberText.includes('house')) return 'Representative';
  if (/senator/i.test(role)) return 'Senator';
  if (/representative|member of congress/i.test(role)) return 'Representative';
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

function displayDistrict(member) {
  return [member.state || member.district, member.chamber].filter(Boolean).join(' · ') || 'Congressional profile';
}

function districtPill(member) {
  const district = member.district || member.state || '';
  if (!district) return '';
  return district;
}

function compactName(member) {
  return member.fullName.replace(/^(Rep\.|Sen\.|Hon\.)\s+/i, '');
}

function normalizeLookup(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^(Rep\.|Sen\.|Hon\.|Representative|Senator)\s+/i, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function firstLastKey(value) {
  const tokens = normalizeLookup(value).split(' ').filter(Boolean);
  if (tokens.length < 2) return tokens.join(' ');
  return `${tokens[0]} ${tokens.at(-1)}`;
}

function matchMember(member, value) {
  const target = normalizeLookup(value);
  const targetFirstLast = firstLastKey(value);
  const candidates = [
    member.bioguide,
    member.id,
    member.fullName,
    compactName(member),
    member.raw?.id,
    member.raw?.slug,
    member.raw?.bioguide_id,
    member.raw?.external_id,
  ];

  return candidates.some((candidate) => {
    const normalized = normalizeLookup(candidate);
    if (normalized && normalized === target) return true;
    return targetFirstLast && firstLastKey(candidate) === targetFirstLast;
  });
}

function searchUrl(member) {
  const query = encodeURIComponent(compactName(member));
  return `https://www.congress.gov/search?q=%7B%22source%22%3A%22members%22%2C%22search%22%3A%22${query}%22%7D`;
}

function renderMember(member) {
  document.title = `POPVOX | ${compactName(member)}`;

  els.avatar.classList.toggle('has-photo', Boolean(member.image));
  els.avatar.innerHTML = member.image
    ? `<img src="${escapeAttr(member.image)}" alt="">`
    : escapeHtml(initials(member));

  els.name.innerHTML = `${escapeHtml(compactName(member))}<span>.</span>`;
  els.role.textContent = [member.role, member.party].filter(Boolean).join(' · ') || 'Member of Congress';
  els.district.textContent = displayDistrict(member);

  els.badges.innerHTML = [
    member.chamber,
    member.party,
    districtPill(member),
    member.bioguide ? `ID ${member.bioguide}` : '',
  ].filter(Boolean).map((item, index) => `<span${index === 1 ? ' class="coral"' : ''}>${escapeHtml(item)}</span>`).join('');

  els.statChamber.textContent = member.chamber || '—';
  els.statParty.textContent = partyShort(member.party);
  els.statState.textContent = member.state || '—';
  els.statCommittees.textContent = member.committees.length.toLocaleString();

  const districtText = member.district || member.state || 'their jurisdiction';
  const committeeText = member.committees.length
    ? `${member.committees.length.toLocaleString()} committee assignment${member.committees.length === 1 ? '' : 's'}`
    : 'committee assignments returned by the source data';
  els.summary.textContent = `${compactName(member)} serves in the ${member.chamber || 'Congress'} representing ${districtText}. This profile connects the member record to ${committeeText}, official source links, and related POPVOX Explorers.`;

  els.links.innerHTML = [
    member.website ? `<a href="${escapeAttr(member.website)}" target="_blank" rel="noopener"><span>Official</span>Website</a>` : '',
    `<a href="${escapeAttr(searchUrl(member))}" target="_blank" rel="noopener"><span>Congress.gov</span>Member search</a>`,
    `<a href="legislation.html?search=${encodeURIComponent(compactName(member))}"><span>POPVOX</span>Legislation Explorer</a>`,
    `<a href="staff.html?search=${encodeURIComponent(compactName(member))}"><span>POPVOX</span>Staff Explorer</a>`,
  ].filter(Boolean).join('');

  els.sourceList.innerHTML = sourceRows(member).map(([label, value]) => `
    <div class="member-source-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '—')}</strong>
    </div>
  `).join('');

  els.committeeGrid.innerHTML = member.committees.length
    ? member.committees.map((committee) => `
      <article>
        <h3>${escapeHtml(committee.name)}</h3>
        ${committee.role ? `<p>${escapeHtml(committee.role)}</p>` : ''}
      </article>
    `).join('')
    : '<p class="table-note">No committee assignments were returned for this lawmaker by the current source data.</p>';

  els.relatedGrid.innerHTML = relatedCards(member).map((card) => `
    <a class="member-related-card" href="${escapeAttr(card.href)}">
      <span>${escapeHtml(card.label)}</span>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.text)}</p>
    </a>
  `).join('');
}

function sourceRows(member) {
  return [
    ['Source', 'CongressLink API'],
    ['Member ID', member.id],
    ['Bioguide / external ID', member.bioguide],
    ['State', member.state],
    ['District', member.district],
    ['Chamber', member.chamber],
  ];
}

function relatedCards(member) {
  const name = encodeURIComponent(compactName(member));
  const chamber = encodeURIComponent(member.chamber || '');
  const state = encodeURIComponent(member.state || '');

  return [
    {
      label: 'Bills',
      title: 'Legislation Explorer',
      text: 'Search bill records for sponsor, cosponsor, committee referral, and status context.',
      href: `legislation.html?search=${name}`,
    },
    {
      label: 'Committees',
      title: 'Committee Explorer',
      text: 'Move from member context to committee, hearing, markup, and witness records.',
      href: `committees.html?chamber=${chamber}&search=${state}`,
    },
    {
      label: 'Staff',
      title: 'Congressional Staff Explorer',
      text: 'Review public staff-office records associated with congressional offices and committees.',
      href: `staff.html?search=${name}`,
    },
    {
      label: 'Journal',
      title: 'House Journal Explorer',
      text: 'Look for mentions in daily House action records and plain-language explanations.',
      href: `journal.html?search=${name}`,
    },
  ];
}

function renderNotFound(message = 'Lawmaker not found') {
  els.name.innerHTML = `${escapeHtml(message)}<span>.</span>`;
  els.role.textContent = 'Try returning to the Lawmaker Explorer and opening a profile from the latest loaded data.';
  els.district.textContent = '';
  els.badges.innerHTML = '<span>CongressLink API</span>';
  els.summary.textContent = 'The requested member identifier did not match a loaded record.';
  els.committeeGrid.innerHTML = '<p class="table-note">No committee assignments to display.</p>';
  els.relatedGrid.innerHTML = `
    <a class="member-related-card" href="members.html">
      <span>Explore</span>
      <h3>Lawmaker Explorer</h3>
      <p>Search the current live member dataset.</p>
    </a>
  `;
}

async function loadMember() {
  if (!requestedId) {
    renderNotFound('Missing member identifier');
    return;
  }

  try {
    const apiUrl = window.location.protocol === 'file:'
      ? 'http://127.0.0.1:8771/api/members'
      : '/api/members';
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`local proxy returned ${response.status}`);
    const payload = await response.json();
    const members = asArray(payload).map(normalizeMember);
    const member = members.find((item) => matchMember(item, requestedId));

    if (!member) {
      renderNotFound();
      return;
    }

    renderMember(member);
  } catch (error) {
    console.error('Member profile error:', error);
    renderNotFound('Member data unavailable');
    els.role.textContent = `Could not reach the member data source: ${error.message}`;
  }
}

function partyShort(party) {
  const text = String(party || '').toLowerCase();
  if (text.startsWith('r')) return 'R';
  if (text.startsWith('d')) return 'D';
  if (text.startsWith('i')) return 'I';
  return party || '—';
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

loadMember();
