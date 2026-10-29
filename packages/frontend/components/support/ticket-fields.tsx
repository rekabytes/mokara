import { SupportSelect } from "@/components/support/SupportSelect";
/** Shared customer fields keep the real ticket form and setup preview in sync. */
export function TicketRequestFields() {
  return (
    <>
      <div className="support-grid">
        <label className="support-field">
          Request type
          <SupportSelect name="request_type">
            <option>Report a bug</option>
            <option>Request a feature</option>
            <option>Billing</option>
            <option>Other</option>
          </SupportSelect>
        </label>
        <label className="support-field">
          Affected area
          <input name="area" required maxLength={100} placeholder="e.g. Orders or account" />
        </label>
      </div>
      <label className="support-field">
        Subject
        <input
          name="subject"
          required
          maxLength={200}
          placeholder="A short summary of your request"
        />
      </label>
      <label className="support-field">
        Details
        <textarea
          name="details"
          required
          maxLength={10000}
          placeholder="What happened, and what did you expect?"
        />
        <span className="support-muted">
          Include the steps that help us understand your request. Never include passwords or payment
          details.
        </span>
      </label>
    </>
  );
}

export function TicketContactFields() {
  return (
    <div className="support-grid">
      <label className="support-field">
        Your name
        <input name="customer_name" autoComplete="name" required maxLength={100} />
      </label>
      <label className="support-field">
        Email address
        <input name="customer_email" type="email" autoComplete="email" required maxLength={254} />
        <span className="support-muted">Used only for ticket updates.</span>
      </label>
    </div>
  );
}
