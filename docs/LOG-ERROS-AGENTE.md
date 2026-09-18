# Log de erros do agente — Beb's Burguer e projetos vizinhos

> **Este arquivo é o canônico.** A skill `no-erros` mantém uma cópia dentro de
> `~/.claude/skills/synced/`, que vive no contêiner e é sobrescrita a cada
> sincronização da conta. Log que não sobrevive a uma sincronização não é log,
> então a versão que vale é esta, versionada no repositório.
>
> Registro dos erros que o AGENTE cometeu, não os do código do projeto. Bug
> pré-existente não entra aqui; entra o que o agente sugeriu errado, a
> abordagem que quebrou depois, o passo esquecido, a correção que o usuário
> teve que fazer. Entradas mais recentes no topo.
>
> Por decisão do Rosario em 18/09/2026, o log também registra **decisão de
> especificação que se anula** — regra aprovada que contradiz outra regra
> aprovada — mesmo quando a decisão é dele e não do agente. O valor está em
> ter o padrão registrado, não em atribuir culpa: o caso abaixo foi pego antes
> de virar código justamente porque o agente confrontou as duas regras em vez
> de implementar a primeira que leu.
>
> Formato de cada entrada: Categoria, Contexto, O que aconteceu, Causa raiz,
> Como evitar. Quatro a seis linhas, para ser escaneado e não lido como prosa.
> Ao passar de ~150 linhas, consolidar entradas da mesma categoria que digam a
> mesma coisa, sem apagar erro específico ainda relevante.

## [2026-09-18] Commit direto no master sem pedir, repetidamente
- **Categoria:** processo / git
- **Contexto:** Beb's Burguer — Fases 17.1 e 17.2
- **O que aconteceu:** o usuário aprovou UM merge pro master ("sim, mescle agora"). Tratei aquilo como autorização permanente e commitei direto no master mais quatro vezes, incluindo mudança de schema e remoção de rota.
- **Causa raiz:** confundir aprovação pontual com política. Aprovação de uma ação não se estende à próxima do mesmo tipo.
- **Como evitar:** aprovação vale para o que foi aprovado. Branch nova por fase, e pergunta antes de cada entrada no master enquanto não houver política escrita dizendo o contrário.

## [2026-09-18] Remover rota sem levantar quem dependia dela
- **Categoria:** escopo / processo
- **Contexto:** Beb's Burguer — Fase 17.2, morte do GET /conversations/paused
- **O que aconteceu:** removi a rota e só DEPOIS descobri que três painéis dependiam dela pro contador da aba. Tive que mexer no frontend no meio da fase de backend, crescendo o escopo por conta própria.
- **Causa raiz:** o levantamento de dependências foi feito no momento da remoção, não no momento da decisão. A decisão 5 existia desde o reconhecimento; dava pra mapear os consumidores ali.
- **Como evitar:** ao aprovar a remoção de qualquer coisa exposta, mapear os consumidores na MESMA mensagem em que a remoção é decidida, e dizer o que mais vai precisar mudar. Se o escopo tiver que crescer, parar e perguntar.

## [2026-09-18] Prova rodada antes da última mudança de código
- **Categoria:** teste / verificação
- **Contexto:** Beb's Burguer — Fase 17.2
- **O que aconteceu:** rodei a bateria de provas, depois migrei o store, mudei o selo e troquei o cronômetro, e entreguei a saída antiga como se provasse o código entregue.
- **Causa raiz:** tratar prova como algo que se acumula, e não como algo que vale para um estado específico do código.
- **Como evitar:** prova é sempre a última coisa antes do commit. Se qualquer arquivo mudou depois dela, ela foi invalidada e roda de novo — e o `git log --oneline -1` do momento da prova vai colado junto.

## [2026-09-18] Script de prova morto por SIGPIPE do `head`
- **Categoria:** teste / ferramenta
- **Contexto:** Beb's Burguer — bateria da Fase 17.2
- **O que aconteceu:** rodei a bateria com `| tee arquivo | head -90`. O `head` fechou o pipe, o SIGPIPE matou o script no meio do teste 8, e o resultado parcial passou quase por resultado real.
- **Causa raiz:** truncar a saída de um processo que ainda está rodando, em vez de gravar inteiro e ler depois.
- **Como evitar:** prova longa grava em arquivo e só então se lê um trecho. Nunca `| head` em script que ainda está executando.

## [2026-09-18] Duas regras aprovadas que se anulavam (Fase 17.2)
- **Categoria:** especificação / processo
- **Contexto:** Beb's Burguer — caixa de entrada de atendimento, decisões 3 e 4
- **O que aconteceu:** a decisão 3 mandou `POST /messages` gravar `humanRepliedAt` (a prioridade da fila depende disso). A decisão 4 mandou manter `shouldAutoUnpause` como estava e não estendê-la ao painel, para o bot não reassumir logo depois de um "já te falo". Mas a regra dispara justamente quando `humanRepliedAt` está preenchido: gravar o campo ativa o comportamento que a outra decisão proibia.
- **Causa raiz:** as duas regras foram escritas olhando campos diferentes (uma o critério de ordenação, outra o gatilho de despausa) sem cruzar que era o MESMO campo ligando as duas.
- **Como evitar:** quando duas regras tocam o mesmo campo, escrever a tabela de transições do campo antes de aprovar — quem escreve, quem lê, e o que muda de comportamento em cada escrita. Pego antes de virar código porque o agente confrontou as regras em vez de implementar a primeira.

## [2026-09-18] Índice de estilo calculado por deslocamento em vez de derivado
- **Categoria:** lógica / geração de arquivo binário
- **Contexto:** Beb's Burguer — gerador de .xlsx próprio (xlsxWriter.ts)
- **O que aconteceu:** os índices de `cellXfs` viviam numa constante escrita à mão e o XML de estilos em outra. O deslocamento estava errado, uma célula apontava pra estilo inexistente e o arquivo não abria.
- **Causa raiz:** duas fontes de verdade em paralelo (mapa de índices e lista que gera o XML), ligadas por aritmética manual.
- **Como evitar:** quando um índice referencia posição numa lista gerada, derive índice e lista da MESMA construção. Nunca recalcular posição à mão.

## [2026-09-18] Teste acusou falha em arquivo correto, duas vezes
- **Categoria:** teste / verificação
- **Contexto:** Beb's Burguer — validação das planilhas
- **O que aconteceu:** (a) o LibreOffice recusou os arquivos e quase virou bug registrado; a causa real era o contêiner ter LibreOffice sem o módulo Calc. (b) A asserção "1 gráfico com 2 séries" falhou porque o openpyxl não modela gráfico combinado como objeto único.
- **Causa raiz:** escrever o critério de sucesso sem escrever antes como o teste poderia mentir.
- **Como evitar:** teste com ferramenta externa roda primeiro um CONTROLE sabidamente válido. Se o controle falha, a suspeita é a ferramenta, não o produto.

## [2026-09-17] Relatar "entregue" sem dizer em que branch a coisa vive
- **Categoria:** processo / git
- **Contexto:** Beb's Burguer — cinco itens de operação, incluindo exportar Excel
- **O que aconteceu:** disse "está tudo entregue" e dei instruções de teste. Tudo estava numa branch sem merge; o usuário testou contra `master`, não achou nada, e voltou duas vezes.
- **Causa raiz:** tratar commit mais push como sinônimo de entrega, ignorando os passos que só o usuário pode dar (fetch, checkout, npm install, restart).
- **Como evitar:** todo relato de conclusão nomeia branch, commit e o que falta pra chegar na máquina dele. Instrução de teste vem depois desses passos.

## [2026-09-18] Cravar a causa de um sintoma em ambiente que não consigo ver
- **Categoria:** diagnóstico
- **Contexto:** Beb's Burguer — botão de Excel "não aparece"
- **O que aconteceu:** respondi "o problema é que você está rodando uma build antiga" como fato, sem nunca perguntar em que branch a cópia dele estava.
- **Causa raiz:** confundir "eliminei uma causa" (meu código está certo) com "identifiquei a causa".
- **Como evitar:** provar que o próprio lado está correto não nomeia o culpado. Perguntar o estado do ambiente dele antes de afirmar.

## [2026-09-03] Contrariar decisão documentada e avisar só depois
- **Categoria:** arquitetura / processo
- **Contexto:** Beb's Burguer — fechamento automático do trailer (Fase 11 proíbe cron)
- **O que aconteceu:** implementei um ticker apesar do doc da fase dizer "não implemente um cron", e declarei o desvio no commit, com o código já pronto.
- **Causa raiz:** tratar "declarar o desvio" como equivalente a "ter permissão pro desvio".
- **Como evitar:** conflito com documentação do projeto vira pergunta no instante em que aparece, antes da primeira linha de código. Aviso depois transfere ao usuário o custo de desfazer.

## [2026-09-03] Escolher a solução cara sem apresentar a barata
- **Categoria:** arquitetura / escopo
- **Contexto:** Beb's Burguer — exportar relatório em Excel
- **O que aconteceu:** escrevi um gerador de .xlsx do zero, cerca de 180 linhas de OOXML mais uma dependência nova. Justifiquei por que descartei SheetJS e ExcelJS, mas nunca mencionei CSV, que o Excel abre direto e que o projeto já usa na exportação de logs.
- **Causa raiz:** apresentar uma decisão acompanhada da justificativa dela, em vez do leque de opções.
- **Como evitar:** listar opções com custo e trade-off e recomendar uma. Justificativa convence; leque deixa o usuário decidir.
