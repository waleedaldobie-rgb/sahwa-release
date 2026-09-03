// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { EmptyState } from '../components/ui';

let root: Root;
let container: HTMLDivElement;

const render = async (element: React.ReactElement) => {
  await act(async () => root.render(element));
};

describe('EmptyState desktop presentation', () => {
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

  it('renders compact table empty states with an accessible live status and action', async () => {
    await render(
      <EmptyState
        compact
        icon={<span aria-hidden="true">icon</span>}
        title="لا توجد فواتير بعد"
        description="ستظهر الفواتير هنا عند تسجيل طلب جديد."
        action={<button type="button">الانتقال إلى الطلبات</button>}
      />
    );

    const state = container.querySelector('[role="status"]');
    expect(state).not.toBeNull();
    expect(state?.className).toContain('sahwa-empty-state--compact');
    expect(state?.textContent).toContain('لا توجد فواتير بعد');
    expect(state?.textContent).toContain('الانتقال إلى الطلبات');
    expect(state?.querySelector('.sahwa-empty-state-icon')).not.toBeNull();
  });

  it('keeps the regular EmptyState variant available for modal and page-level messages', async () => {
    await render(<EmptyState icon={<span aria-hidden="true">icon</span>} title="لا توجد إشعارات حالياً" />);
    const state = container.querySelector('[role="status"]');
    expect(state?.className).not.toContain('sahwa-empty-state--compact');
  });
});
