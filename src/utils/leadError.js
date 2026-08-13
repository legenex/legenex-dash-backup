// Extract the real failure reason for a lead with final_status === 'Error'.
// Returns a short human-readable string pulled from the lead's stored fields,
// optionally enriched with a related ErrorLog entry.
//
// Priority:
//  1. LeadByte rejection / response message (if leadbyte_response has records[0].response
//     or a top-level message)  -> "LeadByte: <msg>"
//  2. HLR error (hlr_error field)                                   -> "HLR: <msg>"
//  3. Related ErrorLog message (if provided)                        -> "<Stage>: <msg>"
//  4. Generic fallback using error_stage                           -> "<Stage> error"
export function getLeadErrorReason(lead, errorLogEntry) {
  if (!lead) return 'Unknown error';

  const stageLabel = (lead.error_stage || (errorLogEntry?.stage) || '').toString();

  // 1. LeadByte response
  let lbMessage = '';
  try {
    const lb = typeof lead.leadbyte_response === 'string'
      ? JSON.parse(lead.leadbyte_response || '{}')
      : (lead.leadbyte_response || {});
    if (lb && typeof lb === 'object') {
      const rec = Array.isArray(lb.records) && lb.records.length > 0 ? lb.records[0] : null;
      const recResponse = rec?.response;
      if (recResponse && typeof recResponse === 'object') {
        lbMessage = recResponse.message || recResponse.reason || recResponse.error || '';
      }
      if (!lbMessage && rec) {
        lbMessage = rec.response_message || rec.error || rec.message || '';
      }
      if (!lbMessage && lb.message) {
        lbMessage = lb.message;
      }
      // If the records[0].status itself is an error/rejection status, surface it
      if (!lbMessage && rec?.status && rec.status !== 'Approved' && rec.status !== 'Success') {
        lbMessage = `status: ${rec.status}`;
      }
    }
  } catch {}

  if (lbMessage) {
    return `LeadByte: ${lbMessage}`;
  }

  // 2. HLR error
  if (lead.hlr_error) {
    return `HLR: ${lead.hlr_error}`;
  }

  // 3. Related ErrorLog entry
  if (errorLogEntry && errorLogEntry.message) {
    const stg = (errorLogEntry.stage || stageLabel || '').toString();
    return stg ? `${stg}: ${errorLogEntry.message}` : errorLogEntry.message;
  }

  // 4. Fallback to stage
  const prettyStage = stageLabel ? stageLabel.charAt(0).toUpperCase() + stageLabel.slice(1) : '';
  return prettyStage ? `${prettyStage} error` : 'Processing error';
}