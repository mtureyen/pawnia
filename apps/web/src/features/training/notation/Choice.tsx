/** One setting as a row of buttons, the chosen one pressed (the stats page's filters). */
export function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
  locked,
}: {
  legend: string
  value: T
  options: [T, string][]
  onChange: (value: T) => void
  locked: boolean
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          disabled={locked}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </fieldset>
  )
}
