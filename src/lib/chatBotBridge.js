// Lightweight event-based bridge so any component can open the DataBot widget
// with a pre-filled question (e.g. "Ask AI" / "Explain variance" buttons).
// The DataBotWidget listens for 'databot-open' events and auto-sends the
// provided question.

export function openDataBotWithQuestion(question) {
  window.dispatchEvent(new CustomEvent('databot-open', { detail: { question } }));
}