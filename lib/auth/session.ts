import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import pool from '@/lib/db';

export async function getSession() {
  return getServerSession(authOptions);
}

export async function getOrCreateUser(email: string): Promise<{ id: string } | null> {
  const { rows: existing } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );

  if (existing.length > 0) return existing[0];

  const { rows: created } = await pool.query(
    'INSERT INTO users (email) VALUES ($1) RETURNING id',
    [email]
  );

  return created[0] ?? null;
}
