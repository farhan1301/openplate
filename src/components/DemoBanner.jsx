import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { DEMO } from '../lib/supabase'

const REPO_URL = 'https://github.com/farhan1301/openplate'

/** Shown only in demo mode: explains the sample data and links to the install. */
export default function DemoBanner() {
  const [hidden, setHidden] = useState(false)
  if (!DEMO || hidden) return null
  return (
    <div className="mb-4 mt-2 flex items-start gap-3 rounded-[14px] bg-gradient-to-br from-indigo to-tint p-3.5 text-white shadow-card md:mt-8">
      <Sparkles size={18} className="mt-0.5 shrink-0 opacity-90" />
      <p className="flex-1 text-[14px] leading-snug">
        <span className="font-semibold">You’re trying the demo.</span> Sample data, nothing is saved, and it resets on reload.
        Your own copy is free, keeps your data, and connects to Claude, ChatGPT or any MCP client.{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Get OpenPlate →</a>
      </p>
      <button type="button" onClick={() => setHidden(true)} aria-label="Hide" className="-m-1 rounded-full p-1 opacity-80 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  )
}
