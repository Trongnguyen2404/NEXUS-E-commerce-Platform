import { useEffect, useMemo, useState } from 'react';
import type { ProductVariant } from '../types/api';

// Props for the variant picker.
interface Props {
  variants: ProductVariant[];
  onChange: (variant: ProductVariant | null) => void;
}

// Lets the shopper choose one value per option and reports the matching variant.
//
// The groups narrow left to right: the first one always offers everything, and
// each later one offers only what the choices above it actually come in. On a
// catalogue where the options pair up one-to-one this means picking the ports
// leaves a single finish, which is the honest answer — the alternative was
// three finish buttons that all silently rewrote the ports when clicked.
const VariantPicker = ({ variants, onChange }: Props) => {
  const active = useMemo(() => variants.filter((v) => v.isActive), [variants]);

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

  const [picked, setPicked] = useState<Record<string, string> | null>(null);

  const defaultSelection = useMemo(() => {
    if (active.length === 0) return {};

    return (active.find((v) => v.stock > 0) ?? active[0]).options;
  }, [active]);

  const selection = picked ?? defaultSelection;
  const setSelection = setPicked;

  const matched = useMemo(
    () =>
      active.find((variant) => {
        const options = Object.entries(variant.options);
        // Compare the key sets too. Checking only that the variant's own options
        // agree with the selection let a variant with FEWER options win: one
        // declaring just { Ports } matched a { Ports, Finish } selection and the
        // cart got the wrong SKU.
        if (options.length !== Object.keys(selection).length) return false;
        return options.every(([name, value]) => selection[name] === value);
      }) ?? null,
    [active, selection],
  );

  useEffect(() => {
    onChange(matched);
  }, [matched, onChange]);

  const choose = (name: string, value: string) => {
    const candidates = active.filter((variant) => variant.options[name] === value);
    if (candidates.length === 0) return;

    const score = (variant: ProductVariant) =>
      (variant.stock > 0 ? 100 : 0) +
      Object.entries(selection).filter(
        ([otherName, otherValue]) =>
          otherName !== name && variant.options[otherName] === otherValue,
      ).length;

    const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
    setSelection(best.options);
  };

  const names = [...groups.keys()];

  // What each group offers, given only the groups to its left. Constraining by
  // every other group instead would collapse the first group to one value too,
  // leaving nothing to change.
  const offered = useMemo(() => {
    const result = new Map<string, string[]>();

    names.forEach((name, index) => {
      const earlier = names.slice(0, index);
      const reachable = active.filter((variant) =>
        earlier.every((other) => variant.options[other] === selection[other]),
      );

      result.set(
        name,
        (groups.get(name) ?? []).filter((value) =>
          reachable.some((variant) => variant.options[name] === value),
        ),
      );
    });

    return result;
    // names is derived from groups, so groups covers it.
  }, [active, groups, selection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sold out in every combination it appears in, not merely in this one.
  const soldOutEverywhere = (name: string, value: string) =>
    !active.some((variant) => variant.options[name] === value && variant.stock > 0);

  if (groups.size === 0) return null;

  return (
    <div className="space-y-6 mb-8">
      {names.map((name) => {
        const all = groups.get(name) ?? [];
        const shown = offered.get(name) ?? [];
        const hidden = all.filter((value) => !shown.includes(value));

        return (
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
              {shown.map((value) => {
                const isSelected = selection[name] === value;
                const soldOut = soldOutEverywhere(name, value);

                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => choose(name, value)}
                    title={soldOut ? `${value} is sold out` : undefined}
                    className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all ${
                      isSelected
                        ? 'border-black bg-black text-white'
                        : soldOut
                          ? 'border-gray-100 bg-surface-muted text-gray-300 line-through hover:border-gray-300'
                          : 'border-gray-200 bg-white text-black hover:border-black'
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>

            {/* Without this the shopper would never learn the product exists in
                the finishes this combination happens to exclude. */}
            {hidden.length > 0 && (
              <p className="mt-2.5 text-[11px] font-medium text-gray-500">
                Also comes in{' '}
                <span className="font-bold text-gray-700">{hidden.join(', ')}</span> — change{' '}
                {names[names.indexOf(name) - 1] ?? 'your selection'} to see them.
              </p>
            )}
          </div>
        );
      })}

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
