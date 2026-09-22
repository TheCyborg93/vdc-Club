import Link from "next/link";
import { css } from "styled-system/css";

const nav=css({
  display:"grid",
  gridTemplateColumns:{base:"repeat(2,minmax(0,1fr))",md:"repeat(3,minmax(0,1fr))",xl:"repeat(6,minmax(0,1fr))"},
  gap:"1",
  p:"1",
  border:"1px solid",
  borderColor:"surface.border",
  borderRadius:"l2",
  background:"surface.bg",
});

const itemStyle=css({
  display:"grid",
  placeItems:"center",
  minH:"9",
  px:"2",
  borderRadius:"l1",
  color:"fg.muted",
  fontSize:"xs",
  fontWeight:"800",
  textAlign:"center",
  _hover:{background:"surface.hover",color:"fg"},
});

const activeStyle=css({
  background:"brand.subtle",
  color:"brand.hover",
  boxShadow:"inset 0 0 0 1px rgba(196,51,30,.18)",
});

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
    <nav className={nav} aria-label="Finanzen">
      {items.map((item)=>(
        <Link key={item.key} href={item.href} className={[itemStyle,active===item.key ? activeStyle : ""].join(" ")}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
