# SPRINT 3 QA QUICK START GUIDE
**OrthoClinic v1.3 - Daily Testing Checklist & Reference**

**Document Version:** 1.0  
**Created:** June 7, 2026  
**Use:** Print and keep at desk during testing (July 4-23)

---

## 📋 DAILY TEST CHECKLIST

### ✅ EVERY MORNING (Before Daily Standup)

**Setup (5 min):**
- [ ] Clear browser cache
- [ ] Restart test server (if needed)
- [ ] Check test data is available
- [ ] DevTools open and ready (F12)
- [ ] Playwright running (or configured)

**Review (5 min):**
- [ ] Check yesterday's test results
- [ ] Review bug list (any new P0/P1?)
- [ ] Review dev updates (new code merged?)
- [ ] Check team Slack/email for blockers

**Run (30 min):**
- [ ] Execute regression test suite (smoke tests)
  - Login → Dashboard → Logout
  - Create appointment → View in agenda
  - Create patient → View patient list
  - Switch language → Verify UI updates
  - Access analytics dashboard
- [ ] Run Axe DevTools (accessibility)
- [ ] Run Lighthouse (performance)
- [ ] Check TypeScript errors: `npm run build`
- [ ] Check ESLint warnings: `npm run lint`

**Report (5 min):**
- [ ] Document results in daily report
- [ ] Log any new issues in bug tracker
- [ ] Note any blockers

**Total Time:** 45 minutes per day

---

## 🎯 DAILY STANDUP TALKING POINTS

**What did I test yesterday?**
- [Feature and scenario count]
- Example: "Tested 8 analytics scenarios + 5 mobile tests + 2 security tests"

**What am I testing today?**
- [Feature area and plan]
- Example: "Testing i18n language switching (EN, ES, FR) + translation file loading"

**Any blockers?**
- [Specific issue if exists]
- Example: "Waiting for updated translation files" or "No blockers, on schedule"

---

## 📱 DEVICE TESTING CHECKLIST (Quick Reference)

### iPhone 12 (390×844)
- [ ] Login page responsive
- [ ] Navigation hamburger works
- [ ] Appointments list scrollable
- [ ] Forms fit without scroll
- [ ] Touch targets > 44px

### iPhone SE (375×667)
- [ ] Same as iPhone 12
- [ ] Verify smaller screen still usable
- [ ] Fonts readable without zoom

### Pixel 5 (393×851, Android)
- [ ] Same as iPhones
- [ ] Verify Android keyboard works
- [ ] Back button navigation works

### iPad 10.9" (1024×1366)
- [ ] Table view (not list)
- [ ] Side-by-side layout where applicable
- [ ] All features accessible

### Galaxy S21 (360×800, Android)
- [ ] Smallest Android device
- [ ] Forms fit without horizontal scroll

### Desktop (1920×1080, All Browsers)
- [ ] Chrome: Full test
- [ ] Firefox: Quick check
- [ ] Safari: Quick check
- [ ] Edge: Quick check

---

## 🌐 LANGUAGE TESTING CHECKLIST (i18n)

**For Each Language, Verify:**

### PT-BR (Portuguese Brazil)
- [ ] Special characters: ã, õ, ç
- [ ] Date format: DD/MM/YYYY
- [ ] Time format: 24-hour (14:30)
- [ ] Number format: 1.234,56 (comma decimal)
- [ ] Currency format: R$ 1.234,56

### EN (English)
- [ ] All text in English
- [ ] Date format: MM/DD/YYYY
- [ ] Time format: 12-hour (2:30 PM)
- [ ] Number format: 1,234.56 (comma thousands)
- [ ] Currency format: $1,234.56

### ES (Spanish)
- [ ] Accent marks: á, é, í, ó, ú
- [ ] Date format: DD/MM/YYYY
- [ ] Number format: 1.234,56
- [ ] Grammar/gender agreement

### FR (French)
- [ ] Special chars: ç, è, é, ê, ù
- [ ] Date format: DD/MM/YYYY
- [ ] Number format: 1 234,56 (space thousands separator)

### IT (Italian)
- [ ] Accents: à, è, é, ì, ò, ù
- [ ] Date format: DD/MM/YYYY
- [ ] Number format: 1.234,56

---

## ♿ ACCESSIBILITY QUICK CHECK (Daily 5-min Audit)

**Keyboard Navigation:**
- [ ] Tab through page - no trap zones
- [ ] All buttons clickable with Enter
- [ ] Dropdowns open with arrow keys
- [ ] Modals close with Escape

**Visual:**
- [ ] Text readable (no tiny fonts)
- [ ] Text > buttons readable (4.5:1 contrast)
- [ ] Focus outline visible (not removed by CSS)
- [ ] No information conveyed by color alone

**Forms:**
- [ ] Labels associated with inputs
- [ ] Error messages clear
- [ ] Required fields marked
- [ ] Placeholder text doesn't replace label

**Images:**
- [ ] All have alt text
- [ ] Alt text describes content (not "image")
- [ ] Decorative images have alt=""

**Screen Reader (1x per week):**
- [ ] Page title announced
- [ ] Headings create outline (H1 > H2 > H3)
- [ ] Form labels announced
- [ ] Interactive elements named correctly

---

## 🔐 SECURITY QUICK CHECK

**Every Day:**
- [ ] HTTPS in address bar (lock icon)
- [ ] No console errors (F12 → Console)
- [ ] No sensitive data in Network tab
- [ ] No API keys visible in code

**Weekly:**
- [ ] Run security scan (OWASP ZAP)
- [ ] Check dependencies for vulnerabilities
- [ ] Review error messages (generic, not revealing)

**Red Flags (Escalate Immediately):**
- [ ] Plaintext passwords in database
- [ ] SQL injection possible
- [ ] XSS possible (scripts execute)
- [ ] CORS allows wildcard (*)

---

## ⚡ PERFORMANCE QUICK CHECK

**Page Load Times (DevTools Network tab):**

| Page | Target | Current |
|------|--------|---------|
| Login | <1s | [ ] |
| Dashboard | <2s | [ ] |
| Appointments | <1.5s | [ ] |
| Patients | <1.5s | [ ] |
| Analytics | <2s | [ ] |
| Settings | <1s | [ ] |

**Lighthouse Audit (Ctrl+Shift+I → Lighthouse tab):**

| Device | Target | Current |
|--------|--------|---------|
| Mobile | ≥85 | [ ] |
| Desktop | ≥90 | [ ] |

**Bundle Size:**
- [ ] Main JS: <200KB (gzipped)
- [ ] CSS: <100KB (gzipped)
- [ ] Fonts: <200KB (gzipped)

---

## 📧 NOTIFICATION QUICK TEST

**Every Day (if you create test data):**
- [ ] Create appointment
- [ ] Check inbox for email (within 5 sec)
- [ ] Verify email has clinic name, date, time
- [ ] Open toast notification (check display)
- [ ] Close toast (check it disappears)

---

## 📊 BUG REPORTING TEMPLATE (Copy/Paste)

```
TITLE: [Component] - [Brief description]

SEVERITY: P0 / P1 / P2 / P3
(P0=app crash, P1=feature broken, P2=partial break, P3=minor cosmetic)

DEVICE: iPhone 12 / Pixel 5 / Desktop Chrome / etc.

STEPS TO REPRODUCE:
1. Navigate to [page]
2. Click on [button]
3. Observe [issue]

EXPECTED: [What should happen]

ACTUAL: [What actually happens]

SCREENSHOT: [Attached]

LOGS: [Paste console error if applicable]
```

---

## 🚨 ESCALATION CONTACTS

| Issue Type | Contact | Time |
|------------|---------|------|
| P0 Bug (Critical) | QA Lead + Tech Lead | ASAP (1 hour) |
| P1 Bug (High) | QA Lead | 4 hours |
| P2 Bug (Medium) | QA Team | 1 day |
| Access/Environment | QA Lead | 1 hour |
| Missing Test Data | Dev Lead | 4 hours |
| Test Tool Issue | Tech Lead | 1 hour |

---

## 📝 DAILY REPORT TEMPLATE

```
SPRINT 3 QA DAILY REPORT
Date: [Date]
Tester: [Name]

COMPLETED TODAY:
- [Feature area]: [# scenarios] tested
  - [# passed], [# failed]
  - Key findings: [summary]

BUGS REPORTED:
- P0: [count]
- P1: [count]
- P2: [count]
- P3: [count]

BUGS FIXED & VERIFIED:
- [List any bugs that were fixed and re-tested]

METRICS:
- Test coverage: [%]
- Lighthouse mobile: [score]
- Lighthouse desktop: [score]
- Bundle size: [KB]

BLOCKERS:
- [Any issues preventing testing? Leave blank if none]

NEXT PRIORITIES:
- [What to focus on tomorrow]

NOTES:
- [Any other observations]
```

---

## 🎯 WEEKLY FOCUS AREAS

**Week 1 (July 4-10): Feature Testing**
- Day 1-2: Analytics (12 E2E + 8 integration)
- Day 3-4: i18n (15 E2E + 12 integration)
- Day 5-6: Notifications (12 E2E + 10 integration)
- Day 7: Mobile (15 E2E) + Settings (10 E2E)

**Week 2 (July 11-17): Integration & Regression**
- Jul 11-12: Cross-feature integration testing
- Jul 13-17: Daily regression + accessibility audit
- Performance optimization

**Week 3 (July 18-23): Final Push**
- Jul 18-20: Complete accessibility audit + security audit
- Jul 21: Production-like testing
- Jul 22: UAT and sign-off
- Jul 23: Launch + monitoring

---

## 💾 FILE LOCATIONS

**Test Files:**
- Frontend E2E: `/frontend/e2e/*.spec.ts`
- Frontend Unit: `/frontend/__tests__/*.test.ts`
- Backend Integration: `/backend/tests/integration/*.py`
- Backend Unit: `/backend/tests/unit/*.py`

**Documentation:**
- Main Plan: `SPRINT_3_QA_TEST_PLAN.md`
- E2E Scenarios: `SPRINT_3_E2E_TEST_SCENARIOS.md`
- Integration: `SPRINT_3_INTEGRATION_TEST_CHECKLIST.md`
- Security & A11y: `SPRINT_3_SECURITY_ACCESSIBILITY_AUDIT.md`
- Risk Matrix: `SPRINT_3_RISK_MATRIX_DELIVERABLES.md`

**Tracking:**
- Bug Tracker: [Jira/GitHub Issues URL]
- Metrics Dashboard: [Confluence/Sheets URL]
- Daily Reports: [Shared folder/channel]

---

## 🚀 QUICK COMMAND REFERENCE

**Frontend Testing:**
```bash
# Run E2E tests
npm run e2e

# Run E2E tests in UI mode
npm run e2e:ui

# Run specific test
npm run e2e -- analytics.spec.ts

# Run unit tests
npm test

# Check types
npm run build

# Lint
npm run lint

# Lighthouse
npm run lighthouse
```

**Backend Testing:**
```bash
# Run all tests
python -m pytest

# Run specific test file
python -m pytest tests/integration/test_api_endpoints.py

# Run with coverage
python -m pytest --cov=.

# Run specific test function
python -m pytest tests/unit/test_anamnesis.py::test_function_name
```

**Accessibility:**
```bash
# Install Axe DevTools Chrome extension
# Or run automated checks in Playwright

# Screen Reader Testing (macOS)
Cmd + F5  # VoiceOver

# Screen Reader Testing (Windows)
# Install NVDA: https://www.nvaccess.org/
```

---

## ✅ END-OF-DAY CHECKLIST

Before leaving for the day:
- [ ] Daily report filled out
- [ ] Bugs logged in tracker
- [ ] Test results documented
- [ ] Blocker issues flagged
- [ ] Tomorrow's test plan clear
- [ ] Test environment left in good state
- [ ] No uncommitted test code
- [ ] Team informed of key findings

---

## 📈 SUCCESS INDICATORS THIS WEEK

**By End of Each Week:**

**Week 1 (July 10):**
- 55+ test scenarios executed
- Feature testing 80% complete
- Bug count tracked
- Performance baseline confirmed

**Week 2 (July 17):**
- 40+ integration tests executed
- Cross-feature testing complete
- Regression suite 100% passing
- Performance maintained

**Week 3 (July 23):**
- ALL testing complete (165+ scenarios)
- Zero P0/P1 bugs
- WCAG 2.1 AA compliant
- Lighthouse 85+ (mobile), 90+ (desktop)
- **READY FOR LAUNCH**

---

## 💡 QUICK TIPS

1. **Test Early:** Don't wait for features to be 100% done
2. **Automate:** Manual testing is slow, automate what you can
3. **Reproduce:** Always follow exact steps, be systematic
4. **Document:** Clear bugs get fixed faster
5. **Escalate:** Don't sit on blockers, speak up
6. **Communicate:** Daily standups, daily reports
7. **Verify:** After dev fixes a bug, re-test
8. **Clean Up:** Close old test tabs, restart browser daily
9. **Hydrate:** Drink water! Testing is mental work
10. **Celebrate:** Hit milestones and celebrate wins!

---

## 🎓 REFERENCE LINKS

- **Playwright Docs:** https://playwright.dev
- **Jest Docs:** https://jestjs.io
- **WCAG 2.1 AA Checklist:** https://www.w3.org/WAI/WCAG21/quickref/
- **OWASP Top 10:** https://owasp.org/Top10/
- **Lighthouse Guide:** https://developers.google.com/web/tools/lighthouse
- **Axe DevTools:** https://www.deque.com/axe/devtools/

---

## 📞 QUICK CONTACTS

**QA Lead:** [Name, #, email]  
**Tech Lead:** [Name, #, email]  
**Dev Lead (Analytics):** [Name, #, email]  
**Dev Lead (i18n):** [Name, #, email]  
**Dev Lead (Notifications):** [Name, #, email]  
**DevOps:** [Name, #, email]  

---

## 🎉 YOU'VE GOT THIS!

This is a complex sprint with 5 major features, but you have a solid plan:
- 165+ test cases
- Clear timeline
- Risk mitigation
- Team support

Stay organized, follow the plan, communicate daily, and you'll deliver a quality product.

**Sprint 3 Success = High-quality release = Happy users = Team pride!**

---

**Print This Guide & Keep at Your Desk!**

**Version:** 1.0  
**Last Updated:** June 7, 2026  
**Next Update:** July 1, 2026 (before sprint starts)

