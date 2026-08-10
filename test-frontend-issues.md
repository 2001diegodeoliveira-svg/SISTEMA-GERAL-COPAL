# Análise de Problemas - Edição de Contratos e Abertura de PDFs

## Problema 1: Preenchimento de Campos na Edição
**Função Responsável:** `fillContractForm(contract)`
**Status:** ✅ Código OK
- A função preenche corretamente todos os campos quando um contrato é carregado
- A função `carregarContratoParaEdicao()` busca o contrato via `fetchContract()`
- Os dados vêm do endpoint `GET /api/contracts?numContrato=VALUE`

## Problema 2: PDFs Não Abrem em Produção (Vercel)
**Causa Identificada:** Multiplas falhas em cadeia

### 2.1 - Limitação de Tamanho JSON (CORRIGIDO ✅)
- **Problema:** `express.json()` limitado a 100kb bloqueava PDFs maiores
- **Solução:** Aumentado para `20mb` em `backend/server.js`
- **Status:** ✅ Deployado

### 2.2 - Arquivos Efêmeros no Render
- **Problema:** Arquivos em `/uploads/contracts/` são perdidos após reinicialização
- **Evidência:** 23 contratos têm caminho, mas todos retornam HTTP 404
- **Solução Necessária:** 
  - ✅ Salvar `conteudoArquivoBase64` no banco (agora funciona com limite 20mb)
  - PDFs existentes precisam ser reenviados

### 2.3 - Fallback de URLs Quebrado (CORRIGIDO ✅)
- **Problema:** `openPdfFromOverview()` tinha lógica de fallback incorreta
- **Solução:** Atualizado para tentar servidor Render mesmo se GitHub Pages retorna 404
- **Status:** ✅ Deployado

### 2.4 - App-Config.json em Produção
**Verificar:**
- Em Vercel: arquivo está em `/frontend/app-config.json`
- Precisa estar acessível como `/app-config.json` ou `/frontend/app-config.json`
- Contem: `productionApiBase: "https://sistema-geral-copal-4.onrender.com"`

### 2.5 - CORS na Vercel → Render
- Vercel frontend em: `https://sistema-geral-copal.vercel.app`
- Render backend em: `https://sistema-geral-copal-4.onrender.com`
- Render permite Vercel em CORS? ✅ Sim (vercel.app está no whitelist)

## Passos para Resolver

### Imediato (já feito):
- [x] Aumentar limite JSON para 20mb
- [x] Corrigir fallback de PDFs
- [x] Adicionar autenticação a `POST /api/contracts`

### Para os PDFs Abrirem:
1. **Reenviar os 22 contratos sem base64:**
   - Abrir cada contrato em edição
   - Selecionar o arquivo PDF novamente
   - Salvar
   - Base64 será salvo permanentemente no banco

2. **Validar app-config.json:**
   ```bash
   curl https://sistema-geral-copal.vercel.app/app-config.json
   curl https://sistema-geral-copal.vercel.app/frontend/app-config.json
   ```

3. **Testar abertura de PDF após reenvio:**
   - Login → Editar contrato → Clicar "Visualizar PDF"
   - Deve abrir em nova aba

## Checklist de Testes
- [ ] Contrato carrega com todos os campos preenchidos
- [ ] Button "Visualizar / Editar contrato salvo" funciona
- [ ] Campos de data, valores e texto estão corretos
- [ ] Botão "Abrir PDF" aparece após selecionar arquivo
- [ ] Clique em "Abrir PDF" abre em nova aba (não erro 404)
- [ ] Base64 é salvo no banco (verificar em `SELECT conteudoArquivoBase64 FROM contracts`)
