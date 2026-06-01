// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ThemeMergeDialog, { type ThemeProposalDto } from '../ThemeMergeDialog';

afterEach(() => cleanup());

const proposal: ThemeProposalDto = {
  palette: [{ value: '#1a73e8', source: 'https://e.com' }],
  typography: { primaryFont: 'Inter', secondaryFont: null, headings: [{ tag: 'h1', fontSize: '32px', fontWeight: '700' }], body: { fontFamily: 'Inter', fontSize: '16px' } },
  radius: ['4px', '8px'],
  shadow: ['0 1px 2px rgba(0,0,0,0.05)'],
  source: 'https://e.com',
};

describe('ThemeMergeDialog', () => {
  it('renders all four section rows', () => {
    render(<ThemeMergeDialog current={null} proposal={proposal} onApply={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Palette/i)).toBeTruthy();
    expect(screen.getByText(/Typography/i)).toBeTruthy();
    expect(screen.getByText(/Radius/i)).toBeTruthy();
    expect(screen.getByText(/Shadow/i)).toBeTruthy();
  });

  it('renders the proposal source URL in the header', () => {
    render(<ThemeMergeDialog current={null} proposal={proposal} onApply={() => {}} onCancel={() => {}} />);
    expect(screen.getAllByText(/https:\/\/e\.com/).length).toBeGreaterThan(0);
  });

  it('Apply calls onApply with the section choices', () => {
    const onApply = vi.fn();
    render(<ThemeMergeDialog current={null} proposal={proposal} onApply={onApply} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('palette choice'), { target: { value: 'union' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledWith({ palette: 'union', typography: 'take-new', radius: 'take-new', shadow: 'take-new' });
  });

  it('Cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(<ThemeMergeDialog current={null} proposal={proposal} onApply={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
