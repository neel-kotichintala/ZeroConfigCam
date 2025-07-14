// Mobile menu toggle

document.addEventListener('DOMContentLoaded', () => {
    const menuButton = document.getElementById('menu-button');
    const menu = document.getElementById('menu');
    const menuOverlay = document.getElementById('menu-overlay');

    if (!menuButton || !menu || !menuOverlay) return;

    // Open menu
    menuButton.addEventListener('click', () => {
        menu.classList.add('open');
        menuOverlay.classList.add('open');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    });

    // Close menu when clicking overlay
    menuOverlay.addEventListener('click', closeMenu);

    // Close menu function
    function closeMenu() {
        menu.classList.remove('open');
        menuOverlay.classList.remove('open');
        document.body.style.overflow = ''; // Restore scrolling
    }

    // Close menu when pressing Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('open')) {
            closeMenu();
        }
    });
});
