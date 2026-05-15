import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          background: "#080808",
          minHeight: "100vh",
          color: "#f0ede8",
          fontFamily: "monospace",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: "rgba(244,67,54,0.1)",
            border: "1px solid rgba(244,67,54,0.4)",
            borderRadius: 10,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div style={{ color: "#f44336", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
            Dashboard error — please share this with support
          </div>
          <div style={{ color: "#f44336", fontSize: 13, wordBreak: "break-all" }}>
            {error.message}
          </div>
        </div>
        <pre
          style={{
            background: "#111",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: 16,
            fontSize: 11,
            color: "#888",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            overflowY: "auto",
            maxHeight: "60vh",
          }}
        >
          {error.stack}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            marginTop: 20,
            background: "#E8C547",
            color: "#080808",
            border: "none",
            borderRadius: 8,
            padding: "12px 24px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
