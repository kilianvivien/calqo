import { useTranslation } from 'react-i18next';
import { GlassButton, ModalOverlay } from '@/components/glass';
import { useConfirmStore } from '@/lib/state/confirmStore';

/** Single app-level host for confirmation prompts. Mounted once near the root,
 * it renders whatever request the confirm store holds as a glass modal — so
 * every `dialog.confirm(...)` call across the app shares one consistent,
 * on-brand dialog instead of the native `window.confirm`. */
export function ConfirmHost() {
  const { t } = useTranslation('common');
  const request = useConfirmStore((s) => s.request);
  const respond = useConfirmStore((s) => s.respond);

  if (!request) return null;

  return (
    <ModalOverlay
      key={request.id}
      open
      onClose={() => respond(false)}
      labelledBy={request.title ? 'confirm-title' : undefined}
      ariaLabel={request.title ? undefined : request.message}
      className="glass glass-strong flex w-[min(400px,100%)] flex-col gap-3 rounded-[20px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      {request.title && (
        <h2
          id="confirm-title"
          className="text-[15px] font-semibold text-[var(--calqo-text)]"
        >
          {request.title}
        </h2>
      )}
      <p className="text-[13px] leading-relaxed text-[var(--calqo-text-2)]">
        {request.message}
      </p>
      <div className="mt-1 flex items-center justify-end gap-2">
        <GlassButton onClick={() => respond(false)}>
          {request.cancelLabel ?? t('actions.cancel')}
        </GlassButton>
        <GlassButton
          autoFocus
          variant={request.danger ? 'glass' : 'primary'}
          onClick={() => respond(true)}
          className={
            request.danger
              ? 'border border-[#FF5F57]/40 bg-[#FF5F57]/15 text-[#B42318] hover:bg-[#FF5F57]/25'
              : undefined
          }
        >
          {request.confirmLabel ?? t('actions.confirm')}
        </GlassButton>
      </div>
    </ModalOverlay>
  );
}
