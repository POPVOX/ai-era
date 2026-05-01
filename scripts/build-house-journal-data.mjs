import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(
  root,
  "Committee Corpus + Witness Directory - CTO Share",
  "house-journal-ledger",
  "house-journal-collector"
);
const manifestPath = path.join(
  sourceRoot,
  "data",
  "house-journal",
  "119",
  "clerk-daily",
  "metadata",
  "daily-floor-proceedings-manifest.json"
);
const rawDir = path.join(sourceRoot, "data", "house-journal", "119", "clerk-daily", "raw");
const outJson = path.join(root, "assets", "house-journal-ledger.json");
const outJs = path.join(root, "assets", "house-journal-ledger.js");

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#8212;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tagText(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function attrText(xml, attr) {
  const match = xml.match(new RegExp(`\\b${attr}="([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function isoDate(yyyymmdd) {
  if (!/^\d{8}$/.test(yyyymmdd || "")) return "";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function classifyAction(text, item) {
  const haystack = `${item || ""} ${text || ""}`.toLowerCase();
  if (haystack.includes("roll no.") || haystack.includes("yeas and nays") || haystack.includes("recorded vote")) return "Vote";
  if (haystack.includes("passed") || haystack.includes("agreed to") || haystack.includes("failed") || haystack.includes("defeated")) return "Disposition";
  if (haystack.includes("referred to") || haystack.includes("reported by") || haystack.includes("committee")) return "Committee/Referral";
  if (haystack.includes("motion")) return "Motion";
  if (haystack.includes("unanimous consent")) return "Unanimous Consent";
  if (haystack.includes("adjourn") || haystack.includes("recess") || haystack.includes("convened")) return "Session";
  if (haystack.includes("message") || haystack.includes("communication")) return "Communication";
  if (haystack.includes("speaker")) return "Speaker/Chair";
  if (item) return "Measure Action";
  return "Proceeding";
}

function mapType(actionType) {
  if (actionType === "Vote" || actionType === "Disposition") return "vote";
  if (actionType === "Committee/Referral" || actionType === "Measure Action") return "bill";
  if (actionType === "Communication") return "communication";
  return "procedure";
}

function inferOutcome(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("agreed to")) return "Agreed to";
  if (lower.includes("passed")) return "Passed";
  if (lower.includes("failed")) return "Failed";
  if (lower.includes("defeated")) return "Defeated";
  if (lower.includes("postponed")) return "Postponed";
  if (lower.includes("referred")) return "Referred";
  if (lower.includes("reported")) return "Reported";
  if (lower.includes("adjourned")) return "Adjourned";
  if (lower.includes("recess")) return "Recess";
  return "";
}

function sentenceCase(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shorten(text, max = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 120 ? lastSpace : clipped.length).trim()}...`;
}

function plainLanguageSummary(text, item, actionType, outcome) {
  const lower = String(text || "").toLowerCase();
  const measure = item ? `${item}: ` : "";
  const title = text.match(/[—-]\s*"([^"]+)"/)?.[1] || text.match(/-\s*"([^"]+)"/)?.[1] || "";

  if (lower.includes("the house adjourned")) {
    const next = text.match(/next meeting is scheduled for (.+?)\.$/i)?.[1];
    return next ? `The House ended its meeting. It is scheduled to meet again ${next}.` : "The House ended its meeting.";
  }
  if (lower.includes("moved that the house do now adjourn")) return "A member moved to end the House meeting.";
  if (lower.includes("on motion to adjourn agreed to")) return "The House agreed to end the meeting.";
  if (lower.includes("asked unanimous consent")) {
    const result = lower.includes("agreed to without objection") ? " No one objected, so it was approved." : "";
    return `${measure}A member asked the House to approve this by unanimous consent.${result}`;
  }
  if (lower.includes("considered as privileged matter") || lower.includes("considered by unanimous consent")) {
    return `${measure}The House took up this measure for consideration${title ? `: ${title}.` : "."}`;
  }
  if (lower.includes("on agreeing to the resolution agreed to")) return `${measure}The House agreed to the resolution.`;
  if (lower.includes("motion to reconsider laid on the table")) return `${measure}The House blocked a later attempt to revisit this decision.`;
  if (lower.includes("passed")) return `${measure}The House passed this measure${title ? `: ${title}.` : "."}`;
  if (lower.includes("failed") || lower.includes("defeated")) return `${measure}This proposal did not pass.`;
  if (lower.includes("postponed proceedings")) return `${measure}The House delayed final action on this question until later.`;
  if (lower.includes("referred to")) {
    const referred = text.match(/referred to ([^.]+)\./i)?.[1];
    return `${measure}This matter was sent to ${referred || "a committee"} for further work.`;
  }
  if (lower.includes("reported by")) return `${measure}A committee reported this measure back to the House for possible floor action.`;
  if (lower.includes("the speaker designated")) return "The Speaker named someone to perform a House role for the day or for a specific purpose.";
  if (lower.includes("received a message") || lower.includes("received a communication")) return "The House formally received an official message or communication.";
  if (lower.includes("pledge of allegiance")) return "The House recited the Pledge of Allegiance.";
  if (lower.includes("today's prayer")) return "The House opened with prayer.";
  if (lower.includes("the house convened")) return "The House came into session.";
  if (actionType === "Vote") return `${measure}The House took or requested a recorded vote on this question.`;
  if (outcome) return `${measure}${sentenceCase(actionType)} entry. Outcome: ${outcome}. ${shorten(text, 150)}`;
  return `${measure}${shorten(text)}`;
}

function extractBillLinks(rawDescription) {
  const links = [];
  const re = /<a\b[^>]*rel="bill"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(rawDescription || ""))) {
    links.push({ label: stripTags(match[2]), url: decodeEntities(match[1]) });
  }
  return links;
}

function parseDailyXml(dayMeta) {
  const filePath = path.join(rawDir, `${dayMeta.date}.xml`);
  const xml = fs.readFileSync(filePath, "utf8");
  const actions = [];
  const re = /<floor_action\b[^>]*>[\s\S]*?<\/floor_action>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const block = match[0];
    const rawDescription = (block.match(/<action_description\b[^>]*>([\s\S]*?)<\/action_description>/i) || [])[1] || "";
    const text = stripTags(rawDescription);
    const item = tagText(block, "action_item");
    const timeSort = (block.match(/<action_time\b[^>]*for-search="([^"]+)"/i) || [])[1] || "";
    const uniqueId = attrText(block, "unique-id");
    const actId = attrText(block, "act-id");
    const id = `${dayMeta.date}-${uniqueId || actId || actions.length + 1}`;
    const actionType = classifyAction(text, item);
    const outcome = inferOutcome(text);
    const billLinks = extractBillLinks(rawDescription);
    actions.push({
      id,
      date: isoDate(dayMeta.date),
      time: tagText(block, "action_time").replace(/\s*-\s*$/, ""),
      timeSort,
      type: mapType(actionType),
      actionType,
      title: item || sentenceCase(actionType),
      text,
      bill: item || billLinks[0]?.label || "",
      result: outcome,
      sourceUrl: dayMeta.url,
      explanation: plainLanguageSummary(text, item, actionType, outcome),
      billLinks,
      ledgerPreview: {
        sourceRecordId: uniqueId,
        sourceActionCode: actId,
        eventDate: isoDate(dayMeta.date),
        eventTime: timeSort,
        measure: item,
        actionType,
        outcome,
        provenance: "Office of the Clerk daily floor proceedings XML",
      },
    });
  }
  return actions;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const actions = manifest.dailyFiles.flatMap(parseDailyXml).sort((a, b) => {
  const date = b.date.localeCompare(a.date);
  if (date) return date;
  return String(b.timeSort).localeCompare(String(a.timeSort));
});

const payload = {
  generatedAt: new Date().toISOString(),
  source: "Office of the Clerk daily floor proceedings XML",
  congress: 119,
  totals: {
    actions: actions.length,
    days: manifest.dailyFiles.length,
    votes: actions.filter((action) => action.type === "vote").length,
  },
  actions,
};

fs.writeFileSync(outJson, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(outJs, `window.HOUSE_JOURNAL_LEDGER = ${JSON.stringify(payload)};\n`);
console.log(`Wrote ${actions.length} House Journal actions to assets/house-journal-ledger.{json,js}`);
