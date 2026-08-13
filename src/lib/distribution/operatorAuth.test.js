import { describe, it, expect } from 'vitest';
import { isOperator } from './operatorAuth.js';

describe('isOperator (deny-by-default)', () => {
  it('rejects unauthenticated, buyer, supplier, and linked portal accounts', () => {
    expect(isOperator(null)).toBe(false);
    expect(isOperator({ base_role: 'buyer' })).toBe(false);
    expect(isOperator({ base_role: 'supplier' })).toBe(false);
    expect(isOperator({ linked_buyer_id: 'B1' })).toBe(false);
    expect(isOperator({ linked_supplier_id: 'S1' })).toBe(false);
  });
  it('allows admin and managers holding an operator permission', () => {
    expect(isOperator({ role: 'admin' })).toBe(true);
    expect(isOperator({ base_role: 'manager', permissions: { distribution: true } })).toBe(true);
    expect(isOperator({ base_role: 'manager', permissions: '{"reports":true}' })).toBe(true);
  });
  it('rejects a manager with no operator permission', () => {
    expect(isOperator({ base_role: 'manager', permissions: {} })).toBe(false);
  });
});
