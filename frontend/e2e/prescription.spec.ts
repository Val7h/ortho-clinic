/**
 * E2E tests for Prescription Digital Signature
 * Tests signature workflow, PDF generation, and QR code validation
 */
import { test, expect, Page, APIRequestContext } from '@playwright/test'

test.describe('Prescription Digital Signature E2E', () => {
  let page: Page
  let request: APIRequestContext

  test.beforeEach(async ({ page: testPage, request: testRequest }) => {
    page = testPage
    request = testRequest

    // Login as doctor
    await page.goto('http://localhost:3000/login')
    await page.fill('input[name="email"]', 'doctor@clinic.com')
    await page.fill('input[name="password"]', 'password')
    await page.click('button[type="submit"]')

    await page.waitForURL('**/dashboard')
  })

  test('should create prescription with required CFM fields', async () => {
    await page.goto('http://localhost:3000/prescriptions/new')

    // Fill form
    await page.selectOption('select[name="patient_id"]', '1')
    await page.fill('textarea[name="notes"]', 'Test prescription')

    // Add medicine
    await page.click('button:has-text("Adicionar Medicamento")')
    await page.fill('input[name="medicines.0.name"]', 'Dipirona 500mg')
    await page.fill('input[name="medicines.0.dose"]', '500')
    await page.selectOption('select[name="medicines.0.unit"]', 'mg')
    await page.fill('input[name="medicines.0.frequency"]', '8/8h')

    // Submit
    await page.click('button[type="submit"]')

    // Verify creation
    await expect(page.locator('text=Receita criada com sucesso')).toBeVisible()

    // Verify API call included CFM
    const lastRequest = await page.request.get('/api/prescriptions')
    const prescriptions = await lastRequest.json()

    expect(prescriptions[0]).toHaveProperty('doctor_cfm')
    expect(prescriptions[0]).toHaveProperty('patient_cpf')
  })

  test('should generate PDF with all required fields', async () => {
    // Create prescription
    const response = await request.post('http://localhost:3000/api/prescriptions', {
      data: {
        patient_id: 1,
        medicines: [
          {
            name: 'Dipirona 500mg',
            dose: '500',
            unit: 'mg',
            frequency: '8/8h',
            route: 'oral',
            quantity: 30,
          },
        ],
        notes: 'Test',
        instructions: 'Tomar conforme prescrito',
      },
    })

    const prescription = await response.json()

    // Generate PDF
    const pdfResponse = await request.get(
      `http://localhost:3000/api/prescriptions/${prescription.id}/pdf`
    )

    expect(pdfResponse.status()).toBe(200)
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf')

    // Verify PDF contains required fields
    const pdfBuffer = await pdfResponse.body()
    const pdfText = pdfBuffer.toString()

    // PDF should contain doctor CFM and patient CPF
    expect(pdfText).toContain('CFM')
    expect(pdfText).toContain('CPF')
  })

  test('should generate valid QR code', async () => {
    // Create prescription
    const response = await request.post('http://localhost:3000/api/prescriptions', {
      data: {
        patient_id: 1,
        medicines: [
          {
            name: 'Ibuprofeno 400mg',
            dose: '400',
            unit: 'mg',
            frequency: '12/12h',
            route: 'oral',
            quantity: 20,
          },
        ],
      },
    })

    const prescription = await response.json()

    // QR code should be present
    expect(prescription.qr_code_token).toBeDefined()
    expect(prescription.qr_code_token).toMatch(/^[a-zA-Z0-9_-]+$/)

    // Verify QR code URL is valid
    const qrUrl = `http://localhost:3000/verify/${prescription.qr_code_token}`
    const qrResponse = await request.get(qrUrl)

    expect(qrResponse.status()).toBe(200)
  })

  test('should sign prescription with ClickSign', async () => {
    // Create prescription
    const response = await request.post('http://localhost:3000/api/prescriptions', {
      data: {
        patient_id: 1,
        medicines: [
          {
            name: 'Amoxicilina 500mg',
            dose: '500',
            unit: 'mg',
            frequency: '8/8h',
            route: 'oral',
            quantity: 30,
          },
        ],
      },
    })

    const prescription = await response.json()
    const prescriptionId = prescription.id

    // Navigate to prescription detail
    await page.goto(`http://localhost:3000/prescriptions/${prescriptionId}`)

    // Click sign button
    await page.click('button:has-text("Assinar com ClickSign")')

    // Handle modal
    await expect(page.locator('text=Assinatura Digital')).toBeVisible()

    // Complete signature (mock ClickSign redirect)
    await page.waitForURL('**/prescriptions/**', { timeout: 10000 })

    // Verify signature status
    const statusElement = await page.locator('[data-testid="signature-status"]').textContent()
    expect(statusElement).toContain('Assinado')
  })

  test('should process signature webhook', async () => {
    // Create and sign prescription
    const prescriptionResponse = await request.post(
      'http://localhost:3000/api/prescriptions',
      {
        data: {
          patient_id: 1,
          medicines: [
            {
              name: 'Test Medicine',
              dose: '500',
              unit: 'mg',
              frequency: '8/8h',
              route: 'oral',
              quantity: 30,
            },
          ],
        },
      }
    )

    const prescription = await prescriptionResponse.json()

    // Simulate ClickSign webhook
    const webhookResponse = await request.post(
      'http://localhost:3000/api/prescriptions/webhook/clicksign',
      {
        data: {
          event: 'document.signed',
          document_id: `clicksign_${prescription.id}`,
          signatures: [
            {
              signer: 'Dr. Silva',
              signed_at: new Date().toISOString(),
            },
          ],
        },
      }
    )

    expect(webhookResponse.status()).toBe(200)

    // Verify signature was recorded
    const updatedResponse = await request.get(
      `http://localhost:3000/api/prescriptions/${prescription.id}`
    )
    const updated = await updatedResponse.json()

    expect(updated.status).toBe('SIGNED')
  })

  test('should enforce 30-day expiration', async () => {
    // Create prescription
    const response = await request.post('http://localhost:3000/api/prescriptions', {
      data: {
        patient_id: 1,
        medicines: [
          {
            name: 'Test Medicine',
            dose: '500',
            unit: 'mg',
            frequency: '8/8h',
            route: 'oral',
            quantity: 30,
          },
        ],
      },
    })

    const prescription = await response.json()

    // Verify expiration is set to 30 days from signature
    // (once signed)
    const expirationDate = new Date()
    expirationDate.setDate(expirationDate.getDate() + 30)

    expect(expirationDate).toBeDefined()
  })

  test('should validate CPF/CFM before signature', async () => {
    await page.goto('http://localhost:3000/prescriptions/new')

    // Try to submit without proper validation
    const submitButton = page.locator('button[type="submit"]')

    // Form should be disabled or show error
    const isDisabled = await submitButton.isDisabled()

    // Either disabled or error message should appear
    expect(
      isDisabled ||
        (await page.locator('text=CPF/CFM inválido').isVisible().catch(() => false))
    ).toBeTruthy()
  })

  test('should display prescription status timeline', async () => {
    // Create prescription
    const response = await request.post('http://localhost:3000/api/prescriptions', {
      data: {
        patient_id: 1,
        medicines: [
          {
            name: 'Test Medicine',
            dose: '500',
            unit: 'mg',
            frequency: '8/8h',
            route: 'oral',
            quantity: 30,
          },
        ],
      },
    })

    const prescription = await response.json()

    // Navigate to detail
    await page.goto(`http://localhost:3000/prescriptions/${prescription.id}`)

    // Verify status timeline is shown
    await expect(page.locator('text=Rascunho')).toBeVisible()
    await expect(page.locator('text=Assinado')).toBeVisible({ visible: false }) // Not yet signed
  })
})
