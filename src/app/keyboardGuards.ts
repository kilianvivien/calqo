/** Return true when a keyboard event target is an editable control that should
 * receive normal text input rather than editor/application shortcuts. */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable === true ||
    target.getAttribute('contenteditable') === 'true'
  );
}

/** Modal dialogs are isolated interaction surfaces: global editor shortcuts
 * must not leak into them when focus starts on a button or another non-editable
 * control inside the dialog. */
export function isKeyboardEventInsideModal(event: KeyboardEvent): boolean {
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest('[role="dialog"][aria-modal="true"]')
  ) {
    return true;
  }
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}
