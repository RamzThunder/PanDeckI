import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PresentationApp from './presentation/PresentationApp'
import { isPresentation } from './presentation/sync'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  isPresentation ? <PresentationApp /> : <App />
)
