import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const committeeDataPath = path.join(root, "assets", "senate-committee-data.json");
const witnessDataPath = path.join(root, "assets", "senate-witness-data.json");
const committeeJsPath = path.join(root, "assets", "senate-committee-data.js");

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/^committee on the\s+/, "")
    .replace(/^committee on\s+/, "")
    .replace(/^special committee on\s+/, "")
    .replace(/^select committee on\s+/, "")
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameCommittee(a = "", b = "") {
  const left = normalizeName(a);
  const right = normalizeName(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function slimWitness(witness = {}) {
  return {
    displayName: witness.displayName || "",
    role: witness.role || "",
    organization: witness.organization || "",
    profileUrl: witness.profileUrl || "",
  };
}

function slimHearing(hearing = {}) {
  return {
    source: "GovInfo",
    congress: hearing.congress || "119",
    date: hearing.date || hearing.dateIssued || "",
    dateIssued: hearing.dateIssued || "",
    title: hearing.title || "Published Senate hearing",
    packageId: hearing.packageId || "",
    detailsUrl: hearing.detailsUrl || "",
    htmlUrl: hearing.htmlUrl || "",
    pdfUrl: hearing.pdfUrl || "",
    localUrl: hearing.localUrl || "",
    witnessCount: hearing.witnessCount || 0,
    witnesses: (hearing.witnesses || []).map(slimWitness),
  };
}

function linkPublishedHearings() {
  const committeeData = JSON.parse(fs.readFileSync(committeeDataPath, "utf8"));
  const witnessData = JSON.parse(fs.readFileSync(witnessDataPath, "utf8"));
  const committees = committeeData.committees || [];
  const publishedHearings = witnessData.hearings || [];

  for (const committee of committees) committee.publishedHearings = [];

  for (const hearing of publishedHearings) {
    const committeeName = hearing.committee?.name || "";
    if (!committeeName || /^senate committee$/i.test(committeeName)) continue;
    const committee = committees.find((row) => sameCommittee(row.name, committeeName) || sameCommittee(row.displayName, committeeName));
    if (!committee) continue;
    committee.publishedHearings.push(slimHearing(hearing));
  }

  for (const committee of committees) {
    committee.publishedHearings.sort((a, b) => String(b.date || b.dateIssued).localeCompare(String(a.date || a.dateIssued)));
  }

  const publishedHearingCount = committees.reduce((sum, committee) => sum + committee.publishedHearings.length, 0);
  const publishedWitnessSlots = committees.reduce((sum, committee) => (
    sum + committee.publishedHearings.reduce((inner, hearing) => inner + (hearing.witnessCount || 0), 0)
  ), 0);

  committeeData.metrics = {
    ...(committeeData.metrics || {}),
    publishedHearingCount,
    publishedWitnessSlots,
  };
  committeeData.sources = {
    ...(committeeData.sources || {}),
    govInfoPublishedHearings: "assets/senate-witness-data.json",
  };
  committeeData.caveats = [
    ...(committeeData.caveats || []).filter((item) => !/published GovInfo Senate hearing/i.test(item)),
    "Published GovInfo Senate hearing records are linked to committees when the extracted committee name matches the current Senate.gov committee roster.",
  ];
  committeeData.apiRefresh = {
    ...(committeeData.apiRefresh || {}),
    govInfoPublishedHearings: {
      enabled: true,
      note: `Linked ${publishedHearingCount} published GovInfo Senate hearings to current Senate committee records.`,
    },
  };

  fs.writeFileSync(committeeDataPath, `${JSON.stringify(committeeData, null, 2)}\n`);
  fs.writeFileSync(committeeJsPath, `window.SENATE_COMMITTEE_DATA = ${JSON.stringify(committeeData)};\n`);
  console.log(`Linked ${publishedHearingCount} published Senate hearings and ${publishedWitnessSlots} witness slots to Senate committees.`);
}

linkPublishedHearings();
