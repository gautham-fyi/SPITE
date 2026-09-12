export function SpiteLogo({
  className = 'h-8 w-auto',
  alt = 'ztory',
  withWordmark = false,
  wordmarkClassName = 'text-[17px] font-semibold tracking-tight text-foreground',
}: {
  className?: string
  alt?: string
  withWordmark?: boolean
  wordmarkClassName?: string
}) {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <img
        src="/brand/logo.png"
        alt={withWordmark ? '' : alt}
        className={`select-none ${className}`}
        draggable={false}
      />
      {withWordmark && (
        <span
          className={wordmarkClassName}
          style={{ fontFamily: 'var(--font-geist), var(--font-inter), sans-serif' }}
        >
          ztory
        </span>
      )}
    </span>
  )
}
