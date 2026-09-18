import Link from "next/link";
import { getDb } from "@/lib/db";
import { isDocumentStorageConfigured } from "@/lib/document-storage";

export const dynamic="force-dynamic";

function checkState(count: number) {
  return count===0 ? "ok" : "warning";
}

export default async function AdminDataQualityPage() {
  const sql=getDb();
  const storageReady=isDocumentStorageConfigured();

  const [summary,missingMembers,noTeam,teamsWithoutCaptain,meetingsWithoutMinutes,resolutionsWithoutTask,documentIssues,pendingTraining,integrationErrors,roleIssues]=sql
    ? await Promise.all([
        sql`
          SELECT
            (SELECT count(*) FROM members WHERE status='active')::int AS active_members,
            (SELECT count(*) FROM teams WHERE status='active')::int AS active_teams,
            (SELECT count(*) FROM app_users WHERE status='active')::int AS active_users,
            (
              SELECT count(DISTINCT u.id)
              FROM app_users u
              JOIN user_roles ur ON ur.user_id=u.id
              WHERE u.status='active' AND ur.role_key='admin'
            )::int AS active_admins
        `,
        sql`
          SELECT id::text,first_name,last_name,email,member_number,join_date
          FROM members
          WHERE status='active'
            AND (
              email IS NULL OR trim(email)=''
              OR member_number IS NULL OR trim(member_number)=''
              OR join_date IS NULL
            )
          ORDER BY last_name,first_name
          LIMIT 30
        `,
        sql`
          SELECT m.id::text,m.first_name,m.last_name
          FROM members m
          WHERE m.status='active'
            AND NOT EXISTS (
              SELECT 1 FROM team_members tm
              JOIN teams t ON t.id=tm.team_id AND t.status='active'
              WHERE tm.member_id=m.id AND tm.is_active=true
            )
          ORDER BY m.last_name,m.first_name
          LIMIT 30
        `,
        sql`
          SELECT t.id::text,t.name,t.short_name
          FROM teams t
          WHERE t.status='active'
            AND NOT EXISTS (
              SELECT 1 FROM team_members tm
              WHERE tm.team_id=t.id
                AND tm.is_active=true
                AND tm.is_captain=true
            )
          ORDER BY t.name
        `,
        sql`
          SELECT m.id::text,m.title,m.starts_at
          FROM meetings m
          WHERE m.status='completed'
            AND m.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM documents d
              WHERE d.meeting_id=m.id
                AND d.category='Protokoll'
                AND d.status<>'archived'
                AND d.deleted_at IS NULL
            )
          ORDER BY m.starts_at DESC
          LIMIT 20
        `,
        sql`
          SELECT r.id::text,r.resolution_number,r.title,r.decided_at
          FROM resolutions r
          WHERE r.status IN ('open','in_progress')
            AND NOT EXISTS (
              SELECT 1 FROM tasks t
              WHERE t.source_type='resolution'
                AND t.source_id=r.id
                AND t.status<>'cancelled'
                AND t.deleted_at IS NULL
            )
          ORDER BY r.decided_at
          LIMIT 30
        `,
        sql`
          SELECT id::text,title,category,status,review_on,valid_until
          FROM documents
          WHERE status IN ('active','review')
            AND deleted_at IS NULL
            AND (
              (review_on IS NOT NULL AND review_on<=CURRENT_DATE+interval '30 days')
              OR
              (valid_until IS NOT NULL AND valid_until<=CURRENT_DATE+interval '30 days')
            )
          ORDER BY COALESCE(review_on,valid_until)
          LIMIT 30
        `,
        sql`
          SELECT id::text,scheduled_at
          FROM training_sessions
          WHERE deleted_at IS NULL
            AND scheduled_at<now()
            AND status<>'cancelled'
            AND attendance_recorded_at IS NULL
          ORDER BY scheduled_at DESC
          LIMIT 20
        `,
        sql`
          SELECT integration_key,display_name,status,last_error
          FROM integration_connections
          WHERE status='error'
          ORDER BY display_name
        `,
        sql`
          SELECT u.id::text,u.display_name,u.email
          FROM app_users u
          WHERE u.status='active'
            AND NOT EXISTS (
              SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id
            )
          ORDER BY u.display_name
        `
      ])
    : [[{active_members:0,active_teams:0,active_users:0,active_admins:0}],[],[],[],[],[],[],[],[],[]];

  const s=summary[0] ?? {};
  const checks=[
    {label:"Mitglieder mit unvollständigen Stammdaten",count:missingMembers.length,href:"/mitglieder"},
    {label:"Aktive Mitglieder ohne Mannschaft",count:noTeam.length,href:"/mitglieder"},
    {label:"Mannschaften ohne Captain",count:teamsWithoutCaptain.length,href:"/mannschaften"},
    {label:"Sitzungen ohne registriertes Protokoll",count:meetingsWithoutMinutes.length,href:"/sitzungen"},
    {label:"Offene Beschlüsse ohne Folgeaufgabe",count:resolutionsWithoutTask.length,href:"/beschluesse"},
    {label:"Dokumente mit naher/überschrittener Frist",count:documentIssues.length,href:"/dokumente"},
    {label:"Trainingstage ohne Anwesenheit",count:pendingTraining.length,href:"/training"},
    {label:"Integrationen mit Fehler",count:integrationErrors.length,href:"/admin/integrationen"},
    {label:"Aktive Benutzer ohne Rolle",count:roleIssues.length,href:"/admin/benutzer"},
    {label:"Privater Dokumentenspeicher",count:storageReady ? 0 : 1,href:"/admin/status"},
  ];

  const issueCount=checks.reduce((sum,item)=>sum+item.count,0);

  return (
    <div className="page-stack">
      <section className="page-heading admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Daten & Qualität</h1>
          <p>Datenqualität, Sicherheitsgrundlagen, Exporte und manuelle Datensicherung an einer Stelle.</p>
        </div>
        <span className="admin-lock-chip">ADMIN</span>
      </section>

      <section className="stat-grid">
        <article className="stat-card"><span>Qualitätshinweise</span><strong>{issueCount}</strong><small>über alle Prüfungen</small></article>
        <article className="stat-card"><span>Mitglieder</span><strong>{Number(s.active_members ?? 0)}</strong><small>aktiv</small></article>
        <article className="stat-card"><span>Benutzer</span><strong>{Number(s.active_users ?? 0)}</strong><small>aktive Logins</small></article>
        <article className="stat-card"><span>Administratoren</span><strong>{Number(s.active_admins ?? 0)}</strong><small>{Number(s.active_admins ?? 0)>0 ? "Schutz vorhanden" : "KRITISCH"}</small></article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Automatische Prüfung</span><h2>Datenqualität</h2></div>
        </div>
        <div className="quality-check-grid">
          {checks.map((check)=>(
            <Link href={check.href} className={"quality-check quality-"+checkState(check.count)} key={check.label}>
              <i />
              <div><strong>{check.label}</strong><span>{check.count===0 ? "Keine Auffälligkeit" : String(check.count)+" prüfen"}</span></div>
              <b>{check.count}</b>
            </Link>
          ))}
        </div>
      </article>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Export</span><h2>CSV-Exporte</h2></div></div>
          <div className="export-link-list">
            <a href="/api/export/mitglieder" className="export-link">
              <div><strong>Mitglieder</strong><span>Stammdaten, Status und Mannschaften</span></div><b>CSV ↓</b>
            </a>
            <a href="/api/export/beschluesse" className="export-link">
              <div><strong>Beschlüsse</strong><span>Beschlussbuch inklusive Umsetzung</span></div><b>CSV ↓</b>
            </a>
            <a href="/api/export/dokumente" className="export-link">
              <div><strong>Dokumentregister</strong><span>Kategorien, Status und Fristen</span></div><b>CSV ↓</b>
            </a>
          </div>
        </article>

        <article className="panel panel-accent">
          <span className="eyebrow">Manueller Sicherungsexport</span>
          <h2>Vereinsdaten als JSON</h2>
          <p>Exportiert die fachlichen Vereinsdaten. Passwort-Hashes, Tokens und Sessions sind ausdrücklich nicht enthalten.</p>
          <a href="/api/export/backup" className="light-button">Vereinsdaten exportieren</a>
          <small className="backup-note">Dieser Export ist eine zusätzliche manuelle Sicherung und ersetzt kein providerseitiges Datenbank-Backup.</small>
        </article>
      </section>

      {issueCount>0 && (
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Details</span><h2>Aktuelle Auffälligkeiten</h2></div></div>
          <div className="quality-detail-grid">
            {missingMembers.map((member)=>(
              <Link href={"/mitglieder/"+String(member.id)} key={"member-"+String(member.id)}>
                <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                <span>Stammdaten ergänzen</span>
              </Link>
            ))}
            {noTeam.map((member)=>(
              <Link href={"/mitglieder/"+String(member.id)} key={"teamless-"+String(member.id)}>
                <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                <span>Keine aktive Mannschaft</span>
              </Link>
            ))}
            {teamsWithoutCaptain.map((team)=>(
              <Link href={"/mannschaften/"+String(team.id)} key={"captain-"+String(team.id)}>
                <strong>{String(team.short_name ?? team.name)}</strong>
                <span>Kein Captain gesetzt</span>
              </Link>
            ))}
            {meetingsWithoutMinutes.map((meeting)=>(
              <Link href={"/sitzungen/"+String(meeting.id)} key={"meeting-"+String(meeting.id)}>
                <strong>{String(meeting.title)}</strong>
                <span>Protokoll nicht registriert</span>
              </Link>
            ))}
            {resolutionsWithoutTask.map((resolution)=>(
              <Link href="/beschluesse" key={"resolution-"+String(resolution.id)}>
                <strong>{String(resolution.resolution_number ?? "")} {String(resolution.title)}</strong>
                <span>Keine Folgeaufgabe</span>
              </Link>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
