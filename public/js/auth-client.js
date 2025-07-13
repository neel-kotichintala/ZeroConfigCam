document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    const alert = document.getElementById('alert');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const loginLoading = document.getElementById('loginLoading');
    const registerLoading = document.getElementById('registerLoading');

    // Check if user is already logged in
    if (localStorage.getItem('token')) {
        window.location.href = '/dashboard';
        return; // Stop executing if redirecting
    }

    // Switch between login and register forms
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        hideAlert();
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        hideAlert();
    });

    // Handle login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            showAlert('Please fill in all fields', 'error');
            return;
        }

        setLoading(loginBtn, loginLoading, true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);
                showAlert('Login successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                showAlert(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            showAlert('Network error. Please try again.', 'error');
            console.error('Login error:', error);
        } finally {
            setLoading(loginBtn, loginLoading, false);
        }
    });

    // Handle register form submission
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;

        if (!username || !email || !password) {
            showAlert('Please fill in all fields', 'error');
            return;
        }

        if (password.length < 6) {
            showAlert('Password must be at least 6 characters long', 'error');
            return;
        }

        setLoading(registerBtn, registerLoading, true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);
                showAlert('Registration successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                showAlert(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            showAlert('Network error. Please try again.', 'error');
            console.error('Registration error:', error);
        } finally {
            setLoading(registerBtn, registerLoading, false);
        }
    });

    // Utility functions
    function showAlert(message, type) {
        alert.textContent = message;
        alert.className = `alert alert-${type}`;
        alert.classList.remove('hidden');
    }

    function hideAlert() {
        alert.classList.add('hidden');
    }

    function setLoading(button, loadingSpinner, isLoading) {
        if (isLoading) {
            button.disabled = true;
            loadingSpinner.classList.remove('hidden');
        } else {
            button.disabled = false;
            loadingSpinner.classList.add('hidden');
        }
    }
});
