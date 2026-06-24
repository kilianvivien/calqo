import { afterEach, describe, expect, it } from 'vitest';
import {
  isEditableKeyboardTarget,
  isKeyboardEventInsideModal,
} from '@/app/keyboardGuards';

describe('keyboard guards', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('treats form controls and contenteditable nodes as editable typing targets', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');

    expect(isEditableKeyboardTarget(input)).toBe(true);
    expect(isEditableKeyboardTarget(textarea)).toBe(true);
    expect(isEditableKeyboardTarget(select)).toBe(true);
    expect(isEditableKeyboardTarget(editable)).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement('button'))).toBe(
      false,
    );
  });

  it('blocks global shortcuts while a modal dialog is mounted', () => {
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const textarea = document.createElement('textarea');
    dialog.append(textarea);
    document.body.append(dialog);

    const event = new KeyboardEvent('keydown', { key: 't', bubbles: true });
    Object.defineProperty(event, 'target', { value: textarea });

    expect(isKeyboardEventInsideModal(event)).toBe(true);
  });
});
