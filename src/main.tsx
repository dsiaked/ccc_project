import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installChunkLoadRecovery } from './utils/chunkLoadRecovery.ts'

installChunkLoadRecovery()
createRoot(document.getElementById('root')!).render(
  <App />,
)
