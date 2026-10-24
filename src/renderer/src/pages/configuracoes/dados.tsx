import { MensagemFlutuante } from '../../components/MensagemFlutuante'
import { mensagemErro } from '@shared/erros'
import { useState } from 'react'
import { Download, ArchiveRestore, Import } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, SectionTitle, ConfirmDialog } from '../../ui/primitives'
import type { ReactElement } from 'react'

// ----------------------------------------------------------- Dados e backup
export function SecaoDados(): ReactElement {
  const [ocupado, setOcupado] = useState<'exportar' | 'restaurar' | 'mesclar' | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<'restaurar' | 'mesclar' | null>(null)

  const exportar = async (): Promise<void> => {
    setOcupado('exportar')
    setResultado(null)
    setErro(null)
    try {
      const r = await api.dados.exportar()
      if (r.caminho) setResultado(`Cópia de segurança criada em: ${r.caminho}`)
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setOcupado(null)
    }
  }
  const importar = async (modo: 'restaurar' | 'mesclar'): Promise<void> => {
    setOcupado(modo)
    setResultado(null)
    setErro(null)
    try {
      const r = await api.dados.importar(modo)
      if (!r) return
      const itens = Object.entries(r.importados)
        .filter(([, n]) => n > 0)
        .map(([nome, n]) => `${n} ${nome.replace('_padrao', '')}`)
        .join(', ')
      const ignorados = Object.values(r.ignorados).reduce((a, n) => a + n, 0)
      const renumerados = r.renumerados.orcamentos + r.renumerados.relatorios
      setResultado(
        modo === 'restaurar'
          ? `Backup restaurado com segurança. A cópia anterior foi salva em: ${r.backupAntes}. Feche e abra o aplicativo para carregar os dados restaurados.`
          : `Importação concluída${itens ? `: ${itens}` : ''}.${ignorados ? ` ${ignorados} itens iguais foram mantidos sem duplicar.` : ''}${renumerados ? ` ${renumerados} documento(s) receberam um novo número por conflito.` : ''} A cópia anterior foi salva em: ${r.backupAntes}.`
      )
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="pilha-y-6">
      <Card className="p-6">
        <SectionTitle
          title="Cópia de segurança"
          description="Gera uma cópia de segurança completa com clientes, documentos, imagens, logo e configurações."
        />
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Guarde esse arquivo em um local seguro. Ele permite recuperar o aplicativo em outro
            computador sem perder os anexos.
          </p>
          <Button icon={Download} type="button" onClick={exportar} disabled={ocupado !== null}>
            {ocupado === 'exportar' ? 'Exportando…' : 'Exportar backup…'}
          </Button>
        </div>
      </Card>
      <Card className="p-6">
        <SectionTitle
          title="Importar dados"
          description="Todo processo valida o arquivo e salva uma cópia datada do banco atual antes de alterar qualquer dado."
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800">Restaurar tudo</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Substitui documentos e configurações deste computador exatamente pelo backup
              selecionado.
            </p>
            <Button
              icon={ArchiveRestore}
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => setConfirmacao('restaurar')}
              disabled={ocupado !== null}
            >
              {ocupado === 'restaurar' ? 'Restaurando…' : 'Escolher backup e restaurar…'}
            </Button>
          </div>
          <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-4">
            <h3 className="font-semibold text-slate-800">Manter dados atuais</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Importa clientes e documentos sem apagar os existentes. Empresa, logo, parâmetros
              financeiros e IA deste computador são preservados.
            </p>
            <Button
              icon={Import}
              type="button"
              className="mt-4"
              onClick={() => setConfirmacao('mesclar')}
              disabled={ocupado !== null}
            >
              {ocupado === 'mesclar' ? 'Importando…' : 'Escolher backup e importar…'}
            </Button>
          </div>
        </div>
      </Card>
      {resultado && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"
        >
          {resultado}
        </p>
      )}
      {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
      <ConfirmDialog
        open={Boolean(confirmacao)}
        title={confirmacao === 'restaurar' ? 'Restaurar backup' : 'Importar mantendo dados'}
        description={
          confirmacao === 'restaurar'
            ? 'A restauração substituirá os dados e configurações deste computador pelo arquivo escolhido. Uma cópia automática será criada antes.'
            : 'A importação preservará empresa, logo, parâmetros financeiros e IA locais, conciliando os demais dados. Uma cópia automática será criada antes.'
        }
        confirmLabel="Continuar"
        onCancel={() => setConfirmacao(null)}
        onConfirm={async () => {
          const modo = confirmacao
          setConfirmacao(null)
          if (modo) await importar(modo)
        }}
      />
    </div>
  )
}
