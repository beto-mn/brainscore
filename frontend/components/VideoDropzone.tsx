"use client";

import { useCallback, useRef, useState } from "react";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime"];
const MAX_SIZE_BYTES = 200 * 1024 * 1024;

interface VideoDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function VideoDropzone({ onFileSelected, disabled }: VideoDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Unsupported format. Use an MP4 or MOV video.");
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setError("The video exceeds the 200MB limit.");
        return;
      }
      setError(null);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndSelect(file);
    },
    [disabled, validateAndSelect]
  );

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          disabled
            ? "cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-60"
            : isDragging
              ? "cursor-pointer border-cyan-400 bg-cyan-400/5"
              : "cursor-pointer border-slate-700 bg-slate-900/40 hover:border-slate-500"
        }`}
      >
        <p className="text-sm text-slate-300">
          Drag your video here or <span className="text-cyan-400">click to select</span>
        </p>
        <p className="text-xs text-slate-500">MP4 or MOV, max 200MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) validateAndSelect(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
