# COPAL Auth Backend

Este projeto adiciona um servidor leve em Node.js com SQLite para cadastrar e autenticar usuários do sistema.

## O que foi criado

- `server.js` - servidor Express com endpoints de autenticação
- `package.json` - dependências para rodar o servidor
- `db_init.sql` - script SQL para criar tabelas de usuários e sessões
- `database.sqlite` será criado automaticamente na primeira execução
- `uploads/` - diretório para imagens de fundo enviadas pelo usuário

## Endpoints disponíveis

- `POST /auth/register` - cadastra usuário e gera código OTP
- `POST /auth/verify-otp` - verifica código de registro
- `POST /auth/resend-otp` - reenviar código OTP
- `POST /auth/login` - autentica usuário e retorna token
- `POST /auth/upload-background` - atualiza imagem de fundo do usuário

## Como usar

1. No terminal, navegue até a pasta `SISTEMA`
2. Execute `npm install`
3. Execute `npm start`
4. Abra o navegador em `http://localhost:3000/login.html.html`

> O sistema de login atual em `login.html.html` já está configurado para usar estes endpoints.
