const rulesKnowledge = [
  {
    id: 'special-rules',
    title: 'Special rules',
    citation: 'House Rules Committee practice; House Rule XIII',
    source: 'Rules Committee resources',
    url: 'https://rules.house.gov/resources',
    keywords: ['special rule', 'structured rule', 'closed rule', 'open rule', 'rule for debate', 'rules committee'],
    summary: 'A special rule is a House resolution reported by the Rules Committee that sets the terms for considering another measure on the floor.',
    answer: `
      <p><strong>A special rule is the House's floor plan for a measure.</strong> It is usually reported by the Committee on Rules as a simple House resolution and, if adopted, controls how the underlying bill or resolution will be debated and amended.</p>
      <ul>
        <li>It can set debate time and who controls that time.</li>
        <li>It can decide which amendments are in order.</li>
        <li>It can waive points of order that would otherwise block consideration.</li>
        <li>It can provide for automatic actions, such as considering the previous question as ordered at a certain point.</li>
      </ul>
      <p><strong>Operationally:</strong> staff should read both the special rule and the Rules Committee report. The rule tells you the binding procedure; the report often explains the amendment process and waivers.</p>
    `,
  },
  {
    id: 'germaneness',
    title: 'Germaneness',
    citation: 'Rule XVI, clause 7',
    source: 'House Rules and Manual',
    url: 'https://rules.house.gov/resources/boot-camp/basic-training-germaneness-rule',
    keywords: ['germane', 'germaneness', 'amendment related', 'same subject', 'scope of amendment'],
    summary: 'Germaneness asks whether an amendment addresses the same subject as the text it would amend.',
    answer: `
      <p><strong>Germaneness is the House's subject-matter test for amendments.</strong> The basic idea is that an amendment must relate to the same subject as the matter being amended.</p>
      <p>In practice, the analysis is highly contextual. Staff usually compare the amendment to the pending text by looking at subject matter, purpose, jurisdictional reach, affected law, and whether the amendment expands the scope of the pending measure.</p>
      <ul>
        <li>A narrow bill usually supports a narrower universe of germane amendments.</li>
        <li>A broad bill may allow broader amendments, but not unlimited ones.</li>
        <li>A special rule may waive germaneness or make specific amendments in order.</li>
      </ul>
      <p><strong>Best next step:</strong> check the special rule first, then evaluate Rule XVI and relevant precedents in the House Rules and Manual.</p>
    `,
  },
  {
    id: 'previous-question',
    title: 'Previous question',
    citation: 'House Rule XIX; House floor practice',
    source: 'House Rules and Manual',
    url: 'https://rules.house.gov/resources',
    keywords: ['previous question', 'pq', 'order the previous question', 'end debate', 'cut off debate'],
    summary: 'Ordering the previous question ends debate and prevents further amendment or intervening motions on the pending matter.',
    answer: `
      <p><strong>The previous question is the House's mechanism for closing debate and moving to a vote.</strong> When ordered, it generally cuts off further debate and prevents additional amendments or intervening motions on the pending question.</p>
      <p>On special rules, the vote on ordering the previous question is procedurally important because defeat can allow the opposition to offer an amendment to the rule.</p>
      <ul>
        <li>If the previous question is ordered, the House proceeds under the controlled path set by the rule.</li>
        <li>If it is defeated, floor control may shift for amendment of the pending rule.</li>
      </ul>
      <p><strong>Plain English:</strong> it is often the vote that decides whether the House keeps moving on the majority's proposed procedural track.</p>
    `,
  },
  {
    id: 'suspension',
    title: 'Suspension of the rules',
    citation: 'Rule XV, clause 1',
    source: 'H. Res. 5; House Rules and Manual',
    url: 'https://www.congress.gov/bill/119th-congress/house-resolution/5/text',
    keywords: ['suspension', 'suspend the rules', 'two-thirds', 'monday', 'tuesday', 'wednesday'],
    summary: 'Suspension of the rules is an expedited procedure usually reserved for broadly supported measures and requiring a two-thirds vote.',
    answer: `
      <p><strong>Suspension of the rules is an expedited floor procedure.</strong> It limits debate, bars floor amendments, and requires a two-thirds vote of Members voting, assuming a quorum is present.</p>
      <p>For the 119th Congress, H. Res. 5 amended Rule XV, clause 1(a), including language about when the Speaker may entertain suspension motions.</p>
      <ul>
        <li>Common use: noncontroversial or broadly supported measures.</li>
        <li>Debate is limited and controlled.</li>
        <li>Because amendments are not in order, the text must be ready before floor consideration.</li>
      </ul>
      <p><strong>Staff note:</strong> always confirm the current suspension authority, timing, and any leadership protocols for the week.</p>
    `,
  },
  {
    id: 'motion-to-recommit',
    title: 'Motion to recommit',
    citation: 'Rule XIX, clause 2',
    source: 'House Rules and Manual',
    url: 'https://rules.house.gov/resources',
    keywords: ['motion to recommit', 'mtr', 'recommit', 'final amendment', 'minority motion'],
    summary: 'The motion to recommit is a final procedural opportunity before passage to send a bill back to committee, sometimes with instructions.',
    answer: `
      <p><strong>The motion to recommit is a final procedural motion before passage.</strong> It can send a measure back to committee, and depending on the rule and House practice, may include instructions.</p>
      <p>It is procedurally significant because it gives the minority a final opportunity to test the House's position before the vote on final passage.</p>
      <ul>
        <li>Check the special rule for any procedural limitations.</li>
        <li>Check Rule XIX and current House practice for form and timing.</li>
        <li>Drafting details matter because instructions can affect whether the motion is in order.</li>
      </ul>
    `,
  },
  {
    id: 'committee-of-whole',
    title: 'Committee of the Whole',
    citation: 'Rule XVIII',
    source: 'House Rules and Manual',
    url: 'https://rules.house.gov/resources',
    keywords: ['committee of the whole', 'five-minute rule', 'amendments', 'general debate', 'reading for amendment'],
    summary: 'The Committee of the Whole is a parliamentary form used for considering major legislation with more flexible debate and amendment procedures.',
    answer: `
      <p><strong>The Committee of the Whole is a floor procedure used to consider major legislation.</strong> It lets the House operate under rules that are more flexible than ordinary House session.</p>
      <ul>
        <li>General debate usually occurs first under time set by the rule.</li>
        <li>The measure may then be considered for amendment.</li>
        <li>Amendments are often debated under the five-minute rule unless the special rule provides otherwise.</li>
      </ul>
      <p><strong>Why it matters:</strong> many amendment and debate questions depend on whether the House is in the House proper or in the Committee of the Whole.</p>
    `,
  },
];

const exampleQuestions = [
  'What does a special rule actually do?',
  'How do I know if an amendment is germane?',
  'What happens if the previous question is defeated?',
  'When can the House suspend the rules?',
  'What is the Committee of the Whole?',
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

function scoreEntry(question, entry) {
  const q = normalize(question);
  let score = 0;
  for (const keyword of entry.keywords) {
    if (q.includes(normalize(keyword))) score += keyword.length > 8 ? 4 : 2;
  }
  for (const word of q.split(' ')) {
    if (word.length > 4 && normalize(`${entry.title} ${entry.summary}`).includes(word)) score += 1;
  }
  return score;
}

function retrieve(question) {
  return [...rulesKnowledge]
    .map((entry) => ({ ...entry, score: scoreEntry(question, entry) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function fallbackAnswer(question, sources) {
  const best = sources[0] || rulesKnowledge[0];
  return `
    <p><strong>I would start with ${escapeHtml(best.title)}.</strong> Your question sounds procedural, so the safest workflow is to identify the pending parliamentary posture first: House session, Committee of the Whole, special rule, suspension, or committee proceeding.</p>
    <ul>
      <li>Find the governing rule or order of business.</li>
      <li>Check whether a special rule waives or modifies the ordinary House rule.</li>
      <li>Then apply the standing rule and relevant House precedents.</li>
    </ul>
    <p>For a production answer, the RAG system should retrieve the exact clauses from H. Res. 5 and the House Rules and Manual before giving firm procedural guidance.</p>
  `;
}

function answerQuestion(question) {
  const cacheKey = normalize(question);
  if (state.cache.has(cacheKey)) {
    return { ...state.cache.get(cacheKey), cached: true };
  }

  const sources = retrieve(question);
  const top = sources[0];
  const answer = top?.score > 0 ? top.answer : fallbackAnswer(question, sources);
  const result = {
    role: 'assistant',
    content: answer,
    sources: sources.filter((source) => source.score > 0).length ? sources.filter((source) => source.score > 0) : sources.slice(0, 2),
    cached: false,
  };
  state.cache.set(cacheKey, result);
  return result;
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
        ${message.cached ? '<span class="rules-cache-note">Semantic cache hit</span>' : ''}
        ${message.content}
        <div class="rules-citations">
          <strong>Sources surfaced</strong>
          ${message.sources.map((source) => `
            <a href="${source.url}" target="_blank" rel="noopener">
              <span>${escapeHtml(source.citation)}</span>
              ${escapeHtml(source.source)}
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
}

function addAssistantWelcome() {
  state.messages = [{
    role: 'assistant',
    content: `
      <p><strong>Welcome to the House Rules Explorer.</strong> Ask me a plain-language procedural question and I will return a concise answer with the sources I would retrieve in a full RAG workflow.</p>
      <p>This preview is intentionally cautious: it demonstrates the interaction model, citations, and answer format before we connect the production House Rules vector index.</p>
    `,
    sources: [rulesKnowledge[0], rulesKnowledge[1]],
    cached: false,
  }];
  renderMessages();
}

function ask(question) {
  const clean = question.trim();
  if (!clean) return;
  state.messages.push({ role: 'user', content: clean });
  renderMessages();
  els.input.value = '';

  const typing = {
    role: 'assistant',
    content: '<p><strong>Reading the relevant procedural materials...</strong></p>',
    sources: [],
    cached: false,
  };
  state.messages.push(typing);
  renderMessages();

  window.setTimeout(() => {
    state.messages.pop();
    state.messages.push(answerQuestion(clean));
    renderMessages();
  }, 380);
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
