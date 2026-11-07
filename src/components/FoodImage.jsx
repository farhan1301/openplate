import { useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { foodEmoji, foodGradient } from '../lib/foodArt'
import { uploadPhoto } from '../lib/photos'
import { FormGroup, TextInput } from './ui'
import { cx } from '../lib/cx'

/**
 * A meal or favorite photo. Without one (or if the link is broken) it shows a
 * food emoji on a gradient, so every card still reads at a glance.
 */
export function FoodImage({ src, name, hint, className, emojiClassName = 'text-[44px]' }) {
  const [failed, setFailed] = useState(null)
  const showPhoto = src && failed !== src
  return (
    <div className={cx('relative overflow-hidden', className)} style={{ background: foodGradient(name) }}>
      {!showPhoto && (
        <span aria-hidden="true" className={cx('absolute inset-0 flex items-center justify-center drop-shadow-sm select-none', emojiClassName)}>
          {foodEmoji(name, hint)}
        </span>
      )}
      {showPhoto && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  )
}

/** Photo picker for the meal and favorite editors: upload, paste a link, or remove. */
export function PhotoField({ value, onChange, name, hint }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      onChange(await uploadPhoto(file))
    } catch (err) {
      setError(err.message || 'Could not upload this photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <FormGroup title="Photo" footer="Upload one, paste an image link, or ask your AI agent to find one.">
      <div className="flex items-center gap-4 border-b border-separator p-3">
        <FoodImage src={value} name={name} hint={hint} className="h-20 w-28 shrink-0 rounded-[10px]" emojiClassName="text-[32px]" />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <label className={cx('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-tint/12 px-3 text-[15px] font-semibold text-tint', uploading && 'pointer-events-none opacity-60')}>
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} strokeWidth={2.4} />}
            {uploading ? 'Uploading…' : value ? 'Change Photo' : 'Add Photo'}
            <input type="file" accept="image/*" onChange={pick} className="hidden" />
          </label>
          {value && !uploading && (
            <button type="button" onClick={() => onChange('')} className="inline-flex h-7 items-center gap-1 px-1 text-[13px] text-red">
              <Trash2 size={13} /> Remove
            </button>
          )}
          {error && <p className="text-[13px] text-red">{error}</p>}
        </div>
      </div>
      <TextInput value={value} onChange={onChange} placeholder="…or paste an image link" type="url" inputMode="url" />
    </FormGroup>
  )
}
