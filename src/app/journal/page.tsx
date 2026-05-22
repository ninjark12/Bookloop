// src/app/journal/page.tsx
// This page handles the deep link from the Bookloop browser extension:
//   /journal?bookId=XXX&chapter=5&source=extension
// If bookId and chapter are present, redirect straight to the book journal
// with a pre-fill hint the client component can pick up.

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function JournalIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ bookId?: string; chapter?: string; source?: string; title?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const params = await searchParams;

  // Extension deep link -- redirect to the specific book journal
  // The bookId and chapter are passed as query params so JournalPageClient
  // can open the new entry form pre-filled
  if (params.bookId) {
    const url = new URL(`/journal/${params.bookId}`, "http://localhost");
    if (params.chapter) url.searchParams.set("chapter", params.chapter);
    if (params.source) url.searchParams.set("source", params.source);
    redirect(`/journal/${params.bookId}?${url.searchParams.toString()}`);
  }

  redirect("/dashboard");
}
