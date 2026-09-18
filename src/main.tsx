import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// import App from './App.tsx'
import SVGPaintStudio from './svg_paint_studio.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SVGPaintStudio />
  </StrictMode>,
)
