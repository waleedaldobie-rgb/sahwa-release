// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Badge, getInvoiceStatusBadgeVariant, getOrderStatusBadgeVariant } from '../components/ui';

let root: Root;
let container: HTMLDivElement;

describe('Status badge visual semantics', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('maps order states to consistent semantic variants', () => {
    expect(getOrderStatusBadgeVariant('new')).toBe('blue');
    expect(getOrderStatusBadgeVariant('processing')).toBe('amber');
    expect(getOrderStatusBadgeVariant('ready')).toBe('emerald');
    expect(getOrderStatusBadgeVariant('delivered')).toBe('slate');
    expect(getOrderStatusBadgeVariant('cancelled')).toBe('red');
    expect(getOrderStatusBadgeVariant('cancelled', 70)).toBe('blue');
  });

  it('maps invoice settlement states without conflating cancellation settlement with payment', () => {
    expect(getInvoiceStatusBadgeVariant('paid')).toBe('emerald');
    expect(getInvoiceStatusBadgeVariant('partial')).toBe('amber');
    expect(getInvoiceStatusBadgeVariant('unpaid')).toBe('red');
    expect(getInvoiceStatusBadgeVariant('settled_by_cancellation')).toBe('blue');
  });

  it('renders the informational class for non-cash cancellation settlement', async () => {
    await act(async () => root.render(<Badge variant="blue">ملغى مع تسوية</Badge>));
    const badge = container.querySelector('.sahwa-badge');
    expect(badge?.className).toContain('sahwa-badge--info');
    expect(badge?.textContent).toContain('ملغى مع تسوية');
  });
});
