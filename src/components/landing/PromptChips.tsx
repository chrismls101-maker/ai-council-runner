import { LANDING_PROMPT_CHIPS } from "../../constants/publicMessages";
import { withIivoWordmark } from "../../utils/brandText";

interface PromptChipsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export default function PromptChips({ onSelect, disabled = false }: PromptChipsProps) {
  return (
    <div className="landing-prompt-chips" data-testid="landing-prompt-chips">
      <span className="landing-prompt-chips-label">Try asking</span>
      <div className="landing-prompt-chips-row">
        {LANDING_PROMPT_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="landing-prompt-chip"
            data-testid={`landing-prompt-chip-${chip.id}`}
            disabled={disabled}
            onClick={() => onSelect(chip.label)}
          >
            {withIivoWordmark(chip.label, chip.id)}
          </button>
        ))}
      </div>
    </div>
  );
}
