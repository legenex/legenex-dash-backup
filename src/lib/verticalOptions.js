// Vertical option lists, in one place so every filter agrees.
//
// The whole app displays the short code (MVA, WC) in tables, badges and lead
// details. A filter that shows "Motor Vehicle Accidents" while the column next
// to it shows "MVA" reads as two different things and blows out the control
// width, so filters use the code and only the code.
//
// Assignment pickers are different: choosing a vertical for a new buyer or key
// benefits from the full name, so those get "MVA - Motor Vehicle Accidents".

const code = (v) => v?.code || v?.name || v?.id || '';

// For filters. Label is the short code.
export function verticalFilterOptions(verticals = []) {
  return (verticals || [])
    .map((v) => ({ value: code(v), label: code(v) }))
    .filter((o) => o.value);
}

// For assignment pickers. Code first so it still sorts and scans by code.
export function verticalPickerOptions(verticals = []) {
  return (verticals || [])
    .map((v) => {
      const c = code(v);
      const name = v?.name && v.name !== c ? ` - ${v.name}` : '';
      return { value: c, label: `${c}${name}` };
    })
    .filter((o) => o.value);
}
