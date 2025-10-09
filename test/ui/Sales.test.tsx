import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

// Mock hooks and db before importing the component
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '1', username: 'admin', role: 'admin' }, login: async () => true, logout: () => {}, isAdmin: true, isCommercial: false }),
}));

vi.mock('@/lib/db', () => ({
  getSales: async () => [],
  getProducts: async () => [{ id: 'p1', name: 'Test', unitPrice: 100, stockQuantity: 10 }],
  getClients: async () => [{ id: 'c1', name: 'Client A' }],
  getUsers: async () => [{ id: '1', username: 'admin' }],
}));

describe('Sales UI', () => {
  it('renders sales page and shows New Sale button', async () => {
    const Sales = (await import('../../src/pages/Sales')).default;
    render(<Sales /> as unknown as React.ReactElement);
    await waitFor(() => expect(screen.getByText(/Nouvelle Vente/i)).toBeInTheDocument());
  });
});
