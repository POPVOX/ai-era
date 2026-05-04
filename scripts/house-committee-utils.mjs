import fs from "node:fs";
import path from "node:path";

export const root = process.cwd();
export const corpusDir = path.join(root, "data", "house-committee-corpus");
export const eventsPath = path.join(corpusDir, "events.jsonl");
export const documentsPath = path.join(corpusDir, "documents.jsonl");

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

export function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function stripTags(value) {
  return decodeHtml(String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|blockquote|ul)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function slugify(value, fallback = "item") {
  return String(value || fallback)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || fallback;
}

export function normalizeCommitteeName(name) {
  const value = String(name || "").trim();
  if (value.startsWith("Select Committee on the Strategic Competition Between the United States and the Chinese")) {
    return "Select Committee on the Strategic Competition Between the United States and the Chinese Communist Party";
  }
  return value || "Committee";
}

export function formatDate(value) {
  if (!value) return "Date pending";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function isoDateFromLongDate(value) {
  if (!value) return "";
  const clean = String(value).replace(/\([^)]*\)/g, "").trim();
  const date = new Date(`${clean} 12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function cleanName(name) {
  return String(name || "")
    .replace(/\b(The Honorable|Rear Admiral Upper Half|Rear Admiral Lower Half|Vice Admiral|Major General|Mr|Ms|Mrs|Miss|Dr|Honorable|General|Admiral|Rear Admiral|RADM|Ret|Upper Half|Lower Half)\.?\b/gi, " ")
    .replace(/\b(Ph\.?\s?D\.?|Esq\.?|P\.?\s?E\.?|J\.?\s?D\.?|M\.?\s?D\.?|Jr\.?|Sr\.?|II|III|IV)\b/gi, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function normalizeOrg(org) {
  return String(org || "")
    .replace(/\b(Washington|D\.C\.|DC|New York|Richmond|Virginia|United States|U\.S\.)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}
