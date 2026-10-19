"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPin } from "lucide-react";
import { useReferences } from "./providers";
import { useCatalogState } from "@/lib/use-catalog";
import { useBag, useSession } from "@/lib/store";
import { Modal, Button } from "./ui/primitives";

const schema = z.object({ metro: z.string(), zip: z.string().refine(v => !v || /^\d{5}$/.test(v), "Enter a five-digit ZIP code.") });
export function LocationDialog({ close }: { close: () => void }) {
  const { refs } = useReferences(), { state, patch } = useCatalogState(), saved = useBag(s => s.location);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { metro: state.metro || saved.metro, zip: state.zip || saved.zip } });
  const selected = useWatch({ control: form.control });
  return <Modal open onOpenChange={open => { if (!open) close(); }} title="Choose your location" description="Explore sample outfits in your Texas metro." restoreId="header-location">
    <form className="stack-form" onSubmit={form.handleSubmit(values => {
      let metro = values.metro;
      if (values.zip && refs) {
        const id = refs.locations.demo_zip_map[values.zip] ?? refs.locations.unmapped_zip_metro_id;
        metro = refs.locations.items.find(m => m.id === id)?.slug ?? "other-texas";
      }
      useBag.getState().setLocation({ metro, zip: values.zip }); patch({ metro, zip: values.zip }); close();
      useSession.getState().notify("Demo location updated.");
    })}>
      <label htmlFor="location-metro">Metro<select id="location-metro" {...form.register("metro")} onChange={event => { form.setValue("metro", event.target.value); form.setValue("zip", ""); }}>{<option value="">All Texas metros</option>}{refs?.locations.items.map(m => <option key={m.id} value={m.slug}>{m.label}</option>)}</select></label>
      <label htmlFor="location-zip">ZIP code <span className="muted">(optional)</span><input id="location-zip" {...form.register("zip")} inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="e.g. 78701" onChange={event => {
        form.setValue("zip", event.target.value, { shouldValidate: true });
        if (/^\d{5}$/.test(event.target.value) && refs) { const id = refs.locations.demo_zip_map[event.target.value] ?? refs.locations.unmapped_zip_metro_id; form.setValue("metro", refs.locations.items.find(m => m.id === id)?.slug ?? "other-texas"); }
      }} aria-invalid={!!form.formState.errors.zip} aria-describedby="zip-error" /></label>
      <p id="zip-error" className="field-error" role={form.formState.errors.zip ? "alert" : undefined}>{form.formState.errors.zip?.message}</p>
      <div className="info-note"><MapPin size={18} /><p>{selected.metro === "other-texas" ? "Other Texas / demo location. " : "This is a small demo location map. "}ZIP matching does not indicate delivery coverage or availability.</p></div>
      <Button type="submit">Apply location</Button><button type="button" className="text-button" onClick={() => { useBag.getState().setLocation({ metro: "", zip: "" }); patch({ metro: "", zip: "" }); close(); }}>Clear location</button>
    </form>
  </Modal>;
}
