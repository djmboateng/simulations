// Quick intro loading screen, shown once per visit (first page opened in the tab).
(function () {
  var seen = false;
  try { seen = !!sessionStorage.getItem('dbSeen'); sessionStorage.setItem('dbSeen', '1'); } catch (e) {}
  if (seen) { document.documentElement.classList.add('seen'); return; }
  var start = Date.now();
  function hide() {
    var el = document.getElementById('loader');
    if (!el) return;
    setTimeout(function () { el.classList.add('done'); }, Math.max(0, 900 - (Date.now() - start)));
  }
  window.addEventListener('load', hide);
  setTimeout(hide, 2500); // never hold the page longer than this
})();
