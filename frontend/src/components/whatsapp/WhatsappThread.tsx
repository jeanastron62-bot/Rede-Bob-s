import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { useWhatsappThreadStore, type ThreadMessage } from '../../stores/useWhatsappThreadStore';
import type { InboxConversation } from '../../stores/useWhatsappInboxStore';
import { displayName } from './WhatsappInbox';

const MOTIVO_LABEL: Record<string, string> = {
  BAIRRO_FORA_DA_LISTA: 'Bairro fora da lista',
  PEDIDO_AGENDADO: 'Pedido agendado',
  RECLAMACAO: 'Reclamação',
  CLIENTE_PEDIU_ATENDENTE: 'Cliente pediu atendente',
  OUTRO: 'Outro',
  JSON_LEAK: 'Falha do bot — ação não executada',
  TOOL_LOOP_EXHAUSTED: 'Falha do bot — travou tentando',
};

// Fase 17.4 -- regra de EXIBIÇÃO, não escreve nada no banco (ver comentário
// em whatsapp.service.ts, getConversationMessages). PENDENTE recente é
// "enviando", só depois de 5 minutos sem confirmação da Graph é que o
// atendente precisa saber que pode não ter chegado -- antes disso é spinner
// eterno seria enganoso na direção contrária (parece que travou quando só
// está demorando o normal).
const LIMIAR_NAO_SEI_SE_CHEGOU_MS = 5 * 60_000;

function statusLabel(m: ThreadMessage, agora: number): { texto: string; alerta: boolean } | null {
  if (m.direction !== 'OUT' || !m.deliveryStatus) return null; // nulo = anterior à correção, trata como entregue
  if (m.deliveryStatus === 'FALHOU') return { texto: 'não entregue' + (m.failureReason ? ` — ${m.failureReason}` : ''), alerta: true };
  if (m.deliveryStatus === 'PENDENTE') {
    const idadeMs = agora - new Date(m.createdAt).getTime();
    return idadeMs > LIMIAR_NAO_SEI_SE_CHEGOU_MS
      ? { texto: 'não sei se chegou', alerta: true }
      : { texto: 'enviando…', alerta: false };
  }
  return null; // ENVIADA -- caso normal, sem rótulo
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  conversation: InboxConversation;
  onBack: () => void;
  onResume: (id: number) => void;
  resuming: boolean;
}

export function WhatsappThread({ conversation, onBack, onResume, resuming }: Props) {
  const {
    messages,
    hasMore,
    isLoading,
    isSending,
    loadError,
    sendError,
    windowExpiresAt,
    openThread,
    closeThread,
    loadOlder,
    sendReply,
  } = useWhatsappThreadStore();
  const [text, setText] = useState('');
  const [agora, setAgora] = useState(() => Date.now());
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Três casos de scroll, achados testando de verdade num navegador (a
  // versão anterior só tratava o caso 2 e olhava um scrollHeight que nunca
  // ficava maior que o próprio container -- ver docs/verificacoes):
  //   1) primeira carga da thread -> vai pro fundo (última mensagem).
  //   2) mensagem nova no fim (enviada ou recebida) -> vai pro fundo de novo.
  //   3) "carregar anteriores" prependeu mensagens no topo -> a posição
  //      visual NÃO pode pular; compensa pela altura que entrou.
  const carregandoAnterioresRef = useRef(false);
  const alturaAntesRef = useRef(0);
  const topoAntesRef = useRef(0);

  useEffect(() => {
    openThread(conversation.id);
    return () => closeThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Reavalia "não sei se chegou" com o tempo passando, sem depender de
  // mensagem nova chegar pra re-renderizar.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // useLayoutEffect, não useEffect: roda ANTES do navegador pintar, então o
  // atendente nunca vê o "flash" do topo da conversa antes de saltar pro
  // fundo -- com useEffect isso era visível por um instante em conexão lenta.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (carregandoAnterioresRef.current) {
      carregandoAnterioresRef.current = false;
      el.scrollTop = topoAntesRef.current + (el.scrollHeight - alturaAntesRef.current);
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleLoadOlder = async () => {
    const el = listRef.current;
    if (el) {
      alturaAntesRef.current = el.scrollHeight;
      topoAntesRef.current = el.scrollTop;
    }
    carregandoAnterioresRef.current = true;
    setLoadingOlder(true);
    try {
      await loadOlder();
    } finally {
      setLoadingOlder(false);
    }
  };

  const janelaFechada = conversation.windowExpiresAt
    ? new Date(conversation.windowExpiresAt).getTime() <= Date.now()
    : true;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    const ok = await sendReply(trimmed);
    if (ok) setText('');
  };

  return (
    // Fase 17.4 (correção) -- raiz precisa ser fixed inset-0, não h-full
    // dentro do fluxo normal da página. Testado de verdade: sem isso, o
    // ancestral (PanelLayout -> main) usa min-h-screen (altura MÍNIMA, não
    // fixa), então h-full nunca fica realmente limitado -- o container de
    // mensagens abaixo (flex-1 overflow-y-auto) cresce pra caber o conteúdo
    // em vez de criar overflow interno, e é a PÁGINA que rola, não a lista.
    // scrollTo/scrollTop no listRef não fazia nada visível: o elemento nunca
    // ficava mais alto que o próprio conteúdo. fixed inset-0 dá um contexto
    // de altura de verdade (a viewport), então flex-1 realmente estoura e
    // overflow-y-auto realmente rola -- é o que os dois requisitos de scroll
    // desta correção (abrir no fundo, preservar posição ao carregar
    // anteriores) precisam pra funcionar. z-40: abaixo do Modal (z-50), que
    // ainda precisa aparecer por cima se abrir com a thread em tela.
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950">
      <div className="flex items-center gap-3 border-b border-neutral-850 p-4">
        <button
          onClick={onBack}
          aria-label="Voltar pra lista"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-850 text-neutral-300 hover:text-white"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold text-white">{displayName(conversation)}</span>
          {conversation.handoffMotivo && (
            <span className="w-fit rounded-full border border-amber-900/60 bg-amber-950/40 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-amber-300">
              {MOTIVO_LABEL[conversation.handoffMotivo] ?? conversation.handoffMotivo}
            </span>
          )}
        </div>
        {conversation.botPaused && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => onResume(conversation.id)}
            disabled={resuming}
            className="shrink-0"
          >
            {resuming ? 'Retomando...' : 'Retomar bot'}
          </Button>
        )}
      </div>

      {conversation.handoffResumo && (
        <p className="border-b border-neutral-850 px-4 py-2 text-sm text-neutral-400">{conversation.handoffResumo}</p>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading && messages.length === 0 && <p className="text-center text-sm text-neutral-500">Carregando...</p>}
        {loadError && <p className="text-center text-sm text-red-400">{loadError}</p>}

        {hasMore && (
          <div className="mb-3 flex justify-center">
            <button
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="flex h-12 items-center gap-2 rounded-xl bg-neutral-850 border border-neutral-750 px-4 text-sm text-neutral-300 hover:text-white disabled:opacity-50"
            >
              <ArrowUp size={16} />
              {loadingOlder ? 'Carregando...' : 'Carregar mensagens anteriores'}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {messages.map((m) => {
            const status = statusLabel(m, agora);
            const isOut = m.direction === 'OUT';
            return (
              <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    isOut ? 'bg-primary/20 border border-primary/30' : 'bg-neutral-850 border border-neutral-750'
                  }`}
                >
                  {isOut && m.sentByName && (
                    <p className="text-xs font-mono font-bold uppercase tracking-wider text-primary/80">
                      {m.sentByName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-white">{m.content ?? '(sem texto)'}</p>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    {status && (
                      <span className={`text-xs ${status.alerta ? 'text-amber-400' : 'text-neutral-500'}`}>
                        {status.texto}
                      </span>
                    )}
                    <span className="text-xs text-neutral-600">{horaCurta(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-neutral-850 p-4">
        {janelaFechada ? (
          <p className="rounded-xl bg-neutral-900 border border-neutral-800 p-3 text-sm text-neutral-500">
            Passou de 24h desde a última mensagem do cliente. Só ele pode reabrir a conversa — não é possível
            enviar por aqui agora.
          </p>
        ) : (
          <>
            {sendError && (
              <p className="mb-2 rounded-xl bg-red-950/40 border border-red-900/60 p-2 text-sm text-red-300">
                {sendError}
                {windowExpiresAt && ' A janela fechou enquanto você digitava.'}
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Escreva a resposta..."
                rows={1}
                className="min-h-[48px] flex-1 resize-none rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none"
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleSend}
                disabled={isSending || !text.trim()}
                aria-label="Enviar resposta"
                className="!px-4"
              >
                <Send size={20} />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
