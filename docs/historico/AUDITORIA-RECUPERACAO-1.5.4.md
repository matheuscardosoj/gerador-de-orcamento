# Auditoria da recuperação e avisos — 1.5.4 revisada

## Escopo e conclusão

Auditoria do coordenador Electron, eventos de rede/foco/suspensão, consultas de disponibilidade,
serialização de sincronização, paginação, repetição, geração de sessão e notificações.
O instalador original da 1.5.4 foi superado por esta revisão; não usar o pacote original.

Foram reproduzidas **quatro falhas** antes das correções, registradas em
`output/auditoria-antes.log`. O código revisado passou nos cenários abaixo e no gate completo.
Isso confirma os ensaios executados, sem substituir a confirmação física de desconectar e
reconectar no computador do usuário. A aplicação offline continua repetindo tentativas
intencionalmente, com intervalo limitado; essas tentativas cessam após a recuperação.

## Achados e proteções

| Situação                                                                  | Proteção e evidência                                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Mesmo erro repetido em eventos adiava Retry-After indefinidamente         | O evento reconhece a mesma evidência de erro; não renova seu prazo a cada atualização. Regressão reproduzida antes e aprovada depois.         |
| Uma resposta paralela válida antecipava a repetição apesar de Retry-After | A solicitação e a execução central respeitam o prazo, inclusive com broadcasts e eventos. Regressão reproduzida antes e aprovada depois.      |
| Evento sem texto de erro desbloqueava manutenção/permissão ainda ativa    | Desbloqueio exige estado acessível sem erro nem falha classificada. Regressão reproduzida antes e aprovada depois.                            |
| Probe e evento de confirmação agendavam duas retomadas                    | Confirmação única por ciclo e revisão da confirmação evitam a segunda passagem redundante. Regressão reproduzida antes e aprovada depois.     |
| Leitura voltava, mas escrita continuava indisponível                      | O backoff só é reiniciado após sincronização bem-sucedida; leitura saudável não acelera indefinidamente os envios com erro.                   |
| Retry-After maior que o limite de setTimeout                              | Temporizador limitado ao máximo suportado e prazo reavaliado quando dispara; evita estouro para tentativas de milissegundos.                  |
| Timers de 30 segundos e cinco minutos coincidiam                          | Uma única vigilância normal; a passagem completa é selecionada dentro dela quando necessária.                                                 |
| Páginas remotas repetiam cursor                                           | Interrompe a leitura se não houver avanço inteiro e seguro; a base local permanece preservada.                                                |
| Resposta antiga chegava após recuperar                                    | Mantém a conectividade mais recente e informa ação anterior sem confirmação, sem recriar uma falsa queda. A operação conserva sua identidade. |
| Ação de um cartão antigo falhava após trocar empresa                      | Só publica falha se o cartão ainda existe no contexto atual; ensaio visual controla a rejeição atrasada.                                      |
| Cartão precisava deixar de ser persistente sem mudar texto                | A deduplicação considera persistência e categoria, permitindo atualizar o prazo corretamente.                                                 |
| Identidades de cartões dependiam de relógio e sorteio                     | Contador único do processo de interface, preservado entre contextos; atualização mantém a identidade existente.                               |
| Conclusão voltava para retomada                                           | Ciclo explícito da 1.5.4 preservado, com transição única e nova recuperação somente após outra indisponibilidade.                             |

## Ensaios e resultados

- `npm run check`: **403 testes em 71 arquivos**, lint, formatação, tipos e build aprovados.
- `src/main/db/recuperacao-auditoria.test.ts`: onze cenários do coordenador, incluindo
  cinquenta reconexões sem acumular timers, dez minutos saudáveis com eventos emitidos
  pelas próprias consultas, dez minutos indisponíveis, recuperação e mais dois minutos
  sem probes adicionais. Relógio simulado; não representam medição da rede física.
- `src/main/db/tempo-real.test.ts`: serialização, sinais simultâneos, fila lenta,
  falha permanente, parada e retomada contínua com limites.
- `src/main/db/tempo-real-socket.test.ts`: SDK Supabase com WebSocket local real,
  avisos duplicados, queda e recuperação de alterações perdidas.
- `src/main/db/nuvem-integracao.test.ts`: SQLite/PGlite com transporte controlado,
  abertura offline, falha tardia e página sem avanço interrompida sem modificar documentos.
- Os testes existentes de colaboração/rascunhos continuam aprovados: resposta perdida,
  reinício e reenvio idempotente, sem duplicar versões em orçamento, relatório e recibo.
- `scripts/legado/verificar-1-5-4-auditoria-interface.mjs`: ensaio Electron aprovado, sem erros
  JavaScript, com modal, teclado, 1024/1440 pixels, deduplicação, fechamento, conclusão
  seguida de sincronizações e ação antiga rejeitada após troca de contexto.
  Evidência: `output/playwright/1-5-4-auditoria/resultado.json`.
- Dados reais da VS e Supabase não foram usados nem alterados. Não houve migração.

## Conferência do pacote revisado

- Pasta separada: `release/candidato-1.5.4-revisado`.
- Instalador: `Gerador de Orçamentos Setup 1.5.4 revisada.exe`.
- Executável abriu com perfil isolado, versão 1.5.4, sem erros de interface.
- Main, preload, HTML, JavaScript e CSS do ASAR correspondem byte a byte ao build testado.
- Tamanho: **1.222.564.874 bytes**.
- SHA-256: `8A80730F1C34565AD3028E89B2392B5C2FD5F492800AA9AF09302E2CF580BB79`.
- Evidências de abertura e integridade na pasta do candidato; instaladores anteriores preservados.

## Confirmação real pendente

Repetir desconectar/reconectar e aguardar um minuto após a conclusão. O aviso não deve
voltar para retomada. Fechar o aviso intermediário não deve recriá-lo por atualizações
do mesmo estado. O teste real de queda durante aplicação de rascunho continua não confirmado.

## Referências verificadas

- [Electron: online/offline](https://www.electronjs.org/docs/latest/tutorial/online-offline-events).
- [Supabase: assinaturas e Broadcast privado](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes).

A revisão mantém o sinal de rede como gatilho e a resposta do próprio serviço como confirmação;
os avisos do canal solicitam leitura da verdade atual, preservando a fila existente.
