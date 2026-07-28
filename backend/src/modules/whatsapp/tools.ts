// Copiado literalmente de docs/bebs-burguer-bot-whatsapp-PROMPT.md, seção 2 --
// não alterar nenhum schema. strict:true exige additionalProperties:false e
// todo campo do properties listado em required (opcional = anyOf com null,
// continua "required"). Nenhuma keyword de validação de valor (minimum,
// pattern etc.) -- não é reforçada pelo modelo e pode rejeitar a requisição.
export const TOOLS = [
  {
    "type": "function",
    "function": {
      "name": "criar_pedido",
      "description": "Cria um pedido confirmado no sistema do Beb's Burguer. Só chamar depois que o cliente confirmou explicitamente o resumo completo do pedido.",
      "strict": true,
      "parameters": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "tipo": { "type": "string", "enum": ["RETIRADA", "DELIVERY"] },
          "nome_cliente": {
            "type": "string",
            "description": "Nome pra chamar na retirada ou identificar na entrega"
          },
          "bairro": {
            "anyOf": [{ "type": "string" }, { "type": "null" }],
            "description": "Nome exato do bairro, obrigatório (não-null) se tipo=DELIVERY. null se tipo=RETIRADA."
          },
          "endereco": {
            "anyOf": [{ "type": "string" }, { "type": "null" }],
            "description": "Endereço completo, obrigatório (não-null) se tipo=DELIVERY. null se tipo=RETIRADA."
          },
          "itens": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "nome_item": { "type": "string", "description": "Nome exato do item no cardápio fornecido" },
                "quantidade": {
                  "type": "integer",
                  "description": "Número inteiro positivo. O servidor sempre revalida — nunca confie cegamente neste valor."
                },
                "escolha_obrigatoria": {
                  "anyOf": [{ "type": "string" }, { "type": "null" }],
                  "description": "Preencher só se o item tiver requiredChoice no cardápio (ex: sabor de queijo, tipo de molho). null se o item não exigir escolha."
                },
                "adicionais": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                      "nome_adicional": { "type": "string" },
                      "quantidade": { "type": "integer" }
                    },
                    "required": ["nome_adicional", "quantidade"]
                  }
                },
                "observacoes": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
              },
              "required": ["nome_item", "quantidade", "escolha_obrigatoria", "adicionais", "observacoes"]
            }
          },
          "forma_pagamento": { "type": "string", "enum": ["DINHEIRO", "PIX", "CREDITO", "DEBITO"] },
          "valor_pago_dinheiro": {
            "anyOf": [{ "type": "number" }, { "type": "null" }],
            "description": "Obrigatório (não-null) só se forma_pagamento=DINHEIRO. É a nota que o cliente vai entregar, não o troco em si."
          }
        },
        "required": ["tipo", "nome_cliente", "bairro", "endereco", "itens", "forma_pagamento", "valor_pago_dinheiro"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "consultar_pedido_ativo",
      "description": "Consulta o(s) pedido(s) em aberto do cliente atual. Pode retornar mais de um pedido — ver seção 2.1.",
      "strict": true,
      "parameters": { "type": "object", "additionalProperties": false, "properties": {}, "required": [] }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "transferir_para_humano",
      "description": "Passa a conversa para um atendente humano e SILENCIA o bot. Chamar quando: bairro fora da lista de entrega, pedido agendado, reclamação, ou qualquer coisa fora do fluxo normal de pedido. Depois de chamar, não responda mais nada nesta conversa.",
      "strict": true,
      "parameters": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "motivo": {
            "type": "string",
            "enum": ["BAIRRO_FORA_DA_LISTA", "PEDIDO_AGENDADO", "RECLAMACAO", "OUTRO"]
          },
          "resumo": {
            "type": "string",
            "description": "Uma frase pro atendente entender o contexto sem ler a conversa toda."
          }
        },
        "required": ["motivo", "resumo"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "cancelar_pedido_ativo",
      "description": "Cancela um pedido específico do cliente atual, identificado por número. Só é aceito pelo backend se o pedido ainda estiver aguardando preparo — a checagem é atômica (ver seção 2.1).",
      "strict": true,
      "parameters": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "numero_pedido": { "type": "integer", "description": "Obtido via consultar_pedido_ativo antes de cancelar." },
          "motivo": { "type": "string" }
        },
        "required": ["numero_pedido", "motivo"]
      }
    }
  }
];
