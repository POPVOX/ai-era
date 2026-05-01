import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "Committee Corpus + Witness Directory - CTO Share", "house-expenditure-explorer-2026-05-01");
const rawDir = path.join(sourceRoot, "data", "raw");
const outJson = path.join(root, "assets", "house-expenditure-data.json");
const outJs = path.join(root, "assets", "house-expenditure-data.js");

const sourceUrls = {
  "JANUARY-MARCH-2025-SOD-DETAIL-GRID-FINAL.csv": "https://www.house.gov/sites/default/files/2025-05/JANUARY-MARCH-2025-SOD-DETAIL-GRID-FINAL.csv",
  "APRIL-JUNE-2025-SOD-DETAIL-GRID-FINAL.csv": "https://www.house.gov/sites/default/files/2025-08/APRIL-JUNE%202025%20SOD%20DETAIL%20GRID-FINAL.csv",
  "JULY-SEPTEMBER-2025-SOD-DETAIL-GRID-FINAL.csv": "https://www.house.gov/sites/default/files/2025-11/grids/JULY-SEPTEMBER%202025%20SOD%20DETAIL%20GRID-FINAL.csv",
  "OCT-DEC-2025-SOD-DETAIL-GRID-FINAL.csv": "https://www.house.gov/sites/default/files/2026-02/OCT-DEC-2025-SOD-DETAIL-GRID-FINAL.csv",
};

const bocLabels = {
  "11": "Personnel compensation",
  "12": "Personnel benefits",
  "13": "Benefits to former personnel",
  "21": "Travel",
  "22": "Transportation of things",
  "23": "Rent, communications, utilities",
  "24": "Printing and reproduction",
  "25": "Other services",
  "26": "Supplies and materials",
  "31": "Equipment",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const parsed = Number(raw.replace(/[,$()]/g, "") || 0);
  return negative ? -parsed : parsed;
}

function periodFromFilename(filename) {
  const upper = filename.toUpperCase();
  if (upper.includes("JANUARY-MARCH")) return "Jan-Mar 2025";
  if (upper.includes("APRIL-JUNE")) return "Apr-Jun 2025";
  if (upper.includes("JULY") || upper.includes("SEPT")) return "Jul-Sep 2025";
  if (upper.includes("OCT-DEC")) return "Oct-Dec 2025";
  return filename.replace(/\.csv$/i, "");
}

function periodRank(period) {
  return ["Jan-Mar 2025", "Apr-Jun 2025", "Jul-Sep 2025", "Oct-Dec 2025"].indexOf(period) + 1 || 99;
}

function cleanYear(org) {
  const match = String(org || "").match(/\b(20\d{2})\b/);
  return match ? match[1] : "";
}

function stripOrgYear(org) {
  return String(org || "")
    .replace(/^FISCAL YEAR\s+20\d{2}\s+/i, "")
    .replace(/^20\d{2}\s+/, "")
    .trim();
}

function classifyOffice(row) {
  const org = row.organization.toUpperCase();
  const stripped = stripOrgYear(row.organization).toUpperCase();
  if (/^HON\./.test(stripped)) return "Member offices";
  if (/OFFICE OF THE SPEAKER|MAJORITY LEADER|MINORITY LEADER|MAJORITY WHIP|MINORITY WHIP|DEMOCRATIC CAUCUS|REPUBLICAN CONFERENCE|REPUBLICAN STUDY COMMITTEE|HOUSE DEMOCRATIC POLICY|HOUSE REPUBLICAN POLICY/.test(org)) return "Leadership";
  if (/COMMITTEE|COMMMITTEE|ARMED SERVICES|HOUSE ADMINISTRATION|TRANSPORTATION-INFRASTRUCTURE|PERMANENT SELECT|SELECT COMMITTEE|WAYS AND MEANS|APPROPRIATIONS|HOMELAND SECURITY|INTELLIGENCE|COMM ON SCIENCE|SCIENCE SPACE&TECH/.test(org)) return "Committees";
  if (/CHIEF ADMIN|CLERK OF THE HOUSE|SERGEANT AT ARMS|GENERAL COUNSEL|LEGISLATIVE COUNSEL|PARLIAMENTARIAN|LAW REVISION|INSPECTOR GENERAL|GOVERNMENT CONTRIBUTIONS|EMPLOYEE ADVOCACY|WHISTLEBLOWER|OFFICE CONGRESSIONAL CONDUCT|OFFICE OF CONGRESSIONAL ETHICS|OFFICE OF DIVERSITY|INTERPARLIAMENTARY|HOUSE OF REPRESENTATIVES|FINE ARTS|ATTENDING PHYSICIAN|MAIL|PRINTING|RECORDING STUDIO|CYBERSECURITY|WEB SOLUTIONS|ENTERPRISE|TECHNOLOGY|ACQUISITIONS|FINANCE|PAYROLL|HUMAN RESOURCES|LOGISTICS|CUSTOMER EXPERIENCE|CONGRESSIONAL STAFF ACADEMY|CAPITOL SERVICE CENTER|FURNISHINGS|OFFICE SUPPLY|TELECOMMUNICATIONS|NET EXPENSES TELECOMMUNICATION|NET EXP OF EQUIP|STATIONERY|COMMUNICATIONS EQUIPMENT|COMMUNICATIONS|CDN ENHANCE|LIFE CYCLE REPLACEMENT|SERVICE MANAGEMENT|COORDINATING SERVICES|TECHNICAL ASSISTANTS|CAMPUS VOICE NETWORK|LGTCS & SUPP|CHILD CARE CENTER|EMPLOYEE ASSISTANCE|SALARIES  OFFICERS/.test(org)) return "Institutional";
  return "Other House offices";
}

function classifyExpense(row) {
  const haystack = `${row.description} ${row.vendorName} ${row.objectClassLabel}`.toUpperCase();
  if (row.budgetObjectClass === "11") return "Salaries and payroll";
  if (row.budgetObjectClass === "12" || row.budgetObjectClass === "13") return "Benefits and contributions";
  if (row.budgetObjectClass === "21" || /AIRFARE|LODGING|HOTEL|MILEAGE|PER DIEM|TRAVEL|TAXI|UBER|LYFT|PARKING|TRANSPORTATION/.test(haystack)) return "Travel and lodging";
  if (/FOOD|BEV|BEVERAGE|CATER|MEAL|RESTAURANT|COFFEE|LEGISLATIVE PLNNG/.test(haystack)) return "Food and event support";
  if (row.budgetObjectClass === "23" || /TELECOM|PHONE|WIRELESS|POSTAGE|MAIL|RENT|UTILITY|UTILITIES|INTERNET|COMMUNICATION/.test(haystack)) return "Rent, mail, telecom";
  if (row.budgetObjectClass === "24" || /PRINT|PUBLICATION|FRANKED|GRAPHIC|REPRODUCTION/.test(haystack)) return "Printing and publications";
  if (/SOFTWARE|LICENSE|CLOUD|SAAS|SUBSCRIPTION|DATABASE|DATA SERVICE|HOSTING/.test(haystack)) return "Software, data, and subscriptions";
  if (/COMPUTER HARDW|LAPTOP|MONITOR|PRINTER|PHONE|CAMERA|SERVER|NETWORK|HARDWARE/.test(haystack)) return "IT hardware and equipment";
  if (/CYBER|SECURITY|IT SERVICE|INFORMATION TECH|TECHNOLOGY SUPPORT|HELP DESK|SYSTEMS SUPPORT/.test(haystack)) return "Technology services and support";
  if (row.budgetObjectClass === "25" || /CONSULT|CONTRACT|SERVICE|MAINTENANCE|TRAINING|SUPPORT|LEGAL|PROFESSIONAL/.test(haystack)) return "Contracts and professional services";
  if (row.budgetObjectClass === "31" || /EQUIPMENT|FURNITURE/.test(haystack)) return "Equipment and furnishings";
  if (row.budgetObjectClass === "26" || /SUPPLIES|MATERIALS|OFFICE SUPPLY|AMAZON|STAPLES/.test(haystack)) return "Supplies and materials";
  return "Other operating costs";
}

function addToSetMap(map, key, value) {
  if (!value) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function addRollup(map, label, amount) {
  const key = label || "Unlisted";
  const item = map.get(key) || { label: key, amount: 0, count: 0 };
  item.amount += amount;
  item.count += 1;
  map.set(key, item);
}

function topRollup(map, limit = 9999) {
  return [...map.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, limit);
}

function money(amount) {
  return Math.round((amount || 0) * 100) / 100;
}

const files = fs.readdirSync(rawDir)
  .filter((name) => name.toLowerCase().endsWith(".csv"))
  .sort((a, b) => periodRank(periodFromFilename(a)) - periodRank(periodFromFilename(b)) || a.localeCompare(b));

let rawRows = 0;
let subtotalRows = 0;
let detailRows = 0;
let total = 0;
const orgSet = new Set();
const vendorSet = new Set();
const byOfficeType = new Map();
const byExpenseKind = new Map();
const byObjectClass = new Map();
const byPeriod = new Map();
const byProgram = new Map();
const topTransactions = [];
const vendorMap = new Map();

for (const fileName of files) {
  const period = periodFromFilename(fileName);
  const rows = parseCsv(fs.readFileSync(path.join(rawDir, fileName), "utf8"));
  const headers = rows.shift().map((header) => String(header || "").trim());
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));

  for (const raw of rows.filter((row) => row.length > 1)) {
    rawRows += 1;
    if ((raw[index["SORT SEQUENCE"]] || "") !== "DETAIL") {
      subtotalRows += 1;
      continue;
    }

    const organization = raw[index.ORGANIZATION] || "";
    const vendorName = String(raw[index["VENDOR NAME"]] || "").trim() || "No vendor listed";
    const budgetObjectClass = String(raw[index["BUDGET OBJECT CLASS"]] || "").trim();
    const row = {
      period,
      organization,
      organizationShort: stripOrgYear(organization),
      organizationYear: cleanYear(organization),
      program: raw[index.PROGRAM] || "No program",
      vendorName,
      vendorId: String(raw[index["VENDOR ID"]] || "").trim(),
      transactionDate: raw[index["TRANSACTION DATE"]] || "",
      document: raw[index.DOCUMENT] || "",
      description: raw[index.DESCRIPTION] || "",
      budgetObjectClass,
      objectClassLabel: bocLabels[budgetObjectClass] || `BOC ${budgetObjectClass || "unknown"}`,
      amount: parseAmount(raw[index.AMOUNT]),
    };
    row.officeType = classifyOffice(row);
    row.expenseKind = classifyExpense(row);

    detailRows += 1;
    total += row.amount;
    orgSet.add(row.organization);
    if (vendorName !== "No vendor listed") vendorSet.add(vendorName);
    addRollup(byOfficeType, row.officeType, row.amount);
    addRollup(byExpenseKind, row.expenseKind, row.amount);
    addRollup(byObjectClass, row.objectClassLabel, row.amount);
    addRollup(byPeriod, row.period, row.amount);
    addRollup(byProgram, row.program, row.amount);

    if (vendorName !== "No vendor listed") {
      const vendor = vendorMap.get(vendorName) || {
        vendor: vendorName,
        amount: 0,
        count: 0,
        clientCount: 0,
        lastDate: "",
        officeTypes: new Set(),
        expenseKinds: new Set(),
        periods: new Set(),
        clients: new Map(),
        descriptions: new Map(),
      };
      vendor.amount += row.amount;
      vendor.count += 1;
      vendor.officeTypes.add(row.officeType);
      vendor.expenseKinds.add(row.expenseKind);
      vendor.periods.add(row.period);
      if (row.transactionDate && String(row.transactionDate).localeCompare(vendor.lastDate) > 0) vendor.lastDate = row.transactionDate;
      addRollup(vendor.clients, row.organizationShort || row.organization, row.amount);
      addRollup(vendor.descriptions, row.description || row.objectClassLabel, row.amount);
      vendorMap.set(vendorName, vendor);
    }

    topTransactions.push({
      vendor: vendorName,
      amount: money(row.amount),
      date: row.transactionDate,
      period: row.period,
      organization: row.organizationShort || row.organization,
      officeType: row.officeType,
      description: row.description,
      expenseKind: row.expenseKind,
    });
    topTransactions.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    topTransactions.length = Math.min(topTransactions.length, 500);
  }
}

const vendors = [...vendorMap.values()].map((vendor) => {
  const clients = topRollup(vendor.clients, 8);
  const officeTypes = [...vendor.officeTypes].sort();
  const expenseKinds = [...vendor.expenseKinds].sort();
  const periods = [...vendor.periods].sort((a, b) => periodRank(a) - periodRank(b));
  return {
    vendor: vendor.vendor,
    amount: money(vendor.amount),
    count: vendor.count,
    clientCount: vendor.clients.size,
    lastDate: vendor.lastDate,
    officeTypes,
    expenseKinds,
    periods,
    topClients: clients.slice(0, 5).map((client) => ({ label: client.label, amount: money(client.amount), count: client.count })),
    topDescriptions: topRollup(vendor.descriptions, 3).map((item) => ({ label: item.label, amount: money(item.amount), count: item.count })),
  };
}).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

const data = {
  generatedAt: new Date().toISOString(),
  source: {
    statement: `House Statement of Disbursements detail grids: ${files.map(periodFromFilename).join(", ")}`,
    files: files.map((name) => ({ name, period: periodFromFilename(name), url: sourceUrls[name] || "" })),
    rawRows,
    detailRows,
    subtotalRows,
  },
  metrics: {
    total: money(total),
    transactionCount: detailRows,
    organizationCount: orgSet.size,
    vendorCount: vendorSet.size,
  },
  charts: {
    byOfficeType: topRollup(byOfficeType).map((item) => ({ ...item, amount: money(item.amount) })),
    byExpenseKind: topRollup(byExpenseKind).map((item) => ({ ...item, amount: money(item.amount) })),
    byObjectClass: topRollup(byObjectClass).map((item) => ({ ...item, amount: money(item.amount) })),
    byPeriod: topRollup(byPeriod).sort((a, b) => periodRank(a.label) - periodRank(b.label)).map((item) => ({ ...item, amount: money(item.amount) })),
    byProgram: topRollup(byProgram, 15).map((item) => ({ ...item, amount: money(item.amount) })),
    topTransactions,
  },
  options: {
    officeTypes: topRollup(byOfficeType).map((item) => item.label),
    expenseKinds: topRollup(byExpenseKind).map((item) => item.label),
    periods: files.map(periodFromFilename),
    sorts: ["amount", "clients", "transactions", "name"],
  },
  vendors,
};

fs.writeFileSync(outJson, `${JSON.stringify(data)}\n`);
fs.writeFileSync(outJs, `window.HOUSE_EXPENDITURE_DATA = ${JSON.stringify(data)};\n`);
console.log(`Generated ${vendors.length.toLocaleString()} vendor rollups from ${detailRows.toLocaleString()} transaction rows.`);
