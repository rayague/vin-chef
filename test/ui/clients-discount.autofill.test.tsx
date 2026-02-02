import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, afterEach, beforeAll } from 'vitest';

// In-memory mock store for clients
type ClientRow = {
  id: string;
  name: string;
  phone?: string;
  discount?: number;
  discountType?: 'percentage' | 'fixed';
};

const clientsStore: ClientRow[] = [
  { id: 'c1', name: 'Client A', phone: '+22997000000' }
];

const dbMock = {
  getClients: async () => clientsStore.slice(),
  updateClient: async (id: string, updates: Partial<ClientRow>) => {
    const idx = clientsStore.findIndex(c => c.id === id);
    if (idx === -1) return null;
    clientsStore[idx] = { ...clientsStore[idx], ...updates };
    return clientsStore[idx];
  },
  addClient: async (client: ClientRow) => {
    clientsStore.push(client);
    return client;
  },
  getUsers: async () => [{ id: '1', username: 'admin' }],
};

vi.mock('../../src/lib/db', () => ({
  default: dbMock,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '1', username: 'admin', role: 'admin' }, login: async () => true, logout: () => {}, isAdmin: true, isCommercial: false }),
}));

// Mock UI primitives (Dialog/Select) to avoid portal and Radix complexities in JSDOM
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) => children,
  DialogTrigger: ({ children }: { children?: React.ReactNode }) => children,
  DialogContent: ({ children }: { children?: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// No global timeout modification here - keep tests using default Vitest timeouts.

afterEach(() => {
  cleanup();
});

describe('Clients discount persistence', () => {
  it('saves client discount and shows it in the clients table', async () => {
    const Clients = (await import('../../src/pages/Customers')).default;
    render(
      <MemoryRouter>
        <Clients />
      </MemoryRouter> as unknown as React.ReactElement
    );

    // Wait for the client row to appear
    await waitFor(() => expect(screen.getByText(/Client A/)).toBeInTheDocument());

    // Click the Modifier button for the client
    const modifyButtons = screen.getAllByText(/Modifier/i);
    expect(modifyButtons.length).toBeGreaterThan(0);
    fireEvent.click(modifyButtons[0]);

    // Wait for the edit modal fields
    await waitFor(() => expect(screen.getByText(/Modifier le client/)).toBeInTheDocument());

    // Set discount type and value: find controls inside the modal container
    const modal = screen.getByText(/Modifier le client/).closest('div');
    expect(modal).toBeTruthy();
    const discountSelect = modal!.querySelector('select') as HTMLSelectElement;
    const discountInput = modal!.querySelector('input[type="number"]') as HTMLInputElement;
    expect(discountSelect).toBeTruthy();
    expect(discountInput).toBeTruthy();
    fireEvent.change(discountSelect, { target: { value: 'percentage' } });
    fireEvent.change(discountInput, { target: { value: '10' } });

    // Click Enregistrer
    const saveButton = screen.getByText(/Enregistrer/i);
    fireEvent.click(saveButton);

    // After save, clients table should show the discount (10%)
    await waitFor(() => expect(screen.getByText(/10%/)).toBeInTheDocument());
  });
});

describe('Sales autofill from client discount', () => {
  it('prefills sale item discounts when opened with a clientId', async () => {
    const Sales = (await import('../../src/pages/Sales')).default;
    render(
      <MemoryRouter initialEntries={[{ pathname: '/sales', state: { clientId: 'c1' } }]}>
        <Sales />
      </MemoryRouter> as unknown as React.ReactElement
    );

    // Wait for the New Sale modal to be open (it should open because of location state)
    await waitFor(() => expect(screen.getByText(/Enregistrer une vente/)).toBeInTheDocument());

    // The modal should have at least one 'Valeur Remise' input prefilled with 10
    const remiseInputs = screen.getAllByLabelText(/Valeur Remise/i) as HTMLInputElement[];
    expect(remiseInputs.length).toBeGreaterThan(0);
    expect(remiseInputs[0].value).toBe('10');
  });
});
