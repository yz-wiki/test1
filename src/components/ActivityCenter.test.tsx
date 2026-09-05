import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActivityCenter from './ActivityCenter';
import type { OnyxState } from '../state/onyx';

afterEach(cleanup);

describe('ActivityCenter', () => {
  it('shows newest activity and supports clear and Escape focus return', () => {
    const clearActivity = vi.fn();
    const st = {
      activity: [
        { id: 'new', timestamp: Date.now(), category: 'downloads', outcome: 'error', message: '下载失败' },
        { id: 'old', timestamp: Date.now() - 60_000, category: 'sync', outcome: 'success', message: '同步已恢复' },
      ],
      clearActivity,
    } as unknown as OnyxState;
    render(<ActivityCenter st={st} />);

    const trigger = screen.getByRole('button', { name: '最近活动，2 条' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: '最近活动' })).toBeTruthy();
    expect(screen.getAllByText(/下载失败|同步已恢复/).map(node => node.textContent)).toEqual(['下载失败', '同步已恢复']);
    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(clearActivity).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
