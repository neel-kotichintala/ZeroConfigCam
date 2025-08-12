(function () {
  let socketManager = null;
  let socket = null;

  async function initializeSocket() {
    try {
      if (window.SocketManager) {
        if (!window.eventEmitter && window.EventEmitter) {
          window.eventEmitter = new EventEmitter();
        }
        socketManager = new SocketManager(window.eventEmitter);
        socketManager.enableLegacyMode?.();
        await socketManager.connect();
        socket = socketManager.socket;
        window.socketManager = socketManager;
        window.socket = socket;
        console.log('Socket connection initialized via SocketManager');
        // Legacy bindings if manager didn't wire them
        socket?.on('cameraStatusUpdate', window.handleCameraStatusUpdate);
        socket?.on('cameraAutoAdded', window.handleCameraAutoAdded);
        socket?.on('stream', window.handleStreamData);
        socket?.on('camera-control-sent', window.handleCameraControlSent);
        socket?.on('camera-control-error', window.handleCameraControlError);
      } else {
        throw new Error('SocketManager not available');
      }
    } catch (e) {
      console.log('Falling back to direct socket connection...');
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');
      socket = io({ auth: { token } });
      window.socket = socket;
      socket.on('connect', () => console.log('Connected to server via direct WebSocket connection.'));
      socket.on('connect_error', (err) => {
        console.error('Connection Failed:', err.message);
        if (err.message.includes('Authentication error')) logout();
      });
      socket.on('cameraStatusUpdate', window.handleCameraStatusUpdate);
      socket.on('cameraAutoAdded', window.handleCameraAutoAdded);
      socket.on('stream', window.handleStreamData);
      socket.on('camera-control-sent', window.handleCameraControlSent);
      socket.on('camera-control-error', window.handleCameraControlError);
    }
  }

  function logout() {
    if (socketManager) socketManager.cleanup?.();
    else if (socket) socket.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
  }

  window.logout = logout;

  window.addEventListener('beforeunload', () => {
    if (socketManager) socketManager.cleanup?.();
    else if (socket) socket.disconnect();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/';
      return;
    }
    const username = localStorage.getItem('username') || 'User';
    const usernameSpan = document.getElementById('username');
    if (usernameSpan) usernameSpan.textContent = username;
    const mobileUsernameSpan = document.getElementById('mobile-username');
    if (mobileUsernameSpan) mobileUsernameSpan.textContent = username;
    window.DashboardSettings.loadCameraSettings();
    const savedView = localStorage.getItem('dashboardView') || 'grid';
    window.DashboardUI.bindViewButtons();
    window.DashboardUI.bindDeleteModalEvents();
    window.DashboardUI.setView(savedView);
    window.DashboardSettings.addCameraSettingsStyles();
    window.addEventListener('resize', window.DashboardSettings.handleWindowResize);
    await initializeSocket();
  });
})();

