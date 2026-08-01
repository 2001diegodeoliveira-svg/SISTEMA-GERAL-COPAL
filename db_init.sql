-- Banco de dados COPAL: tabela de usuários e sessões

CREATE DATABASE IF NOT EXISTS copal;
USE copal;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  otp_code TEXT,
  otp_expires INTEGER,
  background_image TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Exemplo de usuário inicial (senha em SHA-256: Senha123)
INSERT INTO users (email, password, name, verified)
VALUES ('admin@copal.mt.gov', 'a3dc9b55b47c39f453a3eb487cc2d1f3d1cea2d2d40f6b989b2f3f43d3a7125b', 'Administrador COPAL', 1);

-- Tabela de contratos para a página contratos.html.html
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numContrato TEXT NOT NULL UNIQUE,
  numProcesso TEXT,
  credor TEXT,
  valorGlobal TEXT,
  objeto TEXT,
  dtInicial TEXT,
  dtFinal TEXT,
  arquivoContrato TEXT,
  conteudoArquivoBase64 TEXT,
  lotes TEXT,
  unidades TEXT,
  aditivos TEXT,
  empenhos TEXT
);

-- Exemplo de contrato inicial
INSERT INTO contracts (numContrato, numProcesso, credor, valorGlobal, objeto, dtInicial, dtFinal, arquivoContrato, conteudoArquivoBase64, lotes, unidades, aditivos, empenhos)
VALUES (
  'CONTRATO 001/2026',
  'SESP-PRO-2026/0001',
  'Auto Rescue Equipamentos Eireli',
  'R$ 1.450.000,00',
  'Manutenção preventiva e corretiva de viaturas operacionais de combate a incêndio',
  '2026-01-01',
  '2026-12-31',
  'contrato_001.pdf',
  '',
  '[{"lote":"Lote 1","item":"Item 01","descricao":"Serviço de manutenção preventiva","valor":"R$ 500.000,00"}]',
  '[{"unidade":"CBM-MT","valor":"R$ 750.000,00"}]',
  '[{"tipo":"VALOR","data":"2026-06-15","valor":"R$ 100.000,00","obs":"Aditivo de reajuste"}]',
  '[{"numEmpenho":"2026NE00123","tipoEmpenho":"GLOBAL","valorEmpenho":"R$ 200.000,00","dataLancamento":"2026-07-01"}]'
);
