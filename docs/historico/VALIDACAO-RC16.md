# Validação da rc.16 — 15/10/2026

## Estado da entrega

Implementação local na branch `claude`, preservando as alterações anteriores. O candidato ainda **não foi aprovado nos dois computadores**. Nenhuma migração, publicação da Edge Function, exclusão de empresa ou reorganização da VS foi executada nesta etapa.

## Alterações locais

- Estado estruturado de empresa indisponível; interrupção de requisições e repetição de sincronização; bloqueio de IPC antes de gravar; encerramento agendado fora da própria operação para evitar espera circular. Respostas de sessões anteriores são descartadas.
- Empresa excluída apresenta tela integrada. Administrador global pode voltar à seleção; usuário comum volta ao acesso. Remoção do perfil local exige confirmação estruturada do servidor. Falhas de rede não removem perfis. Há recuperação caso o Windows impeça concluir o encerramento.
- Convites e consultas auxiliares limitados à empresa ativa; cancelamento cruzado rejeitado no servidor.
- Solicitação de edição adquire documento livre, representa pedido pendente e permite cancelar. Pedidos do administrador global aparecem sem vínculo de membro. Responsável pode salvar e transferir.
- Rascunhos idênticos reutilizados; guardar atualiza o rascunho aberto. Exclusão com confirmação no modal e retorno direto ao principal com escolha sobre alterações não salvas.
- Recibo confirmado/cancelado continua protegido; a comparação explica a restrição e bloqueia aplicação textual. Criar outra cobrança não registra recebimento.
- Executável com descrição e produto “Gerador de Orçamentos”; instalador em português, ícone do aplicativo e página de apresentação nativa.
- Migração 011 preparada para códigos de acesso, edição global, isolamento de convites e aviso de exclusão em tempo real. A mensagem de realtime somente solicita conferência do estado no servidor.
- Migração 012 preparada para manutenção e geração da base. Lotes de versões anteriores são rejeitados; a restauração exige backup no destino escolhido antes de adotar a geração atual.

## Evidências locais

- Instalador gerado: `release/Gerador de Orçamentos Setup 1.5.0-rc.16.exe`, 1.222.553.275 bytes; SHA-256 `52A0B9E8B98E6D3F374BF325441DAB8770E854DD72EE1C92072A2A7A2806D29B`. Main, preload e assets do ASAR foram comparados byte a byte com o build aprovado. Versão do pacote confirmada como `1.5.0-rc.16`. A geração não comprova instalação ou testes nos dispositivos.
- `npm run check`: lint, formatação, tipos, **316 testes em 58 arquivos** e compilação aprovados. Log: `output/rc16-check.log`.
- Testes novos: sequência schema + serviço central + 009/010/011/012; operador sem vínculo solicitando/cancelando/recebendo edição; convite de outra empresa; empresa excluída; manutenção e reenvio obsoleto; respostas atrasadas; cancelamento de requisições concorrentes; falha de rede sem remoção de dados; deduplicação/exclusão de rascunhos; restauração preservando snapshots anteriores.
- `scripts/legado/verificar-rc11-interface.mjs`: dez telas, 1024 e 1600 px, tabelas e cálculo de lucro próprio de 150% aprovados com API de demonstração. Capturas em `output/playwright/rc11-interface`.
- `scripts/legado/verificar-rc16-interface.mjs`: criação, retorno, cancelamento e exclusão de rascunho; tela de empresa excluída para operador e membro em 1024 e 1600 px; sem erros de página. Capturas em `output/playwright/rc16-interface`.
- Metadados do executável empacotado conferidos pelo Windows: FileDescription e ProductName corretos; OriginalFilename “Gerador de Orçamentos.exe”. Essa conferência não substitui a inspeção do processo após instalar.

## Validação real nos dispositivos — 15/10/2026

- D-MATHEUS e N-MATHEUS exibiram `v1.5.0-rc.16`, empresa SLA/TESTE e estado “Nuvem sincronizada”. No N-MATHEUS, a versão foi instalada pela sessão RDP aberta; o instalador usado foi o mesmo artefato cujo SHA-256 consta acima e cuja cópia remota havia sido conferida.
- Criado no N-MATHEUS o orçamento de teste **000002**, cliente `RC16 TESTE N 20261015`, com serviço manual de R$ 100,00. Após salvar, recebeu numeração e sincronização; foi reaberto em edição compartilhada e apareceu na lista do D-MATHEUS.
- Criado no D-MATHEUS o orçamento de teste **000003**, cliente `RC16 TESTE D 20261015`, com serviço manual de R$ 200,00. Recebeu numeração e sincronização; apareceu na lista do N-MATHEUS. O orçamento permaneceu como rascunho.
- No orçamento 000003, criar rascunho de trabalho gerou rascunho local com revisão de partida 1. A interface informou que o documento compartilhado e pagamentos não foram alterados. Com o rascunho idêntico à revisão, os botões Editar/Comparar apareciam inativos; a comparação não foi validada. O bloqueio de edição foi liberado depois; a tela remota confirmou “Controle atualizado” e passou a oferecer “Solicitar edição”.
- O painel de transferência continua ambíguo: há entradas repetidas de `N-MATHEUS` e `D-MATHEUS`, sem diferenciação suficiente para selecionar o dispositivo de destino com segurança. Transferência entre computadores não foi aprovada.
- Os registros 000002 e 000003 e o rascunho local de teste permanecem para inspeção. Nenhum foi excluído. Esta execução não aplicou SQL, alterou a Edge Function, escreveu na VS ou fez outra gravação/exclusão remota além dos orçamentos de teste autorizados.
- Ainda não foram exercitados contra o backend os fluxos de convites, transferência entre dispositivos, exclusões, pagamentos, reconexão, eventos atrasados/duplicados ou exclusão da empresa durante sessão. Instalação está confirmada, mas isso não aprova a rc.16 como validada.

## Bloqueios anteriores e dependências atuais

1. Antes da sessão RDP ficar disponível, o controle de tela/navegador falhava antes da ação. O teste oficial `codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK` reproduziu `CreateProcessSecurityEnvironment failed (HRESULT = 0x80070020)`.
2. O teste equivalente do sandbox legado retornou `setup refresh had errors`. O log `C:/Users/Matheus/.codex/.sandbox/sandbox.2026-10-15.log` registra erro 32 (“arquivo já está sendo usado por outro processo”) ao validar permissões do runtime `node_repl.exe`. Ambos os plugins de controle estão habilitados. Nenhuma configuração salva do Codex foi modificada. A validação gráfica foi retomada pela sessão RDP aberta pelo usuário.
   A recuperação pontual dos processos exclusivos das ferramentas liberou o executável, mas o componente de controle reabriu e manteve `VCRUNTIME140_1.dll` do mesmo runtime bloqueada. A preparação oficial continuou falhando. É necessário executar o diagnóstico com o aplicativo Codex completamente fechado; a DLL não foi removida ou substituída, e permissões não foram afrouxadas manualmente.
3. PostgreSQL: DNS confirmou o IPv6 do servidor, mas pg_dump e psql com TLS obrigatório e o endereço confirmado falharam com `Software caused connection abort (10053)`, antes de autenticar. O arquivo vazio foi marcado como `supabase-pre-011.incompleto`; **não é backup recuperável**. Credenciais não foram expostas.

## Etapas obrigatórias restantes

- A conexão de backup continua pendente: gerar dump novo e ensaiar restauração isolada; capturar definições remotas efetivas para reversão precisa; então comparar/aplicar 011/012 e publicar a Edge Function correspondente.
- Completar na TESTE/SLA os fluxos cruzados, inclusive exclusão como último teste, reconexão e ausência de recriação. Conferir instalador em DPI 100/125/150/200% e o nome do processo instalado.
- Depois de todos os testes, fazer backup recuperável atual da VS, adquirir bloqueio administrativo, incrementar a geração e ativar manutenção antes da reorganização. Preservar IDs e pagamentos, ordenar números atuais/ID, atualizar referências, sequências e códigos; reter uma v1 corrente por documento; remover vínculos de membros mantendo a conta global do Administrador do Sistema. Finalizar manutenção e atualizar os dois perfis com backup escolhido pelo usuário.
- Confirmar o ID remoto da TESTE/SLA antes de excluir; SLA é o nome fantasia informado pelo usuário. Não reutilizar scripts históricos de limpeza com contagens, usuários ou IDs desatualizados.

## Reversão

Como não houve alteração remota, não existe SQL remoto aplicado a reverter nesta etapa. A reversão futura deve ser gerada das definições efetivas capturadas junto ao novo backup. Depois da reorganização, preservar o bloqueio de geração até todos os clientes serem atualizados; retirar essa proteção permitiria reenvio de dados antigos.

A versão só pode ser declarada validada após os testes instalados e as conferências finais acima.

## Continuação da validação — 15/10/2026

- Nova execução de `npm run check`: lint, formatação, TypeScript, 58 arquivos e 318 testes aprovados; build Electron/Vite concluído. Permanecem apenas avisos de empacotamento de imports dinâmicos/estáticos.
- Auditoria dos fluxos de aviso confirmou toast de sucesso em salvar orçamento, relatório e recibo, em guardar rascunhos e em adicionar serviço manual/calculado. Os erros dos editores continuam no contexto do documento. `RecepcaoPedidosEdicao`, montado no App, faz consulta inicial, reage a eventos de sincronização/controle e repete a consulta a cada 15 s; pedidos não vistos geram aviso persistente com ação para abrir documento e painel.
- A confirmação visual ponta a ponta do pedido e da transferência ainda não foi executada nesta continuação: o controle gráfico desta sessão lista zero aplicativos/janelas e não expõe a sessão RDP, embora a RDP tenha estado acessível na sessão anterior. Não inferir sucesso de teste real a partir da inspeção do código.
- Rechecagem de rede ao PostgreSQL do projeto Supabase: DNS resolveu o endereço IPv6, mas TCP/5432 retornou `TcpTestSucceeded=False`. Portanto, não foi possível obter dump novo; não aplicar migrações 011/012, não publicar Edge Function e não tentar excluir TESTE/SLA até haver backup íntegro e ensaio isolado.
- A TESTE/SLA e a VS permanecem sem exclusão ou limpeza nesta etapa.
- Retificação do artefato/dispositivos: a build rc.16 refeita e instalada nos dois computadores usa SHA-256 `B6C3102695A3B0F0C5695395F7B879F9773EE6137610CF4A4C9149EFCB280661` (1.222.554.688 bytes). O hash `52A0...` acima se refere à build anterior e não à instalação mais recente. Na última inspeção visual feita na sessão anterior, D-MATHEUS e N-MATHEUS exibiam `v1.5.0-rc.16` e a empresa SLA com os orçamentos de teste sincronizados. Esta retificação não transforma a solicitação de edição ou transferência em teste aprovado.

## Build após ajustes adicionais de toasts — 15/10/2026

- Toasts de sucesso foram adicionados após cadastrar/editar/excluir clientes e serviços. As mudanças de nome, e-mail e senha passaram a usar o nível visual de sucesso; erros continuam exibidos no formulário.
- `npm run check` passou novamente após as alterações: lint, formatação, TypeScript, 318 testes em 58 arquivos e build.
- `npm run dist` concluiu a geração do instalador atualizado. Arquivo: `release/Gerador de Orçamentos Setup 1.5.0-rc.16.exe`; tamanho 1.222.554.849 bytes; SHA-256 `99B3F5B78B21C86AADE8951461789A524BCE26A1E331EDD5FDFD770A4733F648`. Metadados do executável empacotado: ProductName e FileDescription `Gerador de Orçamentos`.
- Este instalador atualizado ainda não foi copiado/instalado em D-MATHEUS e N-MATHEUS; a sessão gráfica desta rodada não lista janelas. Portanto, os novos toasts ainda não têm validação visual nos PCs.
- Um teste PGlite adicional injeta falha durante a exclusão e confirma rollback transacional: empresa, registros relacionados e ausência do bloqueio permanecem intactos. O arquivo `src/main/db/gdo-operador-exclusao.test.ts` passou isoladamente (4/4 testes).
- A build `99B3...` foi copiada para o compartilhamento de N-MATHEUS como `Gerador de Orçamentos Setup 1.5.0-rc.16 validacao final 20261015.exe`; SHA-256 remoto conferido e idêntico. O instalador anterior foi preservado. A instalação da nova build em N e D continua pendente por falta de janelas acessíveis no controle gráfico nesta sessão.
