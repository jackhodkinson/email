"use client";

import { useQuery } from "@tanstack/react-query";
import { AttachmentList } from "./attachment-list";
import { emailAttachmentsQueryOptions } from "@/lib/query";

export function AttachmentsRow({
  emailId,
  hasAttachments,
}: {
  emailId: string;
  hasAttachments: boolean;
}) {
  const enabled = hasAttachments;
  const { data } = useQuery({
    ...emailAttachmentsQueryOptions(emailId),
    enabled,
  });
  if (!enabled || !data || data.length === 0) return null;
  return (
    <div className="attachments-row">
      <AttachmentList attachments={data} emailId={emailId} />
    </div>
  );
}
