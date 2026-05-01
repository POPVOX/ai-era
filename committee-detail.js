/**
 * committee-detail.js
 * Enhances static committee detail pages with:
 *  - Subcommittee event filtering (All / Full Committee / each subcommittee)
 *  - Bills-referred panel extracted from event titles
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  1.  Parse the DOM to build data                                    */
  /* ------------------------------------------------------------------ */

  const events = Array.from(document.querySelectorAll('.committee-event'));
  const subcommitteePanel = document.querySelector('.subcommittee-panel');
  const eventsPanel = document.querySelector('.committee-events-panel');
  if (!events.length || !subcommitteePanel || !eventsPanel) return;

  events.forEach(ev => {
    const title = ev.querySelector('h3[data-event-href]');
    if (!title) return;

    title.addEventListener('click', event => {
      if (event.target.closest('a')) return;
      window.location.href = title.dataset.eventHref;
    });

    title.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a')) {
        event.preventDefault();
        window.location.href = title.dataset.eventHref;
      }
    });
  });

  // Build a map: subcommittee name → event elements
  const subcommitteeMap = new Map();   // name → [article,…]
  const fullCommitteeEvents = [];

  events.forEach(ev => {
    const p = ev.querySelector('p');
    if (!p) { fullCommitteeEvents.push(ev); return; }
    const text = p.textContent;
    // Subcommittee name appears before " · " (location separator)
    const match = text.match(/^(Subcommittee[^·]+)/);
    if (match) {
      const name = match[1].trim();
      if (!subcommitteeMap.has(name)) subcommitteeMap.set(name, []);
      subcommitteeMap.get(name).push(ev);
    } else {
      fullCommitteeEvents.push(ev);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  2.  Build filter controls in sidebar                               */
  /* ------------------------------------------------------------------ */

  // Insert filter controls above existing subcommittee articles
  const filterWrap = document.createElement('div');
  filterWrap.className = 'subcommittee-filters';
  filterWrap.innerHTML = `
    <p class="eyebrow">Filter Events</p>
    <button class="subcmte-filter-btn active" data-filter="all">All events <span class="filter-count">${events.length}</span></button>
    <button class="subcmte-filter-btn" data-filter="full">Full committee <span class="filter-count">${fullCommitteeEvents.length}</span></button>
  `;

  // Add a button for each subcommittee
  const sortedSubcmtes = Array.from(subcommitteeMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  sortedSubcmtes.forEach(([name, evts]) => {
    const btn = document.createElement('button');
    btn.className = 'subcmte-filter-btn';
    btn.dataset.filter = name;
    btn.innerHTML = `${name} <span class="filter-count">${evts.length}</span>`;
    filterWrap.appendChild(btn);
  });

  // Replace the old subcommittee listing articles with the new filter controls
  const oldArticles = subcommitteePanel.querySelectorAll('article');
  oldArticles.forEach(a => a.remove());
  const oldEyebrow = subcommitteePanel.querySelector('.eyebrow');
  if (oldEyebrow) oldEyebrow.remove();
  subcommitteePanel.appendChild(filterWrap);

  // Active-filter state
  let activeFilter = 'all';

  function applyFilter(filter) {
    activeFilter = filter;
    filterWrap.querySelectorAll('.subcmte-filter-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.filter === filter)
    );

    events.forEach(ev => {
      if (filter === 'all') {
        ev.style.display = '';
      } else if (filter === 'full') {
        ev.style.display = fullCommitteeEvents.includes(ev) ? '' : 'none';
      } else {
        const arr = subcommitteeMap.get(filter) || [];
        ev.style.display = arr.includes(ev) ? '' : 'none';
      }
    });

    // Update event count header
    const visible = events.filter(e => e.style.display !== 'none').length;
    const heading = eventsPanel.querySelector('.directory-head h2');
    if (heading) {
      heading.textContent = filter === 'all'
        ? 'Committee activity'
        : filter === 'full'
          ? 'Full committee activity'
          : filter;
    }

    // Update result note
    let note = eventsPanel.querySelector('.filter-result-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'filter-result-note';
      const head = eventsPanel.querySelector('.directory-head');
      if (head) head.after(note);
    }
    note.textContent = `Showing ${visible} of ${events.length} events`;
  }

  filterWrap.addEventListener('click', e => {
    const btn = e.target.closest('.subcmte-filter-btn');
    if (btn) applyFilter(btn.dataset.filter);
  });

  /* ------------------------------------------------------------------ */
  /*  3.  Extract bills from event titles → build Bills Referred panel   */
  /* ------------------------------------------------------------------ */

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function normalizeBillRef(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/^H\.?\s*(Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*(\d+)$/i);
    if (!match) return '';
    const kind = match[1].replace(/\s+/g, ' ').toLowerCase();
    const label = ({
      r: 'H.R.',
      res: 'H.Res.',
      'j. res': 'H.J.Res.',
      jres: 'H.J.Res.',
      'con. res': 'H.Con.Res.',
      conres: 'H.Con.Res.',
    })[kind] || `H.${match[1]}.`;
    return `${label} ${match[2]}`;
  }

  function billPageHref(label) {
    const normalized = normalizeBillRef(label);
    if (!normalized) return '';
    return `../bills/${normalized.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-')}.html`;
  }

  const billPattern = /\bH\.?\s*(?:Con\.?\s*Res|J\.?\s*Res|Res|R)\.?\s*\d+\b/gi;
  const billSet = new Map(); // bill label → first-seen title snippet

  events.forEach(ev => {
    const h3 = ev.querySelector('h3');
    if (!h3) return;
    const text = h3.textContent;
    let m;
    while ((m = billPattern.exec(text)) !== null) {
      const label = normalizeBillRef(m[0]);
      if (!label || !billSet.has(label)) {
        // Try to grab a short name after the number
        const afterNum = text.substring(m.index + m[0].length);
        const nameMatch = afterNum.match(/^[\s,]*(?:the\s+)?"?([^";,]+)/i);
        const shortName = nameMatch ? nameMatch[1].trim().replace(/"$/, '') : '';
        billSet.set(label, shortName);
      }
    }
  });

  if (billSet.size > 0) {
    // Sort numerically
    const sorted = Array.from(billSet.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));

    const billsSection = document.createElement('section');
    billsSection.className = 'committee-bills-panel';
    billsSection.innerHTML = `
      <div class="directory-head">
        <div>
          <p class="eyebrow">Legislative Activity</p>
          <h2>Bills referenced<span>.</span></h2>
        </div>
        <span>${sorted.length} bills</span>
      </div>
      <p class="bills-note">Bills and discussion drafts referenced in committee hearings and markups. Links open local POPVOX bill pages.</p>
      <div class="committee-bill-list">
        ${sorted.map(([label, name]) => `
          <a class="committee-bill" href="${escapeHtml(billPageHref(label))}">
            <strong>${escapeHtml(label)}</strong>
            ${name ? `<span>${escapeHtml(name)}</span>` : ''}
          </a>
        `).join('')}
      </div>
    `;

    // Insert after the detail layout (so it's outside the sidebar grid)
    const layout = document.querySelector('.committee-detail-layout') || eventsPanel.parentElement;
    layout.after(billsSection);
  }

})();
