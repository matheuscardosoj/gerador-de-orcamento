# Testar a colaboração em dois computadores

Use a versão **1.5.0-rc.1 nos dois computadores**. O primeiro já está conectado e contém a base migrada. O instalador inclui a IA local; copie somente o instalador para o segundo computador, por pendrive ou pela sua rede.

## 1. Preparar o segundo login

1. No painel do projeto Supabase, abra **Authentication → Users → Add user** e escolha **Create new user**.
2. Informe outro e-mail e defina a senha diretamente no painel. Ative a confirmação automática do e-mail, quando essa opção estiver disponível, e conclua a criação. Não envie a senha no chat.
3. No primeiro computador, abra **Configurações → Usuários → Vincular usuário**. Informe o e-mail criado e um nome que identifique a pessoa. Confirme que o usuário aparece como **Ativo**.

Uma conta criada no Supabase precisa também ser vinculada à empresa no aplicativo. Cada pessoa usa seu próprio login; não compartilhe a senha da primeira conta.

## 2. Conectar o segundo computador

1. Copie e execute **Gerador de Orçamentos Setup 1.5.0-rc.1.exe** no segundo computador. Se ele já possui dados locais, exporte um backup antes de atualizar.
2. Abra **Configurações → Nuvem / Sincronização**. Copie a URL do projeto e a chave pública publishable do primeiro computador; use o e-mail e a senha do **segundo usuário**.
3. Na primeira conexão, escolha **Baixar a base da empresa** e clique em **Conectar**. Não escolha publicar os dados locais: a base da empresa já está no Supabase.
4. Aguarde **Tempo real: conectado**, **0 alterações aguardando envio** e ausência de erros/conflitos.
5. Antes de cadastrar novos documentos, confira nos dois computadores as **mesmas quantidades atuais**, os mesmos números oficiais e IDs internos. Na migração havia 17 orçamentos, 4 relatórios e 3 recibos; documentos criados depois também devem aparecer nos dois. Filtros salvos podem esconder registros; use **Limpar filtros** para conferir a listagem.

Não restaure o backup do primeiro computador para configurar a conexão. O download usa a nuvem e registra a identidade própria do segundo computador.

## 3. Testar a atualização após salvar

1. Nos dois computadores, abra **Cadastros → Clientes**.
2. No primeiro, crie um cliente chamado **Teste de sincronização**. Somente o nome precisa ser preenchido.
3. Clique em **Salvar**. O cliente deve aparecer no segundo computador sem clicar em sincronizar nem trocar de tela. A meta é até dois segundos após a confirmação, em conexão estável.
4. No segundo, altere o nome desse cliente para **Teste de sincronização — segundo usuário** e salve. Confira a mudança no primeiro.
5. Não use esse cliente em propostas ou pagamentos durante este teste.

Texto ainda sendo digitado não é compartilhado: a atualização ocorre após salvar. Preferências dos históricos são próprias de cada computador.

## 4. Testar o controle de edição

1. Escolha o mesmo orçamento existente nos dois computadores. Abra primeiro no computador A, aguarde a autorização e só depois abra no B. Não altere valores nem confirme pagamentos.
2. No B, confira que o controle identifica o usuário/computador A. Use **Solicitar edição**; o pedido deve aparecer no A.
3. No A, libere a edição ou transfira para o computador B. No B, confirme que o controle passou para seu usuário.
4. Se precisar manter uma alternativa, use **Guardar rascunho** ou preserve a edição como rascunho. Isso não substitui o documento da empresa.
5. Ao terminar, volte ao histórico para liberar a edição online. Não use **Recuperar controle** como primeira opção: essa ação revoga a autorização anterior.

## 5. Testar reconexão

1. No B, desconecte a internet e deixe o aplicativo aberto no histórico de clientes.
2. No A, altere novamente o nome do cliente de teste e salve.
3. Reconecte o B. A alteração deve chegar automaticamente, mesmo que ele tenha perdido o aviso enquanto estava desconectado.
4. Feche e reabra o B; confirme que os dados e as preferências locais continuam presentes.

Para editar e emitir documentos offline, use **Preparar offline** enquanto conectado. Esse fluxo envolve autorização exclusiva e reservas de números. Novos documentos, emissões e pagamentos consomem identificações permanentes; os testes financeiros completos devem usar uma base de validação, separada da empresa.

## Registrar o resultado

Informe a versão nos dois computadores e se ocorreram estes resultados:

- Mesmos documentos, números e IDs após o primeiro download.
- Atualização do cliente nos dois sentidos, sem recarregar a tela.
- Pedido de edição e liberação/transferência visíveis ao outro usuário.
- Recuperação da mudança após reconectar.
- Zero pendências, conflitos ou erros inesperados.

Se algum passo falhar, pare nesse ponto e informe o texto do erro e em qual computador aconteceu. A validação entre duas máquinas só será considerada concluída após conferir esses resultados.
