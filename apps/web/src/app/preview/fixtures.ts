// Dev-only preview fixtures. Synthetic content modeled on real entries so the
// redesign can be exercised without a live Convex deployment. Never shipped:
// the /preview route group 404s in production (see layout.tsx).

import type {
  PublicEntryPageData,
  PublicEntryRelation,
  PublicEntrySense,
  PublicSenseProvenance,
} from '@/lib/publicEntryPage';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-30T12:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

function provenance(
  senseId: string,
  input: {
    id: string;
    sourceName: string;
    docTitle: string | null;
    url: string;
    contentMode: PublicSenseProvenance['contentMode'];
    licenseNote?: string;
    attributionText?: string;
    accessedDaysAgo?: number;
  },
): PublicSenseProvenance {
  return {
    entityId: senseId,
    contentMode: input.contentMode,
    citation: {
      id: input.id,
      sourceId: `src-${input.sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      url: input.url,
      source: { name: input.sourceName },
      sourceDocument: { title: input.docTitle },
      licenseNote: input.licenseNote ?? null,
      attributionText: input.attributionText ?? null,
      accessedAt: daysAgo(input.accessedDaysAgo ?? 21),
    },
  };
}

function relation(
  input: {
    id: string;
    relationshipType: 'RELATED' | 'SEE_ALSO';
    entryType: 'TERM' | 'ACRONYM';
    displayTitle: string;
    primarySlug: string;
    summaryText: string;
  },
): PublicEntryRelation {
  return {
    id: input.id,
    relationshipType: input.relationshipType,
    weight: 1,
    otherEntry: {
      id: `entry-${input.primarySlug}`,
      entryType: input.entryType,
      displayTitle: input.displayTitle,
      primarySlug: input.primarySlug,
      summaryText: input.summaryText,
      updatedAt: daysAgo(30),
      publishedAt: daysAgo(200),
    },
  };
}

function buildData(input: {
  entry: PublicEntryPageData['entry'];
  provenance: PublicSenseProvenance[];
  related?: PublicEntryRelation[];
  seeAlso?: PublicEntryRelation[];
  standsForPrimary?: { primary: string | null; alternates: string[] };
  alsoKnownAs?: string[];
}): PublicEntryPageData {
  const provenanceBySenseId = new Map<string, PublicSenseProvenance[]>();
  for (const item of input.provenance) {
    const list = provenanceBySenseId.get(item.entityId) ?? [];
    list.push(item);
    provenanceBySenseId.set(item.entityId, list);
  }

  const related = input.related ?? [];
  const seeAlso = input.seeAlso ?? [];
  const otherSummaryById = new Map<string, string | null>();
  for (const rel of [...related, ...seeAlso]) {
    otherSummaryById.set(rel.otherEntry.id, rel.otherEntry.summaryText);
  }

  return {
    entry: input.entry,
    related,
    seeAlso,
    otherSummaryById,
    provenanceBySenseId,
    tocItems: input.entry.senses.map((sense) => ({
      id: sense.id,
      label: sense.senseLabel ?? `Sense ${sense.senseOrder + 1}`,
    })),
    standsForPrimary: input.standsForPrimary ?? { primary: null, alternates: [] },
    alsoKnownAs: input.alsoKnownAs ?? [],
  };
}

/** Acronym with three colliding senses — the core disambiguation scenario. */
export const socFixture: PublicEntryPageData = buildData({
  entry: {
    id: 'entry-soc',
    displayTitle: 'SOC',
    summaryMd: null,
    summaryText:
      'Overloaded acronym: most commonly a security operations center, but also SOC 2 audit reports and system-on-chip hardware.',
    updatedAt: daysAgo(3),
    entryTags: [
      { tag: { id: 'tag-ops', name: 'Security operations', slug: 'security-operations' } },
      { tag: { id: 'tag-grc', name: 'Governance & compliance', slug: 'governance-compliance' } },
    ],
    variants: [
      { variantText: 'Security Operations Center' },
      { variantText: 'System and Organization Controls' },
      { variantText: 'System on a Chip' },
      { variantText: 'S.O.C.' },
    ],
    senses: [
      {
        id: 'sense-soc-1',
        senseOrder: 0,
        senseLabel: null,
        expandedForm: 'Security Operations Center',
        definitionMd:
          'A centralized function or team that continuously monitors, detects, analyzes, and responds to cybersecurity incidents across an organization.\n\nA SOC typically combines analysts across tiers, detection tooling (SIEM, EDR), and documented response procedures. The term can refer to the team, the physical or virtual facility, or both.',
        definitionText: null,
        examples: [
          {
            id: 'ex-soc-1',
            exampleMd: null,
            exampleText:
              'Escalate the alert to the SOC if the endpoint cannot be isolated within 15 minutes.',
          },
        ],
      },
      {
        id: 'sense-soc-2',
        senseOrder: 1,
        senseLabel: null,
        expandedForm: 'System and Organization Controls',
        definitionMd:
          'A suite of audit reports (SOC 1, SOC 2, SOC 3) defined by the AICPA for reporting on controls at a service organization.\n\n**SOC 2** reports on controls relevant to security, availability, processing integrity, confidentiality, and privacy — the *Trust Services Criteria*.',
        definitionText: null,
        examples: [
          {
            id: 'ex-soc-2',
            exampleMd: null,
            exampleText: 'The vendor provided a SOC 2 Type II report covering the trailing 12 months.',
          },
        ],
      },
      {
        id: 'sense-soc-3',
        senseOrder: 2,
        senseLabel: null,
        expandedForm: 'System on a Chip',
        definitionMd:
          'An integrated circuit that consolidates most components of a computer — CPU, memory, I/O, and often radios — onto a single die. Relevant to security in the context of hardware roots of trust, secure enclaves, and firmware attack surface.',
        definitionText: null,
        examples: [],
      },
    ],
  },
  provenance: [
    provenance('sense-soc-1', {
      id: 'cit-soc-1a',
      sourceName: 'NIST CSRC Glossary',
      docTitle: 'security operations center (SOC)',
      url: 'https://csrc.nist.gov/glossary/term/security_operations_center',
      contentMode: 'PARAPHRASED',
      licenseNote: 'U.S. Government work; not subject to copyright in the United States.',
      accessedDaysAgo: 14,
    }),
    provenance('sense-soc-1', {
      id: 'cit-soc-1b',
      sourceName: 'CISA',
      docTitle: 'Security Operations Center (SOC) services',
      url: 'https://www.cisa.gov/resources-tools/services/security-operations-center-soc',
      contentMode: 'SUMMARIZED',
      accessedDaysAgo: 14,
    }),
    provenance('sense-soc-2', {
      id: 'cit-soc-2a',
      sourceName: 'AICPA',
      docTitle: 'SOC 2 — SOC for Service Organizations: Trust Services Criteria',
      url: 'https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2',
      contentMode: 'SUMMARIZED',
      attributionText: 'Content summarized from AICPA published criteria.',
      accessedDaysAgo: 30,
    }),
  ],
  related: [
    relation({
      id: 'rel-1',
      relationshipType: 'RELATED',
      entryType: 'ACRONYM',
      displayTitle: 'SIEM',
      primarySlug: 'siem',
      summaryText:
        'Security information and event management: aggregation and correlation of security telemetry for detection and investigation.',
    }),
    relation({
      id: 'rel-2',
      relationshipType: 'RELATED',
      entryType: 'TERM',
      displayTitle: 'incident response',
      primarySlug: 'incident-response',
      summaryText:
        'The organized approach to preparing for, detecting, containing, and recovering from security incidents.',
    }),
  ],
  seeAlso: [
    relation({
      id: 'rel-3',
      relationshipType: 'SEE_ALSO',
      entryType: 'ACRONYM',
      displayTitle: 'NOC',
      primarySlug: 'noc',
      summaryText: 'Network operations center: the availability-focused counterpart of a SOC.',
    }),
  ],
  standsForPrimary: {
    primary: 'Security Operations Center',
    alternates: ['System and Organization Controls', 'System on a Chip'],
  },
  alsoKnownAs: ['S.O.C.'],
});

/** Term with a single sense whose summary duplicates the definition — the triplication case. */
export const defaultCredentialsFixture: PublicEntryPageData = buildData({
  entry: {
    id: 'entry-default-credentials',
    displayTitle: 'default credentials',
    summaryMd: null,
    summaryText:
      'Manufacturer-set usernames and passwords that ship with a device or application and are frequently left unchanged, giving adversaries a well-known way in.',
    updatedAt: daysAgo(1),
    entryTags: [
      { tag: { id: 'tag-access', name: 'Access control', slug: 'access-control' } },
    ],
    variants: [{ variantText: 'factory credentials' }],
    senses: [
      {
        id: 'sense-dc-1',
        senseOrder: 0,
        senseLabel: null,
        expandedForm: null,
        definitionMd:
          'Manufacturer-set usernames and passwords that ship with a device or application and are frequently left unchanged, giving adversaries a well-known way in.\n\nDefault credentials are normally documented in an instruction manual that is either packaged with the device or published online. Adversaries may leverage default credentials that have not been properly modified or disabled, and some devices ship with credentials that *cannot* be changed.',
        definitionText: null,
        examples: [
          {
            id: 'ex-dc-1',
            exampleMd: null,
            exampleText:
              'The ICS assessment found four PLCs still reachable with vendor default credentials.',
          },
        ],
      },
    ],
  },
  provenance: [
    provenance('sense-dc-1', {
      id: 'cit-dc-1',
      sourceName: 'MITRE ATT&CK',
      docTitle: 'Default Credentials (ICS)',
      url: 'https://attack.mitre.org/techniques/T0812/',
      contentMode: 'QUOTED',
      licenseNote:
        'MITRE ATT&CK® content used under the Terms of Use; © 2026 The MITRE Corporation.',
      attributionText: 'MITRE ATT&CK (ICS, CTI STIX data).',
      accessedDaysAgo: 7,
    }),
  ],
});

/** Long entry: many senses, exercises the TOC rail and sense numbering. */
export const shellFixture: PublicEntryPageData = (() => {
  const topics: Array<[string, string]> = [
    ['command interpreter', 'A program that exposes an operating system’s services to a user or script, e.g. `bash`, `zsh`, or `cmd.exe`.'],
    ['reverse shell', 'A shell session initiated from the target outward to an attacker-controlled listener, bypassing inbound filtering.'],
    ['bind shell', 'A shell bound to a listening port on the target that an attacker connects to directly.'],
    ['web shell', 'A script planted on a web server that gives an attacker remote command execution through HTTP requests.'],
    ['shellcode', 'A small self-contained payload, historically one that spawned a shell, injected and executed during exploitation.'],
    ['shell company', 'In fraud investigations: a legal entity without active operations used to obscure ownership or move funds.'],
    ['restricted shell', 'A shell configured to limit the commands and paths available to a session, used as a coarse containment control.'],
    ['login shell', 'The first shell process started for an interactive session; reads login-time initialization files.'],
    ['subshell', 'A child shell spawned to evaluate an expression or run a group of commands in isolation.'],
    ['shell escape', 'Breaking out of a constrained program (editor, pager, application menu) into an underlying shell.'],
    ['secure shell', 'See SSH: the protocol suite for encrypted remote login and command execution.'],
    ['shell history', 'The record of commands entered in a shell session; a common source of credentials in post-exploitation.'],
  ];
  return buildData({
    entry: {
      id: 'entry-shell',
      displayTitle: 'shell',
      summaryMd: null,
      summaryText:
        'One of the most overloaded words in computing: a command interpreter, a class of attack payloads, and several derived phrases.',
      updatedAt: daysAgo(12),
      entryTags: [
        { tag: { id: 'tag-fund', name: 'Fundamentals', slug: 'fundamentals' } },
        { tag: { id: 'tag-post', name: 'Post-exploitation', slug: 'post-exploitation' } },
      ],
      variants: [],
      senses: topics.map(([label, definition], index): PublicEntrySense => ({
        id: `sense-shell-${index + 1}`,
        senseOrder: index,
        senseLabel: label,
        expandedForm: null,
        definitionMd: definition,
        definitionText: null,
        examples: [],
      })),
    },
    provenance: [
      provenance('sense-shell-2', {
        id: 'cit-shell-2',
        sourceName: 'NIST CSRC Glossary',
        docTitle: 'reverse shell',
        url: 'https://csrc.nist.gov/glossary',
        contentMode: 'PARAPHRASED',
        licenseNote: 'U.S. Government work; not subject to copyright in the United States.',
      }),
    ],
  });
})();

/** Rows for list/browse previews (used from Phase 4 on). */
export const browseRowsFixture = [
  {
    id: 'row-1',
    entryType: 'TERM' as const,
    displayTitle: 'default credentials',
    primarySlug: 'default-credentials',
    summaryText:
      'Manufacturer-set usernames and passwords that ship with a device or application and are frequently left unchanged.',
    updatedAt: daysAgo(1),
    publishedAt: daysAgo(90),
    tags: [{ id: 'tag-access', name: 'Access control', slug: 'access-control' }],
  },
  {
    id: 'row-2',
    entryType: 'ACRONYM' as const,
    displayTitle: 'SOC',
    primarySlug: 'soc',
    summaryText:
      'Overloaded acronym: most commonly a security operations center, but also SOC 2 audit reports and system-on-chip hardware.',
    updatedAt: daysAgo(3),
    publishedAt: daysAgo(300),
    tags: [{ id: 'tag-ops', name: 'Security operations', slug: 'security-operations' }],
  },
  {
    id: 'row-3',
    entryType: 'TERM' as const,
    displayTitle: 'shell',
    primarySlug: 'shell',
    summaryText:
      'One of the most overloaded words in computing: a command interpreter, a class of attack payloads, and several derived phrases.',
    updatedAt: daysAgo(12),
    publishedAt: daysAgo(400),
    tags: [{ id: 'tag-fund', name: 'Fundamentals', slug: 'fundamentals' }],
  },
  {
    id: 'row-4',
    entryType: 'ACRONYM' as const,
    displayTitle: 'KEK',
    primarySlug: 'kek',
    summaryText: 'Key encryption key: a key whose sole purpose is to encrypt other keys.',
    updatedAt: daysAgo(20),
    publishedAt: daysAgo(500),
    tags: [],
  },
  {
    id: 'row-5',
    entryType: 'TERM' as const,
    displayTitle: 'classified',
    primarySlug: 'classified',
    summaryText:
      'Information formally required by a security policy to receive data confidentiality service and to be marked with a security label.',
    updatedAt: daysAgo(25),
    publishedAt: daysAgo(600),
    tags: [{ id: 'tag-grc', name: 'Governance & compliance', slug: 'governance-compliance' }],
  },
] satisfies Array<{
  id: string;
  entryType: 'TERM' | 'ACRONYM';
  displayTitle: string;
  primarySlug: string;
  summaryText: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
  tags: Array<{ id: string; name: string; slug: string }>;
}>;
