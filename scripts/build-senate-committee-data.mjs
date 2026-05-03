import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const senateCommitteeIndexUrl = "https://www.senate.gov/committees/?lv=true";
const senateMembershipBaseUrl = "https://www.senate.gov/general/committee_membership/";
const senateHearingsXmlUrl = "https://www.senate.gov/general/committee_schedules/hearings.xml";
const congressGovApiBase = process.env.CONGRESS_GOV_API_BASE || "https://api.congress.gov/v3";
const congressGovApiKey = process.env.CONGRESS_GOV_API_KEY || "";
const congressGovCongresses = (process.env.CONGRESS_GOV_SENATE_MEETING_CONGRESSES || "119")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const senateMeetingDetailLimit = Number(process.env.SENATE_MEETING_DETAIL_LIMIT || 150);
const senateMeetingListLimit = Number(process.env.SENATE_MEETING_LIST_LIMIT || 250);

function decodeEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = String(block || "").match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return decodeEntities(match?.[1] || "");
}

function blocks(xml, name) {
  return [...String(xml || "").matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "gi"))].map((match) => match[1]);
}

function stripTags(value = "") {
  return decodeEntities(String(value).replace(/<[^>]*>/g, " "));
}

function cleanCommitteeName(name) {
  return String(name || "")
    .replace(/^Committee on the /, "")
    .replace(/^Committee on /, "")
    .replace(/^Special Committee on /, "Special Committee on ")
    .replace(/^Select Committee on /, "Select Committee on ")
    .trim();
}

function cleanSubcommitteeName(name) {
  return String(name || "").replace(/^Subcommittee on /, "").trim();
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "item";
}

function parseMembers(membersXml) {
  return blocks(membersXml, "member").map((member) => {
    const nameBlock = tag(member, "name");
    const first = tag(nameBlock, "first").replace(/\s+/g, " ").trim();
    const last = tag(nameBlock, "last").replace(/\s+/g, " ").trim();
    return {
      name: [first, last].filter(Boolean).join(" "),
      first,
      last,
      state: tag(member, "state"),
      party: tag(member, "party"),
      position: tag(member, "position") || "Member",
    };
  }).filter((member) => member.name);
}

function parseCommitteeXml(xml, urls = {}) {
  const committeeName = tag(xml, "committee_name");
  const committeeCode = tag(xml, "committee_code");
  const firstSubcommitteeIndex = xml.indexOf("<subcommittee>");
  const fullCommitteeXml = firstSubcommitteeIndex >= 0 ? xml.slice(0, firstSubcommitteeIndex) : xml;
  const membersXml = tag(fullCommitteeXml, "members");
  const members = parseMembers(membersXml);
  const chair = members.find((member) => /chair/i.test(member.position));
  const ranking = members.find((member) => /ranking/i.test(member.position));
  const subcommittees = blocks(xml, "subcommittee").map((subcommittee) => {
    const subcommitteeName = tag(subcommittee, "subcommittee_name");
    const subcommitteeMembers = parseMembers(tag(subcommittee, "members"));
    return {
      name: subcommitteeName,
      displayName: cleanSubcommitteeName(subcommitteeName),
      code: tag(subcommittee, "committee_code"),
      chair: subcommitteeMembers.find((member) => /chair/i.test(member.position)) || null,
      ranking: subcommitteeMembers.find((member) => /ranking/i.test(member.position)) || null,
      members: subcommitteeMembers,
    };
  });

  return {
    chamber: "Senate",
    name: committeeName,
    displayName: cleanCommitteeName(committeeName),
    slug: slugify(`senate ${committeeName}`),
    code: committeeCode,
    codePrefix: committeeCode.slice(0, 4),
    majorityParty: tag(xml, "majority_party"),
    chair: chair || null,
    ranking: ranking || null,
    memberCount: members.length,
    subcommitteeCount: subcommittees.length,
    members,
    subcommittees,
    urls,
  };
}

function parseCommitteeIndex(html) {
  const membershipPaths = [...html.matchAll(/href="([^"]*committee_memberships_[A-Z]+\.htm)"/g)]
    .map((match) => match[1].replace(/^\//, ""))
    .filter(Boolean);
  const byXmlUrl = new Map();
  for (const href of membershipPaths) {
    const filename = href.split("/").pop();
    const xmlFile = filename.replace(/\.htm$/i, ".xml");
    const source = {
      htmlUrl: new URL(href, "https://www.senate.gov/").toString(),
      xmlUrl: new URL(xmlFile, senateMembershipBaseUrl).toString(),
    };
    if (!byXmlUrl.has(source.xmlUrl) || source.htmlUrl.startsWith("https://")) {
      byXmlUrl.set(source.xmlUrl, source);
    }
  }
  return [...byXmlUrl.values()];
}

function parseMeetings(xml) {
  return blocks(xml, "meeting").map((meeting) => {
    const code = tag(meeting, "cmte_code");
    return {
      id: tag(meeting, "identifier"),
      lastUpdated: tag(meeting, "last_update_iso_8601") || tag(meeting, "last_update"),
      committeeCode: code,
      committeePrefix: code.slice(0, 4),
      committee: tag(meeting, "committee"),
      subcommittee: tag(meeting, "sub_cmte"),
      date: tag(meeting, "date_iso_8601"),
      dateLabel: tag(meeting, "date"),
      dayOfWeek: tag(meeting, "day_of_week"),
      time: tag(meeting, "time"),
      room: tag(meeting, "room"),
      matter: stripTags(tag(meeting, "matter")),
      videoUrl: tag(meeting, "video_url"),
    };
  }).filter((meeting) => meeting.committeeCode && meeting.committee && !/No committee hearings scheduled/i.test(meeting.matter));
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function plainText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function congressGovEventUrl(congress, chamber, eventId) {
  return `https://www.congress.gov/event/${encodeURIComponent(congress)}th-congress/${encodeURIComponent(chamber)}-event/${encodeURIComponent(eventId)}`;
}

function congressGovApiUrl(pathname, params = {}) {
  const url = new URL(`${congressGovApiBase.replace(/\/$/, "")}/${pathname.replace(/^\//, "")}`);
  url.searchParams.set("format", "json");
  if (congressGovApiKey) url.searchParams.set("api_key", congressGovApiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  return url;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "POPVOX prototype data refresh (public Senate XML)",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "POPVOX prototype data refresh (Congress.gov committee meetings)",
      "Accept": "application/json",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url.toString().replace(/api_key=[^&]+/, "api_key=REDACTED")}: ${response.status}`);
  return response.json();
}

function addHearingsToCommittees(committees, meetings) {
  const committeesByPrefix = new Map(committees.map((committee) => [committee.codePrefix, committee]));
  for (const meeting of meetings) {
    const committee = committeesByPrefix.get(meeting.committeePrefix);
    if (!committee) continue;
    if (!committee.upcomingHearings) committee.upcomingHearings = [];
    committee.upcomingHearings.push(meeting);
  }
  for (const committee of committees) {
    committee.upcomingHearings = (committee.upcomingHearings || []).sort((a, b) => {
      const date = String(a.date || "").localeCompare(String(b.date || ""));
      return date || String(a.time || "").localeCompare(String(b.time || ""));
    });
  }
}

function normalizeCommitteeMeetingListItem(item = {}, congress) {
  const eventId = item.eventId || item.eventID || item.identifier || "";
  if (!eventId) return null;
  return {
    eventId: String(eventId),
    congress: String(item.congress || congress || ""),
    chamber: String(item.chamber || "Senate").toLowerCase(),
    updateDate: item.updateDate || item.updatedAt || item.updateDateIncludingText || "",
    apiUrl: item.url || "",
    congressGovUrl: congressGovEventUrl(item.congress || congress || "", "senate", eventId),
  };
}

function normalizeDocument(item = {}) {
  return {
    name: plainText(item.name || item.documentType || item.description || "Document"),
    type: plainText(item.documentType || item.type || ""),
    format: plainText(item.format || ""),
    url: item.url || "",
  };
}

function normalizeBill(item = {}) {
  return {
    congress: String(item.congress || ""),
    type: plainText(item.type || ""),
    number: String(item.number || ""),
    url: item.url || "",
  };
}

function normalizeCommitteeMeetingDetail(listItem, detail = {}) {
  const meeting = detail.committeeMeeting || detail.committeeMeetingDetails || detail;
  const eventId = String(meeting.eventId || meeting.eventID || listItem.eventId || "");
  const congress = String(meeting.congress || listItem.congress || "");
  const committees = asArray(meeting.committees?.item || meeting.committees || meeting.committee);
  const witnesses = asArray(meeting.witnesses?.item || meeting.witnesses).map((witness) => ({
    name: plainText(witness.name),
    position: plainText(witness.position),
    organization: plainText(witness.organization),
  })).filter((witness) => witness.name || witness.organization);
  const witnessDocuments = asArray(meeting.witnessDocuments?.item || meeting.witnessDocuments).map(normalizeDocument).filter((doc) => doc.url || doc.name);
  const meetingDocuments = asArray(meeting.meetingDocuments?.item || meeting.meetingDocuments).map(normalizeDocument).filter((doc) => doc.url || doc.name);
  const videos = asArray(meeting.videos?.item || meeting.videos).map((video) => ({
    name: plainText(video.name || "Video"),
    url: video.url || "",
  })).filter((video) => video.url || video.name);
  const bills = asArray(meeting.relatedItems?.bills?.bill || meeting.relatedItems?.bills || meeting.bills).map(normalizeBill).filter((bill) => bill.type && bill.number);
  const nominations = asArray(meeting.relatedItems?.nominations?.item || meeting.relatedItems?.nominations || meeting.nominations).map((nomination) => ({
    congress: String(nomination.congress || ""),
    number: String(nomination.number || ""),
    part: String(nomination.part || ""),
    url: nomination.url || "",
  })).filter((nomination) => nomination.number);
  const location = meeting.location || {};
  const committeeItems = committees.map((committee) => ({
    systemCode: plainText(committee.systemCode || committee.code || ""),
    name: plainText(committee.name || committee.committeeName || ""),
    url: committee.url || "",
  })).filter((committee) => committee.systemCode || committee.name);
  const committeeCodes = committeeItems.map((committee) => committee.systemCode).filter(Boolean);
  const primaryCode = committeeCodes.find((code) => /00$/i.test(code)) || committeeCodes[0] || "";
  const primaryPrefix = primaryCode ? primaryCode.slice(0, 4) : "";

  return {
    id: eventId,
    congress,
    chamber: plainText(meeting.chamber || listItem.chamber || "Senate"),
    type: plainText(meeting.meetingType || meeting.type || "Meeting"),
    status: plainText(meeting.meetingStatus || meeting.status || ""),
    title: plainText(meeting.title || "Committee meeting"),
    date: plainText(meeting.date),
    updateDate: plainText(meeting.updateDate || listItem.updateDate),
    committeeCodes,
    committeePrefix: primaryPrefix,
    committees: committeeItems,
    location: plainText([location.room, location.building, location.address].filter(Boolean).join(" ")),
    witnesses,
    witnessDocuments,
    meetingDocuments,
    videos,
    bills,
    nominations,
    transcript: meeting.hearingTranscript ? {
      jacketNumber: plainText(meeting.hearingTranscript.jacketNumber),
      url: meeting.hearingTranscript.url || "",
    } : null,
    congressGovUrl: congressGovEventUrl(congress, "senate", eventId),
  };
}

async function fetchHistoricalSenateMeetings() {
  if (!congressGovApiKey) {
    return {
      meetings: [],
      skipped: true,
      note: "Set CONGRESS_GOV_API_KEY to refresh historical Senate committee meetings from Congress.gov.",
    };
  }

  const listItems = [];
  for (const congress of congressGovCongresses) {
    let offset = 0;
    while (true) {
      const url = congressGovApiUrl(`/committee-meeting/${congress}/senate`, {
        limit: senateMeetingListLimit,
        offset,
      });
      const payload = await fetchJson(url);
      const rows = asArray(payload.committeeMeetings || payload.committeeMeeting || payload.meetings);
      listItems.push(...rows.map((item) => normalizeCommitteeMeetingListItem(item, congress)).filter(Boolean));
      const next = payload.pagination?.next;
      if (!next || rows.length === 0 || listItems.length >= senateMeetingDetailLimit) break;
      offset += senateMeetingListLimit;
    }
  }

  const uniqueListItems = [...new Map(listItems.map((item) => [`${item.congress}-${item.eventId}`, item])).values()]
    .slice(0, senateMeetingDetailLimit);
  const meetings = [];
  for (const item of uniqueListItems) {
    const detailUrl = congressGovApiUrl(`/committee-meeting/${item.congress}/senate/${item.eventId}`);
    const detail = await fetchJson(detailUrl);
    meetings.push(normalizeCommitteeMeetingDetail(item, detail));
  }

  meetings.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return {
    meetings,
    skipped: false,
    note: `Loaded ${meetings.length} historical Senate committee meetings from Congress.gov.`,
  };
}

function addHistoricalMeetingsToCommittees(committees, meetings) {
  const committeesByCode = new Map();
  const committeesByPrefix = new Map();
  for (const committee of committees) {
    committeesByCode.set(String(committee.code || "").toUpperCase(), committee);
    committeesByPrefix.set(String(committee.codePrefix || "").toUpperCase(), committee);
    committee.historicalMeetings = [];
  }
  for (const meeting of meetings) {
    const candidates = meeting.committeeCodes.map((code) => {
      const normalizedCode = String(code || "").toUpperCase();
      return committeesByCode.get(normalizedCode) || committeesByPrefix.get(normalizedCode.slice(0, 4));
    }).filter(Boolean);
    const committee = candidates[0] || committeesByPrefix.get(String(meeting.committeePrefix || "").toUpperCase());
    if (!committee) continue;
    committee.historicalMeetings.push(meeting);
  }
  for (const committee of committees) {
    committee.historicalMeetings.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }
}

function summarize(committees, meetings) {
  const memberKeys = new Set();
  let subcommitteeMemberships = 0;
  for (const committee of committees) {
    for (const member of committee.members) memberKeys.add(`${member.name}|${member.state}|${member.party}`);
    for (const subcommittee of committee.subcommittees) {
      subcommitteeMemberships += subcommittee.members.length;
    }
  }
  return {
    committeeCount: committees.length,
    subcommitteeCount: committees.reduce((sum, committee) => sum + committee.subcommitteeCount, 0),
    senatorCount: memberKeys.size,
    committeeMemberships: committees.reduce((sum, committee) => sum + committee.memberCount, 0),
    subcommitteeMemberships,
    upcomingHearingCount: meetings.length,
    historicalMeetingCount: committees.reduce((sum, committee) => sum + (committee.historicalMeetings?.length || 0), 0),
  };
}

async function main() {
  fs.mkdirSync(assetsDir, { recursive: true });
  const indexHtml = await fetchText(senateCommitteeIndexUrl);
  const committeeSources = parseCommitteeIndex(indexHtml);
  if (!committeeSources.length) throw new Error("No Senate committee membership XML links found.");

  const committees = [];
  for (const source of committeeSources) {
    const xml = await fetchText(source.xmlUrl);
    const committee = parseCommitteeXml(xml, {
      senateCommitteeIndexUrl,
      membershipUrl: source.htmlUrl,
      membershipXmlUrl: source.xmlUrl,
    });
    committees.push(committee);
  }
  committees.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const meetingsXml = await fetchText(senateHearingsXmlUrl);
  const meetings = parseMeetings(meetingsXml);
  addHearingsToCommittees(committees, meetings);
  const historical = await fetchHistoricalSenateMeetings();
  addHistoricalMeetingsToCommittees(committees, historical.meetings);

  const data = {
    generatedAt: new Date().toISOString(),
    sources: {
      senateCommitteeIndexUrl,
      senateMembershipBaseUrl,
      senateHearingsXmlUrl,
      congressGovCommitteeMeetingApi: `${congressGovApiBase.replace(/\/$/, "")}/committee-meeting/{congress}/senate`,
      congressGovCommitteeMeetingDocs: "https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/CommitteeMeetingEndpoint.md",
    },
    caveats: [
      "Committee and subcommittee rosters come from Senate.gov membership XML.",
      "Upcoming hearings come from the Senate.gov hearings and meetings XML feed and can change as committees update schedules.",
      "Historical Senate meetings come from Congress.gov when CONGRESS_GOV_API_KEY is configured. Congress.gov states Senate meeting announcements are available from June 2019 to present.",
      "Witness testimony, prepared statements, and published transcripts vary by committee and event; Congress.gov detail records include them when available.",
    ],
    apiRefresh: {
      congressGovHistoricalMeetings: {
        enabled: Boolean(congressGovApiKey),
        congresses: congressGovCongresses,
        detailLimit: senateMeetingDetailLimit,
        skipped: historical.skipped,
        note: historical.note,
      },
    },
    metrics: summarize(committees, meetings),
    committees,
    upcomingHearings: meetings.sort((a, b) => {
      const date = String(a.date || "").localeCompare(String(b.date || ""));
      return date || String(a.time || "").localeCompare(String(b.time || ""));
    }),
    historicalMeetings: historical.meetings,
  };

  fs.writeFileSync(path.join(assetsDir, "senate-committee-data.json"), `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(path.join(assetsDir, "senate-committee-data.js"), `window.SENATE_COMMITTEE_DATA = ${JSON.stringify(data)};\n`);
  console.log(`Wrote ${committees.length} Senate committees, ${meetings.length} upcoming hearings, and ${historical.meetings.length} historical meetings.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
