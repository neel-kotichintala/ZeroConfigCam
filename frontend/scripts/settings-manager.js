class SettingsManager {
  constructor() { 
    this.initialized = false;
    this.init(); 
  }
  
  init() { 
    // Try to initialize immediately, but also set up a retry mechanism
    if (this.tryInit()) {
      this.initialized = true;
    } else {
      // If elements aren't ready yet, retry after a short delay
      setTimeout(() => {
        if (!this.initialized && this.tryInit()) {
          this.initialized = true;
        }
      }, 100);
      
      // Also retry when DOM is fully loaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          if (!this.initialized && this.tryInit()) {
            this.initialized = true;
          }
        });
      }
    }
  }
  
  tryInit() {
    const settingsBtn = document.getElementById('settings-button');
    const mobileSettingsBtn = document.getElementById('mobile-settings-button');
    const settingsOverlay = document.getElementById('settings-overlay');
    
    // Check if all required elements exist
    if (!settingsBtn && !mobileSettingsBtn && !settingsOverlay) {
      return false;
    }
    
    this.bindEvents();
    this.loadCurrentTheme();
    return true;
  }
  
  bindEvents() {
    const settingsBtn = document.getElementById('settings-button');
    const mobileSettingsBtn = document.getElementById('mobile-settings-button');
    
    if (settingsBtn) {
      // Remove any existing listeners to prevent duplicates
      settingsBtn.removeEventListener('click', this.openSettings);
      settingsBtn.addEventListener('click', () => this.openSettings());
    }
    
    if (mobileSettingsBtn) {
      mobileSettingsBtn.removeEventListener('click', this.openSettings);
      mobileSettingsBtn.addEventListener('click', () => this.openSettings());
    }
    
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close');
    
    if (settingsOverlay) {
      settingsOverlay.removeEventListener('click', this.handleOverlayClick);
      settingsOverlay.addEventListener('click', (e) => this.handleOverlayClick(e));
    }
    
    if (settingsClose) {
      settingsClose.removeEventListener('click', this.closeSettings);
      settingsClose.addEventListener('click', () => this.closeSettings());
    }
    
    const settingsTabs = document.querySelectorAll('.settings-tab');
    settingsTabs.forEach((tab) => { 
      tab.removeEventListener('click', this.handleTabClick);
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab)); 
    });
    
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach((option) => { 
      option.removeEventListener('click', this.handleThemeClick);
      option.addEventListener('click', () => this.selectTheme(option.dataset.theme)); 
    });
    
    // Remove existing keydown listener and add new one
    document.removeEventListener('keydown', this.handleKeydown);
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }
  
  handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      this.closeSettings();
    }
  }
  
  handleKeydown(e) {
    if (e.key === 'Escape' && this.isSettingsOpen()) {
      this.closeSettings();
    }
  }
  
  openSettings() { 
    const overlay = document.getElementById('settings-overlay'); 
    if (overlay) { 
      overlay.classList.add('open'); 
      document.body.style.overflow = 'hidden'; 
    } 
  }
  
  closeSettings() { 
    const overlay = document.getElementById('settings-overlay'); 
    if (overlay) { 
      overlay.classList.remove('open'); 
      document.body.style.overflow = ''; 
    } 
  }
  
  isSettingsOpen() { 
    const overlay = document.getElementById('settings-overlay'); 
    return overlay && overlay.classList.contains('open'); 
  }
  
  switchTab(tabName) { 
    const tabs = document.querySelectorAll('.settings-tab'); 
    tabs.forEach((tab) => { 
      tab.classList.toggle('active', tab.dataset.tab === tabName); 
    }); 
    const contents = document.querySelectorAll('.tab-content'); 
    contents.forEach((content) => { 
      content.classList.toggle('active', content.id === `${tabName}-tab`); 
    }); 
  }
  
  selectTheme(theme) { 
    const options = document.querySelectorAll('.theme-option'); 
    options.forEach((option) => { 
      option.classList.toggle('active', option.dataset.theme === theme); 
    }); 
    this.applyTheme(theme); 
  }
  
  applyTheme(theme) { 
    const body = document.body; 
    if (theme === 'dark') { 
      body.classList.add('dark-mode'); 
      localStorage.setItem('theme', 'dark'); 
    } else { 
      body.classList.remove('dark-mode'); 
      localStorage.removeItem('theme'); 
    } 
  }
  
  loadCurrentTheme() { 
    const currentTheme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'; 
    if (currentTheme === 'dark') document.body.classList.add('dark-mode'); 
    const themeOption = document.querySelector(`[data-theme="${currentTheme}"]`); 
    if (themeOption) themeOption.classList.add('active'); 
  }
}

// Initialize immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
  });
} else {
  new SettingsManager();
}