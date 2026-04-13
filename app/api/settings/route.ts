export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getOrCreateUser } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ settings: null });

  const { data: settings } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return NextResponse.json({ settings: settings || null });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    notify_email?: boolean;
    notify_telegram?: boolean;
    notify_viber?: boolean;
    telegram_chat_id?: string;
    viber_user_id?: string;
    large_tx_threshold?: number;
  };

  const supabase = createServerSupabaseClient();

  const user = await getOrCreateUser(session.user.email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { error } = await supabase
    .from('users')
    .update({
      notify_email: body.notify_email,
      notify_telegram: body.notify_telegram,
      notify_viber: body.notify_viber,
      telegram_chat_id: body.telegram_chat_id || null,
      viber_user_id: body.viber_user_id || null,
      large_tx_threshold: body.large_tx_threshold,
    })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });

  return NextResponse.json({ success: true });
}
