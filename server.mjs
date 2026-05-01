import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8770);
const apiBase = (process.env.CONGRESSLINK_API_BASE || 'https://congress-link-main-uwusug.laravel.cloud').replace(/\/$/, '');
const apiToken = process.env.CONGRESSLINK_API_TOKEN || '';
const membersEndpoints = (process.env.CONGRESSLINK_MEMBERS_ENDPOINTS || '/api/usa/usa-house/members,/api/usa/usa-senate/members')
  .split(',')
  .map((endpoint) => endpoint.trim())
  .filter(Boolean);
const legislationEndpoint = process.env.CONGRESSLINK_LEGISLATION_ENDPOINT || '/api/usa/usa-house/documents/bill';
let legislationCache = null;
let membersCache = null;
const billDetailCache = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === '/api/members') {
      console.log(`GET ${url.pathname}`);
      await proxyMembers(response);
      return;
    }

    if (url.pathname === '/api/legislation') {
      console.log(`GET ${url.pathname}`);
      await proxyLegislation(response);
      return;
    }

    if (url.pathname.startsWith('/api/bill/')) {
      console.log(`GET ${url.pathname}`);
      await proxyBillDetail(response, decodeURIComponent(url.pathname.replace('/api/bill/', '')));
      return;
    }

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = normalize(join(root, pathname));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Not found: ${error.message}`);
  }
});

async function proxyMembers(response) {
  if (!apiToken) {
    console.error('Missing CONGRESSLINK_API_TOKEN');
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Missing CONGRESSLINK_API_TOKEN' }));
    return;
  }

  try {
    const allMembers = await getMembers();

    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify({ data: allMembers, meta: { count: allMembers.length } }));
  } catch (error) {
    console.error(`Upstream request failed: ${error.message}`);
    response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: error.message, upstreams: membersEndpoints.map((endpoint) => `${apiBase}${endpoint}`) }));
  }
}

async function getMembers() {
  if (membersCache) return membersCache;

  const allMembers = [];

  for (const endpoint of membersEndpoints) {
    const chamber = endpoint.includes('senate') ? 'Senate' : 'House';
    const members = await fetchAllMembers(endpoint, chamber);
    allMembers.push(...members);
  }

  membersCache = allMembers;
  return membersCache;
}

async function proxyLegislation(response) {
  if (!apiToken) {
    console.error('Missing CONGRESSLINK_API_TOKEN');
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Missing CONGRESSLINK_API_TOKEN' }));
    return;
  }

  try {
    if (!legislationCache) {
      const bills = await fetchAllPages(legislationEndpoint);
      legislationCache = { data: bills, meta: { count: bills.length, endpoint: legislationEndpoint, cachedAt: new Date().toISOString() } };
    }

    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(legislationCache));
  } catch (error) {
    console.error(`Legislation upstream request failed: ${error.message}`);
    response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: error.message, upstream: `${apiBase}${legislationEndpoint}` }));
  }
}

async function proxyBillDetail(response, id) {
  if (!apiToken) {
    console.error('Missing CONGRESSLINK_API_TOKEN');
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Missing CONGRESSLINK_API_TOKEN' }));
    return;
  }

  if (!/^\d+$/.test(id)) {
    response.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: 'Bill detail id must be numeric' }));
    return;
  }

  try {
    if (!billDetailCache.has(id)) {
      const payload = await fetchBillDetail(id);
      const members = await getMembers();
      billDetailCache.set(id, augmentBillDetail(payload, members));
    }

    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(billDetailCache.get(id)));
  } catch (error) {
    console.error(`Bill detail request failed: ${error.message}`);
    response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: error.message, upstream: `${apiBase}${legislationEndpoint}/${id}` }));
  }
}

async function fetchAllMembers(endpoint, chamber) {
  const members = [];
  let page = 1;
  let lastPage = 1;

  do {
    const separator = endpoint.includes('?') ? '&' : '?';
    const upstreamUrl = `${apiBase}${endpoint}${separator}page=${page}`;
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
    });

    const text = await upstream.text();
    console.log(`Upstream ${upstream.status} ${upstreamUrl} (${text.length} bytes)`);

    if (!upstream.ok) {
      throw new Error(`${upstream.status} from ${upstreamUrl}: ${text.slice(0, 240)}`);
    }

    const payload = JSON.parse(text);
    members.push(...asArray(payload).map((member) => ({
      ...member,
      _popvox_chamber: chamber,
    })));

    lastPage = Number(payload?.meta?.pagination?.last_page || payload?.meta?.last_page || payload?.last_page || 1);
    page += 1;
  } while (page <= lastPage);

  return members;
}

async function fetchBillDetail(id) {
  const upstreamUrl = `${apiBase}${legislationEndpoint}/${id}`;
  const upstream = await fetch(upstreamUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
  });

  const text = await upstream.text();
  console.log(`Upstream ${upstream.status} ${upstreamUrl} (${text.length} bytes)`);

  if (!upstream.ok) {
    throw new Error(`${upstream.status} from ${upstreamUrl}: ${text.slice(0, 240)}`);
  }

  return JSON.parse(text);
}

function augmentBillDetail(payload, members) {
  const data = payload?.data || payload;
  const memberByBioguide = new Map();

  for (const member of members || []) {
    const bioguide = member.bioguide_id
      || member.bioguideId
      || String(member.avatar_url || '').match(/\/([A-Z]\d{6})\.(?:jpg|png|webp)$/i)?.[1];
    if (bioguide) memberByBioguide.set(String(bioguide).toUpperCase(), member);
  }

  const sponsorId = data?.attributes?.sponsor_bioguide_id;
  const cosponsorIds = data?.attributes?.cosponsor_bioguide_ids || [];

  return {
    ...payload,
    data: {
      ...data,
      _popvox_sponsor: sponsorId ? memberByBioguide.get(String(sponsorId).toUpperCase()) || null : null,
      _popvox_cosponsors: cosponsorIds
        .map((id) => memberByBioguide.get(String(id).toUpperCase()))
        .filter(Boolean),
    },
  };
}

async function fetchAllPages(endpoint) {
  const rows = [];
  let page = 1;
  let lastPage = 1;

  do {
    const upstreamUrl = pageUrl(endpoint, page, 100);
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
    });

    const text = await upstream.text();
    console.log(`Upstream ${upstream.status} ${upstreamUrl} (${text.length} bytes)`);

    if (!upstream.ok) {
      throw new Error(`${upstream.status} from ${upstreamUrl}: ${text.slice(0, 240)}`);
    }

    const payload = JSON.parse(text);
    rows.push(...asArray(payload));

    lastPage = Number(payload?.meta?.pagination?.last_page || payload?.meta?.last_page || payload?.last_page || 1);
    page += 1;
  } while (page <= lastPage);

  return rows;
}

function pageUrl(endpoint, page, perPage) {
  const url = new URL(`${apiBase}${endpoint}`);
  url.searchParams.set('page', String(page));
  if (perPage) {
    url.searchParams.set('per_page', String(perPage));
  }
  return url.toString();
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.members)) return payload.members;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

server.listen(port, '127.0.0.1', () => {
  console.log(`POPVOX local server: http://127.0.0.1:${port}/`);
  console.log(`Members proxy: ${membersEndpoints.map((endpoint) => `${apiBase}${endpoint}`).join(', ')}`);
  console.log(`Legislation proxy: ${apiBase}${legislationEndpoint}`);
});
