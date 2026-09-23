import { PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage } from "pdf-lib";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/access";
import { getDb } from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type JsonObject=Record<string,unknown>;

function asObject(value:unknown):JsonObject{
  return value && typeof value==="object" && !Array.isArray(value) ? value as JsonObject : {};
}
function asArray(value:unknown):JsonObject[]{
  return Array.isArray(value) ? value.map(asObject) : [];
}
function textValue(value:unknown,fallback=""){
  const text=String(value ?? "").trim();
  return text || fallback;
}
function safeText(value:unknown){
  return String(value ?? "")
    .replace(/[„“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/[–—]/g,"-")
    .replace(/…/g,"...")
    .replace(/·/g,"/")
    .replace(/✓/g,"OK")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g,"?");
}
function formatDateTime(value:unknown){
  if(!value) return "-";
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",timeZone:"Europe/Berlin",
  }).format(date);
}
function safeFilename(value:string){
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g,"-")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"")
    .slice(0,100) || "protokoll";
}
function wrapText(text:string,font:PDFFont,size:number,maxWidth:number){
  const paragraphs=safeText(text).split(/\r?\n/);
  const lines:string[]=[];
  for(const paragraph of paragraphs){
    const words=paragraph.split(/\s+/).filter(Boolean);
    if(!words.length){ lines.push(""); continue; }
    let line="";
    for(const word of words){
      const candidate=line ? line+" "+word : word;
      if(font.widthOfTextAtSize(candidate,size)<=maxWidth){
        line=candidate;
      }else{
        if(line) lines.push(line);
        if(font.widthOfTextAtSize(word,size)<=maxWidth){
          line=word;
        }else{
          let chunk="";
          for(const char of word){
            const next=chunk+char;
            if(font.widthOfTextAtSize(next,size)>maxWidth && chunk){
              lines.push(chunk);
              chunk=char;
            }else{
              chunk=next;
            }
          }
          line=chunk;
        }
      }
    }
    if(line) lines.push(line);
  }
  return lines;
}

export async function GET(
  _request:Request,
  {params}:{params:Promise<{id:string}>},
){
  const user=await getCurrentUser();
  if(!user) return new Response("Unauthorized",{status:401});
  if(!hasPermission(user.roles,"meetings.read")) return new Response("Forbidden",{status:403});

  const sql=getDb();
  if(!sql) return new Response("Database unavailable",{status:503});

  const {id}=await params;
  const rows=await sql`
    SELECT
      m.id::text,m.title,m.lifecycle_state,m.minutes_status,m.current_minutes_revision,
      m.next_meeting_at,m.archived_at,
      mr.revision,mr.status AS revision_status,mr.snapshot,mr.created_at
    FROM meeting_v3_meetings m
    JOIN meeting_v3_minutes_revisions mr
      ON mr.meeting_id=m.id
     AND mr.revision=m.current_minutes_revision
    WHERE m.id=${id}::uuid
    LIMIT 1
  `;
  const meeting=rows[0];
  if(!meeting) return new Response("Not found",{status:404});

  const rawSnapshot=typeof meeting.snapshot==="string"
    ? JSON.parse(String(meeting.snapshot))
    : meeting.snapshot;
  const snapshot=asObject(rawSnapshot);
  const meetingSnapshot=asObject(snapshot.meeting);
  const participants=asArray(snapshot.participants);
  const guests=asArray(snapshot.guests);
  const agenda=asArray(snapshot.agenda);
  const generalAttachments=asArray(snapshot.generalAttachments);

  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth=595.28;
  const pageHeight=841.89;
  const margin=46;
  const contentWidth=pageWidth-(margin*2);
  let page:PDFPage=pdf.addPage([pageWidth,pageHeight]);
  let y=pageHeight-margin;

  function newPage(){
    page=pdf.addPage([pageWidth,pageHeight]);
    y=pageHeight-margin;
  }
  function ensure(height:number){
    if(y-height<margin+24) newPage();
  }
  function line(text:string,opts?:{size?:number;font?:PDFFont;indent?:number;gap?:number}){
    const size=opts?.size ?? 10;
    const font=opts?.font ?? regular;
    const indent=opts?.indent ?? 0;
    const gap=opts?.gap ?? 4;
    const wrapped=wrapText(text,font,size,contentWidth-indent);
    for(const row of wrapped){
      ensure(size+gap+2);
      page.drawText(row || " ",{x:margin+indent,y:y-size,font,size,color:rgb(0.08,0.08,0.08)});
      y-=size+gap;
    }
  }
  function heading(text:string,size=14){
    ensure(size+14);
    y-=4;
    line(text,{size,font:bold,gap:6});
  }
  function label(labelText:string,value:unknown){
    ensure(15);
    const label=safeText(labelText+":");
    page.drawText(label,{x:margin,y:y-10,font:bold,size:9,color:rgb(0.3,0.3,0.3)});
    const offset=Math.min(150,bold.widthOfTextAtSize(label,9)+10);
    const lines=wrapText(textValue(value,"-"),regular,9,contentWidth-offset);
    if(lines.length<=1){
      page.drawText(lines[0] || "-",{x:margin+offset,y:y-10,font:regular,size:9,color:rgb(0.08,0.08,0.08)});
      y-=15;
    }else{
      y-=14;
      for(const row of lines){
        ensure(13);
        page.drawText(row,{x:margin+offset,y:y-9,font:regular,size:9,color:rgb(0.08,0.08,0.08)});
        y-=13;
      }
    }
  }
  function divider(){
    ensure(10);
    y-=4;
    page.drawLine({start:{x:margin,y},end:{x:pageWidth-margin,y},thickness:0.6,color:rgb(0.75,0.75,0.75)});
    y-=8;
  }

  page.drawText("Vestischer Dart Club e.V.",{x:margin,y:y-12,font:bold,size:11,color:rgb(0.12,0.12,0.12)});
  y-=26;
  line("Protokoll - "+textValue(meetingSnapshot.title,String(meeting.title)),{size:19,font:bold,gap:8});
  const state=String(meeting.minutes_status ?? meeting.revision_status ?? "draft");
  line(
    (state==="archived" ? "Finale Fassung" : state==="review" ? "Prueffassung" : "Entwurf")
    +" / Revision "+String(meeting.revision),
    {size:10,font:bold,gap:4},
  );
  divider();

  heading("Sitzungsdaten");
  label("Geplant",formatDateTime(meetingSnapshot.startsAt));
  label("Beginn",formatDateTime(meetingSnapshot.openedAt));
  label("Ende",formatDateTime(meetingSnapshot.endedAt));
  label("Ort",textValue(meetingSnapshot.location,"-"));
  label("Format",textValue(meetingSnapshot.meetingMode,"-"));
  label("Einladung",formatDateTime(meetingSnapshot.invitedAt));
  label("Einladungsweg",textValue(meetingSnapshot.invitationMethod,"-"));
  label("Beschlussfaehig",meetingSnapshot.quorumConfirmed===true ? "Ja" : meetingSnapshot.quorumConfirmed===false ? "Nein" : "Nicht dokumentiert");
  if(meetingSnapshot.quorumBasis) label("Grundlage",meetingSnapshot.quorumBasis);
  if(meetingSnapshot.quorumNote) label("Bemerkung",meetingSnapshot.quorumNote);

  heading("Teilnehmende");
  for(const person of participants){
    const voting=person.votingEligible===true ? "stimmberechtigt" : "nicht stimmberechtigt";
    line(
      textValue(person.name,"Unbekannt")+" - "+textValue(person.attendance,"-")+" / "+voting,
      {size:9,indent:8,gap:3},
    );
  }
  if(guests.length){
    heading("Gaeste",12);
    for(const guest of guests){
      line(
        textValue(guest.name,"Gast")
        +(guest.organization ? " - "+textValue(guest.organization) : "")
        +" / "+textValue(guest.attendance,"-"),
        {size:9,indent:8,gap:3},
      );
    }
  }

  heading("Tagesordnung und Ergebnisse");
  for(const item of agenda){
    divider();
    heading("TOP "+String(Number(item.position ?? 0))+" - "+textValue(item.title,"Ohne Titel"),12);
    if(item.description) line(textValue(item.description),{size:9,gap:3});
    if(item.note){
      line("Protokollnotiz:",{size:9,font:bold,gap:2});
      line(textValue(item.note),{size:9,indent:8,gap:3});
    }
    if(item.spontaneous===true){
      line("Spontan aufgenommen: "+textValue(item.spontaneousReason,"-"),{size:9,font:bold,gap:3});
    }
    label("Ergebnis",textValue(item.resultCode,"-"));

    const exclusions=asArray(item.exclusions);
    if(exclusions.length){
      line("Befangenheit / Stimmrechtsausschluss",{size:9,font:bold,gap:2});
      for(const exclusion of exclusions){
        line(textValue(exclusion.name,"-")+" - "+textValue(exclusion.reason,"-"),{size:9,indent:8,gap:2});
      }
    }

    for(const resolution of asArray(item.resolutions)){
      ensure(40);
      line("Beschluss "+textValue(resolution.number,"ohne Nr."),{size:10,font:bold,gap:3});
      line(textValue(resolution.title,"-"),{size:10,font:bold,gap:3});
      line(textValue(resolution.decisionText,"-"),{size:9,indent:8,gap:3});
      line(
        "Abstimmung: Ja "+String(Number(resolution.yes ?? 0))
        +" / Nein "+String(Number(resolution.no ?? 0))
        +" / Enthaltung "+String(Number(resolution.abstain ?? 0))
        +" / "+(String(resolution.outcome)==="accepted" ? "Angenommen" : "Abgelehnt"),
        {size:9,indent:8,gap:3},
      );
    }

    const attachments=asArray(item.attachments);
    if(attachments.length){
      line("Anlagen: "+attachments.map(a=>textValue(a.title,"Anlage")).join(", "),{size:8,indent:8,gap:2});
    }
  }

  if(generalAttachments.length){
    heading("Allgemeine Anlagen");
    for(const attachment of generalAttachments){
      line("- "+textValue(attachment.title,"Anlage"),{size:9,indent:8,gap:2});
    }
  }
  if(meeting.next_meeting_at){
    heading("Naechster Termin");
    line(formatDateTime(meeting.next_meeting_at),{size:10});
  }

  const pages=pdf.getPages();
  pages.forEach((p,index)=>{
    p.drawLine({
      start:{x:margin,y:28},
      end:{x:pageWidth-margin,y:28},
      thickness:0.4,
      color:rgb(0.8,0.8,0.8),
    });
    p.drawText("VDC Club / Seite "+String(index+1)+" von "+String(pages.length),{
      x:margin,y:14,font:regular,size:7,color:rgb(0.4,0.4,0.4),
    });
    if(state!=="archived"){
      p.drawText(state==="review" ? "PRUEFFASSUNG" : "ENTWURF",{
        x:pageWidth-115,y:14,font:bold,size:7,color:rgb(0.55,0.25,0.25),
      });
    }
  });

  const bytes=await pdf.save();
  const body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  const filename=safeFilename(
    "VDC-Protokoll-"+textValue(meeting.title,"Sitzung")+"-R"+String(meeting.revision),
  )+".pdf";

  return new Response(body,{
    headers:{
      "Content-Type":"application/pdf",
      "Content-Length":String(bytes.byteLength),
      "Content-Disposition":'inline; filename="'+filename+'"; filename*=UTF-8\'\''+encodeURIComponent(filename),
      "Cache-Control":"private, no-store, max-age=0",
      "X-Content-Type-Options":"nosniff",
    },
  });
}
