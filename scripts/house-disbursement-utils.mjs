import fs from "node:fs";
import path from "node:path";

export const disbursementSourcePath = path.join("data", "house-disbursement-sources.json");

const quarterPatterns = [
  { keys: ["JANUARY-MARCH", "JAN-MAR"], label: "Jan-Mar", order: 1 },
  { keys: ["APRIL-JUNE", "APR-JUN"], label: "Apr-Jun", order: 2 },
  { keys: ["JULY-SEPTEMBER", "JULY-SEPT", "JUL-SEP"], label: "Jul-Sep", order: 3 },
  { keys: ["OCT-DEC", "OCTOBER-DECEMBER"], label: "Oct-Dec", order: 4 },
];

export function loadDisbursementSources(root = process.cwd()) {
  const fullPath = path.join(root, disbursementSourcePath);
  if (!fs.existsSync(fullPath)) return { archiveUrl: "", files: {} };
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

export function sourceUrlsByFile(root = process.cwd()) {
  return loadDisbursementSources(root).files || {};
}

export function periodPartsFromFilename(filename) {
  const upper = String(filename || "").toUpperCase();
  const yearMatch = upper.match(/\b(20\d{2})\b/);
  const quarter = quarterPatterns.find((item) => item.keys.some((key) => upper.includes(key)));
  return {
    label: quarter?.label || "",
    order: quarter?.order || 99,
    year: yearMatch ? Number(yearMatch[1]) : 0,
  };
}

export function periodFromFilename(filename) {
  const parts = periodPartsFromFilename(filename);
  if (parts.label && parts.year) return `${parts.label} ${parts.year}`;
  return String(filename || "").replace(/\.csv$/i, "");
}

export function periodRank(periodOrFilename) {
  const text = String(periodOrFilename || "");
  const parts = text.toLowerCase().endsWith(".csv")
    ? periodPartsFromFilename(text)
    : periodPartsFromFilename(`${text}.csv`);
  if (!parts.year || !parts.order) return 999999;
  return parts.year * 10 + parts.order;
}

export function disbursementCsvFiles(rawDir) {
  return fs.readdirSync(rawDir)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort((a, b) => periodRank(a) - periodRank(b) || a.localeCompare(b));
}
