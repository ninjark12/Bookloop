import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";
import FeedClient from "@/components/FeedClient";

export default async function FeedPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <FeedClient />;
}
