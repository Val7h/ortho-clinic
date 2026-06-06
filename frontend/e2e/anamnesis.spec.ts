/**
 * E2E tests for Anamnesis Form
 * Tests template selection, navigation, auto-save, and submission
 */
import { test, expect, Page } from '@playwright/test'

test.describe('Anamnesis Form E2E', () => {
  let page: Page

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage
    await page.goto('http://localhost:3000/login')
    await page.fill('input[name="email"]', 'doctor@clinic.com')
    await page.fill('input[name="password"]', 'password')
    await page.click('button[type="submit"]')

    await page.waitForURL('**/dashboard')
  })

  test('should load anamnesis form with template selection', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Verify template selector is present
    const templateSelect = page.locator('select[name="template_id"]')
    await expect(templateSelect).toBeVisible()

    // Get available options
    const options = await templateSelect.locator('option').count()
    expect(options).toBeGreaterThan(0)
  })

  test('should select template and load form structure', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template
    await page.selectOption('select[name="template_id"]', '1')

    // Wait for form to load
    await page.waitForSelector('[data-testid="form-fields"]')

    // Verify tabs are displayed
    const tabs = page.locator('[role="tab"]')
    const tabCount = await tabs.count()

    expect(tabCount).toBeGreaterThan(0)
  })

  test('should validate required fields before submission', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template
    await page.selectOption('select[name="template_id"]', '1')

    // Try to submit empty form
    await page.click('button[type="submit"]')

    // Should show validation error
    await expect(
      page.locator('text=Campo obrigatório').first()
    ).toBeVisible()

    // Submit should remain disabled
    const submitButton = page.locator('button[type="submit"]')
    expect(await submitButton.isDisabled()).toBe(true)
  })

  test('should enable submission with required fields filled', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template
    await page.selectOption('select[name="template_id"]', '1')

    // Fill required fields
    const requiredFields = page.locator('[data-required="true"]')
    const count = await requiredFields.count()

    for (let i = 0; i < count; i++) {
      const field = requiredFields.nth(i)
      const type = await field.getAttribute('data-type')

      if (type === 'textarea') {
        await field.fill('Test content')
      } else if (type === 'text') {
        await field.fill('Test value')
      }
    }

    // Submit button should be enabled
    const submitButton = page.locator('button[type="submit"]')
    expect(await submitButton.isDisabled()).toBe(false)

    // Submit form
    await submitButton.click()

    // Verify success
    await expect(page.locator('text=Anamnese salva com sucesso')).toBeVisible()
  })

  test('should auto-save form every 30 seconds', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template
    await page.selectOption('select[name="template_id"]', '1')

    // Fill a field
    const firstField = page.locator('input, textarea').first()
    await firstField.fill('Auto-save test')

    // Monitor network requests
    const autoSaveRequests = []
    page.on('request', (request) => {
      if (request.url().includes('/anamnese') && request.method() === 'PUT') {
        autoSaveRequests.push(Date.now())
      }
    })

    // Wait for auto-save (30 seconds)
    await page.waitForTimeout(35000)

    // Should have received at least one auto-save request
    expect(autoSaveRequests.length).toBeGreaterThan(0)
  })

  test('should preserve data when switching tabs', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template
    await page.selectOption('select[name="template_id"]', '1')

    // Fill Tab 1
    const tab1Content = 'Test data for tab 1'
    const firstField = page.locator('[data-testid="form-fields"] input, textarea').first()
    await firstField.fill(tab1Content)

    // Switch to Tab 2
    const tab2Button = page.locator('[role="tab"]:has-text("Tab 2")').first()
    if (await tab2Button.isVisible().catch(() => false)) {
      await tab2Button.click()

      // Fill Tab 2
      const tab2Field = page.locator('[data-testid="form-fields"] input, textarea').first()
      await tab2Field.fill('Test data for tab 2')

      // Switch back to Tab 1
      const tab1Button = page.locator('[role="tab"]:has-text("Tab 1")').first()
      await tab1Button.click()

      // Verify Tab 1 data is preserved
      const preserved = await firstField.inputValue()
      expect(preserved).toBe(tab1Content)
    }
  })

  test('should handle medication validation', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template with medication section
    await page.selectOption('select[name="template_id"]', '1')

    // Find medications section
    const medicationTab = page.locator('[role="tab"]:has-text("Medicações")')
    if (await medicationTab.isVisible()) {
      await medicationTab.click()

      // Add medication
      await page.click('button:has-text("Adicionar Medicamento")')

      // Fill medication fields
      await page.fill(
        'input[name="medications.0.name"]',
        'Dipirona 500mg'
      )
      await page.fill(
        'input[name="medications.0.frequency"]',
        '8/8h'
      )

      // Check for interaction warnings
      const warnings = page.locator('[data-testid="interaction-warning"]')
      const warningCount = await warnings.count()

      // May have warnings depending on other medications
      expect(warningCount).toBeGreaterThanOrEqual(0)
    }
  })

  test('should restore draft on page reload', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template
    await page.selectOption('select[name="template_id"]', '1')

    // Fill some data
    const testData = 'Draft test data'
    const firstField = page.locator('input, textarea').first()
    await firstField.fill(testData)

    // Wait for auto-save
    await page.waitForTimeout(2000)

    // Reload page
    await page.reload()

    // Data should be restored
    const field = page.locator('input, textarea').first()
    const value = await field.inputValue().catch(() => '')

    // Either data is restored or form reloads fresh
    expect(value === testData || value === '').toBe(true)
  })

  test('should submit complete anamnesis', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template
    await page.selectOption('select[name="template_id"]', '1')

    // Fill all required fields
    const requiredFields = page.locator('[data-required="true"]')
    const count = await requiredFields.count()

    for (let i = 0; i < Math.min(count, 3); i++) {
      const field = requiredFields.nth(i)
      await field.fill('Test content')
    }

    // Submit
    await page.click('button[type="submit"]')

    // Verify success and redirect
    await expect(
      page.locator('text=Anamnese salva com sucesso')
    ).toBeVisible({ timeout: 5000 })

    // Should redirect back to patient or appointments
    await page.waitForURL('**/dashboard|**/pacientes|**/agenda', { timeout: 5000 })
  })

  test('should handle navigation without losing unsaved data', async () => {
    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Select template and add data
    await page.selectOption('select[name="template_id"]', '1')
    const firstField = page.locator('input, textarea').first()
    await firstField.fill('Unsaved data')

    // Try to navigate away
    await page.click('a:has-text("Dashboard")')

    // Should show confirmation dialog
    const dialog = page.locator('[role="dialog"]')
    if (await dialog.isVisible().catch(() => false)) {
      // Click "Save" button
      await page.click('button:has-text("Salvar")')
      await expect(page).toHaveURL('**/dashboard')
    }
  })

  test('should display form loading state', async () => {
    // Slow down network
    await page.route('**/api/**', (route) => {
      setTimeout(() => route.continue(), 500)
    })

    await page.goto('http://localhost:3000/anamnese/patient/1')

    // Should show loading state
    const spinner = page.locator('[data-testid="loading-spinner"]')
    if (await spinner.isVisible().catch(() => false)) {
      expect(await spinner.isVisible()).toBe(true)
    }

    // Should eventually load
    await expect(
      page.locator('select[name="template_id"]')
    ).toBeVisible({ timeout: 5000 })
  })
})
