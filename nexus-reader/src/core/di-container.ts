/**
 * 依赖注入容器
 * 实现控制反转和依赖管理
 */
import { logger } from '@/utils/unified-utils'

interface ServiceLifetime {
  singleton: 'singleton'
  transient: 'transient'
  scoped: 'scoped'
}

interface ServiceDescriptor<T = any> {
  token: string | symbol
  implementation: new (...args: any[]) => T | (() => T) | any
  lifetime: keyof ServiceLifetime
  dependencies?: (string | symbol)[]
  factory?: () => T
}

interface ServiceInstance<T = any> {
  instance: T
  descriptor: ServiceDescriptor<T>
  createdAt: number
  scopeId?: string
}

export class DependencyInjectionContainer {
  private static instance: DependencyInjectionContainer
  private services = new Map<string | symbol, ServiceDescriptor>()
  private instances = new Map<string | symbol, ServiceInstance>()
  private scopes = new Map<string, Map<string | symbol, ServiceInstance>>()

  private constructor() {
    this.registerCoreServices()
  }

  static getInstance(): DependencyInjectionContainer {
    if (!DependencyInjectionContainer.instance) {
      DependencyInjectionContainer.instance = new DependencyInjectionContainer()
    }
    return DependencyInjectionContainer.instance
  }

  /**
   * 注册服务
   */
  register<T>(
    token: string | symbol,
    implementation: new (...args: any[]) => T | (() => T),
    lifetime: keyof ServiceLifetime = 'singleton',
    dependencies: (string | symbol)[] = []
  ): void {
    if (this.services.has(token)) {
      logger.warn('Service already registered, overwriting', { token: token.toString() })
    }

    this.services.set(token, {
      token,
      implementation,
      lifetime,
      dependencies,
    })

    logger.debug('Service registered', {
      token: token.toString(),
      lifetime,
      dependencies: dependencies.map(d => d.toString()),
    })
  }

  /**
   * 注册工厂函数
   */
  registerFactory<T>(
    token: string | symbol,
    factory: () => T,
    lifetime: keyof ServiceLifetime = 'singleton'
  ): void {
    this.services.set(token, {
      token,
      implementation: factory as any,
      lifetime,
      factory,
    })

    logger.debug('Factory registered', { token: token.toString(), lifetime })
  }

  /**
   * 注册实例
   */
  registerInstance<T>(token: string | symbol, instance: T): void {
    const descriptor: ServiceDescriptor<T> = {
      token,
      implementation: (() => instance) as any,
      lifetime: 'singleton',
    }

    this.instances.set(token, {
      instance,
      descriptor,
      createdAt: Date.now(),
    })

    logger.debug('Instance registered', { token: token.toString() })
  }

  /**
   * 解析服务
   */
  resolve<T>(token: string | symbol, scopeId?: string): T {
    // 检查作用域实例
    if (scopeId && this.scopes.has(scopeId)) {
      const scopedInstances = this.scopes.get(scopeId)!
      const scopedInstance = scopedInstances.get(token)
      if (scopedInstance) {
        return scopedInstance.instance
      }
    }

    // 检查单例实例
    const singletonInstance = this.instances.get(token)
    if (singletonInstance) {
      return singletonInstance.instance
    }

    // 获取服务描述符
    const descriptor = this.services.get(token)
    if (!descriptor) {
      throw new Error(`Service not registered: ${token.toString()}`)
    }

    // 解析依赖
    const dependencies = descriptor.dependencies?.map(dep => this.resolve(dep, scopeId)) || []

    // 创建实例
    let instance: T
    try {
      if (descriptor.factory) {
        instance = descriptor.factory()
      } else if (typeof descriptor.implementation === 'function') {
        if (descriptor.implementation.prototype?.constructor) {
          // 构造函数
          instance = new (descriptor.implementation as new (...args: any[]) => T)(...dependencies)
        } else {
          // 工厂函数
          instance = (descriptor.implementation as unknown as () => T)()
        }
      } else {
        throw new Error(`Invalid implementation for service: ${token.toString()}`)
      }
    } catch (error: any) {
      logger.error('Failed to create service instance', {
        token: token.toString(),
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    // 根据生命周期管理实例
    const serviceInstance: ServiceInstance<T> = {
      instance,
      descriptor,
      createdAt: Date.now(),
      scopeId,
    }

    switch (descriptor.lifetime) {
      case 'singleton':
        this.instances.set(token, serviceInstance)
        break
      case 'scoped':
        if (!scopeId) {
          throw new Error(`Scoped service requires scopeId: ${token.toString()}`)
        }
        if (!this.scopes.has(scopeId)) {
          this.scopes.set(scopeId, new Map())
        }
        this.scopes.get(scopeId)!.set(token, serviceInstance)
        break
      case 'transient':
        // 瞬时服务不缓存
        break
    }

    logger.debug('Service resolved', {
      token: token.toString(),
      lifetime: descriptor.lifetime,
      scopeId,
    })

    return instance
  }

  /**
   * 创建作用域
   */
  createScope(scopeId: string): () => void {
    if (this.scopes.has(scopeId)) {
      logger.warn('Scope already exists, overwriting', { scopeId })
    }

    this.scopes.set(scopeId, new Map())

    logger.debug('Scope created', { scopeId })

    // 返回清理函数
    return () => {
      this.clearScope(scopeId)
    }
  }

  /**
   * 清除作用域
   */
  clearScope(scopeId: string): void {
    if (this.scopes.has(scopeId)) {
      const scopedInstances = this.scopes.get(scopeId)!

      // 调用可销毁实例的清理方法
      for (const [token, serviceInstance] of scopedInstances) {
        try {
          if (
            typeof serviceInstance.instance === 'object' &&
            serviceInstance.instance !== null &&
            'dispose' in serviceInstance.instance
          ) {
            ;(serviceInstance.instance as any).dispose()
          }
        } catch (error: any) {
          logger.warn('Failed to dispose scoped service', {
            token: token.toString(),
            scopeId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      this.scopes.delete(scopeId)
      logger.debug('Scope cleared', { scopeId })
    }
  }

  /**
   * 检查服务是否已注册
   */
  isRegistered(token: string | symbol): boolean {
    return this.services.has(token) || this.instances.has(token)
  }

  /**
   * 获取服务描述符
   */
  getDescriptor(token: string | symbol): ServiceDescriptor | undefined {
    return this.services.get(token)
  }

  /**
   * 获取所有注册的服务
   */
  getRegisteredServices(): Array<{ token: string | symbol; lifetime: keyof ServiceLifetime }> {
    const services: Array<{ token: string | symbol; lifetime: keyof ServiceLifetime }> = []

    for (const [token, descriptor] of this.services) {
      services.push({
        token,
        lifetime: descriptor.lifetime,
      })
    }

    return services
  }

  /**
   * 获取服务统计信息
   */
  getStats(): {
    registeredServices: number
    singletonInstances: number
    activeScopes: number
    scopedInstances: number
  } {
    let scopedInstances = 0
    for (const scopedMap of this.scopes.values()) {
      scopedInstances += scopedMap.size
    }

    return {
      registeredServices: this.services.size,
      singletonInstances: this.instances.size,
      activeScopes: this.scopes.size,
      scopedInstances,
    }
  }

  /**
   * 注册核心服务
   */
  private registerCoreServices(): void {
    // 注册核心服务
    // 这里可以预注册一些核心服务

    logger.info('Core services registered')
  }

  /**
   * 清理所有实例（用于测试或重新初始化）
   */
  clearAll(): void {
    // 清理作用域
    for (const scopeId of this.scopes.keys()) {
      this.clearScope(scopeId)
    }

    // 清理单例实例
    for (const [token, serviceInstance] of this.instances) {
      try {
        if (
          typeof serviceInstance.instance === 'object' &&
          serviceInstance.instance !== null &&
          'dispose' in serviceInstance.instance
        ) {
          ;(serviceInstance.instance as any).dispose()
        }
      } catch (error: any) {
        logger.warn('Failed to dispose service', {
          token: token.toString(),
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    this.instances.clear()
    this.services.clear()

    logger.info('All services cleared')
  }
}

// 便捷的装饰器
export function Injectable(token?: string | symbol) {
  return function (constructor: any) {
    const serviceToken = token || constructor.name
    const container = DependencyInjectionContainer.getInstance()

    // 自动分析构造函数依赖
    const paramTypes = (Reflect as any).getMetadata?.('design:paramtypes', constructor) || []
    const dependencies = paramTypes.map((paramType: any) => paramType.name)

    container.register(serviceToken, constructor, 'singleton', dependencies)
  }
}

export function Inject(token: string | symbol) {
  return function (target: any, propertyKey: string, parameterIndex?: number) {
    const container = DependencyInjectionContainer.getInstance()

    if (parameterIndex !== undefined) {
      // 构造函数参数注入
      const existingDeps = (Reflect as any).getMetadata('design:paramtypes', target) || []
      existingDeps[parameterIndex] = token
      ;(Reflect as any).defineMetadata('design:paramtypes', existingDeps, target)
    } else {
      // 属性注入
      Object.defineProperty(target, propertyKey, {
        get: () => container.resolve(token),
        enumerable: true,
        configurable: true,
      })
    }
  }
}

// 导出单例实例和便捷函数
export const diContainer = DependencyInjectionContainer.getInstance()

export function registerService<T>(
  token: string | symbol,
  implementation: new (...args: any[]) => T,
  lifetime: keyof ServiceLifetime = 'singleton',
  dependencies: (string | symbol)[] = []
): void {
  diContainer.register(token, implementation, lifetime, dependencies)
}

export function resolveService<T>(token: string | symbol, scopeId?: string): T {
  return diContainer.resolve(token, scopeId)
}

export function createScope(scopeId: string): () => void {
  return diContainer.createScope(scopeId)
}
