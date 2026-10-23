import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AvisosEmail } from './components/AvisosEmail'
import { Notificacoes } from './components/Notificacoes'
import './assets/index.css'
import { iniciarTema } from './lib/tema'

// Antes da primeira renderização, para o tema escolhido aparecer desde o primeiro quadro.
iniciarTema()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Notificacoes />
    <App />
    <AvisosEmail />
  </React.StrictMode>
)
