import { Resend } from 'resend';

let resendClient: Resend | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export interface SendVerificationEmailResult {
  sent: boolean;
  provider: 'resend' | 'none';
  error?: string;
}

export async function sendVerificationCodeEmail(
  email: string,
  code: string,
  userName?: string
): Promise<SendVerificationEmailResult> {
  const resend = getResendClient();

  if (!resend) {
    console.warn(
      `[EMAIL SERVICE] RESEND_API_KEY is not configured in Secrets. In development/testing, please configure RESEND_API_KEY to send real emails.`
    );
    return {
      sent: false,
      provider: 'none',
      error: 'RESEND_API_KEY secret is not set',
    };
  }

  const recipientName = userName?.trim() || email.split('@')[0];

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verdict Desk Verification Code</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0E0F12; color: #F3F4F6; margin: 0; padding: 24px; }
          .container { max-width: 520px; margin: 0 auto; background: #151619; border: 1px solid #27272A; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
          .brand { font-size: 20px; font-weight: 700; color: #F97316; letter-spacing: -0.5px; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
          .title { font-size: 24px; font-weight: 700; color: #FFFFFF; margin: 0 0 12px 0; }
          .text { font-size: 14px; line-height: 1.6; color: #A1A1AA; margin: 0 0 24px 0; }
          .code-box { background: #1E1F24; border: 1px solid #3F3F46; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
          .code { font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #F97316; }
          .footer { font-size: 12px; color: #71717A; margin-top: 32px; border-top: 1px solid #27272A; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="brand">
            <span>⚖️ Verdict Desk</span>
          </div>
          <h1 class="title">Verify your email</h1>
          <p class="text">Hello ${recipientName},</p>
          <p class="text">Use the following 6-digit security code to authenticate your session and access your private Decision Vault:</p>
          <div class="code-box">
            <span class="code">${code}</span>
          </div>
          <p class="text">This code will expire in <strong>10 minutes</strong>. If you did not request this verification code, please ignore this email.</p>
          <div class="footer">
            Verdict Desk · Cloud Vault & Decision Intelligence Briefing
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const fromAddress = process.env.EMAIL_FROM || 'Verdict Desk <onboarding@resend.dev>';
    const data = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: `${code} is your Verdict Desk verification code`,
      html,
      text: `Hello ${recipientName},\n\nYour Verdict Desk 6-digit verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can safely ignore this email.\n\n- Verdict Desk`,
    });

    console.log(`[EMAIL SERVICE] Email sent via Resend to ${email}. ID:`, data.data?.id);
    return {
      sent: true,
      provider: 'resend',
    };
  } catch (err: any) {
    console.error(`[EMAIL SERVICE] Failed to send email via Resend to ${email}:`, err);
    return {
      sent: false,
      provider: 'resend',
      error: err.message || 'Resend API delivery error',
    };
  }
}
