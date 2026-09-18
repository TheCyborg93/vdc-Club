import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/access";

export const dynamic="force-dynamic";

type SearchResult = {
  type:string;
  title:string;
  subtitle:string;
  href:string;
};

function addRows(
  target: SearchResult[],
  rows: Array<Record<string,unknown>>,
  type:string,
  href:(row:Record<string,unknown>)=>string,
  title:(row:Record<string,unknown>)=>string,
  subtitle:(row:Record<string,unknown>)=>string,
) {
  for (const row of rows) {
    target.push({ type,href:href(row),title:title(row),subtitle:subtitle(row) });
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?:string }>;
}) {
  const user=await requireUser();
  const sql=getDb();
  const params=await searchParams;
  const q=(params.q ?? "").trim();
  const results: SearchResult[]=[];

  if (sql && q.length>=2) {
    if (hasPermission(user.roles,"members.read")) {
      const rows=await sql`
        SELECT id::text,first_name,last_name,member_number,email,status
        FROM members
        WHERE
          first_name ILIKE '%' || ${q} || '%'
          OR last_name ILIKE '%' || ${q} || '%'
          OR COALESCE(member_number,'') ILIKE '%' || ${q} || '%'
          OR COALESCE(email,'') ILIKE '%' || ${q} || '%'
        ORDER BY status,last_name,first_name
        LIMIT 12
      `;
      addRows(
        results,rows,"Mitglied",
        (row)=>"/mitglieder/"+String(row.id),
        (row)=>String(row.first_name)+" "+String(row.last_name),
        (row)=>(row.member_number ? "#"+String(row.member_number)+" · " : "")+String(row.status),
      );
    }

    if (hasPermission(user.roles,"teams.read")) {
      const rows=await sql`
        SELECT id::text,name,short_name,league,season
        FROM teams
        WHERE status='active'
          AND (
            name ILIKE '%' || ${q} || '%'
            OR COALESCE(short_name,'') ILIKE '%' || ${q} || '%'
            OR COALESCE(league,'') ILIKE '%' || ${q} || '%'
          )
        ORDER BY name
        LIMIT 10
      `;
      addRows(
        results,rows,"Mannschaft",
        (row)=>"/mannschaften/"+String(row.id),
        (row)=>String(row.short_name ?? row.name),
        (row)=>String(row.league ?? "Keine Liga")+" · "+String(row.season ?? "Keine Saison"),
      );
    }

    if (hasPermission(user.roles,"tasks.read")) {
      const rows=await sql`
        SELECT id::text,title,category,status,due_date
        FROM tasks
        WHERE status<>'cancelled'
          AND deleted_at IS NULL
          AND (title ILIKE '%' || ${q} || '%' OR COALESCE(description,'') ILIKE '%' || ${q} || '%')
        ORDER BY updated_at DESC
        LIMIT 12
      `;
      addRows(
        results,rows,"Aufgabe",
        ()=>"/aufgaben",
        (row)=>String(row.title),
        (row)=>String(row.category ?? "Allgemein")+" · "+String(row.status),
      );
    }

    if (hasPermission(user.roles,"meetings.read")) {
      const rows=await sql`
        SELECT id::text,title,starts_at,status
        FROM meetings
        WHERE deleted_at IS NULL
          AND (title ILIKE '%' || ${q} || '%'
          OR COALESCE(notes,'') ILIKE '%' || ${q} || '%')
        ORDER BY starts_at DESC
        LIMIT 10
      `;
      addRows(
        results,rows,"Sitzung",
        (row)=>"/sitzungen/"+String(row.id),
        (row)=>String(row.title),
        (row)=>new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(String(row.starts_at)))+" · "+String(row.status),
      );
    }

    if (hasPermission(user.roles,"resolutions.read")) {
      const rows=await sql`
        SELECT id::text,resolution_number,title,status,decided_at
        FROM resolutions
        WHERE
          title ILIKE '%' || ${q} || '%'
          OR decision_text ILIKE '%' || ${q} || '%'
          OR COALESCE(resolution_number,'') ILIKE '%' || ${q} || '%'
        ORDER BY decided_at DESC
        LIMIT 12
      `;
      addRows(
        results,rows,"Beschluss",
        ()=>"/beschluesse",
        (row)=>(row.resolution_number ? String(row.resolution_number)+" · " : "")+String(row.title),
        (row)=>String(row.status),
      );
    }

    if (hasPermission(user.roles,"documents.read")) {
      const rows=await sql`
        SELECT id::text,title,category,status,document_date
        FROM documents
        WHERE status<>'archived'
          AND deleted_at IS NULL
          AND (
            title ILIKE '%' || ${q} || '%'
            OR category ILIKE '%' || ${q} || '%'
            OR COALESCE(notes,'') ILIKE '%' || ${q} || '%'
          )
        ORDER BY COALESCE(document_date,created_at::date) DESC
        LIMIT 12
      `;
      addRows(
        results,rows,"Dokument",
        ()=>"/dokumente",
        (row)=>String(row.title),
        (row)=>String(row.category)+" · "+String(row.status),
      );
    }

    if (hasPermission(user.roles,"sponsors.read")) {
      const rows=await sql`
        SELECT id::text,name,contact_name,status
        FROM sponsors
        WHERE
          name ILIKE '%' || ${q} || '%'
          OR COALESCE(contact_name,'') ILIKE '%' || ${q} || '%'
        ORDER BY name
        LIMIT 10
      `;
      addRows(
        results,rows,"Sponsor",
        ()=>"/sponsoren",
        (row)=>String(row.name),
        (row)=>String(row.contact_name ?? "Kein Ansprechpartner")+" · "+String(row.status),
      );
    }

    if (hasPermission(user.roles,"calendar.read")) {
      const rows=await sql`
        SELECT id::text,title,event_type,starts_at,location
        FROM club_events
        WHERE deleted_at IS NULL
          AND (
          title ILIKE '%' || ${q} || '%'
          OR COALESCE(description,'') ILIKE '%' || ${q} || '%'
          OR COALESCE(location,'') ILIKE '%' || ${q} || '%')
        ORDER BY starts_at DESC
        LIMIT 10
      `;
      addRows(
        results,rows,"Termin",
        ()=>"/kalender",
        (row)=>String(row.title),
        (row)=>new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(String(row.starts_at)))+(row.location ? " · "+String(row.location) : ""),
      );
    }
  }

  const grouped=new Map<string,SearchResult[]>();
  for (const result of results) {
    if (!grouped.has(result.type)) grouped.set(result.type,[]);
    grouped.get(result.type)!.push(result);
  }

  return (
    <div className="page-stack search-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Vereinszentrale</span>
          <h1>Globale Suche</h1>
          <p>Durchsucht nur die Vereinsbereiche, für die du eine Berechtigung besitzt.</p>
        </div>
      </section>

      <article className="panel global-search-panel">
        <form method="get" className="global-search-form">
          <input
            name="q"
            defaultValue={q}
            placeholder="Mitglied, Mannschaft, Beschluss, Dokument …"
            autoFocus
          />
          <button className="primary-button">Suchen</button>
        </form>
      </article>

      {q.length>0 && q.length<2 && (
        <div className="form-error">Bitte mindestens zwei Zeichen eingeben.</div>
      )}

      {q.length>=2 && (
        <>
          <section className="search-summary">
            <strong>{results.length}</strong>
            <span>Treffer für „{q}“</span>
          </section>

          {results.length===0 ? (
            <article className="panel">
              <div className="empty-state">Keine passenden Einträge gefunden.</div>
            </article>
          ) : [...grouped.entries()].map(([type,items])=>(
            <article className="panel search-result-group" key={type}>
              <div className="panel-head">
                <div><span className="eyebrow">Treffer</span><h2>{type}</h2></div>
                <span className="count-chip">{items.length}</span>
              </div>
              <div className="search-result-list">
                {items.map((item,index)=>(
                  <Link href={item.href} className="search-result-row" key={item.type+item.title+index}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </div>
                    <b>›</b>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
