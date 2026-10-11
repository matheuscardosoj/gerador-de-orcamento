# Validação do candidato 1.4.0-rc.1

Conferência realizada em 11 de outubro de 2026, na branch `claude`. O candidato
é um executável independente para revisão; o merge em `main` e o instalador
da versão final dependem da autorização do usuário.

## Código e interface

- 112 testes passaram, além de análise estática, formatação, tipos e compilação.
- 46 verificações da interface e de tamanhos de janela passaram. As prévias de
  proposta, relatório e recibo usam o mesmo componente e a mesma apresentação.
- Sincronização foi exercitada com dois perfis locais, funções PostgreSQL reais
  em PGlite e transporte simulado: reenvios, interrupções, conflitos, pagamentos,
  reservas de números e transferência de responsabilidade.

## Executável empacotado

O executável `release/candidato-1.4.0-rc.1/win-unpacked/Gerador de Orçamentos.exe`
passou novamente nos testes de aplicativo, exportação e migração.

- Os quatro tipos de documento foram exportados em PDF e DOCX.
- Recebimento de R$ 200 atualizou o saldo uma única vez. Custo com acréscimo de
  30% e repasse de Munck produziram R$ 2.900 antes do imposto.
- Uma proposta com 70 serviços foi exportada em cinco páginas sem perder itens.
  Cabeçalhos de tabela se repetem e linhas não são cortadas.
- Nomes de arquivos coincidem entre formatos; cópias recebem sufixo e cancelar
  uma substituição conserva o arquivo original.
- Script SQL, tutorial de migração e recursos de IA estão incluídos no pacote.

## Migração da instalação antiga

Uma cópia da base instalada, com esquema 6, foi migrada para esquema 7 pelo
executável candidato. Foram preservados 9 clientes, 14 propostas, 4 relatórios
e os bytes das 19 referências a fotos. Todos os documentos existentes ganharam
uma versão inicial. O backup anterior à migração foi conferido, e o hash do
banco original permaneceu inalterado.

## Conferência de documentos

PDFs e cópias dos DOCX foram renderizados e conferidos visualmente no Word 2024.
Proposta e relatório com fotos ficaram com três páginas em ambos os formatos;
a proposta de 70 serviços ficou com cinco. Cobrança e recibo ficaram com uma
página A5 horizontal, logo e espaço para assinatura. O conteúdo por página dos
recibos coincidiu entre PDF e Word. Também foram conferidos anteriormente recibos
extensos, cliente somente com nome e logo horizontal, incluindo a correspondência
do conteúdo por página com a prévia.

As evidências locais estão em `output/playwright/` e
`output/document-qa-candidato/`. São artefatos de teste, não dados de produção.

## Teste pelo usuário e validação pendente

O atalho `release/candidato-1.4.0-rc.1/Testar Gerador de Orçamentos.lnk` abre
o candidato usando `perfil-de-teste`, que contém uma cópia da base antiga.
Alterações nessa cópia não atualizam a instalação de uso.

A conexão ao Supabase real será validada depois da revisão deste candidato,
conforme a escolha do usuário. O projeto da empresa ainda precisa ser criado.
O tutorial `supabase/CONFIGURACAO.md` começa pela migração da instalação antiga e
publicação da base local em um projeto remoto vazio. A revisão de interface pelo
usuário, a validação remota e a autorização para merge/versão final continuam
pendentes.
