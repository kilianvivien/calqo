import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, SquarePlus, X } from 'lucide-react';
import { usePhoneLayout } from '@/lib/hooks/useResponsiveMode';

/** The `beforeinstallprompt` event (Chromium only) exposes the deferred native
 * install flow so we can trigger it from our own button. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'calqo:pwa-install-dismissed';
/** Let the app settle before nudging — an install card on first paint is jarring. */
const SHOW_DELAY_MS = 2500;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari never fires `beforeinstallprompt`, so we detect the platform to
 * show manual Add-to-Home-Screen steps instead. iPadOS 13+ reports a desktop
 * Mac UA, so fall back to the touch-point heuristic to catch it. */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** A one-time, dismissable invitation to install Calqo to the Home Screen. On
 * Chromium phones it drives the native install via the deferred
 * `beforeinstallprompt`; on iOS Safari — which offers no programmatic install —
 * it shows the manual Share → Add to Home Screen steps. Android's own install
 * banner covers Chrome, so this mainly fills the iOS gap. Only ever shown on the
 * phone layout in a browser tab (never inside the installed PWA). */
export function PwaInstallPrompt() {
  const { t } = useTranslation('common');
  const phone = usePhoneLayout();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (isStandalone() || wasDismissed()) return undefined;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      try {
        localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* private mode — the in-memory state already hides the card */
      }
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      setIos(true);
      timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode — the in-memory state already hides the card */
    }
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    dismiss();
  };

  if (!phone || !visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-[100] flex justify-center px-3"
      style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <div className="glass glass-strong w-full max-w-sm rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
        <div className="flex items-start gap-3">
          <img
            src="/calqo-icon.png"
            alt=""
            className="h-10 w-10 shrink-0 rounded-[var(--calqo-radius-sm)]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-[var(--calqo-text)]">
              {t('pwa.install.title')}
            </p>
            {ios ? (
              <ol className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-[var(--calqo-text-2)]">
                <li className="flex items-center gap-1.5">
                  <span className="text-[var(--calqo-text-3)]">1.</span>
                  {t('pwa.install.iosStep1')}
                  <Share size={14} className="shrink-0 text-[var(--calqo-accent)]" />
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[var(--calqo-text-3)]">2.</span>
                  {t('pwa.install.iosStep2')}
                  <SquarePlus
                    size={14}
                    className="shrink-0 text-[var(--calqo-accent)]"
                  />
                </li>
              </ol>
            ) : (
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--calqo-text-2)]">
                {t('pwa.install.body')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('pwa.install.dismiss')}
            className="-mr-1 -mt-1 shrink-0 rounded-[var(--calqo-radius-sm)] p-1.5 text-[var(--calqo-text-3)] transition-colors duration-[var(--calqo-t-fast)] active:bg-[var(--calqo-hover)]"
          >
            <X size={15} />
          </button>
        </div>
        {!ios && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="rounded-[var(--calqo-radius-sm)] px-3 py-1 text-[12.5px] font-medium text-[var(--calqo-text-2)]"
            >
              {t('pwa.install.dismiss')}
            </button>
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent)] px-3 py-1 text-[12.5px] font-semibold text-white transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] active:scale-95"
            >
              {t('pwa.install.action')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
