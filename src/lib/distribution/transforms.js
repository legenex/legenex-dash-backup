// Synchronous field-mapping transforms for outbound payload building. Pure.
export function applyTransform(value, transform) {
  const s = value == null ? '' : String(value);
  switch (transform) {
    case 'lowercase': return s.toLowerCase();
    case 'uppercase': return s.toUpperCase();
    case 'trim': return s.trim();
    case 'digits': return s.replace(/\D/g, '');
    case 'phone_us': {
      let d = s.replace(/\D/g, '');
      if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
      return d.length === 10 ? '1' + d : d;
    }
    default: return value;
  }
}
