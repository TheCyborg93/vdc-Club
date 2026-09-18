"use client";

export function PrintReportButton({ label = "Drucken / PDF" }: { label?: string }) {
  return (
    <button className="ghost-button print-report-button" type="button" onClick={()=>window.print()}>
      {label}
    </button>
  );
}
