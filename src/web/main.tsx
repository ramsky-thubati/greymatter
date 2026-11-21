import '@fontsource/ubuntu-sans/400.css'
import '@fontsource/ubuntu-sans/500.css'
import '@fontsource/ubuntu-sans/600.css'
import '@fontsource/ubuntu-sans/700.css'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/tokens.css'
import './styles/components.css'
import './styles/graph.css'

createRoot(document.getElementById('root')!).render(<App />)
