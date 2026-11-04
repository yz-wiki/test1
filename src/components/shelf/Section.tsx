import type { ReactNode } from 'react';

// One family for interface text; monospace is opt-in via .ui-tech.
const UI_STACK = 'var(--font-ui)';

const SERIF = UI_STACK;

export interface SectionProps {
  title: string;
  children: ReactNode;
}

export default function Section({ title, children }: SectionProps) {
  return (
    <div style={{ marginBottom: 'var(--s-8)' }}>
      <div style={{ fontFamily: SERIF, fontSize: 'var(--fs-6)', fontWeight: 500, letterSpacing: '-0.01em', marginBottom: 'var(--s-3)', padding: '0 var(--s-1)' }}>{title}</div>
      {children}
    </div>
  );
}
