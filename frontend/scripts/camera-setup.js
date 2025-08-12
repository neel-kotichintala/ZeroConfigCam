// Copied from original src client script
let currentQRCode = null;
let socket;

document.addEventListener('DOMContentLoaded', () => {
  const username = localStorage.getItem('username') || 'User';
  const usernameSpan = document.getElementById('username');
  if (usernameSpan) usernameSpan.textContent = username;
  const mobileUsernameSpan = document.getElementById('mobile-username');
  if (mobileUsernameSpan) mobileUsernameSpan.textContent = username;
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/'; return; }
  socket = io({ auth: { token } });
  socket.on('connect', () => console.log('Connected to server for setup updates.'));
  socket.on('connect_error', (err) => console.error('Socket connection failed:', err.message));
  socket.on('cameraAutoAdded', (data) => showCameraSuccessNotification(data.name, data.message));
  loadPreviousQRCodes();
});

const formSection = document.getElementById('formSection');
const qrSection = document.getElementById('qrSection');
const successSection = document.getElementById('successSection');
const setupForm = document.getElementById('setupForm');
const alert = document.getElementById('alert');
const generateBtn = document.getElementById('generateBtn');
const generateLoading = document.getElementById('generateLoading');
const qrCodeContainer = document.getElementById('qrCodeContainer');
const qrCodeImage = document.getElementById('qrCodeImage');
const modal = document.getElementById('qrModal');
const modalImg = document.getElementById('modalQrImage');

setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const wifiSSID = document.getElementById('wifiSSID').value;
  const wifiPassword = document.getElementById('wifiPassword').value;
  if (!wifiSSID || !wifiPassword) return showAlert('Please fill in WiFi credentials', 'error');
  setLoading(generateBtn, generateLoading, true);
  try {
    const token = localStorage.getItem('token');
    if (!token) { showAlert('Authentication error. Please log in again.', 'error'); window.location.href = '/'; return; }
    const response = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ wifi_ssid: wifiSSID, wifi_password: wifiPassword }) });
    const data = await response.json();
    if (response.ok) {
      qrCodeImage.src = data.qrCode;
      showQRSection();
      showAlert(data.message, 'info');
      loadPreviousQRCodes();
    } else showAlert(data.error || 'Failed to generate QR code', 'error');
  } catch (error) {
    console.error('Setup error:', error);
    showAlert('Network error. Please try again.', 'error');
  } finally { setLoading(generateBtn, generateLoading, false); }
});

function showQRSection() {
  qrCodeContainer.onclick = function () { modal.style.display = 'flex'; modalImg.src = qrCodeImage.src; };
  const span = document.getElementsByClassName('close')[0];
  if (span) span.onclick = function () { modal.style.display = 'none'; };
  modal.onclick = function (event) { if (event.target == modal) modal.style.display = 'none'; };
  formSection.classList.add('hidden');
  qrSection.classList.remove('hidden');
  document.getElementById('step1').classList.remove('active');
  document.getElementById('step2').classList.add('active');
}

function showSuccessSection() {
  qrSection.classList.add('hidden');
  successSection.classList.remove('hidden');
  document.getElementById('step2').classList.remove('active');
  document.getElementById('step3').classList.add('active');
}

function goBackToForm() {
  qrSection.classList.add('hidden');
  formSection.classList.remove('hidden');
  document.getElementById('step2').classList.remove('active');
  document.getElementById('step1').classList.add('active');
}

function setupAnotherCamera() {
  successSection.classList.add('hidden');
  formSection.classList.remove('hidden');
  document.getElementById('step3').classList.remove('active');
  document.getElementById('step1').classList.add('active');
  setupForm.reset();
  hideAlert();
}

async function regenerateQR() { setupForm.dispatchEvent(new Event('submit')); }

function showAlert(message, type) {
  alert.textContent = message;
  alert.className = `alert alert-${type}`;
  alert.classList.remove('hidden');
}
function hideAlert() { alert.classList.add('hidden'); }
function setLoading(button, loadingSpinner, isLoading) { if (isLoading) { button.disabled = true; loadingSpinner.classList.remove('hidden'); } else { button.disabled = false; loadingSpinner.classList.add('hidden'); } }

async function loadPreviousQRCodes() {
  const qrCodesList = document.getElementById('qrCodesList');
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/qr-codes', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (response.ok && data.qrCodes && data.qrCodes.length > 0) displayQRCodes(data.qrCodes);
    else showNoQRCodes();
  } catch (error) { console.error('Error loading QR codes:', error); showNoQRCodes(); }
}

function displayQRCodes(qrCodes) {
  const qrCodesList = document.getElementById('qrCodesList');
  qrCodesList.innerHTML = qrCodes.map((qr) => `
        <div class="qr-code-item">
            <div class="qr-code-preview" onclick="showQRModal('${qr.qr_data}')">
                <img src="${qr.qr_data}" alt="QR Code for ${qr.wifi_ssid}">
            </div>
            <div class="qr-code-info">
                <h4>${qr.wifi_ssid}</h4>
                <p>Created: ${new Date(qr.created_at).toLocaleDateString()}</p>
            </div>
            <div class="qr-code-actions">
                <button class="btn btn-primary btn-sm" onclick="useQRCode('${qr.qr_data}', '${qr.wifi_ssid}')">Use This QR</button>
                <button class="btn btn-danger btn-sm" onclick="deleteQRCode(${qr.id})">Delete</button>
            </div>
        </div>`).join('');
}

function showNoQRCodes() {
  const qrCodesList = document.getElementById('qrCodesList');
  qrCodesList.innerHTML = `<div class="no-qr-codes"><i class='bx bx-qr'></i><h4>No Saved QR Codes</h4><p>Generate your first QR code above to get started!</p></div>`;
}

function showQRModal(qrData) { modal.style.display = 'flex'; modalImg.src = qrData; const span = document.getElementsByClassName('close')[0]; if (span) span.onclick = function () { modal.style.display = 'none'; }; modal.onclick = function (event) { if (event.target === modal) modal.style.display = 'none'; }; }
function useQRCode(qrData, wifiSSID) { qrCodeImage.src = qrData; document.getElementById('wifiSSID').value = wifiSSID; showQRSection(); showAlert(`Using saved QR code for "${wifiSSID}"`, 'info'); }
async function deleteQRCode(qrId) {
  if (!confirm('Are you sure you want to delete this QR code?')) return;
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/qr-codes/${qrId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) { showAlert('QR code deleted successfully', 'info'); loadPreviousQRCodes(); }
    else { const data = await response.json(); showAlert(data.error || 'Failed to delete QR code', 'error'); }
  } catch (error) { console.error('Error deleting QR code:', error); showAlert('Network error. Please try again.', 'error'); }
}

function showCameraSuccessNotification(cameraName, message) {
  const existingNotification = document.getElementById('camera-success-notification');
  if (existingNotification) existingNotification.remove();
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
        </div>`;
  document.body.appendChild(notification);
  notification.querySelector('.go-to-dashboard-btn').addEventListener('click', () => { window.location.href = '/dashboard'; });
  notification.querySelector('.dismiss-success-btn').addEventListener('click', () => { hideSuccessNotification(); });
  setTimeout(() => { notification.classList.add('show'); }, 100);
  setTimeout(() => { hideSuccessNotification(); }, 8000);
}
function hideSuccessNotification() { const notification = document.getElementById('camera-success-notification'); if (notification) notification.classList.remove('show'); }
function logout() { localStorage.removeItem('token'); localStorage.removeItem('username'); window.location.href = '/'; }
window.logout = logout;

