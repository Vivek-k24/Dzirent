"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPin } from "lucide-react";
import { useBag, useSession } from "@/lib/store";
import { Modal, Button } from "./ui/primitives";

const schema = z.object({ zip: z.string().refine(value => !value || /^\d{5}$/.test(value), "Enter a five-digit ZIP code.") });
export function LocationDialog({ close }: { close: () => void }) {
  const savedZip = useBag(s => s.location.zip);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { zip: savedZip } });
  return <Modal open onOpenChange={open => { if (!open) close(); }} title="Delivery ZIP" description="Save an optional delivery ZIP. Browse the same statewide collection." restoreId="header-location">
    <form className="stack-form" onSubmit={form.handleSubmit(({ zip }) => {
      useBag.getState().setLocation({ metro: "", zip });
      useSession.getState().notify(zip ? `Delivery ZIP ${zip} saved. Delivery estimate unavailable.` : "Delivery ZIP cleared.");
      close();
    })}>
      <label htmlFor="delivery-zip">Delivery ZIP code <span className="muted">(optional)</span>
        <input id="delivery-zip" {...form.register("zip")} inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="Five-digit ZIP" aria-invalid={!!form.formState.errors.zip} aria-describedby="delivery-zip-error delivery-estimate-note" />
      </label>
      <p id="delivery-zip-error" className="field-error" role={form.formState.errors.zip ? "alert" : undefined}>{form.formState.errors.zip?.message}</p>
      <div className="info-note" id="delivery-estimate-note"><MapPin size={18} /><p>Only in Texas. Delivery estimate unavailable. A verified address and delivery service are not connected; a ZIP does not establish coverage, transit time or garment availability.</p></div>
      <Button type="submit">Save delivery ZIP</Button>
      <button type="button" className="text-button" onClick={() => { useBag.getState().setLocation({ metro: "", zip: "" }); close(); }}>Clear delivery ZIP</button>
    </form>
  </Modal>;
}
