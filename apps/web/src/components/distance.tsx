"use client";
import { createContext, useContext, type ReactNode } from "react";
const UnitContext = createContext<"mi" | "km">("mi");
export function DistanceUnit({
  unit,
  children,
}: {
  unit: "mi" | "km";
  children: ReactNode;
}) {
  return <UnitContext.Provider value={unit}>{children}</UnitContext.Provider>;
}
export function Distance({ miles }: { miles: number | null }) {
  const unit = useContext(UnitContext);
  if (miles == null) return <>distance unavailable</>;
  if (miles < 1) return <>under 1 mi</>;
  return (
    <>
      {unit === "km" ? Math.round(miles * 1.609344 * 10) / 10 : miles} {unit}
    </>
  );
}
