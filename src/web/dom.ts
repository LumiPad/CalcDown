/**
 * Purpose: Provide small DOM helper utilities for CalcDown web modules.
 * Intent: Centralize common operations and keep rendering code concise.
 */

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function byId<T extends Element>(id: string, ctor: { new (...args: any[]): T }, description: string): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) throw new Error(`Missing ${description} (#${id})`);
  return el;
}

