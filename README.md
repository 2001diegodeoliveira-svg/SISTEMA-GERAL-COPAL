# Sistema Geral COPAL

Este repositório contém uma aplicação web com frontend estático e backend Node.js/Express, migrado para PostgreSQL para autenticação, gestão de usuários, contatos, unidades, contratos, requisições e integração com IA GOV MT.

## Estrutura do projeto

- `backend/server.js` - API principal Express
- `backend/config/database.js` - conexão e camada de compatibilidade PostgreSQL
- `backend/database/schema.sql` - schema PostgreSQL
- `backend/database/seed.sql` - carga inicial
- `frontend/*.html.html` - páginas do frontend
- `uploads/` - pasta de anexos

## Requisitos

- Node.js 18+ recomendado
- npm
- PostgreSQL 14+

## Como executar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie o arquivo de ambiente exemplo:
   ```bash
   cp .env.example .env
   ```
3. Crie um banco PostgreSQL (exemplo: `copal`).
4. Aplique schema e seed:
   ```bash
   psql -h localhost -U postgres -d copal -f backend/database/schema.sql
   psql -h localhost -U postgres -d copal -f backend/database/seed.sql
   ```
5. Ajuste as variáveis de ambiente em `.env`, se necessário.
6. Inicie o servidor:
   ```bash
   npm run dev
   ```
7. Acesse:
   ```text
   http://localhost:3000/
   ```

## Configuração para GitHub Pages (frontend) + Backend Node.js

Quando o frontend está publicado no GitHub Pages, a API precisa estar em uma URL pública (Render/Railway/etc).

## Configuração para Vercel

Este repositório também pode publicar apenas o frontend no Vercel. A raiz do site aponta para [frontend/introdução.html.html](frontend/introdução.html.html); a introdução leva à tela de integr&#234;ncia e a aba COPAL abre [frontend/home.html.html](frontend/home.html.html). As demais páginas continuam funcionando como arquivos estáticos.

Passos:

1. Conecte o repositório no Vercel.
2. Não adicione build command.
3. Mantenha o deploy como site estático.
4. Acesse a home pela URL raiz do projeto.

Observação:

- O backend Node.js/Express continua fora do Vercel neste formato.
- A API pública deve permanecer em Render, Railway ou outro host compatível.

### Opção recomendada: Render Blueprint

Este repositório já contém o arquivo [render.yaml](render.yaml), que cria:

- `sistema-geral-copal-api` (serviço Node.js)
- `sistema-geral-copal-db` (PostgreSQL)

Passos:

1. No Render, escolha **New +** > **Blueprint**.
2. Conecte este repositório.
3. Faça o deploy do blueprint.
4. Após o deploy, copie a URL pública do serviço web (ex.: `https://sistema-geral-copal-api.onrender.com`).

### Configurar o frontend para usar a API pública (sem prompt manual)

O frontend usa o arquivo `frontend/app-config.json` para decidir automaticamente a URL da API:

```json
{
   "localApiBase": "http://localhost:3000",
   "productionApiBase": "https://SUA-API.onrender.com",
   "githubPagesHosts": ["2001diegodeoliveira-svg.github.io"]
}
```

Fluxo:

- Em `localhost` ele usa `localApiBase`.
- Em GitHub Pages ele usa `productionApiBase`.
- Se `productionApiBase` estiver vazio, a API não é chamada e o frontend informa erro de configuração.

Sobrescrita opcional em tempo de execução (debug):

```js
window.setApiBaseUrl("https://sua-api-publica.onrender.com")
window.clearApiBaseUrl()
```

## Variáveis de ambiente

O projeto usa variáveis de ambiente para banco de dados, autenticação e e-mail. Consulte [.env.example](.env.example) e [backend/.env.example](backend/.env.example).

Variáveis principais em produção:

- `DATABASE_URL` (prioridade maior, conexão completa PostgreSQL)
- `USERS_DATABASE_URL` (opcional; quando informado, módulo de usuários usa este banco)
- `CONTRACTS_DATABASE_URL` (opcional; quando informado, módulo de contratos usa este banco)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (fallback para ambiente local)
- `DB_SSL` (`true` para forçar SSL quando necessário)
- `CORS_ORIGINS` (origens permitidas, separadas por vírgula)

Exemplo para dois bancos no mesmo PostgreSQL:

```env
USERS_DB_HOST=seu-host
USERS_DB_PORT=5432
USERS_DB_NAME=usuarios
USERS_DB_USER=seu-user
USERS_DB_PASSWORD=sua-senha

CONTRACTS_DB_HOST=seu-host
CONTRACTS_DB_PORT=5432
CONTRACTS_DB_NAME=copal
CONTRACTS_DB_USER=seu-user
CONTRACTS_DB_PASSWORD=sua-senha
```

Exemplo recomendado:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://2001diegodeoliveira-svg.github.io
```

## Usuário inicial

Após rodar o seed, o usuário padrão é:

- E-mail: `admin@copal.mt.gov`
- Senha: `Senha123`

Observação: no primeiro login, o hash legado é atualizado automaticamente para bcrypt.

## Publicação no GitHub

Antes de publicar:

- não envie `uploads/` ou segredos reais;
- mantenha as credenciais em `.env` localmente;
- use um repositório privado se o sistema ainda contiver dados sensíveis;
- revise se há informações institucionais ou senhas padrão que não devem permanecer no repositório.

## Observações importantes

- O frontend permanece estático e consome a API do backend.
- A migração para PostgreSQL foi aplicada mantendo os endpoints principais para evitar quebra de layout e fluxo.
- Para produção, recomenda-se configurar HTTPS, CORS restritivo e rotação de tokens.
