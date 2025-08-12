(function () {
  window.handleCameraStatusUpdate = function (data) {
    const container = document.getElementById('camerasContainer');
    let card = document.getElementById(`camera-${data.cameraId}`);
    if (data.status === 'deleted') {
      if (card) card.remove();
      if (window.DashboardSettings?.saveCameraSettings) {
        // Remove stored settings for deleted camera
        // Load, delete, save using provided API
        window.DashboardSettings.loadCameraSettings();
        const settings = JSON.parse(localStorage.getItem('cameraSettings') || '{}');
        if (settings[data.cameraId]) {
          delete settings[data.cameraId];
          localStorage.setItem('cameraSettings', JSON.stringify(settings));
        }
      }
      if (typeof window.closeCameraSettings === 'function') window.closeCameraSettings(data.cameraId);
    } else {
      if (!card) {
        card = window.DashboardUI.createCameraCard(data);
        container.appendChild(card);
      }
      const statusEl = document.getElementById(`status-${data.cameraId}`);
      const nameEl = card.querySelector('.camera-name');
      if (statusEl) {
        statusEl.textContent = data.status;
        statusEl.className = `camera-status status-${data.status}`;
      }
      if (nameEl) nameEl.textContent = window.DashboardUI.cleanCameraName(data.name, data.cameraId);
      if (data.status === 'offline') {
        const videoEl = document.getElementById(`video-${data.cameraId}`);
        if (videoEl) videoEl.src = '';
      }
    }
    setTimeout(() => {
      const cards = container.querySelectorAll('.camera-card');
      const hasCards = cards.length > 0;
      const noCamerasMessage = document.getElementById('noCamerasMessage');
      if (noCamerasMessage) noCamerasMessage.style.display = hasCards ? 'none' : 'block';
      container.classList.remove('single-camera', 'two-cameras');
      if (cards.length === 1) container.classList.add('single-camera');
      else if (cards.length === 2) container.classList.add('two-cameras');
      if (localStorage.getItem('dashboardView') === 'full') window.DashboardUI.setupCarousel();
    }, 100);
  };

  window.handleCameraAutoAdded = function (data) {
    console.log('✅ DASHBOARD: Camera auto-added:', data);
  };

  window.handleStreamData = async function (data) {
    const videoElement = document.getElementById(`video-${data.cameraId}`);
    if (!videoElement) return;
    try {
      const url = await window.FrameProcessor.processBinaryFrame(data.frame, data.cameraId);
      if (videoElement.src && videoElement.src.startsWith('blob:')) URL.revokeObjectURL(videoElement.src);
      videoElement.src = url;
      videoElement.onload = () => URL.revokeObjectURL(url);
      videoElement.onerror = (error) => {
        console.error(`Error displaying frame for camera ${data.cameraId}:`, error);
        URL.revokeObjectURL(url);
      };
      const statusEl = document.getElementById(`status-${data.cameraId}`);
      if (statusEl && statusEl.textContent !== 'streaming') {
        statusEl.textContent = 'streaming';
        statusEl.className = 'camera-status status-streaming';
      }
    } catch (error) {
      console.error(`Failed to process stream for camera ${data.cameraId}:`, error);
      const statusEl = document.getElementById(`status-${data.cameraId}`);
      if (statusEl) {
        statusEl.textContent = 'error';
        statusEl.className = 'camera-status status-error';
      }
    }
  };

  window.handleCameraControlSent = function (data) {
    window.DashboardUI.showCameraMessage(data.cameraId, 'Settings applied successfully!', 'success');
    const applyButton = document.querySelector(`#settings-modal-${data.cameraId} .settings-btn-apply`);
    if (applyButton) {
      if (applyButton.dataset.timeoutId) {
        clearTimeout(parseInt(applyButton.dataset.timeoutId));
        delete applyButton.dataset.timeoutId;
      }
      applyButton.disabled = false;
      applyButton.textContent = 'Apply';
    }
    window.closeCameraSettings?.(data.cameraId);
  };

  window.handleCameraControlError = function (data) {
    const saved = localStorage.getItem('cameraSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      if (settings[data.cameraId]) {
        delete settings[data.cameraId];
        localStorage.setItem('cameraSettings', JSON.stringify(settings));
      }
    }
    window.DashboardUI.showCameraMessage(data.cameraId, `Error: ${data.error}`, 'error');
    const applyButton = document.querySelector(`#settings-modal-${data.cameraId} .settings-btn-apply`);
    if (applyButton) {
      if (applyButton.dataset.timeoutId) {
        clearTimeout(parseInt(applyButton.dataset.timeoutId));
        delete applyButton.dataset.timeoutId;
      }
      applyButton.disabled = false;
      applyButton.textContent = 'Apply';
    }
  };
})();

