# 🚀 Developer Guide

Welcome to your newly organized camera application! This guide will help you navigate and work with the clean, professional structure.

## 🎯 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or start production server
npm start
```

## 📁 What Changed?

### ✅ Before vs After

| **Before (Messy)** | **After (Organized)** |
|-------------------|---------------------|
| `public/index.html` | `src/client/pages/login.html` |
| `public/css/navbar.css` | `src/client/styles/navigation.css` |
| `public/js/auth-client.js` | `src/client/scripts/authentication.js` |
| `server/server.js` | `src/server/app.js` |
| No shared utilities | `src/shared/utils.js` |
| No centralized config | `src/config/app-config.js` |

### 🎨 New CSS System

Instead of multiple CSS imports, now you just need:
```html
<link rel="stylesheet" href="/styles/main.css">
```

The `main.css` automatically imports all other stylesheets:
- `navigation.css` - Navbar and mobile menu
- `settings-modal.css` - Settings popup
- `camera-components.css` - Camera cards
- `themes.css` - Dark/light mode

## 🛠️ Development Workflow

### 🎨 Frontend Development

**Adding new styles:**
```bash
# Edit existing styles
src/client/styles/navigation.css      # Navbar changes
src/client/styles/camera-components.css  # Camera UI changes
src/client/styles/settings-modal.css     # Settings popup

# Or create new style file
src/client/styles/my-new-feature.css

# Then add import to main.css
@import './my-new-feature.css';
```

**Adding new JavaScript functionality:**
```bash
# Edit existing scripts
src/client/scripts/camera-dashboard.js    # Dashboard features
src/client/scripts/authentication.js     # Login/register
src/client/scripts/settings-manager.js   # Settings popup

# Or create new script
src/client/scripts/my-new-feature.js

# Then include in HTML
<script src="/scripts/my-new-feature.js" defer></script>
```

**Adding new pages:**
```bash
# Create new HTML page
src/client/pages/my-new-page.html

# Add route in server
app.get('/my-page', (req, res) => 
  res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'my-new-page.html'))
);
```

### ⚙️ Backend Development

**Adding new API endpoints:**
```bash
# Edit existing API files
src/server/api/authentication.js  # Auth endpoints
src/server/api/cameras.js         # Camera endpoints

# Or create new API file
src/server/api/my-new-api.js

# Then register in routes.js
const myNewApi = require('./my-new-api.js');
router.use('/my-api', myNewApi);
```

**Database changes:**
```bash
# Edit database connection and queries
src/server/database/connection.js
```

**WebSocket/Real-time features:**
```bash
# Edit WebSocket handlers
src/server/websockets/camera-events.js    # Camera real-time
src/server/websockets/socket-manager.js   # Socket setup
```

### 🔧 Shared Code

**Adding utility functions:**
```javascript
// Add to src/shared/utils.js
function myNewUtility() {
    // Your code here
}

// Export it
module.exports = {
    // ... existing exports
    myNewUtility
};

// Use in client-side JavaScript
Utils.myNewUtility();

// Use in server-side JavaScript
const { myNewUtility } = require('../shared/utils.js');
```

**Configuration changes:**
```javascript
// Edit src/config/app-config.js
const config = {
    // Add new config options
    myFeature: {
        enabled: process.env.MY_FEATURE_ENABLED || true,
        apiKey: process.env.MY_API_KEY
    }
};
```

## 🎯 Common Tasks

### 🎨 Styling Tasks

**Change navbar appearance:**
```bash
📝 Edit: src/client/styles/navigation.css
```

**Modify camera cards:**
```bash
📝 Edit: src/client/styles/camera-components.css
```

**Update settings modal:**
```bash
📝 Edit: src/client/styles/settings-modal.css
```

**Add dark mode support to new components:**
```bash
📝 Edit: src/client/styles/themes.css
# Add your dark mode styles in the .dark-mode section
```

### 🔧 Functionality Tasks

**Add new dashboard features:**
```bash
📝 Edit: src/client/scripts/camera-dashboard.js
```

**Modify login/register:**
```bash
📝 Edit: src/client/scripts/authentication.js
```

**Update mobile menu:**
```bash
📝 Edit: src/client/scripts/mobile-navigation.js
```

**Add settings options:**
```bash
📝 Edit: src/client/scripts/settings-manager.js
```

### ⚙️ Server Tasks

**Add new API endpoint:**
```bash
📝 Edit: src/server/api/routes.js
# Or create new file in src/server/api/
```

**Modify database:**
```bash
📝 Edit: src/server/database/connection.js
```

**Add real-time features:**
```bash
📝 Edit: src/server/websockets/camera-events.js
```

## 🚀 Deployment

### Development
```bash
npm run dev
# Server runs on http://localhost:3000
```

### Production
```bash
npm start
# Or
node src/server/app.js
```

### Environment Variables
```bash
# Create .env file in project root
PORT=3000
NODE_ENV=production
JWT_SECRET=your-secret-key
DB_PATH=./database.sqlite
```

## 🔍 Debugging

### Client-side Issues
1. Open browser DevTools (F12)
2. Check Console tab for JavaScript errors
3. Check Network tab for failed requests
4. Check Sources tab to debug JavaScript

### Server-side Issues
1. Check terminal/console output
2. Look for error messages in server logs
3. Use `console.log()` for debugging
4. Check database file exists and has correct permissions

### Common Issues

**CSS not loading:**
- Check file path in HTML: `/styles/main.css`
- Verify file exists: `src/client/styles/main.css`
- Check server static file serving

**JavaScript not working:**
- Check file path in HTML: `/scripts/filename.js`
- Verify file exists: `src/client/scripts/filename.js`
- Check browser console for errors

**API not responding:**
- Check server is running
- Verify API endpoint exists in `src/server/api/`
- Check network requests in browser DevTools

## 📚 File Reference

### 🎨 Frontend Files
```
src/client/pages/
├── login.html              # Login/register page
├── dashboard.html           # Main camera dashboard  
└── camera-setup.html        # Camera setup page

src/client/styles/
├── main.css                 # 🎯 Main stylesheet (imports all)
├── navigation.css           # Navbar and mobile menu
├── settings-modal.css       # Settings popup
├── camera-components.css    # Camera cards and controls
└── themes.css              # Dark/light mode

src/client/scripts/
├── authentication.js        # Login/register logic
├── camera-dashboard.js      # Dashboard functionality
├── camera-setup.js         # Setup page logic
├── mobile-navigation.js     # Mobile menu toggle
└── settings-manager.js     # Settings modal

src/client/assets/
└── icons/                  # App icons and images
```

### ⚙️ Backend Files
```
src/server/
├── app.js                  # 🎯 Main server file
├── api/
│   ├── routes.js           # Main route definitions
│   ├── authentication.js   # Auth endpoints
│   └── cameras.js          # Camera endpoints
├── database/
│   └── connection.js       # Database setup
└── websockets/
    ├── socket-manager.js   # Socket.io setup
    └── camera-events.js    # Camera WebSocket handlers
```

### 🔧 Shared Files
```
src/shared/
└── utils.js               # Common utility functions

src/config/
└── app-config.js          # App configuration
```

## 💡 Pro Tips

1. **Always edit files in `src/` folder** - not the old `public/` or `server/` folders
2. **Use the main.css** - it automatically imports all stylesheets
3. **Check app-config.js** - for environment variables and settings
4. **Use shared utils.js** - for common functions instead of duplicating code
5. **Follow naming conventions** - keep file names descriptive and consistent
6. **Test on mobile** - your app is mobile-first now!

## 🎉 Benefits

✅ **Easy to find anything** - logical folder structure  
✅ **Scalable** - easy to add new features  
✅ **Professional** - industry-standard organization  
✅ **Maintainable** - clear separation of concerns  
✅ **Team-friendly** - new developers can understand quickly  

Happy coding! 🚀