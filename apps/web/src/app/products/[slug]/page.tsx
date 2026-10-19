import { ProductDetail } from "@/components/product-detail";
export default async function Outfit({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetail slug={slug} />;
}
