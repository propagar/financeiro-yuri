import { useEffect, useRef, useState } from 'react'

/**
 * Menu de contexto genérico (clique direito).
 * items: [{ label, icon, onClick, danger? }]
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [style, setStyle] = useState({ top: y, left: x, visibility: 'hidden' })

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  // Reposiciona o menu se ele nasceria fora da viewport (comum perto das bordas em mobile)
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const margin = 8
    let nextLeft = x
    let nextTop = y

    if (x + rect.width > window.innerWidth - margin) {
      nextLeft = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (y + rect.height > window.innerHeight - margin) {
      nextTop = Math.max(margin, window.innerHeight - rect.height - margin)
    }

    setStyle({ top: nextTop, left: nextLeft, visibility: 'visible' })
  }, [x, y])

  return (
    <div className="context-menu" style={style} ref={ref}>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className={'context-menu-item' + (item.danger ? ' danger' : '')}
          onClick={() => { item.onClick(); onClose() }}
        >
          {item.icon && <span aria-hidden="true">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
