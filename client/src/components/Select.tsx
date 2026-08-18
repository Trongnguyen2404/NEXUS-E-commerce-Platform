import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// One option in the custom dropdown.
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  
  dotClassName?: string;
}

// Props for the custom dropdown.
interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  
  options: readonly SelectOption<T>[];
  
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  
  className?: string;
  disabled?: boolean;
}


const MAX_PANEL_HEIGHT = 320;

const MARGIN = 8;

const GAP = 6;

const TRIGGER_BASE =
  'inline-flex items-center justify-between gap-3 rounded-xl outline-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-black';


// Styled dropdown with keyboard navigation and type-ahead.
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

  
  useLayoutEffect(() => {
    if (isOpen) place();
  }, [isOpen, place]);

  useEffect(() => {
    if (!isOpen) return;

    
    
    
    
    
    
    
    
    
    const dismiss = () => close(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        close(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOpen, place]);

  
  useEffect(() => {
    if (!isOpen) return;
    panelRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  
  const typeAhead = useRef({ query: '', at: 0 });
  const searchByLetter = (letter: string) => {
    const now = Date.now();
    const t = typeAhead.current;
    
    
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

  
  const layout = (() => {
    if (!rect) return null;

    const inset =
      document.querySelector('[data-sticky-top]')?.getBoundingClientRect().bottom ?? 0;
    
    const ceiling = Math.max(inset, 0) + MARGIN;

    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - ceiling - GAP;
    const up = above > below && below < Math.min(MAX_PANEL_HEIGHT, 200);

    
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - rect.width - MARGIN));

    if (up) {
      
      
      
      
      return {
        up,
        left,
        bottom: window.innerHeight - rect.top + GAP,
        maxHeight: Math.min(MAX_PANEL_HEIGHT, Math.max(above, 0)),
      };
    }

    
    
    
    const top = Math.max(rect.bottom + GAP, ceiling);

    return {
      up,
      left,
      top,
      maxHeight: Math.min(MAX_PANEL_HEIGHT, Math.max(window.innerHeight - top - MARGIN, 0)),
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
              ...(layout.up ? { bottom: layout.bottom } : { top: layout.top }),
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
