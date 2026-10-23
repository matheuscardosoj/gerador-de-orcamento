# Validação da rc.20 — resumo do cálculo e preço desejado

Data: 16/10/2026

Branch: `claude`
Versão: `1.5.0-rc.20`

## Alterações

- O detalhamento do resumo é uma área única, com divisões discretas entre **Custos do serviço** e **Outros custos e repasses**.
- O quadro financeiro mostra **Custo do serviço**, **Outros custos e repasses**, **Lucro**, imposto habilitado e **Preço final**. O lucro geral dos itens avulsos fica incorporado ao grupo de outros custos e não é contado outra vez na linha Lucro.
- A meta de preço inicia preenchida com o preço calculado quando a entrada ainda não tem uma meta salva. Percentual geral e meta continuam sincronizados automaticamente.
- Reduzir a meta recalcula o percentual geral até zero. Percentuais próprios e repasses são preservados. Abaixo do mínimo, aplica o mínimo com imposto, mantém a meta digitada e mostra um aviso.
- O estado de meta abaixo do mínimo pode ser salvo e reaberto quando lucro geral e complemento estão zerados e o preço calculado corresponde ao piso.
- O motor compartilhado atende orçamento e relatório sem alterar o formato salvo de entrada dos cálculos anteriores.

## Verificações

- `npm run check`: lint, Prettier, TypeScript, build e 359 testes em 66 arquivos aprovados.
- `node scripts/legado/verificar-rc20-calculo.mjs`: fluxo de orçamento e relatório exercitado com API simulada. Conferidos valor próprio de R$ 750, valor geral de R$ 1.000, exemplo com imposto a 6% (custo de serviço R$ 1.000, outros custos R$ 1.000, lucro R$ 1.000, imposto R$ 191,49, preço final R$ 3.191,49), meta abaixo do mínimo, salvamento/reabertura, prévia e exportações PDF/DOCX.
- O roteiro visual verificou larguras de 1024 e 1600 px, ambas sem rolagem horizontal da página.
- `node scripts/legado/verificar-rc20-pacote.mjs`: executável extraído abriu com perfil temporário isolado, reportou `1.5.0-rc.20` e não teve erros de renderer.
- A meta mínima foi validada para os dois métodos de imposto; repasses e custos por dia seguem cobertos pelo conjunto de testes do motor.
- Supabase e dados da VS não foram alterados.

## Instalador

- Pacote: `output/instalacao-teste-1.5.0-rc.20/Gerador de Orçamentos Setup 1.5.0-rc.20.exe`
- Cópia no compartilhamento do N: `F:\Users\Public\Downloads\Gerador de Orçamentos Setup 1.5.0-rc.20.exe`
- Tamanho: 1.222.559.283 bytes
- SHA-256 nas três localizações (release, pasta local de entrega e compartilhamento): `15A1E1F7183374872C50322FF75A15092B67F293B042EBF488A39C46B14606C1`

## Limite da validação

A inicialização isolada e os fluxos automatizados simulados passaram. A rc.20 ainda precisa ser instalada e testada manualmente em D-MATHEUS e N-MATHEUS; ela não está declarada validada para uso até esses testes reais.
