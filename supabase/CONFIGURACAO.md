# Configurar a nuvem da empresa

Use um projeto Supabase por empresa e o mesmo usuário de e-mail e senha nos computadores que compartilharão os dados. Cada usuário autenticado acessa sua própria base. Preferências do computador e configuração da IA permanecem locais.

## Atualizar uma nuvem que já está conectada

O novo esquema organiza os registros em tabelas de domínio. Ele é compatível com a sincronização da **versão 1.4.0**; o banco SQLite local continua no esquema 8.

1. Sincronize todos os computadores, resolva pendências/conflitos e exporte um backup atualizado em **Dados e backup**. Termine as edições e feche os aplicativos enquanto executar a mudança.
2. Guarde também a exportação remota verificada e teste a migração dessa cópia. O script `scripts/verificar-migracao-relacional.mjs` exercita PostgreSQL isolado e compara conteúdo, revisões e sequências; não usa contas reais.
3. Abra uma **nova consulta no SQL Editor** e execute o **novo `schema.sql` completo**, fornecido com esta atualização. Não use a cópia do esquema antigo que estava no instalador original. Não escolha publicar novamente nem apague tabelas manualmente.
4. O script converte os registros existentes dentro de uma transação, valida os vínculos/pagamentos e compara todos os conteúdos. Uma falha cancela a mudança inteira. Depois da conferência, retira a tabela genérica anterior. Não renumera documentos nem modifica snapshots antigos. Executar novamente preserva os dados e as revisões.
5. Reabra os aplicativos, sincronize e confira ausência de falhas/pendências. Compare novamente os registros locais/remotos e teste o download em um perfil separado.

## Onde consultar os dados no painel

Em **Table Editor → public**, abra a tabela pelo nome:

| Tabela                                                                       | Conteúdo                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `clientes`                                                                   | Nome, PF/PJ, CPF/CNPJ opcional, telefone, e-mail e endereço               |
| `servicos`                                                                   | Catálogo de serviços e sua ordem                                          |
| `orcamentos`, `itens_orcamento`, `materiais_orcamento`, `textos_orcamento`   | Propostas, valores, serviços, materiais e condições                       |
| `relatorios`, `itens_relatorio`, `lancamentos_relatorio`, `textos_relatorio` | Serviços executados, adiantamentos, reembolsos e saldo                    |
| `recibos`, `recebimentos`                                                    | Recibos/cobranças ativos e lançamentos financeiros, incluindo estornos    |
| `imagens`, `anexos_orcamento`, `anexos_relatorio`                            | Base64 e vínculos de fotos, sem Storage                                   |
| `documentos`, `versoes_documentos`, `imagens_versoes`                        | Responsável, dados congelados, histórico e referências às imagens antigas |
| `observacoes_padrao`, `formas_pagamento_padrao`, `configuracoes_empresa`     | Padrões comerciais e configuração da empresa                              |
| `computadores`, `reservas_numeros`                                           | Computadores conectados e números reservados/utilizados                   |

O registro permanente em `documentos` preserva documentos excluídos; eles não reaparecem nas tabelas de documentos ativos. O vínculo de um pagamento com esse registro permanece válido mesmo após excluir/estornar o recibo.

Os controles de sincronização ficam no schema **`sincronizacao`**. `gdo_entities` agora é uma **consulta compatível**, que monta os dados a partir das tabelas; não é uma segunda base. JSON continua sendo usado para cálculos, configurações e snapshots históricos, preservando campos opcionais.

Faça as edições pelo aplicativo para registrar versões e manter números, pagamentos e sincronização consistentes. As conexões do aplicativo têm leitura por empresa; gravações passam pelas operações transacionais autorizadas.

## Você já usa uma versão antiga nesta máquina

1. Abra a versão atual do aplicativo e vá a **Configurações → Dados e backup**. Exporte uma cópia de segurança e guarde esse arquivo em outra pasta ou dispositivo. Termine as edições abertas e feche o aplicativo.
2. Instale a atualização **1.4.0** com o mesmo usuário do Windows usado na versão antiga. Seus dados ficam na pasta de dados do usuário, separada da instalação. Abra o aplicativo atualizado: ele cria e verifica um backup anterior à migração, calcula o espaço necessário e atualiza a base local automaticamente. Imagens existentes são convertidas para texto sem recompressão, e documentos recebem sua primeira versão registrada. O histórico anterior à atualização não pode ser reconstruído.
3. Antes de conectar a nuvem, confira clientes, cadastro da empresa e logo, propostas, relatórios, valores e fotos. Exporte um novo backup já na versão atualizada. Continue usando **a mesma base local que você já possui**; não escolha baixar uma base vazia sobre seus dados.
4. Crie o projeto Supabase vazio seguindo a seção abaixo. Na primeira conexão **deste computador**, escolha **Publicar os dados locais em uma nuvem vazia**. Essa opção envia a base migrada, preservando documentos, imagens e números já usados. Não é necessário copiar registros ou fotos manualmente nem criar Storage.
5. Aguarde a sincronização terminar com **0 alterações aguardando envio** e sem falhas. Depois confira os documentos em outro computador com a opção **Baixar a base da empresa**. O computador original continua responsável pelos documentos que publicou; você pode transferir essa responsabilidade pela linha do tempo.

Se a atualização pedir mais espaço ou encontrar erro no banco/backup, resolva o aviso antes de publicar. Se o projeto remoto já possuir dados, a publicação será recusada: use um projeto vazio para esta migração. Restaurar ou mesclar um backup local é uma operação distinta da publicação na nuvem.

## Criar o projeto e conectar os computadores

### Se você está usando o candidato rc.2

Exporte um backup **da base atual do rc.2**, incluindo suas últimas edições. Guarde também um backup da instalação antiga antes da atualização. Na versão final, restaure o backup do rc.2 em **Configurações → Dados e backup → Restaurar**, confira documentos, valores, imagens e preferências e só então publique essa base na nuvem vazia. Não use uma cópia anterior à revisão do candidato se quiser levar as alterações mais recentes. A restauração não conecta nem publica automaticamente no Supabase.

### Preparar o projeto

1. Entre em [Supabase Dashboard](https://supabase.com/dashboard), crie uma organização no plano **Free** e um projeto para sua empresa. Escolha a região mais próxima. Guarde a senha do banco separadamente.
2. Abra **SQL Editor**, crie uma consulta e cole o conteúdo de `schema.sql`. O aplicativo oferece **Configurações → Nuvem / Sincronização → Como configurar minha empresa na nuvem → Copiar configuração do banco**. Execute com **Run**. O script pode ser executado novamente para atualizar as funções; não apaga a base.
3. Em **Authentication → Users → Add user**, crie o usuário da empresa com e-mail e senha. Confirme o e-mail no painel (auto confirm). Essa senha será usada no aplicativo; ela não é a senha do banco nem o login administrativo do painel. Depois de criar a conta, você pode desabilitar novos cadastros públicos em Authentication.
4. No painel **Connect** ou em **Settings → API Keys**, copie a URL HTTPS do projeto e a chave **publishable**, normalmente começando com `sb_publishable_`. Projetos antigos também podem usar a chave pública `anon`. [Tipos de chave e localização no painel](https://supabase.com/docs/guides/getting-started/api-keys).
5. No computador que já tem seus dados, preencha URL, chave pública, e-mail e senha em **Nuvem / Sincronização**. Escolha **Publicar os dados locais em uma nuvem vazia**. A publicação exige uma base remota vazia e preserva os números já utilizados. Não coloque uma chave `secret`, `service_role` ou senha do banco no aplicativo.
6. Nos outros computadores, instale o aplicativo e preencha os mesmos dados. Escolha **Baixar a base da empresa**. Os dados locais anteriores serão guardados em backup antes de serem substituídos. Aguarde **0 alterações aguardando envio** e ausência de falhas.

## Conferência da conexão real

Crie um cliente de teste no primeiro computador e sincronize. Confirme que aparece no segundo. Crie uma proposta com uma foto, confirme sua prévia no segundo computador e consulte a linha do tempo. Desconecte a internet no computador responsável, salve uma alteração, feche/reabra o aplicativo e reconecte: a fila deve continuar presente e a alteração deve chegar ao outro computador uma única vez. Para transferir a edição, sincronize os dois, use **Versões e transferência**, escolha o destino e confirme a sincronização no novo responsável.

Confirme um pagamento parcial em um relatório de teste, sincronize e confira no segundo computador o recibo e o saldo. O recibo e o pagamento são enviados juntos. Ao terminar, cancele o recibo de teste antes de excluir seu relatório. Números utilizados continuam reservados e não serão reaproveitados.

## Capacidade, offline e backups

O plano Free oferece **500 MB de banco por projeto**; projetos gratuitos com pouca atividade podem ser pausados. Consulte [limites do plano](https://supabase.com/docs/guides/platform/billing-on-supabase) e [pausa de projetos](https://supabase.com/docs/guides/platform/free-project-pausing). Informações verificadas em 11/10/2026; o fornecedor pode alterar os limites.

Fotos e logos ficam no banco em texto Base64, sem Storage. Base64 acrescenta cerca de um terço ao tamanho original. As novas fotos são comprimidas e compartilhadas entre documentos/versões. O aplicativo alerta em 80% e 90% do limite; não apaga versões automaticamente.

Cada computador recebe blocos de 20 números por tipo e solicita mais quando restam cinco. Sem reserva ou com fotos necessárias ausentes, o documento continua como rascunho. Só o responsável pode editar definitivamente e emitir offline. Uma transferência interrompida mantém o bloqueio até confirmação online.

Faça backups em **Configurações → Dados e backup**. A cópia inclui imagens, versões, recibos e pagamentos, mas não transporta sessão, identidade do computador ou reservas offline. Restaure em um perfil local separado; a restauração não publica nem substitui automaticamente a nuvem. Documentos pertencentes ao computador anterior podem ser consultados ou copiados para criar documentos novos.

Se o projeto estiver pausado, reative-o no painel e sincronize. Se houver conflito, preserve a edição desejada criando uma cópia e use a conciliação apresentada no aplicativo. A adoção dos dados remotos cria antes um backup e concilia juntos o relatório e seus recibos/pagamentos vinculados.
