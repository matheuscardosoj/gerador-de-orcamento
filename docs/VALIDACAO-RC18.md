# Validação da rc.18 — notificações e empresas

## Escopo

Branch `claude`; alterações locais anteriores preservadas. Implementação sem novas dependências, serviços ou mensalidade. Nenhuma migração ou função foi publicada nesta etapa. Nenhuma empresa real foi criada ou excluída, e nenhum dado da VS foi alterado. A nova TESTE vazia é independente da TESTE excluída pelo usuário na rc.17.

## Correções

- Operações do controle ordenadas por sessão, empresa, tipo e documento. Leituras contíguas compartilham a consulta, mas uma transferência separa as leituras. Documentos distintos continuam independentes.
- A sessão é conferida antes da execução, antes da RPC e antes da gravação. Logout invalida consultas em voo e operações aguardando a fila, preservando o limite de dois segundos das liberações.
- Respostas trazem empresa, sessão, documento e sequência lógica via IPC. Editor e receptor global usam o estado aceito; respostas antigas não restauram responsáveis, pedidos ou controles removidos.
- Gravações de sincronização não podem reduzir a geração já presente no SQLite.
- Avisos usam identidade composta por empresa, tipo, documento, geração do controle, UUID solicitante e identidade temporal do pedido devolvida pelo servidor. Nomes de computadores, nomes de usuários e horários físicos dos PCs não decidem precedência.
- Um pedido repetido não acumula cartões. Pedido cancelado, resolvido ou invalidado pela transferência sai da tela. Dispensar manualmente não faz o mesmo pedido reaparecer; um novo pedido pode aparecer.
- Eventos aceitos atualizam o editor e removem avisos invalidados sem gerar consultas em ciclo. A consulta periódica de segurança permanece em 15 segundos e só acompanha documentos sob responsabilidade do computador atual, incluindo preparação offline.
- Falha de conexão desabilita a ação dos avisos até uma consulta bem-sucedida. Abrir um aviso confirma novamente sua validade após a decisão sobre alterações não salvas. Cancelar a navegação preserva o aviso e não deixa abertura pendente. Reabrir o mesmo documento após descartar alterações realmente recarrega seu estado.
- Sair da empresa remove os avisos e a abertura pendente daquele contexto.
- O texto explicativo da exclusão agora é um aviso; o erro real só aparece quando a operação falha. O nome exato continua obrigatório.
- Criar empresa atualiza a lista usando a sessão atual. Se a criação funcionar e a leitura da lista falhar, o aplicativo informa o resultado e permite retentar somente a leitura, sem criar empresa ou enviar convite novamente. As duas entradas de criação têm esse tratamento.

## Evidências automatizadas

`npm run check` passou: lint, formatação, TypeScript, **342 testes em 65 arquivos** e compilação.

- Fila: leituras repetidas, transferência entre leituras, recuperação após falha e independência de empresas/documentos; 3, 10 e 50 operações concorrentes.
- Ciclo dos pedidos: 3, 10 e 50 computadores com nomes iguais e a mesma conta; duas empresas e dois documentos; 20 gerações alternadas; cancelamento, repetição e resposta fora de ordem.
- SQLite e main reais, transporte simulado: troca de sessão durante consulta, fila pendente, geração antiga, ordem da transferência e logout sem aguardar consulta lenta.
- PostgreSQL isolado (PGlite), funções reais: 50 dispositivos, cinco usuários, duas empresas, dois documentos e 20 transferências; pedidos repetidos sem duplicação, um responsável por documento e rejeição do antigo responsável.
- Sincronização real com SQLite e PGlite, transporte atrasado: uma leitura de controles retida não reduz a geração já confirmada por outra RPC.
- Serviço de contas real com HTTP simulado: criação uma vez, falha na leitura, nova leitura bem-sucedida e lista atualizada sem repetir convite.
- `scripts/verificar-rc18-interface.mjs`: Electron com perfil descartável e API simulada; 20 eventos resultam em duas consultas, 20 alternâncias, pedido antigo rejeitado, ação offline desabilitada, dispensa respeitada e cancelamento da navegação preservando aviso. Larguras 1024 e 1600, sem erros de JavaScript.
- `scripts/verificar-rc18-empresas.mjs`: abrir exclusão não exibe erro nem chama exclusão; criação e recuperação da lista sem novo login, uma criação, duas leituras e zero exclusões.
- Evidências visuais e resultados em `output/playwright/rc18-interface` e `output/playwright/rc18-empresas`.

## Fundamentos da solução

A implementação reaproveita recursos existentes: geração do banco, sequência lógica no main, IPC, eventos e estado React. Não adiciona broker de mensagens ou infraestrutura distribuída.

- [Leslie Lamport — Time, Clocks, and the Ordering of Events](https://www.microsoft.com/en-us/research/publication/time-clocks-ordering-events-distributed-system/): ordenar estados por relações e versões lógicas, sem depender do relógio dos PCs.
- [Martin Kleppmann — How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html): validar a geração na gravação para rejeitar ações antigas; a geração já existente continua sendo usada.
- [Amazon Builders Library — Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/): separar uma nova intenção da repetição de uma operação. Repetir a atualização da lista não repete a criação.
- [React — Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects#fetching-data): descartar resultados de contextos encerrados e compartilhar consultas.
- [W3C — Alert Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/): manter avisos importantes enquanto relevantes e reduzir interrupções repetidas.

## Limites e confirmação real pendente

Não existe promessa de latência zero ou de ausência absoluta de falhas de rede. As proteções impedem que uma resposta local antiga substitua estado aceito mais recente; o servidor continua verificando a autorização antes de alterar o controle. Uma alteração feita em outro computador precisa chegar por evento ou consulta para atualizar a tela. A periodicidade de segurança não foi encurtada.

UUID é uma identidade da instalação/perfil, não uma prova física do hardware. Clonar integralmente o perfil pode clonar essa identidade; esta versão não introduz identificação por hardware.

Os cenários com 50 dispositivos são automatizados em ambiente isolado, não 50 computadores físicos simultâneos. Após instalar nos computadores disponíveis, confirmar: alternâncias rápidas, aviso em outra tela, desaparecimento do aviso resolvido, cancelamento da navegação com edição não salva e criação de empresa com atualização imediata. Para verificar apenas a abertura da exclusão, abrir e cancelar; não é necessário excluir outra empresa.

A rc.18 permanece candidata até essa confirmação real.

## Pacote entregue

- Instalador local: `output/instalacao-teste-1.5.0-rc.18/Gerador de Orçamentos Setup 1.5.0-rc.18.exe`.
- Cópia para N: `F:/Users/Public/Downloads/Gerador de Orçamentos Setup 1.5.0-rc.18.exe`.
- Tamanho: **1.222.557.280 bytes**.
- SHA-256 idêntico nas duas cópias: `648E7E0547A435D982523D284209F49C7F833A70D3768AE3F431F10BE9C7E088`.
- Instalador rc.17 preservado e hash anterior reconferido.
- Todos os arquivos compilados dentro do ASAR conferem byte a byte com a compilação final; migrações 010/011/012 do pacote conferem com as fontes. Evidência: `output/backups/rc18-integridade-pacote.json`.
- Executável de `win-unpacked` abriu na tela de login com perfil descartável; API do próprio pacote retornou `1.5.0-rc.18`. Captura: `output/validacao-rc18-pacote/abertura.png`. Instância de teste encerrada.
- Manifesto da entrega: `output/backups/rc18-instalador.json`.

### Roteiro curto após instalar nos dois computadores

1. Abrir um documento de teste nos dois, mantendo o responsável em outra tela. Solicitar edição no outro computador; deve haver um único aviso persistente no responsável.
2. Transferir e devolver várias vezes. Avisos resolvidos devem desaparecer; não devem indicar o próprio computador como solicitante de outro responsável.
3. Com edição não salva, abrir um aviso e escolher **Continuar editando**. O formulário e o aviso devem permanecer. Ao escolher **Descartar alterações**, o documento deve reabrir com os dados salvos e o painel correto.
4. Abrir a exclusão e cancelar: deve aparecer a explicação amarela, sem erro antecipado. Não excluir a VS.
5. Criar uma empresa de teste: ela deve aparecer na seleção sem sair da conta. Se a leitura falhar após a criação, usar **Atualizar lista**, sem enviar outra criação.

A instalação e os testes com contas reais nos dois computadores serão feitos pelo usuário; não foram presumidos como concluídos.
