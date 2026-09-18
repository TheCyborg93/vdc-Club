export const meetingStatusLabels:Record<string,string>={
  planned:"Geplant",
  running:"Läuft",
  completed:"Abgeschlossen",
  cancelled:"Abgesagt",
};

export const teamStatusLabels:Record<string,string>={
  active:"Aktiv",
  archived:"Archiviert",
};

export const resolutionStatusLabels:Record<string,string>={
  open:"Offen",
  in_progress:"In Umsetzung",
  implemented:"Umgesetzt",
  withdrawn:"Aufgehoben",
};

export const sponsorStatusLabels:Record<string,string>={
  lead:"Kontakt",
  active:"Aktiv",
  expired:"Abgelaufen",
  inactive:"Inaktiv",
};

export const taskStatusLabels:Record<string,string>={
  open:"Offen",
  in_progress:"In Arbeit",
  blocked:"Blockiert",
  done:"Erledigt",
  cancelled:"Abgebrochen",
};

export function meetingStatusLabel(value:unknown) {
  const key=String(value ?? "");
  return meetingStatusLabels[key] ?? key;
}

export function teamStatusLabel(value:unknown) {
  const key=String(value ?? "");
  return teamStatusLabels[key] ?? key;
}

export function resolutionStatusLabel(value:unknown) {
  const key=String(value ?? "");
  return resolutionStatusLabels[key] ?? key;
}

export function sponsorStatusLabel(value:unknown) {
  const key=String(value ?? "");
  return sponsorStatusLabels[key] ?? key;
}

export function taskStatusLabel(value:unknown) {
  const key=String(value ?? "");
  return taskStatusLabels[key] ?? key;
}
