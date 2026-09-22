export const meetingV3States = [
  "preparation",
  "ready",
  "live",
  "closing",
  "minutes_draft",
  "minutes_review",
  "archived",
  "cancelled",
] as const;

export type MeetingV3State = typeof meetingV3States[number];

export const meetingV3StateLabels: Record<MeetingV3State,string> = {
  preparation: "Vorbereitung",
  ready: "Bereit",
  live: "Läuft",
  closing: "Abschluss",
  minutes_draft: "Protokollentwurf",
  minutes_review: "Protokollprüfung",
  archived: "Archiviert",
  cancelled: "Abgesagt",
};

export const meetingV3StateTransitions: Record<MeetingV3State,MeetingV3State[]> = {
  preparation: ["ready","cancelled"],
  ready: ["preparation","live","cancelled"],
  live: ["closing"],
  closing: ["live","minutes_draft"],
  minutes_draft: ["minutes_review"],
  minutes_review: ["minutes_draft","archived"],
  archived: [],
  cancelled: ["preparation"],
};

export function isMeetingV3State(value: unknown): value is MeetingV3State {
  return typeof value === "string" && (meetingV3States as readonly string[]).includes(value);
}

export function canTransitionMeetingV3(from: MeetingV3State,to: MeetingV3State) {
  return from === to || meetingV3StateTransitions[from].includes(to);
}

export const meetingV3Types = [
  "board",
  "general_assembly",
  "extraordinary",
  "custom",
] as const;

export type MeetingV3Type = typeof meetingV3Types[number];

export const meetingV3TypeLabels: Record<MeetingV3Type,string> = {
  board: "Vorstandssitzung",
  general_assembly: "Mitgliederversammlung",
  extraordinary: "Außerordentliche Sitzung",
  custom: "Freie Sitzung",
};

export const meetingV3Modes = ["in_person","hybrid","online"] as const;
export type MeetingV3Mode = typeof meetingV3Modes[number];

export const meetingV3ModeLabels: Record<MeetingV3Mode,string> = {
  in_person: "Präsenz",
  hybrid: "Hybrid",
  online: "Online",
};

export const meetingV3AgendaTypes = ["information","consultation","decision"] as const;
export type MeetingV3AgendaType = typeof meetingV3AgendaTypes[number];

export const meetingV3AgendaTypeLabels: Record<MeetingV3AgendaType,string> = {
  information: "Information",
  consultation: "Beratung",
  decision: "Beschluss",
};

export const meetingV3ResultCodes = [
  "noted",
  "completed",
  "deferred",
  "resolution",
  "no_decision",
] as const;

export type MeetingV3ReadinessInput = {
  chairMemberId?: string | null;
  minuteTakerMemberId?: string | null;
  invitedAt?: unknown;
  invitationMethod?: string | null;
  invitationTimely?: boolean | null;
  agendaSentWithInvitation?: boolean | null;
  participantCount?: number;
  agendaCount?: number;
};

export type MeetingV3ReadinessCheck = {
  key: string;
  label: string;
  complete: boolean;
  critical: boolean;
};

export function getMeetingV3Readiness(input: MeetingV3ReadinessInput) {
  const checks: MeetingV3ReadinessCheck[] = [
    {
      key: "chair",
      label: "Sitzungsleitung festgelegt",
      complete: Boolean(input.chairMemberId),
      critical: true,
    },
    {
      key: "minutes",
      label: "Protokollführung festgelegt",
      complete: Boolean(input.minuteTakerMemberId),
      critical: true,
    },
    {
      key: "participants",
      label: "Teilnehmerkreis vorhanden",
      complete: Number(input.participantCount ?? 0) > 0,
      critical: true,
    },
    {
      key: "agenda",
      label: "Tagesordnung vorhanden",
      complete: Number(input.agendaCount ?? 0) > 0,
      critical: true,
    },
    {
      key: "invitedAt",
      label: "Einladungszeitpunkt dokumentiert",
      complete: Boolean(input.invitedAt),
      critical: true,
    },
    {
      key: "invitationMethod",
      label: "Einladungsweg dokumentiert",
      complete: Boolean(String(input.invitationMethod ?? "").trim()),
      critical: true,
    },
    {
      key: "invitationTimely",
      label: "Fristgerechte Einladung geprüft",
      complete: input.invitationTimely != null,
      critical: true,
    },
    {
      key: "agendaSent",
      label: "Tagesordnung mit Einladung geprüft",
      complete: input.agendaSentWithInvitation != null,
      critical: true,
    },
  ];

  const completed = checks.filter((check) => check.complete).length;
  const criticalOpen = checks.filter((check) => check.critical && !check.complete).length;

  return {
    checks,
    completed,
    total: checks.length,
    criticalOpen,
    ready: criticalOpen === 0,
    percent: Math.round((completed / checks.length) * 100),
  };
}

export function meetingV3CanControlLive(roles: string[]) {
  return roles.some((role) =>
    ["admin","board","chair","vice_chair","secretary"].includes(role),
  );
}

export function meetingV3CanApproveMinutes(roles: string[]) {
  return roles.some((role) =>
    ["admin","board","chair","vice_chair"].includes(role),
  );
}
