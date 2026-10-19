import { Catalog } from "@/components/catalog";
import { AuthDialog } from "@/components/auth-dialog";
export const metadata = { title: "Share your wardrobe" };
export default function Signup() { return <><Catalog /><AuthDialog role="lender" action="signup" /></>; }
