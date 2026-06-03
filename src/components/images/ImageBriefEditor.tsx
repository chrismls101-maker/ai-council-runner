import type { ImageBrief } from "../../types/imageStudio";

export interface ImageBriefEditorProps {
  brief: ImageBrief;
  onChange: (next: ImageBrief) => void;
  ipWarning?: string;
}

export default function ImageBriefEditor({ brief, onChange, ipWarning }: ImageBriefEditorProps) {
  return (
    <div className="image-brief-editor" data-testid="image-brief-editor">
      <h4>Image brief</h4>
      {ipWarning && (
        <div className="banner warning image-ip-warning" data-testid="image-ip-warning" role="alert">
          {ipWarning}
        </div>
      )}
      <p className="muted image-brief-note">
        Use original style descriptions; avoid requesting copyrighted characters, logos, or exact brand
        replicas unless you own the rights.
      </p>
      <label className="image-brief-field">
        <span>Subject</span>
        <input
          value={brief.subject}
          onChange={(e) => onChange({ ...brief, subject: e.target.value })}
        />
      </label>
      <label className="image-brief-field">
        <span>Purpose</span>
        <textarea
          rows={2}
          value={brief.purpose}
          onChange={(e) => onChange({ ...brief, purpose: e.target.value })}
        />
      </label>
      <label className="image-brief-field">
        <span>Style direction</span>
        <textarea
          rows={2}
          value={brief.styleDirection}
          onChange={(e) => onChange({ ...brief, styleDirection: e.target.value })}
        />
      </label>
      <label className="image-brief-field">
        <span>Prompt</span>
        <textarea
          rows={4}
          data-testid="image-brief-prompt"
          value={brief.prompt}
          onChange={(e) => onChange({ ...brief, prompt: e.target.value })}
        />
      </label>
      <div className="image-brief-meta muted">
        Aspect ratio: {brief.aspectRatio} · {brief.textInstruction}
      </div>
    </div>
  );
}
