// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { SegmentedControl } from '../components/ui';

let root: Root;
let container: HTMLDivElement;

describe('Shared segmented-control UI semantics', () => {
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

  it('renders a labeled group with button type and one pressed option', async () => {
    await act(async () => root.render(
      <SegmentedControl
        value="all"
        onChange={() => undefined}
        ariaLabel="تصفية الحالة"
        options={[{ value: 'all', label: 'الكل' }, { value: 'ready', label: 'جاهز' }]}
      />
    ));
    const group = container.querySelector('[role="group"]');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(group?.getAttribute('aria-label')).toBe('تصفية الحالة');
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.type === 'button')).toBe(true);
    expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('calls onChange with the selected value', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(
      <SegmentedControl
        value="all"
        onChange={onChange}
        ariaLabel="تصفية الحالة"
        options={[{ value: 'all', label: 'الكل' }, { value: 'ready', label: 'جاهز' }]}
      />
    ));
    await act(async () => {
      (Array.from(container.querySelectorAll('button'))[1]).click();
    });
    expect(onChange).toHaveBeenCalledWith('ready');
  });
});
