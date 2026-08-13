// Disposition taxonomy shared by the buyer feedback dropdown, the operator
// lead detail view, reporting, and the AI matcher (feedback webhook).
// Each entry: { value, description }.
export const DISPOSITIONS = [
  { value: 'At Fault', description: 'Lead was at fault or the matter is criminal.' },
  { value: 'Attorney Rejected', description: 'An attorney reviewed and rejected the case.' },
  { value: 'Already Settled', description: 'The claim was already settled.' },
  { value: 'Chase', description: 'Still working the lead / follow-up in progress.' },
  { value: 'Converted', description: 'Attorney signed the client, a win.' },
  { value: 'Denied', description: 'The claim or case was denied.' },
  { value: 'Do Not Call', description: 'Lead asked not to be contacted.' },
  { value: 'Duplicate', description: 'Duplicate of a lead already received.' },
  { value: 'Faux Lead', description: 'Fake / fraudulent lead.' },
  { value: 'Has Attorney', description: 'Lead already has an attorney.' },
  { value: 'Lost Contact', description: 'Contact was made but then lost.' },
  { value: 'Minor', description: 'Lead is a minor.' },
  { value: 'No Damages', description: 'No damages present in the case.' },
  { value: 'New Lead', description: 'Fresh lead, not yet worked.' },
  { value: 'No Contact', description: 'Could not reach the lead at all.' },
  { value: 'No Injury', description: 'No injury sustained.' },
  { value: 'No Insurance', description: 'No applicable insurance coverage.' },
  { value: 'No Liability', description: 'No clear liable party.' },
  { value: 'No Treatment', description: 'Lead did not seek medical treatment.' },
  { value: 'Not Interested', description: 'Lead is not interested in proceeding.' },
  { value: 'Other', description: 'Does not fit any other disposition.' },
  { value: 'Past SOL', description: 'Past the statute of limitations.' },
  { value: 'Referred', description: 'Referred out to another firm.' },
  { value: 'Wrong Law Type', description: 'Case is the wrong practice/law type.' },
  { value: 'Wrong Number', description: 'Phone number was wrong or disconnected.' },
];

export const DISPOSITION_VALUES = DISPOSITIONS.map(d => d.value);

// Dispositions that indicate a positive/converted outcome (for summaries).
export const POSITIVE_DISPOSITIONS = ['Converted'];