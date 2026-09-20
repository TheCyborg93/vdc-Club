"use client";

import { useEffect, useMemo, useState } from "react";

export function SurveyShare({
  title,
  topic,
  description,
  targetGroup,
  deadline,
  publicPath,
}: {
  title: string;
  topic: string;
  description: string;
  targetGroup: string;
  deadline: string | null;
  publicPath: string;
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
      "Die Umfrage ist *anonym*. Es werden keine Namen abgefragt.",
      deadline ? `📅 Teilnahme bis: ${deadline}` : "",
      `🔗 Umfrage: ${publicUrl}`,
      "",
      "Vielen Dank für eure Rückmeldung! 🎯",
    ];
    return parts.filter((part, index, array) => part !== "" || (index > 0 && array[index - 1] !== "")).join("\n");
  }, [title, topic, description, targetGroup, deadline, publicUrl]);

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
