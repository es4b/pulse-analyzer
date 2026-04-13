import { Resend } from 'resend';
import type { AnalysisResult, User } from '@/lib/supabase/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? 'placeholder');
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  try {
    const resend = getResend();
    await resend.emails.send({
      from: 'Pulse Analyzer <notifications@pulseanalyzer.app>',
      to,
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px;">
          <div style="border-bottom: 1px solid #E5E5E5; padding-bottom: 24px; margin-bottom: 24px;">
            <h1 style="font-size: 18px; font-weight: 600; color: #1D1D1F; margin: 0;">Pulse Analyzer</h1>
          </div>
          <div style="color: #1D1D1F; font-size: 15px; line-height: 1.6;">
            ${body}
          </div>
          <div style="border-top: 1px solid #E5E5E5; padding-top: 24px; margin-top: 40px;">
            <p style="color: #86868B; font-size: 13px; margin: 0;">
              You are receiving this because you have notifications enabled.
              <a href="#" style="color: #1D1D1F;">Manage settings</a>
            </p>
          </div>
        </div>
      `,
    });
  } catch (error) {
    console.error('Email send error:', error);
  }
}

export async function sendTelegram(chatId: string, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

export async function sendViber(userId: string, message: string): Promise<void> {
  const token = process.env.VIBER_AUTH_TOKEN;
  if (!token) return;

  try {
    await fetch('https://chatapi.viber.com/pa/send_message', {
      method: 'POST',
      headers: {
        'X-Viber-Auth-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receiver: userId,
        type: 'text',
        text: message,
      }),
    });
  } catch (error) {
    console.error('Viber send error:', error);
  }
}

export async function checkAndNotify(walletId: string): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { data: wallet } = await supabase
    .from('wallets')
    .select('*, users(*)')
    .eq('id', walletId)
    .single();

  if (!wallet) return;

  const user = wallet.users as User;
  if (!user) return;

  const { data: analysis } = await supabase
    .from('analysis_results')
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!analysis) return;

  const typedAnalysis = analysis as AnalysisResult;
  const notifications: { message: string; type: string }[] = [];

  if (typedAnalysis.anomalies) {
    const criticalAnomalies = typedAnalysis.anomalies.filter(
      (a) => a.severity === 'critical' || a.severity === 'high'
    );
    for (const anomaly of criticalAnomalies) {
      notifications.push({
        type: 'anomaly',
        message: `Anomaly detected: ${anomaly.description}`,
      });
    }
  }

  notifications.push({
    type: 'forecast',
    message: 'New forecast available for your wallet',
  });

  for (const notif of notifications) {
    await supabase.from('notifications').insert({
      user_id: user.id,
      type: notif.type,
      message: notif.message,
      channel: 'system',
    });

    const text = `*Pulse Analyzer*\n\n${notif.message}`;

    if (user.notify_email) {
      await sendEmail(user.email, 'Pulse Analyzer Notification', `<p>${notif.message}</p>`);
    }
    if (user.notify_telegram && user.telegram_chat_id) {
      await sendTelegram(user.telegram_chat_id, text);
    }
    if (user.notify_viber && user.viber_user_id) {
      await sendViber(user.viber_user_id, notif.message);
    }
  }
}

export async function sendDailySummary(userId: string): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) return;

  const typedUser = user as User;

  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!wallet) return;

  const { data: analysis } = await supabase
    .from('analysis_results')
    .select('*')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!analysis) return;

  const typedAnalysis = analysis as AnalysisResult;
  const portfolioValue = typedAnalysis.metrics?.portfolioValue || 0;
  const anomalyCount = typedAnalysis.anomalies?.length || 0;

  const message = `Daily Summary for your PulseChain wallet:\n\nPortfolio Value: $${portfolioValue.toFixed(2)}\nAnomalies: ${anomalyCount}\n\nVisit Pulse Analyzer to see the full report.`;

  if (typedUser.notify_email) {
    await sendEmail(
      typedUser.email,
      'Daily Pulse Analyzer Summary',
      `<p>${message.replace(/\n/g, '<br>')}</p>`
    );
  }
  if (typedUser.notify_telegram && typedUser.telegram_chat_id) {
    await sendTelegram(typedUser.telegram_chat_id, message);
  }
  if (typedUser.notify_viber && typedUser.viber_user_id) {
    await sendViber(typedUser.viber_user_id, message);
  }
}
