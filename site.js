// The simulation library. To add a simulation, add an entry here.
const SIMULATIONS = [
  {
    title: 'Low-Poly Car Tuning Simulator',
    url: 'sims/civic/index.html',
    thumb: 'sims/civic/thumb.jpg',
    isNew: true,
    description: 'A simulator built around my low-poly 2000 Honda Civic Type R (EK9), a 3D model I created back in 10th grade. Swap engines, add a turbo or even a jet engine, lower it and paint it, using a car shop interface inspired by the Forza Horizon series. Then test drive it on 2D tracks or race it down a quarter-mile drag strip.',
    tags: ['Vehicles', 'Racing', '3D', 'Physics'],
    meta: '3D garage · 2D driving · keyboard or touch',
    credits: [
      { logo: 'assets/logo-forza.png', label: 'Inspired by Forza Horizon' },
      { logo: 'assets/logo-claude.png', label: 'Powered by Claude' },
      { logo: 'assets/logo-onshape.png', label: 'Modeled in Onshape' },
    ],
  },
];

const grid = document.getElementById('grid');
const search = document.getElementById('search');
const chipsEl = document.getElementById('chips');
const countEl = document.getElementById('count');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let activeTag = 'All';

const tags = ['All', ...new Set(SIMULATIONS.flatMap(s => s.tags))];
chipsEl.innerHTML = tags.map(t => `<button class="chip${t === activeTag ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
chipsEl.addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  activeTag = b.dataset.tag;
  chipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
  render();
});
search.addEventListener('input', render);

function render() {
  const q = search.value.trim().toLowerCase();
  const list = SIMULATIONS.filter(s =>
    (activeTag === 'All' || s.tags.includes(activeTag)) &&
    (!q || [s.title, s.description, s.meta, ...s.tags].join(' ').toLowerCase().includes(q)));
  countEl.textContent = `${list.length} of ${SIMULATIONS.length} simulation${SIMULATIONS.length === 1 ? '' : 's'}`;
  grid.innerHTML = list.length ? list.map(s => `
    <article class="window">
      <div class="titlebar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
      <a class="screen" href="${esc(s.url)}" aria-label="Play ${esc(s.title)}">
        <img class="shot" src="${esc(s.thumb)}" alt="" loading="lazy" />
        ${s.isNew ? '<span class="badge-new">NEW</span>' : ''}
        ${s.credits ? `<span class="credits">${s.credits.map(c => `<img src="${esc(c.logo)}" alt="${esc(c.label)}" title="${esc(c.label)}" />`).join('')}</span>` : ''}
        <span class="play" aria-hidden="true"><span><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></span>
      </a>
      <div class="win-body">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.description)}</p>
        ${s.credits ? `<p class="made-with">${s.credits.map(c => esc(c.label)).join(' · ')}</p>` : ''}
        <div class="tags">${s.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="win-foot"><small>${esc(s.meta)}</small><a class="btn small" href="${esc(s.url)}">Play <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></a></div>
      </div>
    </article>`).join('') : `<div class="empty"><b>No simulations found</b>Try a different search, or <a href="#" id="clearSearch">show everything</a>.</div>`;
  document.getElementById('clearSearch')?.addEventListener('click', e => {
    e.preventDefault(); search.value = ''; activeTag = 'All';
    chipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.tag === 'All')); render(); search.focus();
  });
}
render();
