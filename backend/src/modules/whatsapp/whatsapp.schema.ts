import { z } from 'zod';

// Fase 15.3 -- o POST de conexão junta duas origens diferentes na mesma
// requisição: o `code` vem do callback do FB.login e o `wabaId` do evento de
// sessão que o popup manda por postMessage. Os dois são obrigatórios -- sem
// wabaId não há o que consultar no Graph, e o `code` é de uso único: gastá-lo
// numa requisição que já nasce incompleta obriga a refazer o Embedded Signup
// inteiro, com a dona e o celular do trailer presentes.
export const connectWhatsappSchema = z.object({
  code: z.string().min(1),
  wabaId: z.string().min(1),
  // Opcional e de uso restrito: só o nome do evento (pra saber se o fluxo foi
  // o de coexistência) e o phone_number_id (usado apenas como SELETOR dentro
  // da lista que a API devolve -- nunca acreditado como verdade, ver
  // fetchWabaPhoneNumber).
  sessionInfo: z
    .object({
      event: z.string().optional(),
      data: z
        .object({
          waba_id: z.string().optional(),
          phone_number_id: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type ConnectWhatsappInput = z.infer<typeof connectWhatsappSchema>;
