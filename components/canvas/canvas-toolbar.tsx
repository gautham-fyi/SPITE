'use client'

import Link from 'next/link'
import { ArrowLeft, MagnifyingGlassPlus, MagnifyingGlassMinus, CornersOut, CheckCircle, Circle, CircleNotch, GearSix, ListChecks, Question, Rows, Robot } from '@phosphor-icons/react'
import { useReactFlow } from '@xyflow/react'
import { useState } from 'react'
import { startTour } from '@/lib/onboarding'
import { UserMenu } from '@/components/user-menu'
import { FalBalanceBadge } from './fal-balance-badge'
import { ProjectSpendBadge } from './project-spend-badge'
import { VersionBadge } from '@/components/version-badge'
import { SpiteLogo } from '@/components/spite-logo'

interface CanvasToolbarProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  saveStatus: 'saved' | 'unsaved' | 'saving'
  projectId: string
  // Right-side jobs panel: workspace owns the open/close state so the
  // panel persists across canvas interactions and the toolbar just
  // triggers the toggle.
  jobsPanelOpen?: boolean
  onToggleJobsPanel?: () => void
  activeJobCount?: number
  onArrangeShots?: () => void
  agentOpen?: boolean
  onToggleAgent?: () => void
}

export function CanvasToolbar({ projectName, onProjectNameChange, saveStatus, projectId, jobsPanelOpen, onToggleJobsPanel, activeJobCount = 0, onArrangeShots, agentOpen, onToggleAgent }: CanvasToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const [editing, setEditing] = useState(false)

  return (
    <div className="glass flex items-center justify-between px-4 h-14 shrink-0 relative z-10">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center justify-center w-8 h-8 rounded-lg glass-hover text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} weight="thin" />
        </Link>
        <SpiteLogo className="h-6 w-auto hidden sm:block" />
        <div className="w-px h-4 bg-border" />
        {editing ? (
          <input
            autoFocus
            value={projectName}
            onChange={e => onProjectNameChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={e => e.key === 'Enter' && setEditing(false)}
            className="bg-transparent border-none outline-none text-foreground text-lg"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-lg text-foreground hover:text-accent transition-colors cursor-text"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          >
            {projectName}
          </button>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => zoomIn({ duration: 200 })}
          className="flex items-center justify-center w-8 h-8 rounded-lg glass-hover text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom in"
        >
          <MagnifyingGlassPlus size={16} weight="thin" />
        </button>
        <button
          onClick={() => zoomOut({ duration: 200 })}
          className="flex items-center justify-center w-8 h-8 rounded-lg glass-hover text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom out"
        >
          <MagnifyingGlassMinus size={16} weight="thin" />
        </button>
        <button
          onClick={() => fitView({ duration: 300, padding: 0.1 })}
          className="flex items-center justify-center w-8 h-8 rounded-lg glass-hover text-muted-foreground hover:text-foreground transition-colors"
          title="Fit to screen"
        >
          <CornersOut size={16} weight="thin" />
        </button>
        {onArrangeShots && (
          <button
            onClick={onArrangeShots}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg glass-hover text-muted-foreground hover:text-foreground transition-colors"
            title="Line up nodes in shot order"
          >
            <Rows size={16} weight="thin" />
            <span className="text-[13px] tracking-wide">Arrange</span>
          </button>
        )}

        <div className="w-px h-4 bg-border mx-1" />

        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground select-none" title="Autosaves · ⌘S to save now">
          {saveStatus === 'saved' ? (
            <CheckCircle size={14} weight="fill" className="text-accent/60" />
          ) : saveStatus === 'saving' ? (
            <CircleNotch size={14} className="animate-spin text-accent/70" />
          ) : (
            <Circle size={14} weight="thin" className="text-muted-foreground/40" />
          )}
          <span className={saveStatus === 'saved' ? 'text-accent/60' : 'text-muted-foreground'}>
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved'}
          </span>
        </div>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Jobs panel toggle — only renders when the workspace wires
            it up (effectively always, but the prop is optional so the
            toolbar can render without it during early init). */}
        {onToggleAgent && (
          <button
            onClick={onToggleAgent}
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
              agentOpen
                ? 'bg-accent/20 text-accent'
                : 'glass-hover text-muted-foreground hover:text-foreground'
            }`}
            title={agentOpen ? 'Close agent' : 'Open agent'}
          >
            <Robot size={16} weight="thin" />
          </button>
        )}

        {onToggleJobsPanel && (
          <button
            data-tour="jobs-toggle"
            onClick={onToggleJobsPanel}
            className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
              jobsPanelOpen
                ? 'bg-accent/20 text-accent'
                : 'glass-hover text-muted-foreground hover:text-foreground'
            }`}
            title={jobsPanelOpen ? 'Close jobs panel' : 'Open jobs panel'}
          >
            <ListChecks size={16} weight="thin" />
            {activeJobCount > 0 && !jobsPanelOpen && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent animate-pulse"
                title={`${activeJobCount} active job${activeJobCount === 1 ? '' : 's'}`}
              />
            )}
          </button>
        )}

        <VersionBadge className="mr-1" />

        <ProjectSpendBadge projectId={projectId} />
        <FalBalanceBadge />

        <button
          onClick={() => startTour('canvas')}
          className="flex items-center justify-center w-8 h-8 rounded-lg glass-hover transition-colors text-muted-foreground hover:text-foreground"
          title="Take the tour"
          aria-label="Take the tour"
        >
          <Question size={16} weight="thin" />
        </button>

        <Link
          href="/settings"
          className="flex items-center justify-center w-8 h-8 rounded-lg glass-hover transition-colors text-muted-foreground hover:text-foreground"
          title="Settings"
        >
          <GearSix size={16} weight="thin" />
        </Link>

        <div className="ml-1 flex items-center">
          <UserMenu />
        </div>
      </div>
    </div>
  )
}
