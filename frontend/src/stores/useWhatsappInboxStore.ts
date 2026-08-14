import { create } from 'zustand';
import { api } from '../services/api';

export interface PausedConversation {
  id: number;
  phone: string;
  lastInboundAt: string | null;
  humanRepliedAt: string | null;
  handoffMotivo: string | null;
  handoffResumo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WhatsappHandoffEvent {
  conversationId: number;
  phone: string;
  motivo: string | null;
  resumo: string | null;
}

interface WhatsappInboxState {
  conversations: PausedConversation[];
  isLoading: boolean;
  error: string | null;
  fetchPaused: () => Promise<void>;
  addHandoff: (event: WhatsappHandoffEvent) => void;
  removeConversation: (id: number) => void;
}

export const useWhatsappInboxStore = create<WhatsappInboxState>((set) => ({
  conversations: [],
  isLoading: false,
  error: null,

  fetchPaused: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<PausedConversation[]>('/webhook/whatsapp/conversations/paused');
      set({ conversations: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Erro ao carregar conversas pausadas.', isLoading: false });
    }
  },

  // Evento em tempo real -- o GET inicial pode ter rodado antes desse
  // handoff acontecer; sem isso a conversa só aparece no próximo reload.
  addHandoff: (event) =>
    set((state) => {
      if (state.conversations.some((c) => c.id === event.conversationId)) return state;
      const now = new Date().toISOString();
      return {
        conversations: [
          {
            id: event.conversationId,
            phone: event.phone,
            lastInboundAt: now,
            humanRepliedAt: null,
            handoffMotivo: event.motivo,
            handoffResumo: event.resumo,
            createdAt: now,
            updatedAt: now,
          },
          ...state.conversations,
        ],
      };
    }),

  removeConversation: (id) =>
    set((state) => ({ conversations: state.conversations.filter((c) => c.id !== id) })),
}));
