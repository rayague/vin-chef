import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../src/lib/db';
import { initializeDemoData, getUsers, User } from '../../src/lib/storage';

beforeEach(() => {
  initializeDemoData(true);
});

describe('users CRUD via db adapter (fallback storage)', () => {
  it('adds, updates and deletes a user', async () => {
    const before = getUsers();
  const newUser: User & { password?: string } = { id: 'u-test-1', username: 'testuser', passwordHash: '', role: 'commercial' };
  // db.addUser expects { id, username, password?, role? }
  await db.addUser({ id: newUser.id, username: newUser.username, password: 'secret123', role: newUser.role });

  const users = await db.getUsers();
  const found = users.find(u => u.id === newUser.id);
  expect(found).toBeDefined();

  // update username
  await db.updateUser(newUser.id, { username: 'testuser2' });
  const updated = (await db.getUsers()).find(u => u.id === newUser.id);
  expect(updated && (updated as User).username === 'testuser2').toBe(true);

  // delete
  await db.deleteUser(newUser.id);
  const after = await db.getUsers();
  expect(after.find(u => u.id === newUser.id)).toBeUndefined();
  });
});
