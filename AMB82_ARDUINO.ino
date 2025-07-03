/* #undef DEFAULT
#include "VideoStream.h"
#include "QRCodeScanner.h"
#include "WiFi.h"
#include "StreamIO.h"
#include "AudioStream.h"
#include "AudioEncoder.h"
#include "RTSP.h"
#include <WiFiClient.h>
#include <HttpClient.h>
#include <ArduinoJson.h>

#define CHANNEL 0   // Channel for RTSP streaming
#define CHANNELQR 2 // Channel for QR code scanning
#define MAX_WIFI_ATTEMPTS 30
#define QR_SCAN_INTERVAL 500

// RTSP/Video/Audio settings (keep these global)
VideoSetting configV(800, 600, 30, VIDEO_H264, 0); 

// Audio config: Default (0) usually means standard settings like 16kHz, mono, 16-bit
AudioSetting configA(0); 
Audio audio;
AAC aac;
RTSP rtsp;
StreamIO audioStreamer(1, 1); // Streamer for raw audio to AAC encoder
StreamIO avMixStreamer(2, 1); // RTSP AV mixer: 2 inputs (video, audio), 1 output (RTSP)

// QR Code Scanner related objects
QRCodeScanner* Scanner = nullptr; 
String lastProcessedQR = "";
unsigned long lastScanTime = 0;
bool wifiConnected = false;
bool rtspStarted = false; 
bool cameraRegistered = false; // Flag to ensure we register with server only once per stream start

// --- Camera Setup Variables (from QR code) ---
String sessionId = "";
String wifiSSID = "";
String wifiPassword = "";
String serverUrl = "";
String cameraName = "";
String cameraId = "";

// --- Generate unique camera ID ---
void generateCameraId() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    String macAddr = "";
    for (int i = 0; i < 6; i++) {
        if (mac[i] < 16) macAddr += "0";
        macAddr += String(mac[i], HEX);
    }
    macAddr.toUpperCase();
    cameraId = "AMB82_" + macAddr;
    Serial.println("Generated Camera ID: " + cameraId);
}

// --- Parse JSON QR Code (from web app) ---
bool parseSetupQR(const String& qrString, String& sessionId_out, String& ssid_out, 
                  String& password_out, String& serverUrl_out, String& cameraName_out) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, qrString);
    
    if (error) {
        Serial.println("Failed to parse QR JSON: " + String(error.c_str()));
        return false;
    }
    
    // Check if all required fields are present
    if (!doc.containsKey("sessionId") || !doc.containsKey("wifiSSID") || 
        !doc.containsKey("wifiPassword") || !doc.containsKey("serverUrl") || 
        !doc.containsKey("cameraName")) {
        Serial.println("Missing required fields in QR JSON");
        return false;
    }
    
    sessionId_out = doc["sessionId"].as<String>();
    ssid_out = doc["wifiSSID"].as<String>();
    password_out = doc["wifiPassword"].as<String>();
    serverUrl_out = doc["serverUrl"].as<String>();
    cameraName_out = doc["cameraName"].as<String>();
    
    Serial.println("Parsed QR Code:");
    Serial.println("Session ID: " + sessionId_out);
    Serial.println("WiFi SSID: " + ssid_out);
    Serial.println("Server URL: " + serverUrl_out);
    Serial.println("Camera Name: " + cameraName_out);
    
    return true;
}

bool connectToWiFiOptimized(const String& ssid_in, const String& password_in) {
    Serial.println("Connecting to: " + ssid_in);
    WiFi.disconnect();
    delay(100);
    char ssidBuffer[ssid_in.length() + 1];
    char passBuffer[password_in.length() + 1];
    ssid_in.toCharArray(ssidBuffer, sizeof(ssidBuffer));
    password_in.toCharArray(passBuffer, sizeof(passBuffer));
    if (password_in.length() > 0) {
        WiFi.begin(ssidBuffer, passBuffer);
    } else {
        WiFi.begin(ssidBuffer);
    }
    unsigned long startTime = millis();
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < MAX_WIFI_ATTEMPTS) {
        delay(250);
        if (attempts % 4 == 0) Serial.print(".");
        attempts++;
        if (millis() - startTime > 15000) break;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✓ WiFi Connected!");
        Serial.print("IP: "); Serial.print(WiFi.localIP());
        Serial.print(" | Signal: "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");
        return true;
    } else {
        Serial.println("\n✗ Connection failed");
        return false;
    }
}

// *** HTTP POST Function to Register Camera with Web App Server ***
void registerCameraWithServer() {
    if (WiFi.status() != WL_CONNECTED || rtspStarted == false || cameraRegistered) {
        return;
    }
    
    Serial.println("Registering camera with web application server...");
    
    WiFiClient client;
    HttpClient http(client);
    
    // Extract server host and port from serverUrl
    String host = "";
    int port = 80;
    
    if (serverUrl.startsWith("http://")) {
        String urlWithoutProtocol = serverUrl.substring(7); // Remove "http://"
        int colonPos = urlWithoutProtocol.indexOf(':');
        int slashPos = urlWithoutProtocol.indexOf('/');
        
        if (colonPos != -1) {
            host = urlWithoutProtocol.substring(0, colonPos);
            if (slashPos != -1) {
                port = urlWithoutProtocol.substring(colonPos + 1, slashPos).toInt();
            } else {
                port = urlWithoutProtocol.substring(colonPos + 1).toInt();
            }
        } else {
            if (slashPos != -1) {
                host = urlWithoutProtocol.substring(0, slashPos);
            } else {
                host = urlWithoutProtocol;
            }
            port = 80; // Default HTTP port
        }
    } else {
        Serial.println("Invalid server URL format");
        return;
    }
    
    Serial.println("Connecting to: " + host + ":" + String(port));
    
    // Create RTSP URL
    IPAddress ip = WiFi.localIP();
    String deviceIP = String(ip[0]) + "." + String(ip[1]) + "." + String(ip[2]) + "." + String(ip[3]);
    String rtspURL = "rtsp://" + deviceIP + ":554/stream";
    
    // Create JSON payload for registration
    JsonDocument doc;
    doc["sessionId"] = sessionId;
    doc["cameraId"] = cameraId;
    doc["rtspUrl"] = rtspURL;
    
    String jsonPayload;
    serializeJson(doc, jsonPayload);
    
    Serial.println("Registration payload: " + jsonPayload);
    
    // Make HTTP POST request
    http.beginRequest();
    int err = http.post(host.c_str(), port, "/api/camera/register");
    
    if (err == 0) {
        Serial.println("Connected to server, sending headers...");
        
        http.sendHeader("Content-Type", "application/json");
        http.sendHeader("Content-Length", jsonPayload.length());
        http.endRequest();
        
        // Send the JSON payload
        http.print(jsonPayload);
        
        // Read the response
        int statusCode = http.responseStatusCode();
        String response = "";
        
        // Read response body manually
        while (http.available()) {
            response += (char)http.read();
        }
        
        Serial.println("HTTP Response Code: " + String(statusCode));
        Serial.println("Response: " + response);
        
        if (statusCode == 200) {
            Serial.println("✅ Camera registered successfully with web application!");
            Serial.println("🎥 Camera is now available in the user's dashboard");
            Serial.println("📱 Users can now view the live stream at: " + rtspURL);
            cameraRegistered = true;
            
            // Indicate successful registration with LED blinks
            for (int i = 0; i < 5; i++) {
                digitalWrite(LED_BUILTIN, HIGH);
                delay(200);
                digitalWrite(LED_BUILTIN, LOW);
                delay(200);
            }
        } else {
            Serial.println("❌ Camera registration failed with HTTP " + String(statusCode));
            Serial.println("Response: " + response);
        }
    } else {
        Serial.println("❌ Failed to connect to server: " + String(err));
    }
    
    http.stop();
}

// --- Process QR Code (modified for JSON format) ---
void processQRCode(const String& qrData) {
    if (qrData == lastProcessedQR) return;
    lastProcessedQR = qrData;
    Serial.println("New QR detected: " + qrData);
    
    String parsedSessionId, parsedSsid, parsedPassword, parsedServerUrl, parsedCameraName;
    
    if (parseSetupQR(qrData, parsedSessionId, parsedSsid, parsedPassword, parsedServerUrl, parsedCameraName)) {
        // Store the parsed values globally
        sessionId = parsedSessionId;
        wifiSSID = parsedSsid;
        wifiPassword = parsedPassword;
        serverUrl = parsedServerUrl;
        cameraName = parsedCameraName;
        
        Serial.println("Valid setup QR code detected!");
        
        if (connectToWiFiOptimized(wifiSSID, wifiPassword)) {
            wifiConnected = true;
            
            // After successful WiFi connection, release the QR scanner
            if (Scanner) {
                Serial.println("Attempting to stop QR Scanner and release resources...");
                Serial.println("Stopping camera channel for QR scanner (CHANNELQR)...");
                Camera.channelEnd(CHANNELQR); 
                delay(200); 

                Serial.println("De-initializing camera video subsystem...");
                Camera.videoDeinit(); 
                delay(5000); // *** Significant delay (5 seconds) for hardware to fully release ***

                Serial.println("Attempting to delete QR Code Scanner object...");
                delete Scanner; 
                Scanner = nullptr; 
                Serial.println("QR Code Scanner object deleted and camera resources released.");
            }
            delay(2000); // Additional delay for system to settle
            Serial.println("System cleanup after QR scan complete. Ready for RTSP.");
        } else {
            lastProcessedQR = ""; 
            delay(2000);
        }
    } else {
        Serial.println("Invalid setup QR format - expected JSON with sessionId, wifiSSID, wifiPassword, serverUrl, cameraName");
        lastProcessedQR = ""; 
    }
}

// --- RTSP Stream Initialization Function (unchanged from original) ---
void startRTSPStream() {
    if (rtspStarted) {
        Serial.println("RTSP stream already started. Skipping initialization.");
        return;
    }

    Serial.println("----- Starting RTSP Stream Setup (VIDEO + AUDIO) -----");

    Serial.println("Configuring Camera Video Channel for RTSP (CHANNEL 0)...");
    configV.setBitrate(200 * 1024); 
    Camera.configVideoChannel(CHANNEL, configV); // Use CHANNEL 0 for RTSP
    Serial.println("Re-initializing Camera video subsystem for RTSP (after config)...");
    Camera.videoInit();
    delay(200); 
    Serial.println("Camera Video Initialized for RTSP.");

    Serial.println("Configuring Audio Peripheral and Encoder...");
    audio.configAudio(configA); audio.begin();
    aac.configAudio(configA); aac.begin();
    Serial.println("Audio Configured.");
    
    Serial.println("Setting up StreamIO for Audio (Raw to AAC Encoder)...");
    audioStreamer.registerInput(audio); audioStreamer.registerOutput(aac);
    if (audioStreamer.begin() != 0) { 
        Serial.println("ERROR: StreamIO audio link (Raw->AAC) start failed. Aborting RTSP."); 
        Camera.channelEnd(CHANNEL);
        Camera.videoDeinit();
        return; 
    }
    Serial.println("StreamIO Audio Link OK.");
    
    Serial.println("Configuring RTSP Server...");
    rtsp.configVideo(configV); 
    rtsp.configAudio(configA, CODEC_AAC); 
    rtsp.begin();
    Serial.println("RTSP Server Initialized.");

    Serial.println("Starting Camera Channel (CHANNEL 0)...");
    Camera.channelBegin(CHANNEL); 
    delay(5000); 

    Serial.println("Setting up StreamIO for Video + Audio Mixing...");
    auto videoStream = Camera.getStream(CHANNEL); 
    
    avMixStreamer.registerInput1(videoStream); 
    avMixStreamer.registerInput2(aac); 
    avMixStreamer.registerOutput(rtsp); 

    if (avMixStreamer.begin() != 0) {
        Serial.println("ERROR: StreamIO AV mix link start failed (Video+Audio). Aborting RTSP.");
        Camera.channelEnd(CHANNEL);
        Camera.videoDeinit();
        audioStreamer.end(); 
        rtsp.end();          
        aac.end();           
        audio.end();         
        return;
    }
    Serial.println("StreamIO AV Mix Link OK (Video+Audio)."); 
    
    delay(1000); 

    Serial.println("------------------------------");
    Serial.println("- Summary of Streaming -");
    Serial.println("------------------------------");
    Camera.printInfo();
    IPAddress ip = WiFi.localIP();
    Serial.println("- RTSP -");
    Serial.print("rtsp://");
    Serial.print(ip);
    Serial.print(":");
    rtsp.printInfo(); 
    Serial.println("- Audio -"); 
    audio.printInfo();           

    rtspStarted = true;
    Serial.println("----- RTSP Stream Setup Complete (VIDEO + AUDIO). -----");
}

// --- Main Setup and Loop ---

void setup() {
    Serial.begin(115200);
    Serial.println("=== AMB82 Camera Web App Integration ===");
    Serial.println("System Booting...");

    // Generate unique camera ID
    generateCameraId();

    // Configure and initialize Camera for CHANNELQR (Channel 2) for QR scanning initially
    Camera.configVideoChannel(CHANNELQR, configV); 
    Camera.videoInit(); 

    Scanner = new QRCodeScanner();
    if (Scanner) {
        Scanner->StartScanning();
        Serial.println("QR Code Scanner Initialized and Started.");
    } else {
        Serial.println("ERROR: Failed to allocate QRCodeScanner! Halting.");
        while(1); 
    }
    
    Serial.println("Please scan the QR code from the web application setup page...");
    Serial.println("Expected format: JSON with sessionId, wifiSSID, wifiPassword, serverUrl, cameraName");
}

void loop() {
    if (!wifiConnected) {
        // --- QR Scanning Loop ---
        if (Scanner) { 
            unsigned long currentTime = millis();
            if (currentTime - lastScanTime >= QR_SCAN_INTERVAL) {
                Scanner->GetResultString();
                
                if (Scanner->ResultString != nullptr && strlen(Scanner->ResultString) > 0) {
                    processQRCode(String(Scanner->ResultString));
                }
                
                lastScanTime = currentTime;
            }
        }
        delay(50); 
        
    } else { // WiFi is connected
        if (!rtspStarted) {
            startRTSPStream();
            // *** Register camera with web application server after stream starts ***
            registerCameraWithServer(); 
        }

        // --- WiFi and RTSP Monitoring Loop ---
        static unsigned long lastCheck = 0;
        if (millis() - lastCheck > 10000) { // Check every 10 seconds
            if (WiFi.status() != WL_CONNECTED) {
                Serial.println("WiFi disconnected! Stopping RTSP and restarting QR scanner...");
                
                // Stop RTSP components in reverse order of setup
                avMixStreamer.end();        
                Camera.channelEnd(CHANNEL); 
                rtsp.end();                 
                audioStreamer.end();
                aac.end();
                audio.end();
                delay(200); 

                Serial.println("De-initializing camera video subsystem before re-starting for QR scan...");
                Camera.videoDeinit(); 
                delay(5000); 

                Camera.configVideoChannel(CHANNELQR, configV); // Re-initialize QR channel (CHANNELQR)
                Camera.videoInit();                          
                delay(1000); 

                rtspStarted = false;        
                wifiConnected = false;      
                lastProcessedQR = "";       
                cameraRegistered = false; // Reset flag so camera is registered again on reconnect

                // Clear stored values
                sessionId = "";
                wifiSSID = "";
                wifiPassword = "";
                serverUrl = "";
                cameraName = "";

                // Re-allocate and restart QR scanner for re-connection
                if (!Scanner) { 
                    Serial.println("Re-allocating QR Code Scanner...");
                    Scanner = new QRCodeScanner();
                    if (Scanner) {
                        Scanner->StartScanning();
                        Serial.println("QR Code WiFi Scanner re-started.");
                    } else {
                        Serial.println("ERROR: Failed to re-allocate QRCodeScanner! Cannot re-scan.");
                    }
                }
            } else {
                Serial.print("WiFi OK - IP: ");
                Serial.println(WiFi.localIP());
                
                // Periodic status update (optional)
                if (cameraRegistered) {
                    Serial.println("Camera Status: Registered and Streaming");
                    IPAddress ip = WiFi.localIP();
                    String ipStr = String(ip[0]) + "." + String(ip[1]) + "." + String(ip[2]) + "." + String(ip[3]);
                    Serial.println("RTSP URL: rtsp://" + ipStr + ":554/stream");
                }
            }
            lastCheck = millis();
        }
        delay(1000); 
    }
}
*/