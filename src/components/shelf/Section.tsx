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
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', marginBottom: 12, padding: '0 4px' }}>{title}</div>
      {children}
    </div>
  );
}
