import { useState } from "react";
import type { MatchResult } from "@truco/shared";
import "./ScoreForm.css";

const PRESETS: MatchResult[] = [
  { setsA: 2, setsB: 0 },
  { setsA: 2, setsB: 1 },
  { setsA: 1, setsB: 2 },
  { setsA: 0, setsB: 2 },
];

interface ScoreFormProps {
  teamAName: string;
  teamBName: string;
  onSubmit: (result: MatchResult) => void;
  isSubmitting?: boolean;
}

export function ScoreForm({ teamAName, teamBName, onSubmit, isSubmitting = false }: ScoreFormProps) {
  const [selected, setSelected] = useState<MatchResult | null>(null);

  return (
    <div className="score-form">
      <p className="score-form-hint text-muted">
        {teamAName} <span className="text-faint">x</span> {teamBName}
      </p>
      <div className="score-form-grid">
        {PRESETS.map((preset) => {
          const isSelected = selected?.setsA === preset.setsA && selected?.setsB === preset.setsB;
          return (
            <button
              key={`${preset.setsA}-${preset.setsB}`}
              type="button"
              className={`score-preset${isSelected ? " score-preset-selected" : ""}`}
              onClick={() => setSelected(preset)}
              disabled={isSubmitting}
            >
              {preset.setsA}x{preset.setsB}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="score-form-submit"
        disabled={!selected || isSubmitting}
        onClick={() => selected && onSubmit(selected)}
      >
        {isSubmitting ? "Salvando..." : "Confirmar resultado"}
      </button>
    </div>
  );
}
