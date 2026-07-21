function App(): JSX.Element {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
      <div className="rounded-2xl bg-white px-10 py-8 shadow-lg ring-1 ring-slate-200">
        <div className="mb-2 inline-flex items-center rounded-full bg-brand-teal px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
          VS Prestadora de Serviços
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Gerador de Orçamentos</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Scaffold inicial funcionando. As telas de orçamento, cálculo e cadastros serão
          construídas nas próximas fases.
        </p>
      </div>
    </div>
  )
}

export default App
