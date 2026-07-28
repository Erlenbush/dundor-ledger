import { useRef, useState, type DragEvent } from 'react';

export interface IngestProps {
  onFiles: (files: File[]) => void;
  onPaste: (text: string) => void;
  status: { text: string; error: boolean };
  initialText: string;
}

/**
 * Entry point for logs. Dundor emits them as .txt attachments via
 * `dun logs get N`, so files are the primary path and pasting is secondary.
 */
export function Ingest({ onFiles, onPaste, status, initialText }: IngestProps) {
  const [over, setOver] = useState(false);
  const [draft, setDraft] = useState(initialText);
  const input = useRef<HTMLInputElement>(null);

  const accept = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer?.files?.length) onFiles([...e.dataTransfer.files]);
  };

  return (
    <section>
      <p className="eyebrow">Load logs</p>
      <div
        className={`panel dropzone${over ? ' over' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={accept}
      >
        <div className="lead">
          <label className="filebtn" htmlFor="filePick">
            Choose log files
            <input
              id="filePick"
              ref={input}
              type="file"
              accept=".txt,text/plain"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) onFiles([...e.target.files]);
                e.target.value = '';
              }}
            />
          </label>
          <span className="hint">
            or drag the <code className="inline">.txt</code> files Dundor attaches onto this page — as
            many at once as you like.
          </span>
        </div>

        <p className="hint">
          Pull them in Discord with <code className="inline">dun logs get 1</code>. You don&rsquo;t have
          to do it after every fight: run a batch of <code className="inline">dun fight</code>, then
          collect the logs at the end and drop them here together. A single file holding several
          fights is split automatically.
        </p>

        <details className="disclose">
          <summary>Paste raw text instead</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
            <textarea
              value={draft}
              spellCheck={false}
              aria-label="Raw Dundor fight log"
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="actions">
              <button type="button" className="primary" onClick={() => onPaste(draft)}>
                Parse log
              </button>
            </div>
          </div>
        </details>

        <div className="actions">
          <span className={`status${status.error ? ' err' : ''}`} role="status" aria-live="polite">
            {status.text}
          </span>
        </div>
      </div>
    </section>
  );
}
