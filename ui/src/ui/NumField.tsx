import { useEffect, useState } from 'react'
import { NumberInput } from '@reiq/ui/carbon'

/** A number you can type into freely: what you type is kept as text while you edit (so you can clear it and retype),
 *  the value is passed on as soon as it is inside the range, and on leaving the box it snaps into the range. */
export function NumField({ id, label, value, onChange, min, max, step = 1, helperText }: {
  id: string; label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; helperText?: string
}) {
  const [txt, setTxt] = useState(String(value))
  useEffect(() => { setTxt(String(value)) }, [value])
  const n = Number(txt)
  const bad = txt !== '' && (Number.isNaN(n) || n < min || n > max)
  return (
    <NumberInput id={id} size="md" label={label} helperText={helperText} hideSteppers min={min} max={max} step={step} value={txt}
      invalid={bad} invalidText={`Enter a number from ${min} to ${max}`}
      onChange={(_e: unknown, { value: v }: { value: number | string }) => {
        setTxt(String(v))
        const x = Number(v)
        if (v !== '' && !Number.isNaN(x) && x >= min && x <= max) onChange(x)
      }}
      onBlur={() => {
        if (txt === '' || Number.isNaN(n)) { setTxt(String(value)); return }
        const c = Math.min(max, Math.max(min, n))
        setTxt(String(c))
        onChange(c)
      }} />
  )
}
