import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const senateCommitteeIndexUrl = "https://www.senate.gov/committees/?lv=true";
const senateMembershipBaseUrl = "https://www.senate.gov/general/committee_membership/";
const senateHearingsXmlUrl = "https://www.senate.gov/general/committee_schedules/hearings.xml";

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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "POPVOX prototype data refresh (public Senate XML)",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
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

  const data = {
    generatedAt: new Date().toISOString(),
    sources: {
      senateCommitteeIndexUrl,
      senateMembershipBaseUrl,
      senateHearingsXmlUrl,
    },
    caveats: [
      "Committee and subcommittee rosters come from Senate.gov membership XML.",
      "Upcoming hearings come from the Senate.gov hearings and meetings XML feed and can change as committees update schedules.",
      "Witness testimony, prepared statements, and published transcripts are not yet normalized here; those usually require committee websites, Congress.gov, and GovInfo.",
    ],
    metrics: summarize(committees, meetings),
    committees,
    upcomingHearings: meetings.sort((a, b) => {
      const date = String(a.date || "").localeCompare(String(b.date || ""));
      return date || String(a.time || "").localeCompare(String(b.time || ""));
    }),
  };

  fs.writeFileSync(path.join(assetsDir, "senate-committee-data.json"), `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(path.join(assetsDir, "senate-committee-data.js"), `window.SENATE_COMMITTEE_DATA = ${JSON.stringify(data)};\n`);
  console.log(`Wrote ${committees.length} Senate committees and ${meetings.length} upcoming hearings.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
