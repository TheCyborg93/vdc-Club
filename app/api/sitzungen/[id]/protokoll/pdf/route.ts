import { PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage } from "pdf-lib";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/access";
import { getDb } from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function text(value:unknown,fallback=""){
  const result=String(value ?? "").trim();
  return result || fallback;
}
function safe(value:unknown){
  return String(value ?? "")
    .replace(/[„“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/[–—]/g,"-")
    .replace(/…/g,"...")
    .replace(/·/g,"/")
    .replace(/✓/g,"OK");
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
function wrap(value:string,font:PDFFont,size:number,width:number){
  const lines:string[]=[];
  for(const paragraph of safe(value).split(/\r?\n/)){
    const words=paragraph.split(/\s+/).filter(Boolean);
    if(!words.length){lines.push("");continue;}
    let line="";
    for(const word of words){
      const candidate=line ? line+" "+word : word;
      if(font.widthOfTextAtSize(candidate,size)<=width){
        line=candidate;
      }else{
        if(line) lines.push(line);
        line=word;
      }
    }
    if(line) lines.push(line);
  }
  return lines;
}
function filename(value:string){
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,100);
}

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return new Response("Unauthorized",{status:401});
  if(!hasPermission(user.roles,"meetings.read")) return new Response("Forbidden",{status:403});

  const sql=getDb();
  if(!sql) return new Response("Database unavailable",{status:503});

  const {id}=await params;
  const [meetingRows,attendees,guests,agenda,attachments]=await Promise.all([
    sql`
      SELECT
        m.id::text,m.title,m.starts_at,m.opened_at,m.ended_at,m.location,m.status,
        m.meeting_mode,m.invited_at,m.invitation_method,m.invitation_timely,
        m.agenda_sent_with_invitation,m.quorum_confirmed,m.quorum_note,m.quorum_basis,
        m.formalities_note,m.minutes_intro,m.minutes_closing,m.minutes_status,m.minutes_version,
        m.next_meeting_at,
        chair.first_name AS chair_first_name,chair.last_name AS chair_last_name,
        taker.first_name AS taker_first_name,taker.last_name AS taker_last_name
      FROM meetings m
      LEFT JOIN members chair ON chair.id=m.chair_member_id
      LEFT JOIN members taker ON taker.id=m.minute_taker_member_id
      WHERE m.id=${id}::uuid
        AND m.deleted_at IS NULL
      LIMIT 1
    `,
    sql`
      SELECT ma.attendance,ma.voting_eligible,m.first_name,m.last_name
      FROM meeting_attendees ma
      JOIN members m ON m.id=ma.member_id
      WHERE ma.meeting_id=${id}::uuid
      ORDER BY
        CASE ma.attendance WHEN 'present' THEN 0 WHEN 'excused' THEN 1 ELSE 2 END,
        m.last_name,m.first_name
    `,
    sql`
      SELECT name,organization,note,attendance
      FROM meeting_guests
      WHERE meeting_id=${id}::uuid
      ORDER BY name
    `,
    sql`
      SELECT
        ai.id::text,ai.position,ai.title,ai.description,ai.notes,ai.status,ai.agenda_type,
        ai.announced_with_invitation,ai.decision_basis_note,
        r.resolution_number,r.title AS resolution_title,r.decision_text,
        r.votes_yes,r.votes_no,r.votes_abstain,r.vote_method,r.vote_details,
        r.eligible_voters,r.excluded_voters,r.decision_outcome,
        t.title AS task_title,t.status AS task_status,t.due_date,
        owner.first_name AS owner_first_name,owner.last_name AS owner_last_name
      FROM agenda_items ai
      LEFT JOIN resolutions r ON r.agenda_item_id=ai.id
      LEFT JOIN LATERAL (
        SELECT tx.*
        FROM tasks tx
        WHERE tx.source_type='resolution'
          AND tx.source_id=r.id
          AND tx.deleted_at IS NULL
          AND tx.status<>'cancelled'
        ORDER BY tx.created_at DESC
        LIMIT 1
      ) t ON true
      LEFT JOIN members owner ON owner.id=t.owner_member_id
      WHERE ai.meeting_id=${id}::uuid
      ORDER BY ai.position
    `,
    sql`
      SELECT id::text,agenda_item_id::text,title,original_filename
      FROM documents
      WHERE meeting_id=${id}::uuid
        AND category='Sitzungsanlage'
        AND deleted_at IS NULL
      ORDER BY created_at
    `,
  ]);

  const meeting=meetingRows[0];
  if(!meeting) return new Response("Not found",{status:404});

  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth=595.28;
  const pageHeight=841.89;
  const margin=44;
  const contentWidth=pageWidth-margin*2;
  let page:PDFPage=pdf.addPage([pageWidth,pageHeight]);
  let y=pageHeight-margin;

  function newPage(){
    page=pdf.addPage([pageWidth,pageHeight]);
    y=pageHeight-margin;
  }
  function ensure(height:number){
    if(y-height<margin+26) newPage();
  }
  function write(value:string,opts?:{size?:number;font?:PDFFont;indent?:number;gap?:number}){
    const size=opts?.size ?? 9;
    const font=opts?.font ?? regular;
    const indent=opts?.indent ?? 0;
    const gap=opts?.gap ?? 3;
    for(const row of wrap(value,font,size,contentWidth-indent)){
      ensure(size+gap+2);
      page.drawText(row || " ",{x:margin+indent,y:y-size,font,size,color:rgb(.08,.08,.08)});
      y-=size+gap;
    }
  }
  function heading(value:string,size=13){
    ensure(size+12);
    y-=3;
    write(value,{size,font:bold,gap:5});
  }
  function label(name:string,value:unknown){
    ensure(15);
    const n=safe(name+":");
    page.drawText(n,{x:margin,y:y-9,font:bold,size:8,color:rgb(.28,.28,.28)});
    const offset=Math.max(90,Math.min(145,bold.widthOfTextAtSize(n,8)+10));
    const rows=wrap(text(value,"-"),regular,8,contentWidth-offset);
    for(let index=0;index<rows.length;index++){
      if(index>0){ensure(12);y-=12;}
      page.drawText(rows[index] || "-",{x:margin+offset,y:y-9,font:regular,size:8,color:rgb(.08,.08,.08)});
    }
    y-=14;
  }
  function divider(){
    ensure(10);
    y-=4;
    page.drawLine({start:{x:margin,y},end:{x:pageWidth-margin,y},thickness:.55,color:rgb(.78,.78,.78)});
    y-=7;
  }

  page.drawText("Vestischer Dart Club e.V.",{x:margin,y:y-10,font:bold,size:10,color:rgb(.12,.12,.12)});
  y-=24;
  write("Sitzungsprotokoll",{size:18,font:bold,gap:7});
  write(text(meeting.title,"Vorstandssitzung"),{size:12,font:bold,gap:5});
  write(
    (String(meeting.minutes_status)==="archived" ? "Archivierte Fassung" : "Arbeitsfassung")
      +" / Version "+String(meeting.minutes_version ?? 1),
    {size:9,font:bold,gap:3},
  );
  divider();

  heading("Sitzungsdaten");
  label("Geplant",formatDateTime(meeting.starts_at));
  label("Beginn",formatDateTime(meeting.opened_at));
  label("Ende",formatDateTime(meeting.ended_at));
  label("Ort",meeting.location);
  label("Format",meeting.meeting_mode);
  label("Sitzungsleitung",[meeting.chair_first_name,meeting.chair_last_name].filter(Boolean).join(" "));
  label("Protokollführung",[meeting.taker_first_name,meeting.taker_last_name].filter(Boolean).join(" "));
  label("Einladung",formatDateTime(meeting.invited_at));
  label("Einladungsweg",meeting.invitation_method);
  label("Beschlussfähig",meeting.quorum_confirmed===true ? "Ja" : meeting.quorum_confirmed===false ? "Nein" : "Nicht dokumentiert");
  if(meeting.quorum_basis) label("Grundlage",meeting.quorum_basis);
  if(meeting.quorum_note) label("Hinweis",meeting.quorum_note);
  if(meeting.formalities_note) label("Formalien",meeting.formalities_note);

  heading("Teilnehmer");
  for(const person of attendees){
    const attendance=String(person.attendance);
    const voting=person.voting_eligible===true ? "stimmberechtigt" : "nicht stimmberechtigt";
    write(
      text(person.first_name)+" "+text(person.last_name)+" - "+attendance+" / "+voting,
      {size:8,indent:8,gap:2},
    );
  }

  if(guests.length){
    heading("Gäste",11);
    for(const guest of guests){
      write(
        text(guest.name,"Gast")
        +(guest.organization ? " - "+text(guest.organization) : "")
        +" / "+text(guest.attendance,"-"),
        {size:8,indent:8,gap:2},
      );
    }
  }

  if(meeting.minutes_intro){
    heading("Allgemeine Feststellungen");
    write(text(meeting.minutes_intro),{size:9,gap:3});
  }

  heading("Tagesordnung und Ergebnisse");
  for(const item of agenda){
    divider();
    heading("TOP "+String(Number(item.position ?? 0))+" - "+text(item.title,"Ohne Titel"),11);
    if(item.description) write(text(item.description),{size:8,gap:2});
    if(item.notes){
      write("Protokollnotiz:",{size:8,font:bold,gap:2});
      write(text(item.notes),{size:8,indent:8,gap:2});
    }
    label("Status",item.status);
    label("Typ",item.agenda_type);
    if(item.announced_with_invitation===false){
      label("Nachträglicher TOP",item.decision_basis_note || "Begründung nicht dokumentiert");
    }

    if(item.resolution_number){
      ensure(42);
      write("Beschluss "+text(item.resolution_number),{size:9,font:bold,gap:2});
      write(text(item.resolution_title,"-"),{size:9,font:bold,gap:2});
      write(text(item.decision_text,"-"),{size:8,indent:8,gap:2});
      write(
        "Abstimmung: Ja "+String(Number(item.votes_yes ?? 0))
        +" / Nein "+String(Number(item.votes_no ?? 0))
        +" / Enthaltung "+String(Number(item.votes_abstain ?? 0))
        +" / "+(String(item.decision_outcome)==="accepted" ? "Angenommen" : "Abgelehnt"),
        {size:8,indent:8,gap:2},
      );
      if(item.vote_details){
        write("Namentliche Stimmen: "+text(item.vote_details),{size:8,indent:8,gap:2});
      }
      if(item.task_title){
        write(
          "Folgeaufgabe: "+text(item.task_title)
          +(item.owner_first_name ? " / "+text(item.owner_first_name)+" "+text(item.owner_last_name) : "")
          +(item.due_date ? " / Frist "+text(item.due_date) : ""),
          {size:8,indent:8,gap:2},
        );
      }
    }

    const itemAttachments=attachments.filter((doc)=>String(doc.agenda_item_id)===String(item.id));
    if(itemAttachments.length){
      write("Anlagen: "+itemAttachments.map((doc)=>text(doc.title,"Anlage")).join(", "),{size:8,indent:8,gap:2});
    }
  }

  const generalAttachments=attachments.filter((doc)=>!doc.agenda_item_id);
  if(generalAttachments.length){
    heading("Allgemeine Sitzungsanlagen");
    generalAttachments.forEach((doc,index)=>write((index+1)+". "+text(doc.title,"Anlage"),{size:8,indent:8,gap:2}));
  }

  if(meeting.minutes_closing){
    heading("Abschluss");
    write(text(meeting.minutes_closing),{size:9,gap:3});
  }
  if(meeting.next_meeting_at){
    heading("Nächster Sitzungstermin");
    write(formatDateTime(meeting.next_meeting_at),{size:9});
  }

  const pages=pdf.getPages();
  pages.forEach((current,index)=>{
    current.drawLine({
      start:{x:margin,y:28},end:{x:pageWidth-margin,y:28},
      thickness:.4,color:rgb(.82,.82,.82),
    });
    current.drawText("VDC Club / Seite "+String(index+1)+" von "+String(pages.length),{
      x:margin,y:14,font:regular,size:7,color:rgb(.4,.4,.4),
    });
    if(String(meeting.minutes_status)!=="archived"){
      current.drawText("ARBEITSFASSUNG",{
        x:pageWidth-120,y:14,font:bold,size:7,color:rgb(.55,.25,.25),
      });
    }
  });

  const bytes=await pdf.save();
  const body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  const file=(filename("VDC-Protokoll-"+text(meeting.title,"Sitzung")+"-v"+String(meeting.minutes_version ?? 1)) || "VDC-Protokoll")+".pdf";

  return new Response(body,{
    headers:{
      "Content-Type":"application/pdf",
      "Content-Length":String(bytes.byteLength),
      "Content-Disposition":'inline; filename="'+file+'"; filename*=UTF-8\'\''+encodeURIComponent(file),
      "Cache-Control":"private, no-store, max-age=0",
      "X-Content-Type-Options":"nosniff",
    },
  });
}
