import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { useWhatsappInboxStore } from '../../stores/useWhatsappInboxStore';

const MOTIVO_LABEL: Record<string, string> = {
  BAIRRO_FORA_DA_LISTA: 'Bairro fora da lista',
  PEDIDO_AGENDADO: 'Pedido agendado',
  RECLAMACAO: 'Reclamação',
  CLIENTE_PEDIU_ATENDENTE: 'Cliente pediu atendente',
  // OUTRO saiu do enum da tool (era o coringa que o modelo usava pra escalar
  // por conveniência); fica aqui só pra rotular conversa pausada antes disso.
  OUTRO: 'Outro',
};

function timeSince(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

export function WhatsappInbox() {
  const { conversations, isLoading, error, fetchPaused, removeConversation } = useWhatsappInboxStore();
  const [resumingId, setResumingId] = useState<number | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => { fetchPaused(); }, [fetchPaused]);

  const handleResume = async (id: number) => {
    setResumingId(id);
    setResumeError(null);
    try {
      await api.patch(`/webhook/whatsapp/conversations/${id}/resume`);
      removeConversation(id);
    } catch (err: any) {
      setResumeError(err.response?.data?.error || 'Erro ao retomar o bot.');
    } finally {
      setResumingId(null);
    }
  };

  if (isLoading) return <p className="text-neutral-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="border-b border-neutral-850 pb-4">
        <h3 className="text-lg font-black text-white font-display">Atendimento</h3>
        <p className="text-xs font-mono text-neutral-500">
          Conversas paradas esperando um humano depois de transferir_para_humano
        </p>
      </div>

      {(error || resumeError) && (
        <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">
          {error || resumeError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {conversations.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-neutral-900 border border-neutral-850 p-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{c.phone}</span>
                {c.handoffMotivo && (
                  <span className="rounded-full border border-amber-900/60 bg-amber-950/40 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-amber-300">
                    {MOTIVO_LABEL[c.handoffMotivo] ?? c.handoffMotivo}
                  </span>
                )}
              </div>
              {c.handoffResumo && <p className="text-sm text-neutral-400">{c.handoffResumo}</p>}
              <p className="text-xs font-mono text-neutral-600">pausada {timeSince(c.updatedAt)}</p>
            </div>
            <Button variant="secondary" size="md" onClick={() => handleResume(c.id)} disabled={resumingId === c.id}>
              {resumingId === c.id ? 'Retomando...' : 'Retomar bot'}
            </Button>
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-500">Nenhuma conversa esperando atendente.</p>
        )}
      </div>
    </div>
  );
}
