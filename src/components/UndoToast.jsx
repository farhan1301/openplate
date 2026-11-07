import { RotateCcw } from 'lucide-react'

export default function UndoToast({ message, onUndo }) {
  if (!message) return null

  return (
    <div
      role="status"
      key={message}
      className="animate-toast fixed left-1/2 z-[60] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6"
    >
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#1c1c1e]/92 py-2.5 pl-4 pr-2 text-white shadow-float backdrop-blur-xl dark:bg-[#3a3a3c]/92">
        <p className="min-w-0 truncate text-[15px]">{message}</p>
        <button
          type="button"
          onClick={onUndo}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[15px] font-semibold text-[#0a84ff] transition-colors hover:bg-white/10"
        >
          <RotateCcw size={15} strokeWidth={2.4} /> Undo
        </button>
      </div>
    </div>
  )
}
