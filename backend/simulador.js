/*
  ============================================================
  Simulador do ESP32
  ------------------------------------------------------------
  Publica leituras falsas de temperatura/umidade/luminosidade
  no mesmo broker e nos mesmos tópicos que o firmware real usa,
  para você testar o backend e o dashboard sem ter o hardware
  montado ainda.

  Uso:
    cd backend
    npm install
    node simulador.js
  ============================================================
*/

const mqtt = require("mqtt");

const MQTT_BROKER_URL = "mqtt://broker.hivemq.com:1883";
const TOPIC_SENSORES   = "estufa/sensores";
const TOPIC_FAN_SET    = "estufa/atuador/fan/set";
const TOPIC_FAN_STATUS = "estufa/atuador/fan/status";
const TOPIC_LED_SET    = "estufa/atuador/led/set";
const TOPIC_ALERTA     = "estufa/alerta";

const client = mqtt.connect(MQTT_BROKER_URL);

let temperatura = 24;
let umidade = 55;
let fanLigado = false;
let ledLigado = false;

client.on("connect", () => {
  console.log("[Simulador] Conectado ao broker. Publicando leituras falsas a cada 3s...");
  client.subscribe([TOPIC_FAN_SET, TOPIC_LED_SET]);

  setInterval(publicarLeitura, 3000);
});

client.on("message", (topic, payload) => {
  const msg = payload.toString();
  if (topic === TOPIC_FAN_SET) {
    fanLigado = msg === "ON";
    client.publish(TOPIC_FAN_STATUS, fanLigado ? "ON" : "OFF");
    console.log("[Simulador] Ventilador (comando manual):", fanLigado ? "ON" : "OFF");
  }
  if (topic === TOPIC_LED_SET) {
    ledLigado = msg === "ON";
    console.log("[Simulador] LED:", ledLigado ? "ON" : "OFF");
  }
});

function publicarLeitura() {
  // faz a temperatura "passear" aleatoriamente pra simular o ambiente real
  temperatura += (Math.random() - 0.5) * 1.5;
  umidade += (Math.random() - 0.5) * 2;
  temperatura = Math.max(18, Math.min(38, temperatura));
  umidade = Math.max(30, Math.min(90, umidade));
  const luminosidade = Math.round(Math.random() * 100);

  // mesma lógica local do firmware: liga ventilador acima de 28°C
  if (temperatura >= 28) fanLigado = true;
  if (temperatura >= 35) {
    client.publish(TOPIC_ALERTA, "Temperatura critica detectada!");
  }

  const leitura = {
    temperatura: Number(temperatura.toFixed(1)),
    umidade: Number(umidade.toFixed(1)),
    luminosidade,
    fan: fanLigado ? "ON" : "OFF",
    led: ledLigado ? "ON" : "OFF",
    timestamp: Date.now(),
  };

  client.publish(TOPIC_SENSORES, JSON.stringify(leitura));
  console.log("[Simulador] Publicado:", leitura);
}
