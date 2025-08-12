Zero Configuration Camera Service

Folder structure

```
backend/
  app.js
  config/app-config.js
  database/connection.js
  routes/
    index.js
    authentication.js
    cameras.js
  services/
    socketManager.js
    cameraEvents.js

frontend/
  pages/
    login.html
    camera-setup.html
    dashboard.html
  scripts/
    authentication.js
    camera-setup.js
    page-transitions.js
    mobile-navigation.js
    settings-manager.js
    dashboard/
      index.js
      ui.js
      handlers.js
      settingsModal.js
    streaming/
      imageBinaryConverter.js
      frameProcessor.js
  styles/ (served from src/client/styles for now)

src/
  shared/ (served at /shared)
```

Run

```
npm run dev
```