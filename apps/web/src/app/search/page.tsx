import { redirect } from "next/navigation";
import { type Query } from "@/lib/types";

export default async function Search({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const q = await searchParams;
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v) params.set(k, Array.isArray(v) ? v[0] : v);
  });
  const qs = params.toString();
  redirect(qs ? "/?" + qs : "/");
}
