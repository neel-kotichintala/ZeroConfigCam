(function () {
  let cameraSettings = {};

  function loadCameraSettings() {
    try {
      const saved = localStorage.getItem('cameraSettings');
      if (saved) cameraSettings = JSON.parse(saved);
    } catch (e) {
      cameraSettings = {};
    }
  }

  function saveCameraSettings() {
    try {
      localStorage.setItem('cameraSettings', JSON.stringify(cameraSettings));
    } catch (e) {}
  }

  function getCurrentCameraSettings(cameraId) {
    const defaults = { resolution: 'VGA', quality: 15 };
    return cameraSettings[cameraId] || defaults;
  }

  function addCameraSettingsStyles() {
    const styleId = 'camera-settings-dark-mode-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '';
    document.head.appendChild(style);
  }

  function handleWindowResize() {
    document.querySelectorAll('.camera-settings-modal.show').forEach((modal) => {
      const cameraId = modal.id.replace('settings-modal-', '');
      const cameraCard = document.getElementById(`camera-${cameraId}`);
      if (cameraCard) {
        const cardRect = cameraCard.getBoundingClientRect();
        const shouldBeCentered = cardRect.width < 400 || cardRect.height < 300;
        const isCentered = modal.classList.contains('centered-modal');
        if (shouldBeCentered && !isCentered) {
          closeCameraSettings(cameraId);
          setTimeout(() => openCameraSettings(cameraId), 100);
        } else if (!shouldBeCentered && isCentered) {
          closeCameraSettings(cameraId);
          setTimeout(() => openCameraSettings(cameraId), 100);
        }
      }
    });
  }

  function openCameraSettings(cameraId) {
    const modal = document.getElementById(`settings-modal-${cameraId}`);
    const resolutionSelect = document.getElementById(`resolution-${cameraId}`);
    const qualitySlider = document.getElementById(`quality-${cameraId}`);
    const qualityValue = document.getElementById(`quality-value-${cameraId}`);
    const cameraCard = document.getElementById(`camera-${cameraId}`);
    if (!modal || !resolutionSelect || !qualitySlider || !qualityValue || !cameraCard) return;
    const currentSettings = getCurrentCameraSettings(cameraId);
    resolutionSelect.value = currentSettings.resolution;
    qualitySlider.value = String(currentSettings.quality);
    qualityValue.textContent = String(currentSettings.quality);
    const percent = (currentSettings.quality - qualitySlider.min) / (qualitySlider.max - qualitySlider.min);
    qualityValue.style.left = `${percent * 100}%`;
    const cardRect = cameraCard.getBoundingClientRect();
    if (cardRect.width < 400 || cardRect.height < 300) {
      modal.classList.add('centered-modal');
      Object.assign(modal.style, { position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', zIndex: '1000', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' });
      const settingsPanel = modal.querySelector('.settings-panel');
      if (settingsPanel) Object.assign(settingsPanel.style, { position: 'relative', maxWidth: '400px', width: '90%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)' });
    } else {
      modal.classList.remove('centered-modal');
      Object.assign(modal.style, { position: '', top: '', left: '', width: '', height: '', zIndex: '', display: '', alignItems: '', justifyContent: '', backgroundColor: '' });
      const settingsPanel = modal.querySelector('.settings-panel');
      if (settingsPanel) Object.assign(settingsPanel.style, { position: '', maxWidth: '', width: '', maxHeight: '', overflow: '', boxShadow: '' });
    }
    modal.classList.add('show');
  }

  function closeCameraSettings(cameraId) {
    const modal = document.getElementById(`settings-modal-${cameraId}`);
    if (!modal) return;
    modal.classList.remove('show');
    if (modal.classList.contains('centered-modal')) {
      modal.classList.remove('centered-modal');
      Object.assign(modal.style, { position: '', top: '', left: '', width: '', height: '', zIndex: '', display: '', alignItems: '', justifyContent: '', backgroundColor: '' });
      const settingsPanel = modal.querySelector('.settings-panel');
      if (settingsPanel) Object.assign(settingsPanel.style, { position: '', maxWidth: '', width: '', maxHeight: '', overflow: '', boxShadow: '' });
    }
  }

  function applyCameraSettings(cameraId) {
    const resolutionSelect = document.getElementById(`resolution-${cameraId}`);
    const qualitySlider = document.getElementById(`quality-${cameraId}`);
    const applyButton = document.querySelector(`#settings-modal-${cameraId} .settings-btn-apply`);
    if (!resolutionSelect || !qualitySlider || !applyButton) return;
    const resolution = resolutionSelect.value;
    const quality = parseInt(qualitySlider.value);
    cameraSettings[cameraId] = { resolution, quality };
    saveCameraSettings();
    applyButton.disabled = true;
    applyButton.textContent = 'Applying...';
    const timeoutId = setTimeout(() => {
      applyButton.disabled = false;
      applyButton.textContent = 'Apply';
      closeCameraSettings(cameraId);
    }, 5000);
    applyButton.dataset.timeoutId = timeoutId;
    applyButton.dataset.cameraId = cameraId;
    const socketToUse = window.socketManager || window.socket;
    if (socketToUse) {
      socketToUse.emit('camera-control', { cameraId, command: 'settings', settings: { resolution, quality } });
      setTimeout(() => {
        clearTimeout(timeoutId);
        applyButton.disabled = false;
        applyButton.textContent = 'Apply';
        closeCameraSettings(cameraId);
      }, 1000);
    } else {
      console.error('No socket connection available');
      applyButton.disabled = false;
      applyButton.textContent = 'Apply';
      window.DashboardUI?.showCameraMessage(cameraId, 'No connection available. Please refresh the page.', 'error');
      clearTimeout(timeoutId);
    }
  }

  function setupCameraModalListeners(cameraId) {
    const modal = document.getElementById(`settings-modal-${cameraId}`);
    const qualitySlider = document.getElementById(`quality-${cameraId}`);
    const qualityValue = document.getElementById(`quality-value-${cameraId}`);
    if (!modal || !qualitySlider || !qualityValue) return;
    qualitySlider.addEventListener('input', function () {
      qualityValue.textContent = this.value;
      const percent = (this.value - this.min) / (this.max - this.min);
      qualityValue.style.left = `${percent * 100}%`;
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeCameraSettings(cameraId); });
    modal.addEventListener('click', (e) => {
      const settingsPanel = modal.querySelector('.settings-panel');
      if (settingsPanel && e.target === settingsPanel && modal.classList.contains('centered-modal')) {
        const rect = settingsPanel.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        if (clickX >= rect.width - 40 && clickX <= rect.width && clickY >= 0 && clickY <= 40) closeCameraSettings(cameraId);
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.camera-settings-modal.show').forEach((modal) => {
        const cameraId = modal.id.replace('settings-modal-', '');
        closeCameraSettings(cameraId);
      });
    }
  });

  window.DashboardSettings = {
    loadCameraSettings,
    saveCameraSettings,
    getCurrentCameraSettings,
    addCameraSettingsStyles,
    handleWindowResize,
    openCameraSettings,
    closeCameraSettings,
    applyCameraSettings,
    setupCameraModalListeners,
  };

  // Expose used functions globally for inline handlers
  window.openCameraSettings = openCameraSettings;
  window.closeCameraSettings = closeCameraSettings;
  window.applyCameraSettings = applyCameraSettings;
})();

