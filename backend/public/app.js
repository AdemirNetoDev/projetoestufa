const socket = io();

const el = {
  statusConexao: document.getElementById("statusConexao"),
  folhaPulso: document.getElementById("folhaPulso"),
  faixaAlerta: document.getElementById("faixaAlerta"),
  textoAlerta: document.getElementById("textoAlerta"),
  valorTemp: document.getElementById("valorTemp"),
  valorUmid: document.getElementById("valorUmid"),
  valorLuz: document.getElementById("valorLuz"),
  barraTemp: document.getElementById("barraTemp"),
  barraUmid: document.getElementById("barraUmid"),
  barraLuz: document.getElementById("barraLuz"),
  qtdLeituras: document.getElementById("qtdLeituras"),
  toggleFan: document.getElementById("toggleFan"),
  toggleLed: document.getElementById("toggleLed"),
  fanModo: document.getElementById("fanModo"),
};

const LIMITE_FAN = 28;
const LIMITE_ALARME = 35;

// ---------------------- GRÁFICO (Chart.js) ----------------------
const ctx = document.getElementById("graficoHistorico").getContext("2d");
const grafico = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Temperatura (°C)",
        data: [],
        borderColor: "#7CB342",
        backgroundColor: "rgba(124,179,66,0.12)",
        tension: 0.35,
        fill: true,
        pointRadius: 0,
      },
      {
        label: "Umidade (%)",
        data: [],
        borderColor: "#4FA3D1",
        backgroundColor: "transparent",
        tension: 0.35,
        pointRadius: 0,
      },
    ],
  },
  options: {
    responsive: true,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#9FB0A4", font: { family: "Inter" } } },
    },
    scales: {
      x: { ticks: { color: "#9FB0A4", maxTicksLimit: 8 }, grid: { color: "#26372B" } },
      y: { ticks: { color: "#9FB0A4" }, grid: { color: "#26372B" } },
    },
  },
});

function horaCurta(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function empurrarNoGrafico(leitura) {
  const rotulo = horaCurta(leitura.recebidoEm || new Date().toISOString());
  grafico.data.labels.push(rotulo);
  grafico.data.datasets[0].data.push(leitura.temperatura);
  grafico.data.datasets[1].data.push(leitura.umidade);

  if (grafico.data.labels.length > 30) {
    grafico.data.labels.shift();
    grafico.data.datasets.forEach((ds) => ds.data.shift());
  }
  grafico.update();
  el.qtdLeituras.textContent = grafico.data.labels.length;
}

// ---------------------- ATUALIZAÇÃO DOS CARTÕES ----------------------
function atualizarCartoes(leitura) {
  el.valorTemp.textContent = leitura.temperatura?.toFixed(1) ?? "--";
  el.valorUmid.textContent = leitura.umidade?.toFixed(0) ?? "--";
  el.valorLuz.textContent = leitura.luminosidade?.toFixed(0) ?? "--";

  el.barraTemp.style.width = Math.min(100, (leitura.temperatura / 45) * 100) + "%";
  el.barraUmid.style.width = Math.min(100, leitura.umidade) + "%";
  el.barraLuz.style.width = Math.min(100, leitura.luminosidade) + "%";

  el.barraTemp.style.background = leitura.temperatura >= LIMITE_ALARME
    ? "#E2583B"
    : leitura.temperatura >= LIMITE_FAN
      ? "#E2A83B"
      : "#7CB342";

  el.folhaPulso.classList.toggle("alarme", leitura.temperatura >= LIMITE_ALARME);

  if (leitura.fan) {
    el.toggleFan.checked = leitura.fan === "ON";
  }
  if (leitura.led) {
    el.toggleLed.checked = leitura.led === "ON";
  }
}

// ---------------------- EVENTOS SOCKET.IO ----------------------
socket.on("connect", () => {
  el.statusConexao.classList.add("online");
  el.statusConexao.innerHTML = '<span class="ponto"></span> ao vivo';
});

socket.on("disconnect", () => {
  el.statusConexao.classList.remove("online");
  el.statusConexao.innerHTML = '<span class="ponto"></span> desconectado';
});

socket.on("historico", (leituras) => {
  leituras.forEach((l) => empurrarNoGrafico(l));
  if (leituras.length) atualizarCartoes(leituras[leituras.length - 1]);
});

socket.on("leitura", (leitura) => {
  empurrarNoGrafico(leitura);
  atualizarCartoes(leitura);
});

socket.on("fanStatus", (estado) => {
  el.toggleFan.checked = estado === "ON";
  el.fanModo.textContent = "controle manual ativo";
});

socket.on("alerta", ({ mensagem, timestamp }) => {
  el.faixaAlerta.hidden = false;
  el.textoAlerta.textContent = `⚠ ${mensagem} — ${horaCurta(timestamp)}`;
});

// ---------------------- CONTROLES DO USUÁRIO ----------------------
el.toggleFan.addEventListener("change", () => {
  el.fanModo.textContent = "controle manual ativo";
  socket.emit("comandoFan", el.toggleFan.checked);
});

el.toggleLed.addEventListener("change", () => {
  socket.emit("comandoLed", el.toggleLed.checked);
});
