import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.js';

const ThrowingComponent = (): React.JSX.Element => {
  throw new Error('Test render crash');
};

const GoodComponent = (): React.JSX.Element => {
  return <p>All good</p>;
};

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeTruthy();
  });

  it('renders error UI when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Test render crash')).toBeTruthy();
    expect(screen.getByText('Reload window')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();

    vi.restoreAllMocks();
  });
});
