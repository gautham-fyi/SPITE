'use client'

import { useState, useRef, useEffect } from 'react'
import { CaretDown, Check, Plus, FilmStrip, Image as ImageIcon, X, ArrowsClockwise } from '@phosphor-icons/react'
import { mediaPreviewUrl } from '@/lib/media-preview'

export interface ShotOption {
  id: string
  label: string
  thumbnail?: string
  hasVideo?: boolean
}

interface ShotSelectorProps {
  selectedShotId?: string
  shots: ShotOption[]
  // Pass an empty string to unassign the node from its current shot.
  onSelect: (shotId: string) => void
  onNewShot: () => void
  // Take a shot over EXCLUSIVELY: assign it to this node and unassign whatever
  // other node currently holds it. (Plain onSelect just adds this node as an
  // additional take.)
  onReplace?: (shotId: string) => void
}

export function ShotSelector({ selectedShotId, shots, onSelect, onNewShot, onReplace }: ShotSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedShot = shots.find(s => s.id === selectedShotId)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-[var(--node-menu)] border border-border hover:border-[var(--border-bright)] transition-colors"
      >
        <Check size={12} className="text-accent" />
        <span className="text-[13px] text-foreground">
          {selectedShot?.label || 'Select shot'}
        </span>
        <CaretDown size={8} className="text-muted-foreground" />
      </button>

      {open && (
        <div 
          className="absolute top-full left-0 mt-1 w-48 py-1.5 rounded-lg bg-[var(--node-menu)] border border-border shadow-xl z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 mb-1">
            <span className="text-[12px] text-muted-foreground uppercase tracking-wider">
              Select as a take for
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {shots.map((shot) => {
              const isCurrent = selectedShotId === shot.id
              return (
                <div
                  key={shot.id}
                  className="group/shot w-full flex items-center hover:bg-white/5 transition-colors"
                >
                  <button
                    onClick={() => { onSelect(shot.id); setOpen(false) }}
                    className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5"
                  >
                    {/* Thumbnail */}
                    <div className="w-8 h-5 rounded overflow-hidden bg-black/40 shrink-0 flex items-center justify-center">
                      {shot.thumbnail ? (
                        <img src={mediaPreviewUrl(shot.thumbnail, 'thumb')} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      ) : shot.hasVideo ? (
                        <FilmStrip size={10} className="text-muted-foreground/40" />
                      ) : (
                        <ImageIcon size={10} className="text-muted-foreground/40" />
                      )}
                    </div>
                    {/* Label */}
                    <span className="text-[13px] text-foreground flex-1 text-left truncate">
                      {shot.label}
                    </span>
                    {/* Check if selected */}
                    {isCurrent && (
                      <Check size={12} className="text-accent shrink-0" />
                    )}
                  </button>
                  {/* Replace: take this shot over exclusively (unassigns the
                      node currently holding it). Hidden for the node's own shot. */}
                  {onReplace && !isCurrent && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onReplace(shot.id); setOpen(false) }}
                      title="Reassign this shot to this node, unassigning the current one"
                      className="opacity-0 group-hover/shot:opacity-100 shrink-0 flex items-center gap-1 mr-1.5 px-1.5 py-1 rounded text-[12px] text-accent hover:bg-accent/15 transition-all"
                    >
                      <ArrowsClockwise size={10} weight="bold" />
                      Replace
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="border-t border-white/5 mt-1 pt-1">
            <button
              onClick={() => { onNewShot(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 transition-colors text-accent"
            >
              <Plus size={12} weight="bold" />
              <span className="text-[13px]">New Shot</span>
            </button>
            {selectedShotId && (
              <button
                onClick={() => { onSelect(''); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
              >
                <X size={12} weight="bold" />
                <span className="text-[13px]">Remove from shot</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
