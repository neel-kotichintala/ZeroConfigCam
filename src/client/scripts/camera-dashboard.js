const camerasContainer = document.getElementById('camerasContainer');
const noCamerasMessage = document.getElementById('noCamerasMessage');
const usernameSpan = document.getElementById('username');
const token = localStorage.getItem('token');

if (!token) {
    window.location.href = '/';
}

const socket = io({ auth: { token } });

socket.on('connect', () => {
    console.log('Connected to server via WebSocket.');
});

socket.on('connect_error', (err) => {
    console.error('Connection Failed:', err.message);
    if (err.message.includes('Authentication error')) {
        logout(); // Redirect to login on auth failure
    }
});

document.addEventListener('DOMContentLoaded', () => {
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
});

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
}

function createCameraCard(data) {
    const card = document.createElement('div');
    card.className = 'camera-card';
    card.id = `camera-${data.cameraId}`;
    card.innerHTML = `
        <div class="camera-header">
            <div class="camera-name-section">
                <h3 class="camera-name" id="name-${data.cameraId}">${data.name}</h3>
                <button class="btn btn-edit btn-sm" onclick="editCameraName('${data.cameraId}', '${data.name}')" title="Edit camera name">
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
        </div>
    `;
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

socket.on('cameraStatusUpdate', (data) => {
    let card = document.getElementById(`camera-${data.cameraId}`);

    if (data.status === 'deleted') {
        if (card) {
            card.remove();
        }
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
            nameEl.textContent = data.name;
        }

        if (data.status === 'offline') {
            const videoEl = document.getElementById(`video-${data.cameraId}`);
            if(videoEl) videoEl.src = ''; // Clear image on offline
        }
    }

    // Update 'no cameras' message visibility
    setTimeout(() => {
        const hasCards = camerasContainer.querySelector('.camera-card');
        noCamerasMessage.style.display = hasCards ? 'none' : 'block';
        if (currentView === 'full') {
            setupCarousel(); // Re-setup carousel in case cards changed
        }
    }, 100); // A small delay to allow the DOM to update
});

// Remove manual claim functionality - cameras are now auto-added

// Listen for auto-added camera notifications
socket.on('cameraAutoAdded', (data) => {
    console.log('✅ DASHBOARD: Camera auto-added:', data);
    showCameraAddedNotification(data.name, data.message);
});

// Manual claim functionality removed - cameras are now auto-added

// Show sleek notification for auto-added cameras
function showCameraAddedNotification(cameraName, message) {
    // Remove existing notification if it exists
    const existingNotification = document.getElementById('camera-added-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create new notification element
    const notification = document.createElement('div');
    notification.id = 'camera-added-notification';
    notification.className = 'camera-added-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#10B981"/>
                    <path d="M9 12l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="notification-text">
                <h4>Camera Added!</h4>
                <p>${message}</p>
            </div>
            <div class="notification-actions">
                <button class="btn btn-primary view-dashboard-btn">View Dashboard</button>
                <button class="btn btn-secondary dismiss-added-btn">Dismiss</button>
            </div>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Add event listeners to the new elements
    notification.querySelector('.view-dashboard-btn').addEventListener('click', () => {
        hideAddedNotification();
        // Already on dashboard, just scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    notification.querySelector('.dismiss-added-btn').addEventListener('click', () => {
        hideAddedNotification();
    });
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Auto-hide after 6 seconds
    setTimeout(() => {
        hideAddedNotification();
    }, 6000);
}

function hideAddedNotification() {
    const notification = document.getElementById('camera-added-notification');
    if (notification) {
        notification.classList.remove('show');
    }
}

// Manual claim functionality removed - cameras are now auto-added

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

// On page load, apply the saved view
document.addEventListener('DOMContentLoaded', () => {
    const savedView = localStorage.getItem('dashboardView') || 'grid';
    setView(savedView);
});

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

socket.on('stream', (data) => {
    const videoElement = document.getElementById(`video-${data.cameraId}`);
    if (videoElement) {
        const blob = new Blob([data.frame], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        videoElement.src = url;
        videoElement.onload = () => URL.revokeObjectURL(url); // Clean up memory

        const statusEl = document.getElementById(`status-${data.cameraId}`);
        if (statusEl && statusEl.textContent !== 'streaming') {
            statusEl.textContent = 'streaming';
            statusEl.className = 'camera-status status-streaming';
        }
    }
});
