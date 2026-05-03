const data = window.SENATE_COMMITTEE_DATA || { metrics: {}, committees: [], upcomingHearings: [] };

const state = {
  search: "",
  kind: "",
  party: "",
  sort: "name",
  selectedCode: "",
};

const els = {
  updated: document.querySelector("#senate-committee-updated"),
  count: document.querySelector("#senate-committee-count"),
  subcommittees: document.querySelector("#senate-subcommittee-count"),
  members: document.querySelector("#senate-member-count"),
  hearings: document.querySelector("#senate-hearing-count"),
  search: document.querySelector("#senate-committee-search"),
  kind: document.querySelector("#senate-committee-kind"),
  party: document.querySelector("#senate-committee-party"),
  sort: document.querySelector("#senate-committee-sort"),
  nav: document.querySelector("#senate-committee-list"),
  heading: document.querySelector("#senate-committee-heading"),
  visible: document.querySelector("#senate-committee-visible"),
  detail: document.querySelector("#senate-committee-detail"),
  grid: document.querySelector("#senate-committee-grid"),
  empty: document.querySelector("#senate-committee-empty"),
};

const fmt = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function formatDate(value) {
  if (!value) return "Date pending";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

function initials(name) {
  return String(name || "?")
    .replace(/Committee on |Subcommittee on /g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function committeeKind(committee) {
  if (/^Joint/i.test(committee.displayName || committee.name)) return "Joint";
  if (/^(Select|Special)/i.test(committee.displayName || committee.name)) return "Select or Special";
  if (/Caucus|Commission/i.test(committee.displayName || committee.name)) return "Other";
  return "Standing";
}

function memberLine(member) {
  if (!member) return "Not listed";
  return `${member.name} (${member.party}-${member.state})`;
}

function renderStats() {
  els.updated.textContent = data.generatedAt ? `Updated ${formatDate(data.generatedAt)}` : "Local data";
  els.count.textContent = fmt.format(data.metrics.committeeCount || 0);
  els.subcommittees.textContent = fmt.format(data.metrics.subcommitteeCount || 0);
  els.members.textContent = fmt.format(data.metrics.senatorCount || 0);
  els.hearings.textContent = fmt.format((data.metrics.upcomingHearingCount || 0) + (data.metrics.historicalMeetingCount || 0) + (data.metrics.publishedHearingCount || 0));
}

function textFor(committee) {
  return [
    committee.name,
    committee.displayName,
    committee.code,
    committee.chair?.name,
    committee.ranking?.name,
    ...(committee.members || []).map((member) => `${member.name} ${member.state} ${member.party} ${member.position}`),
    ...(committee.subcommittees || []).flatMap((subcommittee) => [
      subcommittee.name,
      subcommittee.chair?.name,
      subcommittee.ranking?.name,
      ...(subcommittee.members || []).map((member) => `${member.name} ${member.state} ${member.party} ${member.position}`),
    ]),
    ...(committee.upcomingHearings || []).map((hearing) => `${hearing.matter} ${hearing.subcommittee} ${hearing.room}`),
    ...(committee.historicalMeetings || []).map((meeting) => `${meeting.title} ${meeting.type} ${meeting.status} ${meeting.location} ${(meeting.witnesses || []).map((witness) => `${witness.name} ${witness.organization}`).join(" ")} ${(meeting.bills || []).map((bill) => `${bill.type} ${bill.number}`).join(" ")}`),
    ...(committee.publishedHearings || []).map((hearing) => `${hearing.title} ${(hearing.witnesses || []).map((witness) => `${witness.displayName} ${witness.organization}`).join(" ")}`),
  ].join(" ").toLowerCase();
}

function committeeMatches(committee) {
  const query = state.search.trim().toLowerCase();
  if (state.kind && committeeKind(committee) !== state.kind) return false;
  if (state.party && committee.chair?.party !== state.party) return false;
  return !query || textFor(committee).includes(query);
}

function visibleCommittees() {
  const rows = (data.committees || []).filter(committeeMatches);
  rows.sort((a, b) => {
    if (state.sort === "members") return (b.memberCount || 0) - (a.memberCount || 0) || a.displayName.localeCompare(b.displayName);
    if (state.sort === "subcommittees") return (b.subcommitteeCount || 0) - (a.subcommitteeCount || 0) || a.displayName.localeCompare(b.displayName);
    if (state.sort === "hearings") return ((b.upcomingHearings?.length || 0) + (b.historicalMeetings?.length || 0) + (b.publishedHearings?.length || 0)) - ((a.upcomingHearings?.length || 0) + (a.historicalMeetings?.length || 0) + (a.publishedHearings?.length || 0)) || a.displayName.localeCompare(b.displayName);
    return a.displayName.localeCompare(b.displayName);
  });
  return rows;
}

function renderMemberPills(members, limit = 12) {
  const visible = (members || []).slice(0, limit);
  if (!visible.length) return `<p class="committee-empty">No members listed in this source.</p>`;
  return `<div class="senate-member-pills">
    ${visible.map((member) => `<span>${escapeHtml(member.name)} <small>${escapeHtml(member.party)}-${escapeHtml(member.state)}</small></span>`).join("")}
    ${(members || []).length > visible.length ? `<span>${fmt.format(members.length - visible.length)} more</span>` : ""}
  </div>`;
}

function renderHearing(hearing) {
  const eventUrl = hearing.id ? `https://www.congress.gov/event/119th-congress/senate-event/${encodeURIComponent(hearing.id)}` : "";
  return `<article class="senate-hearing-row">
    <div>
      <span>${escapeHtml(formatDate(hearing.date))}${hearing.time ? ` at ${escapeHtml(hearing.time)}` : ""}</span>
      <h4>${escapeHtml(hearing.matter || "Hearing matter pending")}</h4>
      <p>${escapeHtml([hearing.subcommittee, hearing.room].filter(Boolean).join(" | ") || "Location pending")}</p>
    </div>
    <div class="witness-link-row">
      ${eventUrl ? `<a href="${eventUrl}" target="_blank" rel="noopener">Congress.gov event</a>` : ""}
      ${hearing.videoUrl ? `<a href="${escapeHtml(hearing.videoUrl)}" target="_blank" rel="noopener">Video</a>` : ""}
    </div>
  </article>`;
}

function formatDateTime(value) {
  if (!value) return "Date pending";
  return formatDate(value);
}

function renderHistoricalMeeting(meeting) {
  const witnessCount = meeting.witnesses?.length || 0;
  const documentCount = (meeting.witnessDocuments?.length || 0) + (meeting.meetingDocuments?.length || 0);
  const relatedCount = (meeting.bills?.length || 0) + (meeting.nominations?.length || 0);
  return `<article class="senate-hearing-row historical">
    <div>
      <span>${escapeHtml(formatDateTime(meeting.date))}${meeting.status ? ` | ${escapeHtml(meeting.status)}` : ""}</span>
      <h4>${meeting.congressGovUrl ? `<a href="${escapeHtml(meeting.congressGovUrl)}" target="_blank" rel="noopener">${escapeHtml(meeting.title || "Committee meeting")}</a>` : escapeHtml(meeting.title || "Committee meeting")}</h4>
      <p>${escapeHtml([meeting.type, meeting.location].filter(Boolean).join(" | ") || "Details pending")}</p>
      <div class="senate-meeting-chips">
        <span>${fmt.format(witnessCount)} witnesses</span>
        <span>${fmt.format(documentCount)} docs</span>
        <span>${fmt.format(relatedCount)} related items</span>
      </div>
    </div>
    <div class="witness-link-row">
      ${meeting.congressGovUrl ? `<a href="${escapeHtml(meeting.congressGovUrl)}" target="_blank" rel="noopener">Congress.gov</a>` : ""}
      ${meeting.transcript?.url ? `<a href="${escapeHtml(meeting.transcript.url)}" target="_blank" rel="noopener">Transcript</a>` : ""}
      ${meeting.videos?.[0]?.url ? `<a href="${escapeHtml(meeting.videos[0].url)}" target="_blank" rel="noopener">Video</a>` : ""}
    </div>
  </article>`;
}

function renderPublishedHearing(hearing) {
  const witnesses = hearing.witnesses || [];
  const sourceLinks = [
    hearing.localUrl ? `<a href="${escapeHtml(hearing.localUrl)}">Event page</a>` : "",
    hearing.pdfUrl ? `<a href="${escapeHtml(hearing.pdfUrl)}" target="_blank" rel="noopener">PDF</a>` : "",
    hearing.htmlUrl ? `<a href="${escapeHtml(hearing.htmlUrl)}" target="_blank" rel="noopener">HTML</a>` : "",
  ].filter(Boolean).join("");
  const witnessLinks = witnesses.slice(0, 4).map((witness) => (
    witness.profileUrl
      ? `<a href="${escapeHtml(witness.profileUrl)}">${escapeHtml(witness.displayName)}</a>`
      : `<span>${escapeHtml(witness.displayName)}</span>`
  )).join("");
  return `<article class="senate-hearing-row published">
    <div>
      <span>${escapeHtml(formatDate(hearing.date || hearing.dateIssued))} | GovInfo published hearing</span>
      <h4>${hearing.localUrl ? `<a href="${escapeHtml(hearing.localUrl)}">${escapeHtml(hearing.title || "Published Senate hearing")}</a>` : escapeHtml(hearing.title || "Published Senate hearing")}</h4>
      <p>${fmt.format(hearing.witnessCount || witnesses.length || 0)} extracted witness slots${hearing.packageId ? ` | ${escapeHtml(hearing.packageId)}` : ""}</p>
      ${witnessLinks ? `<div class="senate-witness-mini-list">${witnessLinks}${witnesses.length > 4 ? `<span>${fmt.format(witnesses.length - 4)} more</span>` : ""}</div>` : ""}
    </div>
    <div class="witness-link-row">
      ${sourceLinks}
    </div>
  </article>`;
}

function renderDetail(committee) {
  if (!committee) {
    els.detail.innerHTML = "";
    return;
  }
  const subcommittees = committee.subcommittees || [];
  const hearings = committee.upcomingHearings || [];
  const historicalMeetings = committee.historicalMeetings || [];
  const publishedHearings = committee.publishedHearings || [];
  const historicalNote = data.apiRefresh?.congressGovHistoricalMeetings?.note || "";
  els.detail.innerHTML = `
    <article class="senate-committee-feature">
      <div class="senate-committee-feature-head">
        <div>
          <p class="eyebrow">${escapeHtml(committeeKind(committee))} committee</p>
          <h3>${escapeHtml(committee.displayName)}<span>.</span></h3>
        </div>
        <a class="button secondary" href="${escapeHtml(committee.urls?.membershipUrl || "https://www.senate.gov/committees/?lv=true")}" target="_blank" rel="noopener">Official roster</a>
      </div>
      <div class="senate-leader-grid">
        <div><span>Chair</span><strong>${escapeHtml(memberLine(committee.chair))}</strong></div>
        <div><span>Ranking member</span><strong>${escapeHtml(memberLine(committee.ranking))}</strong></div>
        <div><span>Members</span><strong>${fmt.format(committee.memberCount || 0)}</strong></div>
        <div><span>Events</span><strong>${fmt.format(hearings.length + historicalMeetings.length + publishedHearings.length)}</strong></div>
      </div>
      <div class="senate-detail-columns">
        <section>
          <div class="directory-head compact-head">
            <div><p class="eyebrow">Subcommittees</p><h4>${fmt.format(subcommittees.length)} rosters</h4></div>
          </div>
          <div class="senate-subcommittee-list">
            ${subcommittees.length ? subcommittees.map((subcommittee) => `
              <article>
                <h4>${escapeHtml(subcommittee.displayName)}</h4>
                <p><strong>Chair:</strong> ${escapeHtml(memberLine(subcommittee.chair))}</p>
                <p><strong>Ranking:</strong> ${escapeHtml(memberLine(subcommittee.ranking))}</p>
                ${renderMemberPills(subcommittee.members, 8)}
              </article>
            `).join("") : `<p class="committee-empty">No subcommittees listed in the Senate.gov membership XML.</p>`}
          </div>
        </section>
        <section>
          <div class="directory-head compact-head">
            <div><p class="eyebrow">Meetings and published hearings</p><h4>${fmt.format(hearings.length + historicalMeetings.length + publishedHearings.length)} loaded</h4></div>
          </div>
          <div class="senate-hearing-list">
            ${hearings.length ? `<p class="senate-meeting-label">Upcoming from Senate.gov</p>${hearings.map(renderHearing).join("")}` : ""}
            ${historicalMeetings.length ? `<p class="senate-meeting-label">Historical from Congress.gov</p>${historicalMeetings.slice(0, 20).map(renderHistoricalMeeting).join("")}` : ""}
            ${publishedHearings.length ? `<p class="senate-meeting-label">Published hearings from GovInfo</p>${publishedHearings.slice(0, 20).map(renderPublishedHearing).join("")}` : ""}
            ${historicalMeetings.length > 20 ? `<p class="committee-empty">Showing the 20 most recent historical meetings for this committee.</p>` : ""}
            ${publishedHearings.length > 20 ? `<p class="committee-empty">Showing the 20 most recent published GovInfo hearings for this committee.</p>` : ""}
            ${!hearings.length && !historicalMeetings.length && !publishedHearings.length ? `<p class="committee-empty">${escapeHtml(historicalNote || "No upcoming, historical, or published hearings are loaded for this committee yet.")}</p>` : ""}
          </div>
        </section>
      </div>
    </article>
  `;
}

function renderCard(committee) {
  const selected = state.selectedCode === committee.code;
  const pageUrl = committee.localUrl || `senate-committees/${committee.slug || committee.code}.html`;
  return `<article class="committee-card senate-committee-card${selected ? " selected" : ""}" data-code="${escapeHtml(committee.code)}">
    <div class="committee-card-head">
      <div class="committee-mini-icon" aria-hidden="true"></div>
      <span>${escapeHtml(committeeKind(committee))}</span>
    </div>
    <h2>${escapeHtml(committee.displayName)}</h2>
    <p>${escapeHtml(memberLine(committee.chair))} chairs the committee; ${escapeHtml(memberLine(committee.ranking))} is ranking member.</p>
    <div class="committee-card-metrics">
      <span>${fmt.format(committee.memberCount || 0)} members</span>
      <span>${fmt.format(committee.subcommitteeCount || 0)} subcommittees</span>
      <span>${fmt.format((committee.upcomingHearings?.length || 0) + (committee.historicalMeetings?.length || 0) + (committee.publishedHearings?.length || 0))} events</span>
    </div>
    <div class="senate-committee-card-actions">
      <button class="link-button" type="button" data-code="${escapeHtml(committee.code)}">Preview</button>
      <a class="link-button" href="${escapeHtml(pageUrl)}">Open page</a>
    </div>
  </article>`;
}

function renderNav(rows) {
  els.nav.innerHTML = `<p class="eyebrow">Committees</p>${rows.map((committee) => `
    <button type="button" data-code="${escapeHtml(committee.code)}">
      <span>${escapeHtml(committee.displayName)}</span>
      <strong>${fmt.format(committee.memberCount || 0)}</strong>
    </button>
  `).join("")}`;
}

function render() {
  const rows = visibleCommittees();
  if (!state.selectedCode || !rows.some((committee) => committee.code === state.selectedCode)) {
    state.selectedCode = rows[0]?.code || "";
  }
  const selected = rows.find((committee) => committee.code === state.selectedCode);

  els.heading.textContent = `${fmt.format(rows.length)} Senate committees`;
  els.visible.textContent = `${fmt.format(rows.length)} visible`;
  els.empty.hidden = rows.length > 0;
  renderNav(rows);
  renderDetail(selected);
  els.grid.innerHTML = rows.map(renderCard).join("");
}

function selectCommittee(code) {
  state.selectedCode = code;
  render();
  els.detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindEvents() {
  els.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  els.kind.addEventListener("change", (event) => {
    state.kind = event.target.value;
    render();
  });
  els.party.addEventListener("change", (event) => {
    state.party = event.target.value;
    render();
  });
  els.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) return;
    const trigger = event.target.closest("[data-code]");
    if (trigger) selectCommittee(trigger.dataset.code);
  });
}

renderStats();
bindEvents();
render();
