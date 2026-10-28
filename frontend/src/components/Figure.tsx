// A value as drawn: "0.5"'s point set tight, its text still "0.5" (decision 8).
export function Figure({ value }: { value: string }) {
  if (value !== '0.5') return value
  return (
    <span>
      0<span className="tight-point">.</span>5
    </span>
  )
}
