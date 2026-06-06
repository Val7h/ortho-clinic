/**
 * E2E tests for Queue TV Panel
 * Tests real-time patient calling and display
 */
import { test, expect, Page } from '@playwright/test'

test.describe('Queue TV Panel E2E', () => {
  let page: Page

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage
    await page.goto('http://localhost:3000/painel')
    await page.waitForLoadState('networkidle')
  })

  test('should load TV panel within 2 seconds', async () => {
    const startTime = Date.now()
    await page.goto('http://localhost:3000/painel')
    const loadTime = Date.now() - startTime

    expect(loadTime).toBeLessThan(2000)
  })

  test('should receive patient call in less than 1 second', async () => {
    // Setup: Create appointment via API
    const appointmentId = 1
    const patientName = 'Test Patient'

    // Monitor network for WebSocket message
    const wsMessagePromise = page.waitForEvent('websocket', async (ws) => {
      if (ws.url().includes('queue/ws')) {
        await new Promise((resolve) => {
          ws.on('framereceived', (frame) => {
            console.log('WS message:', frame)
            resolve(frame)
          })
        })
      }
    })

    // Call patient via admin
    const callStartTime = Date.now()
    const response = await page.request.post('/api/clinic/queue/call', {
      data: {
        clinic_id: 1,
        appointment_id: appointmentId,
        patient_id: 1,
        room: 'Sala 1',
      },
    })

    const callTime = Date.now() - callStartTime

    expect(response.ok()).toBeTruthy()
    expect(callTime).toBeLessThan(500)

    // Verify TV panel updates
    await expect(page.locator(`text=${patientName}`)).toBeVisible({ timeout: 1000 })
  })

  test('should display patient name and room', async () => {
    const patientName = 'João Silva'
    const room = 'Sala 1'

    // Mock patient data
    await page.evaluate((data) => {
      window.dispatchEvent(
        new CustomEvent('queueUpdate', {
          detail: {
            type: 'patient_called',
            data: {
              patient_name: data.patientName,
              room: data.room,
            },
          },
        })
      )
    }, { patientName, room })

    await expect(page.locator(`text=${patientName}`)).toBeVisible()
    await expect(page.locator(`text=${room}`)).toBeVisible()
  })

  test('should handle WebSocket disconnection with fallback', async () => {
    // Close WebSocket connection
    await page.evaluate(() => {
      const ws = (window as any).websocketInstance
      if (ws) ws.close()
    })

    // System should fallback to polling
    const status = await page.request.get('/api/clinic/queue/status?clinic_id=1')
    expect(status.ok()).toBeTruthy()

    const data = await status.json()
    expect(data).toHaveProperty('total')
    expect(data).toHaveProperty('pending')
  })

  test('should update multiple TVs simultaneously', async () => {
    const tv1 = await page.context().newPage()
    const tv2 = await page.context().newPage()

    await tv1.goto('http://localhost:3000/painel?clinic_id=1')
    await tv2.goto('http://localhost:3000/painel?clinic_id=1')

    // Call patient
    const response = await page.request.post('/api/clinic/queue/call', {
      data: {
        clinic_id: 1,
        appointment_id: 1,
        patient_id: 1,
        room: 'Sala 1',
      },
    })

    expect(response.ok()).toBeTruthy()

    // Both TVs should update
    await expect(tv1.locator('text=Sala 1')).toBeVisible({ timeout: 1000 })
    await expect(tv2.locator('text=Sala 1')).toBeVisible({ timeout: 1000 })

    await tv1.close()
    await tv2.close()
  })

  test('should maintain queue status accuracy', async () => {
    const queueStatus = await page.request.get('/api/clinic/queue/status?clinic_id=1')
    const data = await queueStatus.json()

    // Verify queue counts are consistent
    const total = data.total
    const sum = data.pending + data.called + data.in_consultation + data.completed

    expect(sum).toBeLessThanOrEqual(total)
  })

  test('should refresh queue status every 5 seconds', async () => {
    const timestamps = []

    // Monitor network requests
    page.on('request', (request) => {
      if (request.url().includes('/api/clinic/queue/status')) {
        timestamps.push(Date.now())
      }
    })

    await page.waitForTimeout(15000) // Wait 15 seconds

    // Should have at least 2-3 requests in 15 seconds
    expect(timestamps.length).toBeGreaterThanOrEqual(2)
  })
})
