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
            <h3 class="camera-name">${data.name}</h3>
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
