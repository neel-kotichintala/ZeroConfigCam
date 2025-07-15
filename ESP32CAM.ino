#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoWebsockets.h>
#include <ESP32QRCodeReader.h>
#include <ArduinoJson.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// Pin definitions
#define CAMERA_MODEL_AI_THINKER
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// WiFi & Server Configuration - IMPORTANT: CHANGE THIS TO YOUR SERVER'S IP ADDRESS
#define WEBSOCKET_SERVER_HOST "192.168.1.232"
#define WEBSOCKET_SERVER_PORT 3000

// Globals
using namespace websockets;
WebsocketsClient client;
ESP32QRCodeReader reader{CAMERA_MODEL_AI_THINKER};

void onMessageCallback(WebsocketsMessage message) {
  Serial.print("Got Message: ");
  Serial.println(message.data());
}

esp_err_t init_camera_for_streaming() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 12;
  config.fb_count = 2;
  
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Streaming camera init FAIL: 0x%x\n", err);
    return err;
  }
  return ESP_OK;
}

void onQrCodeTask(void *pvParameters) {
  struct QRCodeData qrCodeData;
  bool qrCodeScanned = false;
  String ssid, pass, cameraId;

  Serial.println("Task started. Point camera at a QR code.");

  // Generate unique camera ID based on MAC address
  String macAddress = WiFi.macAddress();
  macAddress.replace(":", "");
  cameraId = "CAM_" + macAddress;
  Serial.println("Camera ID: " + cameraId);

  // 1. Loop until a valid QR code is scanned
  while (!qrCodeScanned) {
    if (reader.receiveQrCode(&qrCodeData, 100)) {
      if (qrCodeData.valid) {
        String payload = String((const char *)qrCodeData.payload);
        Serial.printf("QR Code Payload: %s\n", payload.c_str());

        // Simplified parsing logic for S:<SSID>;P:<Password>
        int ssid_start = payload.indexOf("S:") + 2;
        int ssid_end = payload.indexOf(";", ssid_start);
        ssid = payload.substring(ssid_start, ssid_end);

        int pass_start = payload.indexOf("P:") + 2;
        // Handle case where password is at the end (no semicolon after)
        int pass_end = payload.indexOf(";", pass_start);
        if (pass_end == -1) {
          pass = payload.substring(pass_start);
        } else {
          pass = payload.substring(pass_start, pass_end);
        }

        if (ssid.length() > 0 && pass.length() > 0) {
          qrCodeScanned = true;
          Serial.println("QR code parsed successfully.");
          Serial.println("SSID: " + ssid);
          Serial.println("Password: [HIDDEN]");
        } else {
          Serial.println("QR code format is invalid. Expecting 'S:<SSID>;P:<Password>'");
        }
      }
    }
    vTaskDelay(200 / portTICK_PERIOD_MS);
  }

  // 2. Stop QR reader
  Serial.println("QR Scan successful. Shutting down reader.");
  reader.end();
  esp_camera_deinit();
  vTaskDelay(1000 / portTICK_PERIOD_MS); // Crucial delay

  // 3. Connect to WiFi
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK");

  // 4. Re-initialize camera for streaming
  if (init_camera_for_streaming() != ESP_OK) {
    Serial.println("Failed to init camera for streaming. Restarting...");
    ESP.restart();
  }
  Serial.println("Streaming camera init OK");

  // 4.5. Register camera via HTTP first (more reliable than WebSocket)
  Serial.println("Registering camera via HTTP...");
  HTTPClient http;
  http.begin("http://" + String(WEBSOCKET_SERVER_HOST) + ":" + String(WEBSOCKET_SERVER_PORT) + "/api/camera/register");
  http.addHeader("Content-Type", "application/json");
  
  String payload = "{\"cameraId\":\"" + cameraId + "\"}";
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("HTTP Registration Response: " + response);
  } else {
    Serial.println("HTTP Registration failed: " + String(httpResponseCode));
  }
  http.end();

  // 5. Connect to WebSocket Server
  String host = WEBSOCKET_SERVER_HOST;
  uint16_t port = WEBSOCKET_SERVER_PORT;
  String path = "/" + cameraId;

  Serial.println("Connecting to WS: " + host + ":" + String(port) + path);
  client.onMessage(onMessageCallback);
  
  // Configure WebSocket for better Node.js compatibility
  client.setInsecure(); // For development - remove in production
  
  for (int i = 1; i <= 50; i++) {
    if (!client.connect(host, port, path)) { 
        Serial.println("WS connect failed! Trying Again..."); 
    }
    else {
        Serial.println("WS OK");
        break;
    }
    delay(200);
  }

  /*if (!client.connect(host, port, path)) {
    Serial.print("Failed to connect 50 times! Restarting...");
    ESP.restart();
  } */

  // 6. Streaming Loop
  while (true) {
    if (client.available()) {
      client.poll();
      camera_fb_t *fb = esp_camera_fb_get();
      if (!fb) { Serial.println("Camera capture failed"); continue; }
      client.sendBinary((const char *)fb->buf, fb->len);
      esp_camera_fb_return(fb);
    } else { Serial.println("WebSocket disconnected. Restarting..."); ESP.restart(); }
    vTaskDelay(20 / portTICK_PERIOD_MS); // FPS Control
  }
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  Serial.begin(115200);
  Serial.setDebugOutput(true);

  reader.setup();
  Serial.println("Setup QRCode Reader");

  reader.beginOnCore(1);
  Serial.println("Begin on Core 1");

  xTaskCreate(onQrCodeTask, "onQrCodeTask", 8192, NULL, 5, NULL);
}

void loop() {
  vTaskDelay(1000 / portTICK_PERIOD_MS);
}
