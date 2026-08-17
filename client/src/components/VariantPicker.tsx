import { useEffect, useMemo, useState } from 'react';
import type { ProductVariant } from '../types/api';

interface Props {
  variants: ProductVariant[];
  onChange: (variant: ProductVariant | null) => void;
}

/**
 * Turns a flat list of variants into one row of choices per option name.
 *
 * The server stores each variant as a whole combination ({ Size: "M", Color:
 * "Black" }); shoppers pick one attribute at a time, so the groups are derived
 * here rather than stored separately.
 */
const VariantPicker = ({ variants, onChange }: Props) => {
  const active = useMemo(() => variants.filter((v) => v.isActive), [variants]);

  /** { Size: ["S","M"], Color: ["Black","Red"] }, insertion-ordered. */
  const groups = useMemo(() => {
    const result = new Map<string, string[]>();

    for (const variant of active) {
      for (const [name, value] of Object.entries(variant.options)) {
        const values = result.get(name) ?? [];
        if (!values.includes(value)) values.push(value);
        result.set(name, values);
      }
    }

    return result;
  }, [active]);

  // What the shopper has explicitly picked; null until they touch anything.
  const [picked, setPicked] = useState<Record<string, string> | null>(null);

  // The default is derived during render rather than written by an effect —
  // setting state inside an effect just to seed it causes a second render pass
  // (and React's lint rule rightly objects).
  const defaultSelection = useMemo(() => {
    if (active.length === 0) return {};
    // First combination that is actually in stock, so the common case is one
    // click. Falls back to the first active variant when everything is out.
    return (active.find((v) => v.stock > 0) ?? active[0]).options;
  }, [active]);

  const selection = picked ?? defaultSelection;
  const setSelection = setPicked;

  const matched = useMemo(
    () =>
      active.find((variant) =>
        Object.entries(variant.options).every(([name, value]) => selection[name] === value),
      ) ?? null,
    [active, selection],
  );

  useEffect(() => {
    onChange(matched);
  }, [matched, onChange]);

  /**
   * Picks a value, then moves the other attributes to the nearest combination
   * that actually exists.
   *
   * Without this, choosing a perfectly valid colour can dead-end: with S
   * selected and only M available in Silver, clicking Silver would leave the
   * shopper on "S / Silver", which is not a real product. Real shops resolve
   * this for you; the alternative is a picker that punishes exploring.
   */
  const choose = (name: string, value: string) => {
    const candidates = active.filter((variant) => variant.options[name] === value);
    if (candidates.length === 0) return;

    // Prefer in-stock, then whichever keeps the most of the current choices.
    const score = (variant: ProductVariant) =>
      (variant.stock > 0 ? 100 : 0) +
      Object.entries(selection).filter(
        ([otherName, otherValue]) =>
          otherName !== name && variant.options[otherName] === otherValue,
      ).length;

    const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
    setSelection(best.options);
  };

  /** Is there any in-stock variant if this one value were chosen? */
  const isAvailable = (name: string, value: string) =>
    active.some(
      (variant) =>
        variant.options[name] === value &&
        variant.stock > 0 &&
        // Respect the other groups the shopper has already narrowed down.
        Object.entries(selection).every(
          ([otherName, otherValue]) =>
            otherName === name || variant.options[otherName] === otherValue,
        ),
    );

  if (groups.size === 0) return null;

  return (
    <div className="space-y-6 mb-8">
      {[...groups.entries()].map(([name, values]) => (
        <div key={name}>
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {name}
            </span>
            {selection[name] && (
              <span className="text-xs font-bold text-black">{selection[name]}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {values.map((value) => {
              const isSelected = selection[name] === value;
              const available = isAvailable(name, value);

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => choose(name, value)}
                  className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all ${
                    isSelected
                      ? 'border-black bg-black text-white'
                      : available
                        ? 'border-gray-200 bg-white text-black hover:border-black'
                        : // Still selectable — the shopper may want to change
                          // another attribute to make it work — but visibly
                          // marked as unavailable in the current combination.
                          'border-gray-100 bg-surface-muted text-gray-300 line-through'
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="text-xs font-medium">
        {!matched ? (
          <span className="text-state-warning">
            That combination is not available — try another option.
          </span>
        ) : matched.stock === 0 ? (
          <span className="text-state-danger">{matched.label} is out of stock.</span>
        ) : matched.stock <= 5 ? (
          <span className="text-state-warning">Only {matched.stock} left in {matched.label}.</span>
        ) : (
          <span className="text-gray-400">{matched.stock} in stock · SKU {matched.sku}</span>
        )}
      </div>
    </div>
  );
};

export default VariantPicker;
