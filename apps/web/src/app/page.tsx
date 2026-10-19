export default function FoundationPage() {
  const mode = process.env.NEXT_PUBLIC_DZIRENT_MODE ?? "demo";
  return (
    <main>
      <p className="mode">{mode.toUpperCase()} · Phase 0 foundation</p>
      <h1>dzirent</h1>
      <p>The shared foundation is ready for implementation.</p>
      <p>Catalog, identity, and listing workflows begin after baseline review.</p>
    </main>
  );
}
