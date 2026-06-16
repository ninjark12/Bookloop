import { Resend } from "resend";

// Install: npm install resend
// Add RESEND_API_KEY to your .env and Vercel environment variables

const resend = new Resend(process.env.RESEND_API_KEY);

// The from address must be from a domain you have verified in Resend.
// During development you can use: onboarding@resend.dev (limited to your own email)
const FROM = process.env.RESEND_FROM ?? "Bookloop <noreply@yourdomain.com>";

export async function sendStreakReminderEmail({
  to,
  name,
  streakCount,
  graceUntil,
}: {
  to: string;
  name: string;
  streakCount: number;
  graceUntil: Date;
}): Promise<void> {
  // graceUntil is midnight of day+3 from last write, so this email always
  // arrives on the last valid writing day — "expires at end of today" is accurate.
  const subject =
    streakCount >= 7
      ? `Grace period: your ${streakCount}-day streak resets at midnight`
      : `Grace period: write today to save your Bookloop streak`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
          style="background:#EDE8DC;border-radius:12px;overflow:hidden;border:0.5px solid #D4C9B5;">

          <!-- Header -->
          <tr>
            <td style="background:#6B4C2A;padding:24px 32px;">
              <span style="font-size:22px;font-weight:700;color:#F5F0E8;letter-spacing:0.02em;">
                Bookloop
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#2C1810;line-height:1.6;">
                Hi ${name},
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#2C1810;line-height:1.6;">
                You missed yesterday, so today is your <strong>grace period day</strong> —
                a one-day window to keep your streak alive before it resets at midnight tonight.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#2C1810;line-height:1.6;">
                Write a journal entry today and your <strong>${streakCount}-day streak</strong> continues as if nothing happened.
              </p>

              <!-- Streak count callout -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center" style="background:#F5F0E8;border-radius:8px;padding:20px;border:0.5px solid #D4C9B5;">
                    <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.1em;color:#8C7B6B;text-transform:uppercase;">
                      Current streak
                    </p>
                    <p style="margin:0;font-size:40px;font-weight:700;color:#6B4C2A;">
                      ${streakCount}
                    </p>
                    <p style="margin:4px 0 0;font-size:12px;color:#8C7B6B;">days</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:14px;color:#4A3728;line-height:1.6;">
                Write even a brief reflection on what you are reading right now to keep your streak going.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#6B4C2A;border-radius:8px;">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/journal"
                      style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;
                             color:#F5F0E8;text-decoration:none;letter-spacing:0.02em;">
                      Write a journal entry
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:0.5px solid #D4C9B5;">
              <p style="margin:0;font-size:11px;color:#8C7B6B;line-height:1.6;">
                You are receiving this because you opted in to streak reminders on Bookloop.
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/profile"
                  style="color:#6B4C2A;text-decoration:underline;">
                  Manage notification preferences
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });
}
