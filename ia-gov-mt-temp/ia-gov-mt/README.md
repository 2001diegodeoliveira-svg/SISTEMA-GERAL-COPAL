# IA GOV MT — Estrutura de IA Local

Estrutura completa para rodar sua própria IA **100% local**, sem depender de internet
nem de serviços externos. O texto que você digita nunca sai do seu computador.

```
ia-gov-mt/
├── frontend/           → a interface (HUD) que você já conhece
│   └── index.html
├── backend/            → o servidor que liga a interface ao modelo de IA
│   ├── server.js
│   ├── config.json     → onde você ajusta modelo, personalidade, etc.
│   └── package.json
├── instalar.bat         → roda uma vez, instala as dependências
├── iniciar.bat          → roda sempre que for usar a IA
└── README.md
```

## Como funciona

```
[ Navegador ]  →  [ Backend Node.js (porta 3000) ]  →  [ LM Studio (porta 1234) ]
  index.html         server.js + config.json              modelo de IA rodando
```

O **LM Studio** é o programa que efetivamente carrega e roda o modelo de IA na sua
máquina (usando a placa de vídeo ou processador). O **backend** é uma pequena ponte
que recebe as mensagens da interface e repassa para o LM Studio. O **frontend** é a
tela que você já viu, com o núcleo animado e o chat.

---

## Passo a passo (Windows)

### 1. Instale o Node.js
Baixe a versão **LTS** em https://nodejs.org/ e instale normalmente (Next, Next, Finish).
Isso é necessário para o backend funcionar.

### 2. Instale o LM Studio
Baixe em https://lmstudio.ai/ e instale normalmente.

### 3. Baixe um modelo dentro do LM Studio
Abra o LM Studio → aba de busca (ícone de lupa) → procure um modelo. Sugestões para
começar (rodam bem mesmo sem placa de vídeo potente):
- `Llama 3.1 8B Instruct` (bom equilíbrio qualidade/velocidade)
- `Phi-3.5 mini instruct` (mais leve, roda em qualquer PC)
- `Mistral 7B Instruct` (alternativa sólida)

Clique em **Download** e aguarde terminar.

### 4. Ative o servidor local do LM Studio
Dentro do LM Studio:
1. Vá na aba **Developer** (ícone de `</>` na lateral).
2. Selecione o modelo baixado no topo.
3. Ative a chave **Start Server** (ou "Local Server").
4. Confirme que a porta está em **1234** (padrão).
5. Nas configurações do servidor, ative **"Enable CORS"** — isso é importante para
   o navegador conseguir conversar com ele.

Deixe o LM Studio aberto rodando em segundo plano.

### 5. Instale as dependências da estrutura
Dentro da pasta `ia-gov-mt`, dê **dois cliques** em `instalar.bat`.
Isso baixa as bibliotecas necessárias do backend (só precisa fazer isso uma vez).

### 6. Inicie a IA
Dê **dois cliques** em `iniciar.bat`.
Uma janela preta vai abrir (é o servidor rodando) e o navegador vai abrir sozinho em
`http://localhost:3000` já com a interface IA GOV MT.

No topo da tela, o indicador **MOTOR** deve mostrar **LM STUDIO OK** em ciano.
Se aparecer **LM STUDIO OFF** em vermelho, volte ao passo 4 e confira se o servidor
do LM Studio está realmente ligado.

---

## Personalizando

Abra `backend/config.json` com o Bloco de Notas para ajustar:

| Campo | O que faz |
|---|---|
| `model` | Nome do modelo carregado no LM Studio (aparece na aba Developer do LM Studio) |
| `systemPrompt` | A "personalidade" e instruções fixas da IA |
| `temperature` | Criatividade das respostas (0 = mais direta e previsível, 1 = mais criativa) |
| `maxTokens` | Tamanho máximo de cada resposta |
| `lmStudioUrl` | Endereço do servidor do LM Studio (só mude se alterar a porta padrão) |

Depois de editar, salve o arquivo e reinicie `iniciar.bat` (feche a janela preta e
abra de novo) para aplicar as mudanças.

## Histórico de conversas

Todo mundo que conversar com a IA gera um registro em
`backend/conversation-log.jsonl` — um arquivo de texto simples, uma conversa por
linha, útil para auditoria ou para revisar depois. Esse arquivo fica só no seu
computador.

## Problemas comuns

- **"LM STUDIO OFF" na tela** → o LM Studio não está aberto, ou o servidor local não
  foi ativado, ou o modelo não foi carregado. Volte ao passo 4.
- **Janela fecha sozinha ao abrir `iniciar.bat`** → provavelmente o Node.js não está
  instalado. Refaça o passo 1.
- **Respostas muito lentas** → normal em computadores sem placa de vídeo dedicada;
  tente um modelo menor, como o Phi-3.5 mini.
- **Quero acessar de outro computador da mesma rede** → troque `localhost` por
  `0.0.0.0` na linha `app.listen` em `server.js`, e acesse pelo IP da máquina que
  está rodando o backend (ex: `http://192.168.0.10:3000`). Isso deixa a rede local
  inteira acessar a IA — use com cuidado se a máquina tiver dados sensíveis.

---

Feito para funcionar totalmente offline após a configuração inicial: nenhum dado
sai da sua máquina.
