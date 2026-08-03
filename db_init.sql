-- Banco de dados COPAL: esquema SQLite alinhado ao backend Node.js

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  unidade TEXT DEFAULT '',
  perfil TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pendente',
  verified INTEGER NOT NULL DEFAULT 0,
  can_view_overview INTEGER NOT NULL DEFAULT 0,
  access_level TEXT DEFAULT '',
  account_status TEXT NOT NULL DEFAULT 'ativo',
  permissions_json TEXT DEFAULT '{}',
  otp_code TEXT,
  otp_expires INTEGER,
  background_image TEXT,
  cpf TEXT DEFAULT '',
  matricula TEXT DEFAULT '',
  birthDate TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  cargo TEXT DEFAULT '',
  expirationDate TEXT DEFAULT '',
  observacoes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unidade TEXT NOT NULL,
  setor TEXT NOT NULL,
  telefone TEXT NOT NULL,
  ramal TEXT
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT DEFAULT '',
  responsible TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Ativo'
);

CREATE TABLE IF NOT EXISTS unit_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_code TEXT NOT NULL,
  login TEXT NOT NULL,
  pass TEXT NOT NULL,
  name TEXT DEFAULT '',
  doc TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  role TEXT DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (unit_code) REFERENCES units(code)
);

CREATE TABLE IF NOT EXISTS requisition_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_email TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_matricula TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS requisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  req_number_year TEXT,
  req_unit_demand TEXT,
  req_contract_num TEXT,
  req_issue_date TEXT,
  req_company TEXT,
  req_company_email TEXT,
  req_cnpj TEXT,
  req_deadline_days TEXT,
  req_days_type TEXT,
  req_address TEXT,
  req_business_hours TEXT,
  req_fiscal_name TEXT,
  req_fiscal_phone TEXT,
  requester_name TEXT NOT NULL,
  requester_matricula TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  verification_code TEXT NOT NULL,
  pdf_attachment_name TEXT,
  pdf_attachment_path TEXT,
  email_subject TEXT,
  email_text TEXT,
  email_html TEXT,
  email_status TEXT NOT NULL DEFAULT 'pending',
  email_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  code_id INTEGER,
  FOREIGN KEY (code_id) REFERENCES requisition_codes(id)
);

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
