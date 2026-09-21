import axios from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Rotas cujo 401 é resposta normal de credencial errada, não sessão caindo
// -- nunca passaram a ter um token pra "expirar" em primeiro lugar. Sem essa
// exclusão, digitar senha errada no formulário disparava o mesmo
// logout+reload abaixo, apagando a mensagem de erro do handleLogin antes de
// ela aparecer na tela (achado ao investigar o bug do login rápido).
const ROTAS_SEM_LOGOUT_NO_401 = ['/auth/login', '/auth/register'];

// A tela autenticada dispara várias chamadas em paralelo (orders, inbox do
// whatsapp, etc.) -- um token ruim gera um 401 de CADA uma, quase ao mesmo
// tempo. Sem esta trava, a segunda entrada chama window.location.href de
// novo enquanto a primeira ainda está de saída, um reload atropelando o
// outro, e o handoff pro sessionStorage (lido só uma vez, no mount seguinte)
// se perde no meio da corrida.
let saindoPorSessaoInvalida = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string | undefined = error.config?.url;
    if (
      error.response?.status === 401 &&
      !(url && ROTAS_SEM_LOGOUT_NO_401.includes(url)) &&
      !saindoPorSessaoInvalida
    ) {
      saindoPorSessaoInvalida = true;
      // Token que parecia válido (não vencido, mas o servidor recusou --
      // senha trocada, usuário revogado) também deve cair na tela de login
      // pedindo a senha de novo, nunca em silêncio. Como o redirect abaixo é
      // um reload completo (apaga todo state React), o único jeito de levar
      // "qual usuário era" pro outro lado é sessionStorage.
      const username = useAuthStore.getState().user?.username;
      if (username) sessionStorage.setItem('bebs_reauth_hint', username);
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
