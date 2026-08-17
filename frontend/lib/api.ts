import type { JobResponse } from "@/lib/types";

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Define this environment variable with the RunPod proxy URL."
    );
  }
  return url;
}

export async function uploadVideo(file: File): Promise<{ job_id: string }> {
  const formData = new FormData();
  formData.append("video", file);

  const res = await fetch(`${getApiUrl()}/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error((await safeDetail(res)) ?? `Error uploading the video (${res.status}).`);
  }

  return res.json();
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${getApiUrl()}/jobs/${jobId}`);

  if (!res.ok) {
    throw new Error((await safeDetail(res)) ?? `Error fetching the job (${res.status}).`);
  }

  return res.json();
}

async function safeDetail(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    return typeof data?.detail === "string" ? data.detail : null;
  } catch {
    return null;
  }
}
