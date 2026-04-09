import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db"; // your drizzle instance
import { sessions, users, accounts, verifications } from "@/db/schema";
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    }
  }),
  emailAndPassword: {
    enabled: true,

  },
  secret: process.env.BETTER_AUTH_SECRET
});

