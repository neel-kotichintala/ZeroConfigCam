// Mobile navbar toggle

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('nav-toggle');
    const menu = document.querySelector('.user-info');

    if (!toggleBtn || !menu) return;

    toggleBtn.addEventListener('click', () => {
        menu.classList.toggle('open');
        toggleBtn.classList.toggle('open');
    });

    // Close menu when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !toggleBtn.contains(e.target)) {
            menu.classList.remove('open');
            toggleBtn.classList.remove('open');
        }
    });
});
