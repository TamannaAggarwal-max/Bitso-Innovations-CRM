export async function sendPasswordResetEmail({ to, token }) {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM", "PASSWORD_RESET_URL"];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Missing SMTP configuration: ${missing.join(", ")}`);

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be a valid TCP port.");

  const resetUrl = new URL(process.env.PASSWORD_RESET_URL);
  if (!["http:", "https:"].includes(resetUrl.protocol)) throw new Error("PASSWORD_RESET_URL must use HTTP or HTTPS.");
  resetUrl.searchParams.set("token", token);

  const { default: nodemailer } = await import("nodemailer");
  const secure = process.env.SMTP_SECURE === "true";
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject: "Reset your Bitso Innovations CRM password",
      text: `Use this link to reset your password. It expires in 30 minutes and can only be used once:\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use the link below to reset your Bitso Innovations CRM password.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p><p>This link expires in 30 minutes and can only be used once. If you did not request this, you can ignore this email.</p>`
    });
  } finally {
    transporter.close();
  }
}
