import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "assets", "senate-committee-data.json");
const jsPath = path.join(root, "assets", "senate-committee-data.js");
const pagesDir = path.join(root, "senate-committees");

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmt = new Intl.NumberFormat("en-US");

function escapeHtml(value = "") {
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
  return Number.isNaN(date.getTime()) ? String(value) : dateFmt.format(date);
}

function memberLine(member) {
  if (!member) return "Not listed";
  return `${member.name} (${member.party}-${member.state})`;
}

function committeeKind(committee) {
  if (/^Joint/i.test(committee.displayName || committee.name)) return "Joint";
  if (/^(Select|Special)/i.test(committee.displayName || committee.name)) return "Select or Special";
  if (/Caucus|Commission/i.test(committee.displayName || committee.name)) return "Other";
  return "Standing";
}

function renderMemberPills(members = [], limit = 18) {
  const visible = members.slice(0, limit);
  if (!visible.length) return `<p class="committee-empty">No members listed in this source.</p>`;
  return `<div class="senate-member-pills">
    ${visible.map((member) => `<span>${escapeHtml(member.name)} <small>${escapeHtml(member.party)}-${escapeHtml(member.state)}</small></span>`).join("")}
    ${members.length > visible.length ? `<span>${fmt.format(members.length - visible.length)} more</span>` : ""}
  </div>`;
}

function renderSubcommittee(subcommittee) {
  return `<article>
    <h4>${escapeHtml(subcommittee.displayName || subcommittee.name)}</h4>
    <p><strong>Chair:</strong> ${escapeHtml(memberLine(subcommittee.chair))}</p>
    <p><strong>Ranking:</strong> ${escapeHtml(memberLine(subcommittee.ranking))}</p>
    ${renderMemberPills(subcommittee.members || [], 10)}
  </article>`;
}

function renderPublishedHearing(hearing) {
  const witnesses = hearing.witnesses || [];
  const witnessLinks = witnesses.slice(0, 5).map((witness) => (
    witness.profileUrl
      ? `<a href="../${escapeHtml(witness.profileUrl)}">${escapeHtml(witness.displayName)}</a>`
      : `<span>${escapeHtml(witness.displayName)}</span>`
  )).join("");
  return `<article class="senate-hearing-row published">
    <div>
      <span>${escapeHtml(formatDate(hearing.date || hearing.dateIssued))} | GovInfo published hearing</span>
      <h4>${hearing.localUrl ? `<a href="../${escapeHtml(hearing.localUrl)}">${escapeHtml(hearing.title || "Published Senate hearing")}</a>` : escapeHtml(hearing.title || "Published Senate hearing")}</h4>
      <p>${fmt.format(hearing.witnessCount || witnesses.length || 0)} extracted witness slots${hearing.packageId ? ` | ${escapeHtml(hearing.packageId)}` : ""}</p>
      ${witnessLinks ? `<div class="senate-witness-mini-list">${witnessLinks}${witnesses.length > 5 ? `<span>${fmt.format(witnesses.length - 5)} more</span>` : ""}</div>` : ""}
    </div>
    <div class="witness-link-row">
      ${hearing.localUrl ? `<a href="../${escapeHtml(hearing.localUrl)}">Event page</a>` : ""}
      ${hearing.pdfUrl ? `<a href="${escapeHtml(hearing.pdfUrl)}" target="_blank" rel="noopener">PDF</a>` : ""}
      ${hearing.htmlUrl ? `<a href="${escapeHtml(hearing.htmlUrl)}" target="_blank" rel="noopener">HTML</a>` : ""}
    </div>
  </article>`;
}

function renderHistoricalMeeting(meeting) {
  const witnessCount = meeting.witnesses?.length || 0;
  const documentCount = (meeting.witnessDocuments?.length || 0) + (meeting.meetingDocuments?.length || 0);
  const relatedCount = (meeting.bills?.length || 0) + (meeting.nominations?.length || 0);
  return `<article class="senate-hearing-row historical">
    <div>
      <span>${escapeHtml(formatDate(meeting.date))}${meeting.status ? ` | ${escapeHtml(meeting.status)}` : ""}</span>
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

function renderUpcomingHearing(hearing) {
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

function renderCommitteePage(committee, data) {
  const subcommittees = committee.subcommittees || [];
  const upcoming = committee.upcomingHearings || [];
  const historical = committee.historicalMeetings || [];
  const published = committee.publishedHearings || [];
  const events = upcoming.length + historical.length + published.length;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>POPVOX | Senate ${escapeHtml(committee.displayName)}</title>
  <meta name="description" content="Senate ${escapeHtml(committee.displayName)} committee roster, subcommittees, meetings, published hearings, and witness links.">
  <link rel="stylesheet" href="../styles.css">
  <link rel="icon" type="image/png" href="https://s3.us-east-1.amazonaws.com/static.popvox.com/images/pvox+favicon.png">
</head>
<body>
  <header class="site-header">
    <nav class="nav" aria-label="Primary navigation">
      <a class="brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a>
      <div class="nav-links"><a class="active" href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../about.html">About</a><a href="../team.html">Team</a><a href="../contact.html">Contact</a></div>
      <div class="nav-actions"><a class="button secondary" href="../senate-committees.html">Senate Committee Explorer</a></div>
    </nav>
  </header>

  <main class="committee-detail-shell senate-committee-page-shell">
    <section class="committee-detail-hero">
      <a class="back-link" href="../senate-committees.html">← Senate Committee Explorer</a>
      <p class="eyebrow">Senate ${escapeHtml(committeeKind(committee))} committee</p>
      <h1>${escapeHtml(committee.displayName)}<span>.</span></h1>
      <p>Current roster, subcommittees, meetings, and published hearing records connected from Senate.gov, Congress.gov, and GovInfo.</p>
    </section>

    <section class="event-facts" aria-label="Senate committee summary">
      <article><span>Chair</span><strong>${escapeHtml(memberLine(committee.chair))}</strong></article>
      <article><span>Ranking member</span><strong>${escapeHtml(memberLine(committee.ranking))}</strong></article>
      <article><span>Members</span><strong>${fmt.format(committee.memberCount || 0)}</strong></article>
      <article><span>Events loaded</span><strong>${fmt.format(events)}</strong></article>
    </section>

    <section class="committee-detail-layout">
      <aside class="committee-detail-sidebar">
        <div class="sidebar-block">
          <p class="eyebrow">Sources</p>
          <p>Roster data comes from current Senate.gov XML. Historical meetings come from Congress.gov. Published hearing pages come from GovInfo records matched by committee name.</p>
          ${committee.urls?.membershipUrl ? `<p><a href="${escapeHtml(committee.urls.membershipUrl)}" target="_blank" rel="noopener">Official Senate roster</a></p>` : ""}
        </div>
        <div class="sidebar-block">
          <p class="eyebrow">Loaded records</p>
          <p>${fmt.format(subcommittees.length)} subcommittees</p>
          <p>${fmt.format(upcoming.length)} upcoming Senate.gov meetings</p>
          <p>${fmt.format(historical.length)} Congress.gov meetings</p>
          <p>${fmt.format(published.length)} published GovInfo hearings</p>
        </div>
        <div class="sidebar-block">
          <p class="eyebrow">Data note</p>
          <p>${escapeHtml(data.apiRefresh?.govInfoPublishedHearings?.note || "Published hearings are linked when committee names can be matched.")}</p>
        </div>
      </aside>

      <section class="committee-detail-main">
        <div class="directory-head"><div><p class="eyebrow">Members</p><h2>Current roster</h2></div><span>${fmt.format(committee.memberCount || 0)} senators</span></div>
        <article class="event-main-panel">${renderMemberPills(committee.members || [], 60)}</article>

        <div class="directory-head"><div><p class="eyebrow">Subcommittees</p><h2>Subcommittee rosters</h2></div><span>${fmt.format(subcommittees.length)} loaded</span></div>
        <div class="senate-subcommittee-list">${subcommittees.length ? subcommittees.map(renderSubcommittee).join("") : `<p class="committee-empty">No subcommittees listed in the Senate.gov membership XML.</p>`}</div>

        <div class="directory-head"><div><p class="eyebrow">Published hearings</p><h2>GovInfo hearing records</h2></div><span>${fmt.format(published.length)} linked</span></div>
        <div class="senate-hearing-list">${published.length ? published.slice(0, 40).map(renderPublishedHearing).join("") : `<p class="committee-empty">No published GovInfo hearings are linked to this committee yet.</p>`}</div>

        <div class="directory-head"><div><p class="eyebrow">Committee meetings</p><h2>Congress.gov and Senate.gov records</h2></div><span>${fmt.format(upcoming.length + historical.length)} loaded</span></div>
        <div class="senate-hearing-list">
          ${upcoming.length ? `<p class="senate-meeting-label">Upcoming from Senate.gov</p>${upcoming.map(renderUpcomingHearing).join("")}` : ""}
          ${historical.length ? `<p class="senate-meeting-label">Historical from Congress.gov</p>${historical.slice(0, 40).map(renderHistoricalMeeting).join("")}` : ""}
          ${!upcoming.length && !historical.length ? `<p class="committee-empty">No Senate.gov or Congress.gov meeting records are loaded for this committee yet.</p>` : ""}
        </div>
      </section>
    </section>
  </main>

  <footer class="site-footer"><a class="footer-brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></footer>
</body>
</html>`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const committees = data.committees || [];
  fs.rmSync(pagesDir, { recursive: true, force: true });
  fs.mkdirSync(pagesDir, { recursive: true });
  const manifest = {};
  for (const committee of committees) {
    const slug = committee.slug || committee.code;
    committee.localUrl = `senate-committees/${slug}.html`;
    manifest[committee.code || slug] = committee.localUrl;
    fs.writeFileSync(path.join(pagesDir, `${slug}.html`), renderCommitteePage(committee, data));
  }
  fs.writeFileSync(path.join(pagesDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(jsPath, `window.SENATE_COMMITTEE_DATA = ${JSON.stringify(data)};\n`);
  console.log(`Generated ${committees.length} Senate committee pages.`);
}

main();
