# Cybersecurity taxonomy anchors for SynAc tags

Date: 2026-08-03

Wayfinder ticket: [#185](https://github.com/amanthanvi/synac/issues/185)

## Question

Which primary cybersecurity knowledge structures are suitable evidence for conservatively evolving SynAc's current eight topical tags? Where does the current taxonomy have coverage gaps or misleading overlaps, and which dimensions should not be promoted into entry-level topics?

## Answer

No primary framework should be copied wholesale into SynAc. The frameworks model different things: organizational outcomes, control families, adversary behavior, secure-development practices, application risks, privacy outcomes, incident response, or workforce roles. They are most useful as independent coverage and boundary checks for a small, flat, multi-label topical taxonomy.

The evidence supports this conservative working direction:

- Retain `access-control`, `cryptography`, `network-security`, `malware`, and `incident-response`, with sharper inclusion and exclusion rules.
- Do not freeze the current contracts for `threat-intelligence`, `vulnerability-management`, or `protocols`. Their names and descriptions disagree about what they classify or mix a topic with an object type.
- Send four additions to corpus prevalence testing and human grilling: **risk and governance**, **privacy and data protection**, **supply-chain security**, and **physical and environmental security**. The frameworks treat each as a distinct concern, and SynAc contains concrete uncovered examples.
- Keep **secure software/application security**, **digital forensics**, and **social engineering** as candidate subtopics or explicit inclusion areas until adjudication proves that a separate public tag can reach 25 accepted entries without weakening boundaries.
- Do not turn lifecycle functions, ATT&CK tactics, workforce roles, sources, entry types, platforms, or audience levels into topical tags.

These are research directions, not a frozen taxonomy. Slug migrations, exact names, inclusion rules, exclusions, hard negatives, co-occurrences, and publication decisions belong in the blocked taxonomy-contract grilling ticket.

## Method and evidence boundary

### Primary-source facts

Only specifications and first-party framework documentation from NIST, MITRE, and OWASP were used as external evidence:

| Structure | What its owner says it models | Proper use for SynAc | Misuse to avoid |
| --- | --- | --- | --- |
| [NIST Cybersecurity Framework 2.0](https://doi.org/10.6028/NIST.CSWP.29) | Cybersecurity outcomes arranged as Functions, Categories, and Subcategories. The six Functions are Govern, Identify, Protect, Detect, Respond, and Recover; their order does not imply a sequence. | Broad gap analysis and vocabulary for outcomes such as risk assessment, identity and access, data security, monitoring, incident management, and recovery. | Copying Functions as entry topics or treating them as an attack lifecycle. |
| [NIST SP 800-53 Rev. 5](https://doi.org/10.6028/NIST.SP.800-53r5) | Security and privacy controls grouped into 20 topic-related families. The catalog includes access control, identification and authentication, incident response, physical protection, risk assessment, PII processing, and supply-chain risk management. | Coverage checklist and evidence that several missing concerns have stable, independently defined bodies of material. | Treating every control family as a public tag; many families describe governance or control programs rather than glossary topics. |
| [NIST Privacy Framework 1.0](https://doi.org/10.6028/NIST.CSWP.01162020) | Privacy-risk outcomes organized under Identify-P, Govern-P, Control-P, Communicate-P, and Protect-P. NIST distinguishes privacy risks arising from data processing from cybersecurity-related privacy events. | Boundary evidence that privacy is not reducible to confidentiality, cryptography, or access control. | Using privacy Functions as topical tags or assigning every security concept a privacy tag merely because it can affect personal data. |
| [MITRE ATT&CK](https://attack.mitre.org/resources/) | Observed adversary behavior. Tactics express why an adversary acts, techniques express how, and platforms/domains describe where behavior occurs. | Positive and hard-negative anchors for adversary behavior, TTPs, malware use, and social engineering. | Calling every ATT&CK technique “threat intelligence,” or turning tactics/platforms into SynAc topics. |
| [OWASP Top 10:2021](https://owasp.org/Top10/2021/) | A ranked awareness document for broad web-application security risk categories, many aggregating CWEs. OWASP itself says it is not comprehensive and recommends ASVS for a verifiable application-security standard. | Evidence for application-security and weakness/remediation boundaries; source of hard negatives across access, crypto, design, configuration, and software integrity. | Using ten risk categories as a universal cybersecurity taxonomy or equating AppSec with vulnerability management alone. |
| [NIST Secure Software Development Framework 1.1, SP 800-218](https://doi.org/10.6028/NIST.SP.800-218) | Outcome-based secure-development practices grouped as Prepare the Organization, Protect the Software, Produce Well-Secured Software, and Respond to Vulnerabilities. | Evidence that software security spans design, development environment, provenance, production, and vulnerability response. | Treating its practice groups as glossary topics or folding all software security into post-release vulnerability management. |
| [NIST SP 800-161 Rev. 1](https://doi.org/10.6028/NIST.SP.800-161r1) | Identification, assessment, and mitigation of cybersecurity risks throughout product and service supply chains and across organizational levels. | Boundary and positive-example source for a supply-chain topic. | Treating every third-party or software entry as supply-chain security. |
| [NIST SP 800-61 Rev. 3](https://doi.org/10.6028/NIST.SP.800-61r3) | Incident-response recommendations integrated across CSF 2.0 cybersecurity risk-management activities, including preparation, detection, response, and recovery concerns. | Current anchor for the existing incident-response topic and its relationship to detection and recovery. | Assuming every Detect or Recover outcome is necessarily an incident-response glossary concept. |
| [NIST SP 800-86](https://doi.org/10.6028/NIST.SP.800-86) | Practical computer and network forensic techniques used in incident response or IT troubleshooting. | Evidence for including forensics within incident response by default while testing whether a separate topic is warranted. | Assuming every forensic or evidence-handling concept is incident response; the specification explicitly includes troubleshooting use. |
| [NIST NICE Framework, SP 800-181 Rev. 1](https://doi.org/10.6028/NIST.SP.800-181r1) | Cybersecurity work expressed through Task, Knowledge, and Skill statements, Work Roles, Work Role Categories, and Competency Areas. | Hard-negative and metadata guidance for role, credential, education, and workforce entries. | Copying workforce roles or competency areas into a topic taxonomy. |

### SynAc-specific evidence and inference

The local analysis used the current definitions in [`content/tags.json`](../../content/tags.json) and all five machine-generated source bundles in [`content/generated/`](../../content/generated/). Generated files were read only.

The corpus examples and lexical counts below are **discovery evidence**, not adjudicated prevalence. A keyword match can be incidental, and duplicate concepts from different sources may compile into one entry. None of these counts establishes the required 25 accepted entries for publication.

| Candidate area | Raw lexical hits across generated rows | Representative local entries |
| --- | ---: | --- |
| Risk and governance | 158 | `risk-management` (NICCS, NIST, RFC 4949), `risk-assessment` (NICCS, NIST), `enterprise-risk-management` (NICCS) |
| Privacy and data protection | 171 | `privacy` (NICCS, NIST, RFC 4949), `personal-identifying-information-personally-identifiable-information` (NICCS) |
| Supply-chain security | 91 | `supply-chain-risk-management` (NICCS), `compromise-hardware-supply-chain` and `compromise-software-supply-chain` (ATT&CK) |
| Physical and environmental security | 40 | `physical-security`, `emanations-security` (RFC 4949), `emission-security-emsec` (NIST) |
| Digital forensics and investigations | 26 | `digital-forensics` (NICCS, NIST), `anti-forensic` and `cyber-investigations` (NICCS) |
| Social engineering | 43 | `social-engineering` and `phishing` in four source bundles |
| Secure software/application security | 16 | `application-security-appsec`, `software-assurance`, `software-assurance-and-security-engineering` (NICCS) |

The lexical expressions were intentionally broad and inspected only for candidate discovery. The exact command is recorded under **Reproduction**.

## Audit of the current eight tags

Each direction below is a SynAc inference from the primary-source boundaries and local corpus, not a claim made by any framework.

| Current tag | Direction | Evidence-backed concern | Required contract decision |
| --- | --- | --- | --- |
| `access-control` — “Authentication, authorization, and identity mechanisms.” | Retain; consider the display name **Identity and access**. | CSF 2.0 and SP 800-53 distinguish access control from identification/authentication, while SynAc intentionally combines them. `Kerberos` demonstrates valid multi-label overlap with cryptography and protocols. | Decide whether identity proofing, credentials, federation, account lifecycle, authorization policy, and physical credentials all belong. The name must match the chosen breadth. |
| `cryptography` — “Encryption, hashing, signatures, and key management.” | Retain. | It is a coherent mechanism family across SP 800-53 and OWASP. `Internet Security Association and Key Management Protocol` and `Kerberos` demonstrate expected overlap with access and protocols. | Define whether certificates, PKI, random-number generation, cryptanalysis, and cryptographic failures are positive by default. |
| `network-security` — “Protocols, segmentation, and traffic protection.” | Retain, but remove the unexplained collision with `protocols`. | SP 800-53 has a System and Communications Protection family. Current examples such as `Internet Protocol` and TLS show that a protocol may be networking without being a security control, or may be network security plus cryptography. | Make “network technology” a hard negative unless the entry's security relevance is substantive. Specify when a protocol receives both tags. |
| `threat-intelligence` — “Adversary behavior, TTPs, and attribution.” | Rename, narrow, or split before use. | NIST's local `threat-intelligence` entry defines analyzed/enriched threat information for decisions, while ATT&CK models adversary behavior. The current name denotes the former but its description denotes the latter. `phishing` and `social-engineering` are adversary behaviors, not intelligence products. | Choose one: (a) rename to **Threats and adversary behavior** and include TTPs, actors, campaigns, and indicators under explicit rules; (b) narrow to intelligence artifacts/processes and add a separate adversary-behavior tag; or (c) retain one tag with an explicit, intentionally broad contract. |
| `vulnerability-management` — “Weaknesses, exposures, and remediation.” | Rename or narrow before use. | A vulnerability is a weakness; vulnerability management is a program/process. OWASP risk categories and SSDF vulnerability response show the distinction. The current description covers both, but the name only promises the management process. | Choose **Vulnerabilities and remediation** for the broad contract, or keep **Vulnerability management** and make generic weaknesses hard negatives. Decide treatment of exploit techniques and insecure designs. |
| `malware` — “Malicious software and persistence mechanisms.” | Retain, but remove “persistence mechanisms” unless limited to malware persistence. | Malware is a concrete subject. ATT&CK persistence is a tactical goal achieved by many non-malware techniques, so the current wording can absorb unrelated adversary behavior. | Include malware families, capabilities, delivery, and analysis; exclude generic persistence mechanisms unless the entry is substantively about malicious code. |
| `incident-response` — “Detection, containment, and recovery.” | Retain and sharpen. | SP 800-61 Rev. 3 anchors incident response across preparation, detection, response, and recovery. SP 800-86 ties forensics to incident response but also to troubleshooting. | Decide whether preparation, alert triage, forensics, evidence handling, business continuity, and disaster recovery are included; make generic monitoring/recovery hard negatives where no incident context exists. |
| `protocols` — “Standardized communication procedures.” | Narrow, rename, or retire before use. | This is an object/type dimension more than a security topic. TLS can validly be protocol + network + crypto; Kerberos can be protocol + access + crypto; `Internet Protocol` is a protocol but not intrinsically a security topic. | Decide whether SynAc permits a protocol facet. If yes, name it **Security and network protocols** and require a named protocol or protocol mechanism. If tags must be strictly topical, retire it and rely on substantive topic tags. |

## Evidence-backed gaps

### Advance to taxonomy-contract grilling

1. **Risk and governance**

   Primary-source fact: CSF 2.0 gives Govern first-class status, and SP 800-53 separately defines Risk Assessment, Assessment/Authorization/Monitoring, Planning, and Program Management families. These are related outcomes and controls, not one mandated topic.

   SynAc inference: A combined initial tag is more conservative than separate governance, risk, compliance, and audit tags. The corpus has direct terms such as `risk-management` and `risk-assessment` that do not fit any current description. The contract should include risk identification/assessment/treatment, policy, governance, authorization, and compliance only when cybersecurity is substantive; organization titles and generic management language should be hard negatives.

2. **Privacy and data protection**

   Primary-source fact: NIST's Privacy Framework treats privacy risk arising from data processing as overlapping with, but not identical to, cybersecurity risk. SP 800-53 includes PII Processing and Transparency as a distinct family.

   SynAc inference: Privacy deserves a candidate topic rather than being forced into access control or cryptography. The boundary should require privacy, personal-data processing, data minimization, consent, identifiability, or privacy engineering—not merely “confidential data.” Co-occurrence with access control or cryptography is expected.

3. **Supply-chain security**

   Primary-source fact: SP 800-161 Rev. 1 defines C-SCRM across products, services, suppliers, acquisition, and the full system lifecycle; SP 800-53 gives it a separate family.

   SynAc inference: The corpus contains both program concepts (`supply-chain-risk-management`) and adversary behaviors (`compromise-software-supply-chain`). A dedicated tag can join these only if its contract states that supply-chain context is the common topic. Generic dependency, vendor, or software entries must remain negative.

4. **Physical and environmental security**

   Primary-source fact: SP 800-53 defines Physical and Environmental Protection independently from logical Access Control and Identification/Authentication.

   SynAc inference: `physical-security`, emanations, facility barriers, and environmental protections have no natural current home. A candidate tag is justified, but physical credentials and cyber-physical systems need hard negatives so lexical “physical access” does not create false positives.

### Keep as candidates until adjudication

1. **Secure software and application security.** SSDF shows software security is wider than vulnerability response, and OWASP shows application risks cut across access, crypto, design, configuration, integrity, logging, and request handling. The explicit lexical census found only 16 rows, although current OWASP and weakness content may add implicit positives. Test a combined **Software and application security** contract, but do not publish it until adjudication demonstrates 25 accepted entries and distinguishes it from vulnerability management.

2. **Digital forensics and investigations.** NIST SP 800-86 supports forensics as an incident-response capability but also an IT troubleshooting practice. Start by making forensics an explicit inclusion area for `incident-response`; split only if adjudication finds at least 25 entries whose primary topic is evidence acquisition, preservation, examination, or investigation and whose labeling remains precise outside incidents.

3. **Social engineering and human factors.** ATT&CK treats phishing and other social engineering as adversary behavior, so a renamed adversary-behavior tag can cover them. A separate human-security tag would also attract awareness, training, insider, and personnel concepts that are not the same topic. Keep social engineering as a test cluster and hard-negative set before creating another public tag.

4. **Security architecture and engineering.** The corpus includes direct `security-architecture` definitions, but the label risks becoming a catch-all for every control and system. Use these examples to test co-occurrence and untagged behavior; add no public tag until a narrow, independently useful contract emerges.

## Dimensions that must remain separate from topical tags

| Dimension | Primary-source basis | SynAc rule |
| --- | --- | --- |
| Lifecycle or operating stage | CSF Functions organize outcomes; NIST explicitly says their order does not imply sequence. | Do not create Govern/Identify/Protect/Detect/Respond/Recover tags. An existing practice domain such as incident response needs its own topical contract, not membership by CSF Function alone. |
| Adversary tactic | ATT&CK tactics state why an adversary acts; techniques state how. | Use tactics as features or evaluation strata, not public tags. A glossary entry may concern several tactics. |
| Workforce role or competency | NICE describes cybersecurity work through Tasks, Knowledge, Skills, Work Roles, and related workforce components. | Keep roles, certifications, job titles, education, and audience level outside the topic taxonomy. They should be hard negatives unless the entry also substantively defines a topic. |
| Source | SynAc already records source bundles and provenance. | Never encode NIST, RFC, OWASP, MITRE, or NICCS as topics. |
| Entry type | SynAc already distinguishes entry types such as terms and acronyms. | Do not use tags for acronym, definition, standard, framework, tool, actor, or protocol merely as object types. The existing `protocols` tag requires an explicit exception or retirement. |
| Platform or environment | ATT&CK separates domains and platforms from tactics and techniques. | Cloud, mobile, enterprise, ICS/OT, operating system, and vendor are context facets. Promote one only if SynAc intentionally adds a separate dimension later. |
| Audience level | None of the topical frameworks defines beginner/intermediate/advanced as subject matter. | Keep reading difficulty and audience out of v0.1 tags. |

## Proposed decision matrix for the taxonomy ticket

This matrix deliberately stops short of freezing names or slugs.

| State for grilling | Tags/topics |
| --- | --- |
| Presumptive retain | Access control (possible display-name correction), Cryptography, Network security, Malware, Incident response |
| Must rewrite before publication | Threat intelligence, Vulnerability management, Protocols |
| Candidate additions with strong framework and corpus signals | Risk and governance, Privacy and data protection, Supply-chain security, Physical and environmental security |
| Candidate additions requiring more prevalence/boundary evidence | Software and application security, Digital forensics and investigations, Social engineering/human security |
| Do not add as topical tags | CSF Functions, ATT&CK tactics, NICE roles/competencies, sources, entry types, platforms, audience levels |

No merge is safe to declare from research alone. In particular, merging `protocols` into `network-security` would mishandle cryptographic and identity protocols, while merging `malware` into adversary behavior would discard a useful concrete subject. Multi-label co-occurrence is the safer default.

## Required human grilling decisions

1. Is the intended `threat-intelligence` subject analyzed intelligence, adversary behavior, or both? Choose the name and slug only after answering this.
2. Should generic weakness concepts be positive for `vulnerability-management`, or should the tag describe only discovery, prioritization, remediation, and program operations?
3. Are object-class facets allowed? If not, retire `protocols`; if yes, specify why protocols deserve an exception and which protocols qualify.
4. Should risk and governance begin as one broad tag or as separately unpublished candidate contracts? The 25-entry floor favors one initial tag, while precision may favor narrower definitions.
5. Does privacy include non-security harms from data processing, consistent with the Privacy Framework, or only cybersecurity-related privacy protection?
6. Does supply-chain security cover both organizational C-SCRM and adversary supply-chain compromise? If so, identify hard negatives for generic dependencies, vendors, and acquisition.
7. Does physical/environmental security include physical identity credentials, hardware tampering, and cyber-physical/OT concepts, or only facilities and environmental protections?
8. Is digital forensics part of incident response by default, independently tagged, or multi-labeled only when incident context exists?
9. Is social engineering sufficiently served by a renamed adversary-behavior tag, or is there an independently useful human-security topic with 25 accepted entries?
10. Which candidate additions survive an adjudicated prevalence audit? No candidate should publish from lexical counts.

## Contract implications

The next ticket should express every accepted tag using one comparable template:

- canonical name and slug;
- one-sentence topical definition;
- necessary inclusion rules and explicit exclusions;
- representative positives from at least two source families where possible;
- hard negatives containing misleading lexical overlap;
- allowed and expected co-occurrences;
- treatment of roles, lifecycle stages, platforms, sources, and entry types;
- publication evidence for at least 25 accepted entries;
- taxonomy version plus rename, merge, and retirement behavior.

The evaluation set should include at least these ambiguity families:

- TLS and IPsec: protocols + network security + cryptography;
- Kerberos: access control + cryptography + protocol;
- phishing and social engineering: adversary behavior, not automatically threat intelligence;
- a generic vulnerability versus patch/vulnerability management;
- privacy versus confidentiality and access control;
- software weakness versus secure-development practice;
- supply-chain compromise versus generic dependency or vendor;
- physical credential versus logical identity/access;
- forensics during incident handling versus IT troubleshooting;
- job title, certification, platform, standard, and acronym entries that should not receive a topic solely from their type.

## Reproduction

Read-only repository commands used:

```powershell
Get-Content -Raw content/tags.json
Get-Content -Raw content/README.md
Get-ChildItem content/generated -Filter *.json

$entries = foreach ($file in Get-ChildItem content/generated -Filter *.json) {
  $doc = Get-Content -Raw $file.FullName | ConvertFrom-Json
  $rows = if ($doc.entries) { @($doc.entries) } else { @($doc) }
  foreach ($entry in $rows) {
    [pscustomobject]@{
      source = $file.BaseName
      slug = $entry.slug
      title = $entry.title
      text = (@($entry.title, $entry.summaryMd) -join ' ')
    }
  }
}
```

The discovery counts used case-insensitive regular expressions over title plus summary for explicit phrases around risk/governance, privacy/PII, supply chain, physical security/emanations, forensics/digital evidence, social engineering/phishing, and secure software/application security. They were not used as accepted-label counts.

## Risks and limitations

- Framework categories optimize for their owners' use cases, not glossary navigation. Apparent agreement can still encode the wrong dimension.
- Generated rows contain cross-source duplicates; raw row counts overstate unique compiled entries.
- Keyword discovery has both false positives and false negatives. Only human-adjudicated labels can support publication or certification.
- Broad additions such as risk/governance and privacy may improve coverage while making 98% automatic precision harder. Precision gates must win over coverage.
- Some useful specialist topics may not reach 25 accepted entries. They should remain unpublished or review-only rather than weakening the floor.
- The Privacy Framework 1.1 material visible in 2026 is not used as a normative anchor here; the cited 1.0 specification is final.
- Frameworks and live knowledge bases change. Taxonomy contracts must pin versions and require explicit review before adopting upstream changes.
