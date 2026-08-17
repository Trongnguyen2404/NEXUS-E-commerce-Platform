import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional swatch — used by the order status picker. */
  dotClassName?: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  /** readonly so an `as const` list can be passed straight in. */
  options: readonly SelectOption<T>[];
  /** Shown when `value` matches no option, e.g. an empty filter. */
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  /** Replaces the trigger's default look entirely. */
  className?: string;
  disabled?: boolean;
}

/** Tallest the panel gets before it scrolls internally. */
const MAX_PANEL_HEIGHT = 320;
/** Below this a panel is not worth showing, so it is allowed to overhang. */
const MIN_PANEL_HEIGHT = 120;
/** Breathing room against the window edges. */
const MARGIN = 8;
/** Space between the trigger and the panel. */
const GAP = 6;

const TRIGGER_BASE =
  'inline-flex items-center justify-between gap-3 rounded-xl outline-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-black';

/**
 * A select that can actually be styled.
 *
 * A native <select> renders its option list through the operating system, so
 * none of it — font, colours, the blue highlight, the spacing — responds to
 * CSS. The only way to control that list is to stop using one, which means
 * rebuilding what the native element gave away for free: keyboard navigation,
 * type-ahead, focus handling and the ARIA that screen readers rely on.
 */
function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  id,
  ariaLabel,
  className,
  disabled,
}: Props<T>) {
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  /** Index the keyboard is on, which is not necessarily the selected one. */
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, []);

  const open = () => {
    if (disabled) return;
    place();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  };

  const close = (refocus = true) => {
    setIsOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close();
  };

  // Measured before paint so the panel never renders at the wrong spot first.
  useLayoutEffect(() => {
    if (isOpen) place();
  }, [isOpen, place]);

  useEffect(() => {
    if (!isOpen) return;

    // Capture phase: the trigger may sit inside its own scrolling container
    // (the orders table scrolls sideways), and those events do not bubble.
    const reposition = () => place();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        close(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOpen, place]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!isOpen) return;
    panelRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  /** Jump to the next option starting with the typed letter. */
  const typeAhead = useRef({ query: '', at: 0 });
  const searchByLetter = (letter: string) => {
    const now = Date.now();
    const t = typeAhead.current;
    // Letters typed in quick succession build one query — "sh" finds SHIPPED
    // rather than jumping to S, then to H.
    t.query = now - t.at < 600 ? t.query + letter : letter;
    t.at = now;

    const from = t.query.length === 1 ? activeIndex + 1 : activeIndex;
    const ordered = [...options.slice(from), ...options.slice(0, from)];
    const hit = ordered.find((o) => o.label.toLowerCase().startsWith(t.query));

    if (hit) setActiveIndex(options.indexOf(hit));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        open();
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(activeIndex);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) searchByLetter(e.key.toLowerCase());
    }
  };

  /**
   * Where the panel goes, recomputed every render so scrolling and resizing
   * are reflected straight away.
   *
   * Opens downwards unless there is more room the other way. The subtlety is
   * the top: the site nav is `sticky top-0`, and this panel sits above it in
   * the stacking order, so a drop-up that is merely inside the window still
   * ends up covering the logo and the whole menu. Height is therefore clamped
   * to the space between the trigger and the bottom of whatever is pinned up
   * there, and the list scrolls if that is not enough.
   */
  const layout = (() => {
    if (!rect) return null;

    const inset =
      document.querySelector('[data-sticky-top]')?.getBoundingClientRect().bottom ?? 0;

    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - Math.max(inset, 0) - GAP - MARGIN;
    const up = above > below && below < Math.min(MAX_PANEL_HEIGHT, 200);

    return {
      up,
      // The floor only matters on a window too short for either side; there,
      // a readable panel that overhangs beats a 20px sliver.
      maxHeight: Math.min(MAX_PANEL_HEIGHT, Math.max(up ? above : below, MIN_PANEL_HEIGHT)),
      // Keep it on screen when the trigger is close to the right edge.
      left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - rect.width - MARGIN)),
    };
  })();

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={onKeyDown}
        className={
          className ??
          `${TRIGGER_BASE} w-full bg-surface-muted px-4 py-3.5 text-sm font-medium text-black hover:bg-surface-sunken`
        }
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.dotClassName && (
            <span className={`h-2 w-2 rounded-full shrink-0 ${selected.dotClassName}`} />
          )}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={`shrink-0 opacity-60 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Rendered into <body>: an absolutely positioned panel would be clipped
          by any ancestor that scrolls, and the orders table is one. */}
      {isOpen &&
        rect &&
        layout &&
        createPortal(
          <ul
            ref={panelRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={`${listboxId}-${activeIndex}`}
            tabIndex={-1}
            style={{
              position: 'fixed',
              left: layout.left,
              minWidth: rect.width,
              maxWidth: Math.max(rect.width, 320),
              maxHeight: layout.maxHeight,
              ...(layout.up
                ? { bottom: window.innerHeight - rect.top + GAP }
                : { top: rect.bottom + GAP }),
            }}
            className={`z-[60] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl shadow-black/10 motion-reduce:animate-none ${
              layout.up ? 'animate-pop-up' : 'animate-pop-down'
            }`}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;

              return (
                <li
                  key={option.value}
                  id={`${listboxId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(index)}
                  onPointerEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                    isActive ? 'bg-black text-white' : 'text-gray-700'
                  }`}
                >
                  {option.dotClassName && (
                    <span className={`h-2 w-2 rounded-full shrink-0 ${option.dotClassName}`} />
                  )}
                  <span className="flex-1 truncate">{option.label}</span>
                  {isSelected && <Check size={14} aria-hidden className="shrink-0" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}

export default Select;
