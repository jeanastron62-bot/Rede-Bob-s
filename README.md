# Beb's Burguer — Sistema de Pedidos com Bot de WhatsApp

Aplicação web completa para uma hamburgueria em trailer: cardápio público para o cliente pedir pelo celular, painéis internos por função (garçom, cozinha, entregador, administrador, TI) com atualização em tempo real, e um atendente virtual no WhatsApp que recebe pedidos usando a API oficial da Meta e um modelo da OpenAI com *tool calling*.

Projeto de produção, usado ao vivo durante o expediente (18h às 05h). Cada decisão de arquitetura documentada em `docs/CONTEXTO.md` nasceu de um problema real: pedido duplicado, virada de meia-noite no meio do turno, aritmética de dinheiro em ponto flutuante, vazamento de dados pessoais por socket.

## O que o sistema faz

**Cardápio público (`/`)**
- Cardápio por categoria, itens com escolha obrigatória (ex.: ponto da carne) e acréscimos.
- Carrinho e checkout para mesa, retirada ou delivery, com taxa por bairro.
- Reflete em tempo real se o trailer está aberto, se o delivery está ativo e se um item saiu do estoque.

**Painéis internos (`/painel/*`, com login)**
- **Garçom**: lança pedidos, confirma pedidos feitos pelo site em mesa.
- **Cozinha**: fila por status (`AGUARDANDO → PREPARANDO → PRONTO`), controle de disponibilidade de itens.
- **Entregador**: aceita entregas com atribuição atômica (dois entregadores nunca pegam o mesmo pedido), reporta problemas.
- **ADM**: dashboard com KPIs e gráfico de faturamento, exportação de relatório em PDF, gestão de cardápio, bairros, usuários, avisos do dia, horário de fechamento agendado.
- **TI**: logs de auditoria com filtro e exportação (CSV/JSON), conexão do WhatsApp.

**Bot de WhatsApp**
- Webhook da Meta com verificação de assinatura sobre o corpo bruto da requisição.
- Loop de *tool calling* com a OpenAI: `criar_pedido`, `consultar_pedido_ativo`, `cancelar_pedido_ativo`, `transferir_para_humano`.
- Transferência para atendente humano com caixa de entrada no painel e aviso ao cliente.
- *Embedded Signup* com coexistência: o número que já usa o app WhatsApp Business conecta pelo painel, e o token da conta fica cifrado em repouso no banco.
- O bot é opcional por construção: sem as credenciais dele, o cardápio e os pedidos continuam no ar.

## Stack

| Camada | Tecnologias |
|---|---|
| Backend | Node.js 20, TypeScript, Express 4, Prisma 6, PostgreSQL, Socket.IO 4, Zod, JWT + bcrypt, express-rate-limit |
| Frontend | React 19, TypeScript, Vite, React Router 6, Zustand, Tailwind CSS 3, socket.io-client, axios, Recharts, jsPDF |
| Integrações | WhatsApp Cloud API (Meta), OpenAI (chat completions com tools) |
| Infra | Um único container (Express serve a build do Vite), Railway, backup por `pg_dump` agendado |

## Arquitetura em poucas linhas

- **Um deploy, um domínio.** O Express serve a API em `/api/*`, o Socket.IO e os arquivos estáticos do frontend. Sem CORS, sem segundo pipeline.
- **Servidor é a fonte de verdade do dinheiro.** Preços vêm do banco pelo `menuItemId`; qualquer total enviado pelo cliente é ignorado. Backend calcula com `Prisma.Decimal`, frontend em centavos inteiros.
- **Snapshots no pedido.** Nome, preço e taxa de entrega são copiados para o pedido no momento da criação. Mudar o cardápio depois não altera histórico financeiro.
- **Painéis operacionais filtram por status, nunca por data.** O turno atravessa a meia-noite; filtrar por "hoje" faria a fila da cozinha sumir às 00:00.
- **Dois namespaces de socket.** `/staff` exige JWT no handshake e recebe eventos de pedido. `/public` é anônimo e só recebe disponibilidade de item e configuração pública. Nenhum dado de pedido cruza para o público.
- **Sem hard delete em objeto de domínio.** Item de cardápio é arquivado, bairro é desativado, pedido é cancelado com motivo obrigatório. Toda mudança de status grava histórico na mesma transação.
- **Login não revela se o usuário existe.** Usuário inexistente e senha errada retornam a mesma resposta.

## Estrutura

```
backend/
  prisma/            schema, migrations e seed (cardápio e bairros)
  src/modules/       auth, menu, neighborhoods, config, orders, public, users, logs, reports, whatsapp
  src/socket/        namespaces /staff e /public
  src/utils/         dinheiro, telefone, janela de delivery, expediente, cifra de token
  scripts/           backup-db.sh (pg_dump para object storage)
frontend/
  src/pages/         cardápio público, login, cinco painéis
  src/components/    admin, cart, menu, order, whatsapp, ui
  src/stores/        Zustand (auth, carrinho, catálogo, pedidos, socket, inbox do WhatsApp)
docs/
  CONTEXTO.md        arquitetura, schema, regras de negócio e decisões tomadas
  ESTILO.md          sistema visual
  BOT-WHATSAPP-PROMPT.md  system prompt e definição das tools do bot
  FASE-*.md          especificação de cada fase de desenvolvimento
  relatorios/        relatório de entrega de cada fase
  verificacoes/      saída bruta dos testes manuais de cada fase
```

## Rodando localmente

Pré-requisitos: Node 20+, PostgreSQL acessível.

```bash
# backend
cd backend
cp .env.example .env        # preencha DATABASE_URL e JWT_SECRET; o resto é opcional
npm install                 # roda prisma generate no postinstall
npx prisma migrate deploy
npx prisma db seed          # cria o usuário "tecnico" (senha admin123, troque em produção)
npm run dev                 # http://localhost:3000

# frontend (outro terminal)
cd frontend
npm install
npm run dev                 # proxy para a API em /api
```

Build de produção via `Dockerfile` na raiz (multi-stage: build do frontend, build do backend, runtime com `prisma migrate deploy` no start).

### Variáveis de ambiente

Obrigatórias: `DATABASE_URL`, `JWT_SECRET`. Opcionais: `JWT_EXPIRES_IN`, `PORT`, `NODE_ENV`, `TZ` (padrão `America/Sao_Paulo`).

Bot de WhatsApp (todas opcionais; cada uma é checada no ponto de uso, não no boot): `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`. No frontend, `VITE_META_APP_ID` e `VITE_META_ES_CONFIG_ID` entram no bundle em tempo de build.

Detalhes em `backend/.env.example` e `frontend/.env.example`.

### Verificações

O projeto não usa framework de teste. A lógica pura mais sensível tem *self-checks* executáveis:

```bash
cd backend
npx tsx src/utils/dateLogic.selfcheck.ts          # corte de delivery, tolerância, fronteira de expediente
npx tsx src/modules/reports/reports.selfcheck.ts  # matemática de dinheiro e validação de período

cd frontend
node --experimental-strip-types scripts/periods.selfcheck.ts  # fronteiras de semana/mês/ano
```

Os testes de integração de cada fase foram feitos contra o servidor real e a saída está em `docs/verificacoes/`.

## API

```
POST   /api/auth/register | /login          público, com rate limit
GET    /api/public/menu | /neighborhoods | /config
POST   /api/public/orders                   sem login, rate limit estrito

GET    /api/orders                          escopo por papel
POST   /api/orders                          GARCOM, CHAPISTA, ADM, TI
PATCH  /api/orders/:id/status | /confirm | /accept | /problem

GET/POST/PATCH /api/menu, /api/neighborhoods, /api/config
GET/PATCH/DELETE /api/users                 ADM, TI
GET    /api/logs, /api/logs/export          TI
GET    /api/reports/summary                 ADM, TI
GET/POST /api/webhook/whatsapp              Meta
```

Tabela completa, transições de status por papel e limites de rate limit em `docs/CONTEXTO.md`, seção 7.

## Fases entregues

1 a 9: backend e frontend do núcleo. 10: backup e deploy. 11: fechamento agendado do trailer. 12: bairro personalizado em pedido interno. 13: webhook do WhatsApp. 14: loop com OpenAI e resposta real. 15: Embedded Signup e coexistência de número. 16: correções da primeira rodada de testes do bot.

Relatório de cada fase em `docs/relatorios/`.
