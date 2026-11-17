import { expect, test } from './test'

// The browser turns the request for the microphone down, as when the user blocked it. Done in
// the page rather than left to the browser: how a browser refuses without a prompt differs
// (Chrome on a desktop says "not allowed", Playwright's Chromium on a server "not supported").
test('a blocked microphone says how to allow it', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Turn on voice input' }).click()
  await page
    .getByRole('dialog', { name: 'Voice input' })
    .getByRole('button', { name: 'Download and turn on' })
    .click()
  const voice = page.getByRole('region', { name: 'Voice' })
  await expect(voice.getByRole('alert')).toContainText('The microphone is blocked')
  await expect(page.getByTestId('voice-state')).toHaveText('No microphone')
  // Space does nothing then: there is no microphone to talk into.
  await page.keyboard.press(' ')
  await expect(page.locator('.move-tree [data-san]')).toHaveCount(0)
})
