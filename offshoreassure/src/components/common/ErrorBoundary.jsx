import { Component } from 'react';

/* Keeps the shell usable if a page fails to render (e.g. an unusual uploaded contract). */
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card empty">
        <h2 className="serif" style={{ fontSize: 22 }}>This page could not be displayed</h2>
        <p className="note" style={{ maxWidth: '52ch' }}>The prototype could not render this view from the current data. Use the assurance path or the sidebar to continue, or Reset demo to start again.</p>
      </div>
    );
  }
}
