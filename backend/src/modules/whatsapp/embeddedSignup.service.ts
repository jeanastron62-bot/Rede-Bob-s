import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { createLog } from '../../utils/logger';
import { encryptToken } from '../../utils/tokenCrypto';
import { JwtPayload } from '../../middleware/auth';

// FASE 15.3 -- NÃO TESTADO AO VIVO. Escrito a partir do esqueleto do doc de
// fase + documentação pública da Meta buscada em 2026-08-06 (ver
// docs/relatorios/FASE-15_embedded-signup-coexistence_EM-ANDAMENTO.txt).
// O endpoint de troca de código (oauth/access_token) é o padrão estável do
// Graph API (usado por todo fluxo de Facebook Login há anos, não é
// específico do Embedded Signup) -- mas não pôde ser confirmado contra uma
// chamada real nesta sessão por falta de META_APP_ID/Config ID reais. Antes
// de considerar esta fase concluída, rodar de ponta a ponta com uma WABA de
// teste e corrigir o que a resposta real da Meta divergir daqui.
const GRAPH_VERSION = 'v21.0';

interface SessionInfo {
  event?: string;
  data?: { waba_id?: string; phone_number_id?: string; business_id?: string };
}

interface ConnectInput {
  code: string;
  sessionInfo?: SessionInfo;
}

// META_APP_ID/META_APP_SECRET garantidos presentes aqui -- único chamador
// (connectBusinessAccount) valida antes de chegar neste ponto.
async function exchangeCodeForToken(code: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('client_id', env.META_APP_ID!);
  url.searchParams.set('client_secret', env.META_APP_SECRET!);
  url.searchParams.set('code', code);

  const response = await fetch(url.toString());
  const result: any = await response.json();
  if (!response.ok || !result.access_token) {
    throw { status: 502, message: `Falha ao trocar código por token no Graph API: ${JSON.stringify(result)}` };
  }
  return result.access_token as string;
}

async function fetchWabaPhoneNumber(wabaId: string, accessToken: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/phone_numbers`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const result: any = await response.json();
  if (!response.ok || !result.data?.length) {
    throw { status: 502, message: `Falha ao buscar números da WABA ${wabaId}: ${JSON.stringify(result)}` };
  }
  // Uma WABA pode ter mais de um número; este projeto assume um número por
  // conexão (mesmo modelo de "um estabelecimento" que o resto do sistema já
  // assume -- ver "Fora de escopo" do doc de fase sobre multi-tenant real).
  const phone = result.data[0];
  return {
    phoneNumberId: phone.id as string,
    displayPhoneNumber: (phone.display_phone_number as string | undefined) ?? null,
    verifiedName: (phone.verified_name as string | undefined) ?? null,
  };
}

async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const result = await response.json();
    throw { status: 502, message: `Falha ao assinar webhooks da WABA ${wabaId}: ${JSON.stringify(result)}` };
  }
}

export async function connectBusinessAccount(input: ConnectInput, user: JwtPayload) {
  // Opcionais no envSchema de propósito (ver env.ts) -- checados aqui, no
  // único ponto de entrada desta funcionalidade, não no boot do servidor.
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.WHATSAPP_TOKEN_ENCRYPTION_KEY) {
    throw {
      status: 501,
      message:
        'Conexão de WhatsApp ainda não configurada neste ambiente (faltam META_APP_ID / META_APP_SECRET / WHATSAPP_TOKEN_ENCRYPTION_KEY).',
    };
  }
  const wabaId = input.sessionInfo?.data?.waba_id;
  if (!wabaId) {
    throw { status: 400, message: 'sessionInfo sem waba_id -- fluxo de Embedded Signup incompleto ou cancelado.' };
  }
  // Coexistence identificado pelo evento de sessão (FASE-15.0/pesquisa de doc,
  // 2026-08-06) -- version: 3 confirmado na doc atual, não usado aqui porque
  // o nome do evento já é suficiente pra decidir o branch.
  const isCoexistence = input.sessionInfo?.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';

  const accessToken = await exchangeCodeForToken(input.code);
  // Nunca confiar no phoneNumberId/nome que o FRONTEND alega -- busca de
  // verdade na API, usando o token recém-trocado, que só tem acesso ao que
  // foi de fato concedido nesta conexão (FASE-15.3, passo 3 do doc).
  const { phoneNumberId, displayPhoneNumber, verifiedName } = await fetchWabaPhoneNumber(wabaId, accessToken);

  // Coexistence: o número já chega registrado (veio do app WhatsApp
  // Business) -- não existe chamada de "registrar número" a fazer aqui em
  // nenhum dos dois casos nesta implementação (fora de Coexistence, o
  // registro acontece dentro do próprio popup do Embedded Signup, não é uma
  // chamada server-to-server separada que este service precise disparar).
  await subscribeAppToWaba(wabaId, accessToken);

  const account = await prisma.whatsappBusinessAccount.upsert({
    where: { wabaId },
    update: {
      phoneNumberId,
      displayPhoneNumber,
      verifiedName,
      accessToken: encryptToken(accessToken),
      isCoexistence,
      active: true,
      connectedByName: user.username,
    },
    create: {
      wabaId,
      phoneNumberId,
      displayPhoneNumber,
      verifiedName,
      accessToken: encryptToken(accessToken),
      isCoexistence,
      connectedByName: user.username,
    },
  });

  await createLog(prisma, {
    userId: user.userId,
    username: user.username,
    action: 'WHATSAPP_WABA_CONNECTED',
    details: { wabaId, phoneNumberId, isCoexistence },
  });

  const { accessToken: _omit, ...safeAccount } = account;
  return safeAccount;
}

export async function getActiveBusinessAccount() {
  const account = await prisma.whatsappBusinessAccount.findFirst({ where: { active: true } });
  if (!account) return null;
  const { accessToken: _omit, ...safeAccount } = account;
  return safeAccount;
}

export async function disconnectBusinessAccount(id: number, user: JwtPayload) {
  const account = await prisma.whatsappBusinessAccount.update({
    where: { id },
    data: { active: false },
  });

  await createLog(prisma, {
    userId: user.userId,
    username: user.username,
    action: 'WHATSAPP_WABA_DISCONNECTED',
    details: { wabaId: account.wabaId },
  });

  const { accessToken: _omit, ...safeAccount } = account;
  return safeAccount;
}
