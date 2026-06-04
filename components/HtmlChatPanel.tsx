import { useEffect, useRef, useState } from "react";

export type HtmlChatScope = "active" | "all";

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

interface HtmlChatPanelProps {
  isOpen: boolean;
  activeSlideName?: string;
  canWriteBack: boolean;
  onClose: () => void;
  onOpenEditableFiles: () => void;
  onSend: (prompt: string, scope: HtmlChatScope) => Promise<string>;
}

const starterMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: 'Try commands like "set title to Workshop Demo" or "replace hero with showcase".',
  },
];

export function HtmlChatPanel({
  isOpen,
  activeSlideName,
  canWriteBack,
  onClose,
  onOpenEditableFiles,
  onSend,
}: HtmlChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<HtmlChatScope>("active");
  const [isSending, setIsSending] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isOpen]);

  if (!isOpen) {
    return null;
  }

  const submit = async () => {
    const text = prompt.trim();
    if (!text || isSending) return;

    setPrompt("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text }]);
    setIsSending(true);

    try {
      const response = await onSend(text, scope);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: response }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The edit request failed.";
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: message }]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <aside className="html-chat-panel" aria-label="HTML edit chat">
      <header className="html-chat-header">
        <div>
          <div className="html-chat-kicker">AI edit chat</div>
          <h2>Make HTML edits</h2>
        </div>
        <button type="button" className="html-chat-close" onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </header>

      <div className="html-chat-meta">
        <span>{activeSlideName ? `Editing ${activeSlideName}` : "No slide selected"}</span>
        <span className={canWriteBack ? "html-chat-state live" : "html-chat-state"}>
          {canWriteBack ? "Disk writes available" : "Read-only imports"}
        </span>
      </div>

      <div className="html-chat-messages">
        {messages.map((message) => (
          <article key={message.id} className={`html-chat-message ${message.role}`}>
            <span>{message.text}</span>
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="html-chat-controls">
        <label>
          <span>Scope</span>
          <select value={scope} onChange={(event) => setScope(event.target.value as HtmlChatScope)}>
            <option value="active">Active slide</option>
            <option value="all">All slides</option>
          </select>
        </label>
        <button type="button" className="html-chat-secondary" onClick={onOpenEditableFiles}>
          Open editable HTML
        </button>
      </div>

      <div className="html-chat-prompt">
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder='How can I help you today?'
          rows={4}
        />
        <button type="button" className="html-chat-send" onClick={submit} disabled={isSending}>
          {isSending ? "Applying..." : "Send edit"}
        </button>
      </div>
    </aside>
  );
}
