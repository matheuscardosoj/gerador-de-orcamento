# Correções e validação — 14/10/2026

As alterações locais anteriores foram preservadas na branch `claude`. Não houve commit, instalador nem publicação. O diff contra HEAD reúne o trabalho anterior e esta conclusão; ele não deve ser tratado como contendo apenas alterações desta etapa.

## Implementação concluída nesta etapa

- Cada custo avulso pode usar lucro geral, percentual próprio não negativo ou nenhum lucro. O próprio substitui o geral, com imposto sobre o subtotal. A mesma janela atende orçamento e relatório. O campo opcional `acrescimoPersonalizadoPercent` preserva cálculos antigos; custos sem lucro e com percentual próprio compõem o custo do serviço, enquanto o lucro geral permanece destacado.
- A revisão de códigos locais continua pendente enquanto houver operações ativas ou códigos inválidos. A reconferência lê clientes e serviços já conhecidos sem alterar seus outros campos. A função remota também entrega o código de clientes antigos cujo `campos_presentes` não o continha.
- Restauração: o destino é escolhido pelo usuário, o backup é validado antes da substituição e o banco ativo não pode ser escolhido como destino. Cancelamento, falha do backup e falha durante a transação preservam os dados locais.
- Sucessos transitórios de conta, convites e restauração desaparecem em 8 segundos; avisos gerais já usam 8 segundos e os de e-mail 12 segundos. Erros e conflitos não resolvidos permanecem na página correspondente. Atualizações da tela não reiniciam o prazo de uma mensagem com o mesmo texto.
- Foi corrigida a formatação pendente.

As implementações anteriores mantidas incluem criação de padrões pela empresa, rascunhos acessíveis nos históricos, confirmação positiva de acesso, liberação de estado ocupado em `finally`, sidebar com sincronizar/sair, largura da conta, botão de senha insetado, retirada da aba de numeração e callback de e-mail integrado ao aplicativo.

## Testes e interface

`npm run check` passou: lint, formatação, tipos, 51 arquivos / 295 testes e compilação. Os testes isolados usam SQLite e funções PostgreSQL em PGlite, com dois perfis/logins. Cobrem envio offline, conflitos, exclusão remota, identidade de reenvios, transferência de edição, códigos antigos e novos e preservação de backup.

O cálculo cobre percentual próprio, geral e zero, repasse, dias, centavos, imposto simples e gross-up. Lucro geral e próprio aceitam percentuais acima de 100%; imposto e encargos continuam limitados por regra tributária. O cancelamento da restauração, erro de cópia e erro SQL durante a substituição são exercitados de verdade em base descartável.

`node scripts/legado/verificar-rc11-interface.mjs` utiliza Playwright, uma janela Electron real e API de demonstração em perfil descartável. Testa orçamentos, relatórios, recibos, cadastros e configurações em 1024 e 1600 px; verifica que a página não extravasa e salva capturas. Confirma o cancelamento e a exclusão local de um rascunho de conflito, a ausência das linhas antigas no resumo e R$ 1.000 com lucro próprio de 150% como R$ 2.500 em **Custo do serviço**. Verifica também a saída temporizada de sucesso e a posição do botão de senha durante hover. Não usa IPC de produção nem banco de usuário.

Capturas e medidas: `output/playwright/rc11-interface/`. O JSON registra a largura da página e das tabelas. A rolagem horizontal é interna à tabela; textos extensos permanecem dentro das células.

## Backup e migração 007

O acesso direto falhou por DNS/IPv6. A conexão Session Pooler fornecida pelo painel (`aws-0-us-east-1.pooler.supabase.com:5432`) funcionou com a credencial já disponível localmente. Nenhuma senha foi impressa ou incluída em arquivos de entrega.

Backup novo: `output/backup-privado-supabase-007/pre-007.dump`, 9.413.161 bytes, SHA-256 `CC56DC548C86CBAD9429B605E94C8DAF8A14A0C92A9E58534C11C177C396253C`. É um dump completo customizado do pg_dump, contém dados privados e está ignorado pelo Git. O catálogo foi lido por pg_restore. Dados, tabelas, sequências, índices e restrições de `auth`, `public` e `sincronizacao` foram recuperados em PostgreSQL 18 isolado. Contagens da origem e restauração: 14 clientes, 5 serviços, 2 empresas, 4 usuários, 28 códigos e 108 entidades. As extensões, serviços e funções gerenciadas da plataforma Supabase não foram reproduzidos integralmente neste ensaio.

A definição efetiva antiga de `sincronizacao.linhas` foi arquivada. A comparação identificou omissão dos códigos de serviço e cliente. O ensaio em dados restaurados confirmou códigos corretos e um padrão de cada tipo para empresa nova; a transação de teste foi revertida. A migração foi aplicada ao projeto compartilhado em transação, com COMMIT confirmado. Ela altera função e gatilho, sem atualizar registros existentes. A verificação posterior confirmou gatilho ativo, códigos corretos na empresa descartável e as mesmas contagens gerais.

SQL aplicado: `supabase/migrations/007_padroes_empresa_e_codigo_servico.sql`. Evidências e manifesto: `output/backup-privado-supabase-007/`. A instância PostgreSQL isolada foi parada.

## Conferência de padrões existentes

A empresa mostrada como EMPRESA TESTE no aplicativo é identificada no banco como `Teste`, ID `e757b50f-ba24-4724-994f-f25a10deade4`. Leitura remota encontrou uma observação (`c4fcdc77-3f7a-44c3-881b-3b1cf84a975c`, uma referência em textos) e um pagamento (`913b855b-cf01-4ad9-a0c2-d70a23fb49d4`, nenhuma referência). Nenhum duplicado remoto foi encontrado ou removido. Bancos locais dos usuários não foram abertos; duplicados locais antigos ficam para conferência ou restauração explícita com cópia escolhida.

## Reversão

O arquivo exato `output/backup-privado-supabase-007/reversao.sql` restaura a função anterior e retira o novo gatilho em uma transação. Foi executado com sucesso somente no PostgreSQL isolado. Não altera padrões existentes. Antes de usá-lo no projeto ativo, parar sincronização, obter backup novo, comparar a função atual com a 007 e executar com ON_ERROR_STOP. A reversão volta a omitir os códigos no delta; não é solução para conflitos de dados. Recuperação de registros deve ser ensaiada em ambiente Supabase isolado, com restauração seletiva, sem pg_restore --clean no projeto ativo.

## Limites explícitos

- Os testes entre dois perfis exercitam funções reais isoladas; duas instalações em computadores físicos, com a fila real da empresa descartável, não foram controladas nesta etapa.
- Os dois links reais de troca de e-mail com o app fechado/aberto não foram reenviados nem confirmados. Callback, destino e duas etapas têm testes locais; não há prova nova da entrega dos e-mails.
- As capturas usam API de demonstração. Não comprovam o diálogo nativo de arquivo nem o IPC de autenticação instalado. O caminho escolhido e a segurança da restauração são cobertos por testes de backend.
- Duplicados antigos locais não foram apagados ou unidos automaticamente. A nuvem de teste não tem duplicação desses padrões.
