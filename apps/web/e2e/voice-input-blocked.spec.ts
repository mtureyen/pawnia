import { expect, test } from '@playwright/test'

// Without --use-fake-ui-for-media-stream and without the permission granted, Chrome turns the
// request for the microphone down, as when the user blocked it.
test('a blocked microphone says how to allow it', async ({ page }) => {
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
