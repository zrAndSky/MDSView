import { useId } from 'react'
import { ArrowLeftRight } from 'lucide-react'

export function SplitSwapControl({
  label,
  swapped,
  onToggle,
}: {
  label: string
  swapped: boolean
  onToggle: () => void
}) {
  const tooltipId = useId()

  return (
    <div className="split-scroll-toolbar-control">
      <button
        type="button"
        className={`split-scroll-control${swapped ? ' active' : ''}`}
        onClick={onToggle}
        aria-describedby={tooltipId}
        aria-label={label}
        aria-pressed={swapped}
      >
        <ArrowLeftRight aria-hidden="true" />
      </button>
      <span className="split-scroll-tooltip" id={tooltipId} role="tooltip">
        {label}
      </span>
    </div>
  )
}
