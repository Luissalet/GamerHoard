import { useEffect } from 'react';
import { mergeRegistrations, type ViewRegistration } from './copilotContext';

// Screens register what they show (visible games, unsaved form fields) while mounted;
// window.hoardCopilot.context() merges the live registrations on every turn.
const regs = new Map<string, ViewRegistration>();

export function registerView(key: string, reg: ViewRegistration | null) {
  if (reg) regs.set(key, reg); else regs.delete(key);
}
export function registeredView(): ViewRegistration { return mergeRegistrations([...regs.values()]); }

/** Register `reg` while the component is mounted and `deps` are unchanged. */
export function useCopilotView(key: string, reg: ViewRegistration | null, deps: unknown[]) {
  useEffect(() => {
    registerView(key, reg);
    return () => registerView(key, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
