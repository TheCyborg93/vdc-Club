"use client";

export function ConfirmSubmitButton({
  children,
  message,
  className="mini-button danger-button",
  requireText,
}: {
  children: React.ReactNode;
  message:string;
  className?:string;
  requireText?:string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event)=>{
        if (requireText) {
          const typed=window.prompt(message+"\n\nZum Bestätigen bitte „"+requireText+"“ eingeben:");
          if (typed!==requireText) event.preventDefault();
          return;
        }

        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
