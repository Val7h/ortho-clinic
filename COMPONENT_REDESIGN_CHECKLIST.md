# OrthoClinic Component Redesign Checklist

**Date:** June 7, 2026  
**Total Components:** 47+  
**Priority Levels:** HIGH (implement Day 2-3), MEDIUM (Day 4-5), LOW (Day 5-6)

---

## Core Navigation Components

### Priority: HIGH (Day 2)

#### [ ] MobileBottomNav.tsx (NEW)
- **Status:** Not yet created
- **Description:** Fixed bottom navigation for mobile (< 768px)
- **Specs:**
  - 5 icon buttons: Home, Patients, Schedule, Profile, More
  - Height: 64px (with safe area)
  - Icon size: 24px, label 10px (or hidden on very small)
  - Active state: highlighted with underline/badge
  - Touch target: 48x48px per item
- **Mobile Behavior:**
  - Show only on mobile (hidden lg:)
  - Sticky to bottom
  - Account for bottom safe area (notches)
- **Test Requirements:**
  - Visible on iPhone SE, Pixel 5
  - Hidden on iPad, Desktop
  - Tap targets accessible
  - Navigation works

#### [ ] MobileHamburgerMenu.tsx (NEW)
- **Status:** Not yet created
- **Description:** Hamburger menu drawer for mobile navigation
- **Specs:**
  - Slide-in drawer from left (320px wide)
  - Close on: escape, backdrop click, item click
  - Animation: slide-in-left (300ms)
  - Z-index: 40 (above mobile-bottom-nav)
  - Safe area padding top (notch)
- **Menu Items:**
  - Dashboard, Patients, Schedule, Settings, Help
  - Nested items (sub-menus with expand/collapse)
  - Active state indicator
- **Test Requirements:**
  - Opens/closes smoothly
  - Backdrop click closes
  - Escape key closes
  - Items navigate correctly
  - Nested menus expand/collapse

#### [ ] NavBar.tsx (REFACTOR)
- **Status:** Existing, needs updates
- **Current Issues:** Desktop-focused, no mobile menu toggle
- **Changes Required:**
  - Add hamburger button (lg:hidden)
  - Move title to center on mobile
  - Responsive action buttons
  - Dark mode toggle in user menu
- **Mobile Specs (< 768px):**
  - Title only in center (no subtitle)
  - Left: hamburger button (48px)
  - Right: single action button (48px)
  - Height: 56px
  - No logo on mobile
- **Tablet Specs (768px - 1024px):**
  - Show collapsed sidebar toggle
  - Title on left
  - Multiple actions on right
- **Desktop Specs (1024px+):**
  - Current behavior (preserved)
- **Test Requirements:**
  - Hamburger shows on mobile only
  - Responsive actions display
  - Title fits on mobile
  - Back button works on mobile

#### [ ] CollapsedSidebar.tsx (NEW)
- **Status:** Not yet created (for tablet+)
- **Description:** Collapsible sidebar for tablet and desktop
- **Specs:**
  - Default: icon-only (width 80px)
  - Hover: expand to show labels
  - Icons: 24px
  - Label animation: fade-in 200ms
  - Hidden on mobile (< 768px)
- **Navigation Tree:**
  - Patients, Appointments, Financial, Admin, Settings
  - Collapse/expand arrow for nested items
- **Test Requirements:**
  - Visible on iPad, Desktop
  - Hidden on mobile
  - Hover expands labels
  - Navigation works

---

## List & Card Components

### Priority: HIGH (Day 3)

#### [ ] PatientCard.tsx (REFACTOR)
- **Status:** Existing, needs mobile updates
- **Current Layout:** Horizontal (avatar | info | actions)
- **Mobile Changes (< 640px):**
  - Stack: vertical layout
  - Avatar: 48x48px (same as desktop)
  - Info: full width
  - Metadata: wrap into 2-3 lines
  - Chevron: hidden on mobile, show on sm+
- **Tablet+ (640px):**
  - Return to horizontal layout
- **Changes:**
  ```tsx
  Before: flex flex-row
  After:  flex flex-col sm:flex-row
  
  Before: gap-3.5
  After:  gap-3 sm:gap-3.5
  
  Before: p-4
  After:  p-3 sm:p-4
  ```
- **Touch Optimization:**
  - Entire card clickable
  - Min height: 64px on mobile
  - Padding: 12px on mobile, 16px on desktop
- **Test Requirements:**
  - Mobile: vertical layout verified
  - Tablet+: horizontal layout verified
  - Touch targets: 48x48px
  - Metadata displays correctly
  - Card click navigation works

#### [ ] ConsultationCard.tsx (REFACTOR)
- **Status:** Existing (check components/)
- **Mobile Changes:**
  - Change from side-by-side to stacked info
  - Status badge: move from right to below title
  - Time display: larger on mobile
  - Actions (buttons): full-width on mobile
- **Touch Target:** 48x48px for action buttons
- **Test Requirements:**
  - Layout stacks on mobile
  - Buttons are 48px on mobile
  - Status badge visible
  - Actions clickable

#### [ ] ExamCard.tsx / ReportCard.tsx (REFACTOR if exists)
- **Status:** Needs review
- **Mobile Changes:**
  - Similar to ConsultationCard
  - Stack info vertically
  - Full-width action buttons on mobile
  - Icon-only buttons become icon+text on mobile
- **Test Requirements:**
  - Cards stack on mobile
  - Buttons have min 48px height

---

## Form Components

### Priority: HIGH (Day 3-4)

#### [ ] FormField.tsx (NEW or REFACTOR)
- **Status:** May exist as part of form system
- **Mobile Specs:**
  - Label above input (full width)
  - Input height: 48px on mobile, 40px on desktop
  - Input font-size: 16px (prevent iOS zoom)
  - Padding: 12px vertical, 16px horizontal
  - Spacing between fields: 16px mobile, 12px desktop
- **Changes:**
  ```tsx
  className="h-12 sm:h-10 text-base sm:text-sm"
  ```
- **Test Requirements:**
  - Input height is 48px on mobile
  - Font size prevents zoom
  - Labels are readable
  - Focus states clear

#### [ ] MobileDatePicker.tsx (NEW)
- **Status:** Not yet created
- **Description:** Mobile-optimized date picker
- **Mobile (< 768px):**
  - Use native `<input type="date">`
  - Full-width input
  - Large touch target
- **Desktop (768px+):**
  - Custom date picker (calendar)
  - Side-by-side layout option
- **Test Requirements:**
  - Native picker on mobile
  - Custom picker on desktop
  - Date selection works
  - Validation on blur

#### [ ] MobileTimeInput.tsx (NEW)
- **Status:** Not yet created
- **Description:** Mobile-optimized time input
- **Mobile:**
  - Native `<input type="time">`
  - Full-width
- **Desktop:**
  - Custom time picker
- **Test Requirements:**
  - Native picker on mobile
  - Time selection works
  - Format correct

#### [ ] FormLayout.tsx (NEW or REFACTOR)
- **Status:** Likely needs creation/update
- **Description:** Responsive form layout container
- **Specs:**
  - Mobile: single column (all fields full-width)
  - Tablet+: 2-column grid for non-critical fields
  - Responsive gap (12px mobile, 16px desktop)
- **Usage:**
  ```tsx
  <FormLayout>
    <FormField label="Name" />
    <FormField label="Email" />
    <FormField label="Phone" className="lg:col-span-2" />
  </FormLayout>
  ```
- **Test Requirements:**
  - Single column on mobile
  - Multi-column on tablet+
  - Proper spacing
  - Inputs full-width on mobile

#### [ ] MobileSelect.tsx (NEW)
- **Status:** Not yet created
- **Description:** Mobile-optimized select/dropdown
- **Mobile:**
  - Native select (mobile browsers optimize)
  - Or: custom popup menu (full-width)
  - Large text: 16px
- **Desktop:**
  - Custom dropdown with search
- **Test Requirements:**
  - Options accessible
  - Touch-friendly size
  - Selection works

---

## Layout & Grid Components

### Priority: HIGH (Day 3-4)

#### [ ] DashboardGrid.tsx (REFACTOR)
- **Status:** Likely exists as part of dashboard
- **Current:** Multi-column grid (desktop-first)
- **Mobile Changes:**
  - 1 column on mobile (< 640px)
  - 2 columns on tablet (640px - 1024px)
  - 3+ columns on desktop (1024px+)
- **Changes:**
  ```tsx
  Before: grid-cols-3
  After:  grid-cols-1 md:grid-cols-2 lg:grid-cols-3
  ```
- **Responsive Gaps:**
  - Mobile: gap-3
  - Tablet+: gap-4
- **Test Requirements:**
  - Single column on mobile
  - 2-column on tablet
  - 3-column on desktop
  - Proper spacing
  - Content readable

#### [ ] ResponsiveTable.tsx (NEW)
- **Status:** Not yet created
- **Description:** Table that becomes card list on mobile
- **Mobile (< 768px):**
  - Hide table
  - Show card list instead
  - Each row becomes a card
  - Key fields in title, others below
- **Desktop (768px+):**
  - Show table
  - Horizontal scroll if needed
- **Card Layout:**
  ```
  Patient Name
  Date: 2026-06-07 | Type: Consultation
  Status: Completed
  ```
- **Test Requirements:**
  - Cards on mobile
  - Table on desktop
  - All data visible
  - Scrollable if needed

#### [ ] StatCard.tsx (REFACTOR if exists)
- **Status:** Used in dashboard
- **Mobile Changes:**
  - Padding: p-3 → sm:p-4
  - Font sizes responsive
  - Icon size: 32px mobile, 40px desktop
  - Value text: text-xl → sm:text-2xl
- **Test Requirements:**
  - Responsive padding
  - Stats readable on mobile
  - Icon visible
  - Value displayed correctly

---

## Modal & Dialog Components

### Priority: MEDIUM (Day 4)

#### [ ] ResponsiveModal.tsx (REFACTOR or NEW)
- **Status:** Likely uses Radix dialog
- **Mobile (< 768px):**
  - Full-width modal
  - Padding: 16px
  - Position: bottom sheet or full-screen
  - Max height: 90vh (safe for keyboard)
  - Close button: top-right, 48x48px
- **Tablet+ (768px):**
  - Max-width: 500px (centered)
  - Padding: 24px
- **Changes:**
  ```tsx
  Before: max-w-md w-full
  After:  w-full sm:max-w-md mx-auto
  ```
- **Close Behavior:**
  - Escape key always works
  - Backdrop click closes (on mobile)
  - Close button always visible
- **Test Requirements:**
  - Full-width on mobile
  - Centered on desktop
  - Close button accessible
  - Keyboard works
  - Backdrop click closes
  - Escape key closes

#### [ ] BottomSheet.tsx (NEW)
- **Status:** Not yet created
- **Description:** Mobile-specific bottom sheet dialog
- **Specs:**
  - Slides up from bottom
  - Max height: 90vh
  - Drag handle bar at top
  - Swipe to close (down gesture)
  - Animation: slide-in-up 300ms
- **Usage:**
  - Confirmation dialogs
  - Options menus
  - Quick actions
- **Test Requirements:**
  - Animates up/down smoothly
  - Swipe gesture works
  - Content scrollable
  - Close button works

---

## Data Visualization Components

### Priority: MEDIUM (Day 4-5)

#### [ ] ResponsiveChart.tsx (REFACTOR)
- **Status:** Recharts components exist
- **Mobile Changes:**
  - Single series only (if multiple on desktop)
  - Simplified labels
  - Vertical orientation for bar charts
  - Touch-friendly tooltip
  - Pinch-zoom support
- **Container Specs:**
  - Mobile: 100% width, height 250px
  - Tablet: height 300px
  - Desktop: height 350px
- **Touch Interaction:**
  - Pinch zoom enabled
  - Pan enabled
  - Tooltip on long-press
- **Test Requirements:**
  - Chart renders on mobile
  - Readable on small screen
  - Tooltip visible
  - Zoom works on tablet

#### [ ] PortfolioChart.tsx (REFACTOR)
- **Status:** Exists (DashboardAnalytics)
- **Mobile Changes:**
  - Single indicator on mobile
  - Show legend below chart
  - Responsive font sizes
  - Simplified tooltip
- **Test Requirements:**
  - Chart displays on mobile
  - All data represented
  - Legend visible
  - Readable values

---

## Navigation & Menu Components

### Priority: MEDIUM (Day 4)

#### [ ] BreadcrumbNav.tsx (REFACTOR if exists)
- **Status:** Check if used
- **Mobile Changes:**
  - Hide intermediate items on mobile
  - Show only: Home > Current Page
  - Use abbreviations if needed
  - Responsive font: text-xs sm:text-sm
- **Specs:**
  - Mobile: " > " separator
  - Desktop: full breadcrumb path
- **Test Requirements:**
  - Displays on mobile
  - Full path on desktop
  - Clickable items work

#### [ ] PaginationNav.tsx (REFACTOR if exists)
- **Status:** May exist in list pages
- **Mobile Changes:**
  - Prev/Next buttons only (no page numbers)
  - Full width buttons (50px minimum)
  - Icons + text
- **Desktop:**
  - Show page numbers
  - More options
- **Test Requirements:**
  - Navigation works
  - Buttons sized correctly
  - Page numbers on desktop

#### [ ] ActionMenu.tsx (NEW or REFACTOR)
- **Status:** Check if exists
- **Description:** Context menu for card/list actions
- **Mobile:**
  - Show as bottom sheet with buttons
  - Each action: full-width button
  - Large touch targets (48px)
- **Desktop:**
  - Dropdown menu from button
- **Test Requirements:**
  - Bottom sheet on mobile
  - Dropdown on desktop
  - Actions work correctly

---

## Specific Page Components

### Priority: HIGH (Day 3-4)

#### Dashboard (`/`) — DashboardAnalytics.tsx
- **Current:** Multi-column layout (desktop)
- **Changes:**
  - [ ] 1 column on mobile
  - [ ] 2 columns on tablet
  - [ ] 3+ on desktop
  - [ ] Responsive stat cards
  - [ ] Chart responsive
  - [ ] Summary card full-width on mobile
- **Mobile Specs:**
  - Cards: p-3
  - Stat value: text-lg (not 2xl)
  - Icon: 28px (not 32px)
- **Test Requirements:**
  - Layout stacks on mobile
  - Stats readable
  - Chart visible
  - All data shown

#### Agenda (`/agenda`) — AgendaView.tsx
- **Current:** Week view grid (complex)
- **Changes:**
  - [ ] Day view only on mobile
  - [ ] Swipe to next/prev day
  - [ ] Large time slots (48px height)
  - [ ] Consultation items: full-width cards
  - [ ] Toggle mobile tabs: Day / Week / Month
- **Mobile Tabs:**
  - Day (default on mobile)
  - Week (swipe enabled)
  - Month (calendar view)
- **Test Requirements:**
  - Day view on mobile
  - Week view on tablet+
  - Swipe gesture works
  - Items clickable
  - Times readable

#### Pacientes (`/pacientes`) — PatientList
- **Current:** Table + Cards
- **Changes:**
  - [ ] Card list only on mobile
  - [ ] Cards: vertical layout
  - [ ] Search bar: sticky top, mobile-sized
  - [ ] Filters: bottom sheet on mobile
  - [ ] Infinite scroll on mobile
- **Mobile Search:**
  - Input: full-width, height 48px
  - Clear button: 48x48px
  - Search icon: inside input
- **Mobile Filters:**
  - Bottom sheet (90vh max)
  - Apply/Reset buttons: full-width
- **Test Requirements:**
  - Cards display on mobile
  - Search works
  - Filters accessible
  - Scroll performance good

#### Anamnese Forms — AnamneseFirstConsultation.tsx
- **Current:** Long form
- **Changes:**
  - [ ] Mobile: step-by-step wizard
  - [ ] Desktop: all sections visible
  - [ ] Progress indicator on mobile
  - [ ] Next/Back buttons: full-width, 48px
  - [ ] Inputs: full-width, 48px height
- **Mobile Sections:**
  - Patient info (step 1)
  - Medical history (step 2)
  - Current complaint (step 3)
  - Exam (step 4)
  - Assessment (step 5)
- **Mobile Progress:**
  - Show: "Step 2 of 5"
  - Progress bar at top
  - Current step highlighted
- **Test Requirements:**
  - Steps display one per screen
  - Navigation works
  - Data persists across steps
  - Submit works at end

#### Financeiro (`/financeiro`) — FinancialDashboard
- **Current:** Tables + Charts
- **Changes:**
  - [ ] Responsive cards instead of tables
  - [ ] Charts responsive (smaller on mobile)
  - [ ] Summary row: full-width cards
  - [ ] Metric cards: single column mobile
- **Mobile Cards:**
  - Amount: prominent
  - Date: secondary
  - Type/Category: badge
- **Test Requirements:**
  - Cards display on mobile
  - Totals correct
  - Charts visible
  - Navigation works

---

## Utility & Hook Components

### Priority: MEDIUM (Day 4-5)

#### [ ] useMediaQuery.ts (NEW or VERIFY)
- **Status:** Check if exists
- **Purpose:** Hook for breakpoint queries
- **Implementation:**
  ```typescript
  export function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false);
    
    useEffect(() => {
      const media = window.matchMedia(query);
      setMatches(media.matches);
      
      const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }, [query]);
    
    return matches;
  }
  ```
- **Usage:**
  ```typescript
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(min-width: 768px)');
  ```

#### [ ] useSwipe.ts (NEW)
- **Status:** Not yet created
- **Purpose:** Gesture handling for mobile navigation
- **Detects:** Swipe left, right, up, down
- **Usage:**
  ```typescript
  const { handleTouchStart, handleTouchEnd } = useSwipe({
    onSwipeLeft: () => navigateNext(),
    onSwipeRight: () => navigatePrev(),
  });
  ```

#### [ ] usePullToRefresh.ts (NEW)
- **Status:** Not yet created
- **Purpose:** Pull-to-refresh gesture
- **Behavior:**
  - Detect pull down at top of page
  - Show refresh indicator
  - Call refresh callback
  - Reset on finish
- **Usage:**
  ```typescript
  const { handleTouchStart, handleTouchMove, handleTouchEnd, pulling } = usePullToRefresh(onRefresh);
  ```

#### [ ] useFocusVisible.ts (NEW or VERIFY)
- **Status:** Check if exists
- **Purpose:** Show focus ring only on keyboard nav
- **Prevents:** Outline on mouse click
- **Usage:**
  ```typescript
  const isFocusVisible = useFocusVisible();
  <button className={isFocusVisible ? 'ring-2' : ''} />
  ```

---

## Image & Media Components

### Priority: MEDIUM (Day 4-5)

#### [ ] ResponsiveImage.tsx (NEW or VERIFY)
- **Status:** Check if wrapper exists
- **Purpose:** Optimized image with responsive sizing
- **Specs:**
  - Use next/image
  - Multiple sizes: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1280px"`
  - Lazy loading by default
  - WebP + AVIF formats
- **Usage:**
  ```tsx
  <ResponsiveImage
    src="/patient-photo.jpg"
    alt="Patient"
    width={400}
    height={300}
    className="rounded-xl"
  />
  ```

#### [ ] AvatarImage.tsx (REFACTOR if exists)
- **Status:** Likely exists
- **Changes:**
  - [ ] Responsive sizing
  - [ ] Lazy loading
  - [ ] Fallback placeholder
  - [ ] Loading skeleton
- **Specs:**
  - Mobile: 40px
  - Desktop: 48px
  - Responsive: `w-10 sm:w-12`

---

## Status & Progress Summary

### Implementation Status
- **Not Created:** ~15 components (NEW)
- **Need Refactoring:** ~25 components (REFACTOR)
- **May Need Review:** ~7 components (VERIFY)
- **Total:** 47+ components

### Priority Breakdown
| Priority | Count | Days |
|----------|-------|------|
| HIGH | 20 | 2-4 |
| MEDIUM | 18 | 4-5 |
| LOW | 9 | 5-6 |

---

## Component Update Workflow

### For Each Component:
1. **Review Current Code**
   - Check existing implementation
   - Identify desktop-first patterns
   - List mobile issues

2. **Design Mobile Layout**
   - Sketch mobile appearance
   - List responsive changes
   - Define breakpoints

3. **Update Component**
   - Add mobile-first classes
   - Update TypeScript types
   - Add responsive behaviors

4. **Test on Devices**
   - iPhone SE (smallest)
   - Pixel 5 (typical android)
   - iPad (tablet)
   - Desktop (1440px)

5. **Document Changes**
   - List modifications
   - Add usage examples
   - Note breaking changes

6. **E2E Tests**
   - Layout assertions
   - Touch interactions
   - Responsive behavior

---

## Testing Checklist Per Component

For each component, verify:

- [ ] Layout correct on 320px screen
- [ ] Layout correct on 480px screen
- [ ] Layout correct on 640px screen
- [ ] Layout correct on 768px screen
- [ ] Layout correct on 1024px screen
- [ ] Layout correct on 1280px screen
- [ ] Touch targets >= 48px
- [ ] Text readable (no overflow)
- [ ] Images responsive
- [ ] Forms touch-friendly
- [ ] Dark mode works
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] No layout shift on load (CLS)
- [ ] Performance acceptable

---

## Rollout Schedule

**Day 2:** Navigation (4 components)  
**Day 3:** Lists + Cards + Forms (12 components)  
**Day 4:** Layouts + Modals + Page-specific (15 components)  
**Day 5:** Data viz + Utilities (10 components)  
**Day 6:** Images + Polish + Testing (6 components)

---

**Total: 47+ Components | 6-Day Implementation | High-Quality Delivery**
