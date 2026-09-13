export const PROJECT_SPEND_EVENT = 'spite:project-spend'

export function notifyProjectSpend(projectId?: string) {
  if (typeof window === 'undefined' || !projectId) return
  window.dispatchEvent(new CustomEvent(PROJECT_SPEND_EVENT, { detail: { projectId } }))
}
