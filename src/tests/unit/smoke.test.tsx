import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { App } from '@/app/App';
import { APP_REPOSITORY_URL, APP_VERSION } from '@/lib/appInfo';

describe('App shell', () => {
  it('renders the Calqo title chip', () => {
    render(<App />);
    // The app name appears in the centered title chip.
    expect(screen.getAllByText('Calqo').length).toBeGreaterThan(0);
  });

  it('renders product metadata and opens the GitHub repository', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<App />);

    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open GitHub repository' }),
    );
    expect(open).toHaveBeenCalledWith(
      APP_REPOSITORY_URL,
      '_blank',
      'noopener,noreferrer',
    );

    open.mockRestore();
  });
});
