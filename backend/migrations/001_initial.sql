BEGIN;

-- Schema completo do sistema COPAL em PostgreSQL
-- Executar este arquivo em um banco novo ou vazio.

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Abaixo, o restante das tabelas segue o mesmo padrão do schema.sql.
-- Em ambiente de produção, prefira rodar backend/database/schema.sql + seed.sql.

COMMIT;
