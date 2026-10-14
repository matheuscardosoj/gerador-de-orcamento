# Serviço central — preparação e validação

Estado: protocolo central instalado no projeto `gerador-orcamento`, função
`central-contas` publicada e template de código de acesso salvo. A validação
funcional continua pendente; não distribuir o aplicativo como versão final antes
de concluir os testes remotos e de recuperação listados abaixo.

## Projeto e migração

A estratégia aprovada em 13/10/2026 é adaptar o projeto `gerador-orcamento`
existente. O projeto `ecoplay` não participa desta mudança. Não contratar plano,
cadastrar cartão ou criar outra conta para contornar limites de projetos.

1. Concluir o ensaio local com uma cópia atualizada da base.
2. Exportar e verificar backup remoto e local; salvar e sincronizar ambos os PCs.
3. Fechar as versões antigas. Elas não enviam o contexto exigido pelo serviço central.
4. Aplicar `001_servico_central.sql` **uma vez**, sobre o protocolo 3. A transação
   mantém documentos, números, imagens, pagamentos e versões. A conta responsável
   pela empresa original passa a administrador. Se não puder identificar um
   administrador, a migração é revertida para conferência.
5. Registrar explicitamente o UUID da conta do operador em `central.operadores`.
   Não promover todos os membros a operador. Operadores ativam novas empresas;
   administradores gerenciam apenas suas empresas. A inserção deve ser autorizada
   pelo responsável da conta no momento da ativação.
6. Publicar a função `central-contas` e configurar o SMTP antes de enviar convites.
7. Distribuir apenas depois de testar login e sincronização em dois perfis.

O instalador recebe somente URL e chave **publishable**, em `servico.json`.
Senhas, chave administrativa e credenciais de e-mail nunca entram no pacote.

Após validar o serviço, definir `GERADOR_SERVICO_URL` e `GERADOR_SERVICO_CHAVE`
com esses dois dados públicos e executar `npm run dist:central`. O comando recusa
chaves secret/service_role e gera `resources/servico.json`, fora do Git. Para um
pacote legado, remover essa configuração de build antes de empacotar. Não
distribuir um pacote central contra um projeto que ainda use o protocolo 3.

## Envio pelo Gmail, sem cartão

No projeto, configurar Authentication → Email → SMTP Settings:

| Campo        | Valor                                               |
| ------------ | --------------------------------------------------- |
| Sender email | gerador.orcamentos.app@gmail.com                    |
| Sender name  | Gerador de Orçamentos                               |
| Host         | smtp.gmail.com                                      |
| Port         | 465                                                 |
| Username     | gerador.orcamentos.app@gmail.com                    |
| Password     | Senha de aplicativo, colada pelo operador no painel |

A senha normal do Gmail não deve ser usada. A senha de aplicativo permanece
somente no servidor. Não copiar para chat, código, logs, screenshots ou backups
do aplicativo. A verificação em duas etapas deve continuar habilitada.

Desativar cadastro público de usuários em Authentication. A função administrativa
prepara identidades somente após conferir um convite autorizado. O envio usa
Supabase Auth com `shouldCreateUser: false`, aproveitando os limites de envio e
os códigos de uso único do serviço. Recuperação usa o fluxo próprio de recuperação.

No projeto de produção `gerador-orcamento`, a conta
`matheuscardosoj@outlook.com` já foi registrada em `central.operadores` após
autorização explícita. O cadastro público ainda precisa ser conferido e, se
estiver ativo, desativado antes de distribuir o aplicativo.

Nos templates **Magic Link** e **Reset Password**, usar código em vez de exigir
um site externo de retorno. Corpo sugerido:

```html
<h2>Gerador de Orçamentos</h2>
<p>Digite este código no aplicativo para continuar:</p>
<p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>Não compartilhe este código. Se você não solicitou o acesso, ignore este e-mail.</p>
```

Limitar o volume inicialmente e testar entrega em Gmail e Outlook. Gmail gratuito
não oferece garantia de entrega nem capacidade ilimitada. Não implementar
tentativas ilimitadas nem contornar bloqueios. Se houver falha, preservar o
convite e permitir reenvio respeitando o intervalo mínimo.

Fontes: [Google — SMTP](https://support.google.com/mail/answer/7104828),
[senhas de aplicativo](https://support.google.com/accounts/answer/185833),
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[OTP](https://supabase.com/docs/reference/javascript/auth-signinwithotp).

## Critérios antes do lançamento

- Convite novo e existente; reenvio, cancelamento, expiração e tentativa com e-mail diferente.
- Recuperação e alteração de senha; não expor existência de conta na resposta pública.
- Logout, reinício com/sem lembrar e troca de empresa sem vazamento de cache ou sessão.
- Membro sem permissões administrativas, último administrador protegido e revogação online.
- Banco anterior restaurável, pendências preservadas e números/valores/imagens invariantes.
- E-mails recebidos de verdade; ter aceitação SMTP não comprova entrega na caixa de entrada.
- O template de código de acesso foi salvo. A recuperação foi enviada com sucesso,
  mas caiu no lixo eletrônico do Outlook; validar a classificação em Gmail e
  Outlook antes da entrega.
- Se a mensagem cair no lixo eletrônico, marcar “Não é lixo eletrônico” e salvar
  `gerador.orcamentos.app@gmail.com` como remetente confiável. Isso ajuda a
  classificação local, mas não garante entrega na caixa de entrada; Gmail gratuito
  e um endereço recém-criado têm reputação e limites de envio restritos.
- Conferir o pacote instalado e os dois computadores antes de autorizar versão final.
