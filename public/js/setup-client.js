// Global variables
let currentSessionId = null;
let expiryTime = null;
let timerInterval = null;
let checkInterval = null;

// DOM elements
const formSection = document.getElementById('formSection');
const qrSection = document.getElementById('qrSection');
const successSection = document.getElementById('successSection');
const setupForm = document.getElementById('setupForm');
const alert = document.getElementById('alert');
const generateBtn = document.getElementById('generateBtn');
const generateLoading = document.getElementById('generateLoading');
const qrCodeContainer = document.getElementById('qrCodeContainer');
const qrCodeImage = document.getElementById('qrCodeImage');
const timeRemaining = document.getElementById('timeRemaining');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const modal = document.getElementById('qrModal');
const modalImg = document.getElementById('modalQrImage');
const successNotification = document.getElementById('success-notification');
const setupContainer = document.querySelector('.setup-container');

// Initialize
let socket;

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    // Connect to Socket.IO
    socket = io({ auth: { token } });

    socket.on('connect', () => {
        console.log('Connected to server for setup updates.');
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connection failed:', err.message);
    });

    // Listen for the success event from the server
    socket.on('setupSuccess', (data) => {
        // Check if the success event is for the session we just created
        if (data.cameraId === currentSessionId) {
            console.log(`Setup success for camera: ${data.name}`);
            
            // Hide the QR code modal if it's open
            if (modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
            
            // Hide the main setup form and show the success message
            if (setupContainer) {
                setupContainer.classList.add('hidden');
            }
            if (successNotification) {
                successNotification.classList.remove('hidden');
            }

            // Stop the countdown timer
            clearTimers();
        }
    });
});

// Handle form submission
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const cameraName = document.getElementById('cameraName').value;
    const wifiSSID = document.getElementById('wifiSSID').value;
    const wifiPassword = document.getElementById('wifiPassword').value;

    if (!cameraName || !wifiSSID || !wifiPassword) {
        showAlert('Please fill in all fields', 'error');
        return;
    }

    setLoading(generateBtn, generateLoading, true);

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showAlert('Authentication error. Please log in again.', 'error');
            window.location.href = '/';
            return;
        }

        const response = await fetch('/api/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ wifi_ssid: wifiSSID, wifi_password: wifiPassword, camera_name: cameraName })
        });

        const data = await response.json();

        if (response.ok) {
            currentSessionId = data.sessionId;
            expiryTime = new Date(data.expiresAt);
            qrCodeImage.src = data.qrCode;
            
            showQRSection();
            startTimer();
        } else {
            showAlert(data.error || 'Failed to generate QR code', 'error');
        }
    } catch (error) {
        console.error('Setup error:', error);
        showAlert('Network error. Please try again.', 'error');
    } finally {
        setLoading(generateBtn, generateLoading, false);
    }
});

// Show QR code section
function showQRSection() {
    // The container is part of the section, so we just show the whole section.

    // Attach click listener to the QR code container
    qrCodeContainer.onclick = function() {
        modal.style.display = "flex";
        modalImg.src = qrCodeImage.src;
    };

    // Attach listeners to the modal close button and background
    const span = document.getElementsByClassName("close")[0];
    span.onclick = function() { 
        modal.style.display = "none";
    }

    modal.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };
    
    formSection.classList.add('hidden');
    qrSection.classList.remove('hidden');
    
    step1.classList.remove('active');
    step2.classList.add('active');
}

// Show success section
function showSuccessSection() {
    qrSection.classList.add('hidden');
    successSection.classList.remove('hidden');
    
    step2.classList.remove('active');
    step3.classList.add('active');
    
    clearTimers();
}

// Go back to form
function goBackToForm() {
    qrSection.classList.add('hidden');
    formSection.classList.remove('hidden');
    
    step2.classList.remove('active');
    step1.classList.add('active');
    
    clearTimers();
}

// Setup another camera
function setupAnotherCamera() {
    successSection.classList.add('hidden');
    formSection.classList.remove('hidden');
    
    step3.classList.remove('active');
    step1.classList.add('active');
    
    // Reset form
    setupForm.reset();
    hideAlert();
}

// Regenerate QR code
async function regenerateQR() {
    const event = new Event('submit');
    setupForm.dispatchEvent(event);
}

// Start countdown timer
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const now = new Date();
        const diff = expiryTime - now;
        
        if (diff <= 0) {
            timeRemaining.textContent = '00:00';
            showAlert('QR code has expired. Please generate a new one.', 'error');
            clearTimers();
            return;
        }
        
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        timeRemaining.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Start checking for camera registration


// Clear all timers
function clearTimers() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

}

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

// Clean up on page unload
window.addEventListener('beforeunload', clearTimers);

// Logout handler - shared with dashboard
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
}

