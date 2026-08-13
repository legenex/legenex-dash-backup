# Fields declared here but not in the primary app

Three fields exist on live records in the primary Legenex dashboard app without
appearing in that app's entity schemas. Base44 drops undeclared fields on write,
so the mirror silently lost them until they were declared here:

| Entity | Field | Records affected at time of migration |
| --- | --- | --- |
| `AdSpendMapping` | `supplier_id` | 230 |
| `Lead` | `archived_reason` | 99 |
| `BuyerOnboarding` | `token` | 3 |

They are declared as optional strings in this app only. The primary app is
untouched. Worth fixing upstream too: any code in the primary that reads these
fields is depending on data the schema does not guarantee.
