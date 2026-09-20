import Link from "next/link";

export function FinanceNav({
  active,
}:{
  active:"overview"|"entries"|"fees"|"types"|"open"|"analysis";
}) {
  const items=[
    {key:"overview",href:"/finanzen",label:"Übersicht"},
    {key:"entries",href:"/finanzen/buchungen",label:"Buchungen"},
    {key:"fees",href:"/finanzen/beitraege",label:"Mitgliedsbeiträge"},
    {key:"types",href:"/finanzen/beitragsarten",label:"Beitragsarten"},
    {key:"open",href:"/finanzen/offene-beitraege",label:"Offene Beiträge"},
    {key:"analysis",href:"/finanzen/auswertung",label:"Auswertung"},
  ] as const;

  return (
    <nav className="finance-tabs" aria-label="Finanzen">
      {items.map((item)=>(
        <Link
          key={item.key}
          href={item.href}
          className={active===item.key ? "active" : ""}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
