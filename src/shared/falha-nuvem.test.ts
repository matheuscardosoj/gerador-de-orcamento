import { expect, it } from 'vitest'
import { classificarFalhaNuvem } from './falha-nuvem'

it.each([
  [new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }), 'transporte', true],
  [Object.assign(new Error('indisponível'), { status: 503 }), 'servico', true],
  [Object.assign(new Error('limite'), { status: 429 }), 'servico', true],
  [Object.assign(new Error('token inválido'), { status: 401 }), 'sessao', false],
  [Object.assign(new Error('sem acesso'), { status: 403 }), 'permissao', false],
  [Object.assign(new Error('atualizar base'), { codigo: 'GDM02' }), 'manutencao', false],
  [new Error('Conflito de sincronização'), 'conflito', false],
  [new Error('Preencha o nome.'), 'validacao', false]
])(
  'classifica %s sem interpretar o texto já formatado da interface',
  (erro, motivo, temporaria) => {
    expect(classificarFalhaNuvem(erro)).toMatchObject({ motivo, temporaria })
  }
)
