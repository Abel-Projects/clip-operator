"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const starterMessages: Message[] = [
  {
    role: "assistant",
    content:
      "Upload a clip or paste a source link. I’ll queue the source, generate clip candidates, and prepare the post copy for the connected account."
  }
];

export default function Page() {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [input, setInput] = useState("");
  const [source, setSource] = useState("");
  const [autoPublish, setAutoPublish] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("No file uploaded yet.");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("Ready");

  const sourceSummary = useMemo(() => {
    if (!source) {
      return "No source connected yet.";
    }

    return source.startsWith("http") ? source : `Local file: ${source}`;
  }, [source]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed) return;

    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setStatus("Thinking through the workflow...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages,
          source,
          autoPublish
        })
      });

      const data = (await response.json()) as { text?: string; mode?: string };
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            data.text ??
            "I’m ready, but I did not get a response from the assistant route."
        }
      ]);
      setStatus(data.mode === "openai" ? "Live AI response" : "Local assistant mode");
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? `Something broke while talking to the backend: ${error.message}`
              : "Something broke while talking to the backend."
        }
      ]);
      setStatus("Needs attention");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      const data = (await response.json()) as {
        url?: string;
        message?: string;
        name?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Upload failed.");
      }

      if (data.url) {
        setSource(data.url);
      }

      setUploadStatus(
        data.name ? `Ready: ${data.name}` : "Upload complete."
      );
    } catch (error) {
      setUploadStatus(
        error instanceof Error ? error.message : "Upload failed for an unknown reason."
      );
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Clip Operator</p>
        <h1 className="title">Upload one clip and let the pipeline do the rest.</h1>
        <p className="subtitle">
          The hosted app takes an MP4 or source link, stores it, prepares clips,
          writes copy, and hands the result to your connected publishing flow.
        </p>

        <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className={`chip ${source ? "on" : ""}`}>Source ready</div>
          <div className={`chip ${autoPublish ? "on" : ""}`}>Auto publish</div>
          <div className="chip">{status}</div>
        </div>

        <div className="message-list" aria-live="polite">
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <p className="message-role">{message.role}</p>
              <p className="message-body">{message.content}</p>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Example: make 5 clips from this source and post the strongest one."
          />

          <div className="toolbar">
            <div className="actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setAutoPublish((value) => !value)}
              >
                {autoPublish ? "Auto-publish on" : "Auto-publish off"}
              </button>
              <button type="submit" className="primary" disabled={isLoading}>
                {isLoading ? "Working..." : "Send to AI"}
              </button>
            </div>
            <div className="small">{sourceSummary}</div>
          </div>
        </form>
      </section>

      <aside className="sidebar">
        <div className="source-card">
          <h3>Source intake</h3>
          <p>Drop an MP4 here or paste a public source link.</p>
          <input
            className="source-input"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://youtube.com/watch?v=..."
          />
          <div style={{ height: 12 }} />
          <label className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span>{isUploading ? "Uploading..." : "Upload MP4"}</span>
            <input
              type="file"
              accept="video/mp4,video/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>
          <p className="small" style={{ marginTop: 10 }}>
            {uploadStatus}
          </p>
        </div>

        <div className="card">
          <h3>What happens next</h3>
          <p>
            The source is stored, exposed at a public file URL, and handed to the
            clip workflow so the publishing step can run without more setup from you.
          </p>
        </div>

        <div className="card">
          <h3>Deployment note</h3>
          <p>
            This site is ready to host. Live clipping and posting will use your
            connected API settings once they are present in the hosted environment.
          </p>
        </div>
      </aside>
    </main>
  );
}
