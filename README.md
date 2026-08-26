# EstufaIoT — Monitoramento e Automação de Ambiente

**Curso:** Bacharelado em Sistemas de Informação
**Disciplina:** Fundamentos de IoT — Projeto Final
**IFF Campus Itaperuna**

> Preencha aqui os nomes da equipe antes de entregar.

---

## 1. O problema

Estufas domésticas e pequenas hortas costumam perder plantas por falta de
acompanhamento constante: ninguém percebe a tempo que a temperatura subiu
demais em um dia quente, ou que a umidade caiu à noite. O **EstufaIoT**
resolve isso automatizando a leitura do ambiente e a ventilação, além de
dar visibilidade remota ao responsável através de um painel web em tempo
real, sem precisar estar fisicamente no local.

## 2. Arquitetura fim a fim

```
 ┌────────────┐      Wi-Fi       ┌───────────────────┐      MQTT       ┌─────────────────────┐      Socket.io      ┌───────────────┐
 │   ESP32     │ ───────────────▶ │  Broker MQTT        │ ───────────────▶ │  Backend Node.js      │ ──────────────────▶ │  Dashboard Web  │
 │  (sensores  │ ◀─────────────── │  (broker.hivemq.com)│ ◀─────────────── │  (Express + mqtt.js)  │ ◀────────────────── │  (navegador)    │
 │  + atuadores)│    tópicos      │                     │    tópicos       │  guarda histórico      │     comandos        │  gráficos e     │
 └────────────┘                  └───────────────────┘                  └─────────────────────┘                      │  interruptores  │
                                                                                                                       └───────────────┘
```

**Fluxo de dados (leitura):**
`Sensores (DHT22 + LDR) → ESP32 lê e decide localmente → publica JSON via MQTT → Backend assina o tópico → repassa em tempo real via Socket.io → Dashboard atualiza gráfico e cartões`

**Fluxo de comando (controle remoto):**
`Usuário aciona interruptor no dashboard → Socket.io envia ao backend → Backend publica no tópico MQTT do atuador → ESP32 recebe e aciona o relé/LED`

### Por que essa arquitetura

- **MQTT** foi escolhido por ser leve e ideal para dispositivos com poucos
  recursos, além de permitir comunicação bidirecional simples
  (sensor → nuvem e nuvem → atuador) usando o padrão publish/subscribe.
- O **ESP32 já toma uma decisão local** (ligar o ventilador acima de 28°C)
  mesmo que a internet caia momentaneamente — o sistema não depende só da
  nuvem para reagir a uma situação crítica.
- O **backend em Node.js** foi escolhido por ser JavaScript de ponta a
  ponta (mesma linguagem do dashboard), o que facilita manter os dois lados
  do projeto.

## 3. Lista de componentes (hardware) e pinagem

| Componente        | Função                        | Pino ESP32     |
|-------------------|--------------------------------|----------------|
| DHT22              | Temperatura e umidade          | GPIO 4         |
| LDR (com resistor) | Luminosidade (entrada analógica)| GPIO 34 (ADC)  |
| Módulo relé         | Aciona o ventilador de exaustão| GPIO 26        |
| LED                 | Indicador visual manual        | GPIO 27        |
| Buzzer               | Alarme de temperatura crítica | GPIO 25        |

> Montagem em protoboard, sem solda: DHT22 e LDR alimentados em 3V3, relé e
> buzzer alimentados em 5V/VIN conforme o módulo utilizado.

## 4. Tecnologias usadas

| Camada         | Tecnologia                                   |
|----------------|-----------------------------------------------|
| Firmware        | ESP32 (Arduino), `WiFi.h`, `PubSubClient`, `DHT sensor library`, `ArduinoJson` |
| Protocolo        | MQTT (broker público `broker.hivemq.com`, trocável por Mosquitto próprio) |
| Backend           | Node.js, Express, `mqtt` (cliente MQTT), `socket.io` |
| Dashboard          | HTML, CSS, JavaScript puro, Chart.js |

## 5. Tópicos MQTT

| Tópico                        | Direção          | Conteúdo                          |
|--------------------------------|-------------------|-------------------------------------|
| `estufa/sensores`               | ESP32 → nuvem      | JSON com temperatura, umidade, luminosidade, estado dos atuadores |
| `estufa/atuador/fan/set`         | nuvem → ESP32      | `"ON"` ou `"OFF"`                   |
| `estufa/atuador/fan/status`       | ESP32 → nuvem      | estado atual do ventilador          |
| `estufa/atuador/led/set`           | nuvem → ESP32      | `"ON"` ou `"OFF"`                   |
| `estufa/alerta`                     | ESP32 → nuvem      | mensagem quando a temperatura passa de 35°C |

## 6. Como executar

### 6.1 Firmware (ESP32)

1. Instale no Arduino IDE (ou PlatformIO) as bibliotecas: `PubSubClient`,
   `DHT sensor library` (Adafruit) e `ArduinoJson`.
2. Abra `firmware/EstufaIoT.ino` e edite `WIFI_SSID` e `WIFI_PASSWORD`.
3. Se for usar um broker próprio, troque `MQTT_BROKER`.
4. Selecione a placa ESP32 correta e faça o upload.
5. Abra o Monitor Serial (115200 baud) para acompanhar as leituras e a
   conexão.

### 6.2 Backend + Dashboard

```bash
cd backend
npm install
npm start
```

Acesse `http://localhost:3000` no navegador. O painel conecta
automaticamente via Socket.io e passa a exibir os dados assim que o ESP32
começar a publicar no broker.

> Para publicar o dashboard na internet (ex.: demonstração remota), o
> `backend` pode ser hospedado em qualquer serviço que rode Node.js
> (Render, Railway, um VPS, etc.).

## 7. Testando sem o hardware físico

Para validar o backend e o dashboard antes de montar o circuito, é
possível simular o ESP32 publicando manualmente no broker com qualquer
cliente MQTT (ex.: MQTT Explorer ou `mosquitto_pub`):

```bash
mosquitto_pub -h broker.hivemq.com -t estufa/sensores \
  -m '{"temperatura":26.4,"umidade":58,"luminosidade":42,"fan":"OFF","led":"OFF"}'
```

## 8. Conclusões

O projeto integra as três camadas típicas de uma solução de IoT —
**percepção** (sensores no ESP32), **conectividade** (MQTT sobre Wi-Fi) e
**aplicação** (backend + dashboard) — mantendo o circuito eletrônico
simples (protoboard, sem solda) e concentrando a complexidade na
integração entre as camadas, no tratamento de erros do firmware
(reconexão automática de Wi-Fi/MQTT, validação de leitura do DHT22) e na
experiência do usuário no painel. A decisão de manter uma lógica local no
ESP32 (ligar o ventilador mesmo sem controle remoto) também demonstra um
princípio importante de IoT: o dispositivo de borda deve continuar
funcionando de forma segura mesmo quando a nuvem está indisponível.

## 9. Estrutura do repositório

```
estufa-iot/
├── firmware/
│   └── EstufaIoT.ino        # código do ESP32
├── backend/
│   ├── server.js             # ponte MQTT <-> dashboard
│   ├── package.json
│   └── public/
│       ├── index.html
│       ├── style.css
│       └── app.js
└── README.md                 # este documento
```
## 10. Trabalho desenvolvido por: Ademir Neto, Cauã Oliveira, Estevão Gaviolle e João Alberto Salles.