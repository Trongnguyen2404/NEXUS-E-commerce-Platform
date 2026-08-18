import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import VariantPicker from './VariantPicker';
import type { ProductVariant } from '../types/api';

const makeVariant = (
  id: string,
  options: Record<string, string>,
  overrides: Partial<ProductVariant> = {},
): ProductVariant => ({
  id,
  productId: 'p1',
  sku: `SKU-${id}`,
  options,
  label: Object.values(options).join(' / '),
  price: 49.99,
  stock: 6,
  imageUrl: null,
  isActive: true,
  ...overrides,
});

// A deliberately sparse matrix: Blue only comes in S, and Red / M is sold out.
const redS = makeVariant('red-s', { Color: 'Red', Size: 'S' }, { stock: 4 });
const redM = makeVariant('red-m', { Color: 'Red', Size: 'M' }, { stock: 0 });
const blueS = makeVariant('blue-s', { Color: 'Blue', Size: 'S' }, { stock: 7 });
const greenS = makeVariant('green-s', { Color: 'Green', Size: 'S' }, { isActive: false });

const catalogue = [redS, redM, blueS, greenS];

const lastReported = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls.at(-1)?.[0] as ProductVariant | null | undefined;

describe('VariantPicker', () => {
  it('renders one group per option name, listing only active values', () => {
    render(<VariantPicker variants={catalogue} onChange={vi.fn()} />);

    expect(screen.getByText('Color')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();

    // Every option value is a button; the inactive Green variant is not offered.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Red',
      'Blue',
      'S',
      'M',
    ]);
    expect(screen.queryByRole('button', { name: 'Green' })).not.toBeInTheDocument();
  });

  it('reports an in-stock variant as soon as it mounts', () => {
    const onChange = vi.fn();
    render(<VariantPicker variants={catalogue} onChange={onChange} />);

    expect(lastReported(onChange)).toBe(redS);
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports the variant matching one value picked per group', async () => {
    const onChange = vi.fn();
    render(<VariantPicker variants={catalogue} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Blue' }));
    expect(lastReported(onChange)).toBe(blueS);

    await userEvent.click(screen.getByRole('button', { name: 'S' }));
    expect(lastReported(onChange)).toBe(blueS);
    expect(screen.getByText('7 in stock · SKU SKU-blue-s')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Red' }));
    expect(lastReported(onChange)).toBe(redS);
    expect(screen.getByText('Only 4 left in Red / S.')).toBeInTheDocument();
  });

  it('marks the combination that is out of stock', async () => {
    const onChange = vi.fn();
    render(<VariantPicker variants={catalogue} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'M' }));

    expect(lastReported(onChange)).toBe(redM);
    expect(screen.getByText('Red / M is out of stock.')).toBeInTheDocument();
  });

  it('stops offering a size the chosen colour does not come in', async () => {
    const onChange = vi.fn();
    render(<VariantPicker variants={catalogue} onChange={onChange} />);

    // Blue is only made in S, so M leaves the Size row entirely rather than
    // sitting there and silently rewriting the colour when clicked.
    await userEvent.click(screen.getByRole('button', { name: 'Blue' }));

    expect(screen.getByRole('button', { name: 'S' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'M' })).not.toBeInTheDocument();
    expect(lastReported(onChange)).toBe(blueS);

    const reported = onChange.mock.calls.map(([variant]) => variant);
    expect(reported.every((variant) => catalogue.includes(variant))).toBe(true);
  });

  it('names the sizes it had to hide so they are still discoverable', async () => {
    render(<VariantPicker variants={catalogue} onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Blue' }));

    expect(screen.getByText(/Also comes in/)).toHaveTextContent('M');
  });

  it('reports null and renders nothing when no variant is active', () => {
    const onChange = vi.fn();
    const { container } = render(
      <VariantPicker
        variants={[makeVariant('x', { Color: 'Red' }, { isActive: false })]}
        onChange={onChange}
      />,
    );

    expect(onChange).toHaveBeenCalledWith(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports null and renders nothing for a product with no variants at all', () => {
    const onChange = vi.fn();
    const { container } = render(<VariantPicker variants={[]} onChange={onChange} />);

    expect(onChange).toHaveBeenCalledWith(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to a sold-out variant when nothing is in stock', () => {
    const onChange = vi.fn();
    const soldOut = makeVariant('only', { Size: 'S' }, { stock: 0 });
    render(<VariantPicker variants={[soldOut]} onChange={onChange} />);

    expect(lastReported(onChange)).toBe(soldOut);
    expect(screen.getByText('S is out of stock.')).toBeInTheDocument();
  });

  // The real DeskLink hub: three variants whose options pair one-to-one, so no
  // unselected value ever fits the current selection. The picker used to strike
  // every one of them through and read as a hardcoded dead end.
  describe('a catalogue where each option value appears in exactly one variant', () => {
    const tenGraphite = makeVariant('a', { Ports: '10-in-1', Finish: 'Graphite' }, { stock: 16 });
    const twelveSilver = makeVariant('b', { Ports: '12-in-1', Finish: 'Silver' }, { stock: 12 });
    const fourteenMidnight = makeVariant('c', { Ports: '14-in-1', Finish: 'Midnight' }, { stock: 7 });
    const diagonal = [tenGraphite, twelveSilver, fourteenMidnight];

    it('offers every port, but only the one finish that port is made in', () => {
      render(<VariantPicker variants={diagonal} onChange={vi.fn()} />);

      for (const label of ['10-in-1', '12-in-1', '14-in-1']) {
        const chip = screen.getByRole('button', { name: label });
        expect(chip).toBeInTheDocument();
        expect(chip).not.toHaveClass('line-through');
      }

      // Default selection is 10-in-1, which only exists in Graphite.
      expect(screen.getByRole('button', { name: 'Graphite' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Silver' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Midnight' })).not.toBeInTheDocument();
    });

    it('still tells the shopper which other finishes the product is made in', () => {
      render(<VariantPicker variants={diagonal} onChange={vi.fn()} />);

      const hint = screen.getByText(/Also comes in/);
      expect(hint).toHaveTextContent('Silver');
      expect(hint).toHaveTextContent('Midnight');
      expect(hint).toHaveTextContent('change Ports to see them');
    });

    it('swaps the finish row over when a different port is chosen', async () => {
      const onChange = vi.fn();
      render(<VariantPicker variants={diagonal} onChange={onChange} />);

      await userEvent.click(screen.getByRole('button', { name: '14-in-1' }));

      expect(lastReported(onChange)).toBe(fourteenMidnight);
      expect(screen.getByRole('button', { name: 'Midnight' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Graphite' })).not.toBeInTheDocument();
    });

    it('reaches every variant through the ports row alone', async () => {
      const onChange = vi.fn();
      render(<VariantPicker variants={diagonal} onChange={onChange} />);

      for (const [label, expected] of [
        ['12-in-1', twelveSilver],
        ['14-in-1', fourteenMidnight],
        ['10-in-1', tenGraphite],
      ] as const) {
        await userEvent.click(screen.getByRole('button', { name: label }));
        expect(lastReported(onChange)).toBe(expected);
      }
    });

    it('never reports a combination the catalogue does not carry', async () => {
      const onChange = vi.fn();
      render(<VariantPicker variants={diagonal} onChange={onChange} />);

      await userEvent.click(screen.getByRole('button', { name: '10-in-1' }));
      await userEvent.click(screen.getByRole('button', { name: 'Graphite' }));

      const reported = onChange.mock.calls.map(([variant]) => variant);
      expect(reported.every((variant) => diagonal.includes(variant))).toBe(true);
      expect(
        screen.queryByText('That combination is not available — try another option.'),
      ).not.toBeInTheDocument();
    });
  });

  // The same two option names, but every pairing actually stocked. Proves the
  // one-to-one behaviour above is a property of that catalogue, not a limit of
  // the picker: give it a full matrix and each axis moves independently.
  describe('a catalogue that carries every combination', () => {
    const tenGraphite = makeVariant('a', { Ports: '10-in-1', Finish: 'Graphite' }, { stock: 5 });
    const tenMidnight = makeVariant('b', { Ports: '10-in-1', Finish: 'Midnight' }, { stock: 5 });
    const fourteenGraphite = makeVariant('c', { Ports: '14-in-1', Finish: 'Graphite' }, { stock: 5 });
    const fourteenMidnight = makeVariant('d', { Ports: '14-in-1', Finish: 'Midnight' }, { stock: 5 });
    const full = [tenGraphite, tenMidnight, fourteenGraphite, fourteenMidnight];

    it('changes the finish without disturbing the ports', async () => {
      const onChange = vi.fn();
      render(<VariantPicker variants={full} onChange={onChange} />);

      await userEvent.click(screen.getByRole('button', { name: '10-in-1' }));
      await userEvent.click(screen.getByRole('button', { name: 'Midnight' }));

      expect(lastReported(onChange)).toBe(tenMidnight);
      expect(screen.getByRole('button', { name: '10-in-1' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('marks nothing as swapping the other option, because nothing has to', () => {
      render(<VariantPicker variants={full} onChange={vi.fn()} />);

      for (const label of ['10-in-1', '14-in-1', 'Graphite', 'Midnight']) {
        const chip = screen.getByRole('button', { name: label });
        expect(chip).not.toHaveClass('border-dashed');
        expect(chip).not.toHaveClass('line-through');
      }
    });
  });
});
