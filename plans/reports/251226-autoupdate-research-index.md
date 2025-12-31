# Auto-Update Research Index

**Comprehensive research on Python desktop app auto-update mechanisms for Toga/Briefcase**

Generated: 2025-12-26
Total Coverage: 65KB of actionable technical intelligence

---

## Quick Navigation

### For Executives / Decision Makers
- **Start here:** "Research Report" → Executive Summary + Implementation Recommendations
- **Time:** 10 minutes
- **Key Question Answered:** Can we build auto-updates for Toga apps? Yes, with moderate effort.

### For Architects
- **Start here:** "Architecture Document" → System Overview + Data Flow sections
- **Then:** "Implementation Guide" → Testing section
- **Time:** 30 minutes
- **Key Question Answered:** How do all components fit together? What are threading/async patterns?

### For Developers
- **Start here:** "Implementation Guide" → Code examples sections 3-4
- **Then:** "Research Report" → Platform-specific considerations (sections 7-8)
- **Time:** 1-2 hours to implement
- **Key Question Answered:** What code do I need to write? How do I integrate with Toga?

### For DevOps / Release Engineers
- **Start here:** "Implementation Guide" → sections 8-9 (CI/CD, deployment)
- **Then:** "Architecture Document" → Deployment Topology
- **Time:** 30 minutes to plan release pipeline
- **Key Question Answered:** How do we automate version releases and Firebase updates?

---

## Document Overview

### 1. **251226-python-desktop-autoupdate-research.md** (34 KB)

Comprehensive technical research covering all aspects of Python desktop app auto-updates.

**Contents:**
- Executive summary with critical findings
- Research methodology (15+ sources consulted)
- 10 detailed findings (Briefcase limitations, industry patterns, Firebase options, etc.)
- Implementation recommendations with code examples
- Security considerations and best practices
- Common pitfalls with solutions
- Resources and glossary

**Best For:**
- Understanding the landscape
- Decision-making on technology choices
- Deep dives on specific topics

**Key Sections:**
- Finding #1: Why Briefcase doesn't have built-in updates
- Finding #4: Firebase schema design and Python SDK options
- Finding #6: macOS code signing requirements (critical!)
- Finding #9: Toga async architecture patterns

**Read Time:** 30-45 minutes

---

### 2. **251226-autoupdate-implementation-guide.md** (14 KB)

Practical, step-by-step guide with copy-paste code ready for production.

**Contents:**
- Firebase setup (5 minutes)
- Minimal update manager implementation (production-ready)
- Toga app integration code
- Local testing with mock Firebase
- Security checklist
- Deployment checklist
- Common issues and fixes table
- Quick start (TL;DR)

**Best For:**
- Hands-on implementation
- Copy-paste code patterns
- Quick reference during coding
- Checklists and validation

**Key Sections:**
- Section 3: Minimal UpdateManager class (~80 lines)
- Section 4: Toga app integration
- Section 8: Computing checksums for releases
- Section 12: Quick start TL;DR

**Read Time:** 15 minutes for overview, ongoing reference during coding

---

### 3. **251226-autoupdate-architecture.md** (17 KB)

Visual system design with diagrams, data flows, and topology.

**Contents:**
- System overview diagram (end-to-end flow)
- Component interaction diagrams
- Version check data flow (step-by-step)
- Download & install data flow (macOS + Windows)
- Threading & async model (how Toga runs)
- Firebase schema visualization
- File storage locations (by platform)
- Security architecture
- Error handling & recovery scenarios
- Deployment topology
- Performance characteristics table
- Monitoring recommendations

**Best For:**
- Understanding system design
- Architecture discussions
- Debugging flows
- Planning infrastructure

**Key Sections:**
- System Overview diagram (ASCII)
- Threading & Async Model (critical for Toga integration)
- Error Handling section (recovery patterns)
- Deployment Topology (how it all connects)

**Read Time:** 20 minutes for overview, reference during architecture discussions

---

## Critical Findings Summary

### Finding 1: Briefcase Has NO Built-In Updates
**Impact:** HIGH
**Action:** Use custom update mechanism; this is normal for desktop apps.
- Briefcase is a packaging tool, not a distribution platform
- Even Electron leaves auto-update to developers
- Firebase + custom code is industry-standard approach

### Finding 2: Toga Async Support (Current Best Practice)
**Impact:** HIGH
**Action:** Use `asyncio.create_task()` for version checks, threading for downloads.
- `add_background_task()` is DEPRECATED (Toga 0.5.2+)
- Must use async HTTP (aiohttp/httpx), not blocking requests
- Download/install work goes in background thread, not async

### Finding 3: Firebase Admin SDK is Official & Supported
**Impact:** MEDIUM
**Action:** Use firebase-admin for Python, not REST API wrapper.
- Official Google SDK, well-maintained
- Requires service account JSON (no per-user auth needed)
- ~100 lines of code to integrate

### Finding 4: macOS Code Signing is Critical
**Impact:** HIGH
**Action:** App MUST be signed; DMG MUST be signed; MUST use `cp -R` not overwrite.
- Without signed DMG, app gets "translocated" to random read-only location
- Overwriting breaks code signature cache in kernel
- Briefcase ad-hoc signing works for dev; production needs Developer ID

### Finding 5: Windows UAC is Complex
**Impact:** MEDIUM
**Action:** Use background service or scheduled task elevation, avoid direct UAC prompts.
- Direct elevation prompts annoy users
- Background service (Windows Service) is cleaner
- August 2025 security updates made UAC enforcement stricter

### Finding 6: Server-Side Version Logic is Standard
**Impact:** MEDIUM
**Action:** Server (Firebase) decides if client gets update; not client-side comparison.
- Enables staged rollouts, A/B testing, emergency rollback
- Simple HTTP: server responds 200 (yes) or 204 (no)
- Prevents version comparison logic bugs on client

---

## Recommended Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Version Metadata** | Firebase Realtime Database | Google-backed, real-time, simple JSON |
| **Python SDK** | firebase-admin | Official, well-maintained |
| **HTTP Client** | aiohttp or httpx | Async, won't block Toga UI |
| **Async Framework** | asyncio (stdlib) | Toga uses asyncio natively |
| **Background Work** | threading.Thread | Separate thread for blocking I/O |
| **Download Verification** | hashlib.sha256() | Standard library, cryptographic |
| **Installers** | Briefcase + native tools | Briefcase for packaging; hdiutil/EXE for install |
| **Distribution** | CDN (S3, Cloudflare, etc.) | Fast downloads, cheap storage |
| **Code Signing** | macOS: codesign + Developer ID | Required for Gatekeeper |
| **Notarization** | xcrun notarytool | Required for macOS distribution |

---

## Implementation Timeline

### Phase 1: Planning & Setup (2-4 hours)
- [ ] Create Firebase project
- [ ] Generate service account key
- [ ] Design version metadata structure
- [ ] Set up CDN for installers
- [ ] Plan CI/CD pipeline for releases

### Phase 2: Core Implementation (4-8 hours)
- [ ] Implement UpdateManager class
- [ ] Integrate with Toga app (startup hook)
- [ ] Implement Firebase query + version check
- [ ] Implement download + checksum verification
- [ ] Implement platform-specific install

### Phase 3: Testing (2-4 hours)
- [ ] Unit tests: version comparison, checksum
- [ ] Integration tests: mock Firebase
- [ ] Manual testing: actual DMG/EXE on clean system
- [ ] Error scenarios: network unavailable, bad checksum, install fails

### Phase 4: Infrastructure (4-6 hours)
- [ ] Build release pipeline (GitHub Actions)
- [ ] Code sign macOS app/DMG
- [ ] Notarize macOS DMG
- [ ] Upload installers to CDN
- [ ] Populate Firebase version metadata

### Phase 5: Deployment & Monitoring (2-4 hours)
- [ ] Deploy to beta users (1%)
- [ ] Monitor: download success, install success, errors
- [ ] Expand to 25% → 100% in stages
- [ ] Document rollback procedure

**Total First Release:** 14-26 hours (2-4 days of development)
**Ongoing Per Release:** 30-60 minutes (compute checksums, update Firebase, upload to CDN)

---

## Success Metrics

Track these to validate auto-update system:
- **Version check success rate:** >99% (some users offline is expected)
- **Download success rate:** >95% (network issues, user-initiated cancellations)
- **Install success rate:** >98% (platform-specific bugs)
- **User adoption:** >80% on latest version within 7 days
- **Error rate:** <5% (bad checksums, corrupted downloads, install failures)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Corrupted download breaks app | HIGH | SHA256 verification + delete on mismatch |
| Failed install leaves app broken | HIGH | Backup old app; restore if install fails |
| User can't roll back bad update | MEDIUM | Push new version with fix; document manual downgrade |
| Code signing issues prevent launch | MEDIUM | Test signing in CI before release |
| Firebase outage blocks all updates | LOW | Update check fails gracefully; app continues running |
| UAC prompt annoys users (Windows) | MEDIUM | Use background service or scheduled task |
| DMG translocation breaks app (macOS) | MEDIUM | Sign DMG; ensure cp -R creates new inode |

---

## Security Audit Checklist

Before production release:

- [ ] Service account JSON not in version control
- [ ] HTTPS-only download URLs
- [ ] SHA256 checksums validated (not MD5)
- [ ] Firebase rules: read-only /latest/, write-only admin
- [ ] App code-signed (macOS)
- [ ] DMG code-signed and notarized (macOS)
- [ ] Temporary installer files deleted after install
- [ ] No API keys hardcoded in source
- [ ] Error messages don't leak sensitive info
- [ ] Update mechanism works offline gracefully

---

## Frequently Asked Questions

**Q: Can users skip updates?**
A: Yes, unless you set `mandatory: true` in Firebase. Implement enforcement if needed.

**Q: What if Firebase is down?**
A: check_for_updates() catches exception, fails gracefully. User continues running old version.

**Q: How do we roll back a bad update?**
A: Edit Firebase `/latest/{platform}/version` back to previous. Already-updated users need manual intervention.

**Q: Can we offer delta updates (download only changes)?**
A: Yes, with significant complexity. First release: full installer. Future enhancement: bsdiff + patch.

**Q: What about Linux?**
A: Not covered in this research. Python/Linux packaging is fragmented (snap, appimage, flatpak). Recommend distro package manager.

**Q: How do we handle auto-restart on Windows?**
A: Installer auto-restarts app, OR app restarts on next manual launch. Up to installer implementation.

**Q: Can we force updates?**
A: Yes, set `mandatory: true` in Firebase. Show dialog, disable app if user doesn't update (harsh).

**Q: What's the size limit for DMG/EXE?**
A: No technical limit. Keep installers <500MB for reasonable download time. ~100MB typical for Toga app.

---

## Integration with Claude Code Log

For the specific Claude Code Log app:

**App Version Management:**
```python
# pyproject.toml
[project]
version = "1.0.0"

# app/claudecodelog/app.py
from importlib.metadata import version
__version__ = version("claudecodelog")
```

**Firebase Structure (Example):**
```json
{
  "latest": {
    "macos": {
      "version": "1.0.1",
      "downloadUrl": "https://cdn.example.com/releases/claudecodelog-1.0.1.dmg",
      "checksumSha256": "...",
      "releaseNotes": "Fixed TUI rendering bug, added cache invalidation option"
    },
    "windows": {
      "version": "1.0.1",
      "downloadUrl": "https://cdn.example.com/releases/claudecodelog-1.0.1.exe",
      "checksumSha256": "...",
      "releaseNotes": "Fixed TUI rendering bug, added cache invalidation option"
    }
  }
}
```

**Integration Points:**
- `app/claudecodelog/updates.py` - UpdateManager module
- `app/claudecodelog/app.py` - Toga app startup hook
- `firebase-key.json` - Service account (bundled, not in git)
- CI/CD: Build, sign, notarize, upload, populate Firebase

---

## References to Source Materials

### Research Sources (15+ consulted)
- Firebase Admin SDK official docs
- Electron autoUpdater API documentation
- Briefcase and Toga official documentation
- GitHub discussions: Toga async patterns, background tasks
- macOS code signing technical notes (Apple)
- Windows UAC/MSI documentation (Microsoft)
- PyUpdater, tufup, updater4pyi projects
- py3-wget library documentation

### Key GitHub Issues & Discussions
- Toga background tasks: https://github.com/beeware/toga/discussions/1676
- Toga threading: https://github.com/beeware/toga/discussions/2083
- Toga async: https://github.com/beeware/toga/issues/68
- Briefcase platform support: https://github.com/beeware/briefcase/issues/2334

### Documentation Sites
- https://firebase.google.com/docs/admin/setup
- https://electronjs.org/docs/latest/api/auto-updater
- https://briefcase.readthedocs.io/
- https://developer.apple.com/library/archive/technotes/tn2206/

---

## Document Statistics

- **Total Pages:** ~65 KB markdown (equivalent to ~60-80 pages PDF)
- **Code Examples:** 8 production-ready snippets
- **Diagrams/Flows:** 12 ASCII architecture diagrams
- **Checklists:** 6 (deployment, security, testing)
- **Tables:** 15+ comparison/reference tables
- **Research Sources:** 15+ authoritative sources

---

## Reading Order Recommendations

### For Quick Implementation (2-4 hours)
1. Implementation Guide (sections 1-5)
2. Research Report (section 7: Platform-specific)
3. Implementation Guide (section 9: CI/CD example)

### For Production Deployment (8+ hours)
1. Research Report (sections 1-3: overview)
2. Architecture Document (full read)
3. Implementation Guide (full read)
4. Research Report (sections 9-10: security, pitfalls)

### For Ongoing Maintenance (30 min per release)
- Implementation Guide (section 9: computing checksums)
- Implementation Guide (section 8: deployment checklist)
- Architecture Document (Rollback Procedure)

---

## Next Steps

1. **This Week:** Read Research Report executive summary + Implementation Guide
2. **Next Week:** Set up Firebase project, implement UpdateManager class
3. **Week 3:** Test with mock Firebase, build test DMG/EXE
4. **Week 4:** End-to-end testing on clean systems (macOS + Windows)
5. **Week 5:** Set up CI/CD, release pipeline automation
6. **Week 6:** Beta release to 1% of users
7. **Week 7:** Monitor, expand to 100%

---

**Last Updated:** 2025-12-26
**Status:** Complete, production-ready
**Confidence Level:** High (industry-standard patterns, multiple sources, concrete code examples)
