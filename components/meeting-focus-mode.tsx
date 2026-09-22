"use client";

import { useEffect } from "react";

export function MeetingFocusMode() {
  useEffect(()=>{
    document.body.classList.add("meeting-focus-mode");
    return ()=>document.body.classList.remove("meeting-focus-mode");
  },[]);

  return null;
}
