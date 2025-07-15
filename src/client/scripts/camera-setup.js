// Global variables - simplified for reusable QR codes
let currentQRCode = null;

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
    const username = localStorage.getItem('username') || 'User';
    
    // Update desktop username
    const usernameSpan = document.getElementById('username');
    if (usernameSpan) {
        usernameSpan.textContent = username;
    }
    
    // Update mobile menu username
    const mobileUsernameSpan = document.getElementById('mobile-username');
    if (mobileUsernameSpan) {
        mobileUsernameSpan.textContent = username;
    }
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

    // Listen for auto-added camera notifications
    socket.on('cameraAutoAdded', (data) => {
        console.log('✅ SETUP: Camera auto-added:', data);
        
        // Show custom success notification
        showCameraSuccessNotification(data.name, data.message);
    });

    // Load previous QR codes
    loadPreviousQRCodes();
});

// Handle form submission
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const wifiSSID = document.getElementById('wifiSSID').value;
    const wifiPassword = document.getElementById('wifiPassword').value;

    if (!wifiSSID || !wifiPassword) {
        showAlert('Please fill in WiFi credentials', 'error');
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
            body: JSON.stringify({ wifi_ssid: wifiSSID, wifi_password: wifiPassword })
        });

        const data = await response.json();

        if (response.ok) {
            qrCodeImage.src = data.qrCode;
            showQRSection();
            
            // Show success message about reusable QR code
            showAlert(data.message, 'info');
            
            // Reload previous QR codes to show the newly saved one
            loadPreviousQRCodes();
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
}

// Go back to form
function goBackToForm() {
    qrSection.classList.add('hidden');
    formSection.classList.remove('hidden');
    
    step2.classList.remove('active');
    step1.classList.add('active');
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

// No timer needed - QR codes are now reusable!

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

// No cleanup needed for reusable QR codes!

// Load previous QR codes
async function loadPreviousQRCodes() {
    const qrCodesList = document.getElementById('qrCodesList');
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/qr-codes', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok && data.qrCodes && data.qrCodes.length > 0) {
            displayQRCodes(data.qrCodes);
        } else {
            showNoQRCodes();
        }
    } catch (error) {
        console.error('Error loading QR codes:', error);
        showNoQRCodes();
    }
}

// Display QR codes list
function displayQRCodes(qrCodes) {
    const qrCodesList = document.getElementById('qrCodesList');
    
    qrCodesList.innerHTML = qrCodes.map(qr => `
        <div class="qr-code-item">
            <div class="qr-code-preview" onclick="showQRModal('${qr.qr_data}')">
                <img src="${qr.qr_data}" alt="QR Code for ${qr.wifi_ssid}">
            </div>
            <div class="qr-code-info">
                <h4>${qr.wifi_ssid}</h4>
                <p>Created: ${new Date(qr.created_at).toLocaleDateString()}</p>
            </div>
            <div class="qr-code-actions">
                <button class="btn btn-primary btn-sm" onclick="useQRCode('${qr.qr_data}', '${qr.wifi_ssid}')">
                    Use This QR
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteQRCode(${qr.id})">
                    Delete
                </button>
            </div>
        </div>
    `).join('');
}

// Show no QR codes message
function showNoQRCodes() {
    const qrCodesList = document.getElementById('qrCodesList');
    qrCodesList.innerHTML = `
        <div class="no-qr-codes">
            <i class='bx bx-qr'></i>
            <h4>No Saved QR Codes</h4>
            <p>Generate your first QR code above to get started!</p>
        </div>
    `;
}

// Show QR code in modal
function showQRModal(qrData) {
    modal.style.display = "flex";
    modalImg.src = qrData;
    
    // Ensure modal close functionality works
    const span = document.getElementsByClassName("close")[0];
    if (span) {
        span.onclick = function() { 
            modal.style.display = "none";
        }
    }

    // Close modal when clicking outside
    modal.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    };
}

// Use existing QR code
function useQRCode(qrData, wifiSSID) {
    // Set the QR code image
    qrCodeImage.src = qrData;
    
    // Populate the form with the WiFi SSID (password is not stored for security)
    document.getElementById('wifiSSID').value = wifiSSID;
    
    // Show the QR section
    showQRSection();
    showAlert(`Using saved QR code for "${wifiSSID}"`, 'info');
}

// Delete QR code
async function deleteQRCode(qrId) {
    if (!confirm('Are you sure you want to delete this QR code?')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/qr-codes/${qrId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            showAlert('QR code deleted successfully', 'info');
            loadPreviousQRCodes(); // Reload the list
        } else {
            const data = await response.json();
            showAlert(data.error || 'Failed to delete QR code', 'error');
        }
    } catch (error) {
        console.error('Error deleting QR code:', error);
        showAlert('Network error. Please try again.', 'error');
    }
}

// Show custom success notification for camera auto-added
function showCameraSuccessNotification(cameraName, message) {
    // Remove existing notification if it exists
    const existingNotification = document.getElementById('camera-success-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create new notification element
    const notification = document.createElement('div');
    notification.id = 'camera-success-notification';
    notification.className = 'camera-success-notification';
    notification.innerHTML = `
        <div class="success-notification-content">
            <div class="success-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#10B981"/>
                    <path d="M9 12l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="success-text">
                <h3>Camera Added Successfully!</h3>
                <p>${message}</p>
            </div>
            <div class="success-actions">
                <button class="btn btn-primary go-to-dashboard-btn">Go to Dashboard</button>
                <button class="btn btn-secondary dismiss-success-btn">Continue Setup</button>
            </div>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Add event listeners to the new elements
    notification.querySelector('.go-to-dashboard-btn').addEventListener('click', () => {
        window.location.href = '/dashboard';
    });
    
    notification.querySelector('.dismiss-success-btn').addEventListener('click', () => {
        hideSuccessNotification();
    });
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
        hideSuccessNotification();
    }, 8000);
}

function hideSuccessNotification() {
    const notification = document.getElementById('camera-success-notification');
    if (notification) {
        notification.classList.remove('show');
    }
}

// Logout handler - shared with dashboard
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
}

