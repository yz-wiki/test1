// Shell chrome context.
//
// The sidebar owns library switching, the account entry point and the primary
// navigation. Several screens (TopNav today) render their own copies of those
// affordances for the compact, sidebar-less layout. Rather than threading a
// `hasSidebar` prop through Library → TopNav → ... this tiny context lets any
// descendant ask "is the shell already providing chrome?" and drop its
// duplicate.
//
// The default value is the *legacy* behaviour (no sidebar), so unit tests that
// render a component in isolation — with no provider — keep seeing exactly what
// they saw before.
import { createContext, useContext } from 'react';

export interface ShellChrome {
  hasSidebar: boolean;
  /** True when the sidebar is collapsed to its icon rail. */
  sidebarCompact: boolean;
}

const DEFAULT_CHROME: ShellChrome = { hasSidebar: false, sidebarCompact: false };

export const ShellChromeContext = createContext<ShellChrome>(DEFAULT_CHROME);

export function useShellChrome(): ShellChrome {
  return useContext(ShellChromeContext);
}
