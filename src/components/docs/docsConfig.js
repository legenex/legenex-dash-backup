// Central registry of documentation sections.
// Each entry: { slug, title, group, Component }, the DocsLayout sidebar and
// the router both read from this single source of truth.
import Overview from '@/pages/docs/Overview';
import Authentication from '@/pages/docs/Authentication';
import PostLead from '@/pages/docs/PostLead';
import FieldDictionary from '@/pages/docs/FieldDictionary';
import ResponseReference from '@/pages/docs/ResponseReference';
import FeedbackReturns from '@/pages/docs/FeedbackReturns';
import ReportingApi from '@/pages/docs/ReportingApi';
import Postbacks from '@/pages/docs/Postbacks';
import ErrorsRateLimits from '@/pages/docs/ErrorsRateLimits';
import Versioning from '@/pages/docs/Versioning';
import Guides from '@/pages/docs/Guides';

export const DOCS_SECTIONS = [
  { group: 'Getting Started', items: [
    { slug: '', title: 'Overview & Quickstart', Component: Overview },
    { slug: 'authentication', title: 'Authentication', Component: Authentication },
  ]},
  { group: 'API Reference', items: [
    { slug: 'post-a-lead', title: 'Post a Lead', Component: PostLead },
    { slug: 'field-dictionary', title: 'Field Dictionary', Component: FieldDictionary },
    { slug: 'response-reference', title: 'Response Reference', Component: ResponseReference },
    { slug: 'feedback-returns', title: 'Feedback & Returns', Component: FeedbackReturns },
    { slug: 'reporting', title: 'Reporting API', Component: ReportingApi },
    { slug: 'postbacks', title: 'Postbacks & Webhooks', Component: Postbacks },
    { slug: 'errors', title: 'Errors & Rate Limits', Component: ErrorsRateLimits },
    { slug: 'versioning', title: 'Versioning & Changelog', Component: Versioning },
  ]},
  { group: 'Guides', items: [
    { slug: 'guides', title: 'Guides', Component: Guides },
  ]},
];

// Flat list for routing.
export const DOCS_ROUTES = DOCS_SECTIONS.flatMap(g => g.items);