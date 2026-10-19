import { notFound } from "next/navigation";
import { AuthDialog } from "@/components/auth-dialog";
import { Catalog } from "@/components/catalog";
export default async function Auth({ params }: { params: Promise<{ role: string; action: string }> }) {
  const { role, action } = await params;
  if ((role !== "renter" && role !== "lender") || (action !== "login" && action !== "signup")) notFound();
  return <><Catalog /><AuthDialog key={`${role}-${action}`} role={role} action={action} /></>;
}
