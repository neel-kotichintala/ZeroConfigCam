document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const moonIconClass = 'bx bxs-moon';
    const sunIconClass = 'bx bxs-sun';

    function updateIcon(isDarkMode) {
        const icon = document.createElement('i');
        const label = document.createElement('span');
        label.className = 'toggle-label';

        if (isDarkMode) {
            icon.className = sunIconClass;
            label.textContent = ' Light Mode';
        } else {
            icon.className = moonIconClass;
            label.textContent = ' Dark Mode';
        }

        themeToggleBtn.innerHTML = '';
        themeToggleBtn.appendChild(icon);
        themeToggleBtn.appendChild(label);
    }

    if (themeToggleBtn) {
        // Apply the saved theme on page load
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            updateIcon(true);
        } else {
            updateIcon(false);
        }

        themeToggleBtn.addEventListener('click', () => {
            // 1. Toggle dark mode on the body
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');

            // 2. Save the new theme preference
            if (isDarkMode) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.removeItem('theme');
            }

            // 3. Update the icon
            updateIcon(isDarkMode);

            // 4. Find the new icon and apply the animation
            const newIcon = themeToggleBtn.querySelector('i');
            if (newIcon) {
                newIcon.classList.add('animate-spin');

                // 5. Remove the animation class after it finishes
                setTimeout(() => {
                    newIcon.classList.remove('animate-spin');
                }, 500); // Must match the CSS transition duration
            }
        });
    }
});
