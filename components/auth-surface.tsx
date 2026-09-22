import Image from "next/image";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { css } from "styled-system/css";

const page=css({
  position:"relative",
  display:"grid",
  minH:"100dvh",
  placeItems:"center",
  overflow:"hidden",
  p:{base:"3",md:"6"},
  background:"bg",
  _before:{
    content:'""',
    position:"absolute",
    width:"[min(78vw,920px)]",
    aspectRatio:"1",
    right:"[-28vw]",
    bottom:"[-42vw]",
    borderRadius:"pill",
    opacity:"0.18",
    background:"radial-gradient(circle at center, #c4331e 0 2%, #f2eee7 2.4% 3.8%, transparent 4.2% 18%, rgba(196,51,30,.78) 18.4% 20%, transparent 20.4% 42%, #f2eee7 42.4% 44.5%, transparent 45% 61%, #5b5b60 61.5% 63%, transparent 63.5%), repeating-conic-gradient(from -9deg,#242428 0 18deg,#e8e2d5 18deg 36deg)",
    boxShadow:"0 0 0 14px #55555a, 0 0 0 18px #e8e2d5",
  },
});

const shell=css({
  position:"relative",
  zIndex:"1",
  display:"grid",
  gridTemplateColumns:{base:"1fr",lg:"minmax(0,1fr) minmax(380px,.72fr)"},
  width:"full",
  maxW:"[1000px]",
  overflow:"hidden",
  border:"1px solid",
  borderColor:"surface.border",
  borderRadius:"l4",
  background:"surface.bg",
  boxShadow:"lg",
});

const brandPanel=css({
  position:"relative",
  display:{base:"none",lg:"grid"},
  alignContent:"space-between",
  minH:"[620px]",
  p:"7",
  overflow:"hidden",
  borderRight:"1px solid",
  borderColor:"surface.border",
  background:"linear-gradient(145deg,rgba(196,51,30,.14),rgba(32,32,36,.45) 50%,rgba(14,14,16,.96))",
});

const brand=css({display:"flex",alignItems:"center",gap:"3"});
const brandCopy=css({
  "& strong":{display:"block",fontSize:"sm",fontWeight:"950"},
  "& span":{display:"block",mt:"0.5",color:"fg.muted",fontSize:"[10px]"},
});
const statement=css({
  maxW:"[470px]",
  "& span":{color:"brand.hover",fontSize:"[9px]",fontWeight:"900",letterSpacing:"0.13em",textTransform:"uppercase"},
  "& h2":{mt:"2",fontSize:"[42px]",fontWeight:"950",letterSpacing:"-0.05em",lineHeight:"1.02"},
  "& p":{mt:"3",color:"fg.muted",fontSize:"sm",lineHeight:"1.65"},
});
const trust=css({
  display:"flex",alignItems:"center",gap:"2",color:"fg.muted",fontSize:"[10px]",
  "& svg":{color:"brand.hover"},
});

const formPanel=css({display:"grid",alignContent:"center",minH:{base:"100dvh",lg:"620px"},p:{base:"5",md:"7"}});
const mobileBrand=css({display:{base:"flex",lg:"none"},alignItems:"center",gap:"3",mb:"7"});
const intro=css({
  mb:"5",
  "& span":{color:"brand.hover",fontSize:"[9px]",fontWeight:"900",letterSpacing:"0.13em",textTransform:"uppercase"},
  "& h1":{mt:"1.5",fontSize:{base:"[32px]",md:"[38px]"},fontWeight:"950",letterSpacing:"-0.045em",lineHeight:"1.05"},
  "& p":{mt:"2",color:"fg.muted",fontSize:"sm",lineHeight:"1.55"},
});
const messageStyle=css({
  mb:"4",p:"3",border:"1px solid",borderColor:"rgba(228,121,114,.24)",
  borderRadius:"l2",background:"rgba(228,121,114,.07)",color:"status.danger",fontSize:"xs",fontWeight:"750",
});
const formStyle=css({display:"grid",gap:"3"});
const grid=css({display:"grid",gridTemplateColumns:{base:"1fr",sm:"repeat(2,minmax(0,1fr))"},gap:"3"});
const field=css({display:"grid",gap:"1.5",color:"fg.muted",fontSize:"xs",fontWeight:"750"});
const input=css({
  w:"full",minH:"11",px:"3",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",
  background:"surface.raised",color:"fg",outline:"none",
  _placeholder:{color:"fg.subtle"},
  _focus:{borderColor:"brand.solid",boxShadow:"focus"},
});
const submit=css({
  display:"inline-flex",alignItems:"center",justifyContent:"center",gap:"2",minH:"11",mt:"1",px:"4",
  border:"1px solid",borderColor:"brand.solid",borderRadius:"l1",background:"brand.solid",
  color:"warmWhite",fontSize:"sm",fontWeight:"900",cursor:"pointer",
  _hover:{background:"brand.hover",transform:"translateY(-1px)"},
});

export function AuthSurface({
  eyebrow,
  title,
  description,
  message,
  children,
}:{
  eyebrow:string;
  title:string;
  description:string;
  message?:string|null;
  children:ReactNode;
}) {
  return (
    <main className={page}>
      <section className={shell}>
        <aside className={brandPanel}>
          <div className={brand}>
            <Image src="/vdc-logo.svg" alt="" width={54} height={54} priority />
            <div className={brandCopy}><strong>Vestischer Dart Club</strong><span>e.V. · Vereinszentrale</span></div>
          </div>

          <div className={statement}>
            <span>VDC Club</span>
            <h2>Gemeinsam.<br/>Präzise.<br/>Stark.</h2>
            <p>Die digitale Vereinszentrale für Vorstand, Teams, Training und Organisation.</p>
          </div>

          <div className={trust}><ShieldCheck size={16}/><span>Geschützter Vereinsbereich</span></div>
        </aside>

        <div className={formPanel}>
          <div className={mobileBrand}>
            <Image src="/vdc-logo.svg" alt="" width={48} height={48} priority />
            <div className={brandCopy}><strong>Vestischer Dart Club</strong><span>e.V. · Vereinszentrale</span></div>
          </div>

          <div className={intro}>
            <span>{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          {message && <div className={messageStyle}>{message}</div>}
          {children}
        </div>
      </section>
    </main>
  );
}

export const authFormClass=formStyle;
export const authGridClass=grid;
export const authFieldClass=field;
export const authInputClass=input;
export const authSubmitClass=submit;
