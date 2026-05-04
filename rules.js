const officialSources = {
  hres5: {
    title: 'H. Res. 5',
    source: 'Congress.gov',
    url: 'https://www.congress.gov/bill/119th-congress/house-resolution/5/text',
  },
  manual: {
    title: 'House Rules and Manual',
    source: 'GovInfo',
    url: 'https://www.govinfo.gov/',
  },
  rules: {
    title: 'Rules Committee resources',
    source: 'Committee on Rules',
    url: 'https://rules.house.gov/resources',
  },
  germaneness: {
    title: 'Germaneness guidance',
    source: 'Committee on Rules',
    url: 'https://rules.house.gov/resources/boot-camp/basic-training-germaneness-rule',
  },
};

const rulesKnowledge = [
  {
    id: 'special-rules',
    title: 'Special rules',
    citation: 'House Rule XIII; Rules Committee practice',
    source: officialSources.rules,
    keywords: ['special rule', 'structured rule', 'closed rule', 'open rule', 'rule for debate', 'rules committee', 'floor rule', 'make in order'],
    related: ['rules-committee', 'waivers', 'amendments-made-in-order', 'previous-question'],
    answer: {
      short: 'A special rule is the House resolution that sets the floor plan for considering another measure.',
      details: [
        'It can set debate time, decide which amendments are in order, waive points of order, and prescribe the path to final passage.',
        'The text of the special rule is binding if adopted by the House. The Rules Committee report usually explains the amendment process, waivers, and procedural choices.',
        'For staff, the practical first move is to read the special rule before applying the default standing rules.'
      ],
      checks: ['Which measure is being considered?', 'Does the rule provide a structured, closed, or open amendment process?', 'Which points of order are waived?'],
    },
  },
  {
    id: 'rules-committee',
    title: 'Rules Committee role',
    citation: 'House Rule XIII; Rules Committee practice',
    source: officialSources.rules,
    keywords: ['rules committee', 'committee on rules', 'rule hearing', 'reported rule', 'rules package', 'waiver', 'emergency meeting'],
    related: ['special-rules', 'waivers', 'amendments-made-in-order'],
    answer: {
      short: 'The Rules Committee is the House’s main gatekeeper for floor procedure on major legislation.',
      details: [
        'For most major bills, the committee reports a special rule that determines how the House will debate and amend the measure.',
        'The committee can recommend waivers of standing rules, make specific amendments in order, and structure the sequence of floor votes.',
        'The House must still adopt the special rule before it governs floor consideration.'
      ],
      checks: ['Has the committee reported a rule?', 'Is there a Rules Committee report listing amendments and waivers?', 'Has the House adopted the rule?'],
    },
  },
  {
    id: 'waivers',
    title: 'Waivers of points of order',
    citation: 'House Rule XIII; House Rules and Manual',
    source: officialSources.manual,
    keywords: ['waive', 'waiver', 'points of order waived', 'waives all points', 'self executing', 'violate rule', 'rule waiver'],
    related: ['special-rules', 'points-of-order', 'appropriations'],
    answer: {
      short: 'A waiver means the House has agreed not to enforce a procedural objection that would otherwise be available.',
      details: [
        'Special rules often waive one or more points of order against consideration of a bill, provisions in the bill, or amendments.',
        'A waiver does not usually change the underlying rule for future cases. It changes what can be objected to in that specific proceeding.',
        'Broad waivers can be consequential because they may allow the House to consider text that otherwise could face procedural challenge.'
      ],
      checks: ['What exactly is waived: consideration, provisions, amendments, or conference report?', 'Is the waiver broad or limited?', 'Does the rule also self-execute a change?'],
    },
  },
  {
    id: 'germaneness',
    title: 'Germaneness',
    citation: 'Rule XVI, clause 7',
    source: officialSources.germaneness,
    keywords: ['germane', 'germaneness', 'same subject', 'scope of amendment', 'amendment related', 'nongermane', 'relevant amendment'],
    related: ['amendments-made-in-order', 'waivers', 'committee-of-whole'],
    answer: {
      short: 'Germaneness is the House’s subject-matter test for whether an amendment fits the pending text.',
      details: [
        'The analysis compares the amendment to the text it would amend: subject, purpose, affected law, jurisdictional reach, and whether it expands the pending measure’s scope.',
        'A narrow bill usually supports a narrower universe of germane amendments. A broad bill may support broader amendments, but not unlimited ones.',
        'A special rule can avoid the ordinary fight by making a specific amendment in order or waiving germaneness.'
      ],
      checks: ['What is the pending text at the moment the amendment is offered?', 'Does the special rule make the amendment in order?', 'Does the amendment add a new subject or expand the bill’s scope?'],
    },
  },
  {
    id: 'amendments-made-in-order',
    title: 'Amendments made in order',
    citation: 'House Rule XVIII; special rule practice',
    source: officialSources.rules,
    keywords: ['amendment made in order', 'made in order', 'amendment process', 'structured rule', 'closed rule', 'open rule', 'amendments'],
    related: ['special-rules', 'germaneness', 'committee-of-whole'],
    answer: {
      short: 'When a special rule makes an amendment in order, it gives that amendment permission to be offered under the terms of the rule.',
      details: [
        'A structured rule usually lists the amendments that may be offered and may specify debate time or whether amendments can be further amended.',
        'A closed rule generally bars floor amendments except those specifically allowed by the rule.',
        'An open rule allows broader amendment opportunities, subject to the standing rules and any limits in the rule.'
      ],
      checks: ['Is the rule open, structured, or closed?', 'Does the rule list amendment numbers or sponsors?', 'Does it waive points of order against the amendment?'],
    },
  },
  {
    id: 'previous-question',
    title: 'Previous question',
    citation: 'House Rule XIX; House floor practice',
    source: officialSources.manual,
    keywords: ['previous question', 'pq', 'order the previous question', 'defeat previous question', 'end debate', 'cut off debate'],
    related: ['special-rules', 'motion-to-recommit', 'voting'],
    answer: {
      short: 'Ordering the previous question closes debate and moves the House toward a vote on the pending question.',
      details: [
        'On a special rule, the previous question vote is especially important because it determines whether the House keeps moving on the majority’s proposed procedure.',
        'If the previous question is defeated on a rule, the opposition may get an opportunity to amend the rule.',
        'If it is ordered, debate and intervening motions are generally cut off and the House proceeds to vote as prescribed.'
      ],
      checks: ['What is the pending question?', 'Is the previous question being ordered on a rule or on the underlying measure?', 'What happens under the special rule if it is ordered?'],
    },
  },
  {
    id: 'suspension',
    title: 'Suspension of the rules',
    citation: 'Rule XV, clause 1',
    source: officialSources.hres5,
    keywords: ['suspension', 'suspend the rules', 'two thirds', 'two-thirds', 'monday', 'tuesday', 'wednesday', 'no amendments'],
    related: ['voting', 'order-of-business'],
    answer: {
      short: 'Suspension of the rules is an expedited procedure for measures expected to have broad support.',
      details: [
        'It limits debate, does not allow floor amendments, and requires a two-thirds vote of Members voting, assuming a quorum is present.',
        'Because floor amendments are not in order, the text needs to be ready before it comes up.',
        'The 119th Congress rules package includes language affecting when the Speaker may entertain suspension motions, so timing should be checked against current authority.'
      ],
      checks: ['Is leadership using suspension authority for this day?', 'Is the text final enough for no-amendment consideration?', 'Does the measure have two-thirds support?'],
    },
  },
  {
    id: 'motion-to-recommit',
    title: 'Motion to recommit',
    citation: 'Rule XIX, clause 2',
    source: officialSources.manual,
    keywords: ['motion to recommit', 'mtr', 'recommit', 'final amendment', 'minority motion', 'send back to committee'],
    related: ['previous-question', 'voting', 'special-rules'],
    answer: {
      short: 'The motion to recommit is a final procedural opportunity before passage to send a measure back to committee.',
      details: [
        'It is procedurally significant because it gives the minority a final chance to test the House’s position before final passage.',
        'The availability, form, and timing of the motion depend on Rule XIX, the posture of the measure, and any special rule.',
        'Drafting details matter. Instructions or proposed text can affect whether the motion is in order.'
      ],
      checks: ['Is the measure at the final passage stage?', 'Does the special rule limit or address the motion?', 'Is the motion drafted in a form that is in order?'],
    },
  },
  {
    id: 'committee-of-whole',
    title: 'Committee of the Whole',
    citation: 'Rule XVIII',
    source: officialSources.manual,
    keywords: ['committee of the whole', 'five minute rule', 'five-minute rule', 'general debate', 'reading for amendment', 'rise and report'],
    related: ['amendments-made-in-order', 'germaneness', 'quorum'],
    answer: {
      short: 'The Committee of the Whole is a parliamentary form the House uses to consider major legislation with more flexible debate and amendment procedures.',
      details: [
        'General debate usually comes first under time set by the special rule.',
        'The measure may then be considered for amendment, often under the five-minute rule unless the special rule says otherwise.',
        'After amendment consideration, the Committee of the Whole rises and reports the measure back to the House for final action.'
      ],
      checks: ['Is the House in the House proper or Committee of the Whole?', 'Has general debate ended?', 'What amendment process does the special rule provide?'],
    },
  },
  {
    id: 'points-of-order',
    title: 'Points of order',
    citation: 'House Rules and Manual; House precedents',
    source: officialSources.manual,
    keywords: ['point of order', 'points of order', 'raise a point', 'reserve a point', 'procedural objection', 'parliamentary inquiry'],
    related: ['waivers', 'germaneness', 'appropriations'],
    answer: {
      short: 'A point of order is a procedural objection that asks the Chair to enforce a House rule or precedent.',
      details: [
        'Timing matters. A point of order generally must be made at the moment the procedural defect arises.',
        'Special rules often waive points of order, which means the objection cannot be used in that proceeding.',
        'If the Chair sustains the point of order, the offending proposition may be ruled out of order unless the House has protected it by rule or waiver.'
      ],
      checks: ['Was the point of order reserved or raised at the right time?', 'Does a special rule waive it?', 'What text or action is the objection aimed at?'],
    },
  },
  {
    id: 'appropriations',
    title: 'Appropriations limitations and legislation',
    citation: 'Rule XXI',
    source: officialSources.manual,
    keywords: ['appropriation', 'appropriations', 'limitation amendment', 'legislation on appropriations', 'unauthorized appropriation', 'rule xxi', 'spending bill'],
    related: ['points-of-order', 'waivers', 'germaneness'],
    answer: {
      short: 'Rule XXI is central for appropriations bills because it restricts legislating on appropriations and unauthorized appropriations.',
      details: [
        'A general appropriations bill can trigger points of order if it includes legislative language or certain unauthorized appropriations.',
        'Limitation amendments can be powerful, but they must be drafted carefully to avoid changing existing law or imposing affirmative duties.',
        'Special rules frequently waive Rule XXI points of order for appropriations measures.'
      ],
      checks: ['Is the pending measure a general appropriations bill?', 'Does the language change existing law or merely limit funds?', 'Has the special rule waived Rule XXI points of order?'],
    },
  },
  {
    id: 'discharge',
    title: 'Discharge petitions',
    citation: 'Rule XV, clause 2',
    source: officialSources.manual,
    keywords: ['discharge petition', 'discharge calendar', '218 signatures', 'bring bill to floor', 'committee bypass'],
    related: ['order-of-business', 'voting'],
    answer: {
      short: 'A discharge petition is a procedure for bringing a measure out of committee and toward the floor without committee action.',
      details: [
        'The process is rule-bound and depends on timing, signatures, and placement on the discharge calendar.',
        'It is politically significant because it can force floor consideration if enough Members support it.',
        'Staff should check the exact measure, committee referral, signature threshold, and calendar status.'
      ],
      checks: ['Has the measure been in committee long enough?', 'How many Members have signed?', 'Is the petition eligible for discharge day consideration?'],
    },
  },
  {
    id: 'quorum',
    title: 'Quorum and voting',
    citation: 'Rule XX',
    source: officialSources.manual,
    keywords: ['quorum', 'recorded vote', 'yeas and nays', 'vote series', 'electronic vote', 'roll call', 'voice vote', 'division vote'],
    related: ['suspension', 'motion-to-recommit', 'committee-of-whole'],
    answer: {
      short: 'House voting procedure depends on the pending question, the vote type, and whether a quorum is present or required.',
      details: [
        'The House uses voice votes, division votes, recorded votes, and yea-and-nay votes depending on the demand and procedural context.',
        'A quorum is generally required to conduct business, but House rules and practice shape when absence of a quorum is raised and how votes are clustered.',
        'In Committee of the Whole, voting and quorum procedures operate under Rule XVIII and related practice.'
      ],
      checks: ['What vote type was demanded?', 'Is the House in Committee of the Whole?', 'Is the vote part of a postponed or clustered vote series?'],
    },
  },
  {
    id: 'order-of-business',
    title: 'Order of business and calendars',
    citation: 'Rules XIV and XV',
    source: officialSources.manual,
    keywords: ['calendar', 'order of business', 'daily order', 'house calendar', 'union calendar', 'private calendar', 'schedule', 'floor schedule'],
    related: ['special-rules', 'suspension', 'discharge'],
    answer: {
      short: 'The order of business determines what the House can take up and in what procedural posture.',
      details: [
        'House calendars organize eligible business, but floor scheduling is also shaped by leadership, special rules, unanimous consent, and suspension authority.',
        'A measure being on a calendar does not by itself mean it will be considered on a particular day.',
        'For major legislation, the special rule is usually the clearest guide to the actual floor path.'
      ],
      checks: ['Which calendar is the measure on?', 'Is it coming up by special rule, suspension, unanimous consent, or another route?', 'Has leadership announced the floor schedule?'],
    },
  },
  {
    id: 'committee-reports',
    title: 'Committee reports',
    citation: 'Rule XIII',
    source: officialSources.manual,
    keywords: ['committee report', 'reported by committee', 'report language', 'supplemental views', 'minority views', 'cost estimate', 'markup report'],
    related: ['special-rules', 'order-of-business', 'appropriations'],
    answer: {
      short: 'Committee reports explain what a committee reported and often provide the factual and procedural record for floor consideration.',
      details: [
        'Reports can include purpose and summary, section-by-section analysis, oversight findings, cost estimate information, votes, and supplemental or minority views.',
        'Rule XIII governs important reporting requirements and layover concepts.',
        'For staff, the report is often the best starting point for understanding committee intent and procedural vulnerabilities.'
      ],
      checks: ['Has the committee filed a report?', 'Are there supplemental or minority views?', 'Does the report include required cost or oversight material?'],
    },
  },
  {
    id: 'unanimous-consent',
    title: 'Unanimous consent',
    citation: 'House floor practice',
    source: officialSources.manual,
    keywords: ['unanimous consent', 'uc', 'without objection', 'ask unanimous consent', 'reserve the right to object', 'objection'],
    related: ['order-of-business', 'voting'],
    answer: {
      short: 'Unanimous consent lets the House do something procedurally if no Member objects.',
      details: [
        'It is a flexible tool for routine business, timing adjustments, corrections, and procedural shortcuts.',
        'Because any Member can object, unanimous consent depends on notice, coordination, and the nature of the request.',
        'A Member may reserve the right to object to ask questions or clarify intent before deciding whether to object.'
      ],
      checks: ['What exactly is being requested?', 'Has notice or clearance been obtained?', 'Would objection block the action or simply require another procedural path?'],
    },
  },
];

const exampleQuestions = [
  'What does a special rule actually do?',
  'How do I know if an amendment is germane?',
  'What happens if the previous question is defeated?',
  'When can the House suspend the rules?',
  'What does Rule XXI do on appropriations bills?',
  'How does a discharge petition work?',
];

const state = {
  messages: [],
  cache: new Map(),
};

const els = {
  suggestions: document.querySelector('#rules-suggestions'),
  messages: document.querySelector('#rules-messages'),
  form: document.querySelector('#rules-form'),
  input: document.querySelector('#rules-input'),
  submit: document.querySelector('#rules-submit'),
  clear: document.querySelector('#clear-rules-chat'),
};

const stopWords = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'before', 'being', 'between', 'could', 'does',
  'doing', 'during', 'from', 'have', 'house', 'into', 'like', 'mean', 'means', 'need', 'over', 'rule',
  'rules', 'should', 'that', 'their', 'there', 'these', 'thing', 'this', 'what', 'when', 'where', 'which',
  'while', 'with', 'would', 'you',
]);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function normalize(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value = '') {
  return normalize(value)
    .split(' ')
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function entryText(entry) {
  return normalize([
    entry.title,
    entry.citation,
    entry.keywords.join(' '),
    entry.answer.short,
    entry.answer.details.join(' '),
    entry.answer.checks.join(' '),
  ].join(' '));
}

function scoreEntry(question, entry) {
  const q = normalize(question);
  const words = tokenize(question);
  const haystack = entryText(entry);
  let score = 0;

  entry.keywords.forEach((keyword) => {
    const normalizedKeyword = normalize(keyword);
    if (q.includes(normalizedKeyword)) score += Math.min(8, Math.max(3, normalizedKeyword.length / 4));
  });

  words.forEach((word) => {
    if (haystack.includes(word)) score += 1.25;
  });

  if (q.includes('amend') && ['germaneness', 'amendments-made-in-order', 'committee-of-whole'].includes(entry.id)) score += 2;
  if (q.includes('vote') && ['previous-question', 'quorum', 'suspension', 'motion-to-recommit'].includes(entry.id)) score += 2;
  if (q.includes('committee') && ['committee-of-whole', 'committee-reports', 'rules-committee'].includes(entry.id)) score += 1.5;
  if (q.includes('floor') && ['special-rules', 'order-of-business', 'rules-committee'].includes(entry.id)) score += 1.5;

  return score;
}

function retrieve(question) {
  return rulesKnowledge
    .map((entry) => ({ ...entry, score: scoreEntry(question, entry) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function sourceLink(source) {
  return `
    <a href="${source.url}" target="_blank" rel="noopener">
      <span>${escapeHtml(source.title)}</span>
      ${escapeHtml(source.source)}
    </a>
  `;
}

function answerTemplate(entry, supporting = []) {
  const related = entry.related
    .map((id) => rulesKnowledge.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, 4);

  return `
    <p><strong>${escapeHtml(entry.answer.short)}</strong></p>
    <ul>
      ${entry.answer.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}
    </ul>
    <p><strong>What to check next:</strong></p>
    <ul>
      ${entry.answer.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}
    </ul>
    ${supporting.length ? `
      <p><strong>Related procedural threads:</strong> ${supporting.map((item) => escapeHtml(item.title)).join(', ')}.</p>
    ` : ''}
    ${related.length ? `
      <div class="rules-related" aria-label="Related topics">
        ${related.map((item) => `<button type="button" data-question="Explain ${escapeHtml(item.title)}">${escapeHtml(item.title)}</button>`).join('')}
      </div>
    ` : ''}
  `;
}

function fallbackAnswer(sources) {
  const best = sources[0] || rulesKnowledge[0];
  const second = sources[1] || rulesKnowledge[1];
  return `
    <p><strong>I would start by identifying the procedural posture.</strong> A House procedure question usually turns on whether the pending business is under a special rule, suspension of the rules, Committee of the Whole, unanimous consent, or ordinary House session.</p>
    <ul>
      <li>Find the governing text or order first.</li>
      <li>Check whether a special rule waives or changes the default standing rule.</li>
      <li>Then apply the relevant House rule and precedents.</li>
    </ul>
    <p>The closest starting points here are <strong>${escapeHtml(best.title)}</strong> and <strong>${escapeHtml(second.title)}</strong>.</p>
  `;
}

function fallbackQuestion(question) {
  const cacheKey = normalize(question);
  if (state.cache.has(cacheKey)) {
    return { ...state.cache.get(cacheKey) };
  }

  const sources = retrieve(question);
  const strongMatches = sources.filter((source) => source.score >= 2.5);
  const top = strongMatches[0];
  const supporting = strongMatches.slice(1, 3);
  const content = top ? answerTemplate(top, supporting) : fallbackAnswer(sources);
  const cited = (top ? [top, ...supporting] : sources.slice(0, 2))
    .map((entry) => ({
      citation: entry.citation,
      source: entry.source,
      title: entry.title,
    }));

  const result = {
    role: 'assistant',
    content,
    sources: cited,
  };

  state.cache.set(cacheKey, result);
  return result;
}

function rulesApiUrl() {
  if (window.location.protocol === 'file:') return 'http://127.0.0.1:8771/api/rules';
  return '/api/rules';
}

async function answerQuestion(question) {
  const cacheKey = normalize(question);
  if (state.cache.has(cacheKey)) return { ...state.cache.get(cacheKey) };

  try {
    const response = await fetch(rulesApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, topK: 5 }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Rules API returned ${response.status}`);

    const result = {
      role: 'assistant',
      content: payload.answer || '<p><strong>No answer returned.</strong></p>',
      sources: (payload.sources || []).map((source) => ({
        citation: [
          source.section ? `Section: ${source.section}` : '',
          source.page ? `Page ${source.page}` : '',
        ].filter(Boolean).join(' · ') || source.id || 'House Rules source',
        source: {
          title: source.id || 'House Rules and Manual',
          source: `House Rules and Manual${source.id ? ` · ${source.id}` : ''}`,
          url: 'https://www.govinfo.gov/',
        },
        excerpt: source.excerpt || source.summary || '',
      })),
    };

    state.cache.set(cacheKey, result);
    return result;
  } catch (error) {
    const fallback = fallbackQuestion(question);
    return {
      ...fallback,
      content: `
        ${fallback.content}
        <p><strong>Live source retrieval is not available in this browser session.</strong> ${escapeHtml(error.message)}.</p>
      `,
    };
  }
}

function messageTemplate(message) {
  if (message.role === 'user') {
    return `
      <article class="rules-message user">
        <div>${escapeHtml(message.content)}</div>
      </article>
    `;
  }

  return `
    <article class="rules-message assistant">
      <div class="rules-avatar" aria-hidden="true">HR</div>
      <div class="rules-answer">
        ${message.content}
        <div class="rules-citations">
          <strong>Sources surfaced</strong>
          ${(message.sources || []).map((source) => `
            <a href="${source.source.url}" target="_blank" rel="noopener" title="${escapeHtml(source.excerpt || source.source.source || '')}">
              <span>${escapeHtml(source.citation)}</span>
              ${escapeHtml(source.source.source)}
            </a>
          `).join('')}
        </div>
      </div>
    </article>
  `;
}

function renderMessages() {
  els.messages.innerHTML = state.messages.map(messageTemplate).join('');
  els.messages.scrollTop = els.messages.scrollHeight;
  els.messages.querySelectorAll('.rules-related button').forEach((button) => {
    button.addEventListener('click', () => ask(button.dataset.question || button.textContent));
  });
}

function addAssistantWelcome() {
  state.messages = [{
    role: 'assistant',
    content: `
      <p><strong>Ask a House procedure question in plain English.</strong></p>
      <p>I can help orient you on special rules, germaneness, amendments, voting, suspension, Committee of the Whole, discharge petitions, points of order, appropriations procedure, and committee reports.</p>
    `,
    sources: [
      { citation: 'H. Res. 5', source: officialSources.hres5 },
      { citation: 'House Rules and Manual', source: officialSources.manual },
    ],
  }];
  renderMessages();
}

async function ask(question) {
  const clean = question.trim();
  if (!clean) return;

  state.messages.push({ role: 'user', content: clean });
  renderMessages();
  els.input.value = '';

  const typing = {
    role: 'assistant',
    content: '<p><strong>Checking the procedural path...</strong></p>',
    sources: [],
  };
  state.messages.push(typing);
  renderMessages();

  window.setTimeout(async () => {
    state.messages.pop();
    state.messages.push(await answerQuestion(clean));
    renderMessages();
  }, 260);
}

function initSuggestions() {
  els.suggestions.innerHTML = exampleQuestions.map((question) => `
    <button type="button">${escapeHtml(question)}</button>
  `).join('');
  els.suggestions.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => ask(button.textContent));
  });
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  ask(els.input.value);
});

els.submit.addEventListener('click', (event) => {
  event.preventDefault();
  ask(els.input.value);
});

els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    ask(els.input.value);
  }
});

els.clear.addEventListener('click', () => {
  state.messages = [];
  addAssistantWelcome();
  els.input.focus();
});

initSuggestions();
addAssistantWelcome();
