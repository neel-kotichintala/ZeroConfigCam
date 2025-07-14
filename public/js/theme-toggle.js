document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const mobileThemeToggleBtn = document.getElementById('mobile-theme-toggle');
    const moonIconClass = 'bx bxs-moon';
    const sunIconClass = 'bx bxs-sun';

    function updateButton(button, isDarkMode) {
        if (!button) return;
        
        button.innerHTML = '';
        const icon = document.createElement('i');
        const label = document.createElement('span');

        if (isDarkMode) {
            icon.className = sunIconClass;
            label.textContent = 'Light Mode';
        } else {
            icon.className = moonIconClass;
            label.textContent = 'Dark Mode';
        }

        button.appendChild(icon);
        button.appendChild(label);
    }

    function toggleTheme() {
        // Toggle dark mode on the body
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');

        // Save the new theme preference
        if (isDarkMode) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.removeItem('theme');
        }

        // Update both buttons
        updateButton(themeToggleBtn, isDarkMode);
        updateButton(mobileThemeToggleBtn, isDarkMode);
    }

    // Apply the saved theme on page load
    const isDarkMode = localStorage.getItem('theme') === 'dark';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
    }
    
    // Initialize both buttons
    updateButton(themeToggleBtn, isDarkMode);
    updateButton(mobileThemeToggleBtn, isDarkMode);

    // Add event listeners to both buttons
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
    
    if (mobileThemeToggleBtn) {
        mobileThemeToggleBtn.addEventListener('click', toggleTheme);
    }
});
