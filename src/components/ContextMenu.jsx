import { useEffect, useRef } from 'react'

/**
 * Menu de contexto genérico (clique direito).
 * items: [{ label, icon, onClick, danger? }]
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

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

  // Evita o menu nascer fora da tela quando o clique é próximo da borda
  const style = {
    top: y,
    left: x,
  }

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
