import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Check, Clock, HelpCircle, AlertTriangle, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { useWhatsappThreadStore, type ThreadMessage } from '../../stores/useWhatsappThreadStore';
import type { InboxConversation } from '../../stores/useWhatsappInboxStore';
import { displayName } from './WhatsappInbox';
import { horaCurta, separadorData } from '../../utils/chatDate';

const MOTIVO_LABEL: Record<string, string> = {
  BAIRRO_FORA_DA_LISTA: 'Bairro fora da lista',
  PEDIDO_AGENDADO: 'Pedido agendado',
  RECLAMACAO: 'Reclamação',
  CLIENTE_PEDIU_ATENDENTE: 'Cliente pediu atendente',
  OUTRO: 'Outro',
  JSON_LEAK: 'Falha do bot — ação não executada',
  TOOL_LOOP_EXHAUSTED: 'Falha do bot — travou tentando',
};

// Fase 17.4 (visual) -- regra de EXIBIÇÃO, não escreve nada no banco (ver
// comentário em whatsapp.service.ts, getConversationMessages). PENDENTE
// recente é "enviando", só depois de 5 minutos sem confirmação da Graph é
// que o atendente precisa saber que pode não ter chegado -- antes disso um
// alerta seria enganoso na direção contrária (parece que travou quando só
// está demorando o normal).
const LIMIAR_NAO_SEI_SE_CHEGOU_MS = 5 * 60_000;

type StatusIcone = {
  Icon: typeof Check;
  cor: string;
  rotulo: string; // acessibilidade (aria-label) -- o ícone não fala por si só
  tocavel: boolean; // só FALHOU expande motivo ao tocar
};

function statusIcone(m: ThreadMessage, agora: number): StatusIcone | null {
  if (m.direction !== 'OUT' || !m.deliveryStatus) return null; // nulo = anterior à correção, trata como entregue
  if (m.deliveryStatus === 'FALHOU') {
    return { Icon: AlertTriangle, cor: 'text-red-400', rotulo: 'Falha no envio — toque para ver o motivo', tocavel: true };
  }
  if (m.deliveryStatus === 'PENDENTE') {
    const idadeMs = agora - new Date(m.createdAt).getTime();
    return idadeMs > LIMIAR_NAO_SEI_SE_CHEGOU_MS
      ? { Icon: HelpCircle, cor: 'text-amber-400', rotulo: 'Não sei se chegou', tocavel: false }
      : { Icon: Clock, cor: 'text-neutral-500', rotulo: 'Enviando', tocavel: false };
  }
  return { Icon: Check, cor: 'text-neutral-500', rotulo: 'Enviada', tocavel: false }; // ENVIADA
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
  // Motivo da falha só aparece ao TOCAR no ícone (mobile não tem hover) --
  // um id por vez, guardado aqui em vez de por mensagem, porque só uma
  // explicação precisa estar aberta.
  const [falhaExpandidaId, setFalhaExpandidaId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Textarea cresce com o texto até ~4 linhas, depois rola por dentro (a
  // altura máxima é CSS, max-h-[120px]; isto só ajusta a altura ATUAL pro
  // conteúdo, sem passar do teto). 'auto' antes de medir scrollHeight,
  // senão a altura anterior conta como piso e o campo nunca encolhe ao
  // apagar texto.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

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
          {messages.map((m, i) => {
            const anterior = messages[i - 1];
            // Separador de dia: só quando o rótulo muda da mensagem anterior
            // pra esta -- nunca recalculado por posição fixa, porque
            // "carregar anteriores" pode inserir um dia novo no meio.
            const rotuloDia = separadorData(m.createdAt);
            const mostraSeparador = !anterior || separadorData(anterior.createdAt) !== rotuloDia;

            const status = statusIcone(m, agora);
            const isOut = m.direction === 'OUT';
            const isBot = isOut && !m.sentByName;
            const falhouExpandido = falhaExpandidaId === m.id;

            // Fase 17.4 (visual) -- três tons, nenhum deles imita o WhatsApp:
            // IN usa o neutro de card já convencionado (bg-neutral-850);
            // OUT da equipe deriva da brasa, discreto (bg-primary/15); OUT do
            // bot é outro neutro, mais claro (bg-neutral-800), pra equipe
            // distinguir quem respondeu SEM precisar ler o rótulo.
            const corBalao = !isOut
              ? 'bg-neutral-850 border border-neutral-750'
              : isBot
                ? 'bg-neutral-800 border border-neutral-700'
                : 'bg-primary/15 border border-primary/30';
            // Canto do lado de quem enviou, menos arredondado -- a "ponta"
            // do balão, convenção de app de conversa (não é imitar o
            // WhatsApp, é a mesma gramática visual que qualquer app do tipo
            // usa, que os funcionários já reconhecem).
            const cantoBalao = isOut ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md';

            return (
              <div key={m.id}>
                {mostraSeparador && (
                  <div className="my-3 flex items-center justify-center">
                    <span className="rounded-full bg-neutral-900 px-3 py-1 font-mono text-xs uppercase tracking-wider text-neutral-500">
                      {rotuloDia}
                    </span>
                  </div>
                )}
                <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 ${cantoBalao} ${corBalao}`}>
                    {isOut && (
                      <p
                        className={`text-xs font-mono font-bold uppercase tracking-wider ${isBot ? 'text-neutral-500' : 'text-primary/80'}`}
                      >
                        {isBot ? 'Beb (bot)' : m.sentByName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-white">{m.content ?? '(sem texto)'}</p>
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      {status && (
                        <button
                          type="button"
                          aria-label={status.rotulo}
                          disabled={!status.tocavel}
                          onClick={() => status.tocavel && setFalhaExpandidaId(falhouExpandido ? null : m.id)}
                          className={`flex items-center justify-center rounded p-0.5 ${status.cor} ${status.tocavel ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <status.Icon size={13} />
                        </button>
                      )}
                      <span className="font-mono text-xs text-neutral-600">{horaCurta(m.createdAt)}</span>
                    </div>
                    {/* Motivo da falha só ao tocar no ícone -- não ocupa
                        espaço nas outras mensagens, e não depende de hover
                        (celular não tem). */}
                    {falhouExpandido && m.failureReason && (
                      <p className="mt-1 border-t border-red-900/40 pt-1 text-xs text-red-400">{m.failureReason}</p>
                    )}
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
                ref={textareaRef}
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
                className="max-h-[120px] min-h-[48px] flex-1 resize-none overflow-y-auto rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none"
              />
              {/* Redondo, min 48px -- diferente do Button padrão (rounded-xl,
                  quadrado), pedido explícito pro botão de enviar aqui. */}
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !text.trim()}
                aria-label="Enviar resposta"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary border border-primary/40 text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
