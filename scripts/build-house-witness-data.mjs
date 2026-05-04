import fs from "node:fs";
import path from "node:path";
import {
  cleanName,
  corpusDir,
  readJsonl,
  root,
} from "./house-committee-utils.mjs";

const stagedDir = path.join(root, "Committee Corpus + Witness Directory - CTO Share", "witness-directory", "data", "witness-profiles-staged");
const seedPath = path.join(stagedDir, "witness-enrichment-seed.json");
const witnessJsonlPath = path.join(stagedDir, "witnesses.jsonl");
const ldaDir = path.join(root, "Committee Corpus + Witness Directory - CTO Share", "witness-directory", "data", "lda-normalized");
const outJson = path.join(root, "assets", "witness-directory-data.json");
const outJs = path.join(root, "assets", "witness-directory-data.js");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function mergeSeedRecord(target, record) {
  const names = [
    record.seedKey,
    record.displayName,
    record.name,
    record.normalizedName,
    ...(Array.isArray(record.aliases) ? record.aliases : []),
  ].map(cleanName).filter(Boolean);
  for (const name of new Set(names)) {
    target[name] = {
      ...(target[name] || {}),
      ...record,
      links: {
        ...((target[name] || {}).links || {}),
        ...(record.links || {}),
      },
    };
  }
}

function readSeed() {
  const seed = {};
  for (const [key, value] of Object.entries(readJson(seedPath, {}))) {
    mergeSeedRecord(seed, { ...value, seedKey: key, displayName: value.displayName || key });
  }
  for (const record of readJsonl(witnessJsonlPath)) mergeSeedRecord(seed, record);
  if (fs.existsSync(stagedDir)) {
    for (const file of fs.readdirSync(stagedDir)) {
      if (/^parly-enrichment-.+\.jsonl$/.test(file)) {
        for (const record of readJsonl(path.join(stagedDir, file))) mergeSeedRecord(seed, record);
      }
    }
  }
  return seed;
}

function readLdaMatches() {
  const filings = new Map(readJsonl(path.join(ldaDir, "filings.jsonl")).map((filing) => [filing.filing_uuid, filing]));
  const byName = new Map();
  for (const link of readJsonl(path.join(ldaDir, "lobbyist-filing-links.jsonl"))) {
    const nameKey = cleanName(link.lobbyist_name);
    if (!nameKey) continue;
    const filing = filings.get(link.filing_uuid) || {};
    const row = {
      lobbyistId: link.lobbyist_id,
      lobbyistName: link.lobbyist_name,
      filingUuid: link.filing_uuid,
      filingYear: link.filing_year,
      filingPeriod: link.filing_period,
      filingType: filing.filing_type_display || filing.filing_type || "",
      registrantName: link.registrant_name || filing.registrant_name || "",
      clientName: link.client_name || filing.client_name || "",
      filingUrl: filing.filing_document_url || filing.source_api_url || "",
      sourceApiUrl: filing.source_api_url || "",
      matchBasis: "exact normalized name",
      confidence: "possible",
    };
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(row);
  }
  for (const [nameKey, rows] of byName.entries()) {
    const seen = new Set();
    byName.set(nameKey, rows.filter((row) => {
      const key = `${row.filingUuid}:${row.lobbyistId}:${row.clientName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => String(b.filingYear).localeCompare(String(a.filingYear)) || String(b.filingPeriod).localeCompare(String(a.filingPeriod))));
  }
  return byName;
}

function isWitnessDoc(doc) {
  return ["witness_testimony", "witness_truth_in_testimony", "witness_bio"].includes(doc.documentType);
}

function docsByWitness(event) {
  const assigned = new Map((event.witnesses || []).map((_, index) => [index, []]));
  const byType = {};
  for (const doc of event.documents || []) {
    if (!isWitnessDoc(doc)) continue;
    byType[doc.documentType] ||= [];
    byType[doc.documentType].push(doc);
  }
  for (const docs of Object.values(byType)) {
    docs.forEach((doc, index) => {
      if (assigned.has(index)) assigned.get(index).push(doc);
    });
  }
  return assigned;
}

function keyFor(witness, seed) {
  const name = cleanName(witness.name);
  if (seed[name]) return name;
  return name;
}

function topCommittees(profiles) {
  const committees = new Map();
  for (const profile of profiles) {
    for (const appearance of profile.appearances || []) {
      const name = appearance.committee || "Unknown committee";
      committees.set(name, (committees.get(name) || 0) + 1);
    }
  }
  return [...committees.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const events = readJsonl(path.join(corpusDir, "events.jsonl"));
const seed = readSeed();
const ldaMatches = readLdaMatches();
const previousDirectory = readJson(outJson, { profiles: [] });
const previousProfiles = new Map((previousDirectory.profiles || []).map((profile) => [cleanName(profile.key || profile.displayName), profile]));
const profiles = new Map();
const seenAppearances = new Set();

for (const event of events) {
  const docMap = docsByWitness(event);
  (event.witnesses || []).forEach((witness, index) => {
    if (!cleanName(witness.name)) return;
    const key = keyFor(witness, seed);
    const appearanceKey = `${key}::${event.eventId}::${index}`;
    if (seenAppearances.has(appearanceKey)) return;
    seenAppearances.add(appearanceKey);
    const seedProfile = seed[cleanName(witness.name)] || previousProfiles.get(cleanName(witness.name)) || previousProfiles.get(key) || {};
    if (!profiles.has(key)) {
      profiles.set(key, {
        key,
        displayName: seedProfile.displayName || witness.name,
        rawNames: new Set(),
        bio: seedProfile.bio || "",
        title: seedProfile.title || "",
        organization: seedProfile.organization || "",
        confidence: seedProfile.confidence || "unstaged",
        notes: seedProfile.notes || "",
        links: seedProfile.links || {},
        lobbyistMatches: [],
      appearances: [],
      });
    }
    const profile = profiles.get(key);
    profile.rawNames.add(witness.name);
    if (!profile.lobbyistMatches.length) {
      profile.lobbyistMatches = ldaMatches.get(cleanName(witness.name)) || ldaMatches.get(cleanName(profile.displayName)) || seedProfile.lobbyistMatches || [];
    }
    if (!profile.title && witness.organizationOrTitle) profile.title = witness.organizationOrTitle.split(",")[0]?.trim() || "";
    if (!profile.organization && witness.organizationOrTitle) profile.organization = witness.organizationOrTitle;
    profile.appearances.push({
      eventId: event.eventId,
      date: event.calendarDate || event.eventDate || "",
      committee: event.committee || "",
      subcommittee: event.subcommittee || "",
      hearingTitle: event.title || event.eventTitle || "",
      role: witness.organizationOrTitle || "",
      addedOrUpdated: witness.addedOrUpdated || "",
      sourceUrl: event.sourceUrl || "",
      documents: (docMap.get(index) || []).map((doc) => ({
        title: doc.title,
        type: doc.documentType,
        url: doc.url,
        sourceUrl: doc.sourceUrl || doc.url || "",
        filePath: doc.file?.path || "",
      })),
    });
  });
}

const rows = [...profiles.values()].map((profile) => {
  const unique = new Map();
  for (const appearance of profile.appearances) {
    unique.set(`${appearance.eventId}::${appearance.date}::${appearance.role}`, appearance);
  }
  return {
    ...profile,
    rawNames: [...profile.rawNames],
    possibleLobbyist: Boolean(profile.lobbyistMatches.length),
    isPossibleRegisteredLobbyist: Boolean(profile.lobbyistMatches.length),
    hasDocuments: profile.appearances.some((appearance) => appearance.documents?.length),
    appearanceCount: unique.size,
    appearances: [...unique.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))),
  };
}).sort((a, b) => {
  const enriched = Number(Boolean(b.bio)) - Number(Boolean(a.bio));
  if (enriched) return enriched;
  return b.appearances.length - a.appearances.length || a.displayName.localeCompare(b.displayName);
});

const data = {
  generatedAt: new Date().toISOString(),
  source: "House committee docs corpus, 119th Congress",
  documentBaseUrl: "https://s3.us-east-1.amazonaws.com/static.popvox.com/committees/docs/house-docs-119/",
  totals: {
    events: events.length,
    witnesses: rows.length,
    appearances: rows.reduce((sum, profile) => sum + profile.appearances.length, 0),
    committees: topCommittees(rows).length,
    enrichedProfiles: rows.filter((p) => p.bio || Object.keys(p.links || {}).length).length,
    possibleLobbyists: rows.filter((p) => p.lobbyistMatches?.length).length,
    profilesWithDocuments: rows.filter((p) => p.hasDocuments).length,
  },
  committees: topCommittees(rows),
  profiles: rows,
};

fs.writeFileSync(outJson, `${JSON.stringify(data)}\n`);
fs.writeFileSync(outJs, `window.WITNESS_DIRECTORY_DATA = ${JSON.stringify(data)};\n`);
console.log(`Wrote ${rows.length.toLocaleString()} House witness profiles from ${events.length.toLocaleString()} events.`);
