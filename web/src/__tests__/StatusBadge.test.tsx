import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import StatusBadge from '../components/common/StatusBadge';

describe('StatusBadge', () => {
  const statuses = ['pending', 'running', 'completed', 'failed', 'timed_out', 'cancelled'];

  for (const status of statuses) {
    it(`renders ${status} badge`, () => {
      render(<StatusBadge status={status} />);
      const label = status === 'timed_out' ? 'Timed Out' : status.charAt(0).toUpperCase() + status.slice(1);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  }

  it('handles unknown status gracefully', () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
