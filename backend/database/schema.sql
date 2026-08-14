CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name VARCHAR(200) NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  unidade VARCHAR(100) DEFAULT '',
  perfil VARCHAR(100) DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'Pendente',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_overview BOOLEAN NOT NULL DEFAULT FALSE,
  access_level VARCHAR(50) DEFAULT '',
  account_status VARCHAR(50) NOT NULL DEFAULT 'ativo',
  permissions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cpf VARCHAR(20) DEFAULT '',
  matricula VARCHAR(50) DEFAULT '',
  birthDate TEXT DEFAULT '',
  phone VARCHAR(30) DEFAULT '',
  cargo VARCHAR(120) DEFAULT '',
  expirationDate TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  background_image TEXT,
  otp_code VARCHAR(20),
  otp_expires BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_unidade ON users (unidade);
CREATE INDEX IF NOT EXISTS idx_users_matricula ON users (matricula);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  refresh_token TEXT UNIQUE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT,
  revoked_at BIGINT,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  unidade VARCHAR(100) NOT NULL,
  setor VARCHAR(200) NOT NULL,
  telefone VARCHAR(30) NOT NULL,
  ramal VARCHAR(30) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_unidade ON contacts (unidade);
CREATE INDEX IF NOT EXISTS idx_contacts_setor ON contacts (setor);

CREATE TABLE IF NOT EXISTS patrimonio (
  id BIGSERIAL PRIMARY KEY,
  rp VARCHAR(50) NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 0,
  estado VARCHAR(50) NOT NULL DEFAULT 'Bom',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patrimonio_rp ON patrimonio (rp);
CREATE INDEX IF NOT EXISTS idx_patrimonio_estado ON patrimonio (estado);

CREATE TABLE IF NOT EXISTS units (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  location TEXT DEFAULT '',
  responsible VARCHAR(200) DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'Ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_units_code ON units (code);
CREATE INDEX IF NOT EXISTS idx_units_status ON units (status);

CREATE TABLE IF NOT EXISTS unit_users (
  id BIGSERIAL PRIMARY KEY,
  unit_code VARCHAR(50) NOT NULL REFERENCES units(code) ON DELETE CASCADE,
  login VARCHAR(120) NOT NULL,
  pass TEXT NOT NULL,
  name VARCHAR(200) DEFAULT '',
  doc VARCHAR(50) DEFAULT '',
  email VARCHAR(255) DEFAULT '',
  phone VARCHAR(30) DEFAULT '',
  role VARCHAR(100) DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_unit_users_unit_login ON unit_users (unit_code, lower(login));
CREATE INDEX IF NOT EXISTS idx_unit_users_unit_code ON unit_users (unit_code);

CREATE TABLE IF NOT EXISTS requisition_codes (
  id BIGSERIAL PRIMARY KEY,
  requester_email VARCHAR(255) NOT NULL,
  requester_name VARCHAR(200) NOT NULL,
  requester_matricula VARCHAR(50) NOT NULL,
  code VARCHAR(20) NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requisition_codes_email ON requisition_codes (requester_email);
CREATE INDEX IF NOT EXISTS idx_requisition_codes_code ON requisition_codes (code);

CREATE TABLE IF NOT EXISTS requisitions (
  id BIGSERIAL PRIMARY KEY,
  req_number_year VARCHAR(50),
  req_unit_demand VARCHAR(100),
  req_contract_num VARCHAR(100),
  req_issue_date TEXT,
  req_company VARCHAR(255),
  req_company_email VARCHAR(255),
  req_cnpj VARCHAR(30),
  req_deadline_days VARCHAR(20),
  req_days_type VARCHAR(20),
  req_address TEXT,
  req_business_hours TEXT,
  req_fiscal_name VARCHAR(200),
  req_fiscal_phone VARCHAR(30),
  requester_name VARCHAR(200) NOT NULL,
  requester_matricula VARCHAR(50) NOT NULL,
  requester_email VARCHAR(255) NOT NULL,
  verification_code VARCHAR(20) NOT NULL,
  pdf_attachment_name TEXT,
  pdf_attachment_path TEXT,
  email_subject TEXT,
  email_text TEXT,
  email_html TEXT,
  email_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  email_error TEXT,
  created_at BIGINT NOT NULL,
  sent_at BIGINT,
  code_id BIGINT REFERENCES requisition_codes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_requisitions_contract_num ON requisitions (req_contract_num);
CREATE INDEX IF NOT EXISTS idx_requisitions_requester_email ON requisitions (requester_email);
CREATE INDEX IF NOT EXISTS idx_requisitions_status ON requisitions (email_status);

CREATE TABLE IF NOT EXISTS contracts (
  id BIGSERIAL PRIMARY KEY,
  numContrato VARCHAR(100) NOT NULL UNIQUE,
  numProcesso VARCHAR(100),
  credor VARCHAR(255),
  cep VARCHAR(20),
  logradouro TEXT,
  numEndereco VARCHAR(30),
  bairro VARCHAR(120),
  cidade VARCHAR(120),
  uf VARCHAR(10),
  telefoneFixo VARCHAR(30),
  telefoneWhatsapp VARCHAR(30),
  emailEmpresa VARCHAR(255),
  valorGlobal VARCHAR(50),
  objeto TEXT,
  dtInicial TEXT,
  dtFinal TEXT,
  prazoEntrega VARCHAR(20),
  formaContagem VARCHAR(20),
  tipoEntrega VARCHAR(30),
  arquivoContrato TEXT,
  conteudoArquivoBase64 TEXT,
  lotes JSONB NOT NULL DEFAULT '[]'::jsonb,
  unidades JSONB NOT NULL DEFAULT '[]'::jsonb,
  aditivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  empenhos JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'ativo',
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_num_contrato ON contracts (numContrato);
CREATE INDEX IF NOT EXISTS idx_contracts_credor ON contracts (credor);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);
CREATE INDEX IF NOT EXISTS idx_contracts_dt_inicial ON contracts (dtInicial);

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS cep VARCHAR(20);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS logradouro TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS numEndereco VARCHAR(30);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS bairro VARCHAR(120);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS cidade VARCHAR(120);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS uf VARCHAR(10);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS telefoneFixo VARCHAR(30);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS telefoneWhatsapp VARCHAR(30);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS emailEmpresa VARCHAR(255);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS prazoEntrega VARCHAR(20);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS formaContagem VARCHAR(20);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tipoEntrega VARCHAR(30);

CREATE TABLE IF NOT EXISTS contract_addendums (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  data DATE,
  valor VARCHAR(50),
  obs TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_addendums_contract_id ON contract_addendums (contract_id);

CREATE TABLE IF NOT EXISTS contract_empenhos (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  num_empenho VARCHAR(100) NOT NULL,
  tipo_empenho VARCHAR(50) NOT NULL,
  valor_empenho VARCHAR(50) NOT NULL,
  data_lancamento DATE,
  unidades JSONB NOT NULL DEFAULT '[]'::jsonb,
  arquivo_nota_empenho TEXT,
  conteudo_arquivo_base64 TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_empenhos_contract_id ON contract_empenhos (contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_contract_empenhos_num_empenho ON contract_empenhos (contract_id, num_empenho);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications (read_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(120),
  entity_id VARCHAR(120),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs (entity_type);

CREATE TABLE IF NOT EXISTS attachments (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  file_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type VARCHAR(120),
  file_size BIGINT,
  file_path TEXT NOT NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS signatures (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT NOT NULL,
  signed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_data TEXT,
  hash TEXT,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_signatures_entity ON signatures (entity_type, entity_id);

CREATE OR REPLACE VIEW v_contract_overview AS
SELECT
  c.id,
  c.numContrato,
  c.credor,
  c.valorGlobal,
  c.dtInicial,
  c.dtFinal,
  c.status,
  c.created_at,
  c.updated_at,
  COUNT(DISTINCT ce.id) AS empenhos_count,
  COUNT(DISTINCT ca.id) AS addendums_count
FROM contracts c
LEFT JOIN contract_empenhos ce ON ce.contract_id = c.id
LEFT JOIN contract_addendums ca ON ca.contract_id = c.id
GROUP BY c.id;
