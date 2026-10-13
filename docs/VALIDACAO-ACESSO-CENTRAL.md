# Acesso central — validação de 13/10/2026

## Implementado no código

- Login, opção de manter conectado, saída e entrada com outra conta.
- Perfis locais separados por projeto, empresa e usuário; espera das operações
  da conta anterior antes de trocar o banco e a sessão.
- Minha conta, alteração de nome e senha, convites, papéis de acesso e primeiros
  passos com nome da empresa e logo, usando os componentes visuais existentes.
- Operações antigas em uma seção recolhida, sem tratá-las como falha atual.
- Novas bases sem identidade, clientes ou dados bancários da empresa original.
- Migração incremental para contexto por empresa, proteção do último
  administrador e função de convites com credenciais somente no servidor.
- Configuração pública do serviço no pacote, sem exigir URL/chave do usuário.
- Cadastro de clientes extraído para repositório próprio, documentação das
  fronteiras entre módulos e pacote restrito ao código compilado e recursos.

## Evidências locais

`npm run check` passou: lint, formatação, TypeScript, 268 testes em 45 arquivos e
compilação. Permanecem avisos de importações estáticas e dinâmicas já compartilhadas.
Esse comando cobre o aplicativo e os testes SQL; não executa a função Edge no
ambiente remoto do Supabase.

Os testes incluem autorização antes do login, separação física de perfis,
troca/reabertura da base, espera da renovação de sessão, permissões SQL,
proteção do último administrador, aceitação de convites por destinatário e
persistência da identidade das solicitações para repetir envios sem duplicar empresas.
A migração SQL foi exercitada em PGlite com dados de teste, não na produção.

A tela Minha conta foi conferida na prévia demonstrativa, incluindo a confirmação
de alterações não salvas. Isso não substitui os testes de autenticação real.

## Organização dos arquivos do usuário

Oito artefatos antigos foram preservados em
`Downloads/Gerador de Orcamentos/Arquivo de versoes anteriores`, com comparação
SHA-256 antes/depois e inventário JSON. O atalho atual e o backup pessoal foram
mantidos. Não houve exclusão desses arquivos nem liberação de espaço alegada.

## Pendências obrigatórias da entrega

1. Concluir SMTP no painel com a senha de aplicativo informada pelo usuário e
   testar recebimento efetivo, código, reenvio e recuperação. O formulário foi
   preparado, mas salvar a credencial não foi confirmado.
2. Ensaiar a migração com uma cópia atualizada da base compartilhada e comparar
   documentos, numeração, valores, pagamentos, imagens e versões. Guardar backup
   restaurável e confirmar que os dois computadores estão sincronizados e fechados.
3. Publicar SQL e função central, configurar templates e cadastro por convite;
   registrar o operador explicitamente. O projeto ecoplay está fora do escopo.
4. Validar a conta do operador sem empresa vinculada, repetição após perda da
   resposta ao criar empresa, expiração/revogação e alterações simultâneas.
5. Validar o executável em perfis separados, SMTP real e dois computadores.
   Só então gerar e entregar o candidato central. Manter a versão anterior
   funcionando até a troca coordenada.

Não foi realizado merge para main, publicação de versão final ou migração real.
