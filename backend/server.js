
const express = require("express");
const http = require("http");
const path = require("path");
const mqtt = require("mqtt");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const MQTT_BROKER_URL = "mqtt://broker.hivemq.com:1883";

// Tópicos - devem bater com os do firmware (EstufaIoT.ino)
const TOPIC_SENSORES   = "estufa/sensores";
const TOPIC_FAN_SET    = "estufa/atuador/fan/set";
const TOPIC_FAN_STATUS = "estufa/atuador/fan/status";
const TOPIC_LED_SET    = "estufa/atuador/led/set";
const TOPIC_ALERTA     = "estufa/alerta";

const MAX_HISTORICO = 100; // quantidade de leituras guardadas em memória

// ---------------------- APP / SERVIDOR HTTP ----------------------
const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server);

let historico = [];
let ultimoAlerta = null;

// ---------------------- CONEXÃO MQTT ----------------------
const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on("connect", () => {
  console.log("[MQTT] Conectado ao broker:", MQTT_BROKER_URL);
  mqttClient.subscribe([TOPIC_SENSORES, TOPIC_FAN_STATUS, TOPIC_ALERTA], (err) => {
    if (err) console.error("[MQTT] Erro ao assinar tópicos:", err);
    else console.log("[MQTT] Assinado nos tópicos de leitura/status");
  });
});

mqttClient.on("error", (err) => {
  console.error("[MQTT] Erro de conexão:", err.message);
});

mqttClient.on("message", (topic, payload) => {
  const mensagem = payload.toString();
  console.log("[MQTT] Recebido:", topic, mensagem);

  if (topic === TOPIC_SENSORES) {
    try {
      const leitura = JSON.parse(mensagem);
      leitura.recebidoEm = new Date().toISOString();

      historico.push(leitura);
      if (historico.length > MAX_HISTORICO) historico.shift();

      io.emit("leitura", leitura); // envia em tempo real para o dashboard
    } catch (e) {
      console.error("[MQTT] Payload inválido em estufa/sensores:", mensagem);
    }
  }

  if (topic === TOPIC_FAN_STATUS) {
    io.emit("fanStatus", mensagem);
  }

  if (topic === TOPIC_ALERTA) {
    ultimoAlerta = { mensagem, timestamp: new Date().toISOString() };
    io.emit("alerta", ultimoAlerta);
  }
});

// ---------------------- SOCKET.IO (DASHBOARD) ----------------------
io.on("connection", (socket) => {
  console.log("[Dashboard] Cliente conectado:", socket.id);

  // Ao conectar, manda o histórico já coletado para popular o gráfico
  socket.emit("historico", historico);
  if (ultimoAlerta) socket.emit("alerta", ultimoAlerta);

  // Comandos vindos do dashboard -> repassa para o ESP32 via MQTT
  socket.on("comandoFan", (estado) => {
    mqttClient.publish(TOPIC_FAN_SET, estado ? "ON" : "OFF");
  });

  socket.on("comandoLed", (estado) => {
    mqttClient.publish(TOPIC_LED_SET, estado ? "ON" : "OFF");
  });

  socket.on("disconnect", () => {
    console.log("[Dashboard] Cliente desconectado:", socket.id);
  });
});

// ---------------------- ROTA DE STATUS (API simples) ----------------------
app.get("/api/historico", (req, res) => {
  res.json(historico);
});

server.listen(PORT, () => {
  console.log(`EstufaIoT backend rodando em http://localhost:${PORT}`);
});
