(function () {
  const STORAGE_KEY = 'site-theme';
  const root = document.documentElement;

  function resolve(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function apply(mode) {
    root.setAttribute('data-theme', resolve(mode));
    document.querySelectorAll('#theme-switch button').forEach((b) => {
      b.classList.toggle('active', b.dataset.themeChoice === mode);
    });
  }

  const stored = localStorage.getItem(STORAGE_KEY) || 'system';
  apply(stored);

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    apply(localStorage.getItem(STORAGE_KEY) || 'system');
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#theme-switch button').forEach((btn) => {
      btn.addEventListener('click', () => {
        localStorage.setItem(STORAGE_KEY, btn.dataset.themeChoice);
        apply(btn.dataset.themeChoice);
      });
    });
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  toggle?.addEventListener('click', () => links?.classList.toggle('open'));
  links?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => links.classList.remove('open')));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
});
