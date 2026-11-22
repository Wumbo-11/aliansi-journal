import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import DotField from '../src/DotField'
import App from '../src/App'

export function mountDotField(container: Element, theme: 'dark' | 'light' = 'dark'): Root {
  const root = createRoot(container)
  root.render(createElement(DotField, { theme }))
  return root
}

export function mountApp(container: Element): Root {
  const root = createRoot(container)
  root.render(createElement(App))
  return root
}
