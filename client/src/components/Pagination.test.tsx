import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Pagination from './Pagination';

type PagerProps = ComponentProps<typeof Pagination>;

const renderPager = (props: Partial<PagerProps> = {}) => {
  const onChange = vi.fn();
  const view = render(
    <Pagination page={1} totalPages={5} total={48} onChange={onChange} {...props} />,
  );
  return { ...view, onChange };
};

describe('Pagination', () => {
  it('stays out of the way when there is nothing to page through', () => {
    const single = renderPager({ totalPages: 1, total: 4 });
    expect(single.container).toBeEmptyDOMElement();
    single.unmount();

    const none = renderPager({ totalPages: 0, total: 0 });
    expect(none.container).toBeEmptyDOMElement();
  });

  it('summarises where the reader is', () => {
    renderPager({ page: 3, totalPages: 5, total: 48, label: 'orders' });

    expect(screen.getByText('Page 3 of 5 · 48 orders')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
  });

  it('disables previous on the first page', () => {
    renderPager({ page: 1, totalPages: 5 });

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('disables next on the last page', () => {
    renderPager({ page: 5, totalPages: 5 });

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('calls onChange with the page number that was clicked', async () => {
    const { onChange } = renderPager({ page: 3, totalPages: 5 });

    await userEvent.click(screen.getByRole('button', { name: '4' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('steps one page at a time with previous and next', async () => {
    const { onChange } = renderPager({ page: 3, totalPages: 5 });

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onChange).toHaveBeenLastCalledWith(4);

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('keeps the run short on a long list, with the ends always reachable', () => {
    renderPager({ page: 6, totalPages: 12, total: 120 });

    expect(
      screen
        .getAllByRole('button')
        .map((b) => b.textContent)
        .filter((text) => text !== ''),
    ).toEqual(['1', '5', '6', '7', '12']);
  });
});
