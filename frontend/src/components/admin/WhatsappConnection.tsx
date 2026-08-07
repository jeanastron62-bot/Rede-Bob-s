import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';

interface WhatsappBusinessAccount {
  id: number;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  isCoexistence: boolean;
  active: boolean;
}

interface EmbeddedSignupSession {
  type?: string;
  event?: string;
  data?: { waba_id?: string; phone_number_id?: string; business_id?: string };
}

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>
      ) => void;
    };
  }
}

// Públicos por natureza (aparecem no bundle do navegador) -- App ID e Config
// ID do Facebook Login não são segredo, diferente do App Secret, que nunca
// sai do backend (ver embeddedSignup.service.ts).
const APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined;
const CONFIG_ID = import.meta.env.VITE_META_ES_CONFIG_ID as string | undefined;

// SDK carregado sob demanda, só quando esta aba monta -- não em index.html,
// pra não pesar no bundle/carregamento do cardápio público (regra do
// projeto: nenhum painel entra no caminho de carregamento do cliente final).
function loadFacebookSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: APP_ID!, cookie: true, xfbml: false, version: 'v21.0' });
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Falha ao carregar o SDK do Facebook.'));
    document.body.appendChild(script);
  });
}

export function WhatsappConnection() {
  const [account, setAccount] = useState<WhatsappBusinessAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Última sessão de Embedded Signup capturada pelo listener abaixo -- ref,
  // não state, porque só o clique de login/callback do FB precisa ler o
  // valor mais recente, não precisa disparar novo render.
  const lastSessionRef = useRef<EmbeddedSignupSession | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<WhatsappBusinessAccount | null>('/webhook/whatsapp/business-account');
      setAccount(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar status da conexão.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Fase 15.2 -- session logging do Embedded Signup: exigência da Meta, não
  // log de debug opcional. Filtra por origem do Facebook antes de processar
  // qualquer coisa (postMessage recebe de qualquer origem por padrão).
  useEffect(() => {
    function handleSessionMessage(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return;
      let data: EmbeddedSignupSession;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // não é payload JSON do fluxo de Embedded Signup -- ignora.
      }
      if (data.type !== 'WA_EMBEDDED_SIGNUP') return;
      console.log('[WHATSAPP_EMBEDDED_SIGNUP_SESSION]', data);
      lastSessionRef.current = data;
    }
    window.addEventListener('message', handleSessionMessage);
    return () => window.removeEventListener('message', handleSessionMessage);
  }, []);

  const finishConnect = async (code: string) => {
    try {
      const { data } = await api.post<WhatsappBusinessAccount>('/webhook/whatsapp/connect', {
        code,
        sessionInfo: lastSessionRef.current,
      });
      setAccount(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao concluir a conexão.');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    if (!APP_ID || !CONFIG_ID) {
      setError(
        'VITE_META_APP_ID / VITE_META_ES_CONFIG_ID não configurados neste ambiente. ' +
          'Crie a Configuration do Embedded Signup no painel do Meta for Developers e preencha o .env do frontend antes de conectar.'
      );
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await loadFacebookSdk();
      window.FB!.login(
        (response) => {
          const code = response?.authResponse?.code;
          if (!code) {
            setConnecting(false); // usuário fechou o popup sem concluir
            return;
          }
          finishConnect(code);
        },
        {
          config_id: CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {} },
        }
      );
    } catch {
      setConnecting(false);
      setError('Não foi possível carregar o SDK do Facebook.');
    }
  };

  const handleDisconnect = async () => {
    if (!account) return;
    setError(null);
    try {
      const { data } = await api.patch<WhatsappBusinessAccount>(
        `/webhook/whatsapp/business-account/${account.id}/disconnect`
      );
      setAccount(data.active ? data : null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao desconectar.');
    }
  };

  if (loading) return <p className="text-neutral-500">Carregando...</p>;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="border-b border-neutral-850 pb-4">
        <h3 className="text-lg font-black text-white font-display">WhatsApp</h3>
        <p className="text-xs font-mono text-neutral-500">Conexão da conta do WhatsApp Business (Embedded Signup)</p>
      </div>

      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}

      {!account?.active ? (
        <div className="flex flex-col gap-3 rounded-xl bg-neutral-900 border border-neutral-850 p-4">
          <p className="text-sm text-neutral-400">
            Nenhum WhatsApp conectado. O dono do número precisa estar logado no Facebook dele pra concluir a conexão.
          </p>
          <Button size="lg" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Conectando...' : 'Conectar WhatsApp'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl bg-neutral-900 border border-neutral-850 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-white">{account.verifiedName ?? 'Número conectado'}</p>
              <p className="font-mono text-sm text-neutral-400">{account.displayPhoneNumber ?? account.phoneNumberId}</p>
            </div>
            {account.isCoexistence && (
              <span className="rounded-full border border-emerald-900/60 bg-emerald-950/40 px-3 py-1 font-mono text-xs uppercase tracking-wider text-emerald-300">
                Coexistence
              </span>
            )}
          </div>
          <Button variant="secondary" size="md" onClick={handleDisconnect}>
            Desconectar
          </Button>
        </div>
      )}
    </div>
  );
}
