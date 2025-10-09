import { render, screen, waitFor } from '@testing-library/react';
import Clients from '../../src/pages/Clients';
import React from 'react';
import { vi, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../../src/lib/db', () => ({
  default: {
    getClients: async () => [{ id: 'c1', name: 'Client A' }],
    getUsers: async () => [{ id: '1', username: 'admin' }],
  }
}));

describe('Clients UI', () => {
  it('renders clients page and shows Add Client button', async () => {
    render(<Clients /> as unknown as React.ReactElement);
    await waitFor(() => expect(screen.getByText(/Nouveau client/i)).toBeInTheDocument());
  });
});
