/**
 * Holds keyboard focus inside the active modal: everything else in the app is made inert (each sibling on the way
 * up to the app's root element, leaving alone what is already inert), Tab and Shift+Tab cycle within it, and releasing it gives focus
 * back to what had it before. Modals stack: a sheet opened from the pay dialog holds focus until it closes.
 */
const stack: HTMLElement[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusablesIn(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.closest("[inert]") && n.getClientRects().length > 0);
}

export function holdFocus(el: HTMLElement): () => void {
  const opener = document.activeElement as HTMLElement | null;
  const changed: Element[] = [];
  // Up to the app's root only: nodes a wallet SDK appends to <body> stay usable.
  for (let node: Element = el; node.parentElement && node.parentElement !== document.body; node = node.parentElement)
    for (const sib of node.parentElement.children)
      if (sib !== node && !sib.hasAttribute("inert") && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(sib.tagName)) {
        sib.setAttribute("inert", "");
        changed.push(sib);
      }
  stack.push(el);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || stack[stack.length - 1] !== el) return;
    const f = focusablesIn(el);
    if (!f.length) {
      e.preventDefault();
      return;
    }
    const first = f[0]!;
    const last = f[f.length - 1]!;
    const at = document.activeElement;
    const inside = !!at && el.contains(at);
    // From the first control, or the dialog's heading above it, Shift+Tab wraps to the last control.
    if (e.shiftKey && (!inside || at === first || !f.includes(at as HTMLElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || at === last)) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", onKey, true);
  return () => {
    document.removeEventListener("keydown", onKey, true);
    const i = stack.lastIndexOf(el);
    if (i >= 0) stack.splice(i, 1);
    for (const n of changed) n.removeAttribute("inert");
    if (opener && opener.isConnected && !opener.closest("[inert]")) opener.focus();
  };
}
