# Nuvem da empresa — protocolo 3 / esquema local 11

> Este guia descreve a configuração existente por projeto da empresa. O acesso
> central para múltiplas empresas está em desenvolvimento; não use seus scripts
> em produção antes da validação e da entrega autorizada.

Use um projeto Supabase por empresa. Cada pessoa pode ter seu próprio login, vinculado à mesma empresa em **Configurações → Usuários**. Todos os membros ativos têm acesso completo; não é possível remover o último membro ativo. Preferências dos históricos e configuração da IA permanecem locais.

## Atualizar a base que você já usa

### Sua base já está no Supabase

1. Sincronize todos os computadores, resolva pendências e exporte um backup em **Dados e backup**. Salve as edições e feche todos os aplicativos.
2. Guarde uma exportação remota verificada. O ensaio `scripts/verificar-migracao-colaboracao.mjs` compara essa cópia em PostgreSQL isolado, incluindo documentos, valores, imagens, versões e reservas.
3. No SQL Editor do projeto existente, execute **schema-colaboracao.sql inteiro**, incluído com a atualização. O botão **Copiar configuração do banco** fornece esse script. Não publique novamente a base nem apague tabelas.
4. Na passagem de um protocolo anterior para o protocolo 3, a migração autorizada organiza a numeração dos documentos atuais de 1 em diante por tipo, registrando mapa e novas versões. Preserva chaves técnicas, pagamentos, imagens e versões antigas com os números anteriores. A conta atual torna-se o primeiro membro. Reexecutar o script não repete a renumeração.
5. Atualize **todos os computadores para 1.5** antes de editar. Gravações antigas são bloqueadas pelo servidor para proteger edição e pagamentos. O SQLite local migra automaticamente para o esquema 11, com backup verificado anterior à mudança.
6. Abra a versão atualizada com o mesmo usuário do Windows. A base e a sessão existentes continuam na pasta de dados. Confira **0 alterações aguardando envio**, ausência de conflitos e **Tempo real conectado**. Confira documentos e números nos históricos. Se houver operações antigas preservadas, revise a atualização antes de adotar a base; não serão enviadas automaticamente.

Um erro no SQL deve reverter a transação. Não execute novamente o esquema antigo após concluir a migração. Restauração local e restauração da nuvem são operações distintas: preserve os backups e investigue o erro antes de publicar dados.

### Sua base ainda é somente local

1. Exporte um backup da base com suas últimas edições, incluindo o candidato que você já usa. Feche o app e atualize no mesmo usuário do Windows. Não restaure um backup antigo sobre a base atual.
2. A migração local cria backup verificado e preserva documentos. Confira clientes, empresa/logo, valores, fotos, recibos e versões. Exporte uma cópia atualizada.
3. Prepare um projeto Supabase **vazio**. No computador com a base correta, escolha **Publicar os dados locais em uma nuvem vazia**. Preserva números oficiais e arquivos de documentos excluídos. Não selecione baixar uma base vazia sobre seus dados.
4. Aguarde e confira documentos e versões. Nos demais computadores, escolha **Baixar a base da empresa**. Dados locais anteriores ficam em backup antes do download.

## Projeto e contas

1. Entre no [painel Supabase](https://supabase.com/dashboard), crie o projeto da empresa e escolha região próxima. Guarde a senha do banco separadamente.
2. Execute **schema-colaboracao.sql completo** em uma nova consulta no SQL Editor, com **Run**. Não é necessário Storage: imagens ficam em Base64 nas tabelas.
3. Em **Authentication → Users**, crie e confirme a primeira conta com e-mail e senha. A senha da conta será digitada no app; não é a senha administrativa do banco.
4. Copie a URL HTTPS e a chave pública **publishable**. Não use chave secret, service_role ou senha do banco no app. Consulte os [tipos de chave](https://supabase.com/docs/guides/getting-started/api-keys).
5. Conecte o primeiro computador e publique a base em uma nuvem vazia. Não use esse modo para substituir uma nuvem já conectada.
6. Para outra pessoa, crie e confirme sua conta em Authentication. No app, um membro atual abre **Configurações → Usuários**, vincula seu e-mail e nome. Essa pessoa conecta com a mesma URL/chave pública e seu próprio login, escolhendo baixar a base.
7. O script configura leitura do canal privado por membros ativos. Em **Realtime → Settings**, prefira somente canais privados. Não é necessário adicionar as tabelas a uma publicação Postgres Changes: o app usa Broadcast. Consulte [Broadcast para mudanças](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) e [autorização Realtime](https://supabase.com/docs/guides/realtime/authorization).

## Onde estão os dados

Em **Table Editor → public**, consulte:

| Tabelas                                                                   | Conteúdo                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| empresas, membros_empresa                                                 | Empresa e pessoas vinculadas                            |
| clientes, servicos                                                        | Clientes e catálogo; apenas nome obrigatório no cliente |
| orcamentos, itens_orcamento, materiais_orcamento, textos_orcamento        | Propostas, valores e condições                          |
| relatorios, itens_relatorio, lancamentos_relatorio, textos_relatorio      | Serviços executados, adiantamentos, reembolsos e saldo  |
| recibos, recebimentos                                                     | Cobranças, recibos e lançamentos, incluindo estornos    |
| imagens, anexos_orcamento, anexos_relatorio                               | Imagens em texto e referências                          |
| documentos, versoes_documentos, imagens_versoes                           | Registros permanentes, snapshots e fotos das versões    |
| numeros_documentos, numeros_emitidos, mapa_numeracao, migracoes_numeracao | Números definitivos e auditoria da organização inicial  |
| autoria_documentos                                                        | Autoria vinculada às chaves técnicas dos documentos     |
| computadores, dispositivos_usuarios                                       | Dispositivos e usuários vinculados                      |
| edicoes_documento, pedidos_edicao, auditoria_colaboracao                  | Controle de edição, solicitações e autoria              |
| observacoes_padrao, formas_pagamento_padrao, configuracoes_empresa        | Padrões comerciais                                      |

Detalhes do transporte ficam no schema **sincronizacao**. **gdo_entities** é uma consulta que reconstrói dados a partir das tabelas, sem outra cópia das imagens. Edite pelo app para manter versões, números e pagamentos consistentes.

## Identificação

- **Nº do documento:** único identificador visível, com sequência independente por empresa e tipo. O servidor confirma o número ao aceitar o primeiro salvamento.
- **Chave técnica:** oculta e permanente; mantém os vínculos entre documentos, imagens, pagamentos e versões.
- **Numeração dos documentos:** mostra último número atribuído e próximo previsto. Avançar a sequência cria um salto intencional. Rascunhos podem receber correções validadas; números emitidos ficam protegidos.
- Documentos novos offline ficam **Aguardando numeração**. Podem ser editados e salvos como rascunhos; a emissão oficial aguarda a sincronização.
- A migração para protocolo 3 organiza os documentos atuais de 1 em diante por tipo, cria novas versões e conserva as versões anteriores com os números originais. Depois da migração, exclusões não renumeram os demais documentos.

O protocolo 3 não distribui novas faixas antecipadas. Números utilizados ou abandonados não são reutilizados. Alterar a sequência futura não modifica documentos existentes; excluir um documento não renumera os demais.

## Atualizações e edição

Ao salvar, a operação entra na fila local e é enviada imediatamente. Após confirmação do banco, um aviso pequeno no canal privado dispara consultas nos demais computadores. Texto ainda sendo digitado não é transmitido. A meta é aparecer em até dois segundos com conexão estável; a latência depende da rede e do serviço.

Históricos/cadastros atualizam preservando preferências. Documento aberto sem alterações locais atualiza automaticamente; com alterações não salvas, mostra aviso e preserva o formulário. Reconexão, reinício e renovação da sessão recuperam mudanças. Há consulta incremental de segurança a cada cinco minutos e retentativas breves após falha transitória.

O bloqueio online dura 120 segundos e renova a cada 30 enquanto o editor está aberto. Use **solicitar edição**, **liberar**, **transferir** ou **recuperar controle**. Outra pessoa pode guardar uma cópia de trabalho sem sobrescrever o documento da empresa.

Antes de perder a internet, use **Preparar offline**. Sincroniza conteúdo, fotos e dependências, guarda a revisão de partida e reserva autorização exclusiva de usuário/computador para emissão e operações financeiras. Relatório e recibos relacionados são protegidos em conjunto. A autorização offline continua exclusiva; documentos novos recebem o número definitivo somente ao sincronizar.

Recuperar controle revoga a geração anterior no servidor. Um computador desconectado descobre a revogação ao reconectar; seu trabalho fica como rascunho para comparar ou copiar. A recuperação não libera números já utilizados para reutilização.

## Conflitos e pagamentos

Compare o rascunho com a base e com a versão atual. Mudanças independentes de conteúdo são combinadas; disputas no mesmo campo exigem escolha. Alterações de preço são comparadas em conjunto para manter quantidade, valor e cálculo coerentes. Retomar versão antiga cria nova revisão, preservando as posteriores.

Pagamentos, estornos e quitação não são restaurados por uma versão textual. Use **Revisar recebimentos** no editor para conferir operações e escolher reaplicar o que continua pendente ou arquivar a intenção local. Valores/vínculos divergentes bloqueiam reaplicação; operações já confirmadas não são contabilizadas novamente. Backup, rascunho e auditoria preservam o trabalho anterior.

## Capacidade e backups

O plano Free oferece 500 MB de banco; pouca atividade pode pausar projetos. Limites podem mudar: consulte [capacidade](https://supabase.com/docs/guides/platform/billing-on-supabase) e [pausa](https://supabase.com/docs/guides/platform/free-project-pausing).

Base64 acrescenta cerca de um terço aos bytes originais. Fotos novas são comprimidas/deduplicadas. O app alerta em 80% e 90% e não apaga versões automaticamente.

Backups incluem documentos, imagens, versões, recebimentos, rascunhos, chaves técnicas e preferências locais. Não transportam sessão, dispositivo, bloqueios ou autorização offline. Operações não confirmadas são preservadas na auditoria do backup, sem republicação automática ao restaurar ou mesclar. Restaurar não publica nem substitui automaticamente a nuvem. Guarde a cópia anterior à migração e teste restauração em perfil separado.

## Conferência entre computadores

Use dois logins vinculados e dois computadores atualizados. Salve uma alteração e confira o outro histórico; teste documento limpo e formulário alterado. Teste solicitação, transferência, preparação offline, reconexão e conciliação. Faça pagamentos de teste em base separada para evitar consumo de números e registros financeiros na empresa.

Se o canal estiver indisponível, fila e recuperação periódica continuam. Se o projeto estiver pausado, reative-o no painel. Para confirmar toda a base na nuvem, confira zero pendências, ausência de erros/conflitos e comparação de documentos, valores, versões, imagens e recebimentos.
