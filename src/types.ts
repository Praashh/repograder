export interface ScanResult {
  score: number;
  evidence: string[];
  blocking: boolean;
  remediationTips?: string[];
}

export interface DimensionResult extends ScanResult {
  id: string;
  label: string;
}

export interface Scanner {
  id: string;
  label: string;
  scan(root: string): ScanResult;
}

export interface Level {
  min: number;
  max: number;
  name: string;
}

export interface RunAllResult {
  results: DimensionResult[];
  ceiling: number;
  level: Level;
  indexScore: number;
  grade: string;
  remediation: DimensionResult[];
}
