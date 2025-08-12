// Application Configuration
// Centralized configuration for the entire app

const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development',
  },

  // Database configuration
  database: {
    filename: process.env.DB_PATH || './database.sqlite',
    options: {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null,
    },
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // Camera configuration
  camera: {
    maxCameras: parseInt(process.env.MAX_CAMERAS) || 10,
    streamTimeout: parseInt(process.env.STREAM_TIMEOUT) || 30000,
    qrCodeExpiry: parseInt(process.env.QR_CODE_EXPIRY) || 1800000, // 30 minutes
  },

  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },

  // Static file serving
  static: {
    path: process.env.STATIC_PATH || './frontend',
    options: {
      maxAge: process.env.STATIC_MAX_AGE || '1d',
    },
  },
};

module.exports = config;

