import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/cn';
import type { FontDef } from '@/lib/adapters';

interface FontMenuProps {
  value: string;
  fonts: FontDef[];
  onChange: (family: string) => void;
  className?: string;
  /** Accessible label when used without an external label. */
  ariaLabel?: string;
}

type Placement = { top: number; left: number; width: number };

/** Searchable font picker with a per-family live preview. Replaces the native
 * `<select>` because (1) native option styling is locked to the platform, so
 * we can't render each family in its own typeface; and (2) with 100+ system
 * fonts the dropdown is unusable without a filter. */
export function FontMenu({
  value,
  fonts,
  onChange,
  className,
  ariaLabel,
}: FontMenuProps) {
  const { t } = useTranslation('editor');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const labelId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fonts;
    return fonts.filter((font) => font.family.toLowerCase().includes(q));
  }, [fonts, query]);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const idealWidth = Math.max(rect.width, 280);
    const maxWidth = Math.max(240, window.innerWidth - margin * 2);
    const width = Math.min(idealWidth, maxWidth);
    const maxLeft = window.innerWidth - width - margin;
    const left = Math.max(margin, Math.min(rect.left, maxLeft));

    // Flip above the trigger when there isn't enough room below.
    const desiredHeight = 360;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flipUp =
      spaceBelow < desiredHeight + gap + 16 && spaceAbove > spaceBelow;
    const top = flipUp
      ? Math.max(margin, rect.top - desiredHeight - gap)
      : rect.bottom + gap;

    setPlacement({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onScroll = () => measure();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Focus search after the popover mounts.
      const id = window.requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (family: string) => {
    onChange(family);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDownTrigger = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onKeyDownList = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const next = filtered[highlight];
      if (next) select(next.family);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlight(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlight(Math.max(0, filtered.length - 1));
    }
  };

  // Keep the highlighted row in view as the user arrows through.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const maxHeight = `min(360px, calc(100vh - 16px))`;
  const popoverVisible = open && placement !== null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? labelId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onKeyDownTrigger}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2.5 text-[13px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)]',
          className,
        )}
      >
        <span
          className="truncate text-left"
          style={{
            fontFamily: `${value}, system-ui, sans-serif`,
          }}
        >
          {value}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-[var(--calqo-text-3)] transition-transform duration-[var(--calqo-t-fast)]',
            open && 'rotate-180',
          )}
        />
      </button>
      {open &&
        placement &&
        createPortal(
          <div
            ref={popoverRef}
            id={labelId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            onKeyDown={onKeyDownList}
            className={cn(
              'glass glass-strong fixed z-[55] flex flex-col overflow-hidden rounded-[var(--calqo-radius)] border border-[var(--calqo-divider)] shadow-[0_18px_50px_rgba(0,0,0,0.28)]',
              'transition-opacity duration-[var(--calqo-t-fast)]',
              popoverVisible ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              top: placement.top,
              left: placement.left,
              width: placement.width,
              maxHeight,
            }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--calqo-divider)] px-2.5 py-2">
              <Search
                size={14}
                className="shrink-0 text-[var(--calqo-text-3)]"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('properties.fontSearch')}
                aria-label={t('properties.fontSearch')}
                className="h-6 w-full bg-transparent text-[12.5px] text-[var(--calqo-text)] placeholder:text-[var(--calqo-text-3)] outline-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-[var(--calqo-text-3)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <ul
              ref={listRef}
              role="presentation"
              className="calqo-scroll min-h-0 flex-1 overflow-y-auto py-1"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-center text-[12px] text-[var(--calqo-text-3)]">
                  —
                </li>
              ) : (
                filtered.map((font, index) => {
                  const selected = font.family === value;
                  const active = index === highlight;
                  return (
                    <li
                      key={font.family}
                      data-index={index}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => select(font.family)}
                      className={cn(
                        'flex h-9 cursor-pointer items-center gap-2 px-3 text-[14px] text-[var(--calqo-text)]',
                        active && 'bg-[var(--calqo-hover)]',
                        selected && 'text-[var(--calqo-text)]',
                      )}
                      style={{
                        fontFamily: `${font.family}, system-ui, sans-serif`,
                      }}
                    >
                      <span className="flex-1 truncate">{font.family}</span>
                      {selected && (
                        <Check
                          size={14}
                          aria-hidden
                          className="shrink-0 text-[var(--calqo-accent)]"
                        />
                      )}
                    </li>
                  );
                })
              )}
            </ul>
            <div className="shrink-0 border-t border-[var(--calqo-divider)] px-3 py-1.5 text-[11px] text-[var(--calqo-text-3)]">
              {filtered.length} / {fonts.length}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
