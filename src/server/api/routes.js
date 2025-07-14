const express = require('express');
const authRoutes = require('./authentication');
const createCameraRouter = require('./cameras');

function createMainApiRouter(io, activeCameras) {
    const router = express.Router();

    // Initialize the camera router which requires io and activeCameras
    const cameraRouter = createCameraRouter(io, activeCameras);

    // Public authentication routes
    router.use('/auth', authRoutes);

    // Protected camera and setup routes
    router.use('/', cameraRouter);

    return router;
}

module.exports = createMainApiRouter;
