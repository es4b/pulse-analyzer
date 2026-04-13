import { getServerSession } from 'next-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const TEST_MODE = true; // TODO: set false before production

const TEST_USER = {
  email: 'test@pulseanalyzer.dev',
  name: 'Test User',
  id: 'test-user-id',
};

export async function getSession() {
  if (TEST_MODE) {
    return { user: TEST_USER };
  }
  return getServerSession();
}

export async function getOrCreateUser(email: string): Promise<{ id: string } | null> {
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) return existing;

  const { data: created } = await supabase
    .from('users')
    .insert({ email })
    .select('id')
    .single();

  return created ?? null;
}
