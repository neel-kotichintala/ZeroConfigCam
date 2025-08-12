document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.getElementById('menu-button');
  const menu = document.getElementById('menu');
  const menuOverlay = document.getElementById('menu-overlay');
  if (!menuButton || !menu || !menuOverlay) return;
  menuButton.addEventListener('click', () => { menu.classList.add('open'); menuOverlay.classList.add('open'); document.body.style.overflow = 'hidden'; });
  menuOverlay.addEventListener('click', closeMenu);
  function closeMenu() { menu.classList.remove('open'); menuOverlay.classList.remove('open'); document.body.style.overflow = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); } });
});

