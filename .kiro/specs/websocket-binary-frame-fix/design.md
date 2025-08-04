# Design Document

## Overview

The WebSocket binary frame handling issue stems from a data format mismatch between the ESP32S3CAM's binary JPEG transmission and the frontend's expectation of how binary data arrives through Socket.IO. The ESP32 sends raw binary JPEG data via WebSocket, but when this data passes through the Node.js server's Socket.IO layer, it may be encoded differently (likely as a Buffer or ArrayBuffer) before reaching the frontend.

The solution involves updating the frontend's binary data processing to properly handle the Socket.IO data format and convert it to displayable images, while also improving error handling and performance for multiple camera streams.

## Architecture

### Current Data Flow
1. ESP32S3CAM → WebSocket (binary JPEG) → Node.js Server → Socket.IO → Frontend
2. Frontend receives `data.frame` but fails to properly convert it to displayable image

### Proposed Data Flow
1. ESP32S3CAM → WebSocket (binary JPEG) → Node.js Server → Socket.IO (with proper binary handling) → Frontend
2. Frontend receives binary data → Detects data format → Converts to Blob → Creates object URL → Displays image

## Components and Interfaces

### Frontend Binary Frame Handler
**Location:** `src/client/scripts/camera-dashboard.js`

**Responsibilities:**
- Detect incoming binary data format (Buffer, ArrayBuffer, Uint8Array)
- Convert binary data to proper Blob format for image display
- Handle multiple data format scenarios
- Manage memory cleanup for object URLs
- Provide error handling and logging

**Interface:**
```javascript
function processBinaryFrame(frameData, cameraId) {
    // Returns: Promise<string> (object URL) or throws error
}

function handleStreamData(data) {
    // Processes incoming Socket.IO stream data
    // Updates video element with new frame
}
```

### Server Binary Data Handling
**Location:** `src/server/websockets/camera-events.js`

**Responsibilities:**
- Ensure binary data is properly forwarded through Socket.IO
- Maintain data integrity during transmission
- Handle ESP32 WebSocket compatibility

**Interface:**
```javascript
ws.on('message', (message) => {
    // Forward binary message with proper encoding
    io.to(String(userId)).emit('stream', { 
        cameraId, 
        frame: message,
        frameType: 'binary' // Add metadata
    });
});
```

### Error Handling Component
**Location:** `src/client/scripts/camera-dashboard.js`

**Responsibilities:**
- Log binary processing errors
- Display user-friendly error messages
- Maintain camera status accuracy
- Provide debugging information

## Data Models

### Binary Frame Data Structure
```javascript
{
    cameraId: string,
    frame: Buffer | ArrayBuffer | Uint8Array,
    frameType: 'binary',
    timestamp: number (optional),
    frameSize: number (optional)
}
```

### Camera Status Model
```javascript
{
    cameraId: string,
    status: 'streaming' | 'online' | 'offline' | 'error',
    lastFrameTime: timestamp,
    frameCount: number,
    errorCount: number
}
```

## Error Handling

### Binary Data Processing Errors
- **Invalid Data Format:** Log error, maintain previous frame, show warning
- **Memory Allocation Errors:** Clean up existing URLs, reduce frame rate temporarily
- **Blob Creation Failures:** Retry with different data conversion approach
- **Network Interruptions:** Show connection status, attempt reconnection

### Performance Degradation
- **High Memory Usage:** Implement aggressive URL cleanup
- **Frame Processing Lag:** Skip frames if processing queue builds up
- **Multiple Camera Load:** Implement frame rate limiting per camera

## Testing Strategy

### Unit Tests
- Binary data format detection and conversion
- Blob creation from various data types
- Memory cleanup verification
- Error handling scenarios

### Integration Tests
- End-to-end ESP32 to frontend streaming
- Multiple camera simultaneous streaming
- Network interruption recovery
- Memory usage over extended periods

### Performance Tests
- Frame processing latency measurement
- Memory usage monitoring
- CPU usage with multiple streams
- Network bandwidth utilization

### Browser Compatibility Tests
- Chrome, Firefox, Safari binary data handling
- Mobile browser performance
- WebSocket binary data support verification

## Implementation Approach

### Phase 1: Binary Data Detection and Conversion
1. Implement data format detection utility
2. Create conversion functions for Buffer/ArrayBuffer to Blob
3. Update stream event handler with new processing logic

### Phase 2: Error Handling and Logging
1. Add comprehensive error catching around binary processing
2. Implement user-friendly error display
3. Add debugging logs for troubleshooting

### Phase 3: Performance Optimization
1. Implement memory management for object URLs
2. Add frame rate limiting for performance
3. Optimize for multiple camera scenarios

### Phase 4: Testing and Validation
1. Test with actual ESP32S3CAM device
2. Validate multiple camera performance
3. Verify error handling scenarios
4. Cross-browser compatibility testing