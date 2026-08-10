# SynAc Content Taxonomy

The shared language for organizing SynAc glossary entries by cybersecurity topic.

## Language

**Entry**:
An individually browsable glossary concept that may consolidate definitions from one or more Sources.
_Avoid_: Source row, record

**Tag**:
A non-exclusive, entry-level topical classification. An Entry may have zero, one, or several Tags.
_Avoid_: Category, facet

**Tag contract**:
The normative, versioned definition of a Tag's meaning, boundaries, representative examples, and expected relationships to other Tags.
_Avoid_: Tag description

**Substantive topic**:
A topic central to an Entry's meaning or necessary to understand the concept, rather than merely mentioned in supporting prose or relationships.
_Avoid_: Keyword match

**Accepted Tag assignment**:
A positive association between one Entry and one Tag accepted through the governing reference-label protocol or an authoritative manual override.
_Avoid_: Prediction, suggestion

**Adjudication**:
Independent resolution of disputed Tag decisions after blind annotations and adversarial objections have been recorded against the governing Tag contract.
_Avoid_: Majority vote

**Synthetic reference label**:
A contract-grounded Entry/Tag decision produced by independent model annotation, adversarial review, and model adjudication under a frozen reference generation.
_Avoid_: Gold label, ground truth, human label

**Annotation agent**:
An isolated model role that decides Entry/Tag pairs without access to peer decisions, classifier predictions, split identity, or sealed evaluation results.
_Avoid_: Annotator

**Adversarial review**:
A separate attempt to falsify a proposed Synthetic reference label using the Tag's exclusions, hard negatives, competing senses, and strongest counterargument.
_Avoid_: Quality check

**Reference abstention**:
The outcome when independent annotation and adversarial adjudication cannot support a stable binary Synthetic reference label.
_Avoid_: Tie, unknown label

**Concept family**:
One or more Entries independently confirmed by a semantic-review panel as duplicates or near-duplicates and therefore kept within one evidence split.
_Avoid_: Topic cluster, alias group

**Development set**:
The adjudicated Entries whose labels a classifier campaign may use for training, feature development, and grouped out-of-fold evaluation.
_Avoid_: Training set

**Calibration set**:
The sealed adjudicated Entries used once after candidate freeze to fit per-Tag calibrators and confidence-lane thresholds.
_Avoid_: Validation set

**Population-test set**:
The sealed, uniformly sampled adjudicated Entries used once to estimate performance on the eligible production corpus.
_Avoid_: Test set

**Challenge set**:
The sealed, deliberately difficult adjudicated Entries used once to test known ambiguity, overlap, and hard-negative failure modes rather than population prevalence.
_Avoid_: Edge cases

**Sealed evidence**:
Calibration, population-test, challenge, or certification labels whose plaintext is inaccessible to autonomous classifier development and whose authorized evaluator reveals only preregistered aggregate results.
_Avoid_: Hidden test data

**Reference generation**:
An immutable, content-addressed Synthetic-reference-label snapshot bound to one taxonomy, corpus, guideline, agent panel, concept-family, sampling, and split manifest.
_Avoid_: Annotation generation, dataset version

**Reference precision**:
The precision of classifier decisions measured against a frozen Synthetic reference label set, not independently established semantic correctness.
_Avoid_: Ground-truth precision, certified accuracy

**Protocol-conformance assessment**:
Evidence that a classifier and its Synthetic reference labels passed the frozen multi-agent review, sealing, stability, and statistical gates.
_Avoid_: Independent certification, expert validation

**Expected co-occurrence**:
A representative known-valid pairing of Tags, not a whitelist or constraint on other independently valid pairings.
_Avoid_: Allowed co-occurrence

**Threats and adversary behavior**:
The topic covering cybersecurity threats, threat actors, campaigns, TTPs, techniques, social engineering, indicators, attribution, and threat-intelligence artifacts whose substantive subject is adversarial activity.
_Avoid_: Threat intelligence, adversary behavior

**Identity and access**:
The topic covering digital identities, accounts, credentials, authentication, federation, authorization, and logical access policy.
_Avoid_: Access control, identity management

**Cryptography**:
The topic covering cryptographic primitives, protocols, key material, supporting infrastructure, analysis, and failures.
_Avoid_: Cryptology

**Network security**:
The topic covering protection, monitoring, segmentation, and defense of networks and network communications.
_Avoid_: Networking

**Malware**:
The topic covering malicious software, its lifecycle and capabilities, and its analysis, detection, and removal.
_Avoid_: Malicious code

**Incident response**:
The topic covering preparation for, investigation of, containment of, eradication of, recovery from, and learning after cybersecurity incidents.
_Avoid_: Incident management

**Tag taxonomy**:
The globally versioned set of Tag contracts governing which cybersecurity topics SynAc recognizes and their lifecycle state.
_Avoid_: Tag list

**Taxonomy version**:
The monotonically increasing identifier for one accepted generation of the complete Tag taxonomy.
_Avoid_: Per-Tag version

**Candidate Tag**:
A fully specified Tag that may be annotated and evaluated but is not visible to the public.
_Avoid_: Draft Tag

**Published Tag**:
A fully specified Tag with at least 25 accepted Entry assignments that is visible in SynAc's public taxonomy.
_Avoid_: Active Tag

**Retired Tag**:
A former Tag whose identity remains reserved but can no longer receive accepted assignments.
_Avoid_: Deleted Tag

**Vulnerabilities and remediation**:
The topic covering cybersecurity weaknesses and exposures, plus their identification, assessment, prioritization, and resolution.
_Avoid_: Vulnerability management

**Risk and governance**:
The topic covering cybersecurity risk, governance, policy, compliance, authorization, audit, and program assurance.
_Avoid_: GRC

**Privacy and data protection**:
The topic covering privacy risk and the responsible processing, protection, and de-identification of personal data.
_Avoid_: Data privacy

**Supply-chain security**:
The topic covering cybersecurity risk and compromise across products, services, suppliers, dependencies, acquisition, provenance, and delivery chains.
_Avoid_: Supply-chain risk management

**Physical and environmental security**:
The topic covering physical access, facilities, media, environmental hazards, emanations, and physical tamper protection as they relate to information-system security.
_Avoid_: Physical security
