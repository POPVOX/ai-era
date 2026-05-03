import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const corpusRoot = path.join(root, "Committee Corpus + Witness Directory - CTO Share", "committee-corpus", "metadata");
const eventsPath = path.join(corpusRoot, "events.jsonl");
const documentsPath = path.join(corpusRoot, "documents.jsonl");
const witnessDataPath = path.join(root, "assets", "witness-directory-data.json");
const eventsDir = path.join(root, "events");
const committeeDir = path.join(root, "committees");
const documentBaseUrl = "https://s3.us-east-1.amazonaws.com/static.popvox.com/committees/docs/house-docs-119/";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function readJsonl(file) {
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "item";
}

function formatDate(value) {
  if (!value) return "Date pending";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

function normalizeCommitteeName(name) {
  if (!name) return "Committee";
  if (name.startsWith("Select Committee on the Strategic Competition Between the United States and the Chinese")) {
    return "Select Committee on the Strategic Competition Between the United States and the Chinese Communist Party";
  }
  return name;
}

function docUrl(doc) {
  const filePath = doc.file?.path;
  if (filePath) return documentBaseUrl + filePath.replace(/^data\/house-docs\/119\//, "");
  return doc.url || "";
}

function safeUrl(url) {
  const value = String(url || "").trim();
  if (!value || /^javascript:/i.test(value)) return "";
  return value;
}

function docLabel(type) {
  return ({
    witness_testimony: "Testimony",
    witness_truth_in_testimony: "Truth in Testimony",
    witness_bio: "Bio",
    support_document: "Document",
    amendment: "Amendment",
    bill: "Bill text",
    committee_report: "Report",
  })[type] || String(type || "Document").replace(/_/g, " ");
}

function lastName(name) {
  const parts = String(name || "").replace(/\([^)]*\)/g, "").trim().split(/\s+/);
  return parts[parts.length - 1]?.replace(/[^A-Za-z'-]/g, "").toLowerCase() || "";
}

function initials(name) {
  return String(name || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function slugifyProfile(value) {
  return String(value || "witness")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "witness";
}

function profileLink(profile) {
  if (!profile) return "../witnesses.html";
  return `../witnesses/${slugifyProfile(profile.key || profile.displayName)}.html`;
}

function matchWitnessDocs(witness, eventDocs, profile, eventId) {
  const appearanceDocs = (profile?.appearances || [])
    .find((appearance) => String(appearance.eventId) === String(eventId))
    ?.documents || [];

  if (appearanceDocs.length) return appearanceDocs;

  const lname = lastName(witness.name);
  if (!lname) return [];
  return eventDocs.filter((doc) => {
    const haystack = `${doc.title || ""} ${doc.url || ""}`.toLowerCase();
    return haystack.includes(lname) && /^witness_/.test(doc.documentType || "");
  }).map((doc) => ({
    title: doc.title,
    type: doc.documentType,
    url: docUrl(doc),
  }));
}

function renderDocLinks(docs, className = "event-doc-links") {
  const visibleDocs = docs.filter((doc) => safeUrl(doc.url || docUrl(doc)));
  if (!visibleDocs.length) return "";
  return `<div class="${className}">
    ${visibleDocs.map((doc) => {
      const url = safeUrl(docUrl(doc) || doc.url);
      const label = docLabel(doc.type || doc.documentType);
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><span>${escapeHtml(label)}</span>${escapeHtml(doc.title || "Document")}</a>`;
    }).join("")}
  </div>`;
}

function renderWitness(witness, event, eventDocs, profile) {
  const photo = profile?.links?.photo || "";
  const docs = matchWitnessDocs(witness, eventDocs, profile, event.eventId);
  const role = witness.organizationOrTitle || profile?.title || profile?.organization || "Role from hearing record";
  const org = profile?.organization && profile.organization !== role ? profile.organization : "";
  return `<article class="event-witness-card">
    <a class="event-witness-avatar${photo ? " has-photo" : ""}" href="${escapeHtml(profileLink(profile))}">
      ${photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(initials(witness.name))}
    </a>
    <div>
      <div class="event-witness-head">
        <div>
          <h3><a href="${escapeHtml(profileLink(profile))}">${escapeHtml(witness.name)}</a></h3>
          <p>${escapeHtml(role)}</p>
          ${org ? `<span>${escapeHtml(org)}</span>` : ""}
        </div>
        ${profile?.possibleLobbyist ? `<span class="event-badge coral">Possible LDA match</span>` : ""}
      </div>
      ${profile?.bio ? `<p class="event-witness-bio">${escapeHtml(profile.bio)}</p>` : ""}
      ${renderDocLinks(docs, "event-witness-docs")}
    </div>
  </article>`;
}

function pageShell({ title, description, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>POPVOX | ${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="../styles.css">
  <link rel="icon" type="image/png" href="https://s3.us-east-1.amazonaws.com/static.popvox.com/images/pvox+favicon.png">
</head>
<body>
  <header class="site-header">
    <nav class="nav" aria-label="Primary navigation">
      <a class="brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a>
      <div class="nav-links"><a class="active" href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../about.html">About</a><a href="../team.html">Team</a><a href="../contact.html">Contact</a></div>
      <div class="nav-actions"><a class="button secondary" href="../explore.html">All Explorers</a><a class="button" href="mailto:info@popvox.com">Request a demo</a></div>
    </nav>
  </header>
  ${body}
  <footer class="site-footer"><a class="footer-brand" href="../index.html" aria-label="POPVOX home"><img src="../assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="../explore.html">Explore</a><a href="../news.html">News</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a></div></footer>
</body>
</html>`;
}

const events = readJsonl(eventsPath)
  .map((event) => ({ ...event, committee: normalizeCommitteeName(event.committee) }))
  .filter((event) => event.eventId && event.committee && event.committee !== "Error Encountered");
const documents = readJsonl(documentsPath);
const witnessData = JSON.parse(fs.readFileSync(witnessDataPath, "utf8"));

const docsByEvent = new Map();
for (const doc of documents) {
  if (!docsByEvent.has(String(doc.eventId))) docsByEvent.set(String(doc.eventId), []);
  docsByEvent.get(String(doc.eventId)).push(doc);
}
for (const docs of docsByEvent.values()) {
  docs.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
}

const profilesByEvent = new Map();
for (const profile of witnessData.profiles || []) {
  for (const appearance of profile.appearances || []) {
    const eventId = String(appearance.eventId);
    if (!profilesByEvent.has(eventId)) profilesByEvent.set(eventId, []);
    profilesByEvent.get(eventId).push(profile);
  }
}

fs.mkdirSync(eventsDir, { recursive: true });

for (const event of events) {
  const eventDocs = docsByEvent.get(String(event.eventId)) || event.documents || [];
  const profileCandidates = profilesByEvent.get(String(event.eventId)) || [];
  const eventType = event.eventType || "Event";
  const committeeFile = `${slugify(event.committee)}.html`;
  const committeePage = fs.existsSync(path.join(committeeDir, committeeFile)) ? `../committees/${committeeFile}` : "../committees.html";
  const sourceUrl = safeUrl(event.sourceUrl);
  const publicDocs = eventDocs.filter((doc) => !/^witness_/.test(doc.documentType || ""));
  const witnessCount = event.witnesses?.length || 0;
  const docCount = eventDocs.length;

  const witnessCards = (event.witnesses || []).map((witness) => {
    const lname = lastName(witness.name);
    const profile = profileCandidates.find((candidate) => candidate.key === String(witness.name || "").toLowerCase())
      || profileCandidates.find((candidate) => lastName(candidate.displayName) === lname && String(candidate.displayName || "").toLowerCase().includes(lname));
    return renderWitness(witness, event, eventDocs, profile);
  }).join("");

  const body = `<main class="event-shell">
    <section class="event-hero">
      <a class="back-link" href="${escapeHtml(committeePage)}">← ${escapeHtml(event.committee.replace(/^Committee on /, ""))}</a>
      <p class="eyebrow">${escapeHtml(eventType)}</p>
      <h1>${escapeHtml(event.title || "Untitled event")}<span>.</span></h1>
      <p>${escapeHtml(event.notes || "A source-backed event record from the House committee corpus, with connected witnesses, documents, and official source materials.")}</p>
      <div class="event-actions">
        ${sourceUrl ? `<a class="button" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Official House event</a>` : ""}
        <a class="button secondary" href="../witnesses.html">Witness Explorer</a>
      </div>
    </section>

    <section class="event-facts" aria-label="Event information">
      <article><span>Date</span><strong>${escapeHtml(formatDate(event.calendarDate))}</strong></article>
      <article><span>Time</span><strong>${escapeHtml(event.time || "Time pending")}</strong></article>
      <article><span>Committee</span><strong>${escapeHtml(event.committee)}</strong></article>
      <article><span>Location</span><strong>${escapeHtml(event.location || "Location pending")}</strong></article>
    </section>

    <section class="event-layout">
      <article class="event-main-panel">
        <div class="directory-head">
          <div><p class="eyebrow">Event Info</p><h2>Description and source record</h2></div>
          <span>${escapeHtml(event.eventId)}</span>
        </div>
        <dl class="event-info-list">
          <div><dt>Title</dt><dd>${escapeHtml(event.title || "Untitled event")}</dd></div>
          <div><dt>Committee</dt><dd>${escapeHtml([event.committee, event.subcommittee].filter(Boolean).join(" / "))}</dd></div>
          <div><dt>Date line</dt><dd>${escapeHtml(event.dateLine || [formatDate(event.calendarDate), event.time].filter(Boolean).join(" "))}</dd></div>
          <div><dt>Published</dt><dd>${escapeHtml(event.firstPublished || "Not listed")}</dd></div>
          <div><dt>Last updated</dt><dd>${escapeHtml(event.lastUpdated || "Not listed")}</dd></div>
        </dl>
        <div class="event-future-note">
          <p class="eyebrow">Record intelligence</p>
          <p>This record is organized to support questions about what happened, who testified, what documents changed, and what issues were raised, with citations back to source materials.</p>
        </div>
      </article>

      <aside class="event-side-panel">
        <p class="eyebrow">Record Contents</p>
        <article><strong>${witnessCount}</strong><span>${witnessCount === 1 ? "Witness" : "Witnesses"}</span></article>
        <article><strong>${docCount}</strong><span>${docCount === 1 ? "Document" : "Documents"}</span></article>
        <article><strong>${escapeHtml(eventType)}</strong><span>Event type</span></article>
      </aside>
    </section>

    <section class="event-section">
      <div class="directory-head"><div><p class="eyebrow">Witnesses</p><h2>People connected to this event</h2></div><span>${witnessCount} listed</span></div>
      ${witnessCards || `<div class="empty-state">No witnesses are listed for this event.</div>`}
    </section>

    <section class="event-section">
      <div class="directory-head"><div><p class="eyebrow">Documents</p><h2>Source materials</h2></div><span>${docCount} files</span></div>
      ${renderDocLinks(publicDocs.length ? publicDocs : eventDocs, "event-doc-grid") || `<div class="empty-state">No documents are listed for this event.</div>`}
    </section>
  </main>`;

  fs.writeFileSync(path.join(eventsDir, `${event.eventId}.html`), pageShell({
    title: event.title || `Event ${event.eventId}`,
    description: `${event.committee} ${eventType.toLowerCase()} on ${formatDate(event.calendarDate)}.`,
    body,
  }));
}

for (const file of fs.readdirSync(committeeDir).filter((name) => name.endsWith(".html"))) {
  const fullPath = path.join(committeeDir, file);
  let html = fs.readFileSync(fullPath, "utf8");
  html = html.replace(/<h3(?: data-event-href="[^"]+" tabindex="0" role="link")?>([\s\S]*?)<\/h3>([\s\S]*?)<div class="committee-event-links"><a href="\.\.\/events\/(\d+)\.html">Event page<\/a>/g, (_, title, between, eventId) => {
    return `<h3 data-event-href="../events/${eventId}.html" tabindex="0" role="link">${title}</h3>${between}<div class="committee-event-links">`;
  });
  html = html.replace(/<h3(?![^>]*data-event-href)([^>]*)>([\s\S]*?)<\/h3>([\s\S]*?)<div class="committee-event-links"><a href="https:\/\/docs\.house\.gov\/Committee\/Calendar\/ByEvent\.aspx\?EventID=(\d+)" target="_blank" rel="noopener">House event<\/a>/g, (_, attrs, title, between, eventId) => {
    return `<h3${attrs} data-event-href="../events/${eventId}.html" tabindex="0" role="link">${title}</h3>${between}<div class="committee-event-links"><a href="https://docs.house.gov/Committee/Calendar/ByEvent.aspx?EventID=${eventId}" target="_blank" rel="noopener">House event</a>`;
  });
  html = html.replace(/<a href="\.\.\/events\/\d+\.html">Event page<\/a>/g, "");
  html = html.replace(/<article class="committee-event">[\s\S]*?<\/article>/g, (article) => {
    const eventId = article.match(/EventID=(\d+)/)?.[1] || article.match(/\.\.\/events\/(\d+)\.html/)?.[1];
    if (!eventId) return article;
    return article
      .replace(/<a href="\.\.\/events\/\d+\.html">Event page<\/a>/g, "")
      .replace(/<h3(?: data-event-href="[^"]+" tabindex="0" role="link")?>/, `<h3 data-event-href="../events/${eventId}.html" tabindex="0" role="link">`);
  });
  html = html.replace(/<aside class="subcommittee-panel">[\s\S]*?<\/aside>/, (aside) => aside.replace(/ data-event-href="[^"]+" tabindex="0" role="link"/g, ""));
  fs.writeFileSync(fullPath, html);
}

console.log(`Generated ${new Set(events.map((event) => String(event.eventId))).size} unique event pages from ${events.length} corpus records.`);
