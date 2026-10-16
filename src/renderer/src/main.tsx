import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AvisosEmail } from './components/AvisosEmail'
import { Notificacoes } from './components/Notificacoes'
import './assets/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Notificacoes />
    <App />
    <AvisosEmail />
  </React.StrictMode>
)
