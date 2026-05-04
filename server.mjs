import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
await loadLocalEnv();

const port = Number(process.env.PORT || 8770);
const apiBase = (process.env.CONGRESSLINK_API_BASE || 'https://congress-link-main-uwusug.laravel.cloud').replace(/\/$/, '');
const apiToken = process.env.CONGRESSLINK_API_TOKEN || '';
const openAiApiKey = process.env.OPENAI_API_KEY || '';
const pineconeApiKey = process.env.PINECONE_API_KEY || '';
const pineconeIndexHost = (process.env.PINECONE_INDEX_HOST || '').replace(/\/$/, '');
const rulesAnswerModel = process.env.RULES_OPENAI_MODEL || 'gpt-4o-mini';
const rulesEmbeddingModel = process.env.RULES_EMBEDDING_MODEL || 'text-embedding-3-small';
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
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders());
      response.end();
      return;
    }

    if (url.pathname === '/api/rules') {
      console.log(`${request.method} ${url.pathname}`);
      await proxyRules(request, response);
      return;
    }

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
    response.writeHead(500, jsonHeaders());
    response.end(JSON.stringify({ error: 'Missing CONGRESSLINK_API_TOKEN' }));
    return;
  }

  try {
    const allMembers = await getMembers();

    response.writeHead(200, jsonHeaders());
    response.end(JSON.stringify({ data: allMembers, meta: { count: allMembers.length } }));
  } catch (error) {
    console.error(`Upstream request failed: ${error.message}`);
    response.writeHead(502, jsonHeaders());
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
    response.writeHead(500, jsonHeaders());
    response.end(JSON.stringify({ error: 'Missing CONGRESSLINK_API_TOKEN' }));
    return;
  }

  try {
    if (!legislationCache) {
      const bills = await fetchAllPages(legislationEndpoint);
      legislationCache = { data: bills, meta: { count: bills.length, endpoint: legislationEndpoint, cachedAt: new Date().toISOString() } };
    }

    response.writeHead(200, jsonHeaders());
    response.end(JSON.stringify(legislationCache));
  } catch (error) {
    console.error(`Legislation upstream request failed: ${error.message}`);
    response.writeHead(502, jsonHeaders());
    response.end(JSON.stringify({ error: error.message, upstream: `${apiBase}${legislationEndpoint}` }));
  }
}

async function proxyBillDetail(response, id) {
  if (!apiToken) {
    console.error('Missing CONGRESSLINK_API_TOKEN');
    response.writeHead(500, jsonHeaders());
    response.end(JSON.stringify({ error: 'Missing CONGRESSLINK_API_TOKEN' }));
    return;
  }

  if (!/^\d+$/.test(id)) {
    response.writeHead(400, jsonHeaders());
    response.end(JSON.stringify({ error: 'Bill detail id must be numeric' }));
    return;
  }

  try {
    if (!billDetailCache.has(id)) {
      const payload = await fetchBillDetail(id);
      const members = await getMembers();
      billDetailCache.set(id, augmentBillDetail(payload, members));
    }

    response.writeHead(200, jsonHeaders());
    response.end(JSON.stringify(billDetailCache.get(id)));
  } catch (error) {
    console.error(`Bill detail request failed: ${error.message}`);
    response.writeHead(502, jsonHeaders());
    response.end(JSON.stringify({ error: error.message, upstream: `${apiBase}${legislationEndpoint}/${id}` }));
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonHeaders() {
  return {
    ...corsHeaders(),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}

async function proxyRules(request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, jsonHeaders());
    response.end(JSON.stringify({ error: 'Use POST for /api/rules' }));
    return;
  }

  if (!openAiApiKey || !pineconeApiKey || !pineconeIndexHost) {
    response.writeHead(500, jsonHeaders());
    response.end(JSON.stringify({
      error: 'Missing House Rules RAG credentials',
      required: ['OPENAI_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX_HOST'],
    }));
    return;
  }

  try {
    const body = await readJsonBody(request);
    const question = String(body?.question || '').trim();

    if (!question) {
      response.writeHead(400, jsonHeaders());
      response.end(JSON.stringify({ error: 'Question is required' }));
      return;
    }

    const chunks = await retrieveHouseRulesChunks(question, Number(body?.topK || 5));
    const answer = await generateHouseRulesAnswer(question, chunks);

    response.writeHead(200, jsonHeaders());
    response.end(JSON.stringify({
      answer,
      sources: chunks.map((chunk) => ({
        id: chunk.id,
        score: chunk.score,
        page: chunk.page,
        section: chunk.section,
        summary: chunk.summary,
        excerpt: chunk.text.slice(0, 700),
      })),
    }));
  } catch (error) {
    console.error(`Rules RAG request failed: ${error.message}`);
    response.writeHead(502, jsonHeaders());
    response.end(JSON.stringify({ error: error.message }));
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function retrieveHouseRulesChunks(question, topK = 5) {
  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: rulesEmbeddingModel,
      input: question,
    }),
  });

  const embeddingText = await embeddingResponse.text();
  if (!embeddingResponse.ok) {
    throw new Error(`OpenAI embedding failed (${embeddingResponse.status}): ${embeddingText.slice(0, 240)}`);
  }

  const embeddingPayload = JSON.parse(embeddingText);
  const vector = embeddingPayload?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error('OpenAI did not return an embedding vector');

  const pineconeResponse = await fetch(`${pineconeIndexHost}/query`, {
    method: 'POST',
    headers: {
      'Api-Key': pineconeApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vector,
      topK: Math.max(3, Math.min(8, topK)),
      includeMetadata: true,
    }),
  });

  const pineconeText = await pineconeResponse.text();
  if (!pineconeResponse.ok) {
    throw new Error(`Pinecone query failed (${pineconeResponse.status}): ${pineconeText.slice(0, 240)}`);
  }

  const pineconePayload = JSON.parse(pineconeText);
  return (pineconePayload.matches || [])
    .map((match) => ({
      id: match.id,
      score: Number(match.score || 0),
      page: match.metadata?.page || '',
      section: match.metadata?.section || '',
      summary: String(match.metadata?.summary || '').trim(),
      text: String(match.metadata?.text || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((chunk) => chunk.text);
}

async function generateHouseRulesAnswer(question, chunks) {
  const sourceContext = chunks.map((chunk, index) => [
    `Source ${index + 1}`,
    `Vector ID: ${chunk.id}`,
    `Score: ${chunk.score.toFixed(4)}`,
    `Page: ${chunk.page || 'unknown'}`,
    `Section: ${chunk.section || 'unknown'}`,
    `Summary: ${chunk.summary || 'No summary available.'}`,
    `Text: ${chunk.text}`,
  ].join('\n')).join('\n\n---\n\n');

  const answerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: rulesAnswerModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: houseRulesSystemPrompt() },
        { role: 'user', content: `Use only the retrieved source excerpts below to answer. If the excerpts are insufficient, say what official source should be checked next.\n\nRetrieved source excerpts:\n${sourceContext}\n\nQuestion: ${question}` },
      ],
    }),
  });

  const answerText = await answerResponse.text();
  if (!answerResponse.ok) {
    throw new Error(`OpenAI answer failed (${answerResponse.status}): ${answerText.slice(0, 240)}`);
  }

  const answerPayload = JSON.parse(answerText);
  return sanitizeRulesHtml(answerPayload?.choices?.[0]?.message?.content || '<p><strong>No answer returned.</strong></p>');
}

function houseRulesSystemPrompt() {
  return `You are an expert in parliamentary procedure, tasked with providing formal, precise explanations of the House Rules for the 119th Congress (2025-2026) for a Congressional audience.

Retrieve and analyze the official House Rules for the 119th Congress (H. Res. 5, adopted January 3, 2025) and related documents, including the House Rules and Manual (119th Congress edition) from authoritative sources such as rules.house.gov or congress.gov.

Task:
Produce a concise, professional explanation of a specific House rule or procedure, addressing a user-provided question or a significant rule change. Your response should:
- Clearly articulate the rule or procedure, its purpose, and its operational impact in accessible language.
- Cite the precise clause, section, or precedent when the retrieved excerpts support it.
- Provide context, such as comparisons to prior Congresses or procedural significance, if relevant and supported by the retrieved excerpts.
- Maintain a formal tone suitable for Congressional staff or Members, while ensuring clarity and avoiding jargon overload.

Always provide responses using HTML formatting for improved readability. Follow these rules:
- Use <strong> for bold headings.
- Use <ul><li> for bulleted lists and <ol><li> for numbered lists.
- Use <p> to separate different sections.
- Avoid large blocks of text.

Constraints:
- Limit responses to 200-400 words.
- Base explanations solely on the retrieved source excerpts and established House procedure reflected there.
- Do not invent clauses, page numbers, or precedents.
- If the retrieved excerpts are insufficient, say what official source should be checked next.
- Maintain a nonpartisan, professional tone focused on procedure.

Source Priority:
1. House Rules for the 119th Congress (H. Res. 5).
2. House Rules and Manual (119th Congress edition).`;
}

function sanitizeRulesHtml(html) {
  return String(html)
    .replace(/```html|```/gi, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .trim();
}

async function loadLocalEnv() {
  try {
    const text = await readFile(join(root, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env is optional; production hosts should provide real environment variables.
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
