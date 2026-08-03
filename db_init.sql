-- ============================================================================
-- db_init.sql
-- Banco PostgreSQL focado no cadastro de usuarios (cadastrouser.html.html)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS users (
	id BIGSERIAL PRIMARY KEY,
	email VARCHAR(255) NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	name VARCHAR(200) NOT NULL DEFAULT '',

	-- Perfil e autorizacao
	role VARCHAR(50) NOT NULL DEFAULT 'user',
	perfil VARCHAR(100) NOT NULL DEFAULT '',
	access_level VARCHAR(50) NOT NULL DEFAULT '',
	account_status VARCHAR(50) NOT NULL DEFAULT 'ativo',
	status VARCHAR(50) NOT NULL DEFAULT 'Pendente',
	verified BOOLEAN NOT NULL DEFAULT FALSE,
	can_view_overview BOOLEAN NOT NULL DEFAULT FALSE,

	-- Vinculo organizacional
	unidade VARCHAR(100) NOT NULL DEFAULT '',
	cargo VARCHAR(120) NOT NULL DEFAULT '',

	-- Campos do formulario de cadastro
	cpf VARCHAR(20) NOT NULL DEFAULT '',
	matricula VARCHAR(50) NOT NULL DEFAULT '',
	birthDate TEXT NOT NULL DEFAULT '',
	phone VARCHAR(30) NOT NULL DEFAULT '',
	expirationDate TEXT NOT NULL DEFAULT '',
	observacoes TEXT NOT NULL DEFAULT '',

	-- Permissoes por modulos vindas dos checkboxes
	permissions_json JSONB NOT NULL DEFAULT '{}'::jsonb,

	-- Fluxo OTP de verificacao
	otp_code VARCHAR(20),
	otp_expires BIGINT,

	-- Personalizacao visual
	background_image TEXT,

	-- Auditoria
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_perfil ON users (perfil);
CREATE INDEX IF NOT EXISTS idx_users_unidade ON users (unidade);
CREATE INDEX IF NOT EXISTS idx_users_matricula ON users (matricula);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_verified ON users (verified);

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

COMMIT;

-- Usuario inicial (opcional) - senha padrao: Senha123
-- Hash SHA-256 legado; o backend converte para bcrypt no primeiro login.
INSERT INTO users (
	email,
	password_hash,
	name,
	role,
	perfil,
	access_level,
	account_status,
	status,
	verified,
	can_view_overview,
	unidade,
	cargo,
	cpf,
	matricula,
	birthDate,
	phone,
	expirationDate,
	observacoes,
	permissions_json
)
VALUES (
	'admin@copal.mt.gov',
	'c00357563669ed21c34e13687cad669038eb88a2831fc8109b40ddc62f63e934',
	'Administrador COPAL',
	'admin',
	'Administrador',
	'Nivel 3',
	'ativo',
	'Aprovado',
	TRUE,
	TRUE,
	'COPAL',
	'Administrador',
	'',
	'ADM',
	'',
	'',
	'',
	'Usuario inicial do sistema',
	'{}'::jsonb
)
ON CONFLICT (email) DO NOTHING;
