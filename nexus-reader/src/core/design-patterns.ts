/**
 * 设计模式实现集合
 * 为系统架构提供成熟的设计模式支持
 */
import { logger } from '@/utils/unified-utils'

// ===== 单例模式 =====
export class Singleton<_T> {
  private static instances = new Map<string, any>()
  protected constructor() {}

  static getInstance<T extends Singleton<any>>(this: new () => T): T {
    const className = this.name
    if (!Singleton.instances.has(className)) {
      Singleton.instances.set(className, new this())
    }
    return Singleton.instances.get(className)
  }

  static clearInstance(className: string): void {
    Singleton.instances.delete(className)
  }

  static clearAllInstances(): void {
    Singleton.instances.clear()
  }
}

// ===== 工厂模式 =====
export interface Factory<T> {
  create(type: string, config?: any): T
}

export abstract class AbstractFactory<T> implements Factory<T> {
  protected creators = new Map<string, (config?: any) => T>()

  registerCreator(type: string, creator: (config?: any) => T): void {
    this.creators.set(type, creator)
  }

  create(type: string, config?: any): T {
    const creator = this.creators.get(type)
    if (!creator) {
      throw new Error(`Unknown type: ${type}`)
    }
    return creator(config)
  }

  getSupportedTypes(): string[] {
    return Array.from(this.creators.keys())
  }
}

// ===== 观察者模式 =====
export interface Observer<T = any> {
  update(data: T): void
  id: string
}

export class Subject<T = any> {
  private observers = new Map<string, Observer<T>>()

  subscribe(observer: Observer<T>): () => void {
    this.observers.set(observer.id, observer)
    logger.debug('Observer subscribed', { id: observer.id })

    return () => {
      this.unsubscribe(observer.id)
    }
  }

  unsubscribe(id: string): void {
    if (this.observers.delete(id)) {
      logger.debug('Observer unsubscribed', { id })
    }
  }

  notify(data: T): void {
    for (const observer of this.observers.values()) {
      try {
        observer.update(data)
      } catch (error: any) {
        logger.error('Observer update failed', {
          observerId: observer.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  getObserverCount(): number {
    return this.observers.size
  }

  clearObservers(): void {
    this.observers.clear()
    logger.debug('All observers cleared')
  }
}

// ===== 策略模式 =====
export interface Strategy<T = any, R = any> {
  execute(context: T): R
  name: string
}

export class StrategyContext<T = any, R = any> {
  private strategies = new Map<string, Strategy<T, R>>()

  registerStrategy(strategy: Strategy<T, R>): void {
    this.strategies.set(strategy.name, strategy)
  }

  executeStrategy(strategyName: string, context: T): R {
    const strategy = this.strategies.get(strategyName)
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyName}`)
    }
    return strategy.execute(context)
  }

  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys())
  }

  removeStrategy(strategyName: string): boolean {
    return this.strategies.delete(strategyName)
  }
}

// ===== 装饰器模式 =====
export interface Component {
  operation(): string
}

export abstract class Decorator implements Component {
  protected component: Component

  constructor(component: Component) {
    this.component = component
  }

  operation(): string {
    return this.component.operation()
  }
}

// ===== 适配器模式 =====
export interface Target {
  request(): string
}

export interface Adaptee {
  specificRequest(): string
}

export class Adapter implements Target {
  private adaptee: Adaptee

  constructor(adaptee: Adaptee) {
    this.adaptee = adaptee
  }

  request(): string {
    // 适配 Adaptee 的接口
    const result = this.adaptee.specificRequest()
    return `Adapted: ${result}`
  }
}

// ===== 命令模式 =====
export interface Command {
  execute(): void
  undo(): void
  name: string
}

export class CommandManager {
  private commands: Command[] = []
  private currentIndex = -1

  execute(command: Command): void {
    // 移除当前索引之后的历史命令
    this.commands = this.commands.slice(0, this.currentIndex + 1)

    command.execute()
    this.commands.push(command)
    this.currentIndex++

    logger.debug('Command executed', { name: command.name })
  }

  undo(): void {
    if (this.canUndo()) {
      const command = this.commands[this.currentIndex]
      command.undo()
      this.currentIndex--
      logger.debug('Command undone', { name: command.name })
    }
  }

  redo(): void {
    if (this.canRedo()) {
      this.currentIndex++
      const command = this.commands[this.currentIndex]
      command.execute()
      logger.debug('Command redone', { name: command.name })
    }
  }

  canUndo(): boolean {
    return this.currentIndex >= 0
  }

  canRedo(): boolean {
    return this.currentIndex < this.commands.length - 1
  }

  getCommandHistory(): string[] {
    return this.commands.map(cmd => cmd.name)
  }

  clearHistory(): void {
    this.commands = []
    this.currentIndex = -1
    logger.debug('Command history cleared')
  }
}

// ===== 中介者模式 =====
export interface Colleague {
  setMediator(mediator: Mediator): void
  receiveMessage(message: any): void
  sendMessage(message: any): void
}

export interface Mediator {
  addColleague(colleague: Colleague): void
  removeColleague(colleague: Colleague): void
  sendMessage(sender: Colleague, message: any): void
}

export class ConcreteMediator implements Mediator {
  private colleagues = new Set<Colleague>()

  addColleague(colleague: Colleague): void {
    this.colleagues.add(colleague)
    colleague.setMediator(this)
  }

  removeColleague(colleague: Colleague): void {
    this.colleagues.delete(colleague)
  }

  sendMessage(sender: Colleague, message: any): void {
    for (const colleague of this.colleagues) {
      if (colleague !== sender) {
        colleague.receiveMessage(message)
      }
    }
  }
}

// ===== 状态模式 =====
export interface State<T = any> {
  handle(context: StateContext<T>): void
  name: string
}

export class StateContext<T = any> {
  private currentState: State<T>
  private states = new Map<string, State<T>>()

  constructor(initialState: State<T>) {
    this.currentState = initialState
  }

  registerState(state: State<T>): void {
    this.states.set(state.name, state)
  }

  setState(stateName: string): void {
    const state = this.states.get(stateName)
    if (!state) {
      throw new Error(`State not found: ${stateName}`)
    }
    this.currentState = state
    logger.debug('State changed', { state: stateName })
  }

  request(): void {
    this.currentState.handle(this)
  }

  getCurrentState(): string {
    return this.currentState.name
  }

  getAvailableStates(): string[] {
    return Array.from(this.states.keys())
  }
}

// ===== 模板方法模式 =====
export abstract class TemplateMethod {
  // 模板方法
  execute(): void {
    this.step1()
    this.step2()
    this.step3()
    this.hook()
  }

  // 具体步骤
  protected abstract step1(): void
  protected abstract step2(): void
  protected abstract step3(): void

  // 钩子方法
  protected hook(): void {
    // 可选的钩子实现
  }
}

// ===== 组合模式 =====
export abstract class CompositeComponent {
  protected name: string

  constructor(name: string) {
    this.name = name
  }

  abstract getSize(): number

  getName(): string {
    return this.name
  }
}

export class File extends CompositeComponent {
  private size: number

  constructor(name: string, size: number) {
    super(name)
    this.size = size
  }

  getSize(): number {
    return this.size
  }
}

export class Folder extends CompositeComponent {
  private children: CompositeComponent[] = []

  add(component: CompositeComponent): void {
    this.children.push(component)
  }

  remove(component: CompositeComponent): void {
    const index = this.children.indexOf(component)
    if (index >= 0) {
      this.children.splice(index, 1)
    }
  }

  getSize(): number {
    return this.children.reduce((total, child) => total + child.getSize(), 0)
  }

  getChildren(): CompositeComponent[] {
    return [...this.children]
  }
}

// ===== 享元模式 =====
export class FlyweightFactory<T> {
  private flyweights = new Map<string, T>()

  getFlyweight(key: string, factory: () => T): T {
    if (!this.flyweights.has(key)) {
      this.flyweights.set(key, factory())
      logger.debug('Flyweight created', { key })
    }
    return this.flyweights.get(key)!
  }

  getFlyweightCount(): number {
    return this.flyweights.size
  }

  clearFlyweights(): void {
    this.flyweights.clear()
    logger.debug('All flyweights cleared')
  }
}

// ===== 代理模式 =====
export interface ProxySubject {
  request(): string
}

export class RealSubject implements ProxySubject {
  request(): string {
    return 'Real subject response'
  }
}

export class Proxy implements ProxySubject {
  private realSubject: RealSubject | null = null
  private accessCount = 0

  request(): string {
    this.accessCount++

    // 延迟初始化
    if (!this.realSubject) {
      this.realSubject = new RealSubject()
      logger.debug('Real subject initialized')
    }

    // 添加访问控制
    if (this.accessCount > 10) {
      return 'Access denied: too many requests'
    }

    // 添加缓存
    const response = this.realSubject.request()
    logger.debug('Proxy request handled', { accessCount: this.accessCount })

    return response
  }

  getAccessCount(): number {
    return this.accessCount
  }
}

// ===== 迭代器模式 =====
export interface Iterator<T> {
  hasNext(): boolean
  next(): T
  reset(): void
}

export class ArrayIterator<T> implements Iterator<T> {
  private array: T[]
  private index = 0

  constructor(array: T[]) {
    this.array = [...array]
  }

  hasNext(): boolean {
    return this.index < this.array.length
  }

  next(): T {
    if (!this.hasNext()) {
      throw new Error('No more elements')
    }
    return this.array[this.index++]
  }

  reset(): void {
    this.index = 0
  }
}

// ===== 备忘录模式 =====
export interface Memento {
  getState(): any
  getTimestamp(): number
}

export class Originator {
  private state: any

  setState(state: any): void {
    this.state = state
  }

  getState(): any {
    return this.state
  }

  createMemento(): Memento {
    return {
      getState: () => ({ ...this.state }),
      getTimestamp: () => Date.now(),
    }
  }

  restoreFromMemento(memento: Memento): void {
    this.state = memento.getState()
  }
}

export class Caretaker {
  private mementos: Memento[] = []
  private originator: Originator

  constructor(originator: Originator) {
    this.originator = originator
  }

  save(): void {
    const memento = this.originator.createMemento()
    this.mementos.push(memento)
    logger.debug('State saved', { timestamp: memento.getTimestamp() })
  }

  undo(): void {
    if (this.mementos.length > 0) {
      const memento = this.mementos.pop()!
      this.originator.restoreFromMemento(memento)
      logger.debug('State restored', { timestamp: memento.getTimestamp() })
    }
  }

  getHistoryCount(): number {
    return this.mementos.length
  }

  clearHistory(): void {
    this.mementos = []
    logger.debug('History cleared')
  }
}

// ===== 责任链模式 =====
export abstract class Handler {
  protected nextHandler: Handler | null = null

  setNext(handler: Handler): Handler {
    this.nextHandler = handler
    return handler
  }

  handle(request: any): any {
    if (this.canHandle(request)) {
      return this.processRequest(request)
    }

    if (this.nextHandler) {
      return this.nextHandler.handle(request)
    }

    return null
  }

  protected abstract canHandle(request: any): boolean
  protected abstract processRequest(request: any): any
}

// ===== 解释器模式 =====
export interface Expression {
  interpret(context: Map<string, any>): boolean
}

export class VariableExpression implements Expression {
  constructor(private name: string) {}

  interpret(context: Map<string, any>): boolean {
    return Boolean(context.get(this.name))
  }
}

export class AndExpression implements Expression {
  constructor(
    private left: Expression,
    private right: Expression
  ) {}

  interpret(context: Map<string, any>): boolean {
    return this.left.interpret(context) && this.right.interpret(context)
  }
}

export class OrExpression implements Expression {
  constructor(
    private left: Expression,
    private right: Expression
  ) {}

  interpret(context: Map<string, any>): boolean {
    return this.left.interpret(context) || this.right.interpret(context)
  }
}

export class NotExpression implements Expression {
  constructor(private expression: Expression) {}

  interpret(context: Map<string, any>): boolean {
    return !this.expression.interpret(context)
  }
}

// ===== 访问者模式 =====
export interface Visitor {
  visitConcreteElementA(element: ConcreteElementA): void
  visitConcreteElementB(element: ConcreteElementB): void
}

export interface Element {
  accept(visitor: Visitor): void
}

export class ConcreteElementA implements Element {
  accept(visitor: Visitor): void {
    visitor.visitConcreteElementA(this)
  }

  operationA(): string {
    return 'ConcreteElementA operation'
  }
}

export class ConcreteElementB implements Element {
  accept(visitor: Visitor): void {
    visitor.visitConcreteElementB(this)
  }

  operationB(): string {
    return 'ConcreteElementB operation'
  }
}

export class ConcreteVisitor implements Visitor {
  visitConcreteElementA(element: ConcreteElementA): void {
    logger.debug('Visiting ConcreteElementA', { operation: element.operationA() })
  }

  visitConcreteElementB(element: ConcreteElementB): void {
    logger.debug('Visiting ConcreteElementB', { operation: element.operationB() })
  }
}
