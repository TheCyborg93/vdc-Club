"use client";

import { useEffect, useMemo, useState } from "react";

export function SurveyShare({
  title,
  topic,
  description,
  targetGroup,
  deadline,
  publicPath,
  isAnonymous,
}: {
  title: string;
  topic: string;
  description: string;
  targetGroup: string;
  deadline: string | null;
  publicPath: string;
  isAnonymous: boolean;
}) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const publicUrl = origin ? `${origin}${publicPath}` : publicPath;

  const message = useMemo(() => {
    const parts = [
      `🎯 *VDC Umfrage – ${title}*`,
      "",
      `*Thema:* ${topic}`,
      targetGroup ? `*Für:* ${targetGroup}` : "",
      description ? "" : "",
      description,
      "",
      isAnonymous
        ? "Die Umfrage ist *anonym*. Es werden keine persönlichen Teilnehmerangaben abgefragt."
        : "Die Umfrage ist *nicht anonym*. Die im Formular angegebenen Teilnehmerdaten werden zusammen mit der Antwort gespeichert.",
      deadline ? `📅 Teilnahme bis: ${deadline}` : "",
      `🔗 Umfrage: ${publicUrl}`,
      "",
      "Vielen Dank für eure Rückmeldung! 🎯",
    ];
    return parts.filter((part, index, array) => part !== "" || (index > 0 && array[index - 1] !== "")).join("\n");
  }, [title, topic, description, targetGroup, deadline, publicUrl, isAnonymous]);

  async function copy(value: string, type: "link" | "message") {
    await navigator.clipboard.writeText(value);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 1600);
  }

  function openWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="survey-share-box">
      <div className="survey-share-link">
        <span>Öffentlicher Link</span>
        <code>{publicUrl}</code>
      </div>
      <div className="survey-share-actions">
        <button type="button" className="ghost-button" onClick={() => copy(publicUrl, "link")}>
          {copied === "link" ? "Link kopiert" : "Link kopieren"}
        </button>
        <button type="button" className="ghost-button" onClick={() => copy(message, "message")}>
          {copied === "message" ? "Text kopiert" : "WhatsApp-Text kopieren"}
        </button>
        <button type="button" className="primary-button" onClick={openWhatsApp}>In WhatsApp öffnen</button>
      </div>
      <details className="survey-message-preview">
        <summary>WhatsApp-Nachricht ansehen</summary>
        <pre>{message}</pre>
      </details>
    </div>
  );
}
