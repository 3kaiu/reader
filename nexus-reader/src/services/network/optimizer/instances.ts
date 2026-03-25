import { NetworkDetector } from './networkDetector'
import { RequestOptimizer } from './requestOptimizer'

export const networkDetector = new NetworkDetector()
export const requestOptimizer = new RequestOptimizer(networkDetector)
