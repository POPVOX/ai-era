import { spawnSync } from "node:child_process";
import {
  decodeHtml,
  documentsPath,
  eventsPath,
  isoDateFromLongDate,
  readJsonl,
  stripTags,
  writeJsonl,
} from "./house-committee-utils.mjs";

const baseUrl = "https://docs.house.gov/Committee/Calendar";
const args = new Set(process.argv.slice(2));
const shouldBuild = args.has("--build");
const daysBack = Number(process.env.HOUSE_DOCS_DAYS_BACK || 21);
const daysAhead = Number(process.env.HOUSE_DOCS_DAYS_AHEAD || 75);
const delayMs = Number(process.env.HOUSE_DOCS_DELAY_MS || 400);
const maxEvents = Number(process.env.HOUSE_DOCS_MAX_EVENTS || 0);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, tries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "POPVOX committee explorer refresh (contact: info@popvox.com)" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < tries) await sleep(500 * attempt);
    }
  }
  throw lastError;
}

function dayId(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm}${dd}${yyyy}`;
}

function dateWindow() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const rows = [];
  for (let offset = -daysBack; offset <= daysAhead; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    rows.push(date);
  }
  return rows;
}

function normalizeUrl(url) {
  const value = decodeHtml(url || "");
  if (!value) return "";
  return value.startsWith("http") ? value.replace(/^http:/, "https:") : new URL(value, "https://docs.house.gov/Committee/Calendar/").href.replace(/^http:/, "https:");
}

function section(content, start, endPattern = /<h2>|<p class="lastUpdated"/i) {
  const startIndex = content.search(start);
  if (startIndex < 0) return "";
  const rest = content.slice(startIndex);
  const endIndex = rest.slice(8).search(endPattern);
  return endIndex < 0 ? rest : rest.slice(0, endIndex + 8);
}

function addedText(block) {
  const match = block.match(/<strong class="newFlags">\s*([\s\S]*?)<\/strong>/i);
  return match ? stripTags(match[1]) : "";
}

function documentType(sectionTitle, title) {
  const text = `${sectionTitle} ${title}`.toLowerCase();
  if (text.includes("truth in testimony")) return "witness_truth_in_testimony";
  if (text.includes("witness") && /bio|biography|cv/.test(text)) return "witness_bio";
  if (text.includes("witness") && /testimony|statement/.test(text)) return "witness_testimony";
  if (text.includes("amendment")) return "amendment";
  if (text.includes("text of legislation") || /\bh\.?\s*r\.?\b|\bh\.?\s*res\.?\b|\bbill\b/i.test(title)) return "bill";
  if (text.includes("notice")) return "notice";
  if (text.includes("memorandum")) return "memorandum";
  if (text.includes("report")) return "committee_report";
  return "support_document";
}

function parseDocuments(content, event, sectionTitle, ordinalStart = 1) {
  const docs = [];
  let ordinal = ordinalStart;
  const blocks = [...content.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  for (const match of blocks) {
    const block = match[1];
    const href = block.match(/href="([^"]+)"/i)?.[1];
    if (!href) continue;
    const title = stripTags(block.replace(/\[[\s\S]*?PDF[\s\S]*?\]/i, "").replace(/<strong class="newFlags">[\s\S]*?<\/strong>/i, ""));
    docs.push({
      title: title || sectionTitle,
      documentType: documentType(sectionTitle, title),
      format: href.toLowerCase().includes(".pdf") ? "pdf" : "",
      url: normalizeUrl(href),
      addedOrUpdated: addedText(block),
      ordinal: ordinal++,
      eventId: event.eventId,
      committee: event.committee,
      subcommittee: event.subcommittee,
      eventDate: event.calendarDate,
      eventTitle: event.title,
      congress: event.congress,
    });
  }
  return docs;
}

function parseWitnesses(content) {
  const witnesses = [];
  const panels = [...content.matchAll(/<div class="witnessPanel">([\s\S]*?)<\/div>/gi)];
  panels.forEach((match, index) => {
    const panel = match[1];
    const name = stripTags(panel.match(/<p>\s*<strong>([\s\S]*?)<\/strong>/i)?.[1] || "");
    const role = stripTags(panel.match(/<small class="text-small">([\s\S]*?)<\/small>/i)?.[1] || "");
    if (!name) return;
    witnesses.push({
      ordinal: index + 1,
      name,
      organizationOrTitle: role,
      addedOrUpdated: addedText(panel),
      rawText: stripTags(panel),
    });
  });
  return witnesses;
}

function parseEvent(eventId, html) {
  const content = html.match(/<div id="DivMeetingContent">([\s\S]*?)<\/div>\s*<br/i)?.[1] || html;
  const h1 = content.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] || "";
  const h1Text = stripTags(h1).replace(/\s+/g, " ").trim();
  const eventType = h1Text.match(/(Field\s+)?(Hearing|Meeting|Markup):/i)?.[0]?.replace(":", "").replace(/\s+/g, " ") || "Event";
  const title = h1Text.replace(/^(Field\s+)?(Hearing|Meeting|Markup):\s*/i, "").replace(/\s*\([^)]*Committee[^)]*\)\s*$/, "").trim();
  const committeeLine = stripTags(h1.match(/<blockquote>[\s\S]*?<p>([\s\S]*?)<\/p>[\s\S]*?<\/blockquote>/i)?.[1] || "");
  const subcommitteeMatch = committeeLine.match(/^(Subcommittee[^()]+)\s+\(([^)]+)\)/i);
  const committee = subcommitteeMatch ? subcommitteeMatch[2].trim() : committeeLine.split("\n")[0]?.trim();
  const subcommittee = subcommitteeMatch ? subcommitteeMatch[1].trim() : "";
  const dateLine = stripTags(content.match(/<p class="meetingTime">([\s\S]*?)<\/p>/i)?.[1] || "");
  const calendarDate = isoDateFromLongDate(dateLine.split("(")[0]);
  const time = dateLine.match(/\(([^)]+)\)/)?.[1] || "";
  const location = stripTags(content.match(/<blockquote class="location">([\s\S]*?)<\/blockquote>/i)?.[1] || "");
  const lastUpdated = stripTags(content.match(/<p class="lastUpdated">([\s\S]*?)<\/p>/i)?.[1] || "");
  const firstPublished = lastUpdated.match(/First Published:\s*([^\n]+(?:\n[^\n]+)?)/i)?.[1]?.replace(/\n/g, " ").trim() || "";
  const updated = lastUpdated.match(/Last Updated:\s*([^\n]+(?:\n[^\n]+)?)/i)?.[1]?.replace(/\n/g, " ").trim() || "";

  const event = {
    congress: 119,
    eventId: String(eventId),
    sourceUrl: `${baseUrl}/ByEvent.aspx?EventID=${eventId}`,
    calendarDate,
    title: decodeHtml(title),
    time,
    location,
    committee: decodeHtml(committee || "Committee"),
    subcommittee: decodeHtml(subcommittee || ""),
    statusFlags: [],
    eventType: decodeHtml(eventType),
    dateLine,
    notes: "",
    firstPublished,
    lastUpdated: updated,
    topics: title ? [decodeHtml(title)] : [],
    keywords: decodeHtml(title).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3).slice(0, 12),
    witnesses: parseWitnesses(content),
    documents: [],
    raw: {
      hasMeetingXmlPostback: /LinkButtonDownloadMtgXML/.test(html),
      hasMeetingPackagePostback: /LinkButtonDownloadMtgPackage/.test(html),
    },
    collectedAt: new Date().toISOString(),
  };

  const docSections = [
    ["Witnesses", section(content, /<h2>\s*Witnesses\s*<\/h2>/i, /<h2>|<p class="lastUpdated"/i)],
    ["Text of Legislation", section(content, /<h2>\s*Text of Legislation\s*<\/h2>/i, /<h2>|<p class="lastUpdated"/i)],
    ["Support Documents", section(content, /<h2>\s*Support Documents\s*<\/h2>/i, /<h2>|<p class="lastUpdated"/i)],
  ];
  let ordinal = 1;
  for (const [label, htmlSection] of docSections) {
    const docs = parseDocuments(htmlSection, event, label, ordinal);
    ordinal += docs.length;
    event.documents.push(...docs.map(({ ordinal: _ordinal, eventId: _eventId, committee: _committee, subcommittee: _subcommittee, eventDate: _eventDate, eventTitle: _eventTitle, congress: _congress, ...doc }) => doc));
  }
  return {
    event,
    documents: event.documents.map((doc, index) => ({
      congress: event.congress,
      eventId: event.eventId,
      committee: event.committee,
      subcommittee: event.subcommittee,
      eventDate: event.calendarDate,
      eventTitle: event.title,
      ordinal: index + 1,
      ...doc,
    })),
  };
}

async function discoverEventIds() {
  const ids = new Set();
  for (const date of dateWindow()) {
    const url = `${baseUrl}/ByDay.aspx?DayID=${dayId(date)}`;
    const html = await fetchText(url);
    for (const match of html.matchAll(/ByEvent\.aspx\?EventID=(\d+)/g)) ids.add(match[1]);
    await sleep(delayMs);
  }
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

const existingEvents = readJsonl(eventsPath);
const existingDocuments = readJsonl(documentsPath);
const eventsById = new Map(existingEvents.map((event) => [String(event.eventId), event]));
const documentsByKey = new Map(existingDocuments.map((doc) => [`${doc.eventId}:${doc.url || doc.title}`, doc]));

let eventIds = await discoverEventIds();
if (maxEvents > 0) eventIds = eventIds.slice(0, maxEvents);
let changedEvents = 0;
let changedDocuments = 0;

for (const eventId of eventIds) {
  const html = await fetchText(`${baseUrl}/ByEvent.aspx?EventID=${eventId}`);
  const { event, documents } = parseEvent(eventId, html);
  const old = eventsById.get(eventId);
  if (old) event.collectedAt = old.collectedAt || event.collectedAt;
  const shouldUpdateEvent = !old
    || String(old.lastUpdated || "") !== String(event.lastUpdated || "")
    || String(old.firstPublished || "") !== String(event.firstPublished || "")
    || String(old.title || "") !== String(event.title || "")
    || String(old.calendarDate || "") !== String(event.calendarDate || "")
    || (old.witnesses?.length || 0) !== (event.witnesses?.length || 0)
    || (old.documents?.length || 0) !== (event.documents?.length || 0);
  if (shouldUpdateEvent) {
    eventsById.set(eventId, event);
    changedEvents += 1;
  }
  for (const doc of documents) {
    const key = `${doc.eventId}:${doc.url || doc.title}`;
    const oldDoc = documentsByKey.get(key);
    if (JSON.stringify(oldDoc || null) !== JSON.stringify(doc)) {
      documentsByKey.set(key, doc);
      changedDocuments += 1;
    }
  }
  await sleep(delayMs);
}

const sortedEvents = [...eventsById.values()].sort((a, b) => String(a.calendarDate || "").localeCompare(String(b.calendarDate || "")) || Number(a.eventId) - Number(b.eventId));
const sortedDocuments = [...documentsByKey.values()].sort((a, b) => Number(a.eventId) - Number(b.eventId) || (a.ordinal || 0) - (b.ordinal || 0));
writeJsonl(eventsPath, sortedEvents);
writeJsonl(documentsPath, sortedDocuments);

console.log(`Scanned ${eventIds.length} docs.house.gov events. Updated ${changedEvents} event records and ${changedDocuments} document records.`);

if (shouldBuild) {
  const result = spawnSync("npm", ["run", "build:house-committees"], { stdio: "inherit", shell: false });
  if (result.status) process.exit(result.status);
}
