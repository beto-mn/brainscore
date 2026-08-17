export type JobStatus = "queued" | "processing" | "done" | "error";

export interface AnalysisStats {
  mean_activation: number;
  std_activation: number;
  max_activation: number;
  min_activation: number;
  n_timesteps: number;
  n_vertices: number;
}

export interface AnalysisResult {
  score: number;
  activation_timeline: number[];
  stats: AnalysisStats;
  duration_s: number;
}

export interface JobResponse {
  status: JobStatus;
  result: AnalysisResult | null;
  error: string | null;
}
