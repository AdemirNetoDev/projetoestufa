/*
  ============================================================
  EstufaIoT - Monitoramento e Automação de Estufa/Ambiente
  ------------------------------------------------------------
  Disciplina: Fundamentos de IoT
  Placa: ESP32 (DevKit v1 ou similar)

  Sensores:
    - DHT22 (temperatura e umidade) -> GPIO 4
    - LDR   (luminosidade)          -> GPIO 34 (entrada analógica)

  Atuadores:
    - Relé (liga/desliga o ventilador de exaustão) -> GPIO 26
    - LED indicativo (status geral)                 -> GPIO 27
    - Buzzer (alarme de temperatura crítica)         -> GPIO 25

  Protocolo: MQTT (broker público HiveMQ, trocar por
  broker próprio/Mosquitto se preferir)

  Tópicos MQTT:
    estufa/sensores            -> publica JSON com leituras (a cada 5s)
    estufa/atuador/fan/set     -> assina; recebe "ON" ou "OFF"
    estufa/atuador/fan/status  -> publica estado atual do ventilador
    estufa/atuador/led/set     -> assina; recebe "ON" ou "OFF"
    estufa/alerta              -> publica mensagem quando entra em alarme
  ============================================================
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ---------------------- CONFIGURAÇÕES ----------------------
const char* WIFI_SSID     = "NOME_DA_SUA_REDE";
const char* WIFI_PASSWORD = "SENHA_DA_SUA_REDE";

const char* MQTT_BROKER = "broker.hivemq.com";   // troque por seu broker se desejar
const int   MQTT_PORT   = 1883;
const char* MQTT_CLIENT_ID = "esp32-estufa-iff";

// Tópicos
const char* TOPIC_SENSORES    = "estufa/sensores";
const char* TOPIC_FAN_SET     = "estufa/atuador/fan/set";
const char* TOPIC_FAN_STATUS  = "estufa/atuador/fan/status";
const char* TOPIC_LED_SET     = "estufa/atuador/led/set";
const char* TOPIC_ALERTA      = "estufa/alerta";

// Pinos
#define PIN_DHT   4
#define PIN_LDR   34
#define PIN_RELAY 26
#define PIN_LED   27
#define PIN_BUZZER 25

#define DHT_TYPE DHT22

// Limite de temperatura para acionamento automático do ventilador
const float TEMP_LIMITE_FAN   = 28.0;  // °C
const float TEMP_LIMITE_ALARME = 35.0; // °C - buzzer dispara

// Intervalo de leitura/publicação (ms)
const unsigned long INTERVALO_ENVIO = 5000;

// ---------------------- OBJETOS GLOBAIS ----------------------
DHT dht(PIN_DHT, DHT_TYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long ultimoEnvio = 0;
bool fanLigadoManual = false;   // estado vindo do dashboard
bool fanForcado = false;        // se o usuário assumiu o controle manual
bool ledLigado = false;

// ---------------------- WIFI ----------------------
void conectarWiFi() {
  Serial.print("Conectando ao WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado! IP: " + WiFi.localIP().toString());
}

// ---------------------- MQTT: CALLBACK ----------------------
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String mensagem;
  for (unsigned int i = 0; i < length; i++) {
    mensagem += (char)payload[i];
  }
  mensagem.trim();
  Serial.println("[MQTT] Recebido em " + String(topic) + ": " + mensagem);

  if (String(topic) == TOPIC_FAN_SET) {
    fanForcado = true; // usuário assumiu controle manual pelo dashboard
    fanLigadoManual = (mensagem == "ON");
    digitalWrite(PIN_RELAY, fanLigadoManual ? HIGH : LOW);
    mqttClient.publish(TOPIC_FAN_STATUS, fanLigadoManual ? "ON" : "OFF");
  }

  if (String(topic) == TOPIC_LED_SET) {
    ledLigado = (mensagem == "ON");
    digitalWrite(PIN_LED, ledLigado ? HIGH : LOW);
  }
}

// ---------------------- MQTT: RECONEXÃO ----------------------
void reconectarMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Conectando ao broker MQTT...");
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println(" conectado!");
      mqttClient.subscribe(TOPIC_FAN_SET);
      mqttClient.subscribe(TOPIC_LED_SET);
    } else {
      Serial.print(" falhou, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" tentando novamente em 3s");
      delay(3000);
    }
  }
}

// ---------------------- SETUP ----------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_RELAY, LOW);
  digitalWrite(PIN_LED, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  dht.begin();
  conectarWiFi();

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

// ---------------------- LOOP ----------------------
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
  }
  if (!mqttClient.connected()) {
    reconectarMQTT();
  }
  mqttClient.loop();

  unsigned long agora = millis();
  if (agora - ultimoEnvio >= INTERVALO_ENVIO) {
    ultimoEnvio = agora;
    lerEEnviarDados();
  }
}

// ---------------------- LEITURA E LÓGICA LOCAL ----------------------
void lerEEnviarDados() {
  float temperatura = dht.readTemperature();
  float umidade = dht.readHumidity();
  int leituraLDR = analogRead(PIN_LDR);              // 0 - 4095
  float luminosidadePct = (leituraLDR / 4095.0) * 100.0;

  if (isnan(temperatura) || isnan(umidade)) {
    Serial.println("Falha ao ler o sensor DHT22!");
    return;
  }

  // ---- Decisão local (edge processing) ----
  // Só decide automaticamente se o usuário não assumiu controle manual
  if (!fanForcado) {
    bool deveLigar = temperatura >= TEMP_LIMITE_FAN;
    if (deveLigar != fanLigadoManual) {
      fanLigadoManual = deveLigar;
      digitalWrite(PIN_RELAY, fanLigadoManual ? HIGH : LOW);
      mqttClient.publish(TOPIC_FAN_STATUS, fanLigadoManual ? "ON" : "OFF");
    }
  }

  // Alarme sonoro em temperatura crítica
  if (temperatura >= TEMP_LIMITE_ALARME) {
    digitalWrite(PIN_BUZZER, HIGH);
    mqttClient.publish(TOPIC_ALERTA, "Temperatura critica detectada!");
  } else {
    digitalWrite(PIN_BUZZER, LOW);
  }

  // ---- Monta JSON e publica ----
  StaticJsonDocument<256> doc;
  doc["temperatura"] = temperatura;
  doc["umidade"] = umidade;
  doc["luminosidade"] = luminosidadePct;
  doc["fan"] = fanLigadoManual ? "ON" : "OFF";
  doc["led"] = ledLigado ? "ON" : "OFF";
  doc["timestamp"] = millis();

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_SENSORES, buffer);

  Serial.println(String("Publicado -> ") + buffer);
}
