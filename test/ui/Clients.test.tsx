import { render, screen, waitFor } from '@testing-library/react';
import Clients from '../../src/pages/Clients';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { vi, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../../src/lib/db', () => ({
  default: {
    getClients: async () => [{ id: 'c1', name: 'Client A' }],
    getUsers: async () => [{ id: '1', username: 'admin' }],
  }
}));

// Mock auth provider so useAuth works during tests
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '1', username: 'admin', role: 'admin' }, login: async () => true, logout: () => {}, isAdmin: true, isCommercial: false }),
}));

describe('Clients UI', () => {
  it('renders clients page and shows Add Client button', async () => {
    render(
      <MemoryRouter>
        <Clients />
      </MemoryRouter> as unknown as React.ReactElement
    );
    await waitFor(() => expect(screen.getByText(/Nouvel utilisateur/i)).toBeInTheDocument());
  });
});
