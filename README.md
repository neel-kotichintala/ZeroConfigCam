# RTSP Camera Streaming Web Application

A complete web application for streaming RTSP video from AMB82 cameras with QR code setup, user authentication, and multi-camera support.

## Features

- 🎥 **Live RTSP Streaming**: Real-time video streaming from multiple AMB82 cameras
- 📱 **QR Code Setup**: Easy camera configuration using QR codes
- 👤 **User Authentication**: Secure login/registration system
- 🏠 **Multi-Camera Support**: Manage multiple cameras per user account
- 📺 **Web Dashboard**: View all your cameras in one place
- 🔧 **Zero-Config**: Cameras automatically connect and register

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │◄──►│   Node.js API   │◄──►│  SQLite Database│
│   (Dashboard)   │    │   (Express)     │    │   (Users/Cams) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲
         │ Socket.IO              │ HTTP POST
         ▼                       │
┌─────────────────┐              │
│   RTSP Stream   │              │
│   (FFmpeg)      │              │
└─────────────────┘              │
                                 ▼
                    ┌─────────────────┐
                    │   AMB82 Camera  │
                    │   (Arduino)     │
                    └─────────────────┘
```

## Prerequisites

- Node.js 18+ and npm
- FFmpeg (for RTSP processing)
- AMB82 development board
- Arduino IDE with Realtek libraries

## Installation

### 1. Clone and Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install FFmpeg (macOS)
brew install ffmpeg

# For Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# For Windows
# Download from https://ffmpeg.org/download.html
```

### 2. Configure Environment

```bash
# Copy and edit environment variables
cp .env .env.local

# Edit .env.local with your settings:
# - Change JWT_SECRET to a secure random string
# - Update SERVER_URL to your actual IP address
# - Modify ports if needed
```

### 3. Start the Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## Arduino Setup

### 1. Install Required Libraries

In Arduino IDE, install these libraries:
- ArduinoJson
- HttpClient (if not included)
- Realtek AMB82 libraries

### 2. Upload Modified Code

1. Open `AMB82_WebApp_Integration.ino` in Arduino IDE
2. Select your AMB82 board
3. Upload the code

### 3. Monitor Serial Output

Open Serial Monitor at 115200 baud to see connection status.

## Usage

### 1. Create Account

1. Open `http://localhost:3000` in your browser
2. Click "Sign up" and create an account
3. Login with your credentials

### 2. Add Camera

1. Click "Add Camera" in the dashboard
2. Enter WiFi credentials and camera name
3. Click "Generate QR Code"

### 3. Configure AMB82

1. Power on your AMB82 camera
2. Wait for it to enter scanning mode (LED should blink)
3. Point the camera at the QR code on your screen
4. Wait for automatic WiFi connection and registration

### 4. View Streams

1. Camera will appear in your dashboard
2. Click "Start Stream" to begin viewing
3. Manage multiple cameras from the same interface

## API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login

### Camera Management
- `GET /api/cameras` - Get user's cameras
- `DELETE /api/cameras/:id` - Delete camera

### Setup & Registration
- `POST /api/setup/create` - Generate QR code for setup
- `POST /api/camera/register` - Register camera (called by AMB82)

## QR Code Format

The system generates JSON QR codes with this structure:

```json
{
  "sessionId": "unique-session-id",
  "wifiSSID": "YourWiFiNetwork",
  "wifiPassword": "YourWiFiPassword",
  "serverUrl": "http://192.168.1.100:3000",
  "cameraName": "Living Room Camera"
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `JWT_SECRET` | JWT signing secret | `change_this` |
| `DB_PATH` | SQLite database path | `./database.sqlite` |
| `SERVER_URL` | Public server URL | `http://localhost:3000` |

### Camera Settings

In the Arduino code, you can modify:
- Video resolution: `VideoSetting configV(800, 600, 30, VIDEO_H264, 0)`
- RTSP port: Default is `554`
- Scan interval: `QR_SCAN_INTERVAL`

## Troubleshooting

### Common Issues

1. **Camera not connecting to WiFi**
   - Verify QR code contains correct WiFi credentials
   - Check WiFi signal strength
   - Ensure WiFi supports 2.4GHz (AMB82 requirement)

2. **Camera not appearing in dashboard**
   - Check server URL in QR code matches your actual IP
   - Verify firewall settings allow port 3000
   - Monitor Arduino Serial output for errors

3. **Stream not loading**
   - Ensure FFmpeg is installed and accessible
   - Check if RTSP port 554 is available
   - Verify camera is on same network as server

4. **QR code expired**
   - QR codes expire after 30 minutes for security
   - Generate a new QR code from the setup page

### Debug Mode

Enable detailed logging by setting `NODE_ENV=development` in your `.env` file.

Monitor Arduino Serial output at 115200 baud for camera status.

## Network Requirements

- All devices must be on the same local network
- Ports required:
  - `3000` (web server)
  - `554` (RTSP from cameras)
  - `8000-8100` (streaming ports)

## Security Notes

- Change default JWT secret in production
- Use HTTPS in production environments
- QR codes contain WiFi passwords (use securely)
- Session tokens expire after 24 hours

## Development

### Project Structure

```
├── server.js           # Main server file
├── package.json        # Dependencies
├── .env               # Environment config
├── public/            # Frontend files
│   ├── index.html     # Login/register page
│   ├── dashboard.html # Camera dashboard
│   └── setup.html     # QR code generation
└── AMB82_WebApp_Integration.ino  # Arduino code
```

### Adding Features

The system is modular and can be extended with:
- Push notifications
- Cloud storage integration
- Mobile app support
- Advanced video analytics

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Monitor Serial output from AMB82
3. Check server logs in terminal
4. Verify network connectivity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request
