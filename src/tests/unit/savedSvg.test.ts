import { beforeEach, describe, expect, it } from 'vitest';
import { useSavedSvgStore } from '@/editor/assets/savedSvgStore';

const SVG_A = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';
const SVG_B = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg>';

describe('saved SVG store', () => {
  beforeEach(() => {
    useSavedSvgStore.setState({ items: [], loaded: true });
  });

  it('saves a sanitised generated SVG and lists newest first', () => {
    const store = useSavedSvgStore.getState();
    const idA = store.add(SVG_A, 'coffee cup');
    const idB = store.add(SVG_B, 'square');
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    const items = useSavedSvgStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(idB);
    expect(items[0].name).toBe('square');
  });

  it('deduplicates identical markup and reuses its id', () => {
    const store = useSavedSvgStore.getState();
    const first = store.add(SVG_A, 'one');
    const again = useSavedSvgStore.getState().add(SVG_A, 'two');
    expect(again).toBe(first);
    expect(useSavedSvgStore.getState().items).toHaveLength(1);
  });

  it('falls back to a default name when the prompt is blank', () => {
    useSavedSvgStore.getState().add(SVG_A, '   ');
    expect(useSavedSvgStore.getState().items[0].name).toBe('Generated SVG');
  });

  it('rejects markup that is not an SVG', () => {
    const id = useSavedSvgStore.getState().add('<div>nope</div>', 'bad');
    expect(id).toBeNull();
    expect(useSavedSvgStore.getState().items).toHaveLength(0);
  });

  it('removes a saved entry by id', () => {
    const id = useSavedSvgStore.getState().add(SVG_A, 'one');
    useSavedSvgStore.getState().remove(id!);
    expect(useSavedSvgStore.getState().items).toHaveLength(0);
  });
});
