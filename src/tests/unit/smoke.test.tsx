import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from '@/app/App';

describe('App shell', () => {
  it('renders the Calqo title chip', () => {
    render(<App />);
    // The app name appears in the centered title chip.
    expect(screen.getAllByText('Calqo').length).toBeGreaterThan(0);
  });
});
