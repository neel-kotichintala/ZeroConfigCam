document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const showRegisterLink = document.getElementById('showRegister');
  const showLoginLink = document.getElementById('showLogin');
  const alert = document.getElementById('alert');
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const loginLoading = document.getElementById('loginLoading');
  const registerLoading = document.getElementById('registerLoading');

  if (localStorage.getItem('token')) {
    window.location.href = '/dashboard';
    return;
  }

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

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) return showAlert('Please fill in all fields', 'error');
    setLoading(loginBtn, loginLoading, true);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        showAlert('Login successful! Redirecting...', 'success');
        setTimeout(() => (window.navigateToPage ? window.navigateToPage('/dashboard') : (window.location.href = '/dashboard')), 800);
      } else showAlert(data.error || 'Login failed', 'error');
    } catch (error) {
      showAlert('Network error. Please try again.', 'error');
      console.error('Login error:', error);
    } finally {
      setLoading(loginBtn, loginLoading, false);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    if (!username || !email || !password) return showAlert('Please fill in all fields', 'error');
    if (password.length < 6) return showAlert('Password must be at least 6 characters long', 'error');
    setLoading(registerBtn, registerLoading, true);
    try {
      const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password }) });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        showAlert('Registration successful! Redirecting...', 'success');
        setTimeout(() => (window.navigateToPage ? window.navigateToPage('/dashboard') : (window.location.href = '/dashboard')), 800);
      } else showAlert(data.error || 'Registration failed', 'error');
    } catch (error) {
      showAlert('Network error. Please try again.', 'error');
      console.error('Registration error:', error);
    } finally {
      setLoading(registerBtn, registerLoading, false);
    }
  });

  function showAlert(message, type) {
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.classList.remove('hidden');
  }
  function hideAlert() { alert.classList.add('hidden'); }
  function setLoading(button, loadingSpinner, isLoading) {
    if (isLoading) { button.disabled = true; loadingSpinner.classList.remove('hidden'); }
    else { button.disabled = false; loadingSpinner.classList.add('hidden'); }
  }
});

