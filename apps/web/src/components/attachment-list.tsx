"use client";

import { memo } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { cn } from "@/lib/utils";
import { downloadAttachment as downloadAttachmentFn } from "../server/functions";

// Attachment data from server
export interface AttachmentData {
  id: string;
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string | null;
  isInline?: boolean;
}

interface AttachmentListProps {
  attachments: AttachmentData[];
  emailId: string;
  className?: string;
}

/**
 * Format bytes to human-readable size
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Get file type icon based on mime type
 */
function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (
    mimeType.includes("word") ||
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "document";
  }
  if (
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return "spreadsheet";
  }
  if (
    mimeType.includes("powerpoint") ||
    mimeType.includes("presentation") ||
    mimeType === "application/vnd.ms-powerpoint"
  ) {
    return "presentation";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-rar-compressed" ||
    mimeType === "application/x-7z-compressed"
  ) {
    return "archive";
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    return "text";
  }
  return "file";
}

// Map file types to CSS color classes
const FILE_ICON_CLASS: Record<string, string> = {
  pdf: "file-icon--pdf",
  document: "file-icon--doc",
  spreadsheet: "file-icon--sheet",
  presentation: "file-icon--slides",
  video: "file-icon--video",
  audio: "file-icon--audio",
  archive: "file-icon--archive",
};

/**
 * File type icon component using SVG icons
 */
function FileTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const iconClass = cn("w-5 h-5", FILE_ICON_CLASS[type], className);

  switch (type) {
    case "image":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    case "pdf":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      );
    case "document":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case "spreadsheet":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
    case "presentation":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
          />
        </svg>
      );
    case "video":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
    case "audio":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      );
    case "archive":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
          />
        </svg>
      );
    case "text":
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    default:
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      );
  }
}

/**
 * Download icon component
 */
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("w-4 h-4", className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}

/**
 * Loading spinner component
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("w-4 h-4 animate-spin", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Single attachment item component - memoized to prevent re-renders
 * when sibling items change (e.g., download state)
 */
const AttachmentItem = memo(function AttachmentItem({
  attachment,
  emailId,
}: {
  attachment: AttachmentData;
  emailId: string;
}) {
  const state$ = useObservable({ downloading: false, error: null as string | null });
  const isDownloading = useValue(() => state$.downloading.get());
  const error = useValue(() => state$.error.get());

  const fileIcon = getFileIcon(attachment.mimeType);

  const handleDownload = async () => {
    if (state$.downloading.get()) return;

    state$.downloading.set(true);
    state$.error.set(null);

    try {
      const result = await downloadAttachmentFn({
        data: {
          emailId,
          attachmentId: attachment.id,
        },
      });

      // Convert URL-safe base64 to standard base64
      const base64 = result.data.replace(/-/g, "+").replace(/_/g, "/");

      // Create blob from base64 - write directly to Uint8Array to avoid
      // intermediate array allocation for large files
      const byteCharacters = atob(base64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: result.mimeType });

      // Create download link and trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download attachment:", err);
      state$.error.set("Failed to download attachment");
    } finally {
      state$.downloading.set(false);
    }
  };

  return (
    <div
      className={cn(
        "attachment-card",
        error && "attachment-card--error"
      )}
    >
      {/* File type icon */}
      <FileTypeIcon type={fileIcon} className="shrink-0" />

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="attachment-card__name" title={attachment.filename}>
          {attachment.filename}
        </div>
        <div className="text-caption">
          {formatFileSize(attachment.size)}
        </div>
        {error && <div className="attachment-card__error">{error}</div>}
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="btn-icon shrink-0"
        title={isDownloading ? "Downloading..." : "Download attachment"}
      >
        {isDownloading ? (
          <LoadingSpinner />
        ) : (
          <DownloadIcon className="text-muted" />
        )}
      </button>
    </div>
  );
});

/**
 * Attachment list component - displays list of attachments for an email
 */
export function AttachmentList({
  attachments,
  emailId,
  className,
}: AttachmentListProps) {
  // Hide pure inline images (already rendered in the email body).
  const visible = attachments.filter(
    (a) =>
      !(a.isInline && a.mimeType.startsWith("image/") && !a.filename.match(/\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt)$/i)),
  );
  if (visible.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-body text-muted font-medium">
        Attachments ({visible.length})
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((attachment) => (
        
          <AttachmentItem
            key={attachment.id}
            attachment={attachment}
            emailId={emailId}
          />
        ))}
      </div>
    </div>
  );
}

// Export helper functions for use elsewhere
export { formatFileSize, getFileIcon };
