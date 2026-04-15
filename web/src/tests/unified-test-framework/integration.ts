import { beforeEach, describe, it } from 'vitest'
import { MockFactory } from './mockFactory'
import type { E2EScenario, IntegrationScenario } from './types'

export class IntegrationTestFramework {
  private mockFactory = new MockFactory()

  async testApiIntegration(apiName: string, scenarios: IntegrationScenario[]) {
    describe(`${apiName} - Integration Tests`, () => {
      beforeEach(() => {
        this.mockFactory.resetAll()
      })

      scenarios.forEach((scenario, index) => {
        it(`scenario ${index + 1}: ${scenario.description}`, async () => {
          scenario.setupMocks?.(this.mockFactory)

          const result = await scenario.execute()

          scenario.assertions.forEach(assertion => {
            assertion(result)
          })

          scenario.cleanup?.()
        })
      })
    })
  }

  async testEndToEnd(scenarios: E2EScenario[]) {
    describe('End-to-End Tests', () => {
      scenarios.forEach((scenario, index) => {
        it(`E2E ${index + 1}: ${scenario.description}`, async () => {
          await scenario.setup()
          const result = await scenario.execute()
          await scenario.verify(result)
          await scenario.cleanup()
        })
      })
    })
  }
}

export const integrationTester = new IntegrationTestFramework()
