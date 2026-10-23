# Candidato 1.5.2 — conexão, rascunhos e avisos

## Implementação

- Coordenador de recuperação ativo após inicialização offline, com repetição contínua
  de falhas transitórias, limite de 30 segundos e jitter de 20%; `Retry-After` é respeitado.
- Eventos online/offline do renderer, foco, desbloqueio e retorno da suspensão antecipam
  a verificação. O sinal de rede não substitui uma resposta do serviço.
- Verificação de contexto e leituras de comparação têm limite de oito segundos.
  Gravações conservam seus prazos e identificadores de operação.
- Status de acesso HTTP, sincronização e canal em tempo real são separados. Troca de
  conta cancela a recuperação anterior; respostas antigas continuam protegidas por geração.
- Migração SQLite v14 adiciona `rascunhos_envios`. A aplicação e seus IDs de envio são
  gravados atomicamente; o ACK confirma o rascunho na transação que retira a fila.
- Rascunhos aguardando confirmação não podem ser reaplicados, editados ou descartados.
  Conflito real e envio interrompido por validação têm estados distintos.
- Rascunhos continuam locais e só são aplicados por confirmação explícita. Importação
  de rascunhos pendentes de um backup recupera o conteúdo como rascunho local.
- Mensagens operacionais das telas e modais usam o aviso flutuante já adotado no aplicativo.
  Confirmações e instruções permanecem no contexto. Erros persistem; informações e sucessos
  duram seis segundos, com pausa durante interação. A fila tem altura limitada e rolagem.
- O host dos avisos acompanha o modal ativo para manter teclado, foco e leitura acessíveis.

## Evidências automatizadas

- `npm run check`: lint, Prettier, TypeScript, 379 testes em 69 arquivos e build aprovados.
- `src/main/db/nuvem-integracao.test.ts`: inicialização offline e recuperação automática
  do código do processo principal, com transporte simulado e PostgreSQL PGlite.
- `src/main/db/tempo-real.test.ts`: recuperação após mais de cinco falhas, erro permanente,
  serialização, encerramento e respeito a `Retry-After`.
- `src/main/db/tempo-real-socket.test.ts`: SDK oficial com servidor WebSocket local,
  evento recebido e recuperação de alterações perdidas na reconexão.
- `src/main/db/colaboracao-integracao.test.ts`: resposta perdida após gravação, reinício
  do perfil, reenvio dos mesmos IDs e uma única versão adicional em orçamento, relatório e recibo.
- `src/main/db/rascunhos-envio.test.ts`: migração v13 para v14 preserva fila/rascunhos;
  confirmação parcial e erro de outro registro não confirmam nem conflitam o rascunho.
- `scripts/legado/verificar-1-5-2-interface.mjs`: Electron com API sintética, aviso de erro em
  modal, teclado, larguras 1024/1440, conexão deduplicada, persistência e lista com rolagem.
  Resultados e capturas em `output/playwright/1-5-2-cadastros`.
- `scripts/legado/verificar-1-5-2-pacote.mjs`: abertura do executável empacotado com perfil novo,
  versão visível, IPC de verificação e registro dos eventos de recuperação.

## Artefato conferido

- Instalador: `release/candidato-1.5.2/Gerador de Orçamentos Setup 1.5.2.exe`.
- Tamanho: 1.222.563.517 bytes.
- SHA-256: `76BE848F4CA9FCAE0CBC7260211CF76A278A62B3E772C76DB4EC29FC69F0B08D`.
- Executável empacotado abriu com versão 1.5.2 e sem erros JavaScript no perfil isolado.
- Main, preload e HTML extraídos do ASAR são idênticos ao build aprovado.
- Evidências locais: `release/candidato-1.5.2/abertura-1.5.2.json`,
  `1.5.2-abertura.png` e `integridade-build.json`.

## Limites e teste manual

Este é um candidato para teste, não uma declaração de validação em produção.
Não foram usadas contas reais, alterado o Supabase, nem acessados os dados da VS.
Não houve cópia para N, conforme solicitado anteriormente.

Depois de instalar nos computadores de teste:

1. Abrir conectado, desconectar a rede e guardar alterações em rascunho.
2. Reconectar; verificar o aviso flutuante e a retomada sem reiniciar ou sair da conta.
3. Comparar e aplicar o rascunho; conferir o documento no outro computador.
4. Repetir abrindo o aplicativo já offline, e depois de suspender/reativar o Windows.
5. Confirmar que a confirmação da aplicação não gera versões duplicadas e que os avisos
   de falha desaparecem quando a condição é resolvida.

## Referências

- [Electron: eventos de rede](https://www.electronjs.org/docs/latest/tutorial/online-offline-events).
- [Amazon Builders’ Library: timeouts, retries e jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).
- [Kleppmann e colaboradores: Local-first software](https://www.inkandswitch.com/essay/local-first/).
- [W3C: Alert Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/).
