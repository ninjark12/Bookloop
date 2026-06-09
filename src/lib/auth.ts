import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { sessions, users, accounts, verifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assignDiscriminator, sanitizeDisplayName } from "@/lib/assign-discriminator";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const fromEmail = process.env.RESEND_FROM || "Bookloop <noreply@bookloop.sh>";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      if (!resend) return;
      await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject: "Reset your Bookloop password",
        html: `<p>Click the link below to reset your password:</p><p><a href="${url}">Reset password</a></p><p>If you didn't request this, ignore this email.</p>`,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const displayName = sanitizeDisplayName(user.name ?? "");
            const discriminator = await assignDiscriminator(displayName, user.id);
            if (discriminator) {
              await db.update(users)
                .set({ displayName, discriminator })
                .where(eq(users.id, user.id));
            }
          } catch {
            // Non-fatal: user is created, tag assignment failure shouldn't block sign-up.
          }
        },
      },
    },
  },
});
