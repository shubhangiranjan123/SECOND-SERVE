import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts are bundled locally so the demo still looks right on bad venue wifi.
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/700.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
