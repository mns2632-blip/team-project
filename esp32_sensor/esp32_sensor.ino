/*
 * ESP32 센서 코드 + WiFi 웹서버 추가 버전
 * ─────────────────────────────────────────
 * [DHT22]
 *   VCC  → ESP32 3.3V
 *   DATA → ESP32 GPIO4
 *   GND  → ESP32 GND
 *
 * [MQ-2 / MQ-135]
 *   VCC  → ESP32 5V
 *   AO   → ESP32 GPIO34
 *   GND  → ESP32 GND
 *
 * 필요 라이브러리:
 *   - DHT sensor library
 *   - ArduinoJson
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ─────────────────────────────
// WiFi 정보
// ─────────────────────────────

#include "secrets.h"
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASS;


// ─────────────────────────────
// 핀 설정
// ─────────────────────────────
#define DHT_PIN     4
#define DHT_TYPE    DHT22
#define GAS_PIN     34

// ─────────────────────────────
// 전송 주기
// ─────────────────────────────
#define SEND_INTERVAL 2000

DHT dht(DHT_PIN, DHT_TYPE);

WebServer server(80);

unsigned long lastSendTime = 0;

// 센서값 저장 변수
float temperature = 0.0;
float humidity = 0.0;
int gasValue = 0;

// ─────────────────────────────
// 웹 접속 시 JSON 반환
// ─────────────────────────────
void handleRoot() {

  StaticJsonDocument<200> doc;

  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["gas"] = gasValue;

  String jsonString;

  serializeJson(doc, jsonString);

  server.send(200, "application/json", jsonString);
}

// ─────────────────────────────
// 초기 설정
// ─────────────────────────────
void setup() {

  Serial.begin(115200);

  dht.begin();

  delay(2000);

  Serial.println("[OK] ESP32 센서 초기화 완료");

  // ── WiFi 연결 ──
  WiFi.begin(ssid, password);

  Serial.print("WiFi Connecting");

  while (WiFi.status() != WL_CONNECTED) {

    delay(500);

    Serial.print(".");
  }

  Serial.println();
  Serial.println("[OK] WiFi Connected");

  // ── ESP32 IP 출력 ──
  Serial.print("ESP32 IP : ");

  Serial.println(WiFi.localIP());

  // ── 웹서버 시작 ──
  server.on("/", handleRoot);

  server.begin();

  Serial.println("[OK] Web Server Started");
}

// ─────────────────────────────
// 반복 실행
// ─────────────────────────────
void loop() {

  server.handleClient();

  unsigned long now = millis();

  if (now - lastSendTime >= SEND_INTERVAL) {

    lastSendTime = now;

    // ── DHT22 읽기 ──
    temperature = dht.readTemperature();

    humidity = dht.readHumidity();

    // ── 가스센서 읽기 ──
    int gasRaw = analogRead(GAS_PIN);

    gasValue = map(gasRaw, 0, 4095, 0, 1000);

    // ── DHT22 오류 체크 ──
    if (isnan(temperature) || isnan(humidity)) {

      Serial.println("{\"error\":\"DHT22 read failed\"}");

      return;
    }

    // ── JSON 생성 ──
    StaticJsonDocument<128> doc;

    doc["temperature"] = round(temperature * 10) / 10.0;

    doc["humidity"] = round(humidity * 10) / 10.0;

    doc["gas"] = gasValue;

    // ── 시리얼 출력 ──
    serializeJson(doc, Serial);

    Serial.println();
  }
}