# Sistema Geral COPAL

Este repositório contém uma aplicação web com frontend estático e um backend em Node.js/Express usando SQLite para autenticação, gestão de usuários, contatos, unidades, contratos e integração com IA GOV MT.

## Estrutura do projeto

- `server.js` – backend Express com rotas de autenticação, cadastro, uploads, contratos e IA
- `package.json` – dependências e scripts de execução
- `db_init.sql` – script SQL de referência para a estrutura do banco
- `*.html.html` – páginas do frontend, mantidas na raiz do projeto
- `uploads/` – pasta gerada localmente para arquivos enviados pelo usuário
- `database.sqlite` – banco local gerado automaticamente em execução

## Requisitos

- Node.js 18+ recomendado
- npm

## Como executar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie o arquivo de ambiente exemplo:
   ```bash
   cp .env.example .env
   ```
3. Ajuste as variáveis de ambiente, se necessário.
4. Inicie o servidor:
   ```bash
   npm start
   ```
5. Acesse:
   ```text
   http://localhost:3000/
   ```

## Variáveis de ambiente

O projeto usa variáveis de ambiente para configuração de e-mail, porta e integração com IA. Consulte o arquivo [.env.example](.env.example).

## Publicação no GitHub

Antes de publicar:

- não envie arquivos locais como `database.sqlite`, `uploads/` ou segredos reais;
- mantenha as credenciais em `.env` localmente;
- use um repositório privado se o sistema ainda contiver dados sensíveis;
- revise se há informações institucionais ou senhas padrão que não devem permanecer no repositório.

## Observações importantes

- O projeto ainda possui uma estrutura mista de frontend estático + backend em um único diretório.
- Para um cenário mais profissional, a recomendação é separar frontend e backend em pastas diferentes no futuro.
- O banco é SQLite local, ideal para ambiente de desenvolvimento e testes, mas não é o mais indicado para produção multiusuário.
