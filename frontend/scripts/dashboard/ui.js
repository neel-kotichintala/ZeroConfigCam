(function () {
  function cleanCameraName(name, cameraId = null) {
    if (!name) return name;
    let cleanName = name;
    if (cleanName.startsWith('Camera ')) cleanName = cleanName.substring(7);
    if (cleanName.startsWith('ESP32S3_')) {
      cleanName = cleanName.replace('ESP32S3_', 'CAM_');
      if (cleanName === 'CAM_' && cameraId) {
        const shortId = cameraId.slice(-6).toUpperCase();
        cleanName = `CAM_${shortId}`;
      } else if (cleanName === 'CAM_') {
        cleanName = 'CAM_DEVICE';
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
                            <input type="range" class="quality-slider" id="quality-${data.cameraId}" min="4" max="63" value="15" step="1">
                            <div class="quality-value" id="quality-value-${data.cameraId}">15</div>
                        </div>
                        <div class="quality-info">4 = Highest Quality, 63 = Lowest Quality</div>
                    </div>
                    <div class="settings-buttons">
                        <button class="settings-btn settings-btn-apply" onclick="applyCameraSettings('${data.cameraId}')">Apply</button>
                        <button class="settings-btn settings-btn-cancel" onclick="closeCameraSettings('${data.cameraId}')">Cancel</button>
                    </div>
                </div>
            </div>
        </div>`;
    setTimeout(() => {
      if (window.DashboardSettings && window.DashboardSettings.setupCameraModalListeners) {
        window.DashboardSettings.setupCameraModalListeners(data.cameraId);
      }
    }, 100);
    return card;
  }

  // View switching and carousel
  let currentView = 'grid';
  let carouselIndex = 0;

  function setView(view) {
    const container = document.getElementById('camerasContainer');
    container.classList.remove('grid-view', 'list-view', 'full-view');
    document.querySelectorAll('.view-controls .btn').forEach((b) => b.classList.remove('active'));
    const viewBtn = document.getElementById(`view-${view}`);
    if (viewBtn) viewBtn.classList.add('active');
    if (view === 'grid') container.classList.add('grid-view');
    else if (view === 'list') container.classList.add('list-view');
    else if (view === 'full') {
      container.classList.add('full-view');
      setupCarousel();
    }
    if (view !== 'full') removeCarousel();
    currentView = view;
    localStorage.setItem('dashboardView', view);
  }

  function setupCarousel() {
    const container = document.getElementById('camerasContainer');
    const cards = Array.from(container.querySelectorAll('.camera-card'));
    if (cards.length === 0) {
      removeCarousel();
      return;
    }
    if (!document.querySelector('.carousel-nav.prev')) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'carousel-nav prev';
      prevBtn.innerHTML = '&#10094;';
      prevBtn.onclick = () => navigateCarousel(-1);
      container.appendChild(prevBtn);
    }
    if (!document.querySelector('.carousel-nav.next')) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'carousel-nav next';
      nextBtn.innerHTML = '&#10095;';
      nextBtn.onclick = () => navigateCarousel(1);
      container.appendChild(nextBtn);
    }
    if (carouselIndex >= cards.length) carouselIndex = cards.length - 1;
    if (carouselIndex < 0) carouselIndex = 0;
    cards.forEach((c, index) => c.classList.toggle('active', index === carouselIndex));
  }

  function removeCarousel() {
    const container = document.getElementById('camerasContainer');
    document.querySelectorAll('.carousel-nav').forEach((nav) => nav.remove());
    container.querySelectorAll('.camera-card').forEach((c) => {
      c.classList.remove('active');
      c.style.display = '';
    });
  }

  function navigateCarousel(direction) {
    const container = document.getElementById('camerasContainer');
    const cards = container.querySelectorAll('.camera-card');
    if (cards.length === 0) return;
    cards[carouselIndex].classList.remove('active');
    carouselIndex = (carouselIndex + direction + cards.length) % cards.length;
    cards[carouselIndex].classList.add('active');
  }

  async function editCameraName(cameraId, currentName) {
    const nameEl = document.getElementById(`name-${cameraId}`);
    const editBtn = nameEl?.parentElement?.querySelector('.btn-edit');
    if (!nameEl || !editBtn) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'camera-name-input';
    input.style.cssText = 'background: white; border: 2px solid #667eea; border-radius: 6px; padding: 0.5rem; font-size: 1rem; font-weight: 600; color: #2d3748; width: 100%; outline: none; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);';
    nameEl.style.display = 'none';
    editBtn.style.display = 'none';
    nameEl.parentElement.insertBefore(input, nameEl);
    input.focus();
    input.select();
    const saveChanges = async () => {
      const newName = input.value.trim();
      if (!newName || newName === currentName) {
        input.remove();
        nameEl.style.display = 'block';
        editBtn.style.display = 'flex';
        return;
      }
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/camera/${cameraId}/rename`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: newName }),
        });
        const data = await response.json();
        if (response.ok) {
          nameEl.textContent = newName;
          editBtn.setAttribute('onclick', `editCameraName('${cameraId}', '${newName}')`);
          input.remove();
          nameEl.style.display = 'block';
          editBtn.style.display = 'flex';
        } else {
          alert(data.error || 'Failed to rename camera');
          input.remove();
          nameEl.style.display = 'block';
          editBtn.style.display = 'flex';
        }
      } catch (error) {
        console.error('Error renaming camera:', error);
        alert('Network error. Please try again.');
        input.remove();
        nameEl.style.display = 'block';
        editBtn.style.display = 'flex';
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveChanges();
      } else if (e.key === 'Escape') {
        input.remove();
        nameEl.style.display = 'block';
        editBtn.style.display = 'flex';
      }
    });
    input.addEventListener('blur', () => setTimeout(saveChanges, 100));
  }

  // Delete modal helpers
  function bindDeleteModalEvents() {
    const deleteModal = document.getElementById('delete-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    let cameraToDelete = null;
    window.deleteCamera = function (cameraId) {
      cameraToDelete = cameraId;
      if (deleteModal) deleteModal.style.display = 'flex';
    };
    cancelDeleteBtn?.addEventListener('click', () => {
      if (deleteModal) deleteModal.style.display = 'none';
      cameraToDelete = null;
    });
    confirmDeleteBtn?.addEventListener('click', () => {
      if (!cameraToDelete) return;
      const token = localStorage.getItem('token');
      fetch(`/api/camera/${cameraToDelete}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        .catch((error) => {
          console.error('Error deleting camera:', error);
          alert('An error occurred while trying to delete the camera.');
        })
        .finally(() => {
          if (deleteModal) deleteModal.style.display = 'none';
          cameraToDelete = null;
        });
    });
  }

  function bindViewButtons() {
    const viewGridBtn = document.getElementById('view-grid');
    const viewListBtn = document.getElementById('view-list');
    const viewFullBtn = document.getElementById('view-full');
    viewGridBtn?.addEventListener('click', () => setView('grid'));
    viewListBtn?.addEventListener('click', () => setView('list'));
    viewFullBtn?.addEventListener('click', () => setView('full'));
  }

  function showCameraMessage(cameraId, message, type = 'info') {
    const card = document.getElementById(`camera-${cameraId}`);
    if (!card) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `camera-message camera-message-${type}`;
    messageDiv.style.cssText = 'position: absolute; top: 10px; left: 10px; right: 10px; background: ' +
      (type === 'success' ? '#48bb78' : '#e53e3e') +
      '; color: white; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; text-align: center; z-index: 20; animation: slideInDown 0.3s ease-out;';
    messageDiv.textContent = message;
    const videoContainer = card.querySelector('.video-container');
    videoContainer.style.position = 'relative';
    videoContainer.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 3000);
  }

  window.DashboardUI = {
    cleanCameraName,
    createCameraCard,
    setView,
    setupCarousel,
    removeCarousel,
    navigateCarousel,
    editCameraName,
    bindDeleteModalEvents,
    bindViewButtons,
    showCameraMessage,
  };
  // Export commonly used functions to global for inline handlers
  window.editCameraName = editCameraName;
})();

