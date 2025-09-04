/*
 * SPDX-FileCopyrightText: 2022-2023 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include <stdio.h>
#include <sys/param.h>
#include "esp_err.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_vfs_fat.h"
#include "esp_heap_caps.h"
#include "driver/spi_master.h"
#include "driver/sdmmc_host.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "sdkconfig.h"
#include "quirc.h"
#include "quirc_internal.h"
#include "esp_camera.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "nvs_flash.h"
#include "esp_http_client.h"
#include "cJSON.h"
#include "lwip/sockets.h"
#include "lwip/netdb.h"
#include "lwip/sys.h"
#include <errno.h>

static const char *TAG = "example";

// Diagnostic and logging configuration
#define ENABLE_FRAME_DIAGNOSTICS 1
#define ENABLE_WEBSOCKET_DIAGNOSTICS 1
#define ENABLE_BINARY_DATA_INSPECTION 1
#define LOG_FRAME_DETAILS_EVERY_N 10  // Log detailed frame info every N frames
#define MAX_BINARY_INSPECT_BYTES 32   // Max bytes to inspect in binary data logs

// WebSocket configuration
#define WEBSOCKET_USE_MASKING 1  // WebSocket clients MUST mask frames

// Frame validation constants
#define JPEG_SOI_MARKER 0xFFD8  // Start of Image marker
#define JPEG_EOI_MARKER 0xFFD9  // End of Image marker
#define MIN_VALID_JPEG_SIZE 100 // Minimum size for a valid JPEG
#define MAX_VALID_JPEG_SIZE 200000 // Maximum expected JPEG size

// Diagnostic counters
static uint32_t total_frames_captured = 0;
static uint32_t valid_frames_sent = 0;
static uint32_t invalid_frames_detected = 0;
static uint32_t websocket_send_failures = 0;
static uint32_t jpeg_validation_failures = 0;

// Camera image size for QR code detection - optimized for speed
#define IMG_WIDTH 320
#define IMG_HEIGHT 240
#define CAM_FRAME_SIZE FRAMESIZE_QVGA

// Camera configuration for Freenove WROOM board
// Updated with the specific pin configuration provided
#define CAM_PIN_PWDN    -1 //power down is not used
#define CAM_PIN_RESET   -1 //software reset will be performed
#define CAM_PIN_XCLK    15
#define CAM_PIN_SIOD    4
#define CAM_PIN_SIOC    5
#define CAM_PIN_D7      16
#define CAM_PIN_D6      17
#define CAM_PIN_D5      18
#define CAM_PIN_D4      12
#define CAM_PIN_D3      10
#define CAM_PIN_D2      8
#define CAM_PIN_D1      9
#define CAM_PIN_D0      11
#define CAM_PIN_VSYNC   6
#define CAM_PIN_HREF    7
#define CAM_PIN_PCLK    13
#define LED_BUILTIN      2

/*#define CAM_PIN_PWDN  -1 // Power Down pin. Not used on this board.
#define CAM_PIN_RESET -1 // Reset pin. Not used on this board.
#define CAM_PIN_XCLK  15 // Clock pin
#define CAM_PIN_SIOD   4 // I2C SDA pin for camera
#define CAM_PIN_SIOC   5 // I2C SCL pin for camera
#define CAM_PIN_D0   11
#define CAM_PIN_D1     9
#define CAM_PIN_D2     8
#define CAM_PIN_D3    10
#define CAM_PIN_D4    12
#define CAM_PIN_D5    18
#define CAM_PIN_D6    17
#define CAM_PIN_D7    16
#define CAM_PIN_VSYNC  6 // Vertical Sync
#define CAM_PIN_HREF   7 // Horizontal Reference
#define CAM_PIN_PCLK  13 // Pixel Clock
*/

/* #define CAM_PIN_PWDN  -1
#define CAM_PIN_RESET   -1
#define CAM_PIN_XCLK    15
#define CAM_PIN_SIOD     4
#define CAM_PIN_SIOC     5
#define CAM_PIN_D7      11
#define CAM_PIN_D6       9
#define CAM_PIN_D5       8
#define CAM_PIN_D4      10
#define CAM_PIN_D3      12
#define CAM_PIN_D2      18
#define CAM_PIN_D1      17
#define CAM_PIN_D0      16
#define CAM_PIN_VSYNC    6
#define CAM_PIN_HREF     7
#define CAM_PIN_PCLK    13
*/

// Server configuration
#define SERVER_IP "192.168.1.50"
#define SERVER_PORT 3000
#define CAMERA_ID_PREFIX "ESP32S3_"


static void processing_task(void *arg);
static void main_task(void *arg);
static esp_err_t init_camera(void);
static esp_err_t init_camera_for_streaming(void);
static esp_err_t init_wifi(void);
static esp_err_t connect_to_wifi(const char *ssid, const char *password);
static bool parse_wifi_qr_code(const char *qr_data, char *ssid, char *password);
static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data);
static esp_err_t register_camera_with_server(const char *camera_id);
static esp_err_t websocket_connect(const char *host, int port, const char *path);
static void streaming_task(void *arg);
static char* generate_camera_id(void);

// Frame validation and diagnostic functions
static bool validate_jpeg_frame(const uint8_t *data, size_t len);
static void log_frame_diagnostics(const uint8_t *data, size_t len, uint32_t frame_number);
static void log_binary_data_inspection(const uint8_t *data, size_t len, const char *context);
static void log_websocket_transmission_details(size_t data_len, int bytes_sent, const char *status);
static void print_diagnostic_summary(void);
static bool check_jpeg_markers(const uint8_t *data, size_t len);
static void log_camera_sensor_status(void);

// WiFi connection status
static bool wifi_connected = false;
static char connected_ssid[64] = {0};
static bool camera_stopped = false;  // Flag to indicate camera has been stopped

// Streaming variables
static int websocket_fd = -1;
static bool streaming_active = false;
static char camera_id[32] = {0};
static TaskHandle_t main_task_handle = NULL;
static TaskHandle_t processing_task_handle = NULL;

// Frame validation and diagnostic functions implementation

/**
 * Validate JPEG frame integrity
 * Checks for proper JPEG markers and basic structure
 */
static bool validate_jpeg_frame(const uint8_t *data, size_t len)
{
    if (!data || len < MIN_VALID_JPEG_SIZE) {
        ESP_LOGW(TAG, "Frame validation failed: data=%p, len=%d (min=%d)", 
                 data, len, MIN_VALID_JPEG_SIZE);
        jpeg_validation_failures++;
        return false;
    }
    
    if (len > MAX_VALID_JPEG_SIZE) {
        ESP_LOGW(TAG, "Frame validation failed: size %d exceeds maximum %d", 
                 len, MAX_VALID_JPEG_SIZE);
        jpeg_validation_failures++;
        return false;
    }
    
    // Check JPEG markers
    if (!check_jpeg_markers(data, len)) {
        jpeg_validation_failures++;
        return false;
    }
    
    return true;
}

/**
 * Check for proper JPEG start and end markers
 */
static bool check_jpeg_markers(const uint8_t *data, size_t len)
{
    // Check Start of Image (SOI) marker
    if (len < 2 || (data[0] != 0xFF || data[1] != 0xD8)) {
        ESP_LOGW(TAG, "JPEG validation failed: Invalid SOI marker. Expected FF D8, got %02X %02X", 
                 len >= 1 ? data[0] : 0x00, len >= 2 ? data[1] : 0x00);
        return false;
    }
    
    // Check End of Image (EOI) marker
    if (len < 2 || (data[len-2] != 0xFF || data[len-1] != 0xD9)) {
        ESP_LOGW(TAG, "JPEG validation failed: Invalid EOI marker. Expected FF D9, got %02X %02X", 
                 len >= 2 ? data[len-2] : 0x00, len >= 1 ? data[len-1] : 0x00);
        return false;
    }
    
    return true;
}

/**
 * Log detailed frame diagnostics
 */
static void log_frame_diagnostics(const uint8_t *data, size_t len, uint32_t frame_number)
{
    if (!ENABLE_FRAME_DIAGNOSTICS) return;
    
    ESP_LOGI(TAG, "=== FRAME DIAGNOSTICS #%d ===", frame_number);
    ESP_LOGI(TAG, "Frame size: %d bytes", len);
    ESP_LOGI(TAG, "Frame buffer address: %p", data);
    ESP_LOGI(TAG, "Free heap: %d bytes", esp_get_free_heap_size());
    
    if (data && len >= 10) {
        ESP_LOGI(TAG, "First 10 bytes: %02X %02X %02X %02X %02X %02X %02X %02X %02X %02X",
                 data[0], data[1], data[2], data[3], data[4],
                 data[5], data[6], data[7], data[8], data[9]);
        
        ESP_LOGI(TAG, "Last 10 bytes: %02X %02X %02X %02X %02X %02X %02X %02X %02X %02X",
                 data[len-10], data[len-9], data[len-8], data[len-7], data[len-6],
                 data[len-5], data[len-4], data[len-3], data[len-2], data[len-1]);
    }
    
    // Validate JPEG structure
    bool is_valid = validate_jpeg_frame(data, len);
    ESP_LOGI(TAG, "JPEG validation: %s", is_valid ? "PASSED" : "FAILED");
    
    ESP_LOGI(TAG, "=== END FRAME DIAGNOSTICS ===");
}

/**
 * Log binary data inspection for debugging
 */
static void log_binary_data_inspection(const uint8_t *data, size_t len, const char *context)
{
    if (!ENABLE_BINARY_DATA_INSPECTION || !data) return;
    
    size_t inspect_bytes = (len < MAX_BINARY_INSPECT_BYTES) ? len : MAX_BINARY_INSPECT_BYTES;
    
    ESP_LOGI(TAG, "Binary data inspection [%s]: %d bytes total, showing first %d bytes:", 
             context, len, inspect_bytes);
    
    // Print hex dump
    char hex_str[MAX_BINARY_INSPECT_BYTES * 3 + 1] = {0};
    char ascii_str[MAX_BINARY_INSPECT_BYTES + 1] = {0};
    
    for (size_t i = 0; i < inspect_bytes; i++) {
        sprintf(hex_str + (i * 3), "%02X ", data[i]);
        ascii_str[i] = (data[i] >= 32 && data[i] <= 126) ? data[i] : '.';
    }
    
    ESP_LOGI(TAG, "HEX:   %s", hex_str);
    ESP_LOGI(TAG, "ASCII: %s", ascii_str);
}

/**
 * Log WebSocket transmission details
 */
static void log_websocket_transmission_details(size_t data_len, int bytes_sent, const char *status)
{
    if (!ENABLE_WEBSOCKET_DIAGNOSTICS) return;
    
    ESP_LOGI(TAG, "WebSocket TX: %d/%d bytes, status: %s, socket_fd: %d", 
             bytes_sent, data_len, status, websocket_fd);
    
    if (bytes_sent < 0) {
        ESP_LOGW(TAG, "WebSocket send error: errno=%d (%s)", errno, strerror(errno));
        websocket_send_failures++;
    } else if (bytes_sent != data_len) {
        ESP_LOGW(TAG, "Partial WebSocket send: %d/%d bytes", bytes_sent, data_len);
    }
}

/**
 * Log camera sensor status and configuration
 */
static void log_camera_sensor_status(void)
{
    sensor_t *s = esp_camera_sensor_get();
    if (!s) {
        ESP_LOGW(TAG, "Camera sensor status: UNAVAILABLE");
        return;
    }
    
    ESP_LOGI(TAG, "=== CAMERA SENSOR STATUS ===");
    ESP_LOGI(TAG, "Sensor ID: 0x%02X", s->id.PID);
    ESP_LOGI(TAG, "Sensor initialized: %s", s ? "YES" : "NO");
    
    // Get current camera sensor settings
    ESP_LOGI(TAG, "Brightness: %d", s->status.brightness);
    ESP_LOGI(TAG, "Contrast: %d", s->status.contrast);
    ESP_LOGI(TAG, "Saturation: %d", s->status.saturation);
    ESP_LOGI(TAG, "Quality: %d", s->status.quality);
    ESP_LOGI(TAG, "Special effect: %d", s->status.special_effect);
    ESP_LOGI(TAG, "=== END CAMERA STATUS ===");
}

/**
 * Print diagnostic summary
 */
static void print_diagnostic_summary(void)
{
    ESP_LOGI(TAG, "=== DIAGNOSTIC SUMMARY ===");
    ESP_LOGI(TAG, "Total frames captured: %d", total_frames_captured);
    ESP_LOGI(TAG, "Valid frames sent: %d", valid_frames_sent);
    ESP_LOGI(TAG, "Invalid frames detected: %d", invalid_frames_detected);
    ESP_LOGI(TAG, "JPEG validation failures: %d", jpeg_validation_failures);
    ESP_LOGI(TAG, "WebSocket send failures: %d", websocket_send_failures);
    ESP_LOGI(TAG, "Success rate: %.2f%%", 
             total_frames_captured > 0 ? (float)valid_frames_sent / total_frames_captured * 100.0 : 0.0);
    ESP_LOGI(TAG, "Free heap: %d bytes", esp_get_free_heap_size());
    ESP_LOGI(TAG, "=== END DIAGNOSTIC SUMMARY ===");
}

// Application entry point
void app_main(void)
{
    ESP_LOGI(TAG, "Starting ESP32-S3 Camera with comprehensive diagnostics enabled");
    ESP_LOGI(TAG, "Diagnostic features: Frame validation, WebSocket logging, Binary inspection");
    xTaskCreatePinnedToCore(&main_task, "main", 4096, NULL, 5, &main_task_handle, 0);
}

// Initialize camera with error handling
static esp_err_t init_camera(void)
{
    ESP_LOGI(TAG, "Initializing camera...");
    
    // Initialize the camera
    camera_config_t camera_config = {
        .pin_pwdn = CAM_PIN_PWDN,
        .pin_reset = CAM_PIN_RESET,
        .pin_xclk = CAM_PIN_XCLK,
        .pin_sscb_sda = CAM_PIN_SIOD,
        .pin_sscb_scl = CAM_PIN_SIOC,

        .pin_d7 = CAM_PIN_D7,
        .pin_d6 = CAM_PIN_D6,
        .pin_d5 = CAM_PIN_D5,
        .pin_d4 = CAM_PIN_D4,
        .pin_d3 = CAM_PIN_D3,
        .pin_d2 = CAM_PIN_D2,
        .pin_d1 = CAM_PIN_D1,
        .pin_d0 = CAM_PIN_D0,
        .pin_vsync = CAM_PIN_VSYNC,
        .pin_href = CAM_PIN_HREF,
        .pin_pclk = CAM_PIN_PCLK,

        .xclk_freq_hz = 20000000,
        .ledc_channel = LEDC_CHANNEL_0,
        .ledc_timer = LEDC_TIMER_0,
        .pixel_format = PIXFORMAT_GRAYSCALE,  // Changed to grayscale for faster processing
        .frame_size = FRAMESIZE_QVGA,         // Reduced to 320x240 for speed
        .jpeg_quality = 5,                    // Lowest quality for speed
        .fb_count = 1,                        // Single frame buffer
        .grab_mode = CAMERA_GRAB_WHEN_EMPTY,
    };

    esp_err_t err = esp_camera_init(&camera_config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Camera init failed with error 0x%x: %s", err, esp_err_to_name(err));
        
        // Try with different I2C pins if the first attempt fails
        ESP_LOGI(TAG, "Trying alternative I2C pins...");
        camera_config.pin_sccb_sda = 21;  // Alternative SDA pin
        camera_config.pin_sccb_scl = 22;  // Alternative SCL pin
        
        err = esp_camera_init(&camera_config);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Camera init failed with alternative pins, error 0x%x: %s", err, esp_err_to_name(err));
            return err;
        }
        ESP_LOGI(TAG, "Camera initialized with alternative I2C pins");
    } else {
        ESP_LOGI(TAG, "Camera initialized successfully");
    }

    sensor_t *s = esp_camera_sensor_get();
    if (s) {
        s->set_vflip(s, 1);
        ESP_LOGI(TAG, "Camera sensor configured");
        
        // Log detailed sensor information for diagnostics
        log_camera_sensor_status();
    } else {
        ESP_LOGW(TAG, "Could not get camera sensor");
    }

    // Disable the LED to prevent flashing
    ledc_stop(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
    ESP_LOGI(TAG, "LED disabled to prevent flashing");

    // Test frame capture to validate camera initialization
    ESP_LOGI(TAG, "Testing initial frame capture for validation...");
    camera_fb_t *test_fb = esp_camera_fb_get();
    if (test_fb) {
        ESP_LOGI(TAG, "Test frame capture successful: %d bytes", test_fb->len);
        log_frame_diagnostics(test_fb->buf, test_fb->len, 0);
        esp_camera_fb_return(test_fb);
    } else {
        ESP_LOGW(TAG, "Test frame capture failed - camera may not be properly initialized");
    }

    return ESP_OK;
}

// Initialize camera for streaming (higher quality)
static esp_err_t init_camera_for_streaming(void)
{
    ESP_LOGI(TAG, "Initializing camera for streaming...");
    
    camera_config_t camera_config = {
        .pin_pwdn = CAM_PIN_PWDN,
        .pin_reset = CAM_PIN_RESET,
        .pin_xclk = CAM_PIN_XCLK,
        .pin_sscb_sda = CAM_PIN_SIOD,
        .pin_sscb_scl = CAM_PIN_SIOC,

        .pin_d7 = CAM_PIN_D7,
        .pin_d6 = CAM_PIN_D6,
        .pin_d5 = CAM_PIN_D5,
        .pin_d4 = CAM_PIN_D4,
        .pin_d3 = CAM_PIN_D3,
        .pin_d2 = CAM_PIN_D2,
        .pin_d1 = CAM_PIN_D1,
        .pin_d0 = CAM_PIN_D0,
        .pin_vsync = CAM_PIN_VSYNC,
        .pin_href = CAM_PIN_HREF,
        .pin_pclk = CAM_PIN_PCLK,

        .xclk_freq_hz = 20000000,
        .ledc_channel = LEDC_CHANNEL_0,
        .ledc_timer = LEDC_TIMER_0,
        .pixel_format = PIXFORMAT_JPEG,       // JPEG for streaming
        .frame_size = FRAMESIZE_XGA,          // SVGA (800 x 600) for faster transmission
        .jpeg_quality = 6,                   // Lower quality for faster transmission
        .fb_count = 2,                        // Double buffer for smooth streaming
        .grab_mode = CAMERA_GRAB_WHEN_EMPTY,
    };

    esp_err_t err = esp_camera_init(&camera_config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Camera init failed with error 0x%x: %s", err, esp_err_to_name(err));
        return err;
    }

    sensor_t *s = esp_camera_sensor_get();
    if (s) {
        s->set_vflip(s, 1);
        ESP_LOGI(TAG, "Camera sensor configured for streaming");
        
        // Log detailed streaming camera configuration
        log_camera_sensor_status();
    }

    // Test streaming frame capture with validation
    ESP_LOGI(TAG, "Testing streaming frame capture with JPEG validation...");
    camera_fb_t *test_fb = esp_camera_fb_get();
    if (test_fb) {
        ESP_LOGI(TAG, "Streaming test frame: %d bytes, format: %s", 
                 test_fb->len, test_fb->format == PIXFORMAT_JPEG ? "JPEG" : "OTHER");
        
        bool is_valid = validate_jpeg_frame(test_fb->buf, test_fb->len);
        ESP_LOGI(TAG, "Streaming frame validation: %s", is_valid ? "PASSED" : "FAILED");
        
        if (ENABLE_FRAME_DIAGNOSTICS) {
            log_frame_diagnostics(test_fb->buf, test_fb->len, 0);
        }
        
        esp_camera_fb_return(test_fb);
    } else {
        ESP_LOGE(TAG, "Streaming test frame capture failed!");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Camera initialized for streaming successfully with validation");
    return ESP_OK;
}

// Initialize WiFi
static esp_err_t init_wifi(void)
{
    ESP_LOGI(TAG, "Initializing WiFi...");
    
    // Initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Initialize TCP/IP stack
    ESP_ERROR_CHECK(esp_netif_init());
    
    // Create default event loop
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    
    // Create default netif instance
    esp_netif_create_default_wifi_sta();

    // Initialize WiFi
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    // Register event handlers
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    // Set WiFi mode to station
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    
    // Start WiFi
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "WiFi initialized successfully");
    return ESP_OK;
}

// WiFi event handler
static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "WiFi station started");
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGI(TAG, "WiFi disconnected, trying to reconnect...");
        wifi_connected = false;
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        wifi_connected = true;
    }
}

// Connect to WiFi network
static esp_err_t connect_to_wifi(const char *ssid, const char *password)
{
    ESP_LOGI(TAG, "Connecting to WiFi: %s", ssid);
    
    wifi_config_t wifi_config = {
        .sta = {
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
            .pmf_cfg = {
                .capable = true,
                .required = false
            },
        },
    };
    
    // Copy SSID and password
    strncpy((char*)wifi_config.sta.ssid, ssid, sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char*)wifi_config.sta.password, password, sizeof(wifi_config.sta.password) - 1);
    
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_connect());
    
    return ESP_OK;
}

// Parse WiFi QR code format: S:SSID;P:Password
static bool parse_wifi_qr_code(const char *qr_data, char *ssid, char *password)
{
    ESP_LOGI(TAG, "Parsing QR code: %s", qr_data);
    
    // Look for S: and P: patterns
    const char *ssid_start = strstr(qr_data, "S:");
    const char *pass_start = strstr(qr_data, "P:");
    
    if (!ssid_start || !pass_start) {
        ESP_LOGW(TAG, "Invalid WiFi QR code format");
        return false;
    }
    
    // Extract SSID (skip "S:")
    ssid_start += 2;
    const char *ssid_end = strchr(ssid_start, ';');
    if (!ssid_end) {
        ESP_LOGW(TAG, "SSID not properly terminated");
        return false;
    }
    
    int ssid_len = ssid_end - ssid_start;
    if (ssid_len >= 64) ssid_len = 63;
    strncpy(ssid, ssid_start, ssid_len);
    ssid[ssid_len] = '\0';
    
    // Extract password (skip "P:")
    pass_start += 2;
    const char *pass_end = strchr(pass_start, ';');
    if (!pass_end) {
        // Password might be at the end without semicolon
        pass_end = pass_start + strlen(pass_start);
    }
    
    int pass_len = pass_end - pass_start;
    if (pass_len >= 64) pass_len = 63;
    strncpy(password, pass_start, pass_len);
    password[pass_len] = '\0';
    
    ESP_LOGI(TAG, "Parsed SSID: %s, Password: %s", ssid, password);
    return true;
}

// Generate unique camera ID
static char* generate_camera_id(void)
{
    uint8_t mac[6];
    esp_wifi_get_mac(WIFI_IF_STA, mac);
    snprintf(camera_id, sizeof(camera_id), "%s%02X%02X%02X", 
             CAMERA_ID_PREFIX, mac[3], mac[4], mac[5]);
    return camera_id;
}

// Register camera with server
static esp_err_t register_camera_with_server(const char *camera_id)
{
    ESP_LOGI(TAG, "Registering camera with server: %s", camera_id);
    
    char url[128];
    snprintf(url, sizeof(url), "http://%s:%d/api/camera/register", SERVER_IP, SERVER_PORT);
    
    // Create JSON payload
    cJSON *json = cJSON_CreateObject();
    cJSON *camera_id_json = cJSON_CreateString(camera_id);
    cJSON_AddItemToObject(json, "cameraId", camera_id_json);
    char *json_string = cJSON_Print(json);
    
    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 5000,
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, json_string, strlen(json_string));
    
    esp_err_t err = esp_http_client_perform(client);
    int status_code = esp_http_client_get_status_code(client);
    
    if (err == ESP_OK && status_code == 200) {
        ESP_LOGI(TAG, "Camera registered successfully");
    } else {
        ESP_LOGE(TAG, "Failed to register camera. Status: %d", status_code);
    }
    
    esp_http_client_cleanup(client);
    free(json_string);
    cJSON_Delete(json);
    
    return err;
}

// Simple WebSocket handshake and connection
static esp_err_t websocket_connect(const char *host, int port, const char *path)
{
    ESP_LOGI(TAG, "Connecting to WebSocket: %s:%d%s", host, port, path);
    
    // Create socket
    websocket_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (websocket_fd < 0) {
        ESP_LOGE(TAG, "Failed to create socket");
        return ESP_FAIL;
    }
    
    // Set socket options for better reliability
    struct timeval timeout;
    timeout.tv_sec = 10;
    timeout.tv_usec = 0;
    setsockopt(websocket_fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(websocket_fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    
    // Enable keep-alive
    int keepalive = 1;
    setsockopt(websocket_fd, SOL_SOCKET, SO_KEEPALIVE, &keepalive, sizeof(keepalive));
    
    // Set TCP_NODELAY to reduce latency
    int nodelay = 1;
    setsockopt(websocket_fd, IPPROTO_TCP, TCP_NODELAY, &nodelay, sizeof(nodelay));
    
    // Resolve hostname
    struct hostent *server = gethostbyname(host);
    if (server == NULL) {
        ESP_LOGE(TAG, "Failed to resolve hostname");
        close(websocket_fd);
        websocket_fd = -1;
        return ESP_FAIL;
    }
    
    // Connect to server
    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port);
    memcpy(&server_addr.sin_addr.s_addr, server->h_addr, server->h_length);
    
    if (connect(websocket_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        ESP_LOGE(TAG, "Failed to connect to server");
        close(websocket_fd);
        websocket_fd = -1;
        return ESP_FAIL;
    }
    
    // Send WebSocket handshake
    char handshake[512];
    snprintf(handshake, sizeof(handshake),
        "GET %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n",
        path, host, port);
    
    if (send(websocket_fd, handshake, strlen(handshake), 0) < 0) {
        ESP_LOGE(TAG, "Failed to send handshake");
        close(websocket_fd);
        websocket_fd = -1;
        return ESP_FAIL;
    }
    
    // Read handshake response
    char response[1024];
    int received = recv(websocket_fd, response, sizeof(response) - 1, 0);
    if (received <= 0) {
        ESP_LOGE(TAG, "Failed to receive handshake response");
        close(websocket_fd);
        websocket_fd = -1;
        return ESP_FAIL;
    }
    
    response[received] = '\0';
    if (strstr(response, "101 Switching Protocols") == NULL) {
        ESP_LOGE(TAG, "WebSocket handshake failed");
        ESP_LOGE(TAG, "Response: %s", response);
        close(websocket_fd);
        websocket_fd = -1;
        return ESP_FAIL;
    }
    
    streaming_active = true;
    ESP_LOGI(TAG, "WebSocket connected successfully");
    return ESP_OK;
}

// Send binary data over WebSocket with comprehensive logging
static int websocket_send_binary(const uint8_t *data, size_t len)
{
    if (websocket_fd < 0 || !streaming_active) {
        ESP_LOGW(TAG, "WebSocket send failed: fd=%d, active=%d", websocket_fd, streaming_active);
        return -1;
    }
    
    // Validate frame before sending
    if (!validate_jpeg_frame(data, len)) {
        ESP_LOGW(TAG, "Frame validation failed, skipping transmission");
        invalid_frames_detected++;
        return -1;
    }
    
    // Log binary data inspection for debugging
    if (ENABLE_BINARY_DATA_INSPECTION) {
        log_binary_data_inspection(data, len, "WebSocket Send");
    }
    
    // Limit frame size to prevent issues
    if (len > 100000) {
        ESP_LOGW(TAG, "Frame too large (%d bytes), skipping", len);
        log_websocket_transmission_details(len, -1, "FRAME_TOO_LARGE");
        return -1;
    }
    
    // Create WebSocket frame header for binary data
    uint8_t header[10];
    int header_len = 0;
    
    header[0] = 0x82; // FIN=1, opcode=2 (binary)
    
    uint32_t mask = 0x12345678;
    
    if (len < 126) {
        header[1] = (WEBSOCKET_USE_MASKING ? 0x80 : 0x00) | len; // MASK bit + payload length
        header_len = 2;
    } else if (len < 65536) {
        header[1] = (WEBSOCKET_USE_MASKING ? 0x80 : 0x00) | 126; // MASK bit + extended payload length
        header[2] = (len >> 8) & 0xFF;
        header[3] = len & 0xFF;
        header_len = 4;
    } else {
        header[1] = (WEBSOCKET_USE_MASKING ? 0x80 : 0x00) | 127; // MASK bit + 64-bit extended payload length
        // For simplicity, we only use the lower 32 bits
        header[2] = 0; header[3] = 0; header[4] = 0; header[5] = 0;
        header[6] = (len >> 24) & 0xFF;
        header[7] = (len >> 16) & 0xFF;
        header[8] = (len >> 8) & 0xFF;
        header[9] = len & 0xFF;
        header_len = 10;
    }
    
    // Add masking key only if masking is enabled
    if (WEBSOCKET_USE_MASKING) {
        header[header_len] = (mask >> 24) & 0xFF;
        header[header_len + 1] = (mask >> 16) & 0xFF;
        header[header_len + 2] = (mask >> 8) & 0xFF;
        header[header_len + 3] = mask & 0xFF;
        header_len += 4;
    }
    
    // Log WebSocket frame header details
    if (ENABLE_WEBSOCKET_DIAGNOSTICS) {
        ESP_LOGI(TAG, "WebSocket frame header: %d bytes, payload: %d bytes", header_len, len);
        log_binary_data_inspection(header, header_len, "WebSocket Header");
    }
    
    // Send header
    int header_sent = send(websocket_fd, header, header_len, 0);
    if (header_sent < 0) {
        ESP_LOGE(TAG, "Failed to send WebSocket header: errno=%d (%s)", errno, strerror(errno));
        log_websocket_transmission_details(header_len, header_sent, "HEADER_SEND_FAILED");
        streaming_active = false;
        return -1;
    } else if (header_sent != header_len) {
        ESP_LOGW(TAG, "Partial WebSocket header send: %d/%d bytes", header_sent, header_len);
        log_websocket_transmission_details(header_len, header_sent, "HEADER_PARTIAL_SEND");
    } else if (ENABLE_WEBSOCKET_DIAGNOSTICS) {
        ESP_LOGI(TAG, "WebSocket header sent successfully: %d bytes", header_sent);
    }
    
    // Allocate buffer for masked payload
    uint8_t *masked_payload = NULL;
    const uint8_t *send_data = data;
    size_t sent_total = 0;
    
    if (WEBSOCKET_USE_MASKING) {
        // Allocate memory for masked payload
        masked_payload = malloc(len);
        if (!masked_payload) {
            ESP_LOGE(TAG, "Failed to allocate memory for masked payload");
            return -1;
        }
        
        // Mask the entire payload at once
        uint8_t mask_bytes[4] = {(mask >> 24) & 0xFF, (mask >> 16) & 0xFF, (mask >> 8) & 0xFF, mask & 0xFF};
        for (size_t i = 0; i < len; i++) {
            masked_payload[i] = data[i] ^ mask_bytes[i % 4];
        }
        send_data = masked_payload;
        
        // Log masking for debugging
        if (ENABLE_WEBSOCKET_DIAGNOSTICS) {
            ESP_LOGI(TAG, "Payload masking - Original: %02X %02X %02X %02X, Masked: %02X %02X %02X %02X", 
                     data[0], data[1], data[2], data[3],
                     masked_payload[0], masked_payload[1], masked_payload[2], masked_payload[3]);
            ESP_LOGI(TAG, "Mask key: %02X %02X %02X %02X", 
                     mask_bytes[0], mask_bytes[1], mask_bytes[2], mask_bytes[3]);
        }
    }
    
    // Send payload in chunks to handle large frames
    const size_t chunk_size = 4096; // Larger chunks since masking is done
    for (size_t offset = 0; offset < len; ) {
        size_t current_chunk = (len - offset > chunk_size) ? chunk_size : (len - offset);
        
        int sent = send(websocket_fd, send_data + offset, current_chunk, 0);
        if (sent < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                ESP_LOGW(TAG, "WebSocket send would block, retrying chunk at offset %d...", offset);
                log_websocket_transmission_details(current_chunk, sent, "WOULD_BLOCK_RETRY");
                vTaskDelay(pdMS_TO_TICKS(10));
                continue; // Retry this chunk
            } else {
                ESP_LOGE(TAG, "Failed to send WebSocket payload chunk at offset %d, errno: %d (%s)", 
                         offset, errno, strerror(errno));
                log_websocket_transmission_details(current_chunk, sent, "CHUNK_SEND_FAILED");
                streaming_active = false;
                if (masked_payload) free(masked_payload);
                return -1;
            }
        } else if (sent < current_chunk) {
            if (ENABLE_WEBSOCKET_DIAGNOSTICS) {
                ESP_LOGW(TAG, "Partial chunk send at offset %d: %d/%d bytes", offset, sent, current_chunk);
                log_websocket_transmission_details(current_chunk, sent, "PARTIAL_CHUNK_SEND");
            }
            // Handle partial send by moving only the sent bytes
            offset += sent;
            sent_total += sent;
        } else {
            // Full chunk sent successfully
            if (ENABLE_WEBSOCKET_DIAGNOSTICS && (offset % (chunk_size * 4) == 0)) {
                ESP_LOGI(TAG, "Chunk progress: %d/%d bytes sent", offset + current_chunk, len);
            }
            offset += current_chunk;
            sent_total += sent;
        }
    }
    
    // Clean up masked payload buffer
    if (masked_payload) {
        free(masked_payload);
    }
    
    // Log successful transmission
    if (sent_total == len) {
        log_websocket_transmission_details(len, sent_total, "SUCCESS");
        valid_frames_sent++;
    } else {
        ESP_LOGW(TAG, "WebSocket transmission incomplete: %d/%d bytes", sent_total, len);
        log_websocket_transmission_details(len, sent_total, "INCOMPLETE");
    }
    
    return sent_total;
}

// Streaming task
static void streaming_task(void *arg)
{
    ESP_LOGI(TAG, "Starting streaming task...");
    
    // Generate camera ID
    char *cam_id = generate_camera_id();
    ESP_LOGI(TAG, "Camera ID: %s", cam_id);
    
    // Register with server
    esp_err_t reg_err = register_camera_with_server(cam_id);
    if (reg_err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to register camera, continuing anyway...");
    }
    
    // Wait a moment for registration to complete
    vTaskDelay(pdMS_TO_TICKS(50));
    
    // Setup WebSocket connection
    char ws_path[128];
    snprintf(ws_path, sizeof(ws_path), "/%s", cam_id);
    
    // Connect to WebSocket
    if (websocket_connect(SERVER_IP, SERVER_PORT, ws_path) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to connect to WebSocket server");
        vTaskDelete(NULL);
        return;
    }
    
    ESP_LOGI(TAG, "WebSocket connected, starting video stream...");
    
    // Streaming loop with comprehensive diagnostics
    int frame_count = 0;
    int failed_captures = 0;
    uint32_t last_diagnostic_time = esp_timer_get_time() / 1000;
    
    ESP_LOGI(TAG, "Starting streaming loop with diagnostics enabled");
    
    while (streaming_active) {
        uint32_t frame_start_time = esp_timer_get_time() / 1000;
        
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            failed_captures++;
            ESP_LOGW(TAG, "Camera capture failed (%d consecutive failures)", failed_captures);
            
            // If too many consecutive failures, try to reinitialize camera
            if (failed_captures > 10) {
                ESP_LOGE(TAG, "Too many capture failures, attempting camera reset");
                print_diagnostic_summary();
                
                esp_camera_deinit();
                vTaskDelay(pdMS_TO_TICKS(1000));
                if (init_camera_for_streaming() != ESP_OK) {
                    ESP_LOGE(TAG, "Camera reset failed, stopping stream");
                    streaming_active = false;
                    break;
                }
                failed_captures = 0;
                ESP_LOGI(TAG, "Camera reset successful");
                log_camera_sensor_status();
            }
            
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }
        
        failed_captures = 0; // Reset failure counter on successful capture
        total_frames_captured++;
        
        // Log detailed frame diagnostics periodically
        if (ENABLE_FRAME_DIAGNOSTICS && (frame_count % LOG_FRAME_DETAILS_EVERY_N == 0)) {
            log_frame_diagnostics(fb->buf, fb->len, frame_count);
        }
        
        // Send frame via WebSocket as binary data
        uint32_t send_start_time = esp_timer_get_time() / 1000;
        int sent = websocket_send_binary(fb->buf, fb->len);
        uint32_t send_end_time = esp_timer_get_time() / 1000;
        
        if (sent < 0) {
            ESP_LOGW(TAG, "Failed to send frame #%d, attempting to reconnect...", frame_count);
            esp_camera_fb_return(fb);
            
            // Print diagnostic summary before reconnection attempt
            print_diagnostic_summary();
            
            // Try to reconnect WebSocket
            if (websocket_fd >= 0) {
                close(websocket_fd);
                websocket_fd = -1;
            }
            
            //vTaskDelay(pdMS_TO_TICKS(5)); // Wait before reconnecting
            
            if (websocket_connect(SERVER_IP, SERVER_PORT, ws_path) == ESP_OK) {
                ESP_LOGI(TAG, "WebSocket reconnected successfully");
                continue; // Try again with next frame
            } else {
                ESP_LOGE(TAG, "Failed to reconnect WebSocket, stopping stream");
                streaming_active = false;
                break;
            }
        } else {
            frame_count++;
            uint32_t frame_total_time = send_end_time - frame_start_time;
            uint32_t send_time = send_end_time - send_start_time;
            
            // Enhanced frame logging with timing information
            if (frame_count % LOG_FRAME_DETAILS_EVERY_N == 0) {
                ESP_LOGI(TAG, "Frame #%d: %d bytes sent, capture+send: %dms, send: %dms, heap: %d", 
                         frame_count, sent, frame_total_time, send_time, esp_get_free_heap_size());
                print_diagnostic_summary();
            }
        }
        
        esp_camera_fb_return(fb);
        
        // Periodic diagnostic summary (every 30 seconds)
        uint32_t current_time = esp_timer_get_time() / 1000;
        if (current_time - last_diagnostic_time > 30000) {
            ESP_LOGI(TAG, "=== PERIODIC DIAGNOSTIC REPORT ===");
            print_diagnostic_summary();
            log_camera_sensor_status();
            last_diagnostic_time = current_time;
        }
        
        // Control frame rate (approximately 10 FPS)
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    
    // Cleanup and final diagnostics
    ESP_LOGI(TAG, "Streaming task ending - generating final diagnostic report");
    print_diagnostic_summary();
    
    if (websocket_fd >= 0) {
        close(websocket_fd);
        websocket_fd = -1;
        ESP_LOGI(TAG, "WebSocket connection closed");
    }
    
    ESP_LOGI(TAG, "Streaming task ended with comprehensive diagnostics");
    vTaskDelete(NULL);
}

static void flashOnceParsed() {
    gpio_set_direction(LED_BUILTIN, GPIO_MODE_OUTPUT); // Set LED pin as output
    gpio_set_level(LED_BUILTIN, 0); // Turn LED on (assuming active low)
    vTaskDelay(20 / portTICK_PERIOD_MS); // Delay for 1 second
    gpio_set_level(LED_BUILTIN, 1); // Turn LED off
    vTaskDelay(20 / portTICK_PERIOD_MS); // Delay for 1 second
}

// Main task: initializes the camera and starts the processing task
static void main_task(void *arg)
{
    ESP_LOGI(TAG, "Starting QR Code Demo for Freenove WROOM Board");

    // Initialize WiFi
    esp_err_t wifi_err = init_wifi();
    if (wifi_err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize WiFi");
    }

    // Initialize the camera with error handling
    esp_err_t err = init_camera();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize camera. Please check:");
        ESP_LOGE(TAG, "1. Camera module connections");
        ESP_LOGE(TAG, "2. Power supply (3.3V)");
        ESP_LOGE(TAG, "3. I2C pull-up resistors");
        ESP_LOGE(TAG, "4. Pin assignments");
        ESP_LOGE(TAG, "Continuing without camera...");
        
        // Continue without camera for testing
        while (1) {
            ESP_LOGI(TAG, "Camera not available - demo cannot run");
            vTaskDelay(pdMS_TO_TICKS(5000));
        }
    }

    // The queue for passing camera frames to the processing task
    QueueHandle_t processing_queue = xQueueCreate(1, sizeof(camera_fb_t *));
    assert(processing_queue);

    // The processing task will be running QR code detection and recognition
    xTaskCreatePinnedToCore(&processing_task, "processing", 35000, processing_queue, 1, &processing_task_handle, 0);
    ESP_LOGI(TAG, "Processing task started");

    // Main loop: capture frames and send them to the processing task
    while (1) {
        // Check if camera has been stopped
        if (camera_stopped) {
            ESP_LOGI(TAG, "Main task stopping - camera deinitialized");
            break;
        }
        
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            ESP_LOGE(TAG, "Camera capture failed");
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        // Send the frame to the processing task
        if (xQueueSend(processing_queue, &fb, pdMS_TO_TICKS(100)) != pdTRUE) {
            ESP_LOGW(TAG, "Queue full, dropping frame");
            esp_camera_fb_return(fb);
        }

        vTaskDelay(pdMS_TO_TICKS(20)); // 50 FPS for faster scanning
    }
    
    // Clean exit
    ESP_LOGI(TAG, "Main task completed successfully");
    vTaskDelete(NULL);
}

// Processing task: receives camera frames and performs QR code detection
static void processing_task(void *arg)
{
    QueueHandle_t processing_queue = (QueueHandle_t)arg;
    struct quirc *qr = quirc_new();
    assert(qr);

    if (quirc_resize(qr, IMG_WIDTH, IMG_HEIGHT) < 0) {
        ESP_LOGE(TAG, "Failed to allocate QR code buffer");
        vTaskDelete(NULL);
    }

    ESP_LOGI(TAG, "QR code detection initialized");

    while (1) {
        camera_fb_t *fb;
        if (xQueueReceive(processing_queue, &fb, portMAX_DELAY) != pdTRUE) {
            continue;
        }

        uint8_t *image = quirc_begin(qr, NULL, NULL);
        // Since we're using PIXFORMAT_GRAYSCALE, we can directly copy the data
        memcpy(image, fb->buf, fb->len);
        quirc_end(qr);

        int count = quirc_count(qr);
        ESP_LOGI(TAG, "QR count: %d   Heap: %d  Stack free: %d  time: %d ms", 
                 count, esp_get_free_heap_size(), uxTaskGetStackHighWaterMark(NULL), 
                 esp_timer_get_time() / 1000);

        for (int i = 0; i < count; i++) {
            struct quirc_code code = {};
            struct quirc_data qr_data = {};
            quirc_extract(qr, i, &code);
            quirc_decode_error_t err = quirc_decode(&code, &qr_data);

            if (err) {
                ESP_LOGW(TAG, "Decoding failed: %s", quirc_strerror(err));
            } else {
                ESP_LOGI(TAG, "Decoded in %d ms", esp_timer_get_time() / 1000);
                ESP_LOGI(TAG, "QR code: %d bytes: '%s'", qr_data.payload_len, qr_data.payload);
                
                // Check if this is a WiFi QR code
                char ssid[64] = {0};
                char password[64] = {0};
                
                if (parse_wifi_qr_code((const char*)qr_data.payload, ssid, password)) {
                    flashOnceParsed();
                    ESP_LOGI(TAG, "WiFi QR code detected! Attempting to connect...");
                    
                    // Connect to WiFi
                    esp_err_t connect_err = connect_to_wifi(ssid, password);
                    if (connect_err == ESP_OK) {
                        ESP_LOGI(TAG, "WiFi connection initiated for: %s", ssid);
                        
                        // Wait for connection (up to 10 seconds)
                        int attempts = 0;
                        while (!wifi_connected && attempts < 100) {
                            vTaskDelay(pdMS_TO_TICKS(100));
                            attempts++;
                        }
                        
                        if (wifi_connected) {
                            strncpy(connected_ssid, ssid, sizeof(connected_ssid) - 1);
                            ESP_LOGI(TAG, "Connected to %s WiFi!", connected_ssid);
                            ESP_LOGI(TAG, "QR code scanning stopped.");
                            
                            // Set flag to stop main task first
                            camera_stopped = true;
                            ESP_LOGI(TAG, "QR code scanning completed, transitioning to streaming...");
                            
                            // Wait for main task to stop cleanly
                            vTaskDelay(pdMS_TO_TICKS(50));
                            
                            // Stop camera
                            esp_camera_deinit();
                            ESP_LOGI(TAG, "Camera deinitialized");
                            
                            // Wait a moment before reinitializing
                            vTaskDelay(pdMS_TO_TICKS(50));
                            
                            // Initialize camera for streaming
                            esp_err_t stream_cam_err = init_camera_for_streaming();
                            if (stream_cam_err == ESP_OK) {
                                ESP_LOGI(TAG, "Starting video streaming...");
                                xTaskCreatePinnedToCore(&streaming_task, "streaming", 16384, NULL, 5, NULL, 1);
                            } else {
                                ESP_LOGE(TAG, "Failed to initialize camera for streaming");
                            }
                            
                            // Exit processing task cleanly
                            vTaskDelete(NULL);
                            return;
                        } else {
                            ESP_LOGE(TAG, "Failed to connect to WiFi after 10 seconds");
                        }
                    } else {
                        ESP_LOGE(TAG, "Failed to initiate WiFi connection");
                    }
                }
            }
        }

        esp_camera_fb_return(fb);
    }
}

// Color conversion utilities (removed unused function)