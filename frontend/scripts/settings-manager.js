class SettingsManager {
  constructor() { this.init(); }
  init() { this.bindEvents(); this.loadCurrentTheme(); }
  bindEvents() {
    const settingsBtn = document.getElementById('settings-button');
    const mobileSettingsBtn = document.getElementById('mobile-settings-button');
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.openSettings());
    if (mobileSettingsBtn) mobileSettingsBtn.addEventListener('click', () => this.openSettings());
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close');
    if (settingsOverlay) settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) this.closeSettings(); });
    if (settingsClose) settingsClose.addEventListener('click', () => this.closeSettings());
    const settingsTabs = document.querySelectorAll('.settings-tab');
    settingsTabs.forEach((tab) => { tab.addEventListener('click', () => this.switchTab(tab.dataset.tab)); });
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach((option) => { option.addEventListener('click', () => this.selectTheme(option.dataset.theme)); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isSettingsOpen()) this.closeSettings(); });
  }
  openSettings() { const overlay = document.getElementById('settings-overlay'); if (overlay) { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; } }
  closeSettings() { const overlay = document.getElementById('settings-overlay'); if (overlay) { overlay.classList.remove('open'); document.body.style.overflow = ''; } }
  isSettingsOpen() { const overlay = document.getElementById('settings-overlay'); return overlay && overlay.classList.contains('open'); }
  switchTab(tabName) { const tabs = document.querySelectorAll('.settings-tab'); tabs.forEach((tab) => { tab.classList.toggle('active', tab.dataset.tab === tabName); }); const contents = document.querySelectorAll('.tab-content'); contents.forEach((content) => { content.classList.toggle('active', content.id === `${tabName}-tab`); }); }
  selectTheme(theme) { const options = document.querySelectorAll('.theme-option'); options.forEach((option) => { option.classList.toggle('active', option.dataset.theme === theme); }); this.applyTheme(theme); }
  applyTheme(theme) { const body = document.body; if (theme === 'dark') { body.classList.add('dark-mode'); localStorage.setItem('theme', 'dark'); } else { body.classList.remove('dark-mode'); localStorage.removeItem('theme'); } }
  loadCurrentTheme() { const currentTheme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'; if (currentTheme === 'dark') document.body.classList.add('dark-mode'); const themeOption = document.querySelector(`[data-theme="${currentTheme}"]`); if (themeOption) themeOption.classList.add('active'); }
}
document.addEventListener('DOMContentLoaded', () => { new SettingsManager(); });

