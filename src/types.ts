
export interface ScanResult {
  score: number;
  evidence: string[];
  blocking: boolean;
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
  remediation: DimensionResult[];
}
