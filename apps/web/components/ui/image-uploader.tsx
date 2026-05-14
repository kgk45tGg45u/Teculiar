"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "./button";

export function ImageUploader({
  action,
  accept = "image/png,image/jpeg,image/webp,image/svg+xml",
  headers,
  label,
  name = "image",
  onUploaded,
  previewUrl
}: {
  accept?: string;
  action: string;
  headers?: Record<string, string>;
  label: string;
  name?: string;
  onUploaded?: (payload: Record<string, unknown>) => void;
  previewUrl?: string;
}) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setMessage("Choose an image first.");
      return;
    }
    const formData = new FormData();
    formData.set(name, file);
    const response = await fetch(action, {
      body: formData,
      headers,
      method: "POST"
    });
    const payload = await response.clone().json().catch(() => ({}));
    if (response.ok) {
      setMessage("Image uploaded.");
      onUploaded?.(payload);
      return;
    }
    setMessage(typeof payload.message === "string" ? payload.message : "Image upload failed.");
  }

  return (
    <div>
      <label>{label}<input accept={accept} name={name} ref={inputRef} type="file" /></label>
      {previewUrl ? <img alt="" src={previewUrl} style={{ display: "block", maxHeight: 60, maxWidth: 180, objectFit: "contain" }} /> : null}
      <Button icon={Upload} type="button" variant="secondary" onClick={upload}>Upload Image</Button>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
