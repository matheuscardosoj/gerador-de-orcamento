# Teste acompanhado em dois computadores e troca de e-mail

Use somente a empresa descartável e contas de teste. Os dois computadores devem usar o mesmo pacote atualizado. O instalador rc.11 gerado às 09:04 de 14/10/2026 não contém as correções concluídas depois dele. Identifique os computadores como A e B e anote a versão exibida na barra lateral.

## 1. Entrada e cadastros

1. Entre na empresa de teste nos dois computadores. Clique em Sincronizar e aguarde a conclusão.
2. No A, crie o cliente `VALIDAÇÃO A` e o serviço `VALIDAÇÃO A`, com descrição `Descrição inicial`, unidade `hora` e preço 123,45.
3. Sincronize A e B. No B, confira nome, código, descrição, unidade e preço. Os códigos devem ser iguais aos do A.
4. No B, altere a descrição para `Alterado no B` e o preço para 234,56. Sincronize e confira no A.
5. Desconecte a internet do B e crie um cliente, um serviço e um orçamento novos com o nome `VALIDAÇÃO OFFLINE`. Feche e reabra o aplicativo: eles devem continuar salvos. Reconecte, sincronize e confira no A. A numeração definitiva do documento pode aguardar a nuvem; editar documento existente sem preparação offline pode exigir conexão.

## 2. Exclusão durante edição e rascunho

1. No A, crie e salve um orçamento e um relatório de teste. Sincronize os dois computadores.
2. Abra o relatório no B e obtenha a edição pelo fluxo normal. Acrescente `Texto não salvo no B`, sem salvar.
3. No A, obtenha o controle necessário pelo fluxo normal e tente excluir. Se o aplicativo exigir autorização de edição, registre a mensagem; não force a operação no banco nem exclua também no B.
4. Após a exclusão autorizada, o B deve sair do documento e avisar que preservou o trabalho local. O relatório não deve reaparecer depois de sincronizar.
5. No histórico do B, encontre **Rascunhos locais recuperáveis** e use **Criar outro relatório**. O texto deve ser recuperado em outro ID/documento. Sincronize e confira no A.
6. Repita com orçamento. Para recibo, use apenas um recibo de teste pendente, sem pagamentos reais.

## 3. Troca real de e-mail

1. Use uma conta descartável e dois endereços de e-mail que você controla. Não envie ao chat senha, código ou URL de confirmação.
2. Com o aplicativo aberto, entre em Configurações → Minha conta. Informe o novo e-mail e sua senha atual; envie a confirmação.
3. Abra o link recebido em um dos endereços. Ele deve retornar ao aplicativo e informar que ainda falta a outra confirmação. Não deve declarar falha definitiva nem pedir um novo envio nesse momento.
4. Feche completamente o aplicativo. Abra o link do outro endereço: o aplicativo deve iniciar e informar a conclusão após conferir o e-mail efetivo no Supabase.
5. Entre em Minha conta e confira o novo e-mail. Saia e entre novamente com ele. Verifique também o acesso à empresa de teste.
6. Abra novamente um link já usado. O app não deve trocar de conta, desfazer a mudança ou registrar tokens. Se o link expirar, deve apresentar uma orientação clara.
7. Confira se o aviso integrado desaparece sozinho e se as etapas continuam disponíveis em Minha conta.

## Registro dos resultados

Informe qual passo executou, em qual computador, e o resultado observado. Se houver falha de sincronização, copie somente a mensagem e o código de erro mostrados nos detalhes técnicos; oculte dados pessoais. Não use a restauração pela nuvem nem descarte a fila antes de registrar a falha. Na restauração autorizada, escolha um destino acessível para a cópia e confirme que o arquivo existe antes de reutilizá-lo.

Os resultados destes passos são a validação das instalações reais; os testes automatizados anteriores não os substituem.
