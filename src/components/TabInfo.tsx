/**
 * Collapsible "what is this tab for" explainer.
 *
 * Rendered at the top of every tab (main hub tabs and Copilot Studio sub-tabs).
 * Uses a native <details> element so it is collapsed by default and needs no
 * extra state; styling lives in the global index.css (.tabinfo).
 */
import type { ReactElement, ReactNode } from 'react';

export default function TabInfo({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <details className="tabinfo">
      <summary>
        <svg className="tabinfo-icon" viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span className="tabinfo-title">{title}</span>
        <svg className="tabinfo-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="tabinfo-body">{children}</div>
    </details>
  );
}
