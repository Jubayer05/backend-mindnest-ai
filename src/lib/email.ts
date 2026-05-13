import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const FROM =
  process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@mindnest.ai";

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEmailLayout(params: {
  title: string;
  preheader: string;
  greetingName: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
  fallbackText: string;
}): { html: string; text: string } {
  const title = escapeHtml(params.title);
  const preheader = escapeHtml(params.preheader);
  const greetingName = escapeHtml(params.greetingName);
  const ctaLabel = escapeHtml(params.ctaLabel);
  const footerNote = escapeHtml(params.footerNote);
  const fallbackText = escapeHtml(params.fallbackText);
  const ctaUrl = params.ctaUrl;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;">
    <!-- Preheader (hidden) -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;">
      ${preheader}
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7fb;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;">
            <tr>
              <td style="padding:0 4px 14px 4px;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;font-weight:800;font-size:18px;letter-spacing:0.2px;">
                  MindNest AI
                </div>
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6b7280;font-size:12px;margin-top:4px;">
                  Learn • Build • Grow
                </div>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(17,24,39,0.06);">
                <div style="padding:22px 22px 0 22px;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#ec4899 100%);">
                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#ffffff;font-weight:800;font-size:18px;">
                    ${title}
                  </div>
                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:rgba(255,255,255,0.85);font-size:12px;margin-top:6px;padding-bottom:18px;">
                    ${preheader}
                  </div>
                </div>

                <div style="padding:22px;">
                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;font-size:16px;font-weight:700;">
                    Hello ${greetingName},
                  </div>

                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#374151;font-size:14px;line-height:1.6;margin-top:10px;">
                    ${params.bodyHtml}
                  </div>

                  <div style="margin-top:18px;">
                    <a href="${ctaUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;font-weight:700;padding:12px 18px;border-radius:10px;">
                      ${ctaLabel}
                    </a>
                  </div>

                  <div style="margin-top:16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6b7280;font-size:12px;line-height:1.5;">
                    If the button doesn’t work, copy and paste this link into your browser:
                    <div style="word-break:break-all;margin-top:6px;">
                      <a href="${ctaUrl}" style="color:#4f46e5;text-decoration:underline;">${escapeHtml(
                        ctaUrl,
                      )}</a>
                    </div>
                  </div>

                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;" />

                  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#6b7280;font-size:12px;line-height:1.5;">
                    ${footerNote}
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:14px 6px 0 6px;">
                <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#9ca3af;font-size:11px;line-height:1.4;">
                  © ${new Date().getFullYear()} MindNest AI. All rights reserved.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${params.title}

Hello ${params.greetingName},

${params.fallbackText}

${params.ctaLabel}: ${params.ctaUrl}

If you didn’t request this, you can ignore this email.
`;

  return { html, text };
}

export async function sendVerificationEmail(
  email: string,
  url: string,
  name?: string,
): Promise<void> {
  const displayName = name ?? email;

  const { html, text } = buildEmailLayout({
    title: "Verify your email",
    preheader: "Confirm your email address to activate your MindNest AI account.",
    greetingName: displayName,
    bodyHtml:
      'Thanks for signing up for <strong>MindNest AI</strong>. Please confirm your email address to activate your account and start learning.',
    ctaLabel: "Verify Email",
    ctaUrl: url,
    footerNote:
      "If you didn’t create an account, you can safely ignore this email. This link expires in 24 hours.",
    fallbackText:
      "Thanks for signing up for MindNest AI. Please verify your email address to activate your account. This link expires in 24 hours.",
  });

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Verify your MindNest AI email address",
    html,
    text,
  });
}

export async function sendResetPasswordEmail(
  email: string,
  url: string,
  name?: string,
): Promise<void> {
  const displayName = name ?? email;

  const { html, text } = buildEmailLayout({
    title: "Reset your password",
    preheader: "Use this secure link to reset your MindNest AI password.",
    greetingName: displayName,
    bodyHtml:
      "We received a request to reset your password. Use the button below to choose a new password.",
    ctaLabel: "Reset Password",
    ctaUrl: url,
    footerNote:
      "If you didn’t request a password reset, you can safely ignore this email. This link expires in 1 hour.",
    fallbackText:
      "We received a request to reset your password. Use the link below to choose a new password. This link expires in 1 hour.",
  });

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Reset your MindNest AI password",
    html,
    text,
  });
}
