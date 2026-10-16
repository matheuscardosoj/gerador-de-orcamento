import type { StatusNuvem } from './evolucao'

export interface ResumoSincronizacao {
  titulo: string
  descricao: string
  tom: 'info' | 'aviso' | 'sucesso'
}

export function resumirSincronizacao(s: StatusNuvem | null): ResumoSincronizacao {
  if (!s)
    return {
      titulo: 'Verificando sincronização…',
      descricao: 'Aguarde enquanto conferimos a conexão deste computador.',
      tom: 'info'
    }
  if (!s.configurada)
    return {
      titulo: 'Dados neste computador',
      descricao: 'Configure a sincronização para compartilhar os dados com sua equipe.',
      tom: 'info'
    }
  if (!s.autenticada)
    return {
      titulo: 'Entre novamente na conta',
      descricao: 'Seus dados continuam neste computador. Entre para retomar a sincronização.',
      tom: 'aviso'
    }
  if (s.conexao === 'inacessivel' || s.falhaSincronizacao?.temporaria)
    return {
      titulo: 'Sem acesso à nuvem',
      descricao:
        'As alterações locais estão preservadas. A conexão será verificada e o envio retomado automaticamente.',
      tom: 'aviso'
    }
  if (s.sincronizando)
    return {
      titulo: 'Sincronizando…',
      descricao: 'Conferindo alterações e confirmações na nuvem.',
      tom: 'info'
    }
  if (s.atualizacaoPendente)
    return {
      titulo: 'Este computador precisa ser atualizado',
      descricao:
        'Confira os registros preservados abaixo para recuperar a versão atual dos dados da empresa.',
      tom: 'aviso'
    }
  if (s.conflitos.length)
    return {
      titulo: 'Alterações precisam de revisão',
      descricao: 'Há edições diferentes do mesmo registro. Compare as versões antes de continuar.',
      tom: 'aviso'
    }
  if (s.falhas?.length)
    return {
      titulo: 'Uma alteração precisa de atenção',
      descricao: 'Confira o registro abaixo. Outras alterações continuam sendo sincronizadas.',
      tom: 'aviso'
    }
  if (s.erro)
    return {
      titulo: 'Sincronização interrompida',
      descricao: 'Os dados locais estão preservados. Confira a mensagem abaixo para retomar.',
      tom: 'aviso'
    }
  if (s.pendentes)
    return {
      titulo: `${s.pendentes} ${s.pendentes === 1 ? 'alteração aguardando envio' : 'alterações aguardando envio'}`,
      descricao: 'As alterações estão salvas neste computador e aguardam confirmação na nuvem.',
      tom: 'info'
    }
  if (!s.ultimaSincronizacao)
    return {
      titulo: 'Preparando a primeira sincronização',
      descricao: 'A conta está conectada. Aguarde a conferência inicial dos dados.',
      tom: 'info'
    }
  if (s.tempoReal === 'indisponivel' || s.tempoReal === 'desconectado')
    return {
      titulo: 'Atualizações automáticas temporariamente indisponíveis',
      descricao:
        'Não há alterações locais aguardando envio. A conexão será retomada automaticamente; você também pode sincronizar agora.',
      tom: 'aviso'
    }
  if (s.tempoReal === 'conectando')
    return {
      titulo: 'Reconectando atualizações automáticas…',
      descricao: 'Não há alterações locais aguardando envio. A conexão está sendo restabelecida.',
      tom: 'info'
    }
  return {
    titulo: 'Nuvem sincronizada',
    descricao:
      'Não há alterações aguardando envio. Os dados confirmados são compartilhados com sua equipe.',
    tom: 'sucesso'
  }
}
