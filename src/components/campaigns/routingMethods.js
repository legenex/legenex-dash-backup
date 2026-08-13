// Shared routing-method definitions for the campaign Routing tab and Hybrid
// group selectors. These are UI-only labels and explainers. They map onto the
// existing RouteGroup.method enum WITHOUT ever exposing the raw engine enum
// values "auction" or "hybrid" in the UI. "Hybrid" here is a campaign-level
// SHAPE (multiple groups), not the engine "hybrid" method value.
//
// No em dashes anywhere. Semantic tokens only in the consuming components.

// Campaign-level routing method (the shape of the whole campaign's routing).
export const CAMPAIGN_METHODS = [
  {
    value: 'all',
    label: 'All',
    disabled: true,
    tooltip:
      'Delivers every lead to all eligible deliveries simultaneously. Best when buyers accept shared leads.',
  },
  {
    value: 'waterfall',
    label: 'Waterfall',
    tooltip:
      'Also called priority. Tries deliveries in order, top to bottom. Each lead goes to the first delivery that accepts. Best when one delivery should always get first look.',
  },
  {
    value: 'round_robin',
    label: 'Round Robin',
    tooltip:
      'Rotates through eligible deliveries. Each new lead starts with the next delivery in line; if it rejects or fails, the lead falls through to the rest of the rotation. Weights let one delivery take a larger share. Best for splitting volume fairly.',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    tooltip:
      'Groups deliveries into ordered tiers. Each group runs its own method (priority, weighted, or round robin). If a lead remains unsold after a group, it falls through to the next group.',
  },
];

// Group-level method (used inside a Hybrid campaign, one method per group).
// Maps directly onto the RouteGroup.method engine enum.
export const GROUP_METHODS = [
  {
    value: 'priority',
    label: 'Priority',
    tooltip:
      'Also called waterfall. Tries deliveries in order, top to bottom. Each lead goes to the first delivery that accepts. Best when one delivery should always get first look.',
  },
  {
    value: 'weighted',
    label: 'Weighted',
    tooltip:
      'Splits volume by weight. Each delivery takes a share proportional to its weight. Best for splitting volume by a fixed ratio.',
  },
  {
    value: 'round_robin',
    label: 'Round Robin',
    tooltip:
      'Rotates through eligible deliveries. Each new lead starts with the next delivery in line; if it rejects or fails, the lead falls through to the rest of the rotation. Best for splitting volume fairly.',
  },
];

// Derive the campaign-level routing method (the shape) from the campaign's
// RouteGroups. More than one active group means Hybrid. One group maps to its
// method: priority => Waterfall, round_robin => Round Robin. Anything else
// (weighted, engine hybrid) also reads as Hybrid at the campaign level.
export function deriveCampaignMethod(groups) {
  const gs = (groups || []).filter((g) => g && g.lifecycle !== 'archived');
  if (gs.length > 1) return 'hybrid';
  const single = gs[0];
  if (!single) return 'waterfall';
  if (single.method === 'round_robin') return 'round_robin';
  if (single.method === 'priority') return 'waterfall';
  return 'hybrid';
}