import fs from "node:fs";
import path from "node:path";
import {
  escapeHtml,
  eventsPath,
  formatDate,
  normalizeCommitteeName,
  readJsonl,
  root,
  slugify,
} from "./house-committee-utils.mjs";

const outDir = path.join(root, "committees");
const indexPath = path.join(root, "committees.html");

function pageShell({ title, description, body, prefix = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>POPVOX | ${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="${prefix}styles.css">
  <link rel="icon" type="image/png" href="https://s3.us-east-1.amazonaws.com/static.popvox.com/images/pvox+favicon.png">
</head>
<body>
  <header class="site-header">
    <nav class="nav" aria-label="Primary navigation">
      <a class="brand" href="${prefix}index.html" aria-label="POPVOX home"><img src="${prefix}assets/popvox-logo-horizontal.png" alt="POPVOX"></a>
      <div class="nav-links"><a class="active" href="${prefix}explore.html">Explore</a><a href="${prefix}news.html">News</a><a href="${prefix}about.html">About</a><a href="${prefix}team.html">Team</a><a href="${prefix}contact.html">Contact</a></div>
      <div class="nav-actions"><a class="button secondary" href="${prefix}committees.html">Committee Explorer</a></div>
    </nav>
  </header>
  ${body}
  <footer class="site-footer"><a class="footer-brand" href="${prefix}index.html" aria-label="POPVOX home"><img src="${prefix}assets/popvox-logo-horizontal.png" alt="POPVOX"></a><div class="footer-links"><a href="${prefix}explore.html">Explore</a><a href="${prefix}news.html">News</a><a href="${prefix}contact.html">Contact</a><a href="${prefix}privacy.html">Privacy</a><a href="${prefix}terms.html">Terms</a></div></footer>
${prefix ? '<script src="../committee-detail.js"></script>' : ""}
</body>
</html>`;
}

function eventKind(event) {
  return String(event.eventType || "Event").toLowerCase();
}

function summarizeSubcommittee(events) {
  const map = new Map();
  for (const event of events) {
    if (!event.subcommittee) continue;
    if (!map.has(event.subcommittee)) {
      map.set(event.subcommittee, { name: event.subcommittee, hearings: 0, markups: 0, other: 0, latest: "" });
    }
    const row = map.get(event.subcommittee);
    const kind = eventKind(event);
    if (kind.includes("hearing")) row.hearings += 1;
    else if (kind.includes("markup")) row.markups += 1;
    else row.other += 1;
    if (event.calendarDate > row.latest) row.latest = event.calendarDate;
  }
  return [...map.values()].sort((a, b) => String(b.latest).localeCompare(String(a.latest)) || a.name.localeCompare(b.name));
}

function committeeStats(events) {
  const hearings = events.filter((event) => eventKind(event).includes("hearing")).length;
  const markups = events.filter((event) => eventKind(event).includes("markup")).length;
  const subcommittees = new Set(events.map((event) => event.subcommittee).filter(Boolean)).size;
  const witnesses = events.reduce((sum, event) => sum + (event.witnesses?.length || 0), 0);
  const latest = events.reduce((max, event) => event.calendarDate > max ? event.calendarDate : max, "");
  return { events: events.length, hearings, markups, subcommittees, witnesses, latest };
}

function renderEvent(event) {
  const kind = eventKind(event);
  const witnessCount = event.witnesses?.length || 0;
  const docCount = event.documents?.length || 0;
  const sourceUrl = event.sourceUrl || `https://docs.house.gov/Committee/Calendar/ByEvent.aspx?EventID=${event.eventId}`;
  const localEventPath = path.join(root, "events", `${event.eventId}.html`);
  const eventHref = fs.existsSync(localEventPath) ? `../events/${event.eventId}.html` : sourceUrl;
  const locationText = [event.subcommittee, event.location].map((value) => String(value || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ");
  return `<article class="committee-event"><div><span class="event-type ${escapeHtml(kind)}">${escapeHtml(event.eventType || "Event")}</span><strong>${escapeHtml(formatDate(event.calendarDate))}</strong></div><h3 data-event-href="${escapeHtml(eventHref)}" tabindex="0" role="link">${escapeHtml(event.title || "Untitled event")}</h3><p>${escapeHtml(locationText)}</p><div class="committee-event-links"><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">House event</a>${witnessCount ? `<span>${witnessCount} witness${witnessCount === 1 ? "" : "es"}</span>` : ""}${docCount ? `<span>${docCount} doc${docCount === 1 ? "" : "s"}</span>` : ""}</div></article>`;
}

function renderCommitteePage(committee, events) {
  const stats = committeeStats(events);
  const subcommittees = summarizeSubcommittee(events);
  const body = `<main class="committee-detail-shell"><section class="committee-detail-hero"><a class="back-link" href="../committees.html">← Committee Explorer</a><p class="eyebrow">Committee</p><h1>${escapeHtml(committee)}<span>.</span></h1><p>${stats.events} events in the current House committee corpus, including ${stats.hearings} hearings and ${stats.markups} markups.</p></section><section class="committee-stats" aria-label="Committee statistics"><article><strong>${stats.events}</strong><span>Events</span></article><article><strong>${stats.hearings}</strong><span>Hearings</span></article><article><strong>${stats.markups}</strong><span>Markups</span></article><article><strong>${stats.subcommittees}</strong><span>Subcommittees</span></article></section><section class="committee-detail-layout"><aside class="subcommittee-panel"><p class="eyebrow">Subcommittees</p>${subcommittees.length ? subcommittees.map((item) => `<article><h3>${escapeHtml(item.name)}</h3><p>${item.hearings} hearings · ${item.markups} markups · ${item.other} other events</p><span>Latest: ${escapeHtml(formatDate(item.latest))}</span></article>`).join("\n") : '<article><h3>Full committee</h3><p>No subcommittees listed in the current corpus.</p></article>'}</aside><section class="committee-events-panel"><div class="directory-head"><div><p class="eyebrow">Hearings and Markups</p><h2>Committee activity</h2></div><span>${escapeHtml(formatDate(stats.latest))}</span></div><div class="committee-event-list">${events.map(renderEvent).join("\n")}</div></section></section></main>`;
  return pageShell({
    title: committee,
    description: `${committee} hearings, markups, subcommittees, witnesses, and committee records.`,
    body,
    prefix: "../",
  });
}

const byEventId = new Map();
for (const event of readJsonl(eventsPath)) {
  if (!event.eventId) continue;
  byEventId.set(String(event.eventId), { ...event, committee: normalizeCommitteeName(event.committee) });
}
const events = [...byEventId.values()].filter((event) => event.committee && !/error encountered/i.test(event.committee));
events.sort((a, b) => String(b.calendarDate || "").localeCompare(String(a.calendarDate || "")) || String(b.eventId).localeCompare(String(a.eventId)));

const committees = new Map();
for (const event of events) {
  if (!committees.has(event.committee)) committees.set(event.committee, []);
  committees.get(event.committee).push(event);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const committeeRows = [...committees.entries()].map(([name, rows]) => {
  const stats = committeeStats(rows);
  const slug = slugify(name);
  fs.writeFileSync(path.join(outDir, `${slug}.html`), renderCommitteePage(name, rows));
  return { name, slug, ...stats };
}).sort((a, b) => b.events - a.events || a.name.localeCompare(b.name));

const totals = {
  committees: committeeRows.length,
  events: events.length,
  hearings: events.filter((event) => eventKind(event).includes("hearing")).length,
  markups: events.filter((event) => eventKind(event).includes("markup")).length,
};

const body = `<main class="committee-shell"><section class="page-hero committee-hero"><div><p class="eyebrow">House Committee Explorer</p><h1>Browse House committees, hearings, and markups<span>.</span></h1></div><p>Search the House committee corpus: committees, subcommittees, hearing calendars, markup activity, witnesses, and source documents.</p></section><section class="committee-stats" aria-label="House committee corpus statistics"><article><strong>${totals.committees}</strong><span>House committees</span></article><article><strong>${totals.events}</strong><span>Events</span></article><article><strong>${totals.hearings}</strong><span>Hearings</span></article><article><strong>${totals.markups}</strong><span>Markups</span></article></section><section class="committee-index-grid" aria-label="House committees">${committeeRows.map((row) => `<article class="committee-card"><div class="committee-card-head"><div class="committee-mini-icon" aria-hidden="true"></div><span>${escapeHtml(formatDate(row.latest))}</span></div><h2>${escapeHtml(row.name)}</h2><p>${row.events} events including ${row.hearings} hearings and ${row.markups} markups.</p><div class="committee-card-metrics"><span>${row.subcommittees} subcommittees</span><span>${row.witnesses} witness slots</span></div><a class="link-button" href="committees/${escapeHtml(row.slug)}.html">Open committee</a></article>`).join("\n")}</section></main>`;

fs.writeFileSync(indexPath, pageShell({
  title: "House Committee Explorer",
  description: "Browse House committees, subcommittees, hearings, markups, witnesses, and documents.",
  body,
}));

console.log(`Generated ${committeeRows.length} House committee pages from ${events.length} events.`);
