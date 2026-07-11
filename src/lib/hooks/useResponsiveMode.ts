import { useSyncExternalStore } from 'react';
import { isTauri } from '@/lib/platform/runtime';

/** Phones get the touch-first quick-edit shell; tablets and up keep the full
 * desktop editor (PRD §5.9). Portrait phones are caught by width; landscape
 * phones (wide but short) are caught by height, so rotating a phone keeps the
 * mobile UI instead of dropping into a cramped desktop layout. */
export const PHONE_MAX_WIDTH = 640;
export const PHONE_MAX_HEIGHT = 480;

const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px), (max-height: ${PHONE_MAX_HEIGHT}px)`;
const LANDSCAPE_QUERY = '(orientation: landscape)';
/** `any-pointer` (not `pointer`): an iPad with a trackpad or Sidecar reports a
 * fine primary pointer, but fingers and the Pencil still need touch-sized
 * targets whenever any coarse pointer is present. */
const COARSE_POINTER_QUERY = '(any-pointer: coarse)';

function makeMediaSubscription(query: string) {
  function getMediaQuery(): MediaQueryList | null {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return null;
    }
    return window.matchMedia(query);
  }
  return {
    subscribe(onChange: () => void): () => void {
      const mql = getMediaQuery();
      if (!mql) return () => {};
      // Safari < 14 only supports the deprecated addListener signature.
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
      }
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    },
    getSnapshot(): boolean {
      return getMediaQuery()?.matches ?? false;
    },
  };
}

const phoneMedia = makeMediaSubscription(PHONE_QUERY);
const landscapeMedia = makeMediaSubscription(LANDSCAPE_QUERY);
const coarsePointerMedia = makeMediaSubscription(COARSE_POINTER_QUERY);

/** True when the phone quick-edit interface should be shown. The native (Tauri)
 * shell always uses the desktop editor regardless of window size, so resizing a
 * desktop window narrow never trades the full editor for the phone UI. */
export function usePhoneLayout(): boolean {
  const narrow = useSyncExternalStore(
    phoneMedia.subscribe,
    phoneMedia.getSnapshot,
    () => false,
  );
  if (isTauri) return false;
  return narrow;
}

/** Orientation flag for adapting the phone layout (e.g. a side toolbar rail in
 * landscape, where vertical space is scarce). */
export function useIsLandscape(): boolean {
  return useSyncExternalStore(
    landscapeMedia.subscribe,
    landscapeMedia.getSnapshot,
    () => false,
  );
}

/** True when a coarse pointer (finger / Apple Pencil on a touch screen) can
 * drive the UI — the desktop editor then grows its grab handles and tap
 * targets (iPad running the desktop shell, PRD §5.9). */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    coarsePointerMedia.subscribe,
    coarsePointerMedia.getSnapshot,
    () => false,
  );
}
