// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MirrorIntentCard from '../MirrorIntentCard';

afterEach(() => cleanup());

describe('MirrorIntentCard', () => {
  it('renders detected URL + two mode options', () => {
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'https://stripe.com/pricing' }} suggestedMode={undefined} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/https:\/\/stripe\.com\/pricing/)).toBeTruthy();
    expect(screen.getByText(/Mirror — 1:1/i)).toBeTruthy();
    expect(screen.getByText(/AST — ~95%/i)).toBeTruthy();
  });

  it('pre-selects Mirror when suggestedMode is mirror', () => {
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'x' }} suggestedMode="mirror" onConfirm={() => {}} onCancel={() => {}} />);
    const inputs = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);
  });

  it('confirm calls callback with selected mode', () => {
    const onConfirm = vi.fn();
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'x' }} suggestedMode="mirror" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByText(/Confirm/i));
    expect(onConfirm).toHaveBeenCalledWith('mirror');
  });

  it('confirm is disabled until a mode is picked', () => {
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'x' }} suggestedMode={undefined} onConfirm={() => {}} onCancel={() => {}} />);
    const confirm = screen.getByText(/Confirm/i) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it('cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'x' }} suggestedMode={undefined} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders image thumbnail when source is image', () => {
    render(<MirrorIntentCard source={{ kind: 'image', mimeType: 'image/png', base64: 'iVBORw0KGgo=' }} suggestedMode={undefined} onConfirm={() => {}} onCancel={() => {}} />);
    const img = screen.getByAltText(/screenshot/i) as HTMLImageElement;
    expect(img.src).toContain('data:image/png;base64,iVBORw0KGgo=');
  });
});
