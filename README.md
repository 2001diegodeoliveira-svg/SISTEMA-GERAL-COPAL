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

### Opção recomendada: Render Blueprint

Este repositório já contém o arquivo [render.yaml](render.yaml), que cria:

- `sistema-geral-copal-api` (serviço Node.js)
- `sistema-geral-copal-db` (PostgreSQL)

Passos:

1. No Render, escolha **New +** > **Blueprint**.
2. Conecte este repositório.
3. Faça o deploy do blueprint.
4. Após o deploy, copie a URL pública do serviço web (ex.: `https://sistema-geral-copal-api.onrender.com`).

### Configurar o frontend para usar a API pública

Na primeira abertura no GitHub Pages, o frontend salva a URL da API automaticamente pelo script `api-client.js`.
Se precisar ajustar manualmente:

```js
window.setApiBaseUrl("https://sua-api-publica.onrender.com")
```

Para limpar:

```js
window.clearApiBaseUrl()
```

### Domínio próprio (Opção 01)

Este projeto foi preparado com CNAME para:

- `sistema-geral-copal.br`

Passos no GitHub:

1. Abra **Settings > Pages** do repositório.
2. Em **Custom domain**, confirme `sistema-geral-copal.br`.
3. Marque **Enforce HTTPS** após a validação do certificado.

Passos no Cloudflare (DNS):

1. Crie um registro `CNAME`:
   - `Name`: `www`
   - `Target`: `2001diegodeoliveira-svg.github.io`
   - `Proxy status`: DNS only (nuvem cinza)
2. Crie um redirecionamento para o domínio raiz (`sistema-geral-copal.br` -> `www.sistema-geral-copal.br`) usando:
   - **Rules > Redirect Rules**, ou
   - registro `A` (apex) com CNAME flattening habilitado para GitHub Pages.

Observação: a propagação DNS e do certificado pode levar alguns minutos.

## Variáveis de ambiente

O projeto usa variáveis de ambiente para banco de dados, autenticação e e-mail. Consulte [.env.example](.env.example) e [backend/.env.example](backend/.env.example).

Variáveis principais em produção:

- `DATABASE_URL` (prioridade maior, conexão completa PostgreSQL)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (fallback para ambiente local)
- `DB_SSL` (`true` para forçar SSL quando necessário)

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
