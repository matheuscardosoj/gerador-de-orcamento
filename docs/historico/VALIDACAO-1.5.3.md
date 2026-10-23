# Candidato 1.5.3 — recuperação rápida e aviso único

## Implementação

- Eventos online/offline, foco, desbloqueio e retorno da suspensão encaminham sua origem
  ao coordenador. A consulta de disponibilidade não aguarda a fila de sincronização
  nem a renovação dos controles de edição. Há apenas uma consulta simultânea.
- A consulta usa o contexto somente leitura já disponível, com prazo total de três
  segundos, incluindo renovação de sessão e fallback de protocolo. Perfis legados
  consultam uma leitura limitada da API existente.
- Na indisponibilidade, intervalos de 1, 2 e até 5 segundos com jitter; Retry-After
  prevalece inclusive sobre eventos manuais. A vigilância normal permanece em 30 segundos.
- A ordem das requisições protege a evidência de conectividade: uma falha antiga não
  pode substituir uma confirmação mais recente. A geração de sessão continua protegendo
  a troca de empresa; as operações de gravação mantêm os identificadores originais.
- A interface distingue recuperação do serviço, retomada dos envios e conclusão
  confirmada. Falhas permanentes e pendências não são apresentadas como sincronização concluída.
- Avisos de conexão compartilham uma categoria e uma chave no contexto da conta/empresa,
  independentemente da tela. Mensagens padronizadas anteriores são reconhecidas centralmente.
  Atualizações preservam o botão Tentar agora; desmontar um formulário não remove esse cartão.
- Fechar o cartão impede sua recriação pelo monitor durante a mesma interrupção.
  Outra ação explícita pode reapresentá-lo. A recuperação resolve o incidente.
- Não houve migração de banco, alteração no Supabase nem ensaio em dados da VS.

## Evidências automatizadas

- `npm run check`: lint, formatação, TypeScript, **384 testes em 69 arquivos** e build.
- Coordenador: evento inicia consulta antes da liberação da fila lenta; eventos repetidos
  compartilham a consulta em andamento; recuperação sem evento; Retry-After; falhas permanentes;
  parada da sessão. Os testes com relógio simulado confirmam o disparo imediato e duas
  consultas de recuperação dentro de cinco segundos com respostas imediatas.
- Integração com SQLite/PGlite e transporte sintético: inicialização offline seguida de
  recuperação sem reiniciar; falha tardia não reverte confirmação mais recente.
- Permanecem os testes de perda de resposta, reinício, fila idempotente, rascunhos e versões
  em orçamento, relatório e recibo.
- Notificações: falhas de salvar e abrir controles de documentos distintos convergem
  para um cartão, preservando ação/identidade; limpeza de componente não o remove;
  fechamento manual, nova ação, resolução e erro de autorização separado.
- `scripts/legado/verificar-1-5-3-interface.mjs`: Electron com API sintética, modalidades de erro
  de conexão por origem, modal acessível, teclado, 1024/1440 pixels, persistência e rolagem.
  Evidência em `output/playwright/1-5-3-cadastros/resultado.json`.
- O ensaio visual exercita a política central com origens sintéticas; não representa
  uma nova validação manual completa dos três editores em máquinas reais.

## Resultados reais informados pelo usuário na 1.5.2

Orçamento 20: sincronização normal, offline/reconexão, comparação/aplicação, abertura
offline, conflito verdadeiro e suspensão aprovados. A recuperação demorou aproximadamente
30 segundos e foram observados avisos de conexão duplicados, motivando esta versão.
O teste de queda durante a aplicação permanece **não confirmado**. O teste manual
extenso de avisos não foi executado.

## Confirmação curta ainda necessária na 1.5.3

1. Desconectar a rede; tentar salvar e abrir Rascunhos e controle. Deve existir apenas
   um cartão de conexão, inclusive com o modal aberto.
2. Reconectar e medir separadamente: reconhecimento do serviço e confirmação dos envios.
   Com evento, a consulta começa imediatamente; sem evento, a meta é reconhecer em
   aproximadamente 5–8 segundos quando o serviço responde normalmente. Não é garantia
   de duração da sincronização inteira.
3. Fechar o aviso offline: ele não deve voltar sozinho. Uma nova tentativa de ação
   pode reapresentá-lo uma vez. Repetir brevemente em relatório e recibo.

## Referências da decisão

- [Electron: eventos online/offline](https://www.electronjs.org/docs/latest/tutorial/online-offline-events):
  evento de rede é um gatilho, não prova de acesso ao serviço.
- [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/):
  reduzir ruído e comunicar sintomas acionáveis.
- [Amazon Builders’ Library: retries e jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/):
  limitar prazos, escalonar tentativas e evitar sincronismo entre clientes.

## Pacote

Candidato na branch `claude`: `release/candidato-1.5.3/Gerador de Orçamentos Setup 1.5.3.exe`.
Abertura do executável empacotado aprovada com perfil isolado, versão 1.5.3 e nenhum erro
de interface. Os cinco arquivos do build (main, preload, HTML, JS e CSS) correspondem
byte a byte ao ASAR. Registros: `abertura-1.5.3.json` e `integridade-1.5.3.json`
na pasta do candidato.

- Tamanho: **1.222.564.308 bytes**.
- SHA-256: `A1B3356C61C5421C4795234DF0826F9D9372D8751E28CA69821C2A4D5B7FB647`.
- Instaladores anteriores preservados; nenhuma cópia para N foi realizada.
  Não declarar validação real da velocidade antes da confirmação acima.

## Retorno do teste real — 16/10/2026

O usuário confirmou aviso único e os testes de relatório/recibo. Reconhecimento da
conexão em aproximadamente oito segundos; informou três segundos para sincronizar.
Falhou a apresentação posterior: o aviso de conclusão voltou para retomada, persistindo
ou reaparecendo após fechamento. As capturas mostram o rodapé sincronizado junto ao
cartão de retomada. A 1.5.3 não é considerada aprovada; correção acompanhada na 1.5.4.
