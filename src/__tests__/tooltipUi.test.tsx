// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Tooltip } from '../components/ui';

let root: Root;
let container: HTMLDivElement;

const render = async (element: React.ReactElement) => {
  await act(async () => root.render(element));
};

describe('Tooltip UI', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders a labelled tooltip for an icon-only control', async () => {
    await render(
      <Tooltip content="طباعة الطلب ORD-1">
        <button type="button" aria-label="طباعة الطلب ORD-1">print</button>
      </Tooltip>
    );

    const wrapper = container.querySelector('.sahwa-tooltip');
    const tooltip = container.querySelector('[role="tooltip"]');
    const button = container.querySelector('button');

    expect(wrapper).not.toBeNull();
    expect(tooltip?.textContent).toBe('طباعة الطلب ORD-1');
    expect(button?.getAttribute('aria-label')).toBe('طباعة الطلب ORD-1');
    expect(button?.getAttribute('aria-describedby')).toBe(tooltip?.getAttribute('id'));
  });

  it('keeps tooltip content non-interactive and preserves the wrapped action', async () => {
    const onClick = () => undefined;
    await render(
      <Tooltip content="إغلاق النافذة">
        <button type="button" aria-label="إغلاق النافذة" onClick={onClick}>x</button>
      </Tooltip>
    );

    const tooltip = container.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tooltip?.getAttribute('aria-hidden')).toBeNull();
    expect(tooltip?.className).toContain('sahwa-tooltip-content');
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('إغلاق النافذة');
  });
});
