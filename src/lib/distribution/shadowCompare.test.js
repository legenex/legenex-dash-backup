import { describe, it, expect } from 'vitest';
import { compareDecision, summarizeComparisons, COMPARE } from './shadowCompare.js';

const routed = (over) => ({ routed: true, buyerId: 'B1', destinationId: 'D1', price: 10, status: 'sold', ...over });

describe('compareDecision full taxonomy (one test per category)', () => {
  it('exact match (both routed identically)', () => {
    expect(compareDecision(routed(), { ...routed() }).category).toBe(COMPARE.EXACT_MATCH);
  });
  it('exact match (both declined)', () => {
    expect(compareDecision({ routed: false }, { routed: false }).category).toBe(COMPARE.EXACT_MATCH);
  });
  it('buyer mismatch', () => {
    expect(compareDecision(routed(), routed({ buyerId: 'B2' })).category).toBe(COMPARE.BUYER_MISMATCH);
  });
  it('destination mismatch (same buyer)', () => {
    expect(compareDecision(routed(), routed({ destinationId: 'D2' })).category).toBe(COMPARE.DESTINATION_MISMATCH);
  });
  it('price mismatch (same buyer + destination)', () => {
    expect(compareDecision(routed(), routed({ price: 25 })).category).toBe(COMPARE.PRICE_MISMATCH);
  });
  it('status mismatch (same buyer + destination + price)', () => {
    expect(compareDecision(routed(), routed({ status: 'unsold' })).category).toBe(COMPARE.STATUS_MISMATCH);
  });
  it('legacy only', () => {
    expect(compareDecision(routed(), { routed: false }).category).toBe(COMPARE.LEGACY_ONLY);
  });
  it('native only', () => {
    expect(compareDecision({ routed: false }, routed()).category).toBe(COMPARE.NATIVE_ONLY);
  });
  it('qualification mismatch (legacy routed, native excluded on qualification)', () => {
    expect(compareDecision(routed(), { routed: false, legacyBuyerExcludedReason: 'QUALIFICATION_FAILED' }).category)
      .toBe(COMPARE.QUALIFICATION_MISMATCH);
  });
  it('configuration error', () => {
    expect(compareDecision(routed(), { configError: true }).category).toBe(COMPARE.CONFIGURATION_ERROR);
  });
  it('evaluation error', () => {
    expect(compareDecision(routed(), { evalError: true }).category).toBe(COMPARE.EVALUATION_ERROR);
  });
});

describe('summarizeComparisons', () => {
  it('counts categories and computes discrepancy rate', () => {
    const pairs = [
      { legacy: routed(), native: routed() },                        // exact
      { legacy: routed(), native: routed({ buyerId: 'B2' }) },       // buyer mismatch
      { legacy: routed(), native: { routed: false } },               // legacy only
      { legacy: { routed: false }, native: routed() },               // native only
    ];
    const s = summarizeComparisons(pairs);
    expect(s.total).toBe(4);
    expect(s.agreements).toBe(1);
    expect(s.discrepancies).toBe(3);
    expect(s.discrepancyRate).toBe(0.75);
    expect(s.counts[COMPARE.BUYER_MISMATCH]).toBe(1);
  });
});
