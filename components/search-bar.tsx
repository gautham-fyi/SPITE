'use client'

import { useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const [focused, setFocused] = useState(false)

  return (
    <div
      className={`glass rounded-full flex items-center gap-3 px-4 py-2.5 transition-all duration-200 ${
        focused
          ? 'border-accent/40'
          : 'border-border'
      }`}
      style={{ border: focused ? '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' : '1px solid var(--border)' }}
    >
      <MagnifyingGlass
        size={15}
        weight="thin"
        className={`shrink-0 transition-colors duration-200 ${focused ? 'text-accent' : 'text-muted-foreground'}`}
      />
      <input
        type="text"
        placeholder="Search projects..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none tracking-wide min-w-0"
        aria-label="Search projects"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X size={13} weight="thin" />
        </button>
      )}
    </div>
  )
}
