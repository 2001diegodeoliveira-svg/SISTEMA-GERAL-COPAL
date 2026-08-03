INSERT INTO roles (code, name, description)
VALUES
  ('admin', 'Administrador', 'Acesso total ao sistema'),
  ('developer', 'Desenvolvedor', 'Acesso técnico e administrativo'),
  ('user', 'Usuário', 'Acesso operacional'),
  ('consultor', 'Consultor', 'Acesso somente leitura')
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (
  email,
  password_hash,
  name,
  role,
  status,
  verified,
  can_view_overview,
  access_level,
  account_status,
  permissions_json,
  cpf,
  matricula,
  phone,
  cargo,
  observacoes
)
VALUES (
  'admin@copal.mt.gov',
  'c00357563669ed21c34e13687cad669038eb88a2831fc8109b40ddc62f63e934',
  'Administrador COPAL',
  'admin',
  'Aprovado',
  TRUE,
  TRUE,
  'Nível 3',
  'ativo',
  '{}'::jsonb,
  '',
  'ADM',
  '',
  'Administrador',
  'Usuário inicial do sistema'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO units (code, name, location, responsible, status)
VALUES
  ('COPAL', 'Coordenação COPAL', 'Cuiabá - MT', 'Administrador', 'Ativo'),
  ('SESP', 'Secretaria de Estado de Segurança Pública', 'Cuiabá - MT', 'Administrador', 'Ativo'),
  ('PM-MT', 'Polícia Militar de Mato Grosso', 'Cuiabá - MT', 'Administrador', 'Ativo'),
  ('PJC-MT', 'Polícia Judiciária Civil', 'Cuiabá - MT', 'Administrador', 'Ativo'),
  ('CBM-MT', 'Corpo de Bombeiros Militar', 'Cuiabá - MT', 'Administrador', 'Ativo')
ON CONFLICT (code) DO NOTHING;

INSERT INTO contacts (unidade, setor, telefone, ramal)
VALUES
  ('COPAL', 'Coordenação Geral', '(65) 3613-5500', '201'),
  ('COPAL', 'Gerência de Contratos', '(65) 3613-5502', '205'),
  ('SESP', 'Diretoria de TI', '(65) 3613-5540', '310 / 312'),
  ('PM-MT', 'Comando Geral / Protocolo', '(65) 3613-8800', '102'),
  ('PJC-MT', 'Superintendência Geral', '(65) 3613-6800', 'Ramal Direto')
ON CONFLICT DO NOTHING;
