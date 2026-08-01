// ============================================================
// IA GOV MT — Backend local
// Faz a ponte entre a interface (frontend) e o LM Studio,
// que roda o modelo de IA localmente na máquina.
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '2mb' }));

// Serve os arquivos da interface (index.html, etc.)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// ---------- Carrega configuração ----------
const CONFIG_PATH = path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = {
  lmStudioUrl: 'http://localhost:1234/v1/chat/completions',
  lmStudioModelsUrl: 'http://localhost:1234/v1/models',
  model: 'local-model',
  temperature: 0.7,
  maxTokens: 1000,
  systemPrompt:
    'Você é a IA GOV MT, uma assistente de IA institucional com personalidade calma, precisa e levemente futurista — direta, sem enrolação, mas cordial. Responda em português do Brasil, de forma objetiva.'
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('[config] Não foi possível ler config.json, usando padrões.');
    return DEFAULT_CONFIG;
  }
}

let config = loadConfig();

// ---------- Histórico simples em disco (opcional, por sessão de servidor) ----------
const HISTORY_PATH = path.join(__dirname, 'conversation-log.jsonl');
function logExchange(userText, aiText) {
  try {
    const entry = { ts: new Date().toISOString(), user: userText, ai: aiText };
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    // não trava a resposta se o log falhar
    console.warn('[log] Falha ao gravar histórico:', e.message);
  }
}

// ---------- Rota principal de chat ----------
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nenhuma mensagem enviada.' });
  }

  const payload = {
    model: config.model,
    messages: [{ role: 'system', content: config.systemPrompt }, ...messages],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false
  };

  try {
    const r = await fetch(config.lmStudioUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const details = await r.text();
      console.error('[LM Studio] resposta com erro:', r.status, details);
      return res.status(502).json({
        error: 'O LM Studio recusou a solicitação. Verifique se o servidor local está ligado e um modelo está carregado.'
      });
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content ?? '(resposta vazia do modelo)';

    const lastUserMsg = messages[messages.length - 1]?.content ?? '';
    logExchange(lastUserMsg, reply);

    res.json({ reply });
  } catch (err) {
    console.error('[LM Studio] falha de conexão:', err.message);
    res.status(502).json({
      error: 'Não foi possível conectar ao LM Studio. Confirme se ele está aberto com o servidor local ativado (porta 1234).'
    });
  }
});

// ---------- Rota de saúde: checa se o LM Studio está respondendo ----------
app.get('/api/health', async (req, res) => {
  try {
    const r = await fetch(config.lmStudioModelsUrl, { method: 'GET' });
    res.json({ backend: true, lmStudio: r.ok });
  } catch (e) {
    res.json({ backend: true, lmStudio: false });
  }
});

// ---------- Rota para recarregar config sem reiniciar o servidor ----------
app.post('/api/reload-config', (req, res) => {
  config = loadConfig();
  res.json({ ok: true, config });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('============================================');
  console.log('  IA GOV MT — backend local ativo');
  console.log(`  Interface: http://localhost:${PORT}`);
  console.log(`  Motor (LM Studio): ${config.lmStudioUrl}`);
  console.log('============================================');
});
