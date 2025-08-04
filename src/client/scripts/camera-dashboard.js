const camerasContainer = document.getElementById('camerasContainer');
const noCamerasMessage = document.getElementById('noCamerasMessage');
const usernameSpan = document.getElementById('username');
const token = localStorage.getItem('token');

if (!token) {
    window.location.href = '/';
}

// Initialize SocketManager for centralized connection handling
let socketManager = null;
let socket = null; // Keep for backward compatibility

// Initialize socket connection using SocketManager
async function initializeSocket() {
    try {
        // Check if SocketManager is available
        if (!window.SocketManager) {
            throw new Error('SocketManager class not available. Make sure socket-manager.js is loaded.');
        }

        // Create EventEmitter if not available
        if (!window.eventEmitter && window.EventEmitter) {
            window.eventEmitter = new EventEmitter();
        }

        // Create SocketManager
        socketManager = new SocketManager(window.eventEmitter);

        // Enable legacy mode for backward compatibility
        socketManager.enableLegacyMode();

        // Connect to server
        await socketManager.connect();

        // Make socket available for legacy code
        socket = socketManager.socket;
        window.socket = socket;

        console.log('✅ Socket connection initialized via SocketManager');

    } catch (error) {
        console.error('❌ Failed to initialize socket connection:', error);

        // Fallback to direct socket connection if SocketManager fails
        console.log('🔄 Falling back to direct socket connection...');
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            socket = io({ auth: { token } });
            window.socket = socket;

            // Setup basic event handlers for fallback mode
            socket.on('connect', () => {
                console.log('✅ Connected to server via direct WebSocket connection.');
            });

            socket.on('connect_error', (err) => {
                console.error('❌ Connection Failed:', err.message);
                if (err.message.includes('Authentication error')) {
                    logout();
                }
            });

            // Setup legacy event handlers directly
            socket.on('cameraStatusUpdate', window.handleCameraStatusUpdate);
            socket.on('cameraAutoAdded', window.handleCameraAutoAdded);
            socket.on('stream', window.handleStreamData);
            socket.on('camera-control-sent', window.handleCameraControlSent);
            socket.on('camera-control-error', window.handleCameraControlError);

            console.log('✅ Fallback socket connection established');

        } catch (fallbackError) {
            console.error('❌ Fallback socket connection also failed:', fallbackError);
            if (fallbackError.message.includes('Authentication error') || fallbackError.message.includes('No authentication token')) {
                logout();
            }
        }
    }
}

// Legacy event handlers for backward compatibility
window.handleCameraStatusUpdate = function (data) {
    let card = document.getElementById(`camera-${data.cameraId}`);

    if (data.status === 'deleted') {
        if (card) {
            card.remove();
        }
        // Clean up stored settings for deleted camera
        if (cameraSettings[data.cameraId]) {
            delete cameraSettings[data.cameraId];
            saveCameraSettings(); // Update localStorage
        }
        // Close settings modal if it's open for this camera
        closeCameraSettings(data.cameraId);
    } else { // 'online', 'offline', or 'streaming'
        if (!card) {
            card = createCameraCard(data);
            camerasContainer.appendChild(card);
        }
        // Always update status and name, as it might change
        const statusEl = document.getElementById(`status-${data.cameraId}`);
        const nameEl = card.querySelector('.camera-name');
        if (statusEl) {
            statusEl.textContent = data.status;
            statusEl.className = `camera-status status-${data.status}`;
        }
        if (nameEl) {
            nameEl.textContent = cleanCameraName(data.name, data.cameraId);
        }

        if (data.status === 'offline') {
            const videoEl = document.getElementById(`video-${data.cameraId}`);
            if (videoEl) videoEl.src = ''; // Clear image on offline
        }
    }

    // Update 'no cameras' message visibility and grid layout
    setTimeout(() => {
        const cards = camerasContainer.querySelectorAll('.camera-card');
        const hasCards = cards.length > 0;

        noCamerasMessage.style.display = hasCards ? 'none' : 'block';

        // Add classes for optimal layout based on camera count
        camerasContainer.classList.remove('single-camera', 'two-cameras');

        if (cards.length === 1) {
            camerasContainer.classList.add('single-camera');
        } else if (cards.length === 2) {
            camerasContainer.classList.add('two-cameras');
        }

        if (currentView === 'full') {
            setupCarousel(); // Re-setup carousel in case cards changed
        }
    }, 100); // A small delay to allow the DOM to update
};

window.handleCameraAutoAdded = function (data) {
    console.log('✅ DASHBOARD: Camera auto-added:', data);
    // Notification removed - only show on setup page
};

window.handleStreamData = async function (data) {
    console.log('🚨 STREAM EVENT RECEIVED!', data);

    const videoElement = document.getElementById(`video-${data.cameraId}`);
    if (!videoElement) {
        console.warn(`⚠️ Video element not found for camera ${data.cameraId}`);
        return;
    }

    try {
        console.log(`📺 Received stream data for camera ${data.cameraId}:`);
        console.log('- Frame type:', typeof data.frame);
        console.log('- Frame constructor:', data.frame?.constructor?.name);
        console.log('- Frame size:', data.frame?.length || data.frame?.byteLength || 'unknown');
        console.log('- Has frame:', !!data.frame);
        console.log('- Full data object:', data);
        console.log('- Frame data sample (first 10 bytes):', data.frame?.slice ? Array.from(data.frame.slice(0, 10)) : 'No slice method');

        const url = await processBinaryFrame(data.frame, data.cameraId);
        console.log('✅ Generated blob URL:', url);

        // Clean up previous URL to prevent memory leaks
        if (videoElement.src && videoElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(videoElement.src);
        }

        videoElement.src = url;
        console.log('🔄 Set video element src to:', url);

        videoElement.onload = () => {
            URL.revokeObjectURL(url);
            console.log(`🖼️ Frame displayed successfully for camera ${data.cameraId}`);
        };

        videoElement.onerror = (error) => {
            console.error(`❌ Error displaying frame for camera ${data.cameraId}:`, error);
            console.error('❌ Video element error details:', {
                error: error.target?.error,
                src: error.target?.src,
                naturalWidth: error.target?.naturalWidth,
                naturalHeight: error.target?.naturalHeight,
                complete: error.target?.complete
            });

            // Try to get more specific error information
            if (error.target?.error) {
                console.error('❌ Media error code:', error.target.error.code);
                console.error('❌ Media error message:', error.target.error.message);
            }

            URL.revokeObjectURL(url);
        };

        // Update camera status
        const statusEl = document.getElementById(`status-${data.cameraId}`);
        if (statusEl && statusEl.textContent !== 'streaming') {
            statusEl.textContent = 'streaming';
            statusEl.className = 'camera-status status-streaming';
        }

    } catch (error) {
        console.error(`❌ Failed to process stream for camera ${data.cameraId}:`, error);
        console.error('❌ Error stack:', error.stack);

        // Update status to show error
        const statusEl = document.getElementById(`status-${data.cameraId}`);
        if (statusEl) {
            statusEl.textContent = 'error';
            statusEl.className = 'camera-status status-error';
        }
    }
};

window.handleCameraControlSent = function (data) {
    console.log('Camera control sent successfully:', data);
    showCameraMessage(data.cameraId, 'Settings applied successfully!', 'success');

    // Find the apply button for this specific camera
    const applyButton = document.querySelector(`#settings-modal-${data.cameraId} .settings-btn-apply`);
    if (applyButton) {
        // Clear timeout
        if (applyButton.dataset.timeoutId) {
            clearTimeout(parseInt(applyButton.dataset.timeoutId));
            delete applyButton.dataset.timeoutId;
        }

        // Re-enable button
        applyButton.disabled = false;
        applyButton.textContent = 'Apply';
    }

    // Close the modal for this camera
    closeCameraSettings(data.cameraId);
};

window.handleCameraControlError = function (data) {
    console.error('Camera control error:', data);

    // Remove the optimistic update on error
    if (cameraSettings[data.cameraId]) {
        delete cameraSettings[data.cameraId];
        saveCameraSettings(); // Update localStorage
    }

    showCameraMessage(data.cameraId, `Error: ${data.error}`, 'error');

    // Find the apply button for this specific camera
    const applyButton = document.querySelector(`#settings-modal-${data.cameraId} .settings-btn-apply`);
    if (applyButton) {
        // Clear timeout
        if (applyButton.dataset.timeoutId) {
            clearTimeout(parseInt(applyButton.dataset.timeoutId));
            delete applyButton.dataset.timeoutId;
        }

        // Re-enable button
        applyButton.disabled = false;
        applyButton.textContent = 'Apply';
    }
};

// Handle window resize to reposition modals if needed
function handleWindowResize() {
    // Find any open camera settings modals and reposition them
    document.querySelectorAll('.camera-settings-modal.show').forEach(modal => {
        const cameraId = modal.id.replace('settings-modal-', '');
        const cameraCard = document.getElementById(`camera-${cameraId}`);

        if (cameraCard) {
            // Check if modal needs to be repositioned
            const cardRect = cameraCard.getBoundingClientRect();
            const cardWidth = cardRect.width;
            const cardHeight = cardRect.height;
            const minCardSize = 400;

            const shouldBeCentered = cardWidth < minCardSize || cardHeight < 300;
            const isCentered = modal.classList.contains('centered-modal');

            if (shouldBeCentered && !isCentered) {
                // Switch to centered mode
                closeCameraSettings(cameraId);
                setTimeout(() => openCameraSettings(cameraId), 100);
            } else if (!shouldBeCentered && isCentered) {
                // Switch to inline mode
                closeCameraSettings(cameraId);
                setTimeout(() => openCameraSettings(cameraId), 100);
            }
        }
    });
}

// Add dark mode compatible styles for camera settings modal
function addCameraSettingsStyles() {
    const styleId = 'camera-settings-dark-mode-styles';
    if (document.getElementById(styleId)) return; // Already added

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        /* Camera Settings Modal Dark Mode Compatibility */
        .camera-settings-modal .settings-panel {
            background: var(--bg-primary, #ffffff);
            color: var(--text-primary, #2d3748);
            border: 1px solid var(--border-color, #e2e8f0);
        }

        [data-theme="dark"] .camera-settings-modal .settings-panel {
            background: var(--bg-primary, #2d3748);
            color: var(--text-primary, #f7fafc);
            border: 1px solid var(--border-color, #4a5568);
        }

        .camera-settings-modal .settings-title {
            color: var(--text-primary, #2d3748);
            margin: 0 0 1.5rem 0;
            font-size: 1.25rem;
            font-weight: 600;
        }

        [data-theme="dark"] .camera-settings-modal .settings-title {
            color: var(--text-primary, #f7fafc);
        }

        .camera-settings-modal .setting-label {
            color: var(--text-secondary, #4a5568);
            font-weight: 500;
            margin-bottom: 0.5rem;
            display: block;
        }

        [data-theme="dark"] .camera-settings-modal .setting-label {
            color: var(--text-secondary, #a0aec0);
        }

        .camera-settings-modal .setting-select {
            background: var(--bg-secondary, #f7fafc);
            color: var(--text-primary, #2d3748);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 6px;
            padding: 0.5rem;
            width: 100%;
            font-size: 0.9rem;
        }

        [data-theme="dark"] .camera-settings-modal .setting-select {
            background: var(--bg-secondary, #4a5568);
            color: var(--text-primary, #f7fafc);
            border: 1px solid var(--border-color, #718096);
        }

        .camera-settings-modal .setting-select:focus {
            outline: none;
            border-color: var(--accent-color, #667eea);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .camera-settings-modal .quality-info {
            color: var(--text-tertiary, #718096);
            font-size: 0.8rem;
            margin-top: 0.5rem;
        }

        [data-theme="dark"] .camera-settings-modal .quality-info {
            color: var(--text-tertiary, #a0aec0);
        }

        .camera-settings-modal .quality-slider {
            background: var(--bg-secondary, #f7fafc);
        }

        [data-theme="dark"] .camera-settings-modal .quality-slider {
            background: var(--bg-secondary, #4a5568);
        }

        .camera-settings-modal .quality-value {
            background: var(--accent-color, #667eea);
            color: white;
        }

        .camera-settings-modal .settings-btn {
            border: none;
            border-radius: 6px;
            padding: 0.75rem 1.5rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .camera-settings-modal .settings-btn-apply {
            background: var(--success-color, #48bb78);
            color: white;
        }

        .camera-settings-modal .settings-btn-apply:hover:not(:disabled) {
            background: var(--success-hover, #38a169);
        }

        .camera-settings-modal .settings-btn-apply:disabled {
            background: var(--disabled-color, #a0aec0);
            cursor: not-allowed;
        }

        .camera-settings-modal .settings-btn-cancel {
            background: var(--bg-secondary, #f7fafc);
            color: var(--text-primary, #2d3748);
            border: 1px solid var(--border-color, #e2e8f0);
        }

        [data-theme="dark"] .camera-settings-modal .settings-btn-cancel {
            background: var(--bg-secondary, #4a5568);
            color: var(--text-primary, #f7fafc);
            border: 1px solid var(--border-color, #718096);
        }

        .camera-settings-modal .settings-btn-cancel:hover {
            background: var(--bg-hover, #edf2f7);
        }

        [data-theme="dark"] .camera-settings-modal .settings-btn-cancel:hover {
            background: var(--bg-hover, #718096);
        }

        /* Centered modal styles */
        .camera-settings-modal.centered-modal {
            backdrop-filter: blur(4px);
        }

        .camera-settings-modal.centered-modal .settings-panel {
            animation: modalSlideIn 0.3s ease-out;
        }

        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        /* Close button for centered modal */
        .camera-settings-modal.centered-modal .settings-panel::before {
            content: '×';
            position: absolute;
            top: 10px;
            right: 15px;
            font-size: 24px;
            font-weight: bold;
            color: var(--text-secondary, #718096);
            cursor: pointer;
            z-index: 1;
            line-height: 1;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s ease;
        }

        .camera-settings-modal.centered-modal .settings-panel::before:hover {
            background: var(--bg-hover, #f7fafc);
            color: var(--text-primary, #2d3748);
        }

        [data-theme="dark"] .camera-settings-modal.centered-modal .settings-panel::before:hover {
            background: var(--bg-hover, #4a5568);
            color: var(--text-primary, #f7fafc);
        }
    `;
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', async () => {
    const username = localStorage.getItem('username') || 'User';

    // Update desktop username
    if (usernameSpan) {
        usernameSpan.textContent = username;
    }

    // Update mobile menu username
    const mobileUsernameSpan = document.getElementById('mobile-username');
    if (mobileUsernameSpan) {
        mobileUsernameSpan.textContent = username;
    }

    // Load saved camera settings
    loadCameraSettings();

    // Apply saved view
    const savedView = localStorage.getItem('dashboardView') || 'grid';
    setView(savedView);

    // Add dark mode styles for camera settings
    addCameraSettingsStyles();

    // Add window resize listener to handle modal repositioning
    window.addEventListener('resize', handleWindowResize);

    // Initialize socket connection via SocketManager
    await initializeSocket();
});

function logout() {
    // Cleanup socket connection
    if (socketManager) {
        socketManager.cleanup();
    } else if (socket) {
        socket.disconnect();
    }

    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (socketManager) {
        socketManager.cleanup();
    } else if (socket) {
        socket.disconnect();
    }
});

// Clean camera name by removing "Camera" prefix
function cleanCameraName(name, cameraId = null) {
    if (!name) return name;

    // Remove "Camera " prefix if it exists
    let cleanName = name;
    if (cleanName.startsWith('Camera ')) {
        cleanName = cleanName.substring(7); // Remove "Camera " (7 characters)
    }

    // If it starts with ESP32S3_, replace with CAM_
    if (cleanName.startsWith('ESP32S3_')) {
        cleanName = cleanName.replace('ESP32S3_', 'CAM_');

        // If there's no MAC address after the underscore, use camera ID as fallback
        if (cleanName === 'CAM_' && cameraId) {
            // Use the last 6 characters of camera ID as a pseudo MAC
            const shortId = cameraId.slice(-6).toUpperCase();
            cleanName = `CAM_${shortId}`;
        } else if (cleanName === 'CAM_') {
            cleanName = 'CAM_DEVICE'; // Final fallback
        }
    }

    return cleanName;
}

function createCameraCard(data) {
    const card = document.createElement('div');
    card.className = 'camera-card';
    card.id = `camera-${data.cameraId}`;
    card.innerHTML = `
        <div class="camera-header">
            <div class="camera-name-section">
                <h3 class="camera-name" id="name-${data.cameraId}">${cleanCameraName(data.name, data.cameraId)}</h3>
                <button class="btn btn-edit btn-sm" onclick="editCameraName('${data.cameraId}', '${cleanCameraName(data.name, data.cameraId)}')" title="Edit camera name">
                    <i class='bx bx-edit'></i>
                </button>
            </div>
            <div class="camera-controls">
                <span id="status-${data.cameraId}" class="camera-status status-${data.status}">${data.status}</span>
                <button class="btn btn-danger btn-sm" onclick="deleteCamera('${data.cameraId}')">Delete</button>
            </div>
        </div>
        <div class="video-container">
            <img id="video-${data.cameraId}" class="video-element" />
            <button class="camera-settings-button" onclick="openCameraSettings('${data.cameraId}')" title="Camera Settings">
                <i class='bx bx-cog'></i>
            </button>
            
            <!-- Individual settings modal for this camera -->
            <div class="camera-settings-modal" id="settings-modal-${data.cameraId}">
                <div class="settings-panel">
                    <h4 class="settings-title"><i class='bx bx-cog'></i> Camera Settings</h4>
                    
                    <div class="setting-group">
                        <label class="setting-label">Resolution</label>
                        <select class="setting-select" id="resolution-${data.cameraId}">
                            <option value="QVGA">320 x 240</option>
                            <option value="CIF">352 x 288</option>
                            <option value="VGA" selected>640 x 480</option>
                            <option value="SVGA">800 x 600</option>
                            <option value="XGA">1024 x 768</option>
                            <option value="SXGA">1280 x 1024</option>
                            <option value="UXGA">1600 x 1200</option>
                        </select>
                    </div>
                    
                    <div class="setting-group">
                        <label class="setting-label">JPEG Quality</label>
                        <div class="quality-slider-container">
                            <input type="range" class="quality-slider" id="quality-${data.cameraId}" 
                                   min="0" max="63" value="15" step="1">
                            <div class="quality-value" id="quality-value-${data.cameraId}">15</div>
                        </div>
                        <div class="quality-info">0 = Highest Quality, 63 = Lowest Quality</div>
                    </div>
                    
                    <div class="settings-buttons">
                        <button class="settings-btn settings-btn-apply" onclick="applyCameraSettings('${data.cameraId}')">
                            Apply
                        </button>
                        <button class="settings-btn settings-btn-cancel" onclick="closeCameraSettings('${data.cameraId}')">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Set up event listeners for this camera's modal
    setTimeout(() => {
        setupCameraModalListeners(data.cameraId);
    }, 100); // Small delay to ensure DOM is ready

    return card;
}

const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let cameraToDelete = null;

function deleteCamera(cameraId) {
    cameraToDelete = cameraId;
    deleteModal.style.display = 'flex';
}

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.style.display = 'none';
    cameraToDelete = null;
});

confirmDeleteBtn.addEventListener('click', () => {
    if (!cameraToDelete) return;

    const token = localStorage.getItem('token');
    fetch(`/api/camera/${cameraToDelete}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    })
        .then(response => {
            if (!response.ok) {
                alert('Failed to delete camera.');
            }
            // The card removal is now handled by the 'cameraStatusUpdate' event for 'deleted'
        })
        .catch(error => {
            console.error('Error deleting camera:', error);
            alert('An error occurred while trying to delete the camera.');
        })
        .finally(() => {
            deleteModal.style.display = 'none';
            cameraToDelete = null;
        });
});






// --- View Switching Logic ---
const viewGridBtn = document.getElementById('view-grid');
const viewListBtn = document.getElementById('view-list');
const viewFullBtn = document.getElementById('view-full');
let currentView = 'grid'; // default view
let carouselIndex = 0;

function setView(view) {
    camerasContainer.classList.remove('grid-view', 'list-view', 'full-view');
    document.querySelectorAll('.view-controls .btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');

    if (view === 'grid') {
        camerasContainer.classList.add('grid-view');
    } else if (view === 'list') {
        camerasContainer.classList.add('list-view');
    } else if (view === 'full') {
        camerasContainer.classList.add('full-view');
        setupCarousel();
    }

    if (view !== 'full') {
        removeCarousel();
    }

    currentView = view;
    localStorage.setItem('dashboardView', view);
}

function setupCarousel() {
    const cards = Array.from(camerasContainer.querySelectorAll('.camera-card'));
    if (cards.length === 0) {
        removeCarousel(); // Clean up nav buttons if no cards are left
        return;
    }

    // Add nav buttons if they don't exist
    if (!document.querySelector('.carousel-nav.prev')) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'carousel-nav prev';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.onclick = () => navigateCarousel(-1);
        camerasContainer.appendChild(prevBtn);
    }
    if (!document.querySelector('.carousel-nav.next')) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'carousel-nav next';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.onclick = () => navigateCarousel(1);
        camerasContainer.appendChild(nextBtn);
    }

    // Validate carouselIndex
    if (carouselIndex >= cards.length) {
        carouselIndex = cards.length - 1;
    }
    if (carouselIndex < 0) {
        carouselIndex = 0;
    }

    // Show the correct card
    cards.forEach((c, index) => {
        c.classList.toggle('active', index === carouselIndex);
    });
}

function removeCarousel() {
    document.querySelectorAll('.carousel-nav').forEach(nav => nav.remove());
    // Reset card styles changed by the carousel
    camerasContainer.querySelectorAll('.camera-card').forEach(c => {
        c.classList.remove('active');
        c.style.display = '';
    });
}

function navigateCarousel(direction) {
    const cards = camerasContainer.querySelectorAll('.camera-card');
    if (cards.length === 0) return;
    cards[carouselIndex].classList.remove('active');
    carouselIndex = (carouselIndex + direction + cards.length) % cards.length;
    cards[carouselIndex].classList.add('active');
}

viewGridBtn.addEventListener('click', () => setView('grid'));
viewListBtn.addEventListener('click', () => setView('list'));
viewFullBtn.addEventListener('click', () => setView('full'));

// On page load, apply the saved view (handled in main DOMContentLoaded event)

// Edit camera name functionality with inline text input
function editCameraName(cameraId, currentName) {
    const nameEl = document.getElementById(`name-${cameraId}`);
    const editBtn = nameEl.parentElement.querySelector('.btn-edit');

    if (!nameEl || !editBtn) return;

    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'camera-name-input';
    input.style.cssText = `
        background: white;
        border: 2px solid #667eea;
        border-radius: 6px;
        padding: 0.5rem;
        font-size: 1rem;
        font-weight: 600;
        color: #2d3748;
        width: 100%;
        outline: none;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    `;

    // Replace name element with input
    nameEl.style.display = 'none';
    editBtn.style.display = 'none';
    nameEl.parentElement.insertBefore(input, nameEl);

    // Focus and select text
    input.focus();
    input.select();

    // Save function
    const saveChanges = async () => {
        const newName = input.value.trim();

        if (!newName || newName === currentName) {
            // Revert changes
            input.remove();
            nameEl.style.display = 'block';
            editBtn.style.display = 'flex';
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/camera/${cameraId}/rename`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newName })
            });

            const data = await response.json();

            if (response.ok) {
                // Update the UI
                nameEl.textContent = newName;
                editBtn.setAttribute('onclick', `editCameraName('${cameraId}', '${newName}')`);

                // Remove input and show name
                input.remove();
                nameEl.style.display = 'block';
                editBtn.style.display = 'flex';

                console.log('Camera renamed successfully');
            } else {
                alert(data.error || 'Failed to rename camera');
                // Revert changes
                input.remove();
                nameEl.style.display = 'block';
                editBtn.style.display = 'flex';
            }
        } catch (error) {
            console.error('Error renaming camera:', error);
            alert('Network error. Please try again.');
            // Revert changes
            input.remove();
            nameEl.style.display = 'block';
            editBtn.style.display = 'flex';
        }
    };

    // Event listeners
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveChanges();
        } else if (e.key === 'Escape') {
            // Cancel editing
            input.remove();
            nameEl.style.display = 'block';
            editBtn.style.display = 'flex';
        }
    });

    input.addEventListener('blur', () => {
        // Save when clicking outside
        setTimeout(saveChanges, 100); // Small delay to allow other events to process
    });
}

// Binary data format detection and conversion utilities
function detectBinaryDataFormat(data) {
    console.log('🔍 Analyzing data:', {
        type: typeof data,
        constructor: data?.constructor?.name,
        isArray: Array.isArray(data),
        hasTypeProperty: data?.type,
        hasDataProperty: data?.data,
        keys: data && typeof data === 'object' ? Object.keys(data) : 'N/A'
    });

    if (data instanceof ArrayBuffer) {
        return 'ArrayBuffer';
    } else if (data instanceof Uint8Array) {
        return 'Uint8Array';
    } else if (data && typeof data === 'object' && data.type === 'Buffer' && Array.isArray(data.data)) {
        return 'Buffer';
    } else if (data instanceof Blob) {
        return 'Blob';
    } else if (typeof data === 'string') {
        return 'Base64String';
    } else if (data && typeof data === 'object' && data.constructor && data.constructor.name === 'Buffer') {
        return 'NodeBuffer';
    } else if (data && typeof data === 'object' && typeof data.length === 'number') {
        return 'ArrayLike';
    }
    return 'Unknown';
}

function convertGrayscaleToImageBlob(grayscaleData, width, height) {
    try {
        // Create a canvas to convert grayscale data to image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Create ImageData from grayscale data
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        // Convert grayscale to RGBA
        for (let i = 0; i < grayscaleData.length; i++) {
            const grayValue = grayscaleData[i];
            const pixelIndex = i * 4;

            data[pixelIndex] = grayValue;     // Red
            data[pixelIndex + 1] = grayValue; // Green
            data[pixelIndex + 2] = grayValue; // Blue
            data[pixelIndex + 3] = 255;       // Alpha (fully opaque)
        }

        // Put the image data on canvas
        ctx.putImageData(imageData, 0, 0);

        // Convert canvas to blob
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                console.log(`✅ Converted grayscale to PNG blob: ${blob.size} bytes`);
                resolve(blob);
            }, 'image/png');
        });
    } catch (error) {
        console.error('❌ Failed to convert grayscale data:', error);
        throw error;
    }
}

async function convertBinaryDataToBlob(data, mimeType = 'image/jpeg') {
    const format = detectBinaryDataFormat(data);
    console.log(`🔍 Detected binary data format: ${format}`, data);

    try {
        switch (format) {
            case 'ArrayBuffer':
                console.log('✅ Converting ArrayBuffer to Blob, size:', data.byteLength);

                // Check if this looks like valid JPEG data
                const uint8View = new Uint8Array(data);
                const firstBytes = Array.from(uint8View.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
                const lastBytes = Array.from(uint8View.slice(-10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');

                console.log('🔍 First 10 bytes:', firstBytes);
                console.log('🔍 Last 10 bytes:', lastBytes);

                // Check for JPEG magic bytes (0xFF 0xD8 at start, 0xFF 0xD9 at end)
                const isValidJpeg = uint8View[0] === 0xFF && uint8View[1] === 0xD8 &&
                    uint8View[uint8View.length - 2] === 0xFF && uint8View[uint8View.length - 1] === 0xD9;
                console.log('🔍 Valid JPEG format:', isValidJpeg);

                if (!isValidJpeg) {
                    console.log('⚠️ Data is not valid JPEG, attempting to convert raw grayscale data');

                    // Assume this is raw grayscale data from ESP32 camera
                    // Common ESP32 camera resolutions: 320x240 (QVGA), 640x480 (VGA)
                    const possibleSizes = [
                        { width: 320, height: 240, name: 'QVGA' },
                        { width: 640, height: 480, name: 'VGA' },
                        { width: 160, height: 120, name: 'QQVGA' },
                        { width: 176, height: 144, name: 'QCIF' }
                    ];

                    let bestMatch = null;
                    for (const size of possibleSizes) {
                        if (size.width * size.height === uint8View.length) {
                            bestMatch = size;
                            break;
                        }
                    }

                    if (bestMatch) {
                        console.log(`🎯 Converting ${bestMatch.name} grayscale data (${bestMatch.width}x${bestMatch.height})`);
                        return await convertGrayscaleToImageBlob(uint8View, bestMatch.width, bestMatch.height);
                    } else {
                        console.log(`⚠️ Unknown data size: ${uint8View.length} bytes, trying as raw binary`);
                        return new Blob([data], { type: 'application/octet-stream' });
                    }
                }

                return new Blob([data], { type: mimeType });

            case 'Uint8Array':
                return new Blob([data], { type: mimeType });

            case 'Buffer':
                // Socket.IO Buffer format: { type: 'Buffer', data: [1,2,3...] }
                const uint8Array = new Uint8Array(data.data);
                return new Blob([uint8Array], { type: mimeType });

            case 'NodeBuffer':
                // Node.js Buffer object
                const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                return new Blob([arrayBuffer], { type: mimeType });

            case 'Blob':
                return data; // Already a Blob

            case 'Base64String':
                // Convert base64 to binary
                const binaryString = atob(data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                return new Blob([bytes], { type: mimeType });

            case 'ArrayLike':
                // Handle array-like objects (might be from Socket.IO)
                console.log('🔄 Converting array-like object to Uint8Array');
                const arrayData = Array.from(data);
                const uint8ArrayFromArray = new Uint8Array(arrayData);
                return new Blob([uint8ArrayFromArray], { type: mimeType });

            default:
                console.warn('🚨 Unknown binary data format, attempting direct Blob creation');
                console.log('🚨 Data details:', data);
                return new Blob([data], { type: mimeType });
        }
    } catch (error) {
        console.error('❌ Error converting binary data to Blob:', error);
        throw error;
    }
}

function processBinaryFrame(frameData, cameraId) {
    return new Promise(async (resolve, reject) => {
        try {
            const blob = await convertBinaryDataToBlob(frameData);
            const url = URL.createObjectURL(blob);
            console.log(`✅ Successfully processed frame for camera ${cameraId}, blob size: ${blob.size} bytes`);
            resolve(url);
        } catch (error) {
            console.error(`❌ Failed to process frame for camera ${cameraId}:`, error);
            reject(error);
        }
    });
}





// Camera Settings Functions
let cameraSettings = {}; // Store current settings for each camera

// Load camera settings from localStorage
function loadCameraSettings() {
    try {
        const saved = localStorage.getItem('cameraSettings');
        if (saved) {
            cameraSettings = JSON.parse(saved);
            console.log('Loaded camera settings from localStorage:', cameraSettings);
        }
    } catch (error) {
        console.error('Error loading camera settings:', error);
        cameraSettings = {};
    }
}

// Save camera settings to localStorage
function saveCameraSettings() {
    try {
        localStorage.setItem('cameraSettings', JSON.stringify(cameraSettings));
        console.log('Saved camera settings to localStorage:', cameraSettings);
    } catch (error) {
        console.error('Error saving camera settings:', error);
    }
}

// Get current settings for a camera (saved or defaults)
function getCurrentCameraSettings(cameraId) {
    // Default ESP32 camera settings
    const defaults = { resolution: 'VGA', quality: 15 };

    // Return saved settings if available, otherwise defaults
    return cameraSettings[cameraId] || defaults;
}



function openCameraSettings(cameraId) {
    const modal = document.getElementById(`settings-modal-${cameraId}`);
    const resolutionSelect = document.getElementById(`resolution-${cameraId}`);
    const qualitySlider = document.getElementById(`quality-${cameraId}`);
    const qualityValue = document.getElementById(`quality-value-${cameraId}`);
    const cameraCard = document.getElementById(`camera-${cameraId}`);

    if (!modal || !resolutionSelect || !qualitySlider || !qualityValue || !cameraCard) {
        console.error('Settings elements not found for camera:', cameraId);
        return;
    }

    // Load current settings for this camera (saved or defaults)
    const currentSettings = getCurrentCameraSettings(cameraId);

    resolutionSelect.value = currentSettings.resolution;
    qualitySlider.value = currentSettings.quality.toString();
    qualityValue.textContent = currentSettings.quality.toString();

    // Update slider position
    const percent = (currentSettings.quality - qualitySlider.min) / (qualitySlider.max - qualitySlider.min);
    qualityValue.style.left = `${percent * 100}%`;

    // Check if camera card is too small for inline modal
    const cardRect = cameraCard.getBoundingClientRect();
    const cardWidth = cardRect.width;
    const cardHeight = cardRect.height;
    const minCardSize = 400; // Minimum size to show modal inline

    if (cardWidth < minCardSize || cardHeight < 300) {
        // Card is too small, show modal centered on screen
        modal.classList.add('centered-modal');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.zIndex = '1000';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

        // Style the settings panel for centered display
        const settingsPanel = modal.querySelector('.settings-panel');
        if (settingsPanel) {
            settingsPanel.style.position = 'relative';
            settingsPanel.style.maxWidth = '400px';
            settingsPanel.style.width = '90%';
            settingsPanel.style.maxHeight = '80vh';
            settingsPanel.style.overflow = 'auto';
            settingsPanel.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.3)';
        }
    } else {
        // Card is large enough, show modal inline
        modal.classList.remove('centered-modal');
        modal.style.position = '';
        modal.style.top = '';
        modal.style.left = '';
        modal.style.width = '';
        modal.style.height = '';
        modal.style.zIndex = '';
        modal.style.display = '';
        modal.style.alignItems = '';
        modal.style.justifyContent = '';
        modal.style.backgroundColor = '';

        // Reset settings panel styles
        const settingsPanel = modal.querySelector('.settings-panel');
        if (settingsPanel) {
            settingsPanel.style.position = '';
            settingsPanel.style.maxWidth = '';
            settingsPanel.style.width = '';
            settingsPanel.style.maxHeight = '';
            settingsPanel.style.overflow = '';
            settingsPanel.style.boxShadow = '';
        }
    }

    // Show modal
    modal.classList.add('show');

    console.log(`Opening settings for camera: ${cameraId}`, currentSettings);
}

function closeCameraSettings(cameraId) {
    const modal = document.getElementById(`settings-modal-${cameraId}`);
    if (modal) {
        modal.classList.remove('show');

        // Clean up centered modal styles if they were applied
        if (modal.classList.contains('centered-modal')) {
            modal.classList.remove('centered-modal');
            modal.style.position = '';
            modal.style.top = '';
            modal.style.left = '';
            modal.style.width = '';
            modal.style.height = '';
            modal.style.zIndex = '';
            modal.style.display = '';
            modal.style.alignItems = '';
            modal.style.justifyContent = '';
            modal.style.backgroundColor = '';

            // Reset settings panel styles
            const settingsPanel = modal.querySelector('.settings-panel');
            if (settingsPanel) {
                settingsPanel.style.position = '';
                settingsPanel.style.maxWidth = '';
                settingsPanel.style.width = '';
                settingsPanel.style.maxHeight = '';
                settingsPanel.style.overflow = '';
                settingsPanel.style.boxShadow = '';
            }
        }
    }
}

function applyCameraSettings(cameraId) {
    const resolutionSelect = document.getElementById(`resolution-${cameraId}`);
    const qualitySlider = document.getElementById(`quality-${cameraId}`);
    const applyButton = document.querySelector(`#settings-modal-${cameraId} .settings-btn-apply`);

    if (!resolutionSelect || !qualitySlider || !applyButton) {
        console.error('Settings elements not found for camera:', cameraId);
        return;
    }

    const resolution = resolutionSelect.value;
    const quality = parseInt(qualitySlider.value);

    console.log(`Applying settings to camera ${cameraId}:`, { resolution, quality });

    // Store the settings locally (optimistic update)
    cameraSettings[cameraId] = { resolution, quality };
    saveCameraSettings(); // Persist to localStorage

    // Disable apply button during request
    applyButton.disabled = true;
    applyButton.textContent = 'Applying...';

    // Add timeout for the request with fallback success
    const timeoutId = setTimeout(() => {
        console.warn('Camera control request timed out - assuming success');
        applyButton.disabled = false;
        applyButton.textContent = 'Apply';

        // Close modal as fallback (success message will be shown by the socket handler)
        closeCameraSettings(cameraId);
    }, 5000); // 5 second timeout with success fallback

    // Store timeout ID to clear it if we get a response
    applyButton.dataset.timeoutId = timeoutId;
    applyButton.dataset.cameraId = cameraId; // Store camera ID for response handling

    // Send camera control command via SocketManager or fallback socket
    const socketToUse = socketManager || socket;
    if (socketToUse) {
        socketToUse.emit('camera-control', {
            cameraId: cameraId,
            command: 'settings',
            settings: {
                resolution: resolution,
                quality: quality
            }
        });

        // Provide immediate feedback - close modal after a short delay
        setTimeout(() => {
            clearTimeout(timeoutId);
            applyButton.disabled = false;
            applyButton.textContent = 'Apply';
            closeCameraSettings(cameraId);
        }, 1000); // 1 second delay for user feedback

    } else {
        console.error('No socket connection available');
        applyButton.disabled = false;
        applyButton.textContent = 'Apply';
        showCameraMessage(cameraId, 'No connection available. Please refresh the page.', 'error');
        clearTimeout(timeoutId);
    }
}

// Camera control responses are now handled by SocketManager via legacy handlers

// Setup individual camera modal event listeners
function setupCameraModalListeners(cameraId) {
    const modal = document.getElementById(`settings-modal-${cameraId}`);
    const qualitySlider = document.getElementById(`quality-${cameraId}`);
    const qualityValue = document.getElementById(`quality-value-${cameraId}`);

    if (!modal || !qualitySlider || !qualityValue) {
        console.error('Modal elements not found for camera:', cameraId);
        return;
    }

    // Quality slider
    qualitySlider.addEventListener('input', function () {
        qualityValue.textContent = this.value;
        // Position the value indicator
        const percent = (this.value - this.min) / (this.max - this.min);
        qualityValue.style.left = `${percent * 100}%`;
    });

    // Close modal when clicking outside the settings panel or on backdrop
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeCameraSettings(cameraId);
        }
    });

    // Handle close button click for centered modal (using event delegation)
    modal.addEventListener('click', (e) => {
        const settingsPanel = modal.querySelector('.settings-panel');
        if (settingsPanel && e.target === settingsPanel && modal.classList.contains('centered-modal')) {
            // Check if click is on the close button area (top-right corner)
            const rect = settingsPanel.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Close button is in top-right 40px x 40px area
            if (clickX >= rect.width - 40 && clickX <= rect.width && clickY >= 0 && clickY <= 40) {
                closeCameraSettings(cameraId);
            }
        }
    });
}

// Global escape key handler for all camera modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close any open camera settings modals
        document.querySelectorAll('.camera-settings-modal.show').forEach(modal => {
            const cameraId = modal.id.replace('settings-modal-', '');
            closeCameraSettings(cameraId);
        });
    }
});

function showCameraMessage(cameraId, message, type = 'info') {
    // Create a temporary message overlay
    const card = document.getElementById(`camera-${cameraId}`);
    if (!card) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `camera-message camera-message-${type}`;
    messageDiv.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        right: 10px;
        background: ${type === 'success' ? '#48bb78' : '#e53e3e'};
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 600;
        text-align: center;
        z-index: 20;
        animation: slideInDown 0.3s ease-out;
    `;
    messageDiv.textContent = message;

    const videoContainer = card.querySelector('.video-container');
    videoContainer.style.position = 'relative';
    videoContainer.appendChild(messageDiv);

    // Remove message after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}


