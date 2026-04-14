import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';

export async function POST(req: NextRequest) {
  return NextResponse.json({ error: 'Tada paprastinam, gerai' }, { status: 403 });

  // Original logic below — unreachable while the 403 short-circuit above is active.
  // eslint-disable-next-line no-unreachable
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'passwordTooShort' }, { status: 400 });
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.length > 0) {
      return NextResponse.json({ error: 'emailInUse' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      [email, password_hash]
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('[register] unhandled error:', err);
    return NextResponse.json({ error: 'registerError' }, { status: 500 });
  }
}
