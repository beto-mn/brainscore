"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivationChart } from "@/components/ActivationChart";
import { ScoreGauge } from "@/components/ScoreGauge";
import { StatsCards } from "@/components/StatsCards";
import { VideoDropzone } from "@/components/VideoDropzone";
import { getJob, uploadVideo } from "@/lib/api";
import type { AnalysisResult } from "@/lib/types";

type AppState = "idle" | "selected" | "queued" | "processing" | "done" | "error";

const POLL_INTERVAL_MS = 5000;

const STATUS_LABELS: Record<"queued" | "processing", string> = {
  queued: "Queued...",
  processing: "Analyzing your video (this takes a few minutes)...",
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [state, setState] = useState<AppState>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const handleFileSelected = (selected: File) => {
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setResult(null);
    setErrorMessage(null);
    setState("selected");
  };

  const pollJob = useCallback(
    (jobId: string) => {
      pollRef.current = setInterval(async () => {
        try {
          const job = await getJob(jobId);
          if (job.status === "done" && job.result) {
            stopPolling();
            setResult(job.result);
            setState("done");
          } else if (job.status === "error") {
            stopPolling();
            setErrorMessage(job.error ?? "The analysis failed.");
            setState("error");
          } else {
            setState(job.status);
          }
        } catch (err) {
          stopPolling();
          setErrorMessage(
            err instanceof Error ? err.message : "Could not check the analysis status."
          );
          setState("error");
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  const handleAnalyze = async () => {
    if (!file) return;
    setErrorMessage(null);
    setState("queued");
    try {
      const { job_id } = await uploadVideo(file);
      pollJob(job_id);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not connect to the API. Is the pod running?"
      );
      setState("error");
    }
  };

  const handleReset = () => {
    stopPolling();
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setErrorMessage(null);
    setState("idle");
  };

  const isBusy = state === "queued" || state === "processing";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-12">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-white">BrainScore</h1>
        <p className="mt-2 text-sm text-slate-400">
          Analyze your video&apos;s brain potential using TRIBE v2, a model that predicts fMRI
          responses.
        </p>
      </header>

      <VideoDropzone onFileSelected={handleFileSelected} disabled={isBusy} />

      {previewUrl && file && (
        <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <video
            src={previewUrl}
            muted
            playsInline
            preload="metadata"
            className="h-20 w-20 flex-shrink-0 rounded-lg border border-slate-800 object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
          </div>
        </div>
      )}

      {file && state !== "done" && (
        <button
          onClick={handleAnalyze}
          disabled={isBusy}
          className="self-center rounded-full bg-cyan-500 px-8 py-3 font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {isBusy ? "Analyzing..." : "Analyze"}
        </button>
      )}

      {(state === "queued" || state === "processing") && (
        <p className="text-center text-sm text-cyan-300">{STATUS_LABELS[state]}</p>
      )}

      {state === "error" && errorMessage && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-center text-sm text-red-300">
          {errorMessage}
        </div>
      )}

      {state === "done" && result && (
        <section className="flex flex-col items-center gap-6">
          <ScoreGauge score={result.score} />
          <ActivationChart timeline={result.activation_timeline} durationS={result.duration_s} />
          <StatsCards stats={result.stats} durationS={result.duration_s} />
          <button onClick={handleReset} className="text-sm text-slate-400 underline hover:text-slate-200">
            Analyze another video
          </button>
        </section>
      )}
    </main>
  );
}
